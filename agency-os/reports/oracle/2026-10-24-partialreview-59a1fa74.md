# codex-oracle review -- 2026-10-24 14:49:04 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/brand-voice.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/brand-voice-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/brand-voice.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/syndicate-brand.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/site-row-gate.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/video-script-brand.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/write-posts.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/write-posts.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `fd172fe2a..30b6a022f`
- context: Catch-up review: the earlier reviews of AUTO_CONTENT P1 (7d8d618a4) and P2 (30b6a022f) never saw these new files (the oracle's -Path filter dropped untracked files; fixed today). P1: lib/content/brand-voice.ts (shared brand shape and the one renderer, no server imports) and brand-voice-store.ts (loadSiteBrand; siteVoiceFor = siteId -> 404 unless canAccessOrg on the site's organization). P2: lib/social/write-posts.ts (writeSocialPosts: hard limits only from limits.ts BODY_LIMITS, Threads in UTF-8 bytes, thread per line, one shorter rewrite, tooLong never sent; the only Postiz->writer map). Check tenant leaks, prompt or length bugs, parse failures, and tests that would stay green while the guard they claim to test is broken.
- exit: 0 | elapsed: 258316ms | answer: 1293B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/brand-voice.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/site-row-gate.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/syndicate-brand.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/brand-voice-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/brand-voice.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/video-script-brand.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/write-posts.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/write-posts.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Invalid platform values are silently accepted as successful output
  `write-posts.ts:126 -> write-posts.ts:138`
  confidence  -> CONFIRMED
  scenario    -> AI returns `{"facebook":123}` -> `parsePosts` returns no Facebook post, `tooLong` is empty, and the caller receives success with no error.
  why missed  -> Tests cover malformed JSON syntax, not valid JSON with missing or non-string requested values.

FINDING 2: `[LINK]` can be published literally when no article URL is provided
  `write-posts.ts:102 -> write-posts.ts:53`
  confidence  -> CONFIRMED
  scenario    -> `articleUrl` is omitted and the model returns an Instagram post containing `[LINK]` -> replacement is skipped and `textsForAccounts` sends the literal placeholder.
  why missed  -> The test only verifies replacement when a URL exists.

FINDING 3: Tenant tests do not verify that the requested site ID reaches Supabase
  `site-row-gate.test.ts:6 -> site-row-gate.test.ts:27`
  confidence  -> CONFIRMED
  scenario    -> `siteRowGate` drops or corrupts its `.eq("id", siteId)` filter -> the mock still returns the fixed `m.row`, so all ownership assertions remain green.
  why missed  -> The mocked `.eq` ignores every column and value; tests validate only the injected row’s organization.

TOTAL: 3 findings
