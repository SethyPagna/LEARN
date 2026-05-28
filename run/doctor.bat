@echo off
setlocal
cd /d "%~dp0\.."

echo Checking dependencies and Cloudflare configuration...
call run\bin\pnpm.cmd install --frozen-lockfile
if errorlevel 1 exit /b 1

call run\bin\pnpm.cmd test
if errorlevel 1 exit /b 1

call run\bin\pnpm.cmd lint
if errorlevel 1 exit /b 1

call run\bin\pnpm.cmd exec wrangler d1 migrations list learn-db --local
if errorlevel 1 exit /b 1

call run\bin\pnpm.cmd exec wrangler r2 bucket list
if errorlevel 1 echo R2 list failed. Run wrangler login or set CLOUDFLARE_API_TOKEN.

echo Doctor checks completed.
endlocal
