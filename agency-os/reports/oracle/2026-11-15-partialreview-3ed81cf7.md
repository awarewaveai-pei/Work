# codex-oracle review -- 2026-11-15 12:01:04 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/add-video-cover.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/postiz.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: VD.5 round 3. Round-2 fix (819670ab): addVideo runs the cover only if the video step left room for the cover's worst case (image fetch 20 s + upload 60 s) inside a 240 s budget under the 300 s proxy; otherwise the cover is skipped (logged) and the video row is saved without one. A refused cover never refuses the video. Tested with an injected clock.
- exit: 0 | elapsed: 189219ms | answer: 1469B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/postiz.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/add-video-cover.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 單支影片的最長下載與上傳時間已耗盡 300 秒，跳過封面仍可能回傳 504
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts:863
  confidence  -> CONFIRMED
  scenario    -> 影片下載耗時接近 120 秒、Postiz 上傳耗時接近 180 秒（`lib/content/postiz.ts:56-61`）。封面判斷要等兩者完成才執行；即使跳過封面，影片資料列仍須在 `store.ts:873-877` 寫入，而 app 的 proxy read timeout 是 300 秒（`nginx/default.conf:264`）。請求先得到 504，使用者看不到成功結果。
  why missed  -> 測試注入時鐘，只驗證封面有沒有被跳過，沒有涵蓋影片本身的最長耗時與後續資料庫寫入。

FINDING 2: 每支影片重設時間預算，多比例草稿仍會在同一請求中超時
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts:855
  confidence  -> CONFIRMED
  scenario    -> 使用者勾選需要兩種影片比例的頻道；`lib/content/video/social-drafts.ts:42-45` 依序上傳各比例並儲存草稿。若每支影片上傳 130 秒、封面 70 秒，兩次 `addVideo` 都通過各自的 240 秒檢查，但整個請求至少耗時 400 秒，超過 `nginx/default.conf:264` 的 300 秒；第一筆草稿已儲存，使用者卻收到 504。
  why missed  -> 新測試只呼叫一次 `addVideo`，未涵蓋同一請求連續處理多種比例。

TOTAL: 2 findings
