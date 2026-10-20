# Mode: Architecture Review Debate

Use this mode when the user is presenting a system design or architecture for review, asking whether their approach is sound.

**Trigger phrases:** "review my architecture", "is this design good", "I'm building X, thoughts", "evaluate my system design", "would this scale", "any holes in this approach"

---

## How this mode modifies the standard pipeline

Architecture review differs from tool selection in a key way: **there's one proposal, not multiple candidates**. The debate is about attacking and refining a single design.

### Stage 4 (Candidate Discovery) — modified

Instead of "discover candidates," this stage produces:
- **Restatement of the proposed architecture** in clear terms
- **Identification of architectural patterns** present (microservices, event-driven, monolith, CRUD, etc.)
- **Identification of architectural alternatives** that could replace key decisions (these become "competitor architectures" for cross-exam)

So you produce 1 primary architecture + 2-3 alternative architectural framings for comparison.

### Stage 6 (Positions) — Lead Architect proposes; alternatives propose

- Primary advocate: defends the user's proposed architecture
- Alternative advocates (2-3): each represents a different architectural approach that could replace key decisions

Examples of "alternative architectures" for a microservices proposal:
- Modular monolith advocate
- Event-driven architecture advocate
- Serverless / FaaS advocate

### Stage 7 (Cross-Examination)

Each alternative attacks the primary architecture's choices. The primary defends or concedes.

This is where the architecture's hidden assumptions get exposed.

### Stage 8 (Specialist Reviews) — heightened importance

For architecture review, specialists go DEEP:

**Scalability Reviewer (always added in this mode) — must answer:**
1. Where's the first scaling bottleneck (be specific: which component, what limit)?
2. What happens at 10x current load? At 100x?
3. Where is state? How does it horizontally scale?
4. Cold path / hot path / warm path — how is each handled?

**Security Reviewer — must answer:**
1. What's the trust boundary diagram? Where do you authenticate?
2. Where does sensitive data live? Encrypted with what?
3. What's the supply chain story?
4. Audit trail: what's logged, retained, reviewed?

**DevOps Reviewer — must answer:**
1. Deployment story: how does new code reach production?
2. Rollback story: how to revert when things break?
3. Observability: what's measured? What dashboards/alerts exist?
4. Disaster recovery: RTO/RPO realistic for the architecture?

**Failure Scenario Reviewer (specialist, added in this mode):**
List at least 5 specific failure scenarios:
1. For each, how is it detected?
2. For each, how is it recovered?
3. What does the user-facing impact look like?

### Stage 9 (Skeptic) — modified

Skeptic doesn't compare candidates (there's mostly one primary). Instead:
- Attack each major architectural decision in the primary
- Identify hidden coupling, single points of failure, scaling cliffs
- Find unverified assumptions about scale, traffic, team capability

### Stage 10 (Tradeoff Matrix) — modified

Instead of comparing candidates, compare:
- Primary architecture
- 2-3 alternative architectures

On dimensions:
- Operational complexity
- Cost at current and projected scale
- Time-to-implement (if not yet built)
- Time-to-modify (if already built)
- Failure isolation
- Team skill alignment

### Stage 11 (Judge) — modified output

Judge produces one of three verdicts:

| Verdict | Means |
|---------|-------|
| **Ship it** | Architecture is fundamentally sound; proceed with these specific mitigations |
| **Modify** | Architecture is on the right track but needs specific changes before proceeding (list them) |
| **Reconsider** | Architecture has fundamental issues; consider alternative approach |

Plus the standard ranked output, but interpreted as "architecture that wins" rather than "tool that wins."

---

## Stages 14-15 (Plans) — modified

For architecture review, "Installation Plan" becomes "Implementation Plan" or "Modification Plan":

- If verdict is "ship it": phased build plan with checkpoints
- If verdict is "modify": specific changes to make + how to verify each
- If verdict is "reconsider": migration plan to alternative architecture

"Rollout Plan" becomes "Deployment Plan" — how to safely put this into production once built.

---

## Specific quality bars for Architecture Review mode

- **Specialist reviewers go DEEP.** Generic concerns aren't acceptable here.
- **Failure scenarios must be specific.** Each scenario is a story, not a category.
- **Tradeoffs must be explicit.** You're not picking the "best" architecture — you're picking the right tradeoffs for the context.
- **Verdict is decisive.** Ship it / Modify / Reconsider — not "well, it could work."

---

## Anti-patterns specific to Architecture Review

1. **The "design review by checklist" failure.** Reviewers tick boxes without engaging with specifics.
2. **The "everything looks fine" failure.** No architecture is perfect. Find real concerns.
3. **The "rebuild from scratch" failure.** Skeptic concerns escalate into full rejection without considering modify-in-place.
4. **The "ignore the team" failure.** Architecture must fit the team's skills, not abstract ideals.

---

## When this mode might NOT apply

If the user is showing you their architecture but actually asking "should I build this at all?" — that's a different question (often closer to tool selection or a strategic decision). Read the question carefully.
