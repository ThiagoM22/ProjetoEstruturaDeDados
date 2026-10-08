@echo off
cd /d "%~dp0"
echo Iniciando o ED Viz na porta 8787...
start "ED Viz - servidor" /min cmd /c "node servidor.js 8787"
timeout /t 1 /nobreak >nul
start "" "http://localhost:8787"
