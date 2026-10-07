@echo off
TITLE OmniMeet AI - Real-Time Multilingual Conferencing
color 0B

echo ==============================================================================
echo                      OmniMeet AI — Conference Platform
echo ==============================================================================
echo.

cd /d "%~dp0\.."

echo [*] Checking Python environment...
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in your PATH.
    pause
    exit /b 1
)

echo [*] Starting OmniMeet Backend Gateway on port 8000...
start "OmniMeet Gateway" cmd /k "cd backend-gateway && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 2 >nul

echo [*] Opening OmniMeet in your browser...
start http://localhost:8000

echo.
echo [OK] OmniMeet AI is now running!
echo      - Web Application: http://localhost:8000
echo      - REST & WebSocket API: ws://localhost:8000/ws/room/{roomId}/{userId}
echo      - API Docs: http://localhost:8000/docs
echo.
echo Press any key to close this launcher window (servers will continue running in background).
pause >nul
