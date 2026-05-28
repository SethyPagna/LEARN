@echo off
setlocal
cd /d "%~dp0\.."

set DB_NAME=%CLOUDFLARE_D1_DATABASE_NAME%
if "%DB_NAME%"=="" set DB_NAME=learn-db

echo Creating Cloudflare D1 database if needed...
call npx wrangler d1 create %DB_NAME%
if errorlevel 1 echo D1 database may already exist. Continue with migration after ops\cloudflare\wrangler.jsonc has the database_id.

echo Applying local D1 migrations for development...
corepack pnpm db:migrate:local
endlocal
