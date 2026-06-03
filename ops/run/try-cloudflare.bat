@echo off
setlocal
cd /d "%~dp0\.."
set PATH=%CD%\ops\run\bin;%PATH%

if "%CLOUDFLARE_TUNNEL_TOKEN%"=="" (
  echo CLOUDFLARE_TUNNEL_TOKEN is not set.
  echo Set it in your shell or runtime environment, then run this file again.
  echo The local Docker app can still run with ops\run\start-local.bat.
  exit /b 1
)

echo Preparing local Cloudflare D1 migrations...
call ops\run\bin\pnpm.cmd install
if errorlevel 1 exit /b 1
call ops\run\bin\pnpm.cmd db:migrate:local
if errorlevel 1 exit /b 1

echo Starting LEARN with local Cloudflare bindings...
start "LEARN Local" cmd /c "call ops\run\bin\pnpm.cmd dev"

echo Starting Cloudflare tunnel container...
docker run --rm --network host cloudflare/cloudflared:latest tunnel --no-autoupdate run --token "%CLOUDFLARE_TUNNEL_TOKEN%"
endlocal
