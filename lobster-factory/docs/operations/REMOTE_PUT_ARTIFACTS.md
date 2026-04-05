# Remote PUT artifacts (R2 / S3 presigned, no SDK)

## Purpose
When `LOBSTER_ARTIFACTS_MODE=local` is not viable (Trigger.dev cloud, ephemeral disk), upload **full** `apply-manifest` logs via **HTTP PUT** to presigned URLs — same DB fields as local: `logs_ref` + `output_snapshot.logsRef`.

This contract is intentionally **provider-neutral**. Cloudflare R2 and AWS S3 both work as long as the presign broker returns the same descriptor schema.

## Enable
```text
LOBSTER_ARTIFACTS_MODE=remote_put
```

Aliases accepted: `presigned_put`, `r2_put`, `s3_put`.

## How URLs are supplied (pick one)

### A) Presign broker URL (recommended)
Set **`LOBSTER_ARTIFACTS_PRESIGN_URL`**. Worker **POSTs** JSON:

```json
{
  "trigger": "apply-manifest",
  "workflowRunId": "<uuid>",
  "packageInstallRunId": "<uuid>",
  "files": ["stdout.log", "stderr.log", "meta.json"]
}
```

On shell failure, `files` may be `["error.txt", "meta.json"]` or include `"stderr.excerpt.log"` when stderr tail exists.

Optional auth: **`LOBSTER_ARTIFACTS_PRESIGN_TOKEN`** → `Authorization: Bearer …`.

Response **200** JSON (schema):

```json
{
  "puts": {
    "stdout.log": { "url": "https://…", "headers": {}, "contentType": "text/plain; charset=utf-8" },
    "stderr.log": { "url": "https://…" },
    "meta.json": { "url": "https://…", "contentType": "application/json" }
  },
  "logsRef": "optional stable key or public prefix for operators"
}
```

- `headers` — merged into PUT (e.g. `x-amz-*` if your signer requires them).
- `contentType` — sets `Content-Type` if not already in `headers`.
- `logsRef` — if omitted, Lobster uses `lobster-remote-artifacts:apply-manifest/<workflowRunId>/`.

### B) Inline descriptor (CI / one-shot)
Set **`LOBSTER_ARTIFACTS_PUT_DESCRIPTOR_JSON`** to the same JSON shape as the presign **response** (the `puts` + optional `logsRef` object). No POST is made.

## Tunables
| Variable | Default |
|----------|---------|
| `LOBSTER_ARTIFACTS_PRESIGN_TIMEOUT_MS` | `30000` |
| `LOBSTER_ARTIFACTS_PUT_TIMEOUT_MS` | `120000` |

## Code
- `packages/workflows/src/artifacts/artifactMode.ts`
- `packages/workflows/src/artifacts/remotePutArtifactSink.ts`
- `packages/workflows/src/trigger/apply-manifest.ts`

## Related
- `docs/operations/LOCAL_ARTIFACTS_SINK.md` (local disk mode)
- `docs/operations/PRESIGN_BROKER_MINIMAL.md`（presign 服務／靜態 descriptor 最小整合）
- `templates/lobster/presign-response.success.example.json`（成功路徑 JSON 形狀範例）
- `policies/artifacts/artifacts-governance-baseline.json`（provider strategy + portability guardrails）
- `docs/operations/R2_TO_S3_MIGRATION_RUNBOOK.md`（R2 -> S3 實作切換流程）
