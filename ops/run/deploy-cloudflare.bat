@echo off
rem Publishes LEARN to Cloudflare Workers: type check and tests, sign-in, one
rem last question, then the live database update and the upload. Data on
rem this PC is not touched.
rem   --yes   publish without asking (automation; needs CLOUDFLARE_API_TOKEN
rem           or an earlier sign-in)
setlocal EnableExtensions
cd /d "%~dp0\..\.."
set "PATH=%CD%\ops\run\bin;%PATH%"
set "WRANGLER_SEND_METRICS=false"
set "code=1"
set "ask=1"
if /i "%~1"=="--yes" set "ask=0"
call "%~dp0lib\check-node.bat"
if errorlevel 1 goto :end

echo.
echo   Publish LEARN to Cloudflare
echo.
echo   [1/5] Packages
call ops\run\bin\pnpm.cmd install --frozen-lockfile
if errorlevel 1 goto :end
echo   [2/5] Type check
call ops\run\bin\pnpm.cmd lint
if errorlevel 1 goto :end
echo   [3/5] Tests
call ops\run\bin\pnpm.cmd test
if errorlevel 1 goto :end

if defined CLOUDFLARE_API_TOKEN goto :signed_in
ops\run\bin\pnpm.cmd exec wrangler whoami 2>nul | findstr /i /c:"You are logged in" >nul
if not errorlevel 1 goto :signed_in
if "%ask%"=="0" (
  echo   Not signed in to Cloudflare. Set CLOUDFLARE_API_TOKEN, or run deploy.bat once without --yes.
  goto :end
)
echo.
echo   Sign in to Cloudflare first - a browser window opens for it.
choice /c YN /m "  Sign in now"
if errorlevel 2 goto :cancelled
call ops\run\bin\pnpm.cmd exec wrangler login
if errorlevel 1 goto :end
:signed_in

if "%ask%"=="0" goto :publish
echo.
echo   Everything passed. Publishing updates the LIVE database, then the app.
choice /c YN /m "  Publish now"
if errorlevel 2 goto :cancelled
:publish
echo   [4/5] Live database
call ops\run\bin\pnpm.cmd db:migrate:remote
if errorlevel 1 goto :end
echo   [5/5] Build and upload
call ops\run\bin\pnpm.cmd deploy:cloudflare
if errorlevel 1 goto :end
echo.
echo   Published to Cloudflare. The address is printed above (workers.dev).
set "code=0"
goto :end

:cancelled
echo   Cancelled - nothing was published.
set "code=0"

:end
call "%~dp0lib\finish.bat" %code% "%~f0"
