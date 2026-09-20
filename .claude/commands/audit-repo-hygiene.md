---
name: audit-repo-hygiene
description: Run the repo-hygiene audit: two deterministic bug classes with zero LLM judgment involved.
---

Run the repo-hygiene audit: two deterministic bug classes with zero LLM judgment involved.

1. **case-collision** — two git-tracked paths whose lowercased form is identical (e.g. `Foo.md` and `foo.md`). Silently merges into one file/directory the moment anyone works on a case-insensitive filesystem (Windows, default macOS) after the repo was fine on a case-sensitive one (Linux CI, most servers). **Hard AO-CLOSE gate** — see `scripts/system-health-check.ps1` 7d.
2. **oversized-file** — a tracked source file (`.ps1 .mjs .js .jsx .ts .tsx .py .sql .sh .cjs`) over 1000 lines or 100KB. Docs/data/report extensions (`.md .json .jsonl .csv .txt .log`) are excluded — this repo's WORKLOG.md/TASKS.md are supposed to be long. **Informational only, not a gate** — feeds the BUG_HUNT_PROTOCOL.md Tier 3 monthly backlog.

## Modes

- (no arg) → human-readable report, both classes
- `--json` → machine-readable JSON
- `--quiet` → suppress "clean" lines; only show findings
- `--case-collision-only` → gate mode, class 1 ONLY (`-CaseCollisionOnly`)
- `--oversized-only` → gate mode, class 2 ONLY (`-OversizedOnly`); mutually exclusive with `--case-collision-only`
- `--target-file <path>` → single-file mode for the oversized-file class only (case-collision is inherently whole-repo); must be a git-tracked path
- `--work-root <path>` → explicit repo root, overriding the default CWD-independent resolution (mainly for testing against a fixture repo)

## Procedure

### Default — full scan

```powershell
$repoRoot = (git rev-parse --show-toplevel 2>$null) -replace '/', '\'
if (-not $repoRoot) { $repoRoot = $PWD.Path }
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'scripts\audit-repo-hygiene.ps1')
```

Exit codes:
- `0` — clean (no findings in the requested class(es))
- `1` — drift (≥1 finding)
- `2` — error (invalid args / not a git repo / unreadable file)

### Gate modes (used by system-health-check.ps1's hard AO-CLOSE check 7d)

```powershell
# case-collision only — the hard gate class
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\audit-repo-hygiene.ps1 -CaseCollisionOnly -Quiet

# oversized-file only — informational, never a gate
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\audit-repo-hygiene.ps1 -OversizedOnly
```

## When Claude should run this automatically

Per `agency-os/docs/operations/TOOL_TRIGGER_MAP.md`:

| Trigger | Action |
|---------|--------|
| AO-CLOSE health gate run | `-CaseCollisionOnly -Quiet` runs automatically inside `system-health-check.ps1` (hard gate, check 7d) |
| 月度排程 audit / 操作者問「該抓哪個」 | 讀 `BUG_HUNT_PROTOCOL.md` backlog，`-OversizedOnly` 結果可作為挑 class 的候選清單 |
| 新增／搬移目錄，尤其跨大小寫（Windows 磁碟 vs git index）| 跑 `/audit-repo-hygiene --case-collision-only` 確認沒有遺留分裂路徑 |

## Fix template

**case-collision**: pick the ONE canonical casing (usually whichever git already tracks, or whichever matches the repo's existing naming convention nearby), `git mv` the loser onto it — on a case-insensitive filesystem this needs a two-step rename through a temp name (`git mv Foo.md Foo.md.tmp && git mv Foo.md.tmp foo.md`) since a direct rename that only changes case is a no-op on disk. Then reconcile any content that diverged between the two paths before the rename (do not silently drop one side).

**oversized-file**: not urgent by itself — log as a `🟡 TRACKED` candidate in `AUDIT_REGISTRY.md`'s repo-hygiene section. Only split the file when it's actually being edited anyway (avoid a pure-refactor PR with no functional change) or when the size itself is causing a real problem (git diff noise, review difficulty).

## Notes

- **Before this became a hard gate**: critic review (2026-09-05) reproduced 3 CRITICAL + 4 MAJOR bugs in the first draft against real fixtures — CP950/Big5 console mojibake turning two legitimately different CJK filenames into a ghost collision, an unmerged/mid-merge index's stage-duplicated paths miscounted as a self-collision, git failures fail-open reporting "clean" having checked nothing, and (the one that mattered most) the original same-depth-only comparison missing the actual origin incident's shape — a file colliding with a DIFFERENT depth's directory ancestor, not two same-name leaf files. All four fixed and re-verified against reproduced fixtures before wiring the hard gate; see `AUDIT_REGISTRY.md`'s "Repo-hygiene audit" section for the full report and fix-by-fix verification.
- SSOT script: [scripts/audit-repo-hygiene.ps1](../../scripts/audit-repo-hygiene.ps1)
- Registry: [agency-os/docs/operations/AUDIT_REGISTRY.md](../../agency-os/docs/operations/AUDIT_REGISTRY.md)
- Rule: [agency-os/docs/operations/TOOL_TRIGGER_MAP.md](../../agency-os/docs/operations/TOOL_TRIGGER_MAP.md)
- Origin event: 2026-09-05, `Projects/internal/hci30` (git index, lowercase) vs `Projects/internal/HCI30/` (disk, uppercase) drifted apart under Windows' case-insensitive filesystem; discovered and manually reconciled while closing out `agency-os/TASKS.md:822`. This tool exists so the next occurrence is caught by a gate instead of by hand.
- Deliberately does NOT attempt general duplicate-code-block or naming-drift detection — see the script's own header comment for why (judgment-requiring, already covered by critic subagent + `/code-review` + `/simplify`; a naive version would risk the >10% FP-rate death spiral BUG_HUNT_PROTOCOL.md Step 7 warns about).
