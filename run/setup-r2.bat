@echo off
setlocal
cd /d "%~dp0\.."

set FILE_BUCKET=%CLOUDFLARE_R2_BUCKET%
if "%FILE_BUCKET%"=="" set FILE_BUCKET=learn-files

set CACHE_BUCKET=%CLOUDFLARE_NEXT_CACHE_BUCKET%
if "%CACHE_BUCKET%"=="" set CACHE_BUCKET=learn-next-cache

echo Creating Cloudflare R2 buckets if they do not already exist...
call npx wrangler r2 bucket create %FILE_BUCKET%
if errorlevel 1 echo R2 file bucket may already exist or Cloudflare login is required.
call npx wrangler r2 bucket create %CACHE_BUCKET%
if errorlevel 1 echo R2 cache bucket may already exist or Cloudflare login is required.

echo R2 setup requested for %FILE_BUCKET% and %CACHE_BUCKET%.
endlocal
