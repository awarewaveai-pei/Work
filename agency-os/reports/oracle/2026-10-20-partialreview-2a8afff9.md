# codex-oracle review -- 2026-10-20 09:21:54 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cognitive/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/design/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/hci/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/video/MODULE_MANIFEST.json, scripts/__tests__/product-manifests.test.mjs, agency-os/docs/architecture/decisions/017-entitlements-and-self-hosted-modules.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: System Foundry V17-8: one MODULE_MANIFEST.json per registered product (ten declarations of fact with file:line evidence; services = compose file + the service the product calls; env = customer-supplied names, install-generated ones in configuration.generatedByInstall). Check that the cited file:line facts are TRUE in the repo (read the cited files; paths are relative to lobster-factory/infra/hetzner-phase1-core/apps/next-admin unless they start with lobster-factory/, Projects/ or agency-os/), that no declaration claims something the code does not do, and that env/services do not miss a name the product's code reads. ADR 017: only lines 112 and 130 changed vs HEAD (the shared index is stale).
- exit: 0 | elapsed: 137906ms | answer: 3240B
- files-reviewed: agency-os/docs/architecture/decisions/017-entitlements-and-self-hosted-modules.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/MODULE_MANIFEST.json, scripts/__tests__/product-manifests.test.mjs, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cognitive/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/design/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/hci/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/video/MODULE_MANIFEST.json
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Cognitive’s manifest omits the collect service it depends on.
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cognitive/MODULE_MANIFEST.json:9` -> `.../MODULE_MANIFEST.json:16-21`
  confidence  -> CONFIRMED
  scenario    -> Cognitive is installed from this manifest -> its collection request targets `COGNITIVE_OS_COLLECTION_SERVICE_URL`, but no next-admin/collect service is installed, so research collection fails.
  why missed  -> The dependency is documented in `dependencies`, but the service list was assembled only from the cognitive compose files.

FINDING 2: Tarot batch callbacks are blocked by session middleware.
  file:line   -> `.../lib/tarot/MODULE_MANIFEST.json:10` -> `lobster-factory/packages/workflows/src/trigger/tarot-batch-generate.ts:45-60`
  confidence  -> PLAUSIBLE
  scenario    -> A Trigger worker starts a batch and calls the card route without a browser session -> middleware rejects the callback, so cards are not generated and the batch cannot complete.
  why missed  -> The manifest records the callback path but also acknowledges the missing session and says it was not tested live.

FINDING 3: Social’s customer-controlled dispatch switches are absent from `env`.
  file:line   -> `.../lib/social/MODULE_MANIFEST.json:29` -> `.../lib/social/MODULE_MANIFEST.json:22`
  confidence  -> CONFIRMED
  scenario    -> The installer consumes `env` and omits `SOCIAL_DISPATCH_ENABLED` / `SOCIAL_DISPATCH_MODE` -> dispatch remains disabled or dry-run, even though the manifest declares those switches.
  why missed  -> The names were added under free-form `configuration.switches` but not the machine-readable env array.

FINDING 4: Studio’s enablement switches are absent from `env`.
  file:line   -> `.../lib/studio/MODULE_MANIFEST.json:28` -> `.../lib/studio/MODULE_MANIFEST.json:21`
  confidence  -> CONFIRMED
  scenario    -> A customer installs Studio but the installer does not expose `POD_DESIGNS_ENABLED` or `POD_AUTO_FULFILL_ENABLED` -> Studio routes stay 503 and Woo fulfillment remains dormant.
  why missed  -> The switches are documented separately from the manifest’s declared customer environment.

FINDING 5: Design declares no module dependencies while requiring Studio and Video routes.
  file:line   -> `.../lib/design/MODULE_MANIFEST.json:9` -> `.../lib/design/MODULE_MANIFEST.json:9`
  confidence  -> CONFIRMED
  scenario    -> Design is installed without Studio/Video -> its editor buttons call unavailable or disabled Studio/script-forge routes, producing failed AI actions.
  why missed  -> The same dependency declaration says `dependsOn` is empty while admitting those buttons require other products.

FINDING 6: Video’s optional payment configuration is absent from `env`.
  file:line   -> `.../lib/video/MODULE_MANIFEST.json:27` -> `.../lib/video/MODULE_MANIFEST.json:22`
  confidence  -> CONFIRMED
  scenario    -> A customer enables media-credit sales -> the installer records `STRIPE_SECRET_KEY` but omits `MEDIA_PAYMENT_PROVIDER` or `MEDIA_CHECKOUT_ALLOWED_ORIGIN`, so checkout configuration is incomplete.
  why missed  -> The variables appear only in explanatory text, not the machine-readable env declaration.

TOTAL: 6 findings
