# codex-oracle review -- 2026-10-29 08:25:07 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sites/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/overview/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/geos.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/collect-trends.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/cost.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/overview-load.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/overview.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/plan-due.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/plan.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/trends.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/trending-sources.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/events/for-month.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/jobs.ts, lobster-factory/packages/db/migrations/0139_wp_sites_content_plan_attempted_at.sql  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `728f21a35^..HEAD`
- context: AUTO_CONTENT P9 (already deployed): daily trend collection per geo (collect-trends, guard = content_trends row for today UTC, 3 geos at a time), monthly auto-proposal per site (plan-due: B1 one non-manual proposal per Taipei month, B2 claim wp_sites.content_plan_attempted_at before paid AI call 24h, B3 one site per firing then no tick, B4 topicMode=ai_pick only approves, B8 EntitlementRequired = skip), topic gate topicMode, events + per-site industry RSS in plan prompt (B10 never stored in shared content_trends), all-company overview (canAccessOrg per site, door-safe API), bulk topic add (<=30), social calendar article actions (B12 topic-made articles reschedule via topic). Find correctness, tenant isolation and money bugs.
- exit: 0 | elapsed: 163498ms | answer: 1947B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sites/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/overview/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/geos.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/collect-trends.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/cost.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/overview-load.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/overview.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/plan-due.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/plan.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/trends.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/trending-sources.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/events/for-month.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/jobs.ts, lobster-factory/packages/db/migrations/0139_wp_sites_content_plan_attempted_at.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 網站自訂 RSS 可讓伺服器請求內部網址
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/trending-sources.ts:157
  confidence  -> CONFIRMED
  scenario    -> 有權編輯網站設定的人填入自己的公開 HTTPS RSS 網址；該網址回傳 302，指向內部 HTTP 服務。`safeFetchText` 的 `fetch` 會跟隨轉址，對內部服務發出請求。網址檢查只驗原始字面 host，且 `public-https.ts:8-10` 已明載此檢查不足以保護使用者提供的 feed。
  why missed  -> 沿用了原本為受信任營運者來源設計的 RSS 抓取路徑，未重查新開放的輸入權限與轉址行為。

FINDING 2: 同一組織的多個網站可能反覆付費提案，卻拿不到各自的題目
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/plan-due.ts:39
  confidence  -> CONFIRMED
  scenario    -> 同組織網站 A 已有本月關鍵字；網站 B 的付費 AI 提案產生相同關鍵字。資料表以「組織、月份、關鍵字」唯一（`0121_content_topics.sql:54`），`proposeTopics` 忽略衝突（`store.ts:132-135`），因此 B 得到零題，24 小時後又可再付費嘗試。
  why missed  -> 每站提案的判斷查 `site_id`，但既有唯一鍵與寫入去重範圍是整個組織。

FINDING 3: 任一來源成功會遮蔽其他來源當天的暫時失敗
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/collect-trends.ts:44
  confidence  -> CONFIRMED
  scenario    -> Google Trends 暫時回 429，另一 RSS 來源成功並寫入一筆當日資料。之後每次排程都因這筆資料跳過該地區，Google Trends 當天不再重試；單一來源失敗在 `trending-sources.ts:163` 被轉成空結果。
  why missed  -> 「今天有資料」被當成「所有來源今天已成功收集」，但兩者不是同一狀態。

TOTAL: 3 findings
