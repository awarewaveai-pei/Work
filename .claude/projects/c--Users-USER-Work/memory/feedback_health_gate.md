---
name: feedback-health-gate
description: AO-CLOSE health gate must be 100%; -AllowNonPerfectHealth and -SkipVerify are forbidden without explicit user approval
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 43f22d26-838a-4188-b135-e1a3697b62e7
---

Never use `-AllowNonPerfectHealth` or `-SkipVerify` on `ao-close.ps1` without the user explicitly saying so in that turn.

**Why:** On 2026-05-11 AO-CLOSE was allowed to pass at 99.7% health (vault missing 10 critical keys). This is a direct procedural violation — AGENTS.md says "預設收工門檻：system-health-check 100%". The user was upset and demanded strict enforcement.

**How to apply:**
- If health < 100%: STOP. Fix the failing check first, then re-run AO-CLOSE.
- The most common cause is vault drift (vault missing keys from user-env.ps1). Fix: `.\scripts\secrets-vault.ps1 -Action import-user-env`.
- If a fix is impossible right now: tell the user "health is X%, need to fix vault/check Y before closing. Want me to fix it?". Do NOT silently add `-AllowNonPerfectHealth`.
- `-SkipVerify` is equally forbidden for unilateral use — skips all build gates.

See also: [[feedback-git-push]]
