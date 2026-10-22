$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = Split-Path -Parent $PSScriptRoot
$testRoot = Join-Path $projectRoot ('.verification\packaging-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$testConfig = Join-Path $testRoot 'GoogleOAuth.test.json'
# Deliberately fictitious application identity; these packages are verification artifacts only.
$json = @{ installed = @{ client_id = 'test.apps.googleusercontent.com'; client_secret = 'desktop-client-secret' } } | ConvertTo-Json
[IO.File]::WriteAllText($testConfig, $json, (New-Object Text.UTF8Encoding($false)))

function Assert-PackageLogin {
    param([string]$Package, [string]$Report, [bool]$Configured)
    $expectation = '--expect-google-unconfigured'
    if ($Configured) { $expectation = '--expect-google-configured' }
    $arguments = '--verify-ui "' + $Report + '" ' + $expectation
    $process = Start-Process -FilePath (Join-Path $Package 'Pingo.exe') -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        $errorReport = Join-Path $Report 'ui-error.txt'
        if (Test-Path -LiteralPath $errorReport) { Write-Host ([IO.File]::ReadAllText($errorReport)) }
        throw 'A configuracao Google no pacote nao corresponde ao resultado esperado.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $Report 'ui-report.txt'))) { throw 'O teste visual nao gerou o relatorio.' }
}

$configuredPackage = Join-Path $testRoot 'configured'
& (Join-Path $PSScriptRoot 'Publish-Pingo.ps1') -GoogleOAuthFile $testConfig -RequireGoogleLogin -OutputDirectory $configuredPackage
Assert-PackageLogin -Package $configuredPackage -Report (Join-Path $testRoot 'configured-ui') -Configured $true
Write-Host 'PASS: recurso integrado habilita Entrar com Google, sem importacao manual.'

# Explicitly empty global MSBuild property also suppresses the local default configuration.
# Do not clean obj/: exercise the configured -> unconfigured incremental build regression.
$localPackage = Join-Path $testRoot 'unconfigured'
& dotnet publish (Join-Path $projectRoot 'Pingo.App\Pingo.App.csproj') -c Release -o $localPackage --self-contained false --nologo '-p:PingoGoogleOAuthFile='
if ($LASTEXITCODE -ne 0) { throw 'Falha na compilacao sem configuracao Google.' }
Assert-PackageLogin -Package $localPackage -Report (Join-Path $testRoot 'unconfigured-ui') -Configured $false
Write-Host 'PASS: compilacao seguinte remove o recurso OAuth anterior, sem reutilizar cliente de teste.'
