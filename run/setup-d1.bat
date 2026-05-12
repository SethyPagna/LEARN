@echo off
setlocal
cd /d "%~dp0\.."

set DB_NAME=%CLOUDFLARE_D1_DATABASE%
if "%DB_NAME%"=="" set DB_NAME=learning-os-db

echo Creating Cloudflare D1 database if needed...
npx wrangler d1 create %DB_NAME%
if errorlevel 1 echo D1 database may already exist. Continue with migration after wrangler.jsonc has the database_id.

echo Applying local D1 migrations for development...
corepack pnpm db:migrate:local
endlocal
