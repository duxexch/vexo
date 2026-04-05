param(
    [string]$Domain = "vixo.click",
    [string]$IpAddress = "127.0.0.1"
)

$ErrorActionPreference = "Stop"

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    if (-not $isAdmin) {
        throw "Run this script in an elevated PowerShell window (Run as administrator)."
    }
}

Assert-Administrator

$hostsPath = Join-Path $env:WINDIR "System32\\drivers\\etc\\hosts"
if (-not (Test-Path $hostsPath)) {
    throw "Hosts file not found at: $hostsPath"
}

$rawHosts = Get-Content $hostsPath -ErrorAction Stop
$filteredHosts = $rawHosts | Where-Object {
    $_ -notmatch "(^|\s)vixo\.click(\s|$)" -and $_ -notmatch "(^|\s)www\.vixo\.click(\s|$)"
}

$newEntries = @(
    "$IpAddress $Domain",
    "$IpAddress www.$Domain"
)

$updatedHosts = @()
$updatedHosts += $filteredHosts
if ($updatedHosts.Count -gt 0 -and $updatedHosts[-1] -ne "") {
    $updatedHosts += ""
}
$updatedHosts += "# Local VIXO domain mapping"
$updatedHosts += $newEntries

Set-Content -Path $hostsPath -Value $updatedHosts -Encoding ASCII -ErrorAction Stop

Write-Success "Mapped $Domain and www.$Domain to $IpAddress in hosts file."
Write-Info "You can now open: http://$Domain:3001"
