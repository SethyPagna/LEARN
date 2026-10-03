@echo off
rem Publishes LEARN. Asks where to, runs every check first and asks once more
rem before anything goes live.
rem   deploy.bat cloudflare   or   deploy.bat vercel   skips the menu;
rem   add --yes to skip the questions (automation)
setlocal EnableExtensions
set "target=%~1"
set "code=0"
if /i "%target%"=="cloudflare" goto :cloudflare
if /i "%target%"=="vercel" goto :vercel
if not "%target%"=="" (
  echo   Unknown target "%target%". Use:  deploy.bat cloudflare   or   deploy.bat vercel
  set "code=2"
  goto :end
)
echo.
echo   Publish LEARN to
echo.
echo     [1] Cloudflare Workers   (recommended)
echo     [2] Vercel
echo     [0] Cancel
echo.
choice /c 120 /n /m "  Choose a number: "
if errorlevel 3 goto :end
if errorlevel 2 goto :vercel
if errorlevel 1 goto :cloudflare
goto :end
:cloudflare
call "%~dp0deploy-cloudflare.bat" %2
set "code=%errorlevel%"
goto :end
:vercel
call "%~dp0deploy-vercel.bat" %2
set "code=%errorlevel%"
:end
call "%~dp0lib\finish.bat" %code% "%~f0"
