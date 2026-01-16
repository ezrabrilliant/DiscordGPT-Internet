# Ezra AI Engine - Auto Startup Script
# Waits for LM Studio, then starts AI Engine + Tunnel
# Add to Windows Startup for automatic launch

# Get script directory (handle both direct execution and dot-sourcing)
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $scriptDir) { $scriptDir = "c:\Users\ezrak\OneDrive\Documents\Code\js\ezra-project\DiscordGPT-Internet\services\ai-engine" }

# Load from .env file or use environment variables
$envFile = Join-Path $scriptDir ".env"
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
$LM_STUDIO_URL = "http://localhost:1234/v1/models"
$AI_ENGINE_PORT = 8000

# Refresh PATH
$env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

function Write-Log($message, $color = "White") {
    $time = Get-Date -Format "HH:mm:ss"
    Write-Host "[$time] $message" -ForegroundColor $color
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Ezra AI Engine - Auto Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================
# Step 1: Wait for LM Studio
# ============================================
Write-Log "Waiting for LM Studio server..." Yellow
Write-Log "Please start LM Studio and load a model" Gray

$lmStudioReady = $false
$waitTime = 0
$maxWait = 300  # 5 minutes max

while (-not $lmStudioReady -and $waitTime -lt $maxWait) {
    try {
        $response = Invoke-RestMethod -Uri $LM_STUDIO_URL -TimeoutSec 10 -ErrorAction Stop
        if ($response.data -and $response.data.Count -gt 0) {
            $lmStudioReady = $true
            $modelName = $response.data[0].id
            Write-Log "LM Studio ready! Model: $modelName" Green
        }
    } catch {
        # Still waiting - show error for debugging
        if ($waitTime % 30 -eq 0 -and $waitTime -gt 0) {
            Write-Log "Connection attempt failed, retrying..." Gray
        }
    }
    
    if (-not $lmStudioReady) {
        Start-Sleep -Seconds 5
        $waitTime += 5
        if ($waitTime % 30 -eq 0) {
            Write-Log "Still waiting... ($waitTime seconds)" Gray
        }
    }
}

if (-not $lmStudioReady) {
    Write-Log "Timeout waiting for LM Studio (5 min). Exiting." Red
    exit 1
}

# ============================================
# Step 2: Start AI Engine
# ============================================
Write-Log "Starting AI Engine..." Yellow

$pythonPath = Join-Path $scriptDir "venv\Scripts\python.exe"
$mainPath = Join-Path $scriptDir "src\main.py"

if (-not (Test-Path $pythonPath)) {
    Write-Log "Python venv not found! Run setup first." Red
    exit 1
}

# Kill existing AI Engine if running
$existingProcess = Get-NetTCPConnection -LocalPort $AI_ENGINE_PORT -ErrorAction SilentlyContinue
if ($existingProcess) {
    Stop-Process -Id $existingProcess.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# Start AI Engine in new PowerShell window (with colors!)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$scriptDir'; & '$pythonPath' '$mainPath'" -WorkingDirectory $scriptDir
Write-Log "AI Engine started (new PowerShell window)" Green

# Wait for AI Engine to be ready
Start-Sleep -Seconds 3
$aiReady = $false
for ($i = 0; $i -lt 10; $i++) {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:$AI_ENGINE_PORT/ping" -TimeoutSec 2
        if ($response.status -eq "ok") {
            $aiReady = $true
            break
        }
    } catch {}
    Start-Sleep -Seconds 1
}

if ($aiReady) {
    Write-Log "AI Engine ready!" Green
} else {
    Write-Log "AI Engine may still be loading..." Yellow
}

# ============================================
# Step 3: Check RAG Status (Initial sync done separately)
# ============================================
Write-Log "Checking RAG database status..." Yellow

try {
    $statusResponse = Invoke-RestMethod -Uri "http://localhost:$AI_ENGINE_PORT/status" -TimeoutSec 10
    $docCount = $statusResponse.documents_indexed
    
    if ($docCount -gt 0) {
        Write-Log "RAG ready with $docCount documents" Green
    } else {
        Write-Log "RAG empty! Run initial-sync.bat first" Yellow
    }
} catch {
    Write-Log "Could not check RAG status" Gray
}

# ============================================
# Step 4: Start Cloudflare Tunnel
# ============================================
Write-Log "Starting Cloudflare Tunnel..." Yellow

$logFile = "$env:TEMP\cloudflared.log"
if (Test-Path $logFile) { Remove-Item $logFile -Force }

Start-Process -FilePath "cloudflared" -ArgumentList "tunnel","--url","http://localhost:$AI_ENGINE_PORT" -RedirectStandardError $logFile -WindowStyle Hidden

Write-Log "Waiting for tunnel URL..." Gray
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
    Write-Log "Failed to get tunnel URL" Red
    exit 1
}

Write-Log "Tunnel: $tunnelUrl" Green

# ============================================
# Step 5: Update GitHub Gist
# ============================================
Write-Log "Updating GitHub Gist..." Yellow

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
    Write-Log "Gist updated!" Green
} catch {
    Write-Log "Failed to update Gist: $_" Red
}

# ============================================
# Summary
# ============================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   All Services Running!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  LM Studio:  http://localhost:1234" -ForegroundColor White
Write-Host "  AI Engine:  http://localhost:$AI_ENGINE_PORT" -ForegroundColor White
Write-Host "  Tunnel:     $tunnelUrl" -ForegroundColor White
Write-Host ""
Write-Host "  Press Ctrl+C to stop tunnel" -ForegroundColor Gray
Write-Host "  (Other services run in background)" -ForegroundColor Gray
Write-Host ""

# Keep running and show tunnel logs
Write-Log "Showing tunnel logs..." Gray
Get-Content $logFile -Wait
