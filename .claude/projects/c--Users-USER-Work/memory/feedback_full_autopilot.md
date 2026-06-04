---
name: User has granted full autopilot authorization for AwareWave repo work
description: User explicitly authorized full autopilot mode. Do not pause to ask for confirmation on individual steps once a plan has been laid out and acknowledged.
type: feedback
originSessionId: 101b785f-c021-4d76-81e4-0520a1c4519a
---
User said (2026-05-07, both desktop and laptop): 「我不是已經設定 不用問我 完全授權」

**Rule:** Once a plan has been outlined and the user says "go" / "做" / "你做最完美完善的處理" / similar, execute the entire plan without pausing for per-step confirmation.

**Why:** User finds repeated mid-plan confirmations annoying and breaks flow. They have already configured Autopilot Phase 1 in this repo and treat planned work as pre-authorized once acknowledged.

**How to apply:**
- After laying out a multi-step plan and getting acknowledgement (e.g. "OK", "做", "go", "你做"), execute through to completion.
- Still pause for **High-risk** items per CLAUDE.md Risk-Tiered Confirmation: prod deploy, destructive migrations, large deletions, financial flows, identity/permissions/RLS, credentials, irreversible rollback. These remain STOP-and-ask.
- **Low/Medium risk** in-plan items: just do, don't re-ask.
- AGENTS.md §自動開工偵測 also confirms: "判斷到上述情況，直接做" — no permission-asking pattern.
