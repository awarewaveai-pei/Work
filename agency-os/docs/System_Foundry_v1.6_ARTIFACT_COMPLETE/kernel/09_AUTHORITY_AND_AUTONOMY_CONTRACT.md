# 09 — Authority and Autonomy Contract

## Invariant
An agent is an executor, never the source of authority. Every side-effecting action MUST resolve an explicit authority grant before execution.

## Authority Levels
- **A0 READ_ONLY** — inspect, search, calculate, compare. No repository or external side effects.
- **A1 LOCAL_REVERSIBLE** — create/update disposable local artifacts; no protected branch, production, secrets, money, customer communication, or irreversible mutation.
- **A2 SCOPED_CHANGE** — bounded repository/data changes with reviewed change-plan, tests, rollback, and blast-radius proof.
- **A3 RELEASE_AUTHORITY** — merge/release/deploy within an approved environment and release policy.
- **A4 HUMAN_SOVEREIGN** — irreversible/high-impact actions: destructive production data operations, security-boundary changes, legal/financial commitments, external publication/communication, or accepted residual critical risk.

## Mandatory Resolution Pipeline
`Agent -> Intent -> Risk Tier -> Policy -> Tool Permission -> Required Authority -> Human/Auto Grant -> Execute -> Audit Event -> Verify`

If any stage cannot resolve deterministically: `AUTHORITY_UNRESOLVED` and STOP.

## Non-delegable Controls
A parent agent MAY delegate work, but MUST NOT delegate more authority than it holds. A child agent MUST inherit all kernel restrictions. A tool being technically available does not imply permission to use it.
