# Idea Intake Standard

## Purpose
在一個想法進入本方法論管線之前，先把它變成可被評估的東西——而不是一句話的靈感。

## Sequencing
This is step 00, the pipeline entry point. It has no upstream step. Its output feeds `01_CURRENT_STATE_AUDIT.md`, which cannot begin until intake produces the fields below.

## Required Scope
- problem
- buyer
- users
- commercial intent
- criticality
- constraints
- success metrics
- unknowns

## Required Fields
1. **Problem statement** — the specific problem, not the proposed solution. "We want a dashboard" is a solution; the problem it solves must be stated separately.
2. **Evidence the problem is real** — who is affected, how often, what it currently costs them (time, money, risk). A solution looking for a problem is rejected at this gate.
3. **Buyer vs. user** — who decides/pays vs. who operates it day to day, where they differ (`commercial/PRODUCTIZATION_STANDARD.md`).
4. **Criticality** — initial estimate of blast radius/risk tier if this goes wrong (`kernel/10_RISK_AND_EXCEPTION_CONTRACT.md`).
5. **Constraints and non-scope** — what this idea explicitly will NOT attempt, stated now so scope creep has a reference point later.
6. **Success metrics** — how anyone will know, after building it, whether the problem was actually solved.
7. **Known unknowns** — what isn't known yet and must be resolved in `01_CURRENT_STATE_AUDIT.md` or `02_REQUIREMENT_DISCOVERY.md`.
8. **Profile and archetype** — an initial project profile (`profiles/*.yaml`) and system archetype (`bootstrap/SYSTEM_ARCHETYPES.yaml`) selection, even if provisional.
9. **Human-system applicability** — whether this system has a human-facing surface at all (gates whether `experience/HUMAN_CENTERED_SYSTEM_STANDARD.md` and related experience standards apply downstream).

Intake questions in full are the canonical set in `bootstrap/NEW_SYSTEM_INTAKE.yaml` (identity/users/business/criticality/data/security/integration/scale/operations/lifecycle/constraints) — this standard states the minimum this step's gate checks, not a substitute for that full questionnaire.

## Gate
`G0_INTAKE_COMPLETE` (`runtime/stage-gates.yaml`) requires: scope, goals, non_goals, stakeholders, criticality, profile, archetype, human_system_applicability. It fails when the problem statement is actually a solution statement in disguise, when no evidence of a real affected party is offered, when success metrics are absent, or when any required field above is missing. An idea that fails this gate is returned for reframing, not silently carried forward with gaps.
