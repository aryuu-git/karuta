param(
    [int]$FrontendPort = 5173,
    [int]$BackendPort = 8080
)

$ErrorActionPreference = 'Stop'
$projectDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$localDir = Join-Path $projectDir 'data/local'
$backendExe = Join-Path $localDir 'karuta-server.exe'
$backendProcess = $null
$savedEnv = @{}
$localEnv = @{
    APP_ENV = 'development'
    BIND_ADDR = '127.0.0.1'
    PORT = [string]$BackendPort
    KARUTA_BACKEND_URL = "http://127.0.0.1:$BackendPort"
    MEDIA_STORAGE = 'local'
    LOCAL_MEDIA_DIR = (Join-Path $localDir 'uploads')
    LOCAL_DEMO_DATA = 'true'
    DB_PATH = (Join-Path $localDir 'karuta.db')
    JWT_SECRET = 'karuta-local-development-secret'
    INVITE_REQUIRED = 'false'
    QUOTA_USER_BYTES = '0'
    QUOTA_DAILY_UPLOADS = '0'
}

function Assert-FreePort([int]$PortNumber) {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $PortNumber)
    try {
        $listener.Start()
    } catch {
        throw "Cannot listen on port $PortNumber. Choose another -BackendPort or -FrontendPort. $($_.Exception.Message)"
    } finally {
        $listener.Stop()
    }
}

try {
    if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
        throw 'Go 1.21+ is required. Install Go and reopen PowerShell.'
    }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'Node.js 18+ is required. Install Node.js and reopen PowerShell.'
    }
    if ($FrontendPort -lt 1 -or $FrontendPort -gt 65535 -or $BackendPort -lt 1 -or $BackendPort -gt 65535 -or $FrontendPort -eq $BackendPort) {
        throw 'Choose different frontend and backend ports from 1 to 65535.'
    }
    Assert-FreePort $BackendPort
    Assert-FreePort $FrontendPort
    New-Item -ItemType Directory -Path $localDir -Force | Out-Null
    foreach ($key in $localEnv.Keys) {
        $savedEnv[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $localEnv[$key], 'Process')
    }
    Push-Location (Join-Path $projectDir 'frontend')
    try {
        if (-not (Test-Path 'node_modules/vite/bin/vite.js')) {
            & npm.cmd ci --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw 'Failed to install frontend dependencies.' }
        }
    } finally { Pop-Location }

    Write-Host 'Building the local backend...'
    Push-Location (Join-Path $projectDir 'backend')
    try {
        & go build -o $backendExe ./cmd/server
        if ($LASTEXITCODE -ne 0) { throw 'Backend build failed.' }
    } finally { Pop-Location }

    $backendProcess = Start-Process -FilePath $backendExe -WorkingDirectory $projectDir -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $localDir 'backend.stdout.log') `
        -RedirectStandardError (Join-Path $localDir 'backend.stderr.log')
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if ($backendProcess.HasExited) { break }
        try {
            $response = Invoke-RestMethod "http://127.0.0.1:$BackendPort/readyz" -TimeoutSec 1
            if ($response.status -eq 'ready') { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) {
        throw "Backend did not become ready. See $localDir/backend.stderr.log"
    }
    Write-Host "Open http://127.0.0.1:$FrontendPort/decks"
    Write-Host 'Initial demo login: localdemo / localdemo123'
    Write-Host "Local data: $localDir"
    Write-Host 'Press Ctrl+C to stop the frontend and backend.'
    Push-Location (Join-Path $projectDir 'frontend')
    try {
        & npm.cmd run dev -- --host 127.0.0.1 --port $FrontendPort --strictPort
        if ($LASTEXITCODE -ne 0) { throw 'Frontend stopped with an error.' }
    } finally { Pop-Location }
} finally {
    if ($backendProcess -and -not $backendProcess.HasExited) {
        Stop-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue
    }
    foreach ($key in $savedEnv.Keys) {
        [Environment]::SetEnvironmentVariable($key, $savedEnv[$key], 'Process')
    }
}
