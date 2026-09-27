@echo off
rem Checks that LEARN works.
rem   test.bat         type check and every test
rem   test.bat full    the same, plus a production build
setlocal
set "task=check"
if "%~1"=="" goto :run
set "task=full"
if /i "%~1"=="full" goto :run
echo   Unknown option "%~1". Use:  test.bat   or   test.bat full
call "%~dp0lib\finish.bat" 2 "%~f0"
exit /b 2
:run
call "%~dp0run-task.bat" %task%
call "%~dp0lib\finish.bat" %errorlevel% "%~f0"
