@echo off
setlocal
cd /d "%~dp0\.."
set PATH=%CD%\run\bin;%PATH%

if "%CLOUDFLARE_ACCOUNT_ID%"=="" (
  echo CLOUDFLARE_ACCOUNT_ID is not set.
  exit /b 1
)

if "%CLOUDFLARE_API_TOKEN%"=="" (
  echo CLOUDFLARE_API_TOKEN is not set.
  exit /b 1
)

echo Installing dependencies...
corepack pnpm install --frozen-lockfile
if errorlevel 1 exit /b 1

echo Running checks...
corepack pnpm test
if errorlevel 1 exit /b 1
corepack pnpm lint
if errorlevel 1 exit /b 1

echo Applying remote Cloudflare D1 migrations...
corepack pnpm db:migrate:remote
if errorlevel 1 exit /b 1

echo Deploying LEARN to Cloudflare Workers...
corepack pnpm deploy:cloudflare
endlocal
