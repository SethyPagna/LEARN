@echo off
setlocal
set "LEARN_NO_PAUSE=1"
:menu
cls
echo LEARN
echo.
echo 1. First-time local setup
echo 2. Start local app
echo 3. Check types and run all tests
echo 4. Production build
echo 5. Preview Cloudflare build locally
echo 6. Deploy to Cloudflare (remote)
echo 7. Deploy to Vercel (remote)
echo 8. Diagnose local setup
echo 9. Exit
echo.
choice /c 123456789 /n /m "Choose a task: "
set "selection=%errorlevel%"
if "%selection%"=="9" exit /b 0
if "%selection%"=="1" call "%~dp0run-task.bat" setup
if "%selection%"=="2" call "%~dp0run-task.bat" start
if "%selection%"=="3" call "%~dp0run-task.bat" check
if "%selection%"=="4" call "%~dp0run-task.bat" build
if "%selection%"=="5" call "%~dp0run-task.bat" preview
if "%selection%"=="6" call "%~dp0deploy-cloudflare.bat"
if "%selection%"=="7" call "%~dp0deploy-vercel.bat"
if "%selection%"=="8" call "%~dp0run-task.bat" doctor
echo.
pause
goto menu
