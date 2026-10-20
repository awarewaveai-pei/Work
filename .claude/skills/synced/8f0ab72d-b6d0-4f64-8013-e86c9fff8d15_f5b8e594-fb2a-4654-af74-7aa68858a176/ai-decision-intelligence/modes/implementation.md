# Mode: Implementation Debate

Use this mode when the user has already chosen what to build/use, and is asking how to implement, deploy, migrate, or roll out.

**Trigger phrases:** "how should I roll out", "migration strategy", "deployment plan for", "how to migrate from X to Y", "what's the safest way to deploy"

---

## How this mode modifies the standard pipeline

Implementation mode is about **strategy, not tool selection**. There's a clear destination; the debate is about HOW to get there safely.

### Stage 4 (Candidate Discovery) — modified

Instead of competing tools, you have **competing implementation strategies**. Common categories:

**For deployment:**
- Big Bang (cut over once)
- Blue-Green (run both, switch traffic)
- Canary (gradual percentage rollout)
- Strangler Fig (incrementally replace old system)

**For migration:**
- Lift and shift (move as-is, optimize later)
- Re-architect during migration
- Parallel run (both systems running, verify equivalence)
- Phased migration (component by component)

**For rollback strategies:**
- Forward-only (no rollback, only forward fixes)
- Feature flag based
- Code rollback only (no DB schema rollback)
- Full rollback (code + DB schema)

### Stage 5 (Role Assignment) — emphasis

For implementation debates, certain reviewers take on heightened roles:

- **DevOps Reviewer:** lead role — implementation IS ops
- **Security Reviewer:** focus on security DURING transition
- **Skeptic:** focus on partial-failure scenarios (what if migration is interrupted halfway)
- **Risk Reviewer (specialist):** quantify what could go wrong at each stage

### Stage 6-7 (Debate)

Each strategy advocate makes their case:
- Big Bang advocate: "rip the bandaid; one outage window is cleaner than weeks of dual-running"
- Canary advocate: "blast radius matters more than time"
- Blue-Green advocate: "you need fast rollback more than you need fast cutover"

Cross-examination focuses on specific scenarios:
- "Day 3 of migration, you discover a data inconsistency. What does YOUR strategy do?"
- "Mid-deployment, the old system has an outage. What does YOUR strategy do?"

### Stage 8 (Specialist Reviews) — modified

Reviewers focus on transition states, not steady states:

**DevOps Reviewer:**
- Detection mechanism for partial-failure mid-deployment?
- Recovery from partial state?
- On-call burden during deployment window?

**Security Reviewer:**
- Are credentials and access correct during transition?
- Audit logs continuous across the transition?
- Data exposure risk during the transition?

**Cost Reviewer:**
- Cost of running both systems during transition (parallel run cost)
- Cost of rollback (in time + dollars)
- Cost of incidents during transition (estimated from blast radius)

### Stage 9 (Skeptic)

Skeptic focuses on:
- What's the failure mode if we're 50% through and something breaks?
- What's the worst-case timeline if everything goes wrong?
- What assumptions about team availability does this require?

### Stage 11 (Judge)

Judge picks an implementation strategy with clear reasoning grounded in:
- Blast radius vs speed tradeoff
- Team capability for the chosen strategy
- Acceptable downtime/disruption

### Stage 14 (Implementation Plan)

For implementation mode, this becomes the **execution playbook** — much more detailed than for tool selection mode. Include:

- Day-by-day or phase-by-phase plan
- Specific commands or actions
- Data verification at each step
- Communication touchpoints

### Stage 15 (Rollout Plan)

For implementation mode, this is **highly important** — it's the actual user-facing rollout. Use Rollout Planner agent with extra emphasis on:
- Wave size justification
- Communication plan
- Per-wave rollback procedures

---

## Specific quality bars for Implementation mode

- **Strategies are concrete.** Not "blue-green deployment" as concept, but "this specific blue-green setup with these tools and this DNS switching mechanism."
- **Partial-failure scenarios analyzed.** Mid-deployment failures are the real test.
- **Cost of dual-running calculated.** Parallel run isn't free.
- **Communication is part of the plan.** For user-facing systems, comms matter as much as technical execution.

---

## Anti-patterns specific to Implementation mode

1. **The "we'll figure it out" failure.** Vague strategies always go wrong.
2. **The "rollback is theoretical" failure.** Untested rollback ≠ rollback.
3. **The "happy path" failure.** Plan for what goes wrong, not just what goes right.
4. **The "team will work weekends" failure.** Implementations that depend on heroics fail.
5. **The "ignore communications" failure.** Users hate surprises more than they hate maintenance windows.

---

## When this mode might NOT apply

If the user has chosen the destination but the chosen tool is wrong for them — note this but don't override. Their current question is implementation. If you have strong evidence the destination is wrong, mention it as an `open_question` for Judge but still produce the implementation plan they asked for.
