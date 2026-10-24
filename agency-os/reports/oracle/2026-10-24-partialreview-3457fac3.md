# codex-oracle review -- 2026-10-24 13:54:15 +08:00

- mode: `review`
- scope: -Path :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/write-posts.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/syndicate.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/wp-article.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/ArticleSource.tsx, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/write-posts.test.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/wp-article.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: AUTO_CONTENT P2 (agency-os/docs/AUTO_CONTENT/AUTO_CONTENT_EXECUTION_PLAN.md I2): one social post writer. New lib/social/write-posts.ts: writeSocialPosts(input, ask) builds the prompt, states each platform's hard limit only from lib/social/limits.ts BODY_LIMITS (Threads counted in UTF-8 bytes), measures every answer with bodyLength, rewrites over-limit platforms once, reports what is still too long in tooLong; it also holds the only Postiz->writer platform map (writerKeysFor, textsForAccounts). lib/content/syndicate.ts becomes a thin HTTP shell (role, brand voice, AI client, logging, summed cost of up to two calls). The social composer (ArticleSource) uses the core map and skips tooLong texts. Check: prompt regressions versus the old PLATFORM_SPECS, Threads byte counting, thread per-line limits, cost/logging of two calls, behaviour changes for /api/content/syndicate callers (ContentStudio sends "twitter"+twitterMode), and any remaining second copy of a platform rule.
- exit: 0 | elapsed: 383191ms | answer: 570B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/ArticleSource.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/syndicate.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/wp-article.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/wp-article.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The AI rewrite price shown to users still assumes one provider call, while over-limit output can trigger two.

  lib/content/syndicate.ts:64 -> lib/social/wp-article.ts:35, ArticleSource.tsx:84  
  confidence  -> CONFIRMED  
  scenario    -> First generation exceeds a platform limit, so `writeSocialPosts` retries; `_cost.usd` includes both calls, but the AI button still displays the one-call `rewriteCostTwd()` estimate.  
  why missed  -> The endpoint cost accumulator was updated, but the existing UI pricing helper was left unchanged.

TOTAL: 1 findings
