@echo off
cd /d "%~dp0"
if not exist node_modules call npm ci --ignore-scripts
if errorlevel 1 exit /b 1
if not exist .venv\Scripts\python.exe call npm run setup
if errorlevel 1 exit /b 1
call npm start
pause
