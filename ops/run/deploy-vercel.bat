@echo off
rem Publishes LEARN to the Vercel project "learn": type check and tests, one
rem last question, then the production build and the upload.
rem   --yes   publish without asking (automation)
rem Needs VERCEL_TOKEN, created at https://vercel.com/account/tokens
setlocal EnableExtensions
cd /d "%~dp0\..\.."
set "PATH=%CD%\ops\run\bin;%PATH%"
set "code=1"
if not defined VERCEL_TOKEN (
  echo   VERCEL_TOKEN is not set. Create a token at https://vercel.com/account/tokens
  echo   then in this window run:  set VERCEL_TOKEN=your-token   and start this again.
  goto :end
)
call "%~dp0lib\check-node.bat"
if errorlevel 1 goto :end

echo.
echo   Publish LEARN to Vercel
echo.
echo   [1/4] Packages
call ops\run\bin\pnpm.cmd install --frozen-lockfile
if errorlevel 1 goto :end
echo   [2/4] Type check
call ops\run\bin\pnpm.cmd lint
if errorlevel 1 goto :end
echo   [3/4] Tests
call ops\run\bin\pnpm.cmd test
if errorlevel 1 goto :end

if /i "%~1"=="--yes" goto :publish
echo.
choice /c YN /m "  Everything passed. Publish to Vercel now"
if errorlevel 2 goto :cancelled
:publish
echo   [4/4] Build and upload
call ops\run\bin\pnpm.cmd dlx vercel@latest link --yes --project learn --token="%VERCEL_TOKEN%"
if errorlevel 1 goto :end
call ops\run\bin\pnpm.cmd dlx vercel@latest pull --yes --environment=production --token="%VERCEL_TOKEN%"
if errorlevel 1 goto :end
call ops\run\bin\pnpm.cmd dlx vercel@latest build --prod --token="%VERCEL_TOKEN%"
if errorlevel 1 goto :end
call ops\run\bin\pnpm.cmd dlx vercel@latest deploy --prebuilt --prod --token="%VERCEL_TOKEN%"
if errorlevel 1 goto :end
echo.
echo   Published to Vercel.
set "code=0"
goto :end

:cancelled
echo   Cancelled - nothing was published.
set "code=0"

:end
call "%~dp0lib\finish.bat" %code% "%~f0"
