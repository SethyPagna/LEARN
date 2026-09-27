@echo off
rem Health check: versions, type check, tests, local database, Cloudflare sign-in.
call "%~dp0run-task.bat" doctor
call "%~dp0lib\finish.bat" %errorlevel% "%~f0"
