[CmdletBinding()]
param(
    [string]$DomainName = "coaching.daveedwardsracing.co.uk",
    [string]$UpstreamHost = "127.0.0.1",
    [int]$UpstreamPort = 3001,
    [string]$TlsEmail = "admin@daveedwardsracing.co.uk",
    [string]$InstallPath = "C:\Apps\DERUniproAnalyserSoftware",
    [string]$CaddyServiceName = "DERTelemetryCaddy"
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

function Resolve-NssmPath {
    $command = Get-Command nssm -ErrorAction SilentlyContinue
    if ($command) {
        return [string]$command.Source
    }

    $commonPaths = @(
        "C:\ProgramData\chocolatey\bin\nssm.exe",
        "C:\Tools\nssm\win64\nssm.exe",
        "C:\Tools\nssm\win32\nssm.exe"
    )
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            return $path
        }
    }

    throw "NSSM was not found. Install the prerequisites first so nssm.exe is available."
}

function Resolve-CaddyPath {
    $command = Get-Command caddy -ErrorAction SilentlyContinue
    if ($command) {
        return [string]$command.Source
    }

    $commonPaths = @(
        "C:\ProgramData\chocolatey\bin\caddy.exe",
        "C:\Program Files\Caddy\caddy.exe"
    )
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            return $path
        }
    }

    throw "Caddy was not found. Install it first, or rerun the prerequisites script with -InstallReverseProxy."
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
    New-NetFirewallRule -DisplayName $Name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null
}

function Remove-ServiceIfExists {
    param(
        [Parameter(Mandatory = $true)][string]$ServiceName,
        [Parameter(Mandatory = $true)][string]$NssmPath
    )

    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $service) {
        return
    }

    Write-Step "Replacing existing service $ServiceName"
    try {
        if ($service.Status -ne "Stopped") {
            & $NssmPath stop $ServiceName | Out-Null
            Start-Sleep -Seconds 2
        }
    }
    catch {
    }
    & $NssmPath remove $ServiceName confirm | Out-Null
    Start-Sleep -Seconds 1
}

function Install-NssmService {
    param(
        [Parameter(Mandatory = $true)][string]$NssmPath,
        [Parameter(Mandatory = $true)][string]$ServiceName,
        [Parameter(Mandatory = $true)][string]$ApplicationPath,
        [Parameter(Mandatory = $true)][string]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$StdoutLog,
        [Parameter(Mandatory = $true)][string]$StderrLog
    )

    Remove-ServiceIfExists -ServiceName $ServiceName -NssmPath $NssmPath

    Write-Step "Installing service $ServiceName"
    & $NssmPath install $ServiceName $ApplicationPath $Arguments | Out-Null
    & $NssmPath set $ServiceName AppDirectory $WorkingDirectory | Out-Null
    & $NssmPath set $ServiceName AppStdout $StdoutLog | Out-Null
    & $NssmPath set $ServiceName AppStderr $StderrLog | Out-Null
    & $NssmPath set $ServiceName AppRotateFiles 1 | Out-Null
    & $NssmPath set $ServiceName AppRotateOnline 1 | Out-Null
    & $NssmPath set $ServiceName Start SERVICE_AUTO_START | Out-Null
}

Assert-Administrator

$nssmPath = Resolve-NssmPath
$caddyPath = Resolve-CaddyPath
$caddyDir = Join-Path $InstallPath "caddy"
$logsDir = Join-Path $InstallPath "logs"
$caddyfilePath = Join-Path $caddyDir "Caddyfile"

New-Item -ItemType Directory -Path $caddyDir -Force | Out-Null
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

$caddyfile = @"
{
    email $TlsEmail
}

$DomainName {
    encode gzip zstd

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "geolocation=(), microphone=(), camera=()"
    }

    reverse_proxy $UpstreamHost`:$UpstreamPort
}
"@

[System.IO.File]::WriteAllText($caddyfilePath, $caddyfile, [System.Text.Encoding]::ASCII)

Ensure-FirewallRule -Name "DER Telemetry HTTP 80" -Port 80
Ensure-FirewallRule -Name "DER Telemetry HTTPS 443" -Port 443

Install-NssmService `
    -NssmPath $nssmPath `
    -ServiceName $CaddyServiceName `
    -ApplicationPath $caddyPath `
    -Arguments "run --config `"$caddyfilePath`" --adapter caddyfile" `
    -WorkingDirectory $caddyDir `
    -StdoutLog (Join-Path $logsDir "caddy-stdout.log") `
    -StderrLog (Join-Path $logsDir "caddy-stderr.log")

Write-Step "Starting Caddy HTTPS service"
Start-Service -Name $CaddyServiceName

Write-Host ""
Write-Host "Caddy HTTPS setup complete." -ForegroundColor Green
Write-Host "Domain: https://$DomainName"
Write-Host "Caddyfile: $caddyfilePath"
Write-Host "Service: $CaddyServiceName"
