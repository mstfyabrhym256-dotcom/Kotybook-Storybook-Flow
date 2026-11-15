@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Kotybook Storybook - Google Flow

echo ==========================================
echo       KOTYBOOK STORYBOOK - FLOW
echo ==========================================

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 20 LTS first.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing project packages...
  call npm install
  if errorlevel 1 goto error
)

echo Installing/checking Chromium...
call npx playwright install chromium
if errorlevel 1 goto error

if not exist "config.json" (
  copy "config.example.json" "config.json" >nul
  echo.
  echo config.json was created from the example.
  echo Fill APPS_SCRIPT_URL, API_SECRET and GEMINI_API_KEY, then run start.bat again.
  notepad "config.json"
  pause
  exit /b 0
)

if not exist "auth.json" (
  echo.
  echo Google Flow login is required once.
  call npm run login
  if errorlevel 1 goto error
)

echo.
echo Starting Kotybook Storybook...
call npm start
goto end

:error
echo.
echo An error occurred. Read the message above.
pause
exit /b 1

:end
pause
