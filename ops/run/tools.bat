@echo off
rem LEARN tools. Shows a menu; an option runs one tool directly:
rem   tools.bat doctor, clean, reinstall, reset, preview or tunnel
setlocal EnableExtensions
set "tool=%~1"
set "code=0"
if defined tool goto :run
echo.
echo   LEARN tools
echo.
echo     [1] Health check          types, tests, local database
echo     [2] Clean caches          frees space, keeps your data
echo     [3] Reinstall packages    when packages seem broken
echo     [4] Reset local data      deletes local accounts, notes and designs
echo     [5] Preview the Cloudflare build on this PC
echo     [6] Share through a Cloudflare tunnel
echo     [0] Close
echo.
choice /c 1234560 /n /m "  Choose a number: "
set "pick=%errorlevel%"
if "%pick%"=="1" set "tool=doctor"
if "%pick%"=="2" set "tool=clean"
if "%pick%"=="3" set "tool=reinstall"
if "%pick%"=="4" set "tool=reset"
if "%pick%"=="5" set "tool=preview"
if "%pick%"=="6" set "tool=tunnel"
if not defined tool goto :end
:run
echo.
if /i "%tool%"=="tunnel" (
  call "%~dp0try-cloudflare.bat"
) else (
  call "%~dp0run-task.bat" %tool%
)
set "code=%errorlevel%"
:end
call "%~dp0lib\finish.bat" %code% "%~f0"
