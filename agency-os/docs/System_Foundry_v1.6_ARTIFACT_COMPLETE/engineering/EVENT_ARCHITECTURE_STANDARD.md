# Event Architecture Standard

Every event is a compatibility surface (`engineering/COMPATIBILITY_DEPRECATION_STANDARD.md`) with a single owning producer; consumers MUST NOT assume undocumented fields will remain stable.

Required: a documented schema per event type (AsyncAPI or equivalent) with explicit versioning, a stated delivery guarantee (at-least-once vs. exactly-once vs. at-most-once — never left implicit), idempotent consumers assumed by default given at-least-once delivery is the common case, the transactional outbox pattern (or equivalent) where an event must be published atomically with a state change, a replay/backfill capability for reprocessing a time range, and a dead-letter path for events a consumer cannot process, with alerting rather than silent drop.

Schema evolution MUST be additive/backward-compatible by default; a breaking event schema change MUST follow `engineering/MIGRATION_STANDARD.md`'s sequence, with both old and new schema versions in flight during the dual-compatibility/backfill stages. An event MUST NOT be the only record of a fact — the system emitting it MUST also durably persist the fact it represents.
