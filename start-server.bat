@echo off
title WFX Wanfuxin Website - Local Server
echo.
echo ========================================
echo   WFX Wanfuxin Website - Local Server
echo ========================================
echo.
echo Starting server...
echo.
echo English: http://localhost:8000
echo Chinese: http://localhost:8000/cn/
echo Admin:   http://localhost:8000/admin/
echo.
echo Press Ctrl+C to stop the server.
echo.
python server.py
if errorlevel 1 (
    echo.
    echo Python not found! Trying python3...
    python3 server.py
)
if errorlevel 1 (
    echo.
    echo ERROR: Python is not installed or not in PATH.
    echo.
    echo Please install Python from https://python.org
    echo Or simply open index.html directly in your browser.
    echo.
    pause
)
