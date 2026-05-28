@echo off
setlocal
cd /d "%~dp0\.."
set PATH=%CD%\run\bin;%PATH%

if "%VERCEL_TOKEN%"=="" (
  echo VERCEL_TOKEN is not set.
  exit /b 1
)

echo Installing dependencies...
call run\bin\pnpm.cmd install --frozen-lockfile
if errorlevel 1 exit /b 1

echo Running checks...
call run\bin\pnpm.cmd test
if errorlevel 1 exit /b 1
call run\bin\pnpm.cmd lint
if errorlevel 1 exit /b 1
call run\bin\pnpm.cmd build
if errorlevel 1 exit /b 1

echo Linking Vercel project learn...
call run\bin\pnpm.cmd dlx vercel@latest link --yes --project learn --token="%VERCEL_TOKEN%"
if errorlevel 1 exit /b 1

echo Pulling Vercel project learn...
call run\bin\pnpm.cmd dlx vercel@latest pull --yes --environment=production --token="%VERCEL_TOKEN%"
if errorlevel 1 exit /b 1

echo Building Vercel production output...
call run\bin\pnpm.cmd dlx vercel@latest build --prod --token="%VERCEL_TOKEN%"
if errorlevel 1 exit /b 1

echo Deploying Vercel project learn...
call run\bin\pnpm.cmd dlx vercel@latest deploy --prebuilt --prod --token="%VERCEL_TOKEN%"
endlocal
