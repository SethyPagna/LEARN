@echo off
setlocal
cd /d "%~dp0\.."
set PATH=%CD%\run\bin;%PATH%
echo Starting LEARN in the Cloudflare Workers runtime...
if not exist ".dev.vars" (
  echo .dev.vars is missing. Creating it from ops\env\dev.vars.example.
  copy ops\env\dev.vars.example .dev.vars >nul
)
call run\bin\pnpm.cmd install
if errorlevel 1 exit /b 1
call run\bin\pnpm.cmd db:migrate:local
if errorlevel 1 exit /b 1
call run\bin\pnpm.cmd dev
endlocal
