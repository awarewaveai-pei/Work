---
name: feedback_no_cargo_cult_selfrepair
description: "Self-repair must re-diagnose each gate fail with real tools; never copy the prior session's symptom label"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 0d9f6c0e-043e-4cff-b556-87bb0b71e534
---

When a recurring gate/health-check fails, **re-diagnose it live with tools every time** — do NOT copy the previous AO-CLOSE/session report's symptom label as the conclusion.

**Why:** 2026-06-08 investigation. AO-CLOSE was "difficult" on 6/5 (30 min) and "easy" on 6/6 (10 min) — because 6/6 just *copied* 6/5's 3 self-repairs without re-diagnosing. The "#3 sync drift = hooks object→array" label was wrong from 6/2 onward (the object/array class was already neutralized 2026-05-14 by `verify-settings-governed-keys.mjs`; the real drift was `~/.claude/mcp.json` runtime-repopulation, SSOT mandates `{}`). Cargo-culting propagated the misdiagnosis AND created a false "solved" impression, so the root cause was never fixed — only the workaround got faster.

**How to apply:** ① identify which gate script emitted the fail → read its exit conditions; ② run that gate and read its ACTUAL output (e.g. `sync-claude-userlevel.ps1 -Mode verify` prints the drifted key); ③ after fixing, re-run the gate and confirm exit 0; ④ write the *this-time-measured* root cause, not last time's label. "Faster self-repair" can mask "root cause never fixed". Prefer preventers (fix at source) over detectors (fail at close). Related: [[feedback_claim_before_verify]] (VBC), [[feedback_test_review_default]].
