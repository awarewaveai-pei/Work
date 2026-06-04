---
name: feedback-root-cause-discipline
description: Never close a bug with a symptom-only fix; always trace to root cause and verify cross-machine/cross-session impact
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 23eaecd6-9b5d-49eb-af3e-763bbb372d28
---

Don't close a fix as "done" when only the symptom is addressed. Always ask: can this re-occur in a different environment or after a machine switch?

**Why:** The ao-close-last.txt / stale external signals issue was raised and "fixed" across multiple sessions (2026-05-15, 2026-05-18, 2026-05-20). Each time the symptom was patched (fallback behavior improved, warning added) but the root cause (file not synced cross-machine) was left unresolved. User had to ask 3+ times.

**How to apply:** When a bug is fixed, explicitly verify: (1) does the fix survive a machine switch? (2) does the fix survive a session restart? (3) is the underlying data/file/state properly persisted/synced? If any answer is "no", the fix is incomplete — say so and fix the remaining layer before closing.
