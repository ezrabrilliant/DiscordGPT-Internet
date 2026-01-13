@echo off
chcp 65001 >nul
title Ezra AI Engine
color 0A

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║         🤖 Ezra AI Engine - Startup Script           ║
echo ╚══════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

REM ==========================================
REM Check Python
REM ==========================================
echo [1/5] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python not found! Please install Python 3.10+
    pause
    exit /b 1
)
echo      ✅ Python found

REM ==========================================
REM Setup Virtual Environment
REM ==========================================
echo [2/5] Setting up virtual environment...
if not exist "venv" (
    echo      Creating new venv...
    python -m venv venv
    if errorlevel 1 (
        echo ❌ Failed to create virtual environment
        pause
        exit /b 1
    )
)
call venv\Scripts\activate
echo      ✅ Virtual environment activated

REM ==========================================
REM Install Dependencies
REM ==========================================
echo [3/5] Checking dependencies...
pip install -r requirements.txt --quiet --disable-pip-version-check
echo      ✅ Dependencies ready

REM ==========================================
REM Check LM Studio
REM ==========================================
echo [4/5] Checking LM Studio server...
curl -s http://localhost:1234/v1/models >nul 2>&1
if errorlevel 1 (
    echo      ⚠️  LM Studio server not running!
    echo.
    echo      Please:
    echo      1. Open LM Studio
    echo      2. Load model: gemma-3n-e4b
    echo      3. Go to "Local Server" tab
    echo      4. Click "Start Server"
    echo.
    echo      Press any key after starting LM Studio server...
    pause >nul
    
    REM Check again
    curl -s http://localhost:1234/v1/models >nul 2>&1
    if errorlevel 1 (
        echo      ❌ Still can't connect to LM Studio. Exiting...
        pause
        exit /b 1
    )
)
echo      ✅ LM Studio server is running

REM ==========================================
REM Start AI Engine
REM ==========================================
echo [5/5] Starting AI Engine...
echo.
echo ══════════════════════════════════════════════════════
echo   Server will start at: http://localhost:8000
echo.
echo   To expose to internet, run tunnel.bat in new window
echo   Press Ctrl+C to stop
echo ══════════════════════════════════════════════════════
echo.

python src/main.py

REM If we get here, server stopped
echo.
echo Server stopped.
pause
