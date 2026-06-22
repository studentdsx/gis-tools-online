@echo off
cd /d "%~dp0gis-tools-backend"
echo Starting GIS Tools backend on http://localhost:3000
echo Keep this window open while using the application.
"C:\Program Files\nodejs\node.exe" src/index.js
pause
