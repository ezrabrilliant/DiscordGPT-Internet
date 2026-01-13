@echo off
chcp 65001 >nul
title Ezra AI Engine - Auto Startup

:: Run the PowerShell auto-startup script
powershell -ExecutionPolicy Bypass -File "%~dp0auto-startup.ps1"

pause
