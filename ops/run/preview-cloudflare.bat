@echo off
rem Builds LEARN for Cloudflare Workers and runs that build on this PC.
call "%~dp0run-task.bat" preview
call "%~dp0lib\finish.bat" %errorlevel% "%~f0"
