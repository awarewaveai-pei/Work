---
name: apply-audit
description: Apply an audit report's ready-to-apply patches under full Auto-Repair discipline: backup, patch, health gate, rollback on failure, WORKLOG.
argument-hint: <report-path>
disable-model-invocation: true
---

Apply an audit report's ready-to-apply patches with the full discipline that 2026-05-23 Auto-Repair audit had to learn the hard way: Patch Errata fold-in + cross-file 抓蟲 catch-up + 4-action verification per patch + AUDIT_REGISTRY status upgrade + WORKLOG entry.

This command exists because on 2026-05-23 the audit work hit three operator push-backs in a row — "ready-to-apply" turned out to mean "5 Major design defects waiting in the Errata that I deferred reviewing". Future audit apply rounds must not repeat that pattern.

SSOT method: [`agency-os/docs/operations/BUG_HUNT_PROTOCOL.md`](../../agency-os/docs/operations/BUG_HUNT_PROTOCOL.md) Build Playbook step 8.
SSOT status: [`agency-os/docs/operations/AUDIT_REGISTRY.md`](../../agency-os/docs/operations/AUDIT_REGISTRY.md).
Reference run: [`agency-os/reports/audit/auto-repair-2026-05-23.md`](../../agency-os/reports/audit/auto-repair-2026-05-23.md) (first full Tier 3 logic audit + apply round).

## Arguments

- `<report-path>` — path to the audit report under `agency-os/reports/audit/` (required)
- `--patch <ID>` — apply only one patch by ID (C1, C2, …); default is all 🔴 Critical
- `--dry-run` — read + plan only, do not modify any product code (still write WORKLOG plan-of-record)
- `--skip-errata-check` — DANGEROUS; bypasses the Patch Errata fold-in check. Only valid with `--ack "reason"` written to daily memory beforehand

## The discipline this command enforces (the 2026-05-23 lesson)

1. **Read §Patch Errata BEFORE touching any patch code.** The audit report's own self-critic round may have invalidated patches. Skipping this step ships bugs.
2. **Fold Errata into each patch before applying.** If `EMaj-N` says "the regex has FP" → revise the regex with the prefix anchor; if `EMaj-N` says "save-before-deploy missing" → add the snapshot step. Do NOT apply the unrevised patch.
3. **Cross-file 抓蟲 catch-up per patch.** Grep callsites of every symbol the patch touches across the monorepo. The audit critic might have missed adjacent routes / consumers. Today's example: `tenant-integration/route.ts` was using the same `await req.json()` pattern as the 5 audited webhooks but was outside the audit scope. Catch-up found it.
4. **4-action verify per patch** (R0+R4 iron rule): real exec test + Read-back changed code + cross-file grep + WORKLOG line per patch.
5. **AUDIT_REGISTRY upgrade per Critical.** Move from `🔴 TRACKED` to `🔴 FIXED` with the commit hash. Update statistics table.
6. **WORKLOG entry naming the apply round.** R0 4-action evidence + remaining risks per patch.

## Procedure

### Step 0 — Pre-flight read

```bash
# R0 mandate: see if a parallel session committed since the audit was written
git log --oneline -10
```

Read in full:
- The audit report passed as `<report-path>` (entire file, no excerpts)
- The report's §Patch Errata section — **if missing, STOP**: either the audit hasn't been self-critic'd yet (run `/audit-self-critic` if exists, or spawn `critic` subagent) or the report follows an older template
- The current state of [AUDIT_REGISTRY.md](../../agency-os/docs/operations/AUDIT_REGISTRY.md) section for this audit class — note which Criticals are already FIXED vs TRACKED

### Step 1 — Sequence the patches by risk + dependency

Read the report's ready-to-apply patches list. For each:
1. **Risk** — from the report header (Low / Low-Medium / Medium-High / High)
2. **Dependency** — does this patch depend on another being in place first?
3. **Errata folded?** — does §Patch Errata mention this patch ID? If yes, list every EMaj/EMin that touches it

Recommended order: Low-risk first (additive auth, pure functions with unit tests), Medium-High last (production deploy scripts). Apply patches that have Errata fixes folded in BEFORE applying ones that don't (skip the latter; STOP and surface to operator).

### Step 2 — Per-patch apply loop

For each patch, in the order from Step 1:

1. **Read the patch's diff in the audit report** — the exact code block under `### Patch N`
2. **Read the relevant §Patch Errata entries** — `EMaj-X` / `EMin-Y` items that target this patch
3. **Compose the FOLDED patch** — the original diff + every Errata correction. Output the folded diff in conversation BEFORE writing to disk (operator must see what's about to land if interactive mode).
4. **Apply via Edit / Write tool** — actual code change
5. **Per-patch verify (lightweight)**:
   - Syntax: `bash -n` for shell, `npx tsc --noEmit -p <tsconfig>` for TS, parse for ps1
   - Unit tests: if patch ships tests, `npm test -- --run <test-file-pattern>`
6. **Per-patch cross-file 抓蟲**:
   - For every new function / symbol the patch introduces (e.g., `readWebhookBody`, `confirmCriticalRun`), grep across `lobster-factory/` and `agency-os/` for OTHER callsites that should adopt it
   - For every existing function the patch changes, grep callers to verify the contract change is compatible
   - Document hits in the patch's WORKLOG line

### Step 3 — Cross-cutting validation (after all patches landed)

```bash
# Run full project tests, not just the per-patch slice
cd lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npm test
# Bash scripts touched
bash -n lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh
# Dogfood harness (if this audit class shipped one)
powershell -ExecutionPolicy Bypass -File scripts/audit-tools/dogfood-<class>.ps1 -Mode HealthOnly
```

If any step fails → STOP, capture diagnostic output, do not proceed to AUDIT_REGISTRY upgrade.

### Step 4 — AUDIT_REGISTRY upgrade

Edit `agency-os/docs/operations/AUDIT_REGISTRY.md`, the section for this audit class:

1. For each successfully-applied Critical: move the row from 🔴 TRACKED table to 🔴 FIXED section. Include the commit hash.
2. Update the Statistics row: `🔴 FIXED` count up by N, `🔴 TRACKED (Critical)` count down by N.
3. If a Major or Minor was closed alongside a Critical (today's m3 / m9 examples), update the corresponding table row too.
4. Update the audit-class header note ("✅ apply round complete …") with the date + count.

### Step 5 — WORKLOG entry

Append to `agency-os/WORKLOG.md` under today's date heading. Required structure:

```markdown
#### YYYY-MM-DD — <audit class> apply round

**根因**: <1 paragraph: why patches were ready / what Errata had to fold in>

**修改檔案** (N 個):
  <list per Critical, grouped by patch>

**[驗證結果] R0+R4 4-action**:
1. 實測: <npm test / bash -n / harness output>
2. Review: <Read-back evidence per patch>
3. 抓蟲: <grep results per symbol; any catch-up files folded into THIS commit>
4. WORKLOG: this entry

**剩餘風險**:
  (a) <takes-effect timing — e.g. C1 only fires on next sg-deploy>
  (b) <env flag opt-outs>
  (c) <known partial fixes>

**Rollback**: <one-line per patch>
```

### Step 6 — Commit + push

```bash
git add <all touched files>
# Use the apply-round commit template (mirrors WORKLOG structure)
git commit -m "audit(<class>): apply round — N Criticals FIXED + Errata fold-in

…
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

If the verify-gate hook blocks (code files changed without `/verify-recent` clearance), use `--ack` referencing the per-patch verification in the WORKLOG entry:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-recent-ack.ps1 `
  -Reason "apply-audit <class>: 4-action verification per patch in WORKLOG entry YYYY-MM-DD"
```

## What this command MUST NOT do

- **Apply patches without Patch Errata fold-in.** If Errata mentions a patch ID, that patch's design has known defects. Refuse to apply until folded — surface to operator.
- **Apply Medium-High risk patches without explicit operator OK in this session.** Production deploy scripts (`sg-deploy.sh`), authentication code, DB migrations require operator's explicit go-ahead because they can't be unit-tested in the local environment.
- **Skip 4-action verify per patch.** "I tested it in my head" is not 實測. Run real commands. Save output.
- **Skip cross-file 抓蟲.** The most common audit-applied bug is "I forgot adjacent code that has the same pattern" — exactly what `tenant-integration/route.ts` was on 2026-05-23.
- **Mark a Critical FIXED without commit hash in AUDIT_REGISTRY.** Status without traceability is theater.

## When Claude should run this automatically

Per AGENTS.md `## 代理自動工具使用規則`:

| Trigger | Action |
|---------|--------|
| Operator says "apply audit" / "apply the patches" / "套用 audit" / "把 audit 修一修" + references a path under `agency-os/reports/audit/` | Run `/apply-audit <report-path>` |
| Operator OK's a deferred apply ("OK 修吧" / "處理好所有的事") and the most recent unapplied audit report is identifiable from WORKLOG or AUDIT_REGISTRY | Confirm the report path with operator, then `/apply-audit` |
| After spawning `audit-orchestrator` or running BUG_HUNT_PROTOCOL Build Playbook through step 7 (self-critic done) and operator says "apply" | Run `/apply-audit <report-path>` (step 8 of the playbook) |

## Origin event

2026-05-23 Auto-Repair Tier 3 audit. Operator had to push back three times because:
1. First push (`你有 review + 抓蟲嗎? 我們不是有鐵律?`) — self-critic on own deliverables was skipped; verify-gate hook also blocked commit
2. Second push (`剩餘風險 為什麼不處理?`) — "ready-to-apply" was deferred to next session despite low-risk patches being immediately applicable
3. Third push (`你去處理好所有的事 然後報告`) — apply round + Patch Errata fold-in + cross-file 抓蟲 catch-up (found `tenant-integration/route.ts` outside audit scope but same DoS surface)

Each push-back was a missing piece of discipline this command now bakes in.

## Notes

- This command does not run as a standalone subagent — it walks the main agent through the steps. For unattended apply of large audit batches, spawn `audit-orchestrator` subagent (if implemented).
- The dogfood harness (e.g. `scripts/audit-tools/dogfood-auto-repair.ps1`) is the source of truth for post-fix regression detection. Add a "post-fix invariant" assertion to it whenever a Critical moves to FIXED, so the next audit cycle can verify the fix is still in place.
- BUG_HUNT_PROTOCOL Build Playbook covers steps 1-7 (audit build); this command covers step 8 (apply). Step 9 (optional system-health-check integration) is unchanged.
