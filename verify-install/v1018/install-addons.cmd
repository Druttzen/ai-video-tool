@echo off
setlocal EnableExtensions
title AI Video Creator — Install Addons
cd /d "%~dp0"
color 0A
set "EXIT_CODE=0"

echo.
echo ============================================================
echo   AI Video Creator — Install Addons and Tools
echo   Managed stack + pip install -r requirements.txt
echo   Close this window when finished (or press a key at end)
echo ============================================================
echo.

set "APP_DIR=%~dp0"
set "ADDON_USER_DATA=%APPDATA%\AI Video Creator"
set "ELECTRON_RUN_AS_NODE=1"

set "RUNNER=%APP_DIR%resources\app.asar\scripts\install-addons-runner.cjs"
if not exist "%APP_DIR%resources\app.asar" (
  echo [ERROR] App bundle not found at %APP_DIR%resources\app.asar
  set "EXIT_CODE=1"
  goto finish
)

if not exist "%APP_DIR%ai-video-tool.exe" (
  echo [ERROR] ai-video-tool.exe not found in %APP_DIR%
  set "EXIT_CODE=1"
  goto finish
)

"%APP_DIR%ai-video-tool.exe" "%RUNNER%"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo [ OK  ] Install finished — starting AI Video Creator...
  start "" "%APP_DIR%ai-video-tool.exe"
) else (
  echo [ERROR] Install finished with errors ^(exit %EXIT_CODE%^). Review output above.
)

:finish
echo.
pause
exit /b %EXIT_CODE%
