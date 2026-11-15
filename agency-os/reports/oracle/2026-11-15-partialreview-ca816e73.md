# codex-oracle review -- 2026-11-15 17:18:22 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/trending-sources.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sources/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sources/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/ContentStudio.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Trending source lists on the Content Studio page were hand-written and stale (named 4 of 10 sources). Now GET /api/content/sources also returns builtins = the registered enabled search blocks, and both the 今日熱搜 hint (per selected region) and the 管理來源 tab render that list. Serper items now carry source 'Serper 即時' with the publisher moved to category (shown in the chip tooltip). Check correctness, the effect that loads sources on the trending tab, and anything that could break for customers on a product door (onDoor).
- exit: 0 | elapsed: 154889ms | answer: 1261B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/ContentStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sources/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sources/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/trending-sources.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 無 Supabase 的部署無法顯示內建來源清單  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/ContentStudio.tsx:1017  
  confidence  -> CONFIRMED  
  scenario    -> 買斷部署未設定 Supabase 時，`/api/content/trending` 仍可執行內建來源，但新增的自動載入呼叫 `/api/content/sources` 會收到 503；今日熱搜提示因此始終不顯示來源清單。  
  why missed  -> 新清單依附原本供管理來源使用的 API；該 API 要求 Supabase，而熱搜執行路徑有無資料庫的後備路徑。

FINDING 2: Serper 來源改名會讓同日重新收集產生重複熱搜  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/trending-sources.ts:344  
  confidence  -> CONFIRMED  
  scenario    -> 當天已有以新聞發布者為 `source` 儲存的 Serper 標題，部署後員工以 `POST refresh=1` 重新收集相同標題；快取雜湊包含 `source`，新值「Serper 即時」產生不同雜湊，兩筆都保留並出現在當日熱搜。  
  why missed  -> 變更只檢查了顯示用 chip，未追到 `content_trends` 以來源和標題組成的儲存鍵及只新增資料的刷新行為。

TOTAL: 2 findings
