@echo off
title Wildeburg Routeplanner
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js niet gevonden. Installeer het eerst via https://nodejs.org
    pause
    exit /b 1
)

echo Dependencies controleren/installeren...
call npm install --no-audit --no-fund

echo App starten... de browser opent vanzelf op http://localhost:5173
call npm run dev -- --open
pause
