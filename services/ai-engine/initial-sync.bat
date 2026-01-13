@echo off
title Ezra AI - Initial Log Sync
cd /d "%~dp0"

echo.
echo ========================================
echo   Ezra AI - Initial Log Sync
echo ========================================
echo.
echo This will import all messages.log to ChromaDB
echo (Can resume if interrupted)
echo.

REM Activate virtual environment and run
call venv\Scripts\activate.bat
python initial_sync.py %*

echo.
pause
