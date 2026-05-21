@echo off
setlocal
set "ROOT_DIR=%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo.
  echo Step-by-step:
  echo 1. Install the latest Node.js LTS from https://nodejs.org/en/download
  echo 2. Close and reopen your terminal so PATH is refreshed.
  echo 3. Confirm the install with: node --version
  echo 4. Run start.bat again.
  echo.
  pause
  exit /b 1
)

node "%ROOT_DIR%scripts\start-dev.mjs"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Start script exited with code %EXIT_CODE%.
)

pause
exit /b %EXIT_CODE%
