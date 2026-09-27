@echo off
rem Builds the production version of LEARN.
call "%~dp0run-task.bat" build
call "%~dp0lib\finish.bat" %errorlevel% "%~f0"
