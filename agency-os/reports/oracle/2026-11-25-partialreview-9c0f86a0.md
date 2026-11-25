# codex-oracle review -- 2026-11-25 23:24:28 +08:00

- mode: `review`
- scope: -Path agency-os/systems/registry.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/README.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: not a fix. New LEGO block catalog: lib/systems/blocks.ts is the single list (permanent numbers B/M/C, front+back of one capability = one block, overlaps marks real duplicates), guarded by blocks.test.ts (paths exist, every register()/dock panel/MODULE_MANIFEST/cognitive family covered, importers via @/ must be in usedBy). New page /ops/systems/blocks (owner/admin only) with stack diagram, system x layer heat map with status+completion, numbered list; shared header/AddSystemForm/Progress moved into parts.tsx; projectAll() extracted into overview.ts and used by the main page; [slug] page lists used blocks; README catalog tables replaced by a pointer; registry.json adds phase lego-catalog under systems-control-center.
- exit: 0 | elapsed: 167410ms | answer: 1035B
- files-reviewed: agency-os/systems/registry.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems/[slug]/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems/__tests__/systems-access.test.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems/parts.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/README.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/overview.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems/blocks/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/__tests__/blocks.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/blocks.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 後端註冊覆蓋測試漏掉動態產生的搜尋積木 ID。
  file:line   -> `lib/systems/__tests__/blocks.test.ts:73`
  confidence  -> CONFIRMED
  scenario    -> `trending-sources.ts:483–491` 以 `search/${def.id}` 註冊 Apify 來源；目錄 `blocks.ts:106` 未列入 `search/x`、`search/tiktok`、`search/instagram` 等 ID。測試只擷取引號內的完整 `類別/ID`，因此仍會通過。
  why missed  -> 測試只掃靜態字串，未檢查實際註冊結果。

FINDING 2: 沒有功能積木的已登記系統不會出現在進度熱圖。
  file:line   -> `app/(shell)/ops/systems/blocks/page.tsx:182`
  confidence  -> CONFIRMED
  scenario    -> 已登記的 `hci30` 只出現在產品模組 `blocks.ts:233`，沒有功能積木；熱圖列只從 `usageMatrix()` 的鍵建立，因此不顯示 HCI-30 的狀態與完成度。頁面僅在下方列出其名稱。
  why missed  -> 熱圖以積木使用紀錄為列來源，沒有從已讀取的系統清單補上零顆積木的系統。

TOTAL: 2 findings