@echo off
rem LEARN - double-click for the tools menu: health check, clean caches,
rem reinstall packages, reset local data, Cloudflare preview and tunnel.
rem   tools.bat doctor, clean, reinstall, reset, preview or tunnel
rem   runs one of them directly
call "%~dp0ops\run\tools.bat" %*
call "%~dp0ops\run\lib\finish.bat" %errorlevel% "%~f0"
