@echo off
REM ====================================================================
REM  Study Buddy - try it live without building an installer.
REM  Double-click to run the buddy straight from source.
REM ====================================================================
cd /d "%~dp0"
title Study Buddy - running

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed. Install the "LTS" version from https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo   First run - installing dependencies (a few minutes, needs internet)...
  call npm install
  if errorlevel 1 ( echo npm install failed. & pause & exit /b 1 )
)

echo   Starting Study Buddy... (close this window to stop it)
call npm start
