# Restore Drill Record (P0-10)

`13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:60`: a **rehearsed, cross-box** restore drill ("not a same-box verify") is a precondition for Wave 4 admitting real tenant data.

## Mechanism

`.github/workflows/hci30-restore-drill.yml`. Two GitHub Actions jobs on two independently-provisioned runner VMs, connected only by an uploaded artifact (no shared filesystem):

1. **produce-dump** — applies all 11 Wave 1 migrations + fixtures, records a per-table row-count marker, `pg_dump -Fc`, `pg_dumpall --roles-only` (captured for a future generic-replay drill, not consumed by this one), uploads both + the marker as an artifact.
2. **restore-and-verify** — downloads the artifact, recreates the two app roles (`hci_app_test_a`/`hci_app_test_b` — cluster-scoped, not inside a database-scoped dump, see Findings below), `pg_restore`, re-checks the row-count marker, then re-runs the **existing** `database/tests/wave1-negative-tests.sql` suite against the restored schema — proof that RLS/triggers/grants survive the cycle, not just that `pg_restore` exited 0.

Why this satisfies "cross-box" today: the dev machine this repo is normally worked on has no second non-production box. The only other machine is `ks-aw-01` (production); putting synthetic HCI data on it would violate this product's own test/prod isolation (`README.md`). Two separate, ephemeral GitHub Actions runners are a genuine second box at zero infrastructure cost.

Triggers: `workflow_dispatch` (on demand) and `push` to `main` touching `Projects/internal/hci30/database/**` — a future migration automatically re-verifies restorability, not a one-time checkbox.

## What this does NOT prove

Restore timing/RPO/RTO at real data volume (this is the Wave 1 synthetic fixture set). Restore of anything beyond the `hci` schema. A drill against `ks-aw-01` itself (deliberately never rehearsed against production, see above).

## Findings from actually running it (not assumed going in)

- **Cluster-scoped roles are outside a database-scoped `pg_dump`.** `hci_app_test_a`/`hci_app_test_b` are `CREATE ROLE` (cluster-level); `pg_dump <db>` only captures database objects and the GRANTs referencing those role *names* — restoring into a cluster that never had the roles would either fail or silently drop the GRANTs, depending on `pg_restore`'s per-statement error handling. Fixed by recreating both roles (same DDL as `migrations/0001_wave1_synthetic_up.sql`) before `pg_restore`, not by discovering this during a real incident.
- **First real run (`34137801181`) failed, and correctly so** — not the restore, the drill's own marker-checkpoint design. The negative-test suite legitimately `INSERT`s rows as part of its own assertions (DSR lifecycle, Case lifecycle); running it *before* the row-count comparison compared "source pre-test" against "target post-test" and never had a chance to match, independent of restore correctness. Fixed (`7c9584123`) by moving the comparison to immediately after `pg_restore`, before the suite runs, on both sides.

## Drill log

| Run | Result | Source job | Target job | Row-count marker | Negative-test suite (restored schema) |
|---|---|---|---|---|---|
| [34137801181](https://github.com/awarewaveai-pei/Work/actions/runs/34137801181) (2026-09-07) | FAILED — marker-checkpoint bug (see Findings), not a restore defect | 28s | 20s | MISMATCH (test-suite inserts counted against a pre-test source snapshot) | ran, passed (unaffected by the bug) |
| [34138260481](https://github.com/awarewaveai-pei/Work/actions/runs/34138260481) (2026-09-07) | **PASSED** | 40s | 31s | MATCH, all 6 tracked tables (`tenants`, `cases`, `subject_records`, `principals`, `data_subject_requests`, `data_subject_request_events`) | 232 PASS / 0 FAIL |

## What is not yet built

Restore of a populated **real-data** instance (Wave 4+, gated separately — this drill only ever runs against the synthetic Wave 1 fixture set, by the same isolation rule that keeps this whole skeleton off `ks-aw-01`). A generic (not two-hardcoded-roles) role-replay path using the already-captured `pg_dumpall --roles-only` output, for when the app-role set grows beyond two. Timing/RPO/RTO measurement at realistic data volume.
