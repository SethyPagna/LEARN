@echo off
rem Last step of every launcher. Waits for a key only when the window was
rem opened for that very launcher (a double-click), so the result stays
rem readable. In a terminal, or when another launcher called it, it ends at
rem once. Keeps the exit code.
rem   first argument    exit code of the step that just ran
rem   second argument   the launcher's own full path
rem   LEARN_NO_PAUSE    set to anything to never wait (automation)
setlocal EnableDelayedExpansion
set "code=%~1"
if not defined code set "code=0"
if defined LEARN_NO_PAUSE goto :done
set "caller=%~2"
if not defined caller goto :done
rem A double-click runs:  cmd.exe /c ""C:\path\to\launcher.bat" "
set "line=!cmdcmdline!"
if "!line:%caller%=!"=="!line!" goto :done
echo.
if "%code%"=="0" (
  echo   Done.
) else (
  echo   Stopped with an error ^(code %code%^). The lines above say what went wrong.
)
pause
:done
exit /b %code%
