@echo off
rem LEARN - double-click to publish the app. Asks where to (Cloudflare or
rem Vercel), runs every check first and asks again before anything goes live.
rem   deploy.bat cloudflare   or   deploy.bat vercel   skips the menu
call "%~dp0ops\run\deploy.bat" %*
call "%~dp0ops\run\lib\finish.bat" %errorlevel% "%~f0"
