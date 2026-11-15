# codex-oracle review -- 2026-11-15 11:55:26 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cover/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cover/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/release-copy.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/release-copy.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: VD.3 + VD.9 round 2. Round-1 fixes (63d19a26): upload takes organizationId from the query, checks access and Content-Length (411 missing, 413 over 2 MB + 64 KB) before reading any body; a whole-file check (PNG IHDR first + IEND last, JPEG SOI first + EOI last) refuses header-only files; same-bytes concurrent uploads retry the next version on 23505 like the workbench intake; switching video clears ticked channels, their texts and covers so no text of the last video carries over. cover.ts (chosenCover) is already on main (dee6e6c03).
- exit: 0 | elapsed: 191873ms | answer: 1154B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cover/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cover/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/release-copy.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/release-copy.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 不完整的圖片仍會通過「完整 JPG／PNG」檢查並成為封面
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cover/route.ts:86
  confidence  -> CONFIRMED
  scenario    -> 上傳一個 64 位元組檔案，只放 PNG 簽章、`IHDR` 字樣與結尾 `IEND` 字樣，其他位元組皆為零 → `wholeImage` 回傳 true，路由將無法顯示的圖片存入 R2 並設為使用中的封面。
  why missed  -> 測試只涵蓋單獨的簽章，未驗證圖片區塊的長度、內容或 CRC。

FINDING 2: 換影片後沿用上一張圖的權利確認
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx:74
  confidence  -> CONFIRMED
  scenario    -> 使用者為影片 A 的圖片勾選「我有權使用」，切到影片 B 後上傳另一張圖 → `coverRights` 沒有重設，第 105 行仍送出 `rightsConfirmed=true`，伺服器把未重新確認的 B 圖記為已確認權利。
  why missed  -> 換影片的清除邏輯列出了頻道、文案與封面，漏掉獨立的權利確認狀態。

TOTAL: 2 findings
