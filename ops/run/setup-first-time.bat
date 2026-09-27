@echo off
rem First local setup: packages, local settings file and local database.
rem run.bat does this too, so it is only needed to prepare without starting.
call "%~dp0run-task.bat" setup
call "%~dp0lib\finish.bat" %errorlevel% "%~f0"
