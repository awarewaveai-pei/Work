---
name: Mechanical enforcement beats documentation; AI may not read MD
description: User observation that md docs are passive — AI/humans may skip them. Always back governance with mechanical checks (scripts, gates, hooks, CI), not just docs.
type: feedback
originSessionId: 101b785f-c021-4d76-81e4-0520a1c4519a
---
User said (2026-05-07): 「我覺得 md. 常常是寫辛酸的 因為 AI 不一定會去讀」

**Rule:** Whenever you design a governance/policy/SSOT mechanism, **prefer mechanical enforcement** (scripts, gates, hooks, CI checks, pre-commit hooks) over markdown documentation. Treat MD as documentation of intent, not as the enforcement layer.

**Why:** Markdown is passive. AI sessions may not load it; humans may skip it; both can violate the rule unintentionally. A check that runs in the user's actual workflow (AO-RESUME, build gates, pre-commit, CI) cannot be ignored.

**How to apply:**
- For every new SSOT or treaty, ask: "What blocks this from drifting if no one reads the README?"
- Wire the enforcement into existing automation runways:
  - **AO-RESUME** (`scripts/ao-resume.ps1`): warn-level checks at session start
  - **verify-build-gates** (`scripts/verify-build-gates.ps1`): hard checks before push
  - **system-health-check** (`scripts/system-health-check.ps1`): daily 100%-required checks
  - **ao-close** (`scripts/ao-close.ps1`): pre-push closeout gate
  - **bootstrap-mcp-machine** (`scripts/bootstrap-mcp-machine.ps1`): new-machine auto-setup
  - **Git pre-commit hooks** (`~/.claude/hooks/`): blocks bad commits at source
  - **GitHub Actions** (.github/workflows/): cloud-side last line of defense
- Mechanical first, docs second. Docs explain *why* the check exists, not *whether* the check runs.
- Whenever a `README.md` says "should/must do X" — check if a script enforces X. If not, add the enforcement.

**Examples in this repo:**
- ✅ Good: `verify-closeout-completeness.ps1` blocks AO-CLOSE without WORKLOG evidence (mechanical)
- ✅ Good: `branch-protection.js` hook blocks `git push --force` (mechanical)
- ⚠️ Weak: `mcp/claude-userlevel/README.md` describes the flow but didn't (initially) wire verify into AO-RESUME — fixed by adding the verify call to the AO-RESUME light path.
