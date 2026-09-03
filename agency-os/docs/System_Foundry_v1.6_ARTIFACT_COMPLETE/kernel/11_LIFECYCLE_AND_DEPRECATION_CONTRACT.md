# 11 — Lifecycle, Compatibility, Deprecation and Retirement Contract

Every public contract, schema, API, event, module, provider adapter, data format and operational process MUST have a lifecycle state.

`PROPOSED -> ACTIVE -> DEPRECATED -> RETIRING -> RETIRED`

A deprecation MUST define: replacement, compatibility window, affected consumers, telemetry proving usage, migration recipe, communication plan, rollback, removal criteria, and archive/evidence retention.

Breaking removal without measured consumer impact and migration evidence is forbidden.

Long-lived systems MUST prefer additive/expand-contract migration over flag-day replacement. Compatibility shims MUST have owners and expiry dates.
