@echo off
rem First-time Cloudflare setup: creates the live R2 buckets for uploads and
rem the Next.js cache. Sign in first with ops\run\bin\pnpm.cmd exec wrangler login
setlocal
cd /d "%~dp0\..\.."
set "PATH=%CD%\ops\run\bin;%PATH%"
set "code=1"

set "FILE_BUCKET=%CLOUDFLARE_R2_BUCKET%"
if "%FILE_BUCKET%"=="" set "FILE_BUCKET=learn-files"

set "CACHE_BUCKET=%CLOUDFLARE_NEXT_CACHE_BUCKET%"
if "%CACHE_BUCKET%"=="" set "CACHE_BUCKET=learn-next-cache"

echo Creating remote Cloudflare R2 buckets...
call ops\run\bin\pnpm.cmd exec wrangler r2 bucket create "%FILE_BUCKET%"
if errorlevel 1 goto :end
call ops\run\bin\pnpm.cmd exec wrangler r2 bucket create "%CACHE_BUCKET%"
if errorlevel 1 goto :end

echo R2 buckets created: %FILE_BUCKET% and %CACHE_BUCKET%.
set "code=0"

:end
call "%~dp0lib\finish.bat" %code% "%~f0"
