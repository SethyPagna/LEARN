@echo off
setlocal
cd /d "%~dp0\.."

echo Checking dependencies and Cloudflare configuration...
corepack pnpm install --frozen-lockfile
if errorlevel 1 exit /b 1

corepack pnpm test
if errorlevel 1 exit /b 1

corepack pnpm lint
if errorlevel 1 exit /b 1

call npx wrangler d1 migrations list learn-db --local
if errorlevel 1 exit /b 1

call npx wrangler r2 bucket list
if errorlevel 1 echo R2 list failed. Run wrangler login or set CLOUDFLARE_API_TOKEN.

echo Doctor checks completed.
endlocal
