@echo off
setlocal
cd /d "%~dp0\.."
set PATH=%CD%\run\bin;%PATH%

if "%VERCEL_TOKEN%"=="" (
  echo VERCEL_TOKEN is not set.
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
corepack pnpm build
if errorlevel 1 exit /b 1

echo Linking Vercel project learn...
corepack pnpm dlx vercel@latest link --yes --project learn --token="%VERCEL_TOKEN%"
if errorlevel 1 exit /b 1

echo Pulling Vercel project learn...
corepack pnpm dlx vercel@latest pull --yes --environment=production --token="%VERCEL_TOKEN%"
if errorlevel 1 exit /b 1

echo Building Vercel production output...
corepack pnpm dlx vercel@latest build --prod --token="%VERCEL_TOKEN%"
if errorlevel 1 exit /b 1

echo Deploying Vercel project learn...
corepack pnpm dlx vercel@latest deploy --prebuilt --prod --token="%VERCEL_TOKEN%"
endlocal
