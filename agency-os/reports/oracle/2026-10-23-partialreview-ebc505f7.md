# codex-oracle review -- 2026-10-23 20:56:30 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/grant.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/route-features.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/kb/rag.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/customer-drill.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/draft/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/generate/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/render-draft/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/regenerate-image/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/story-bibles/generate-portrait/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/generate/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/trending/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/publish/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-knowledge/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/collection-sources/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/VideoStudio.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: next-admin ADR 017: close the class 'paid work outside any withFeature scope is judged and metered as the internal account/system'. withFeature gains an org option (route's own org resolver -> actorFor); scope remembers the authorized org so a library naming that same org is not refused; staff back-office tooling inside a customer scope stays internal; rag embedder names the org; 11 paid routes wrapped; gate 4 extended to all API routes with UNSCOPED_ROUTES list; drill case staff renders for soulful. Attack: staff billing/acting for an org with no role; abuse of same-org or staffTooling rules; ALS scope leak; billed org differs from the org the work lands in; gate false-green. Also verify: does this change depend on something NOT visible in this diff (config, env default like POD_DESIGNS_DEFAULT_ORG_ID, schema, upstream default)? If it contradicts the change, report it. If you cannot support a real finding, return no findings; do not invent weak ones.
- exit: 0 | elapsed: 750051ms | answer: 2281B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/VideoStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/generate/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/trending/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/collection-sources/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-knowledge/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/publish/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/draft/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/generate/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/regenerate-image/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/render-draft/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/story-bibles/generate-portrait/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/customer-drill.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/grant.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/route-features.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/kb/rag.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Staff authorization is fail-open when `ENTITLEMENT_MODE` is unset
  file:line   -> `lib/entitlements/can.ts:65-67`, `lib/entitlements/can.ts:189-193`, `lib/entitlements/grant.ts:81-96`
  confidence  -> CONFIRMED
  scenario    -> Staff operator without a role for a customer calls regenerate-image -> `actorFor` rejects, but shadow mode mints an allowed grant and the image is generated anyway.
  why missed  -> The drill explicitly uses enforce mode at `customer-drill.test.ts:101`; it does not test the runtime default.

FINDING 2: Explicit same-org back-office calls are still charged/refused as customer work
  file:line   -> `lib/entitlements/grant.ts:25-26`, `lib/entitlements/grant.ts:38-43`
  confidence  -> CONFIRMED
  scenario    -> Customer-scoped staff code calls `grantFor("ops.cheap-json", { orgId: customerOrg })` -> the named org prevents `staffTooling` from selecting internal, so the customer subject receives `back_office_only`.
  why missed  -> The drill only tests the unqualified call at `customer-drill.test.ts:104-115`.

FINDING 3: Video generation can complete without registering the finished asset
  file:line   -> `docker-compose.yml:460`, `lib/content/blocks/video-pipeline.ts:128-130`, `lib/content/blocks/video-pipeline.ts:113`, `app/api/video/generate/route.ts:154-165`, `app/api/video/status/route.ts:121-169`
  confidence  -> CONFIRMED
  scenario    -> `POD_DESIGNS_DEFAULT_ORG_ID` is unset and staff calls `/api/video/generate` without an org -> output uses `noorg_`, no `recordParams` are stored, status returns done without `recordVideoAsset`, and reconciliation skips the unowned key.
  why missed  -> The route allows nullable `orgId` despite the compose default being empty.

FINDING 4: Gate 4 is false-green for partially scoped routes
  file:line   -> `lib/portal/__tests__/registry-code.test.ts:285-291`
  confidence  -> CONFIRMED
  scenario    -> A route directly asks one feature but invokes another paid `grantFor` before or outside its `withFeature` scope -> `FILES.get(r).asked.length > 0`, so `unscoped(r)` is false and the test passes while the second call runs unscoped.
  why missed  -> The check verifies only zero-versus-nonzero direct asks, not that every paid call is inside the authorized scope.

TOTAL: 4 findings
