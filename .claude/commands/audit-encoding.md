Run the CP950 / encoding-trap audit on PowerShell scripts.

Detects external command stdout captures (`& ssh|docker|wp|scp|git|kubectl|helm|curl|wget`)
NOT protected by `Invoke-WithUtf8Console { ... }` or script-level `[Console]::OutputEncoding = UTF8`.

## Modes

- (no arg) → human-readable report on default scan paths (scripts/, lobster-factory/, mcp/)
- `--json` → machine-readable JSON (for CI / dashboards)
- `--file <path>` → single file audit (useful when Edit just touched one file)
- `--quiet` → suppress per-file OK lines; only show drift

## Procedure

### Default — full scan

```powershell
$repoRoot = (git rev-parse --show-toplevel 2>$null) -replace '/', '\'
if (-not $repoRoot) { $repoRoot = $PWD.Path }
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'scripts\audit-cp950-traps.ps1')
```

Exit codes:
- `0` — clean (no unprotected capture sites)
- `1` — drift (≥1 unprotected site found)
- `2` — error (invalid args / unreadable file)

### Single-file (use when investigating a specific recent Edit)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'scripts\audit-cp950-traps.ps1') -File <path>
```

### JSON for machine consumption

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'scripts\audit-cp950-traps.ps1') -Json
```

## When Claude should run this automatically

Per AGENTS.md `## 代理自動工具使用規則`:

| Trigger | Action |
|---------|--------|
| 任何 Edit/Write 動到 `.ps1` 檔包含 `& ssh\|docker\|wp\|scp\|git\|kubectl\|helm\|curl\|wget` capture pattern | 立即跑 `/audit-encoding --file <changed-file>` 檢查該檔合規 |
| 出現 `??` mojibake 或多 line 被吃換行的 CJK 輸出問題 | 跑 `/audit-encoding` 全掃定位來源 |
| AO-RESUME 七段式報告中發現未預期的非 ASCII 行為 | 同上 |
| 每月一次定期巡檢（手動觸發或排程）| `/audit-encoding`，將結果追加到 [agency-os/docs/operations/AUDIT_REGISTRY.md](../../agency-os/docs/operations/AUDIT_REGISTRY.md) |

## Fix template (when drift found)

For each unprotected site, wrap the external command capture:

```powershell
# At top of script (once per file):
. (Join-Path $PSScriptRoot '_console-encoding-helpers.ps1')

# At the capture site:
$out = Invoke-WithUtf8Console { & ssh @sshArgs 2>&1 }
# $LASTEXITCODE propagates correctly through the wrapper
```

If the file already uses script-level `[Console]::OutputEncoding = UTF8` set without restore
(legacy pattern in `backfill-missed-daily.ps1`, `print-open-tasks.ps1`, `print-today-closeout-recap.ps1`),
the audit tool treats it as Pattern B protected — no fix needed unless migrating for consistency.

## Notes

- SSOT script: [scripts/audit-cp950-traps.ps1](../../scripts/audit-cp950-traps.ps1)
- Helper: [scripts/_console-encoding-helpers.ps1](../../scripts/_console-encoding-helpers.ps1)
- Registry: [agency-os/docs/operations/AUDIT_REGISTRY.md](../../agency-os/docs/operations/AUDIT_REGISTRY.md)
- Rule: [agency-os/AGENTS.md](../../agency-os/AGENTS.md) §代理自動工具使用規則
- Origin event: 2026-05-22 backfill-missed-daily.ps1 ate newlines in mojibake'd git log output
  (commits `e807984` → `52e97d6`)
