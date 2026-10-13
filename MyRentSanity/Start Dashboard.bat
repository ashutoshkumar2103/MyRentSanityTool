@echo off
cd /d "%~dp0"
echo Starting the MyRent Sanity Dashboard...
echo A browser tab will open automatically once it's ready.
echo.
echo Leave this window open while you use the dashboard.
echo Close this window (or press Ctrl+C) when you're done to stop it.
echo.
call npm run sanity:dashboard
pause
