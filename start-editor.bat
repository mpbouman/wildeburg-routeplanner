@echo off
cd /d "%~dp0"
start "" http://localhost:5173/?editor
npm run dev
