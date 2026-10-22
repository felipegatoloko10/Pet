@echo off
cd /d "%~dp0"
if not exist "Pingo\Pingo.exe" (
  echo A versao compilada nao foi encontrada. Execute Compilar Pingo.cmd primeiro.
  pause
  exit /b 1
)
start "" "%~dp0Pingo\Pingo.exe"
