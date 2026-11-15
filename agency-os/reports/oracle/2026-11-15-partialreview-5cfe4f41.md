# codex-oracle review -- 2026-11-15 11:58:37 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/embed-in-post.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/cover.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/embed-poster.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: VD.8 round 3. Round-2 fixes (4f5f2286): coverForRelease only accepts a release_approved Release (a withdrawn one gives no poster); alreadyEmbedded's escaped form only matches the video block's src="..." attribute, so a link to the same file elsewhere in the article is not taken as the embedded video (the bare-URL match is unchanged from before VD.8).
- exit: 0 | elapsed: 186144ms | answer: 11B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/cover.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/embed-in-post.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/embed-poster.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS
