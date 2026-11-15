# codex-oracle review -- 2026-11-15 12:05:27 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cover/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cover/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: VD.3 + VD.9 round 3. Round-2 fixes (9bea8a27): an uploaded cover is decoded for real with sharp (failOn truncated, metadata format must equal the declared type, stats() decodes every pixel) -- a PNG-shaped or cut-off file is refused; the rights checkbox resets on switching video and after every upload, so each image is confirmed on its own.
- exit: 0 | elapsed: 456854ms | answer: 1297B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cover/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cover/route.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 刪除一支工作台影片會刪掉同組織其他影片的封面檔
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cover/route.ts:124
  confidence  -> CONFIRMED
  scenario    -> 組織有影片 A、B，並為 B 上傳封面；刪除未被文章引用的 A 時，刪除流程把 `video/workbench/<org>/` 當成整支影片的目錄，刪掉其中所有物件，包括 B 的封面。B 的封面資料列仍指向已刪除的 URL（`lib/storage/r2.ts:344-354`；`app/api/video/[id]/route.ts:59-69`）。
  why missed  -> 新路由沿用工作台的共用 key 前綴，但既有刪除流程假設 `video/<dir>/` 只屬於一支影片。

FINDING 2: 上傳遇到網路錯誤後，使用權勾選仍可沿用到下一張圖
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx:111
  confidence  -> CONFIRMED
  scenario    -> 使用者為圖片 A 勾選使用權並上傳；`fetch` 拋出網路錯誤後進入 `catch`，跳過第 110 行的重設。使用者接著選圖片 B，勾選仍有效，B 會以 `rightsConfirmed: true` 上傳，無須重新確認。
  why missed  -> 重設放在 `try` 的成功及 HTTP 錯誤路徑，測試未涵蓋網路例外。

TOTAL: 2 findings
