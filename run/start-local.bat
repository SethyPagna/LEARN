@echo off
setlocal
cd /d "%~dp0\.."
set PATH=%CD%\run\bin;%PATH%
echo Starting LEARN in the Cloudflare Workers runtime...
if not exist ".dev.vars" (
  echo .dev.vars is missing. Creating it from ops\env\dev.vars.example.
  copy ops\env\dev.vars.example .dev.vars >nul
)
corepack pnpm install
if errorlevel 1 exit /b 1
corepack pnpm db:migrate:local
if errorlevel 1 exit /b 1
corepack pnpm dev
endlocal
