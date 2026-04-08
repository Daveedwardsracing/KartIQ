[CmdletBinding()]
param(
    [string]$RepoPath = "C:\Apps\DERUniproCoaching",
    [switch]$InstallAppDependencies,
    [switch]$InstallDevelopmentTools,
    [switch]$InstallBrowser,
    [switch]$InstallReverseProxy,
    [switch]$InstallPostgreSql,
    [string[]]$OllamaModels = @("gemma3:1b", "gemma3:4b")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-Administrator {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-Administrator {
    if (-not (Test-Administrator)) {
        throw "Run this script from an elevated PowerShell window (Run as Administrator)."
    }
}

function Ensure-Chocolatey {
    if (Get-Command choco -ErrorAction SilentlyContinue) {
        return
    }

    Write-Step "Installing Chocolatey"
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString("https://community.chocolatey.org/install.ps1"))

    $env:Path += ";$env:ProgramData\chocolatey\bin"
    if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
        throw "Chocolatey installation finished but choco is not available on PATH."
    }
}

function Install-ChocoPackage {
    param(
        [Parameter(Mandatory = $true)][string]$PackageName,
        [string]$DisplayName = $PackageName,
        [string]$ExtraArgs = ""
    )

    Write-Step "Installing $DisplayName"
    $arguments = @("install", $PackageName, "-y", "--no-progress")
    if ($ExtraArgs) {
        $arguments += $ExtraArgs
    }
    & choco @arguments
}

function Ensure-FirewallRule {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][int]$Port
    )

    $existingRule = Get-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue
    if ($existingRule) {
        return
    }

    Write-Step "Opening TCP port $Port ($Name)"
    New-NetFirewallRule `
        -DisplayName $Name `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort $Port | Out-Null
}

function Ensure-Ollama {
    if (Get-Command ollama -ErrorAction SilentlyContinue) {
        return
    }

    Write-Step "Installing Ollama"
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString("https://ollama.com/install.ps1"))
}

function Invoke-RepoCommand {
    param(
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$CommandLine
    )

    Write-Step "Running in ${WorkingDirectory}: $CommandLine"
    Push-Location $WorkingDirectory
    try {
        powershell -NoProfile -ExecutionPolicy Bypass -Command $CommandLine
    }
    finally {
        Pop-Location
    }
}

function Install-AppDependencies {
    param([string]$ProjectRoot)

    if (-not (Test-Path $ProjectRoot)) {
        throw "Repo path '$ProjectRoot' was not found."
    }

    $frontendPath = Join-Path $ProjectRoot "frontend"
    $backendPath = Join-Path $ProjectRoot "backend"
    $rootPackageJson = Join-Path $ProjectRoot "package.json"

    if (Test-Path $rootPackageJson) {
        Invoke-RepoCommand -WorkingDirectory $ProjectRoot -CommandLine "npm install"
    }

    if (Test-Path (Join-Path $frontendPath "package.json")) {
        Invoke-RepoCommand -WorkingDirectory $frontendPath -CommandLine "npm install"
        Invoke-RepoCommand -WorkingDirectory $frontendPath -CommandLine "npx playwright install chromium"
    }

    if (Test-Path (Join-Path $backendPath "requirements.txt")) {
        $venvPath = Join-Path $backendPath ".venv"
        Invoke-RepoCommand -WorkingDirectory $backendPath -CommandLine "py -3.11 -m venv .venv"
        $pipPath = Join-Path $venvPath "Scripts\pip.exe"
        if (-not (Test-Path $pipPath)) {
            throw "Expected pip at '$pipPath' after creating the backend virtual environment."
        }
        Write-Step "Installing backend Python dependencies"
        & $pipPath install -r (Join-Path $backendPath "requirements.txt")
    }
}

function Ensure-OllamaModels {
    param([string[]]$Models)

    if (-not $Models -or -not $Models.Count) {
        return
    }

    foreach ($model in $Models) {
        if (-not $model) {
            continue
        }
        Write-Step "Pulling Ollama model $model"
        & ollama pull $model
    }
}

Assert-Administrator
Ensure-Chocolatey

Install-ChocoPackage -PackageName "git" -DisplayName "Git"
Install-ChocoPackage -PackageName "nodejs-lts" -DisplayName "Node.js LTS"
Install-ChocoPackage -PackageName "python311" -DisplayName "Python 3.11"
Install-ChocoPackage -PackageName "nssm" -DisplayName "NSSM"
Install-ChocoPackage -PackageName "7zip" -DisplayName "7-Zip"

if ($InstallDevelopmentTools) {
    Install-ChocoPackage -PackageName "vscode" -DisplayName "Visual Studio Code"
}

if ($InstallBrowser) {
    Install-ChocoPackage -PackageName "googlechrome" -DisplayName "Google Chrome"
}

if ($InstallReverseProxy) {
    Install-ChocoPackage -PackageName "caddy" -DisplayName "Caddy"
}

if ($InstallPostgreSql) {
    Install-ChocoPackage -PackageName "postgresql" -DisplayName "PostgreSQL"
}

Ensure-Ollama
Ensure-OllamaModels -Models $OllamaModels

Ensure-FirewallRule -Name "DER UniPro Frontend 3001" -Port 3001
Ensure-FirewallRule -Name "DER UniPro Backend 8000" -Port 8000
Ensure-FirewallRule -Name "Ollama 11434" -Port 11434

if ($InstallAppDependencies) {
    Install-AppDependencies -ProjectRoot $RepoPath
}

Write-Host ""
Write-Host "Bootstrap complete." -ForegroundColor Green
Write-Host "Repo path: $RepoPath"
Write-Host "Installed core packages: Git, Node.js LTS, Python 3.11, NSSM, 7-Zip, Ollama"
if ($InstallPostgreSql) {
    Write-Host "PostgreSQL was included."
}
if ($InstallAppDependencies) {
    Write-Host "App dependencies were installed for the repo."
}
Write-Host "Next step: copy the project to the server (if you have not already), then run the frontend/backend startup commands or wire them into Windows services."
