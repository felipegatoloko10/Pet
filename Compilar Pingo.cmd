@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Publish-Pingo.ps1"
if errorlevel 1 (
  echo Nao foi possivel compilar. Verifique se o SDK .NET 8 esta instalado.
  pause
  exit /b 1
)
echo Pronto! Abra Abrir Pingo.cmd.
pause
