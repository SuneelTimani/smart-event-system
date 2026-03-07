# MongoDB Atlas Backup/Restore

This project includes PowerShell scripts for manual backup and restore.

## Prerequisites
- MongoDB Database Tools installed (`mongodump`, `mongorestore` available in PATH)
- `MONGO_URI` set in environment or passed as parameter

## Backup
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\atlas-backup.ps1 -DbName "smart_event_system"
```

Optional:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\atlas-backup.ps1 -OutDir "backups" -DbName "smart_event_system"
```

## Restore
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\atlas-restore.ps1 -BackupPath "backups\20260218-210000\smart_event_system" -DbName "smart_event_system"
```

To replace existing documents:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\atlas-restore.ps1 -BackupPath "backups\20260218-210000\smart_event_system" -DbName "smart_event_system" -Drop
```
