param(
    [string]$GoogleOAuthFile,
    [string]$OutputDirectory,
    [switch]$RequireGoogleLogin
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot 'Pingo' }
if (-not $GoogleOAuthFile) {
    $localConfig = Join-Path $projectRoot 'Pingo.App\GoogleOAuth.local.json'
    if (Test-Path -LiteralPath $localConfig) { $GoogleOAuthFile = $localConfig }
}

$temporaryConfig = $null
try {
    $raw = $null
    if ($GoogleOAuthFile) { $raw = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $GoogleOAuthFile).Path) }
    elseif ($env:PINGO_GOOGLE_OAUTH_JSON) { $raw = $env:PINGO_GOOGLE_OAUTH_JSON }
    if ($raw) {
        # Accept only application credentials; never package a user's token store.
        try { $configuration = ConvertFrom-Json -InputObject $raw }
        catch { throw 'A configuracao OAuth do aplicativo nao e um JSON valido.' }
        if ($null -eq $configuration -or $configuration -is [Array]) { throw 'A configuracao OAuth deve ser um objeto.' }
        if ($configuration.PSObject.Properties['web']) { throw 'Use um cliente OAuth Desktop, nao um cliente Web.' }
        $client = $configuration
        if ($configuration.PSObject.Properties['installed']) { $client = $configuration.installed }
        if ($null -eq $client -or $client -is [Array] -or $client -is [string]) { throw 'A configuracao do cliente Desktop e invalida.' }
        foreach ($item in @($configuration, $client)) {
            foreach ($property in $item.PSObject.Properties.Name) {
                if ($property -match '^(access_token|refresh_token|id_token|AccessToken|RefreshToken)$') {
                    throw 'Nao use tokens de usuario na configuracao distribuida do aplicativo.'
                }
            }
        }
        if (-not $client.PSObject.Properties['client_id'] -or $client.client_id -isnot [string] -or $client.client_id.Trim() -cnotmatch '^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$') {
            throw 'Informe o client_id valido do cliente OAuth Desktop registrado no Google.'
        }
        $clientSecret = ''
        if ($client.PSObject.Properties['client_secret']) {
            if ($client.client_secret -isnot [string]) { throw 'O client_secret deve ser texto.' }
            $clientSecret = $client.client_secret
        }
        # Strip all other fields and do not print the JSON or credentials in build logs.
        $sanitized = @{ client_id = $client.client_id.Trim(); client_secret = $clientSecret } | ConvertTo-Json -Compress
        $temporaryConfig = [IO.Path]::GetTempFileName()
        [IO.File]::WriteAllText($temporaryConfig, $sanitized, (New-Object Text.UTF8Encoding($false)))
    }
    elseif ($RequireGoogleLogin) {
        throw 'Falta registrar o Pingo no Google e fornecer a configuracao OAuth do aplicativo. Nenhuma versao com login habilitado foi gerada.'
    }
    else {
        Write-Host 'Sem cliente OAuth registrado: esta compilacao tera funcoes locais e informara que o login Google ainda nao foi habilitado.'
    }
    $publishArguments = @('publish', (Join-Path $projectRoot 'Pingo.App\Pingo.App.csproj'), '-c', 'Release', '-o', $OutputDirectory, '--self-contained', 'false', '--nologo')
    if ($temporaryConfig) { $publishArguments += "-p:PingoGoogleOAuthFile=$temporaryConfig" }
    & dotnet @publishArguments
    if ($LASTEXITCODE -ne 0) { throw 'Falha na compilacao do Pingo.' }
    if ($temporaryConfig) { Write-Host 'Pingo gerado com Entrar com Google integrado. Usuarios nao precisam importar arquivos.' }
}
finally {
    if ($temporaryConfig -and (Test-Path -LiteralPath $temporaryConfig)) { Remove-Item -LiteralPath $temporaryConfig -Force }
}
