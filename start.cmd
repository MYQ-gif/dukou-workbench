@echo off
REM Dukou workbench launcher - ASCII only on purpose (cmd codepage safety)
setlocal
cd /d "%~dp0"

REM Port: env PORT wins, otherwise 8790 (8787 is often taken by a local gateway)
if "%PORT%"=="" set PORT=8790

where node >nul 2>nul
if errorlevel 1 (
  echo [dukou] node not found on PATH
  echo [dukou] install Node 20.12+ or run: node server.mjs
  pause
  exit /b 1
)

echo [dukou] starting on http://localhost:%PORT%
start "" "http://localhost:%PORT%"
node server.mjs
pause
