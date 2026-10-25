# Card 05 — social: claim a Postiz channel no brand owns yet

回報操作者一律繁體中文。

App root: `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/` (all paths below are relative to it).

## Decision

- The social channel list reads only `social_accounts` (`lib/social/store.ts:220-223` `listAccounts`). A row is created only by `resolveConnectAttempt` (`lib/social/store.ts:274-318`), i.e. only when the connect flow was started from the social page. A channel added directly in Postiz (postiz.aware-wave.com/launches) never appears. Add a claim path so that whole class is recoverable.
- `listUnclaimedIntegrations()` in `lib/social/store.ts`: `listAllIntegrations()` (imported at `lib/social/store.ts:12`) minus every `postiz_integration_id` already in `social_accounts` for `postiz_instance = POSTIZ_INSTANCE` (same ownership query as `lib/social/store.ts:296-299`). Returns `{ id, identifier, name, disabled }[]`. No new table.
- `claimIntegration(brandId, integrationId)` in `lib/social/store.ts`: re-fetch the live list; unknown id → error (404); already owned → error (409); else insert exactly the row shape of `lib/social/store.ts:303-305` (`organization_id, postiz_integration_id, platform: identifier, label: name, status: disabled ? "expired" : "connected", ...profileOf(i)`). Insert error `23505` → 409 (race, like `:306`). Log via `logAction(sb, brandId, <actor>, "connected", { account_id, platform, claimed: true })`.
- API: new route `app/api/social/accounts/claim/route.ts` — `GET` lists unclaimed, `POST { brand, integration_id }` claims. Both call `requireStaffForNewChannel(req)` first (same guard as `app/api/social/accounts/route.ts:30`, imported from `@/lib/social/authz`), and POST also `requireBrandRole` with `WRITE_ROLES` as the existing POST does. Follow that file's error/response conventions.
- UI: in `app/(shell)/tools/social/Settings.tsx` channel section, a visible button 「認領 Postiz 上的頻道」; clicking it loads the list and shows each unclaimed channel (platform + name) with a button 「綁到這個品牌」; after success refresh the account list. Client calls go through `app/(shell)/tools/social/api.ts`. No dropdown/select. Use existing theme tokens/classes already used in Settings.tsx.

## Constraints

- Do not loosen or bypass `requireStaffForNewChannel` or `requireBrandRole`.
- Do not change `resolveConnectAttempt`, `listAccounts` or the existing `accounts/route.ts` behaviour.
- No migration, no deploy, no new dependency.

## Files

- `lib/social/store.ts`
- `app/api/social/accounts/claim/route.ts` (new)
- `app/(shell)/tools/social/api.ts`
- `app/(shell)/tools/social/Settings.tsx`
- `app/api/social/__tests__/claim.test.ts` (new; mock pattern from `app/api/social/__tests__/routes.test.ts`)

## Acceptance

- `app/api/social/__tests__/claim.test.ts` has exactly these tests and they pass:
  1. `claimIntegration` rejects an integration id that `social_accounts` already owns (409, no insert called).
  2. `GET` and `POST` on the claim route return 403 when the caller is not staff (`requireStaffForNewChannel` throws).
- Mutation (once): remove the `requireStaffForNewChannel` call from the claim route → test 2 goes red; restore → green. Report both runs.
- `npx tsc --noEmit` green; `npm test` green.
- Diff touches only the Files list.
