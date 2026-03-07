param(
  [string]$MongoUri = $env:MONGO_URI,
  [Parameter(Mandatory = $true)][string]$BackupPath,
  [string]$DbName = "smart_event_system",
  [switch]$Drop
)

if (-not $MongoUri) {
  Write-Error "MONGO_URI is missing. Pass -MongoUri or set env var."
  exit 1
}

if (-not (Test-Path $BackupPath)) {
  Write-Error "BackupPath does not exist: $BackupPath"
  exit 1
}

$dropArg = ""
if ($Drop) { $dropArg = "--drop" }

Write-Host "Running mongorestore from $BackupPath"
mongorestore --uri="$MongoUri" --nsInclude="$DbName.*" $dropArg "$BackupPath"
if ($LASTEXITCODE -ne 0) {
  Write-Error "mongorestore failed"
  exit $LASTEXITCODE
}

Write-Host "Restore completed"
