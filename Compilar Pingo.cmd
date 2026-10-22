@echo off
cd /d "%~dp0"
dotnet publish "Pingo.App\Pingo.App.csproj" -c Release -o "Pingo" --self-contained false
if errorlevel 1 (
  echo Nao foi possivel compilar. Verifique se o SDK .NET 8 esta instalado.
  pause
  exit /b 1
)
echo Pronto! Abra Abrir Pingo.cmd.
pause
