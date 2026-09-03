# Compatibility and Deprecation Standard

Public APIs/events/schemas/CLI contracts/configuration and stored data formats are compatibility surfaces.

Each surface MUST define versioning semantics, supported versions, change policy, migration path, telemetry of active consumers, EOL dates, and rollback behavior. Prefer expand/migrate/contract. Never delete a compatibility surface solely because code search finds no local consumer; prove external/operational consumers too.
