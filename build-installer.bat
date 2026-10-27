@echo off
REM ====================================================================
REM  Study Buddy - one-click Windows installer builder
REM  Double-click this file. It will ask for administrator rights (once)
REM  so it can unpack the build tools, then produce the installer in the
REM  dist\ folder and open it for you.
REM ====================================================================

REM --- self-elevate: unpacking the signing helper needs symlink rights ---
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator rights (needed to unpack the build tools)...
  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

cd /d "%~dp0"
title Study Buddy - building installer

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed on this PC.
  echo   Install the "LTS" version from  https://nodejs.org  then run this again.
  echo.
  pause
  exit /b 1
)

REM clear any half-extracted signing cache left by a previous non-admin run
rd /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" >nul 2>nul

echo.
echo   [1/2] Making sure dependencies are present...
echo.
call npm install
if errorlevel 1 (
  echo.
  echo   npm install failed. Check your internet connection and try again.
  pause
  exit /b 1
)

echo.
echo   [2/2] Building the Windows installer...
echo.
call npm run dist
if errorlevel 1 (
  echo.
  echo   Build failed. Scroll up to see the error, or send it to Chris.
  pause
  exit /b 1
)

echo.
echo   Done!  Your installer and a portable .exe are in the dist\ folder.
echo         - StudyBuddy-...-Setup.exe     (installs + auto-updates)
echo         - StudyBuddy-...-portable.exe  (just double-click, no install)
echo.
start "" "%~dp0dist"
pause
