Run a code review on all files changed since the last commit, with depth scaled to change size and sensitivity.

**Writer = Codex** (2026-09-19): wherever this file says `/codex-review` or `codex-oracle.ps1`, use `/claude-review` instead — the cross-model oracle must be the model that did not write the change (AGENTS.md §4). In a Codex session the critic role is a Codex `spawn_agent` with `agent_type: critic`, which spends Codex quota, so Step 0 checks `-Tool codex` there.

## Step 0 — Quota circuit breaker (2026-09-04, operator: 撞到額度就停)

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/oracle-quota.ps1 -Action check -Tool critic
```

Exit 3 = the critic subagent is recorded as BLOCKED (HTTP 429 session limit) until the printed time: do not spawn it; go to `/codex-review` (which runs its own Step 0 for Codex) or, if that is blocked too, to the written self-review + mutation evidence with `ORACLE_WAIVED` in WORKLOG. If the critic you do spawn fails with `429` / `rate_limit` / `session limit`, run `scripts/oracle-quota.ps1 -Action set -Tool critic -Until "<reset time in the error>" -Reason "<verbatim>"` (no time → `-Hours 5`) **immediately and do not spawn a second critic**.

## Step 1 — Collect changed files and size

```bash
git diff HEAD --name-only
git diff --cached --name-only
git diff HEAD --shortstat
```

Deduplicate the file list. If no changed files → report "No changes to review."

## Step 2 — Classify the change

**Sensitive file patterns** (always → Deep regardless of size):
- `auth`, `payment`, `billing`, `crypto`, `rls`, `permission`, `migration`, `secrets`, `.env`, `supabase`, `lobster-factory/infra`

**Tiers:**

| Tier | Condition | Critic brief |
|------|-----------|-------------|
| **Quick** | ≤ 20 lines changed AND no sensitive files | Security + Critical bugs only |
| **Standard** | 21–100 lines AND no sensitive files | Full checklist, all severities |
| **Deep** | > 100 lines OR any sensitive file matched | Full checklist + AwareWave stack checks |

## Step 3 — Spawn critic subagent

**Fallback (2026-08-24, updated 2026-08-30)**: if critic fails twice in a row on this review (API error / timeout — e.g. 529 Overloaded), stop retrying critic and switch to `/codex-review` instead (AGENTS.md §跨模型 oracle's primary entry point as of 2026-08-30). Use its findings the same way as critic's for Step 4. If `/codex-review` itself fails twice, drop to `.\scripts\codex-oracle.ps1 -Mode review -Context "<what changed>"` as the last-resort fallback. This mirrors AGENTS.md §跨模型 oracle's routing table, which already assigns the Review action to Codex — critic, `/codex-review`, and codex-oracle.ps1 are three paths to the same R0 verification requirement, not competing mandates. Root cause for adding this: 2026-08-24, critic hit 529 six times in one session while codex-oracle.ps1 (after a CLI version update) worked reliably.

Pass the following brief to the **critic** subagent (subagent_type: critic):

### Quick brief
> "Quick scan — security and Critical/Major bugs only on these files: [files]. Read each file for context. Skip Minor, Suggestion, architecture, and style. Do NOT flag: (1) theoretical risks with no concrete attack path, (2) code not touched by this change, (3) library replacement suggestions."

### Standard brief
> "Standard review on these files: [files]. Run your full checklist. Do NOT flag: (1) theoretical risks with no concrete attack path, (2) code not touched by this change, (3) library replacement suggestions, (4) style issues already consistent with the surrounding codebase."

### Deep brief
> "Deep review on these files: [files]. Run your full checklist including AwareWave stack checks (Supabase RLS, Lobster flags, ClickHouse version, Trigger credentials, nginx drop-ins, Resend FROM address). Sensitive files detected: [list matched patterns]. Do NOT flag: (1) theoretical risks with no concrete attack path, (2) code not touched by this change, (3) library replacement suggestions."

## Step 4 — Present findings

Group by severity:
- 🔴 **CRITICAL** — must fix before committing
- 🟠 **MAJOR** — strongly recommended
- 🟡 **MINOR** — recommended (Standard/Deep only)
- 🔵 **SUGGESTION** — consider (Standard/Deep only)

End with verdict:
- ✅ Safe to commit
- ⚠️ Warnings only — can commit, consider fixing
- 🚫 Blocked — Critical issues must be fixed first

Include tier used and file count in the verdict line (e.g. "Deep review · 4 files · 1 sensitive pattern matched").
