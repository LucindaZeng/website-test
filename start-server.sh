#!/bin/bash

echo ""
echo "========================================"
echo "  WFX Wanfuxin Website - Local Server"
echo "========================================"
echo ""
echo "Starting server..."
echo ""
echo "English: http://localhost:8000"
echo "Chinese: http://localhost:8000/cn/"
echo "Admin:   http://localhost:8000/admin/"
echo ""
echo "Press Ctrl+C to stop the server."
echo ""

# Change to script directory
cd "$(dirname "$0")"

# Try python3 first (Mac/Linux default), then python
if command -v python3 &> /dev/null; then
    python3 server.py
elif command -v python &> /dev/null; then
    python server.py
else
    echo ""
    echo "ERROR: Python is not installed."
    echo ""
    echo "Please install Python from https://python.org"
    echo "Or simply open index.html directly in your browser."
    echo ""
    exit 1
fi
