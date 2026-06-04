---
name: No wasteful work — stop at functional baseline
description: When a system reaches working production state, stop. Don't trigger rebuild cycles for cosmetic completeness, perfectionism, or governance vanity (e.g. 7/8 smoke vs 8/8 when the gap is a low-importance audit detail).
type: feedback
originSessionId: 97576340-b5f5-4dec-b340-cd39f154a574
---
Don't keep iterating after the user-facing function works.

**Why:** During Always-On Command Plane Phase 1 deploy (2026-05-07) I forced a full rebuild + restart cycle on the SG production server to fix the 8th smoke test (auth-failure DLQ logging) — strictly a governance audit detail, not a user-blocking bug. The system was already serving Telegram traffic correctly at 7/8. This burned 5+ extra minutes of build/deploy/test time and triggered another container recreate on a live system. User flagged this with "腦子放聰明 不要做無效的事" right after I shipped the celebratory 8/8 summary.

**How to apply:**
- After a function reaches working state on production, default to STOP and report. Don't preemptively chase remaining smoke / lint / audit gaps unless the user asks.
- If a fix is truly tiny (1-line, no rebuild needed), do it inline. If it requires another full rebuild + container recreate cycle, ask first.
- Don't pile on celebratory summaries when the user just wants to test the result. End with the test instruction, not a victory lap.
- "Production-ready" ≠ "100% governance-perfect". Distinguish blocking bugs from polish.
