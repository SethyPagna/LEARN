@echo off
rem Type check and every test.
call "%~dp0run-task.bat" check
call "%~dp0lib\finish.bat" %errorlevel% "%~f0"
