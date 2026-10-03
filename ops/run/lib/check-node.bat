@echo off
rem Stops with a readable message when Node.js is missing or older than the
rem 20.9 that Next.js 16 needs.
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed. Install the LTS version from https://nodejs.org
  echo   then open a new window and run this again.
  exit /b 1
)
node -e "const [a, b] = process.versions.node.split('.').map(Number); process.exit(a > 20 || (a === 20 && b >= 9) ? 0 : 1)"
if errorlevel 1 (
  for /f "delims=" %%v in ('node -v') do echo   Node.js %%v is too old: LEARN needs 20.9 or newer ^(https://nodejs.org^).
  exit /b 1
)
exit /b 0
