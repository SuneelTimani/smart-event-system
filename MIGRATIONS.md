# One-Time Migrations

This project includes a one-time migration runner with persistent logs.

## Run all pending migrations
```powershell
npm run migrate:once -- --adminEmail=suneeltimani@gmail.com
```

## Force re-run already executed migrations
```powershell
npm run migrate:once -- --adminEmail=suneeltimani@gmail.com --force
```

## What it does now
- `001_backfill_createdBy`
  - Backfills `Event.createdBy` for legacy events where owner is missing.
  - Assigns ownership to the admin email you pass with `--adminEmail`.

## Logging
- Console logs are JSON lines.
- File logs are written to:
  - `scripts/logs/migration-<timestamp>.log`
- Execution state is saved in MongoDB collection:
  - `migrations`
