# Mock hosting adapter (C2-1 baseline)

## Purpose
Provide a **zero-secret** staging provisioning contract for `create-wp-site` so orchestration, payloads, and `apply-manifest` handoff can be tested before a real provider (Kinsta, SpinupWP, Cloudways API, etc.) exists.

## Enable
Set:
```text
LOBSTER_HOSTING_ADAPTER=mock
```

Selection is centralized in **`resolveStagingProvisioning()`** (see `docs/hosting/HOSTING_ADAPTER_CONTRACT.md`).

## Behavior
- `maybeProvisionMockStaging()` returns a **`MockStagingSiteRef`** with:
  - deterministic **`environmentId`** (UUID-shaped, derived from `siteId`)
  - conventional **`wpRootPath`** and placeholder URLs under `mock-staging.invalid`
- **No** outbound network, **no** real servers.
- `create-wp-site` task returns `status: "mock_staging_provisioned"` and fills `next.applyManifestViaWorkflow.environmentId` + `wpRootPath` for operator binding.

## Real provider
- **`http_json`**: control-plane HTTP contract — `docs/hosting/HTTP_JSON_HOSTING_ADAPTER.md`.
- **Vendor SDK**: add `providers/<vendor>.ts` + new `LOBSTER_HOSTING_ADAPTER` mode when you need native APIs.

## Local WordPress binding
Map `wpRootPath` to a real directory on your machine when running `execute-apply-manifest-staging.mjs` or Trigger with shell execution — the mock path is a **convention**, not a created filesystem path.
