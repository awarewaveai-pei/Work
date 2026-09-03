# Foundry Failure Policy

The runtime fails closed when quality-critical information is absent.

## Mandatory stop codes
- `INSUFFICIENT_EVIDENCE`
- `ROOT_CAUSE_NOT_ESTABLISHED`
- `CURRENT_STATE_NOT_UNDERSTOOD`
- `ARCHITECTURE_CONFLICT`
- `ROLLBACK_NOT_PROVEN`
- `MIGRATION_NOT_PROVEN`
- `INDEPENDENCE_VIOLATION`
- `UNBOUNDED_BLAST_RADIUS`
- `CONTRACT_COMPATIBILITY_UNPROVEN`
- `SECURITY_REVIEW_REQUIRED`
- `NEEDS_HUMAN_DECISION`
- `NEEDS_PROTOTYPE`
- `NEEDS_BENCHMARK`
- `NEEDS_EXTERNAL_REVIEW`
- `NEEDS_LEGAL_REVIEW`

## Behavior
A stop code blocks downstream implementation or approval until resolved. The runtime must never silently downgrade a stop to a warning.
