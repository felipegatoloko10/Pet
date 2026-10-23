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
    [StructLayout(LayoutKind.Sequential)] public struct Bounds { public int Left,Top,Right,Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X,Y; }
    private delegate bool EnumWindowsCallback(IntPtr hwnd, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsCallback callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int length);
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out Bounds bounds);
    [DllImport("user32.dll")] private static extern bool MoveWindow(IntPtr hwnd, int x, int y, int width, int height, bool repaint);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd,int command);
    [DllImport("user32.dll")] private static extern IntPtr GetDC(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern int ReleaseDC(IntPtr hwnd,IntPtr dc);
    [DllImport("gdi32.dll")] private static extern uint GetPixel(IntPtr dc,int x,int y);
    public static uint Pixel(int x,int y) { var dc=GetDC(IntPtr.Zero); try {return GetPixel(dc,x,y);} finally {ReleaseDC(IntPtr.Zero,dc);} }
    [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr(IntPtr hwnd,int index);
    public static bool IgnoresMouse(IntPtr hwnd) { return (GetWindowLongPtr(hwnd,-20).ToInt64() & 0x20) != 0; }
    public static Bounds Rectangle(IntPtr hwnd) { Bounds bounds; if(!GetWindowRect(hwnd,out bounds)) throw new Exception("Janela indisponível"); return bounds; }
    public static void Resize(IntPtr hwnd,int width,int height) { var bounds=Rectangle(hwnd); if(!MoveWindow(hwnd,bounds.Left,bounds.Top,width,height,true)) throw new Exception("Falha no redimensionamento"); }
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
$originalCursor = New-Object PingoWindows+Point
$hasCursor = [PingoWindows]::GetCursorPos([ref]$originalCursor)
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
    $petHandle = [PingoWindows]::Find($window.Id, 'Pingo')
    if ($petHandle -eq [IntPtr]::Zero) { throw 'O avatar não abriu.' }
    $bounds = [PingoWindows]::Rectangle($petHandle)
    $expectedWidth = $bounds.Right - $bounds.Left + 60
    [PingoWindows]::Resize($petHandle, $expectedWidth, $bounds.Bottom - $bounds.Top + 60)
    Start-Sleep -Seconds 1
    $resized = [PingoWindows]::Rectangle($petHandle)
    if ($resized.Right - $resized.Left -ne $expectedWidth) { throw 'O avatar não redimensionou.' }
    [PingoWindows]::ShowWindow($petHandle,0) | Out-Null
    Start-Sleep -Milliseconds 300
    $underneath = [PingoWindows]::Pixel($resized.Left + 2,$resized.Top + 60)
    [PingoWindows]::ShowWindow($petHandle,4) | Out-Null
    Start-Sleep -Milliseconds 700
    $overlaid = [PingoWindows]::Pixel($resized.Left + 2,$resized.Top + 60)
    if ($underneath -ne 0 -and $underneath -ne [uint32]::MaxValue) {
        if ($underneath -ne $overlaid) { throw 'O avatar desenhou um fundo opaco sobre o desktop.' }
        Write-Output 'Transparência nativa conferida comparando o pixel do desktop com o avatar oculto e visível.'
    } else { Write-Warning 'Captura visual indisponível neste desktop; transparência RGBA verificada no teste de navegador.' }
    if ($hasCursor -and [PingoWindows]::SetCursorPos($resized.Left + 2, $resized.Top + 60)) {
        $deadline = (Get-Date).AddSeconds(8)
        do { Start-Sleep -Milliseconds 200 } until ([PingoWindows]::IgnoresMouse($petHandle) -or (Get-Date) -gt $deadline)
        if (-not [PingoWindows]::IgnoresMouse($petHandle)) { throw 'A área transparente está bloqueando o cursor.' }
        $scale = [PingoWindows]::GetDpiForWindow($petHandle) / 96.0
        [PingoWindows]::SetCursorPos([int](($resized.Left + $resized.Right)/2),[int]($resized.Bottom - 51*$scale)) | Out-Null
        $deadline = (Get-Date).AddSeconds(5)
        do { Start-Sleep -Milliseconds 200 } until (-not [PingoWindows]::IgnoresMouse($petHandle) -or (Get-Date) -gt $deadline)
        if ([PingoWindows]::IgnoresMouse($petHandle)) { throw 'A barra de conversa não recuperou os cliques.' }
        Write-Output 'Passagem do cursor no fundo transparente e captura na barra de conversa verificadas.'
    } else { Write-Warning 'Desktop sem cursor interativo: a passagem do mouse não pôde ser verificada neste host.' }
    Close-PingoWindow $window 'Pingo — meu dia'
    $started = Start-Process -FilePath $binary -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 3
    if ((Get-PingoInstances).Count -ne 1) { throw 'A reabertura criou instâncias incorretas.' }
    $restored = [PingoWindows]::Rectangle([PingoWindows]::Find($started.Id,'Pingo'))
    if ([Math]::Abs(($restored.Right - $restored.Left) - $expectedWidth) -gt 2) { throw 'O tamanho do avatar não foi preservado na reabertura.' }
    Close-PingoWindow $started 'Pingo'
    Write-Output 'Instância única, redimensionamento persistente, fechamento do painel/avatar e reabertura verificados no Windows.'
} finally {
    if ($hasCursor) { [PingoWindows]::SetCursorPos($originalCursor.X,$originalCursor.Y) | Out-Null }
    if (Test-Path -LiteralPath $env:PINGO_SHUTDOWN_TRACE) { Get-Content -LiteralPath $env:PINGO_SHUTDOWN_TRACE }
    Get-PingoInstances | Stop-Process -ErrorAction SilentlyContinue
}
