# Error Recovery & Operator Safety Standard

## Required classification
Each user/operator action is classified by reversibility, blast radius, privilege, data sensitivity, and external side effects.

## Mandatory controls
- SAFE: direct execution permitted with observable result
- REVERSIBLE: execution must expose undo/rollback/compensation semantics
- HIGH_IMPACT: preview + explicit confirmation + authority check + audit
- IRREVERSIBLE: dual control or explicit elevated approval when risk warrants; exact consequence disclosed before commit

## Recovery contract
Every failure path defines: state before, state after failure, committed side effects, retry safety, idempotency key where relevant, recovery action, owner, audit evidence, and expected final state.

## Prohibitions
- success message before durable success is known
- generic "something went wrong" as the only recovery information for operator-critical flows
- blind retry of non-idempotent side effects
- destructive defaults
- implicit privilege escalation
