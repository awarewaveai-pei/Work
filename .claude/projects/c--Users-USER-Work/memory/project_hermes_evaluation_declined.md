---
name: Hermes Agent evaluated and declined (2026-05-08)
description: NousResearch Hermes Agent v0.2.0 reviewed via strategy-review skill; operator decided not to adopt
type: project
originSessionId: 4845860f-ee69-4e0f-a113-95f6686c9b87
---
NousResearch Hermes Agent (open-source autonomous AI agent, Feb 2026 release, v0.2.0) was evaluated on **2026-05-08** using the `strategy-review` skill (Mode 1 four-role-collaboration). The full decision record is at:

`agency-os/reports/strategy-review/2026-05-08-adopt-hermes-agent.md`

**Operator final stance**: REJECTED — not adopting (not even sandbox probe).

**Why:** The review's primary purpose was to validate the `strategy-review` skill's 4-role mechanism (DoD: "4 reports truly different, no context contamination"). That mechanism check PASSED. The Hermes adoption proposal itself was not accepted by the operator.

**How to apply in future sessions**:
- If the operator (or another agent) re-raises Hermes Agent adoption, point to this evaluation as baseline. Do NOT re-run the strategy review unless new material context arrived (e.g., Hermes 1.0 release, new compliance pressure, NousResearch acquisition).
- The decision record's §6 Investigation Queue contains 7 questions that were *intentionally not investigated* because the operator declined. If a future re-evaluation happens, those questions are the starting checklist.
- The decision record's §13 DoD verification documents the 4-role skill mechanism as working — do not re-test the skill mechanism on this case; pick a fresh case for future skill demos.

**Skill enhancements landed alongside this run** (2026-05-08): critical role frame-first discipline line; systems role governance red lines matrix (security/multi-tenant/auth/SoR/production-destructive); communication role legal-regulatory disclosure §; SKILL.md demo / non-decisive runs §. Future sessions get these by default — no need to re-derive.
