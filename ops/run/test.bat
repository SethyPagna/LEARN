@echo off
rem Checks that LEARN works.
rem   test.bat         type check and every test
rem   test.bat full    the same, plus a production build
rem   test.bat tour    screenshots of every page (start LEARN with run.bat first)
setlocal
set "task=check"
if "%~1"=="" goto :run
set "task=%~1"
if /i "%task%"=="full" goto :run
if /i "%task%"=="tour" goto :run
echo   Unknown option "%~1". Use:  test.bat,  test.bat full  or  test.bat tour
call "%~dp0lib\finish.bat" 2 "%~f0"
exit /b 2
:run
call "%~dp0run-task.bat" %task%
call "%~dp0lib\finish.bat" %errorlevel% "%~f0"
