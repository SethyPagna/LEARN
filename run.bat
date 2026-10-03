@echo off
rem LEARN - double-click to start the app on this PC. The browser opens
rem once it is ready; Ctrl+C stops it.
rem   run.bat --no-browser   starts it without opening a browser tab
rem   set PORT=3001 first to use another port
call "%~dp0ops\run\start-local.bat" %*
call "%~dp0ops\run\lib\finish.bat" %errorlevel% "%~f0"
