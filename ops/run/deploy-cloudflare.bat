@echo off
rem Publishes LEARN using its project API token: checks and build first, then
rem existing-resource verification, live database migrations and upload.
rem Local browser evidence and D1/R2 data are preserved.
rem   --yes   publish without asking (needs CLOUDFLARE_API_TOKEN)
setlocal EnableExtensions
cd /d "%~dp0\..\.."
set "PATH=%CD%\ops\run\bin;%PATH%"
set "WRANGLER_SEND_METRICS=false"
set "NODE_OPTIONS=--max-old-space-size=4096"
if not defined CLOUDFLARE_ACCOUNT_ID set "CLOUDFLARE_ACCOUNT_ID=d105a82bc26b6913575355352c2d1bb1"
set "code=1"
set "ask=1"
if /i "%~1"=="--yes" set "ask=0"
call "%~dp0lib\check-node.bat"
if errorlevel 1 goto :end

echo.
echo   Publish LEARN to Cloudflare
echo.
echo   [1/8] Packages
call ops\run\bin\pnpm.cmd install --frozen-lockfile
if errorlevel 1 goto :end
echo   [2/8] Type check
call ops\run\bin\pnpm.cmd lint
if errorlevel 1 goto :end
echo   [3/8] Tests
call ops\run\bin\pnpm.cmd test
if errorlevel 1 goto :end

if not defined CLOUDFLARE_API_TOKEN (
  echo   Set CLOUDFLARE_API_TOKEN for the LEARN account before publishing.
  echo   Global Wrangler sign-in may belong to another project.
  goto :end
)
echo   [4/8] Build Worker
call ops\run\bin\pnpm.cmd exec tsx ops/scripts/deploy/cloudflare.ts build
if errorlevel 1 goto :end
echo   [5/8] Verify existing target and recovery point
call ops\run\bin\pnpm.cmd exec tsx ops/scripts/deploy/cloudflare-preflight.ts
if errorlevel 1 goto :end

if "%ask%"=="0" goto :publish
echo.
echo   Everything passed. Publishing updates the LIVE database, then the app.
choice /c YN /m "  Publish now"
if errorlevel 2 goto :cancelled
:publish
echo   [6/8] Live database
call ops\run\bin\pnpm.cmd db:migrate:remote
if errorlevel 1 goto :end
echo   [7/8] Upload Worker
call ops\run\bin\pnpm.cmd exec tsx ops/scripts/deploy/cloudflare.ts upload
if errorlevel 1 goto :end
echo   [8/8] Live smoke
call ops\run\bin\pnpm.cmd smoke:cloudflare
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
