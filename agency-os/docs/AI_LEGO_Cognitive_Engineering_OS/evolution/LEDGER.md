# Evolution ledger (I9/C9, RESEARCH_LINES_MASTER_PLAN.md §3.8)

One row per promotion or rollback, appended by `ai_lego.apps.cli.evolution` (never
edited or reordered by hand after the seed row below). `version_before` is `-` for a
kind's first-ever promotion. `evidence_sha256` is the sha256 of the `--evidence` file
the CLI call named; for the seed row below it is the sha256 of the ported v1.yaml
itself (there is no harness run yet to point at -- see WC-P2-04/WC-P2-09).

| utc_time | kind | action | version_before | version_after | evidence_sha256 | approved_by |
|---|---|---|---|---|---|---|
| 2026-09-26T00:00:00Z | synthesis-prompts | promote | - | v1 | 48e9cc51f73cfa60d14b5a0df24a8daaa28fafdabf1aec6e1b698155384d9a6a | operator |
