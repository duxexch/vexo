param(
    [string]$Namespace = "vex-prod",
    [string]$WorkerNode = "desktop-worker",
    [switch]$SkipImageBuild
)

$ErrorActionPreference = "Stop"

function Assert-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

Assert-Command "docker"
Assert-Command "kubectl"

if (-not (Test-Path ".env")) {
    throw "Missing .env file in workspace root."
}

if (-not (Test-Path "k8s/vex-production.yaml")) {
    throw "Missing k8s/vex-production.yaml"
}

Write-Host "[1/8] Checking Docker Desktop Kubernetes status..."
docker desktop kubernetes status | Out-Host

Write-Host "[2/8] Ensuring kubectl context..."
$contexts = kubectl config get-contexts -o name 2>$null
if (-not ($contexts -contains "docker-desktop")) {
    throw "docker-desktop context not found. Ensure Docker Desktop Kubernetes is enabled first."
}
kubectl config use-context docker-desktop | Out-Host

Write-Host "[3/8] Waiting for nodes to be Ready..."
kubectl wait --for=condition=Ready node --all --timeout=300s | Out-Host
kubectl get nodes | Out-Host

Write-Host "[4/8] Creating namespace and secrets from .env..."
kubectl create namespace $Namespace --dry-run=client -o yaml | kubectl apply -f - | Out-Host
kubectl -n $Namespace create secret generic vex-secrets --from-env-file=.env --dry-run=client -o yaml | kubectl apply -f - | Out-Host

if (-not $SkipImageBuild) {
    Write-Host "[5/8] Building production images..."
    docker build -t vixo-app:k8s . | Out-Host
    docker build -t vixo-ai-agent:k8s ./ai-service | Out-Host
}

Write-Host "[6/8] Syncing local images with Kubernetes runtime..."
$nodeContainer = docker ps --format "{{.Names}}" |
Where-Object { $_ -eq $WorkerNode -or $_ -like "*$WorkerNode" } |
Select-Object -First 1

if ($nodeContainer) {
    Write-Host "Found node container '$nodeContainer'. Importing images via ctr..."
    docker save vixo-app:k8s | docker exec -i $nodeContainer ctr -n=k8s.io images import - | Out-Host
    docker save vixo-ai-agent:k8s | docker exec -i $nodeContainer ctr -n=k8s.io images import - | Out-Host
}
else {
    Write-Host "No directly-addressable node container found. Skipping ctr import and relying on Docker Desktop shared image store."
}

Write-Host "[7/8] Applying Kubernetes production manifests..."
kubectl apply -f k8s/vex-production.yaml | Out-Host

Write-Host "[8/8] Waiting for rollouts..."
kubectl -n $Namespace rollout status statefulset/vex-db --timeout=600s | Out-Host
kubectl -n $Namespace rollout status statefulset/vex-redis --timeout=600s | Out-Host
kubectl -n $Namespace rollout status statefulset/vex-minio --timeout=600s | Out-Host
kubectl -n $Namespace rollout status deployment/vex-ai-agent --timeout=600s | Out-Host
kubectl -n $Namespace rollout status deployment/vex-app --timeout=900s | Out-Host

kubectl -n $Namespace get pods -o wide | Out-Host
kubectl -n $Namespace get svc | Out-Host

Write-Host "Deployment completed."
Write-Host "Try: curl.exe -s -o NUL -w \"% { http_code }\" http://localhost:30081/api/health"
