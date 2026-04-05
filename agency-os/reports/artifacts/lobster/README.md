# Lobster local artifacts

When `LOBSTER_ARTIFACTS_MODE=local`, `apply-manifest` may write shell logs here:

`apply-manifest/<workflowRunId>/stdout.log` (etc.)

Configure via `LOBSTER_WORK_ROOT` (parent of `agency-os`) or `LOBSTER_ARTIFACTS_BASE_DIR`.

Spec: `lobster-factory/docs/operations/LOCAL_ARTIFACTS_SINK.md`

For cloud workers, use **`LOBSTER_ARTIFACTS_MODE=remote_put`** (presigned PUT): `lobster-factory/docs/operations/REMOTE_PUT_ARTIFACTS.md`.
