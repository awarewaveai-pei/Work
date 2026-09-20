---
name: audit-encoding
description: Run the CP950 / encoding-trap audit over the PowerShell scripts. Trigger on encoding, 亂碼, mojibake, CP950.
---

Run the CP950 / encoding-trap audit on PowerShell scripts.

Detects THREE independent CP950-trap shapes:
1. External command stdout captures (`& ssh|docker|wp|scp|git|kubectl|helm|curl|wget`)
   NOT protected by `Invoke-WithUtf8Console { ... }` or script-level `[Console]::OutputEncoding = UTF8`.
2. BOM-less non-ASCII `.ps1` source that fails to parse when decoded as CP950 (the script cannot
   run at all).
3. `Get-Content -Raw` calls without `-Encoding` — a data-file read that silently mis-decodes CJK
   content under CP950, IRREVERSIBLY for unmappable byte sequences (root cause of the
   2026-08-29 codex-oracle.ps1 incident, 29 corrupted artifacts, commit `fe87cf05`).

## Modes

- (no arg) → human-readable report on default scan paths (scripts/, lobster-factory/, mcp/), all three classes
- `--json` → machine-readable JSON (for CI / dashboards)
- `--file <path>` → single file audit (useful when Edit just touched one file)
- `--quiet` → suppress per-file OK lines; only show drift
- `--parse-break-only` → gate mode, class 2 ONLY (`-ParseBreakOnly`)
- `--raw-read-only` → gate mode, class 3 ONLY (`-RawReadOnly`); mutually exclusive with `--parse-break-only`

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

### Gate modes (used by system-health-check.ps1's hard AO-CLOSE checks 7b/7c)

```powershell
# class 2 only (parse-break)
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'scripts\audit-cp950-traps.ps1') -ParseBreakOnly -Quiet

# class 3 only (unencoded-raw-read)
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'scripts\audit-cp950-traps.ps1') -RawReadOnly -Quiet
```

## When Claude should run this automatically

Per AGENTS.md `## 代理自動工具使用規則`:

| Trigger | Action |
|---------|--------|
| 任何 Edit/Write 動到 `.ps1` 檔包含 `& ssh\|docker\|wp\|scp\|git\|kubectl\|helm\|curl\|wget` capture pattern | 立即跑 `/audit-encoding --file <changed-file>` 檢查該檔合規 |
| 出現 `??` mojibake 或多 line 被吃換行的 CJK 輸出問題 | 跑 `/audit-encoding` 全掃定位來源 |
| AO-RESUME 報告中發現未預期的非 ASCII 行為 | 同上 |
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

For class 3 (unencoded-raw-read), fix is always the same — add `-Encoding UTF8`:

```powershell
Get-Content -LiteralPath <path> -Raw -Encoding UTF8
```

For `Get-Content ... -Raw` specifically, repo convention is 100% `-Encoding UTF8` (verified
2026-08-29 against ~90 existing read call sites) — no case-by-case judgment is needed for reads.
Note this does NOT extend to writes: `scripts/install-autopilot-startup-fallback.ps1:41,47` and
`scripts/setup-wp-cli-windows.ps1:52` use `-Encoding ASCII` for `Set-Content`/`Out-File` writes
(found by critic review 2026-08-29, m7) — a different, unaudited class (see AUDIT_REGISTRY.md
CP950 section's scope-boundary note on unencoded writes).

## Notes

- SSOT script: [scripts/audit-cp950-traps.ps1](../../scripts/audit-cp950-traps.ps1)
- Helper: [scripts/_console-encoding-helpers.ps1](../../scripts/_console-encoding-helpers.ps1)
- Registry: [agency-os/docs/operations/AUDIT_REGISTRY.md](../../agency-os/docs/operations/AUDIT_REGISTRY.md)
- Rule: [agency-os/docs/operations/TOOL_TRIGGER_MAP.md](../../agency-os/docs/operations/TOOL_TRIGGER_MAP.md) §代理自動工具使用規則（2026-09-04 自 AGENTS.md 搬入；AGENTS.md 只留指標）
- Origin event (class 1, capture-trap): 2026-05-22 backfill-missed-daily.ps1 ate newlines in
  mojibake'd git log output (commits `e807984` → `52e97d6`)
- Origin event (class 3, unencoded-raw-read): 2026-08-29 codex-oracle.ps1 irreversibly corrupted
  29 CJK artifacts via `Get-Content -Raw` without `-Encoding` (commit `fe87cf05`)
