# Local artifact sink (A9 baseline)

## Purpose
Persist **full** `apply-manifest` shell stdout/stderr on disk when DB rows only store tails, and set **`package_install_runs.logs_ref`** to a stable logical key.

## Enable
```text
LOBSTER_ARTIFACTS_MODE=local
```

Plus one of:
- `LOBSTER_WORK_ROOT=D:\Work` → writes under `agency-os/reports/artifacts/lobster/apply-manifest/<workflowRunId>/`
- or `LOBSTER_ARTIFACTS_BASE_DIR=<absolute path>` (full control)

## Layout
```
apply-manifest/<workflowRunId>/
  stdout.log
  stderr.log
  meta.json
```

On shell failure before full capture:
- `error.txt`, optional `stderr.excerpt.log`, `meta.json` (`failed: true`)

## `logs_ref` format
`lobster-local-artifacts:apply-manifest/<workflowRunId>/`  
(Not a public URL; operators map to filesystem or future object storage.)

## Cloud / Trigger.dev
- Mount a volume and keep **`local`**, or
- Use **`remote_put`** (presigned PUT) — `docs/operations/REMOTE_PUT_ARTIFACTS.md`, or
- Unset `LOBSTER_ARTIFACTS_MODE` (no full log persistence).
