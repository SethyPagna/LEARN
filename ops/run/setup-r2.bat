@echo off
setlocal
cd /d "%~dp0\..\.."

set "FILE_BUCKET=%CLOUDFLARE_R2_BUCKET%"
if "%FILE_BUCKET%"=="" set "FILE_BUCKET=learn-files"

set "CACHE_BUCKET=%CLOUDFLARE_NEXT_CACHE_BUCKET%"
if "%CACHE_BUCKET%"=="" set "CACHE_BUCKET=learn-next-cache"

echo Creating remote Cloudflare R2 buckets...
call ops\run\bin\pnpm.cmd exec wrangler r2 bucket create "%FILE_BUCKET%"
if errorlevel 1 exit /b 1
call ops\run\bin\pnpm.cmd exec wrangler r2 bucket create "%CACHE_BUCKET%"
if errorlevel 1 exit /b 1

echo R2 buckets created: %FILE_BUCKET% and %CACHE_BUCKET%.
endlocal & exit /b 0
