@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 exit /b 1
)
echo Iniciando o ED Viz em http://localhost:5173 ...
call npm run dev -- --open
