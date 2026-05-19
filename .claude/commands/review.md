Run a code review on all files changed since the last commit, with depth scaled to change size and sensitivity.

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
