@echo off
cd /d "%~dp0gis-tools-frontend"
call "C:\Program Files\nodejs\npm.cmd" run dev -- --host 127.0.0.1 >> vite.out.log 2>> vite.err.log
