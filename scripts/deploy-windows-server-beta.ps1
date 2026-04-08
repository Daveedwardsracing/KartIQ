[CmdletBinding()]
param(
    [string]$SourcePath = "C:\Apps\DERUniproAnalyserSoftware",
    [string]$InstallPath = "C:\Apps\DERUniproAnalyserSoftware",
    [string]$FrontendServiceName = "DERTelemetryFrontend",
    [string]$BackendServiceName = "DERTelemetryBackend",
    [string]$CaddyServiceName = "DERTelemetryCaddy",
    [string]$FrontendHost = "0.0.0.0",
    [int]$FrontendPort = 3001,
    [string]$BackendHost = "127.0.0.1",
    [int]$BackendPort = 8000,
    [switch]$EnableHttps,
    [string]$DomainName = "coaching.daveedwardsracing.co.uk",
    [string]$TlsEmail = "admin@daveedwardsracing.co.uk",
    [switch]$PreserveExistingDatabase,
    [switch]$SkipNpmInstall,
    [switch]$SkipPipInstall,
    [switch]$SkipPlaywrightInstall,
    [switch]$DoNotStartServices
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
        return $command.Source
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

function Resolve-ExecutablePath {
    param([Parameter(Mandatory = $true)][string]$Name)

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    throw "Required executable '$Name' was not found on PATH."
}

function Invoke-PowerShellScript {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [string[]]$ArgumentList = @()
    )

    $powershellExe = Join-Path $PSHOME "powershell.exe"
    $allArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ScriptPath) + $ArgumentList
    Invoke-Checked -FilePath $powershellExe -ArgumentList $allArgs
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

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [string]$WorkingDirectory = ""
    )

    if ($WorkingDirectory) {
        Push-Location $WorkingDirectory
    }

    try {
        $previousNativeErrorPreference = $null
        if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -Scope Global -ErrorAction SilentlyContinue) {
            $previousNativeErrorPreference = $Global:PSNativeCommandUseErrorActionPreference
            $Global:PSNativeCommandUseErrorActionPreference = $false
        }
        & $FilePath @ArgumentList
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($ArgumentList -join ' ')"
        }
    }
    finally {
        if ($null -ne $previousNativeErrorPreference) {
            $Global:PSNativeCommandUseErrorActionPreference = $previousNativeErrorPreference
        }
        if ($WorkingDirectory) {
            Pop-Location
        }
    }
}

function Copy-ProjectTree {
    param(
        [Parameter(Mandatory = $true)][string]$From,
        [Parameter(Mandatory = $true)][string]$To,
        [switch]$PreserveDatabase
    )

    if (-not (Test-Path $From)) {
        throw "Source path '$From' was not found."
    }

    $resolvedFrom = [System.IO.Path]::GetFullPath($From)
    $resolvedTo = [System.IO.Path]::GetFullPath($To)
    if ($resolvedFrom.TrimEnd('\') -ieq $resolvedTo.TrimEnd('\')) {
        Write-Step "Source and install paths are the same. Skipping file copy and deploying in place."
        return
    }

    New-Item -ItemType Directory -Path $To -Force | Out-Null

    $robocopyArgs = @(
        $From,
        $To,
        "/MIR",
        "/XD", ".git", "frontend\node_modules", "frontend\.next", "backend\.venv", "backups"
    )

    if ($PreserveDatabase -and (Test-Path (Join-Path $To "backend\data\app.db"))) {
        $robocopyArgs += @("/XF", "backend\data\app.db")
    }

    Write-Step "Copying project files into $To"
    & robocopy @robocopyArgs | Out-Null
    $exitCode = $LASTEXITCODE
    if ($exitCode -gt 7) {
        throw "Robocopy failed with exit code $exitCode."
    }
}

function Ensure-BackendVenv {
    param([string]$ProjectRoot)

    $backendPath = Join-Path $ProjectRoot "backend"
    $venvRoot = Join-Path $backendPath ".venv"
    $venvPython = Join-Path $backendPath ".venv\Scripts\python.exe"
    $pipPath = Join-Path $backendPath ".venv\Scripts\pip.exe"
    $pyPath = Get-Command py -ErrorAction SilentlyContinue
    $python311Path = Get-Command python -ErrorAction SilentlyContinue

    function New-BackendVenv {
        if (Test-Path $venvRoot) {
            Write-Step "Removing copied/invalid backend virtual environment"
            Remove-Item -LiteralPath $venvRoot -Recurse -Force
        }

        Write-Step "Creating backend virtual environment"
        if ($pyPath) {
            Invoke-Checked -FilePath $pyPath.Source -ArgumentList @("-3.11", "-m", "venv", ".venv") -WorkingDirectory $backendPath | Out-Host
        }
        elseif ($python311Path) {
            Invoke-Checked -FilePath $python311Path.Source -ArgumentList @("-m", "venv", ".venv") -WorkingDirectory $backendPath | Out-Host
        }
        else {
            throw "Python 3.11 was not found. Install the prerequisites first so the backend virtual environment can be created."
        }
    }

    if (-not (Test-Path $venvPython)) {
        New-BackendVenv
    }
    else {
        try {
            Invoke-Checked -FilePath $venvPython -ArgumentList @("-c", "print('venv ok')") -WorkingDirectory $backendPath | Out-Null
        }
        catch {
            New-BackendVenv
        }
    }

    if (-not (Test-Path $venvPython)) {
        throw "Backend virtual environment was not created successfully. Expected Python at '$venvPython'."
    }

    if (-not (Test-Path $pipPath)) {
        Write-Step "Bootstrapping pip inside the backend virtual environment"
        Invoke-Checked -FilePath $venvPython -ArgumentList @("-m", "ensurepip", "--upgrade") -WorkingDirectory $backendPath | Out-Host
    }

    if (-not (Test-Path $pipPath)) {
        throw "pip was not created in the backend virtual environment. Expected pip at '$pipPath'."
    }

    if (-not $SkipPipInstall) {
        Write-Step "Installing backend Python dependencies"
        Invoke-Checked -FilePath $venvPython -ArgumentList @("-m", "pip", "install", "-r", "requirements.txt") -WorkingDirectory $backendPath | Out-Host
    }

    return [string]$venvPython
}

function Ensure-FrontendBuild {
    param([string]$ProjectRoot)

    $frontendPath = Join-Path $ProjectRoot "frontend"

    if (-not $SkipNpmInstall) {
        Write-Step "Installing frontend dependencies"
        Invoke-Checked -FilePath "npm.cmd" -ArgumentList @("install") -WorkingDirectory $frontendPath
    }

    if (-not $SkipPlaywrightInstall) {
        Write-Step "Installing Playwright Chromium runtime"
        Invoke-Checked -FilePath "npx.cmd" -ArgumentList @("playwright", "install", "chromium") -WorkingDirectory $frontendPath
    }

    Write-Step "Building frontend for production"
    Invoke-Checked -FilePath "npm.cmd" -ArgumentList @("run", "build") -WorkingDirectory $frontendPath
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

function New-ShortcutFile {
    param(
        [Parameter(Mandatory = $true)][string]$ShortcutPath,
        [Parameter(Mandatory = $true)][string]$TargetPath,
        [Parameter(Mandatory = $true)][string]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [string]$Description = ""
    )

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = $TargetPath
    $shortcut.Arguments = $Arguments
    $shortcut.WorkingDirectory = $WorkingDirectory
    if ($Description) {
        $shortcut.Description = $Description
    }
    $shortcut.Save()
}

function Write-TextFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $directory = Split-Path -Parent $Path
    if ($directory) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.Encoding]::ASCII)
}

Assert-Administrator

$sourceRoot = (Resolve-Path $SourcePath).Path
$targetRoot = $InstallPath
$logsPath = Join-Path $targetRoot "logs"
$supportScriptsPath = Join-Path $targetRoot "support"
$desktopPath = [Environment]::GetFolderPath("Desktop")
$nssmPath = Resolve-NssmPath
$npmPath = Resolve-ExecutablePath -Name "npm.cmd"
$powershellPath = Join-Path $PSHOME "powershell.exe"
$httpsScriptPath = Join-Path $targetRoot "scripts\setup-caddy-https.ps1"

Copy-ProjectTree -From $sourceRoot -To $targetRoot -PreserveDatabase:$PreserveExistingDatabase
New-Item -ItemType Directory -Path $logsPath -Force | Out-Null
New-Item -ItemType Directory -Path $supportScriptsPath -Force | Out-Null

$pythonPath = Ensure-BackendVenv -ProjectRoot $targetRoot
Ensure-FrontendBuild -ProjectRoot $targetRoot

Ensure-FirewallRule -Name "DER Telemetry Frontend $FrontendPort" -Port $FrontendPort
Ensure-FirewallRule -Name "DER Telemetry Backend $BackendPort" -Port $BackendPort
Ensure-FirewallRule -Name "Ollama 11434" -Port 11434

$backendArgs = "-m uvicorn backend.app.main:app --host $BackendHost --port $BackendPort"
$frontendArgs = "run start -- --hostname $FrontendHost --port $FrontendPort"

Install-NssmService `
    -NssmPath $nssmPath `
    -ServiceName $BackendServiceName `
    -ApplicationPath $pythonPath `
    -Arguments $backendArgs `
    -WorkingDirectory $targetRoot `
    -StdoutLog (Join-Path $logsPath "backend-stdout.log") `
    -StderrLog (Join-Path $logsPath "backend-stderr.log")

Install-NssmService `
    -NssmPath $nssmPath `
    -ServiceName $FrontendServiceName `
    -ApplicationPath $npmPath `
    -Arguments $frontendArgs `
    -WorkingDirectory (Join-Path $targetRoot "frontend") `
    -StdoutLog (Join-Path $logsPath "frontend-stdout.log") `
    -StderrLog (Join-Path $logsPath "frontend-stderr.log")

$startScriptPath = Join-Path $supportScriptsPath "start-der-telemetry.ps1"
$stopScriptPath = Join-Path $supportScriptsPath "stop-der-telemetry.ps1"

$startScript = @"
Set-StrictMode -Version Latest
\$ErrorActionPreference = 'Stop'
Start-Service -Name '$BackendServiceName'
Start-Service -Name '$FrontendServiceName'
Write-Host 'DER Telemetry services started.' -ForegroundColor Green
"@

$stopScript = @"
Set-StrictMode -Version Latest
\$ErrorActionPreference = 'Stop'
Stop-Service -Name '$FrontendServiceName' -Force
Stop-Service -Name '$BackendServiceName' -Force
Write-Host 'DER Telemetry services stopped.' -ForegroundColor Yellow
"@

Write-TextFile -Path $startScriptPath -Content $startScript
Write-TextFile -Path $stopScriptPath -Content $stopScript

New-ShortcutFile `
    -ShortcutPath (Join-Path $desktopPath "Start DER Telemetry.lnk") `
    -TargetPath $powershellPath `
    -Arguments "-ExecutionPolicy Bypass -File `"$startScriptPath`"" `
    -WorkingDirectory $targetRoot `
    -Description "Start DER Telemetry frontend and backend services"

New-ShortcutFile `
    -ShortcutPath (Join-Path $desktopPath "Stop DER Telemetry.lnk") `
    -TargetPath $powershellPath `
    -Arguments "-ExecutionPolicy Bypass -File `"$stopScriptPath`"" `
    -WorkingDirectory $targetRoot `
    -Description "Stop DER Telemetry frontend and backend services"

if (-not $DoNotStartServices) {
    Write-Step "Starting DER Telemetry services"
    Start-Service -Name $BackendServiceName
    Start-Sleep -Seconds 2
    Start-Service -Name $FrontendServiceName
}

$frontendUrl = "http://$env:COMPUTERNAME:$FrontendPort"

if ($EnableHttps) {
    Invoke-PowerShellScript -ScriptPath $httpsScriptPath -ArgumentList @(
        "-DomainName", $DomainName,
        "-UpstreamHost", "127.0.0.1",
        "-UpstreamPort", [string]$FrontendPort,
        "-TlsEmail", $TlsEmail,
        "-InstallPath", $targetRoot,
        "-CaddyServiceName", $CaddyServiceName
    )
    $frontendUrl = "https://$DomainName"
}

Write-Host ""
Write-Host "Deployment complete." -ForegroundColor Green
Write-Host "Install path: $targetRoot"
Write-Host "Backend service: $BackendServiceName"
Write-Host "Frontend service: $FrontendServiceName"
Write-Host "Desktop shortcuts created:"
Write-Host " - $(Join-Path $desktopPath 'Start DER Telemetry.lnk')"
Write-Host " - $(Join-Path $desktopPath 'Stop DER Telemetry.lnk')"
if ($EnableHttps) {
    Write-Host "HTTPS service: $CaddyServiceName"
}
Write-Host "Frontend URL: $frontendUrl"
Write-Host "Logs: $logsPath"
