$ErrorActionPreference = 'Stop'
$binary = (Resolve-Path 'apps/desktop/src-tauri/target/release/pingo.exe').Path
$started = $null
New-Item -ItemType Directory -Path '.verification' -Force | Out-Null
$env:PINGO_SHUTDOWN_TRACE = Join-Path (Get-Location) '.verification/native-shutdown.log'
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class PingoWindows {
    private delegate bool EnumWindowsCallback(IntPtr hwnd, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsCallback callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int length);
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam);
    public static IntPtr Find(int processId, string title) {
        IntPtr result = IntPtr.Zero;
        EnumWindows((hwnd, _) => {
            uint owner;
            GetWindowThreadProcessId(hwnd, out owner);
            var text = new StringBuilder(512);
            GetWindowText(hwnd, text, text.Capacity);
            if (owner == processId && text.ToString() == title) { result = hwnd; return false; }
            return true;
        }, IntPtr.Zero);
        return result;
    }
    public static bool Close(IntPtr hwnd) { return PostMessage(hwnd, 0x0010, IntPtr.Zero, IntPtr.Zero); }
}
'@
function Get-PingoInstances {
    @(Get-Process -Name pingo -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $binary })
}
function Close-PingoWindow($process, [string]$title) {
    $handle = [PingoWindows]::Find($process.Id, $title)
    if ($handle -eq [IntPtr]::Zero) { throw "Janela não encontrada: $title" }
    Write-Output "Fechando a janela nativa: $title ($handle)."
    if (-not [PingoWindows]::Close($handle)) { throw "Não foi possível fechar $title." }
    if (-not $process.WaitForExit(10000)) { throw "O Pingo permaneceu ativo após fechar $title." }
    if ((Get-PingoInstances).Count -ne 0) { throw 'Uma instância permaneceu ativa após a saída.' }
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
    Close-PingoWindow $window 'Pingo — meu dia'
    $started = Start-Process -FilePath $binary -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 3
    if ((Get-PingoInstances).Count -ne 1) { throw 'A reabertura criou instâncias incorretas.' }
    Close-PingoWindow $started 'Pingo'
    Write-Output 'Instância única, fechamento do painel, fechamento do avatar e reabertura verificados no Windows.'
} finally {
    if (Test-Path -LiteralPath $env:PINGO_SHUTDOWN_TRACE) { Get-Content -LiteralPath $env:PINGO_SHUTDOWN_TRACE }
    Get-PingoInstances | Stop-Process -ErrorAction SilentlyContinue
}
