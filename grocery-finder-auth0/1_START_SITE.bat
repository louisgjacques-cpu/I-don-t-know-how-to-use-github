@echo off
cd /d "%~dp0"
where python >nul 2>nul || (echo Python is not installed. Get it from python.org/downloads & pause & exit /b)
echo Starting Grocery Finder... keep this window open while you use the site.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8000"
python -m http.server 8000
pause
