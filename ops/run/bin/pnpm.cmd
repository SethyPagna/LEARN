@echo off
rem pnpm at the exact version pinned in package.json, through Corepack (part
rem of Node.js up to version 24). No download prompt, so a first run never
rem stops to wait for an answer.
set "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"
where corepack >nul 2>nul
if errorlevel 1 (
  echo   Corepack is missing. Install it once with:  npm install --global corepack@latest 1>&2
  exit /b 1
)
call corepack pnpm %*
exit /b %errorlevel%
