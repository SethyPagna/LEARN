@echo off
setlocal
cd /d "%~dp0\.."

echo Learning OS first setup: Cloudflare D1 + R2
if not exist ".dev.vars" (
  copy .dev.vars.example .dev.vars >nul
  echo Created .dev.vars from .dev.vars.example. Fill SESSION_SECRET and AI secrets before production.
)

corepack pnpm install
if errorlevel 1 exit /b 1

call run\setup-r2.bat
if errorlevel 1 exit /b 1

call run\setup-d1.bat
if errorlevel 1 exit /b 1

call run\doctor.bat
endlocal
