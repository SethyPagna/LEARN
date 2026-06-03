@echo off
setlocal
cd /d "%~dp0\.."
set PATH=%CD%\ops\run\bin;%PATH%

if "%CLOUDFLARE_ACCOUNT_ID%"=="" (
  echo CLOUDFLARE_ACCOUNT_ID is not set.
  exit /b 1
)

if "%CLOUDFLARE_API_TOKEN%"=="" (
  echo CLOUDFLARE_API_TOKEN is not set.
  exit /b 1
)

echo Installing dependencies...
call ops\run\bin\pnpm.cmd install --frozen-lockfile
if errorlevel 1 exit /b 1

echo Running checks...
call ops\run\bin\pnpm.cmd test
if errorlevel 1 exit /b 1
call ops\run\bin\pnpm.cmd lint
if errorlevel 1 exit /b 1

echo Applying remote Cloudflare D1 migrations...
call ops\run\bin\pnpm.cmd db:migrate:remote
if errorlevel 1 exit /b 1

echo Deploying LEARN to Cloudflare Workers...
call ops\run\bin\pnpm.cmd deploy:cloudflare
endlocal
