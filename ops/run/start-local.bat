@echo off
rem Starts LEARN on this PC and opens it in the browser.
rem   --no-browser   only start it. For another port: set PORT=3001 first.
call "%~dp0run-task.bat" start %1
call "%~dp0lib\finish.bat" %errorlevel% "%~f0"
