# Windows Server Bootstrap

Use the PowerShell bootstrap script to install the core prerequisites for the DER UniPro Coaching Platform on a Windows Server 2019 VM.

## Script

- `scripts/install-windows-server-prereqs.ps1`
- `scripts/deploy-windows-server-beta.ps1`
- `scripts/setup-caddy-https.ps1`

## What it installs

Core installs:

- Git
- Node.js LTS
- Python 3.11
- NSSM
- 7-Zip
- Ollama

Optional installs:

- Visual Studio Code
- Google Chrome
- Caddy
- PostgreSQL

It also:

- pulls the requested Ollama models
- opens firewall ports `3001`, `8000`, and `11434`
- can install the app dependencies inside this repo

## Example usage

Install the prerequisites only:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows-server-prereqs.ps1
```

Install prerequisites plus developer tools and app dependencies:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows-server-prereqs.ps1 `
  -RepoPath "C:\Apps\DERUniproCoaching" `
  -InstallAppDependencies `
  -InstallDevelopmentTools `
  -InstallBrowser
```

Include PostgreSQL and Caddy too:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows-server-prereqs.ps1 `
  -RepoPath "C:\Apps\DERUniproCoaching" `
  -InstallAppDependencies `
  -InstallPostgreSql `
  -InstallReverseProxy
```

Use a custom Ollama model list:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows-server-prereqs.ps1 `
  -OllamaModels "gemma3:4b","gemma3:1b"
```

## Beta deployment

Once the prerequisites are installed and the repo has been copied onto the server, use the deployment script to:

- copy the app into the live install folder
- create/update the backend virtual environment
- install backend/frontend dependencies
- build the frontend
- install the frontend/backend as Windows services with NSSM
- create desktop shortcuts to start and stop the platform

Basic example:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows-server-beta.ps1 `
  -InstallPath "C:\Apps\DERUniproAnalyserSoftware"
```

If you have already copied the project files into `C:\Apps\DERUniproAnalyserSoftware`, that is enough. The script now deploys in place by default and will skip the file copy automatically when `SourcePath` and `InstallPath` are the same.

Enable HTTPS for `coaching.daveedwardsracing.co.uk` during deployment:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows-server-beta.ps1 `
  -EnableHttps `
  -DomainName "coaching.daveedwardsracing.co.uk" `
  -TlsEmail "admin@daveedwardsracing.co.uk"
```

Preserve an existing live database while redeploying code:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows-server-beta.ps1 `
  -SourcePath "C:\Users\dave.edwards\OneDrive - EHS Data Ltd\Documents\DERUniproAnalyserSoftware" `
  -InstallPath "C:\Apps\DERUniproAnalyserSoftware" `
  -PreserveExistingDatabase
```

Skip dependency installs if the server copy is already warmed:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows-server-beta.ps1 `
  -SourcePath "C:\Users\dave.edwards\OneDrive - EHS Data Ltd\Documents\DERUniproAnalyserSoftware" `
  -InstallPath "C:\Apps\DERUniproAnalyserSoftware" `
  -SkipNpmInstall `
  -SkipPipInstall `
  -SkipPlaywrightInstall
```

## Standalone Caddy HTTPS setup

If the frontend/backend services are already running and you only want to add HTTPS later:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-caddy-https.ps1 `
  -DomainName "coaching.daveedwardsracing.co.uk" `
  -UpstreamHost "127.0.0.1" `
  -UpstreamPort 3001 `
  -TlsEmail "admin@daveedwardsracing.co.uk" `
  -InstallPath "C:\Apps\DERUniproAnalyserSoftware"
```

This script:

- writes a Caddyfile for the domain
- opens firewall ports `80` and `443`
- installs a `DERTelemetryCaddy` Windows service via NSSM
- starts Caddy and serves the app on HTTPS

## Notes

- Run the script from an elevated PowerShell window.
- The script currently uses Chocolatey for most packages and Ollama's official Windows install script for Ollama itself.
- This is a bootstrap/install script, not yet a full one-click production installer.
