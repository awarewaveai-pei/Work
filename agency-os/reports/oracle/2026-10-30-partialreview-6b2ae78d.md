# codex-oracle review -- 2026-10-30 00:41:46 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/nginx/default.conf, lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/sg-stack.aware-wave.com.conf, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Opens the content product door (content.aware-wave.com, ADR 018): host nginx + lobster-nginx shared door block server_name gain content; products.ts content door drops enabled:false. Door access gate lib/portal/door-access.ts and middleware door routing already exist (video/design went live the same way). Check: does enabling the content door expose any route under /api/content or the door pages that is not org-scoped, or anything in middleware/doors.ts that treats content specially.
- exit: 0 | elapsed: 358444ms | answer: 1972B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/nginx/default.conf, lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/sg-stack.aware-wave.com.conf
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: content 入口同時開放了 studio 的 Printful mockup API
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts:76
  confidence  -> CONFIRMED
  scenario    -> 客戶只有 content 權限、沒有 studio 權限，且 `POD_DESIGNS_ENABLED=true` → `doorApis()` 會因 `dependsOn: ["studio"]` 放行 `/api/tools/studio/mockup`（`doors.ts:62-70`）；該路由只檢查登入角色，便呼叫 Printful 產生 mockup（`mockup/route.ts:23-30,110`），可消耗共用 mockup 配額。
  why missed  -> diff 只顯示 content 自己的 API 前綴；相依產品的 API 由 `doorApis()` 額外加入。

FINDING 2: 失去 content 開通資格的客戶仍可直接操作 content API
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/middleware.ts:321
  confidence  -> CONFIRMED
  scenario    -> 客戶的 content entitlement 已到期，但登入與組織綁定仍有效 → 頁面會由 `ProductDoorShell.tsx:18-19` 擋下；直接呼叫 `/api/content/drafts?id=<自己草稿>` 的 DELETE，middleware 只檢查路徑屬於 content，路由在確認組織相符後仍執行刪除（`drafts/route.ts:211-238`）。
  why missed  -> 開通檢查位於頁面 shell，API 請求不會經過該 shell。

FINDING 3: content 的 GET 趨勢路由會寫入全域資料並可反覆觸發來源抓取
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/trending/route.ts:93
  confidence  -> CONFIRMED
  scenario    -> 已登入的 content 客戶反覆請求 `GET /api/content/trending?type=trending&geo=TW` → `trendingResponse()` 每次呼叫 `collectTrends()`（同檔 `82-86`），重新抓取外部來源，並對所有租戶共用的 `content_trends` 執行 upsert 與刪除舊列（`lib/content/topics/trends.ts:55-65`）。
  why missed  -> 路由註解把 GET 描述為讀取；資料寫入藏在 `collectTrends()` 的下一層呼叫。

TOTAL: 3 findings
