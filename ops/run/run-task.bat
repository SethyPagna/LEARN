@echo off
setlocal
cd /d "%~dp0\..\.."
set "PATH=%CD%\ops\run\bin;%PATH%"
set "task=%~1"
if "%task%"=="setup" goto accepted
if "%task%"=="start" goto accepted
if "%task%"=="test" goto accepted
if "%task%"=="lint" goto accepted
if "%task%"=="check" goto accepted
if "%task%"=="build" goto accepted
if "%task%"=="preview" goto accepted
if "%task%"=="doctor" goto accepted
echo Unknown task. Use ops\run\learn.bat to choose a task.
exit /b 2

:accepted
call :run_%task%
set "result=%errorlevel%"
if not "%result%"=="0" echo LEARN %task% failed with exit code %result%.
if not "%LEARN_NO_PAUSE%"=="1" pause
exit /b %result%

:ensure_dependencies
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is missing. Install Node.js 24 LTS, then retry.
  exit /b 1
)
where corepack >nul 2>nul
if errorlevel 1 (
  echo Corepack is missing. Install Corepack for the pinned pnpm toolchain.
  exit /b 1
)
if exist "node_modules\.bin\tsx.cmd" if exist "node_modules\.bin\next.cmd" exit /b 0
call ops\run\bin\pnpm.cmd install --frozen-lockfile
exit /b %errorlevel%

:ensure_local_env
if exist "ops\cloudflare\.dev.vars" exit /b 0
copy "ops\env\dev.vars.example" "ops\cloudflare\.dev.vars" >nul
if errorlevel 1 exit /b 1
echo Created ops\cloudflare\.dev.vars. Add AI credentials there when needed.
exit /b 0

:run_setup
echo Setting up LEARN locally. Cloudflare login is not required.
call ops\run\bin\pnpm.cmd install --frozen-lockfile
if errorlevel 1 exit /b %errorlevel%
call :ensure_local_env
if errorlevel 1 exit /b %errorlevel%
call ops\run\bin\pnpm.cmd db:migrate:local
if errorlevel 1 exit /b %errorlevel%
echo Local setup complete. Run ops\run\start-local.bat next.
exit /b 0

:run_start
call :ensure_dependencies
if errorlevel 1 exit /b %errorlevel%
call :ensure_local_env
if errorlevel 1 exit /b %errorlevel%
call ops\run\bin\pnpm.cmd db:migrate:local
if errorlevel 1 exit /b %errorlevel%
echo Starting LEARN with local D1, R2 and realtime chat. Press Ctrl+C to stop.
call ops\run\bin\pnpm.cmd dev
exit /b %errorlevel%

:run_test
call :ensure_dependencies
if errorlevel 1 exit /b %errorlevel%
call ops\run\bin\pnpm.cmd test
exit /b %errorlevel%

:run_lint
call :ensure_dependencies
if errorlevel 1 exit /b %errorlevel%
call ops\run\bin\pnpm.cmd lint
exit /b %errorlevel%

:run_check
call :run_lint
if errorlevel 1 exit /b %errorlevel%
call :run_test
exit /b %errorlevel%

:run_build
call :ensure_dependencies
if errorlevel 1 exit /b %errorlevel%
call ops\run\bin\pnpm.cmd build
exit /b %errorlevel%

:run_preview
call :ensure_dependencies
if errorlevel 1 exit /b %errorlevel%
call :ensure_local_env
if errorlevel 1 exit /b %errorlevel%
call ops\run\bin\pnpm.cmd db:migrate:local
if errorlevel 1 exit /b %errorlevel%
call ops\run\bin\pnpm.cmd preview:cloudflare
exit /b %errorlevel%

:run_doctor
call :run_check
if errorlevel 1 exit /b %errorlevel%
call ops\run\bin\pnpm.cmd exec wrangler d1 migrations list learn-db --local --config ops/cloudflare/wrangler.jsonc --persist-to .wrangler/state
if errorlevel 1 exit /b %errorlevel%
echo Local checks complete. Remote provisioning and deployment are separate tasks.
exit /b 0
