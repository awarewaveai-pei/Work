---
name: audit-cross-machine-bom
description: Audit UTF-8 BOM compliance on every .md file that crosses Google Drive sync, and optionally repair the drift in bulk.
---

Audit UTF-8 BOM compliance on all `.md` files that cross Google Drive sync. Reports drift; can backfill with `-Fix`.

Why this matters: PowerShell on Windows (Big5 locale) misreads UTF-8 `.md` files without BOM as Big5, garbling CJK on cross-machine sync. The export/import scripts now enforce BOM at the boundary, but drift can still appear (manual edits via VSCode that strip BOM, files imported before the BOM rule existed, etc.).

Scope (per `agency-os/AGENTS.md` §8 編碼):
- `~/.claude/projects/<key>/memory/MEMORY.md`
- `~/.claude/projects/<key>/memory/*.md`
- `$env:AO_SYNC_SECRETS_ROOT\AWARE_WAVE_CREDENTIALS.md` (if Drive mounted)

## Default — report only

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\audit-cross-machine-bom.ps1
```

Output includes:
- total `.md` scanned
- count with BOM (green if all)
- count missing BOM (red if > 0)
- explicit list of files missing BOM

Exit code: `0` clean, `1` drift found, `2` setup error (memory dir missing).

## Fix mode — backfill BOM

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\audit-cross-machine-bom.ps1 -Fix
```

For each missing-BOM file:
1. Copy original to `<memory>/.bom-backfill-backup-<timestamp>/<filename>`
2. Read content as UTF-8, write back with BOM
3. Verify BOM exists post-write

Vault file backup goes alongside the vault file (different dir), with suffix `.pre-bom-<timestamp>`.

## Cross-machine override

On the desktop machine the project key differs (e.g. `c--Users-USER-Work`):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\audit-cross-machine-bom.ps1 -ProjectKey c--Users-USER-Work
```

## When to run

- After AO-RESUME / AO-CLOSE if "memory/*.md unchanged" reports look suspicious
- Before importing a memory `.md` from another source (e.g. manual paste)
- As part of weekly system review
- After any incident involving cross-machine `.md` garbling

## What this skill does NOT do

- It does not normalise BOM on `.md` files inside the repo (those go via git, preserve bytes, don't need BOM).
- It does not touch files under `.bom-backfill-backup-*` (those are intentionally raw history).
- It does not push to Google Drive — boundary enforcement is in `scripts/{export,import}-cross-machine-memory.ps1`.

Reference: `agency-os/WORKLOG.md` 2026-05-22 entry "跨機 .md UTF-8 BOM 一勞永逸"; the BOM helpers `Copy-MdWithUtf8Bom` / `Set-Utf8BomOnFile` in the sync scripts.
