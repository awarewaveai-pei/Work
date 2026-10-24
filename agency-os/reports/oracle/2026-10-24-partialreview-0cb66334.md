# codex-oracle review -- 2026-10-24 21:44:01 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/DoorNav.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ProductDoorShell.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/globals.css, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/features.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/use-paid-features.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/__tests__/door-nav.test.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/entitlements/features/route.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Operator decision: every product door shows its feature list in a left menu; features the account holds look normal, ones it does not hold are greyed; the tool area is unchanged. Every feature is bought separately or given by us. (1) DoorNav becomes a left column (.door-side) on every door: product name, the door.nav pages, and the registry features of that product, greyed by usePaidFeatures().canUse (the signed list from GET /api/entitlements/features). (2) The signed list keys widen from route features to route features plus every feature of a product with a next-admin door (listedFeatureKeys), because social.dispatch, social.auto-reply and video.motion are asked outside a route and were missing (a missing key reads as usable). Cognitive methods (about 300, external door) stay out. (3) .door-main becomes a row: side + .door-content (tool + logout foot); colours use the sidebar tokens. Verify: does widening the list change anything a route or button already relied on (cache key, signature, cost per call: one verdictOf per key); can the menu show a feature as held when it is not (loading, error, shadow vs enforce for a customer); does the not-enabled page still render correctly inside the new row layout.
- exit: 0 | elapsed: 268319ms | answer: 1133B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/DoorNav.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ProductDoorShell.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/globals.css, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/features.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/__tests__/door-nav.test.tsx
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Failed entitlement loading makes every menu feature appear enabled.
  `apps/next-admin/lib/entitlements/use-paid-features.ts:11-15,27` -> `apps/next-admin/app/DoorNav.tsx:30-31`
  confidence  -> CONFIRMED
  scenario    -> Customer lacks `video.tts`, but `/api/entitlements/features` errors -> `features` remains null, `canUse()` returns true, and the feature is rendered normal instead of greyed.
  why missed  -> The existing hook intentionally treats loading/errors as usable, but the new menu now exposes that optimistic fallback as entitlement status.

FINDING 2: The new test does not verify the default signed-list key set.
  `apps/next-admin/app/__tests__/door-nav.test.tsx:21-24` -> `apps/next-admin/lib/entitlements/features.ts:32`
  confidence  -> CONFIRMED
  scenario    -> `featureList()` regresses to `routeFeatureKeys()` while `listedFeatureKeys()` remains correct -> the test still passes, but `social.dispatch` is omitted and the menu treats the missing key as usable.
  why missed  -> The test checks the helper directly, never calls `featureList()` without an explicit `keys` argument.

TOTAL: 2 findings
