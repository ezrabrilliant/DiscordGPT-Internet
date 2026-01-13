@echo off
title ChromaDB Viewer - Spotlight
cd /d "%~dp0"
echo Starting ChromaDB Viewer...
echo.
venv\Scripts\python.exe view_chromadb.py
pause
