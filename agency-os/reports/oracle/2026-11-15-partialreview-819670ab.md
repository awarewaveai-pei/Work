# codex-oracle review -- 2026-11-15 11:56:13 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0163_social_media_cover.sql, lobster-factory/packages/db/migrations/0163_social_media_cover.down.sql, lobster-factory/packages/db/tests/test_0163_social_media_cover.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/postiz.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/compose.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/social-drafts.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/social-drafts-deps.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/VideoFrame.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Calendar.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: VD.5-VD.7 round 2. Round-1 fixes (10974254): every Postiz upload POST now has a timeout (image 60 s, video 180 s), so a hung cover upload fails and the video draft still saves without a cover; 0163 now enforces in the database that a cover is an IMAGE row of the same organization: a plain cover_kind column with CHECK ((cover_media_id is null) = (cover_kind is null) and coalesce(cover_kind,'image') = 'image') (written never-NULL), FK (cover_media_id, organization_id, cover_kind) -> (id, organization_id, kind) with unique (id, organization_id, kind), on delete set null (cover_media_id, cover_kind); store.addVideo writes cover_kind 'image'. Tested on Postgres 15.8 (another video, another org, missing kind all refused; both down files revert).
- exit: 0 | elapsed: 232504ms | answer: 656B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Calendar.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/VideoFrame.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/postiz.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/social-drafts-deps.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/social-drafts.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/compose.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/packages/db/migrations/0163_social_media_cover.down.sql, lobster-factory/packages/db/migrations/0163_social_media_cover.sql, lobster-factory/packages/db/tests/test_0163_social_media_cover.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 草稿請求可能在影片儲存前逾時
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts:860
  confidence  -> CONFIRMED
  scenario    -> 一支影片下載耗時 110 秒、上傳 Postiz 耗時 170 秒，接著封面下載與上傳耗時 40 秒。封面處理完成後才在第 867 行寫入影片；但 video 網域的 `proxy_read_timeout` 為 300 秒（`nginx/default.conf:559`），請求先收到 504，草稿無法成功儲存。
  why missed  -> 作者替個別上傳設定逾時，未核對依序執行的下載、影片上傳、封面處理與代理逾時的總時間。

TOTAL: 1 findings
