@echo off
REM Dukou workbench launcher - ASCII only on purpose (cmd codepage safety)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [dukou] node not found on PATH
  echo [dukou] install Node 18+ or run: node server.mjs
  pause
  exit /b 1
)
node server.mjs
pause
