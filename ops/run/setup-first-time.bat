@echo off
setlocal
cd /d "%~dp0\.."

echo LEARN first setup: Cloudflare D1 + R2
if not exist ".dev.vars" (
  copy ops\env\dev.vars.example .dev.vars >nul
  echo Created .dev.vars from ops\env\dev.vars.example. Fill SESSION_SECRET and AI secrets before production.
)

call ops\run\bin\pnpm.cmd install --frozen-lockfile
if errorlevel 1 exit /b 1

call ops\run\setup-r2.bat
if errorlevel 1 exit /b 1

call ops\run\setup-d1.bat
if errorlevel 1 exit /b 1

call ops\run\doctor.bat
endlocal
