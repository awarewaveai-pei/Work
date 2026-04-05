# Hosting adapter contract (staging)

## Entry point
- **`resolveStagingProvisioning()`** — `packages/workflows/src/hosting/resolveStagingProvisioning.ts`  
  Used by **`create-wp-site`** before DB insert (except `blocked`, which returns early).

## `LOBSTER_HOSTING_ADAPTER` values

| Value | Behavior |
|--------|-----------|
| `none` | Default when unset. No synthetic env; `next.*` stays TODO placeholders. |
| `mock` | Deterministic fake `environmentId` + paths (no network). |
| `provider_stub` | Validates `LOBSTER_HOSTING_PROVIDER_BASE_URL` + `LOBSTER_HOSTING_API_TOKEN`; then returns **blocked** (gate-only; use `http_json` for real HTTP). |
| `http_json` | POST JSON to your control plane; maps response into staging ref. See **`docs/hosting/HTTP_JSON_HOSTING_ADAPTER.md`**. |
| *anything else* | **blocked** — unknown adapter name. |

## Vendor-specific modules
Implement **`StagingProvisionAdapter`** in `packages/workflows/src/hosting/providers/<vendor>.ts` (see `providers/README.md` + `stagingProvisionContract.ts`), register a new `LOBSTER_HOSTING_ADAPTER` mode in `resolveStagingProvisioning.ts`, or front your vendor with the **`http_json`** contract above. Return values must remain compatible with **`apply-manifest`** inputs (`environmentId`, `wpRootPath`, …).

## Related
- `docs/hosting/MOCK_HOSTING_ADAPTER.md`
