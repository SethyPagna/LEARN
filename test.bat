@echo off
rem LEARN - double-click to check that everything works: type check and
rem every test.
rem   test.bat full   also builds the production version
rem   test.bat tour   screenshots of every page (LEARN must be running)
call "%~dp0ops\run\test.bat" %*
call "%~dp0ops\run\lib\finish.bat" %errorlevel% "%~f0"
