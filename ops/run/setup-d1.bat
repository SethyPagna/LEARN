@echo off
setlocal
cd /d "%~dp0\..\.."

set "DB_NAME=%CLOUDFLARE_D1_DATABASE_NAME%"
if "%DB_NAME%"=="" set "DB_NAME=learn-db"

echo Creating remote Cloudflare D1 database %DB_NAME%...
call ops\run\bin\pnpm.cmd exec wrangler d1 create "%DB_NAME%"
if errorlevel 1 (
  echo D1 creation failed. If the database exists, use its ID in ops\cloudflare\wrangler.jsonc.
  exit /b 1
)

echo Add the returned database_id to ops\cloudflare\wrangler.jsonc before deploying.
endlocal & exit /b 0
