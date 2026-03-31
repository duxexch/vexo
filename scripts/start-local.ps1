param(
    [ValidateSet("dev", "prod")]
    [string]$Mode = "dev",

    [switch]$SkipInfra,

    [switch]$Build
)

$ErrorActionPreference = "Stop"

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-WarnMsg {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Import-EnvFile {
    param([string]$FilePath)

    if (-not (Test-Path $FilePath)) {
        throw "Environment file not found: $FilePath"
    }

    Get-Content $FilePath | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) {
            return
        }

        $separator = $line.IndexOf("=")
        if ($separator -lt 1) {
            return
        }

        $name = $line.Substring(0, $separator).Trim()
        $value = $line.Substring($separator + 1)
        [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

function Ensure-LocalInfra {
    param([string]$SelectedMode, [string]$EnvFilePath)

    if ($SkipInfra) {
        Write-WarnMsg "Skipping infrastructure startup because -SkipInfra was provided."
        return
    }

    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-WarnMsg "Docker is not installed or not available in PATH. Skipping infra startup."
        return
    }

    Write-Info "Starting local database and Redis containers (if available)."
    try {
        docker start vex-local-db vex-local-redis *> $null
    }
    catch {
        Write-WarnMsg "Could not start vex-local-db/vex-local-redis directly. Ensure DB and Redis are running on localhost ports."
    }

    Write-Info "Ensuring MinIO is running with the selected environment profile."
    try {
        docker compose -f docker-compose.prod.yml --env-file $EnvFilePath up -d minio | Out-Null
    }
    catch {
        Write-WarnMsg "Failed to start MinIO via docker compose. Verify Docker Compose and $EnvFilePath values."
    }

    if ($SelectedMode -eq "prod") {
        Write-Info "Production mode selected: expecting app to use localhost:3001 and MinIO localhost:9010."
    }
    else {
        Write-Info "Development mode selected: expecting app to use localhost:3001 and MinIO localhost:9010."
    }
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

$envFile = if ($Mode -eq "prod") { ".env.production.local" } else { ".env" }

Write-Info "Loading environment from $envFile"
Import-EnvFile -FilePath $envFile

Ensure-LocalInfra -SelectedMode $Mode -EnvFilePath $envFile

if ($Mode -eq "prod") {
    if ($Build -or -not (Test-Path "dist/index.cjs")) {
        Write-Info "Building production bundle..."
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "Build failed with exit code $LASTEXITCODE"
        }
    }

    Write-Info "Starting production server from dist/index.cjs"
    node dist/index.cjs
    exit $LASTEXITCODE
}

Write-Info "Starting development server with tsx"
npx tsx server/index.ts
exit $LASTEXITCODE
