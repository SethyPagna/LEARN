@echo off
rem The task engine behind the launchers:  run-task.bat task [option]
rem   setup      packages, local settings file and local database
rem   start      start LEARN on this PC, then open it in the browser
rem              (option --no-browser only starts it)
rem   test       every test               lint       type check
rem   check      type check and tests     full       check plus production build
rem   build      production build         preview    Cloudflare build on this PC
rem   doctor     check, local database status and Cloudflare sign-in
rem   tour       screenshots of every page (start LEARN first)
rem   clean      delete build caches      reinstall  reinstall every package
rem   reset      delete ALL local data (accounts, notes, designs, chats, uploads)
rem PORT picks another port than 3000.
setlocal EnableExtensions
cd /d "%~dp0\..\.."
set "PATH=%CD%\ops\run\bin;%PATH%"
set "WRANGLER_SEND_METRICS=false"
if not defined PORT set "PORT=3000"
set "task=%~1"
if not defined task goto :unknown
for %%t in (setup start test lint check full build preview doctor clean reinstall reset tour) do (
  if /i "%task%"=="%%t" goto :accepted
)
:unknown
echo   Unknown task "%task%". Run tools.bat for the menu.
exit /b 2

:accepted
call "%~dp0lib\check-node.bat"
if errorlevel 1 exit /b 1
call :run_%task% %2
set "result=%errorlevel%"
if not "%result%"=="0" echo   LEARN %task% stopped (exit code %result%).
exit /b %result%

:ensure_packages
rem Quick when nothing changed; after an update it brings packages in line.
call ops\run\bin\pnpm.cmd install --frozen-lockfile --prefer-offline
if not errorlevel 1 exit /b 0
if exist "node_modules\.bin\next.cmd" (
  echo   Packages could not be refreshed ^(offline?^) - using the installed ones.
  exit /b 0
)
echo   Installing packages failed. Check the internet connection and try again.
exit /b 1

:ensure_local_env
if exist "ops\cloudflare\.dev.vars" exit /b 0
copy "ops\env\dev.vars.example" "ops\cloudflare\.dev.vars" >nul
if errorlevel 1 exit /b 1
echo   Created ops\cloudflare\.dev.vars for optional settings such as AI keys.
exit /b 0

:require_stopped
call "%~dp0lib\learn-running.bat"
if errorlevel 1 exit /b 0
echo   LEARN is running. Stop it first (Ctrl+C in its window), then try again.
exit /b 1

:run_setup
echo   - Packages
call ops\run\bin\pnpm.cmd install --frozen-lockfile
if errorlevel 1 exit /b %errorlevel%
call :ensure_local_env
if errorlevel 1 exit /b %errorlevel%
echo   - Local database
call ops\run\bin\pnpm.cmd db:migrate:local
if errorlevel 1 exit /b %errorlevel%
echo   Ready. run.bat starts LEARN.
exit /b 0

:run_start
rem Checked before anything else: installing or migrating while LEARN runs
rem fails on locked files. So a running LEARN is only opened, and a port
rem another app holds is skipped.
set "first_port=%PORT%"
call "%~dp0lib\learn-running.bat"
if errorlevel 1 goto :pick_port
:find_running
set "LEARN_URL=http://localhost:%PORT%"
call "%~dp0lib\is-learn.bat" %PORT%
if errorlevel 1 goto :find_next
echo   LEARN is already running at %LEARN_URL%
if /i not "%~1"=="--no-browser" start "" "%LEARN_URL%"
exit /b 0
:find_next
set /a PORT+=1
set /a tried=PORT-first_port
if %tried% lss 10 goto :find_running
echo   LEARN is already running in another window. Stop it there (Ctrl+C) to restart it.
exit /b 0
:pick_port
set "LEARN_URL=http://localhost:%PORT%"
call "%~dp0lib\port-in-use.bat" %PORT%
if errorlevel 1 goto :start_fresh
echo   Port %PORT% is used by another app - trying the next one.
set /a PORT+=1
set /a tried=PORT-first_port
if %tried% lss 10 goto :pick_port
echo   Ports %first_port% to %PORT% are all in use. Close an app, or set PORT to a free port.
exit /b 1
:start_fresh
echo   [1/3] Packages
call :ensure_packages
if errorlevel 1 exit /b 1
call :ensure_local_env
if errorlevel 1 exit /b 1
echo   [2/3] Local database
call ops\run\bin\pnpm.cmd db:migrate:local
if errorlevel 1 exit /b %errorlevel%
echo   [3/3] Starting %LEARN_URL%   (Ctrl+C stops it)
if /i not "%~1"=="--no-browser" call :open_when_ready
call ops\run\bin\pnpm.cmd dev
exit /b %errorlevel%

:open_when_ready
rem Waits in the background for the first answer (the first page takes a
rem while to compile), then opens the browser. It shares this window: no
rem -WindowStyle Hidden, which would hide this window as well.
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference = 'SilentlyContinue'; $u = '%LEARN_URL%'; for ($i = 0; $i -lt 300; $i++) { try { $null = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 $u; break } catch { if ($_.Exception.Response) { break }; Start-Sleep -Seconds 1 } }; Start-Process $u"
exit /b 0

:run_test
call :ensure_packages
if errorlevel 1 exit /b 1
call ops\run\bin\pnpm.cmd test
exit /b %errorlevel%

:run_lint
call :ensure_packages
if errorlevel 1 exit /b 1
call ops\run\bin\pnpm.cmd lint
exit /b %errorlevel%

:run_check
call :ensure_packages
if errorlevel 1 exit /b 1
echo   - Type check
call ops\run\bin\pnpm.cmd lint
if errorlevel 1 exit /b %errorlevel%
echo   - Tests
call ops\run\bin\pnpm.cmd test
exit /b %errorlevel%

:run_full
call :run_check
if errorlevel 1 exit /b %errorlevel%
echo   - Production build
call ops\run\bin\pnpm.cmd build
exit /b %errorlevel%

:run_tour
rem Signs in to the LEARN running on this PC and saves a screenshot of every
rem page to output\visual-tour.
call :ensure_packages
if errorlevel 1 exit /b 1
call ops\run\bin\pnpm.cmd test:tour
exit /b %errorlevel%

:run_build
call :ensure_packages
if errorlevel 1 exit /b 1
call ops\run\bin\pnpm.cmd build
exit /b %errorlevel%

:run_preview
call :ensure_packages
if errorlevel 1 exit /b 1
call :ensure_local_env
if errorlevel 1 exit /b %errorlevel%
call ops\run\bin\pnpm.cmd db:migrate:local
if errorlevel 1 exit /b %errorlevel%
call ops\run\bin\pnpm.cmd preview:cloudflare
exit /b %errorlevel%

:run_doctor
for /f "delims=" %%v in ('node -v') do echo   Node.js %%v
call :run_check
if errorlevel 1 exit /b %errorlevel%
echo   - Local database
call ops\run\bin\pnpm.cmd exec wrangler d1 migrations list learn-db --local --config ops/cloudflare/wrangler.jsonc --persist-to .wrangler/state
if errorlevel 1 exit /b %errorlevel%
echo   - Cloudflare sign-in (needed only to publish)
if defined CLOUDFLARE_API_TOKEN goto :doctor_done
ops\run\bin\pnpm.cmd exec wrangler whoami 2>nul | findstr /i /c:"You are logged in" >nul
if errorlevel 1 (
  echo     not signed in - deploy.bat offers it when you publish
) else (
  echo     signed in
)
:doctor_done
echo   Health check passed.
exit /b 0

:run_clean
call :require_stopped
if errorlevel 1 exit /b 1
call :ensure_packages
if errorlevel 1 exit /b 1
call ops\run\bin\pnpm.cmd clean:workspace:apply
if errorlevel 1 exit /b %errorlevel%
echo   Build caches deleted. Your local data was kept.
exit /b 0

:run_reinstall
call :require_stopped
if errorlevel 1 exit /b 1
call ops\run\bin\pnpm.cmd install --force --frozen-lockfile
exit /b %errorlevel%

:run_reset
call :require_stopped
if errorlevel 1 exit /b 1
echo.
echo   This deletes ALL local LEARN data on this PC - accounts, notes, designs,
echo   chats and uploads in .wrangler\state. The published app is not touched.
echo   It cannot be undone.
echo.
set "answer="
set /p "answer=  Type RESET to delete it, or just press Enter to cancel: "
if not "%answer%"=="RESET" (
  echo   Cancelled - nothing was deleted.
  exit /b 0
)
if exist ".wrangler\state" rmdir /s /q ".wrangler\state"
if exist ".wrangler\state" (
  echo   Some files are still in use. Close LEARN and anything else using them, then try again.
  exit /b 1
)
echo   - Fresh local database
call :ensure_packages
if errorlevel 1 exit /b 1
call ops\run\bin\pnpm.cmd db:migrate:local
if errorlevel 1 exit /b %errorlevel%
echo   Done. run.bat starts LEARN with the starter accounts again.
exit /b 0
