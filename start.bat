@echo off
title Grocery Finder
rem Double-click this file to start the site. No typing needed.

rem Work from THIS folder, no matter where it is
cd /d "%~dp0"

rem Check Python is installed
where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Python is not installed yet.
  echo  1. Go to  python.org/downloads
  echo  2. Click the big yellow Download button and install it
  echo  3. IMPORTANT: on the first installer screen, tick
  echo     "Add python.exe to PATH"
  echo  4. Then double-click this file again.
  echo.
  pause
  exit /b
)

rem If a server from last time is still running, that's fine - reuse it
rem Start the hidden server
start "Grocery Finder server" /min cmd /c "python -m http.server 8000"
em Give it a second, then open the site in the default browser
timeout /t 1 >nul
start "" http://localhost:8000

echo.
echo  Grocery Finder is open in your browser.
echo  A tiny server window is hiding in your taskbar -
echo  close THIS window when you are done.
echo.
timeout /t 4 >nul
