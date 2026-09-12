param([switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not [Environment]::Is64BitOperatingSystem) { throw 'Agent Spaces Browser requires 64-bit Windows.' }

function Refresh-TaskPath {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Install-Prerequisite([string]$Id, [string]$Label) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "Install $Label (see README.md), reopen PowerShell, and run setup.ps1 again."
    }
    Write-Host "Installing $Label with Windows Package Manager. Its installer may ask for permission."
    & winget install --exact --id $Id --source winget --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) { throw "$Label installation did not finish. Complete it, then run setup.ps1 again." }
    Refresh-TaskPath
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Install-Prerequisite 'OpenJS.NodeJS.LTS' 'Node.js LTS' }
$nodeMajor = [int](& node -p 'process.versions.node.split(".")[0]')
if ($nodeMajor -lt 22) { throw 'Upgrade Node.js to version 22 or later, then rerun setup.ps1.' }

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { Install-Prerequisite 'Microsoft.DotNet.SDK.8' '.NET 8 SDK' }
$sdkList = & dotnet --list-sdks
if (-not ($sdkList -match '^8\.')) { Install-Prerequisite 'Microsoft.DotNet.SDK.8' '.NET 8 SDK' }

Write-Host 'Installing locked application dependencies...'
& npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. See the error above.' }
Write-Host 'Building the embedded WebView2 browser host...'
& npm.cmd run build:webview2
if ($LASTEXITCODE -ne 0) { throw 'WebView2 build failed. See the error above.' }
& '.\app\webview2-host\publish\AgentSpaces.WebViewHost.exe' --check-runtime
if ($LASTEXITCODE -ne 0) { Install-Prerequisite 'Microsoft.EdgeWebView2Runtime' 'Microsoft Edge WebView2 Evergreen runtime' }

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    Write-Host 'Installing the official Codex CLI for connector registration...'
    & npm.cmd install -g @openai/codex
    if ($LASTEXITCODE -ne 0) { throw 'Codex CLI installation failed. See README.md.' }
    Refresh-TaskPath
}
Write-Host 'Setup complete. Sign in to Codex if needed, then restart Codex after AS connects.'
Write-Host 'If WebView2 reports a missing browser runtime, install Microsoft Edge WebView2 Evergreen from the link in README.md.'
if (-not $NoLaunch) { & npm.cmd start }
