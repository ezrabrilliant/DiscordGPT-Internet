@echo off
chcp 65001 >nul
title Ezra AI Engine - Cloudflare Tunnel
color 0B

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║      🌐 Cloudflare Tunnel for AI Engine              ║
echo ╚══════════════════════════════════════════════════════╝
echo.

REM Check if cloudflared is installed
where cloudflared >nul 2>&1
if errorlevel 1 (
    echo ❌ cloudflared not found!
    echo.
    echo Please install cloudflared first:
    echo   winget install Cloudflare.cloudflared
    echo.
    echo Or download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
    echo.
    pause
    exit /b 1
)

echo ✅ cloudflared found
echo.
echo Starting tunnel to localhost:8000...
echo.
echo ══════════════════════════════════════════════════════
echo   Copy the URL shown below (*.trycloudflare.com)
echo   and set it as AI_ENGINE_URL in your server's .env
echo ══════════════════════════════════════════════════════
echo.

cloudflared tunnel --url http://localhost:8000

pause
