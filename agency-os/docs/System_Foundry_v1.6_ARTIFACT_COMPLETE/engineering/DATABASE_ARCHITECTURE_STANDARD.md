# Database Architecture Standard

Schema is a compatibility surface with an owner per table/collection; no service may write to a table it does not own.

Required: an entity-relationship model kept current with the live schema, explicit constraints (foreign keys, uniqueness, check constraints) enforced at the database layer rather than assumed in application code, indexing strategy reviewed against actual query patterns, partitioning/sharding strategy stated for tables expected to grow unbounded, an explicit retention policy per data category, and a documented, periodically-rehearsed restore procedure (`assurance/RESTORE_VERIFICATION.md`).

Schema changes MUST follow the sequence in `engineering/MIGRATION_STANDARD.md`; a destructive schema change (drop column/table) MUST NOT ship in the same release that stops using it. History/audit data required for compliance MUST NOT be deletable by the same path that deletes live operational data.
