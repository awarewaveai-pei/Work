# ADR-020: Normative-strength Marking for Mother Documents (OQ-14)

Status: PROPOSED — awaiting operator go-ahead
Date: 2026-08-30
Related: OQ-14 (`.ai/research/phase-0/open-questions.yaml:95-100`), ADR-006, Master Plan §0.0

## Context

The Master Plan deliberately contains both normative instruction and abbreviated illustrative material. It says that readers must not infer complete method behavior from its brief examples (`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:43-49`), yet the document does not consistently mark whether a nearby statement is a binding requirement, an example, or a long-horizon vision. OQ-14 identifies this ambiguity as the cause of examples being treated as requirements.

The problem is architectural, not editorial: a future human or agent cannot reliably decide whether to compile, test, or enforce a sentence if its normative strength is only implied by prose position or tone.

## Decision Drivers

- Correctness: implementation and tests must derive obligations only from content that is explicitly normative.
- Maintainability: the marker must be additive and locally reviewable, not require a wholesale rewrite.
- 30-year survivability: future agents need a machine- and human-legible signal that survives changes in prose style.
- Minimum blast radius: preserve the mother documents' explanatory role and existing scoped-authority structure.

## Options Considered

| Option | Benefits | Costs / risks |
|---|---|---|
| A. Mark each revised section as `NORMATIVE`, `EXAMPLE`, or `VISION` | Fixes the ambiguity at its source while preserving explanatory content | Requires disciplined marking during future governed revisions |
| B. Move all normative content into machine-readable specs; mother documents become narrative-only | Strong separation for fully compiled content | Large rewrite surface; risks stripping rationale from the documents and creating gaps before every statement is compiled |
| C. Leave interpretation implicit | No migration work | Repeats the existing ambiguity and permits examples to become accidental requirements |

## Recommendation

Recommend **Option A**. During Phase 2 revisions, add an explicit normative-strength marker to every section that is changed and to every new section. The three allowed markers are:

- `NORMATIVE`: binding requirement or prohibition; downstream machine specifications and tests may derive enforcement from it.
- `EXAMPLE`: non-exhaustive illustration; it must not create a requirement beyond an explicitly cited normative source.
- `VISION`: strategic intent or design direction; it is not independently enforceable until translated into an approved normative contract.

Existing untouched sections are not retroactively reclassified by assumption. They remain `UNCLASSIFIED_LEGACY` for migration tracking until revised through ADR-006. A later bounded inventory proposal may classify legacy sections, but it must preserve the original text and record the basis for every label.

## Consequences

- Positive: examples cannot silently become compliance or implementation requirements.
- Positive: machine specs can cite `NORMATIVE` sources without treating vision prose as an executable contract.
- Positive: the marker is additive and can be rolled out section by section with a narrow audit trail.
- Negative: authors must make intent explicit, which can expose unresolved wording that previously remained ambiguous.
- Negative: legacy content needs a deliberate migration backlog; it must not be falsely treated as fully classified on day one.
- Boundary: this ADR does not move all normative content out of the mother documents, rewrite existing sections wholesale, or change any requirement before a separately approved ADR-006 proposal applies the marker.

## Migration / Rollback

Migration is incremental. Each marker addition is a `boundary_clarification` proposal under ADR-006 with an exact Original/Proposed diff, a cited source for the classification, and a rollback commit. Prioritize sections that feed schemas, policies, gate rules, or high-risk operational behavior.

Rollback reverts the individual proposal that introduced a disputed marker. The underlying prose remains recoverable from Git history and the retained proposal; no data or runtime migration is required.

## Evidence

- `.ai/research/phase-0/open-questions.yaml:95-100` — OQ-14 options and root cause.
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:43-49` — explicit warning that brief Master Plan examples do not define complete method behavior.
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:14-20` — the Master Plan already distinguishes its broad architecture scope from the Atlas's method authority.
- `docs/adr/ADR-006-mother-doc-revision-flow-and-repo-layout.md` — per-change proposal, approval, baseline, and rollback requirements.
