# ADR-019: Status-code Taxonomy and Reason Codes (OQ-13)

Status: PROPOSED — awaiting operator go-ahead
Date: 2026-08-30
Related: OQ-13 (`.ai/research/phase-0/open-questions.yaml:89-94`), `specs/execution/execution-state-machine.schema.yaml`, `specs/execution/status-codes.schema.yaml`

## Context

Nine named blocking/escalation signals, such as `DOCUMENT_RESOLUTION_BLOCKED`, `METHOD_RESOLUTION_BLOCKED`, and `LEGAL_REVIEW_REQUIRED`, describe why execution cannot continue. The Execution Contract's legal side-state vocabulary is intentionally much smaller. The existing status-code registry maps named signals to that vocabulary rather than redefining it (`specs/execution/status-codes.schema.yaml:7-24, 68-95`).

The state-machine schema independently treats the seven side states as a referenced closed vocabulary, not a second enum to expand (`specs/execution/execution-state-machine.schema.yaml:55-64`). OQ-13 asks whether those semantic signals should become top-level state-machine states or remain reasons under a legal side state.

## Decision Drivers

- State-machine correctness: transitions must remain understandable, testable, and finite.
- Observability: operators and monitors still need the semantic cause of a block or review.
- Compatibility: do not contradict the active schemas that already reference the seven-state vocabulary.
- Extensibility: a new reason must not require a transition-graph migration across every consumer.

## Options Considered

| Option | Benefits | Costs / risks |
|---|---|---|
| A. Keep a closed side-state enum; attach a semantic `reason_code` | Stable graph plus detailed cause; new reasons do not change transition legality | Consumers must inspect two fields when they need the detailed cause |
| B. Promote every semantic signal to a top-level state | A single field names both state and cause | State explosion, more transitions, and contradiction with the existing seven-state `$ref` contract |

## Recommendation

Recommend **Option A**. The state machine retains its small, closed legal side-state enum. A separate `reason_code` field carries the canonical semantic signal; its value is validated against the status-code registry. A record therefore has both a lifecycle state and a machine-readable explanation, for example `side_state: BLOCKED` with `reason_code: DOCUMENT_RESOLUTION_BLOCKED`.

This is a data-model decision, not a prose-only convention. If approved, the follow-up schema change must introduce the field at the execution-result / transition-record boundary, specify when it is required, prohibit it for incompatible successful states, and add fixtures for every currently registered signal. It must not add each signal to the legal side-state enum.

## Consequences

- Positive: state transitions stay bounded to the existing 14 primary states plus seven legal side states.
- Positive: dashboards, retries, and audits can distinguish a missing document from a budget or legal-review stop without parsing free text.
- Positive: future semantic codes are registry additions rather than graph-wide migrations.
- Negative: consumers that care about root cause must read `reason_code` in addition to `side_state`.
- Boundary: the registry remains the sole owner of reason-code definitions; the state-machine schema remains the owner of transition legality.

## Migration / Rollback

Migration is additive. Introduce `reason_code` as an optional field for existing historical records, then require it for newly emitted BLOCKED or NEEDS_HUMAN_REVIEW records only after every producer and consumer validates the new contract. Backfill only where the original evidence supports a unique code; do not infer semantic reasons from ambiguous historical text.

Rollback removes the new producer requirement while continuing to accept the field for stored records. Because the field is additive and no legal state is renamed, a Git revert of the schema/consumer rollout remains low risk.

## Evidence

- `.ai/research/phase-0/open-questions.yaml:89-94` — OQ-13 options.
- `specs/execution/status-codes.schema.yaml:7-24` — registry purpose: map named signals onto EC side states.
- `specs/execution/status-codes.schema.yaml:68-95` — the seven legal side states and final-status vocabularies are closed reference schemas.
- `specs/execution/execution-state-machine.schema.yaml:55-64` — state machine `$ref`s the seven-state vocabulary and does not redeclare it.
- `specs/execution/execution-state-machine.schema.yaml:19-24` — explicit separation of state-transition graph from named-signal mapping.
