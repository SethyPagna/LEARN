@echo off
rem Shares the LEARN running on this PC through a Cloudflare tunnel; Docker
rem runs cloudflared. Needs CLOUDFLARE_TUNNEL_TOKEN from the Cloudflare
rem dashboard (Zero Trust, Networks, Tunnels).
setlocal EnableExtensions
cd /d "%~dp0\..\.."
set "PATH=%CD%\ops\run\bin;%PATH%"
set "code=1"
if not defined CLOUDFLARE_TUNNEL_TOKEN (
  echo   CLOUDFLARE_TUNNEL_TOKEN is not set. Set it in this window, then run this again.
  echo   LEARN still runs on this PC without a tunnel: run.bat
  goto :end
)
where docker >nul 2>nul
if errorlevel 1 (
  echo   Docker is not installed - the tunnel runs in Docker: https://www.docker.com/
  goto :end
)

echo   - Packages and local database
call ops\run\bin\pnpm.cmd install --frozen-lockfile --prefer-offline
if errorlevel 1 goto :end
call ops\run\bin\pnpm.cmd db:migrate:local
if errorlevel 1 goto :end

echo   - Starting LEARN in its own window
start "LEARN Local" cmd /c "call ops\run\bin\pnpm.cmd dev"

echo   - Starting the tunnel (Ctrl+C stops it)
docker run --rm --network host cloudflare/cloudflared:latest tunnel --no-autoupdate run --token "%CLOUDFLARE_TUNNEL_TOKEN%"
set "code=%errorlevel%"

:end
call "%~dp0lib\finish.bat" %code% "%~f0"
