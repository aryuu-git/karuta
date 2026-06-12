$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

function WaitKey {
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

Write-Host "============================================"
Write-Host "  Karuta Dev Launcher"
Write-Host "============================================"
Write-Host ""

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] go not found. Please install Go."
    WaitKey; exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] npm not found. Please install Node.js."
    WaitKey; exit 1
}

Write-Host "Go:   $(go version)"
Write-Host "Node: $(node --version)"
Write-Host ""

Write-Host "[1] Killing port 8080 / 5173..."
foreach ($port in @(8080, 5173)) {
    $lines = netstat -ano | Select-String ":$port\s"
    foreach ($line in $lines) {
        $parts = ($line.ToString().Trim() -split '\s+')
        $pid2 = $parts[-1]
        if ($pid2 -match '^\d+$') {
            Stop-Process -Id ([int]$pid2) -Force -ErrorAction SilentlyContinue
        }
    }
}
Write-Host "Done."
Write-Host ""

Write-Host "[2] Building backend..."
Set-Location $ROOT
& go build -o karuta-server.exe .\cmd\server
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Go build failed."
    WaitKey; exit 1
}
Write-Host "OK -> karuta-server.exe"
Write-Host ""

Write-Host "[3] Building frontend..."
Set-Location "$ROOT\frontend"
cmd /c "npm run build"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Frontend build failed."
    WaitKey; exit 1
}
Write-Host "OK -> dist/"
Write-Host ""

Write-Host "[4] Starting services..."
# 加载本地配置（密钥等敏感信息，不上传 git）
if (Test-Path "$ROOT\dev_local.ps1") {
    . "$ROOT\dev_local.ps1"
    Write-Host "Loaded dev_local.ps1"
} else {
    Write-Host "[WARN] dev_local.ps1 not found. COS may not work."
    Write-Host "       Create dev_local.ps1 with your COS keys, see dev_local.ps1.example"
}
Start-Process "$ROOT\karuta-server.exe" -WorkingDirectory $ROOT
Start-Sleep -Seconds 2
Start-Process "cmd" -ArgumentList "/k `"cd /d $ROOT\frontend && npm run dev`""

Write-Host ""
Write-Host "============================================"
Write-Host "  Backend:  http://localhost:8080"
Write-Host "  Frontend: http://localhost:5173"
Write-Host "============================================"
WaitKey
