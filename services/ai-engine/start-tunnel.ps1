# Ezra AI Engine + Cloudflare Tunnel Launcher
# Starts AI Engine, creates tunnel, and updates GitHub Gist with new URL

# Load from .env file or use environment variables
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
        }
    }
}

$GIST_ID = $env:GIST_ID
$GITHUB_TOKEN = $env:GITHUB_TOKEN
$GIST_FILENAME = "tunnel-url.txt"

# Refresh PATH
$env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host "`n=== Ezra AI Engine + Tunnel ===" -ForegroundColor Cyan

# Step 1: Start AI Engine
Write-Host "Starting AI Engine..." -ForegroundColor Yellow
$pythonPath = Join-Path $PSScriptRoot "venv\Scripts\python.exe"
$mainPath = Join-Path $PSScriptRoot "src\main.py"

if (Test-Path $pythonPath) {
    Start-Process -FilePath $pythonPath -ArgumentList $mainPath -WorkingDirectory $PSScriptRoot -WindowStyle Minimized
    Write-Host "  AI Engine started" -ForegroundColor Green
    Start-Sleep -Seconds 3
} else {
    Write-Host "  Python venv not found!" -ForegroundColor Red
    exit 1
}

# Step 2: Start Tunnel
Write-Host "Starting Cloudflare Tunnel..." -ForegroundColor Yellow
$logFile = "$env:TEMP\cloudflared.log"
if (Test-Path $logFile) { Remove-Item $logFile -Force }

Start-Process -FilePath "cloudflared" -ArgumentList "tunnel","--url","http://localhost:8000" -RedirectStandardError $logFile -WindowStyle Hidden

Write-Host "  Waiting for tunnel URL..." -ForegroundColor Gray
$tunnelUrl = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $logFile) {
        $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
        if ($content -match "(https://[a-zA-Z0-9\-]+\.trycloudflare\.com)") {
            $tunnelUrl = $matches[1]
            break
        }
    }
}

if (-not $tunnelUrl) {
    Write-Host "  Failed to get tunnel URL" -ForegroundColor Red
    exit 1
}

Write-Host "  Tunnel: $tunnelUrl" -ForegroundColor Green

# Step 3: Update Gist
Write-Host "Updating GitHub Gist..." -ForegroundColor Yellow

$headers = @{
    "Authorization" = "token $GITHUB_TOKEN"
    "Accept" = "application/vnd.github.v3+json"
    "User-Agent" = "EzraAI"
}

$body = @{
    files = @{
        $GIST_FILENAME = @{
            content = $tunnelUrl
        }
    }
} | ConvertTo-Json -Depth 3

try {
    $null = Invoke-RestMethod -Uri "https://api.github.com/gists/$GIST_ID" -Method Patch -Headers $headers -Body $body -ContentType "application/json"
    Write-Host "  Gist updated!" -ForegroundColor Green
} catch {
    Write-Host "  Failed to update Gist: $_" -ForegroundColor Red
}

# Summary
Write-Host "`n=== All Services Started ===" -ForegroundColor Green
Write-Host "AI Engine: http://localhost:8000"
Write-Host "Tunnel:    $tunnelUrl"
Write-Host "`nPress Ctrl+C to stop. Showing tunnel logs..." -ForegroundColor Gray

Get-Content $logFile -Wait
