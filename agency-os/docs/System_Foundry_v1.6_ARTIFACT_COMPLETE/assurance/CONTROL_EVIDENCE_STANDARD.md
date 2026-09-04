# Control Evidence Standard

A control (security, compliance, or operational) is only proven operating when there is independent evidence it ran and worked — a documented policy with no operating evidence is not a control, it is an intention.

Required per control: a named owner accountable for it, a description of how it is technically implemented (not just what it's meant to achieve), test/operating evidence with a timestamp, a review date establishing when it was last confirmed still operating, and any active exceptions with their expiry (`governance/EXCEPTION_STANDARD.md`).

Self-attestation with no independent check ("the owner says it's fine") is insufficient for any control above the lowest risk tier — it MUST be paired with an artifact (test result, scan output, audit log sample) another party can inspect. Control evidence exceeding its freshness SLA MUST be marked `STALE_EVIDENCE` (`assurance/POLICY_FRESHNESS_STANDARD.md`), not silently treated as still valid.
