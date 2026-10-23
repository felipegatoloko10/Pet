$ErrorActionPreference = 'Stop'
$binary = (Resolve-Path 'apps/desktop/src-tauri/target/release/pingo.exe').Path
$started = $null
New-Item -ItemType Directory -Path '.verification' -Force | Out-Null
$env:PINGO_SHUTDOWN_TRACE = Join-Path (Get-Location) '.verification/native-shutdown.log'
function Get-PingoInstances {
    @(Get-Process -Name pingo -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $binary })
}
try {
    $started = Start-Process -FilePath $binary -WindowStyle Hidden -PassThru
    $deadline = (Get-Date).AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 500
        $instances = Get-PingoInstances
        $window = $instances | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    } until ($window -or (Get-Date) -gt $deadline)
    if (-not $window) { throw 'O painel nativo não abriu.' }
    1..3 | ForEach-Object { Start-Process -FilePath $binary -WindowStyle Hidden | Out-Null; Start-Sleep -Seconds 1 }
    if ((Get-PingoInstances).Count -ne 1) { throw 'Mais de uma instância do Pingo ficou ativa.' }
    $window.Refresh()
    Write-Output "Fechando a janela nativa: $($window.MainWindowTitle) ($($window.MainWindowHandle))."
    if (-not $window.CloseMainWindow()) { throw 'Não foi possível solicitar o fechamento do painel.' }
    $window.WaitForExit(10000) | Out-Null
    if ((Get-PingoInstances).Count -ne 0) { throw 'O Pingo permaneceu ativo após fechar o painel.' }
    $started = Start-Process -FilePath $binary -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 3
    if ((Get-PingoInstances).Count -ne 1) { throw 'A reabertura criou instâncias incorretas.' }
    Write-Output 'Instância única, fechamento do painel e reabertura verificados no Windows.'
} finally {
    if (Test-Path -LiteralPath $env:PINGO_SHUTDOWN_TRACE) { Get-Content -LiteralPath $env:PINGO_SHUTDOWN_TRACE }
    Get-PingoInstances | Stop-Process -ErrorAction SilentlyContinue
}
