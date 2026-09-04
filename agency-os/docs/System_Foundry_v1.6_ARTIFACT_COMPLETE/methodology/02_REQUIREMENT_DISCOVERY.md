# Requirement Discovery Standard

## Purpose
把 `01_CURRENT_STATE_AUDIT.md` 建立的現況真相與 `00_IDEA_INTAKE_STANDARD.md` 的問題陳述，轉成明確、可追溯、無歧義的需求清單。

## Sequencing
Step 02. Consumes the evidence register and current-state findings from `01_CURRENT_STATE_AUDIT.md` (G1 must have passed). Its output feeds `03_BUSINESS_ARCHITECTURE.md`.

## Required Scope
- goals
- functional
- non-functional
- constraints
- assumptions
- traceability

## Required Fields
1. **Functional requirements** — stated as observable system behavior, each traceable to a line in the idea-intake problem statement or an audit finding, not invented independently.
2. **Non-functional requirements** — performance, availability, security, compliance — each with a stated threshold, not a vague adjective ("fast", "secure").
3. **Constraints** — hard limits (budget, timeline, existing system boundaries from `01_CURRENT_STATE_AUDIT.md`) that options in `05_ARCHITECTURE_OPTIONS.md` must respect.
4. **Assumptions** — anything treated as true without direct evidence, tagged with an evidence state (VERIFIED/INFERRED/ASSUMED/UNKNOWN/DISPUTED) so `09_FALSIFICATION_STANDARD.md` has something concrete to attack later.
5. **Traceability** — every requirement MUST link back to its source (idea intake, audit finding, or stakeholder input); a requirement with no traceable origin is an assumption in disguise and MUST be labeled as one.

## Ambiguity Resolution
Ambiguous or conflicting requirements MUST be resolved by returning to the source (the stakeholder, the audit evidence) — not by the requirement-writer silently picking an interpretation.

## Gate
This step has no dedicated entry in `runtime/stage-gates.yaml` — the canonical `G2_ROOT_CAUSE_ESTABLISHED` is a different concept (existing-system root-cause analysis, `applies_to: existing_system_change`), not requirement discovery for a new system. This step's own local check: reject any functional or non-functional requirement with no traceable origin, or a stated constraint that contradicts a `01_CURRENT_STATE_AUDIT.md` finding without that contradiction being explicitly flagged and resolved.
