param(
  [string]$MongoUri = $env:MONGO_URI,
  [string]$OutDir = "backups",
  [string]$DbName = "smart_event_system"
)

if (-not $MongoUri) {
  Write-Error "MONGO_URI is missing. Pass -MongoUri or set env var."
  exit 1
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $OutDir $timestamp
New-Item -ItemType Directory -Force -Path $target | Out-Null

Write-Host "Running mongodump -> $target"
mongodump --uri="$MongoUri" --db="$DbName" --out="$target"
if ($LASTEXITCODE -ne 0) {
  Write-Error "mongodump failed"
  exit $LASTEXITCODE
}

Write-Host "Backup completed at $target"
