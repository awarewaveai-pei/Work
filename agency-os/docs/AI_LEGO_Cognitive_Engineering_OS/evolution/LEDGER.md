# Evolution ledger (I9/C9, RESEARCH_LINES_MASTER_PLAN.md §3.8)

One row per promotion or rollback, appended by `ai_lego.apps.cli.evolution` (never
edited or reordered by hand after the seed row below). `version_before` is `-` for a
kind's first version. `version_sha256` is the sha256 of the version file the row
installed -- versions are immutable, `ledger_errors` and runtime `load_champion` check
the file still has those bytes. `evidence_sha256` is the sha256 of the `--evidence`
file (for a rollback: of LEDGER.md before the row); the seed row below has none (`-`,
no harness run yet -- see WC-P2-04/WC-P2-09) and no approver (R2 needs none).

| utc_time | kind | action | version_before | version_after | version_sha256 | evidence_sha256 | approved_by |
|---|---|---|---|---|---|---|---|
| 2026-09-26T00:00:00Z | synthesis-prompts | promote | - | v1 | 1b149a9c8cd378922a2b7d475e6ccf95f08859961f034c707280ebcf829ecdb5 | - | - |
