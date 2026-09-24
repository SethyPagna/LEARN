@echo off
call "%~dp0run-task.bat" build
exit /b %errorlevel%
