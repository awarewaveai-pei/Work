# Hosting provider implementations

Add one file per vendor under this folder, implement **`StagingProvisionAdapter`** from `stagingProvisionContract.ts`, then register the mode in **`resolveStagingProvisioning.ts`**.

## Suggested layout

| File | Vendor | Status |
|------|--------|--------|
| `mock` | — | Implemented in `../mockStagingAdapter.ts` (not here) |
| `providerStubAdapter.ts` | — | Env gate + Phase 1 block (`../providerStubAdapter.ts`) |
| `httpJsonStagingAdapter.ts` | Control-plane HTTP | **Implemented** — `LOBSTER_HOSTING_ADAPTER=http_json` |
| `kinsta.ts` (future) | Kinsta API | Not started |
| `spinupwp.ts` (future) | SpinupWP | Not started |

## Rules
- Staging-first; no production side effects without approval policy elsewhere.
- Never log secrets; read tokens from env only.
- Return **`StagingProvisionBlocked`** with `missingEnv` when configuration is incomplete.

## Tests
- Add vendor-specific integration tests outside Trigger when API keys exist.
- Repo structural gate: `scripts/validate-workflows-integrations-baseline.mjs`.
