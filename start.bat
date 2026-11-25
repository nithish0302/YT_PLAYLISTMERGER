@echo off
title Playlist Centralizer - YouTube Music Suite
echo ========================================================
echo        PLAYLIST CENTRALIZER - LOCAL DEV LAUNCHER
echo ========================================================
echo.
echo Starting Backend Server on http://localhost:3001 ...
start "Playlist Centralizer Server" cmd /k "cd /d d:\YT PLAYLIST\server && npm start"

timeout /t 3 /nobreak > nul

echo Starting Frontend React App on http://localhost:3000 ...
start "Playlist Centralizer Client" cmd /k "cd /d d:\YT PLAYLIST\client && npm start"

echo.
echo ========================================================
echo App running!
echo Frontend: http://localhost:3000
echo Backend:  http://localhost:3001
echo ========================================================
echo.
pause
