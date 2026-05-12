@echo off
setlocal
cd /d "%~dp0\.."

echo Installing dependencies and verifying build...
corepack pnpm install --frozen-lockfile
if errorlevel 1 exit /b 1
corepack pnpm lint
if errorlevel 1 exit /b 1
corepack pnpm build
if errorlevel 1 exit /b 1

echo Deploying to Vercel production...
npx vercel deploy --prod --yes
endlocal
