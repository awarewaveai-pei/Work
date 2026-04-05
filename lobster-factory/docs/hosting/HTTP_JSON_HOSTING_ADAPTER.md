# HTTP JSON hosting adapter (`http_json`)

## When to use
- You operate a **small control-plane HTTP service** (or reverse proxy to a vendor) that can create or look up a staging site and return paths/URLs for `apply-manifest`.
- Set `LOBSTER_HOSTING_ADAPTER=http_json` plus base URL and token (see below).

## Environment
| Variable | Required | Default |
|----------|----------|---------|
| `LOBSTER_HOSTING_PROVIDER_BASE_URL` | Yes | — |
| `LOBSTER_HOSTING_API_TOKEN` | Yes | — |
| `LOBSTER_HOSTING_PROVISION_PATH` | No | `/v1/lobster/staging-provision` |
| `LOBSTER_HOSTING_HTTP_TIMEOUT_MS` | No | `45000` (clamped 1000–120000) |

## Request
`POST` to `new URL(LOBSTER_HOSTING_PROVISION_PATH, LOBSTER_HOSTING_PROVIDER_BASE_URL)`.

Headers:
- `Content-Type: application/json`
- `Authorization: Bearer <LOBSTER_HOSTING_API_TOKEN>`

JSON body:
```json
{
  "organizationId": "<uuid>",
  "siteId": "<uuid>",
  "siteName": "<string>"
}
```

## Success response
HTTP **2xx** with JSON body:
```json
{
  "environmentId": "<opaque or uuid>",
  "wpRootPath": "/var/www/...",
  "stagingSiteUrl": "https://staging.example/...",
  "wpAdminUrl": "https://staging.example/.../wp-admin/",
  "provisioningNotes": ["optional", "strings"]
}
```

All URL fields must be absolute URLs (`https://...`). `provisioningNotes` may be omitted.

## Errors
Non-2xx: Lobster returns `blocked_hosting_configuration` with the response body snippet when possible. Invalid JSON or schema mismatch is also blocked (no partial apply).

## Code
- Adapter: `packages/workflows/src/hosting/providers/httpJsonStagingAdapter.ts`
- Resolver: `packages/workflows/src/hosting/resolveStagingProvisioning.ts`

## Related
- `docs/hosting/HOSTING_ADAPTER_CONTRACT.md`
- `packages/workflows/src/hosting/providers/stagingProvisionContract.ts`
