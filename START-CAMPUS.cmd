@echo off
setlocal
cd /d "%~dp0"
echo Starting Campus...
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0launch.mjs"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Extract the complete Campus-Local-Windows.zip first.
    echo Or install Node.js from https://nodejs.org/en/download
    pause
    exit /b 1
  )
  node "%~dp0launch.mjs"
)
if errorlevel 1 pause
endlocal
