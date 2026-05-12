@echo off
setlocal
cd /d "%~dp0\.."
echo Starting Learning OS Docker stack...
docker compose up --build
endlocal
