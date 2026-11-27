# codex-oracle review -- 2026-11-26 14:56:25 +08:00

- mode: `review`
- scope: whole repo
- target: `1725dba2c..aefc84b29`
- context: U16: content door home becomes 概覽 (three counts for the URL's client per ADR 020, read via existing APIs), 寫文章 moves to /content/write, DoorNavItem.staff becomes optional for door-only pages, old /content?draft= links redirect to /write. Focus: client-context privacy (counts must only use the URL org/site), broken links/redirect correctness, consumers of DoorNavItem.staff.
- exit: 0 | elapsed: 208605ms | answer: 1824B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/ContentOverview.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/__tests__/ContentOverview.test.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/__tests__/door-home.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/old-draft-link.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/write/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/products.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/door-href.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 選定網站的草稿數可能混入其他客戶的草稿
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/ContentOverview.tsx:38
  confidence  -> CONFIRMED
  scenario    -> 員工將客戶 B 的草稿儲存為客戶 A 的網站 ID；草稿 API 允許 `organization_id` 與 `site_id` 如此組合。員工開啟 A 的該網站概覽時，請求只帶 `siteId`，API 因未收到 `organizationId` 而查所有客戶，B 的草稿被算進 A 的數字。
  why missed  -> 草稿頁也只按網站篩選；沿用它的請求方式，掩蓋了資料列的組織與網站可以不一致這項依賴。

FINDING 2: 網址指定無效網站時，概覽仍顯示整個客戶的數字
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/ContentOverview.tsx:26
  confidence  -> CONFIRMED
  scenario    -> 員工開啟 `?org=A&site=B`，其中網站 B 屬於另一客戶。客戶脈絡回傳 `site_mismatch`、`org=A`、`site=null`；此處仍啟動讀取，顯示 A 全部網站的計數，而非拒絕這個無效的網站脈絡。
  why missed  -> 條件只排除 `loading`，沒有處理客戶脈絡的錯誤狀態。

FINDING 3: 超過 1000 筆月題目時，「已排程」會少算
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/ContentOverview.tsx:51
  confidence  -> CONFIRMED
  scenario    -> 客戶當月有超過 1000 筆題目，部分已排程題目落在 `/api/content/topics` 單次查詢的第 1000 筆之後。該 API 的 `listTopics` 沒有分頁，而概覽載入器明確按 PostgREST 的 1000 筆上限分頁；此處只計收到的題目，因此顯示低於實際值。
  why missed  -> 新卡片使用題目頁的 API，但沒有檢查該 API 的單次查詢上限。

TOTAL: 3 findings