# codex-oracle review -- 2026-11-15 16:48:20 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/trending-sources.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/trending-social.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Trending sources: Reddit RSS spaced per host (Reddit allows 1 req/~6s per IP, 6 of 7 geos were getting 429) with one retry; new Apify-backed social trend blocks (Dcard TW, X US/GB/JP/AU/SG, TikTok US/JP, Instagram US) that hold credits before the call, cap the vendor charge with maxTotalChargeUsd at the hold, and log cost via logToolCost. Check correctness of the per-host queue, the retry, cost accounting, and anything that could charge without a hold or leave a hold unsettled.
- exit: 0 | elapsed: 210423ms | answer: 2052B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/trending-social.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/trending-sources.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 部署設定未傳入 `APIFY_API_TOKEN`，新社群來源在該設定下全部停用
  file:line   -> lobster-factory/infra/hetzner-phase1-core/docker-compose.yml:287
  confidence  -> CONFIRMED
  scenario    -> 使用 repo 的 `next-admin` Compose 設定啟動容器；其 `environment` 清單沒有 `APIFY_API_TOKEN` → `trending-sources.ts:493` 將四類 Apify block 註冊為停用，沒有任何社群趨勢結果。現有測試自行設定 token，因此測不到這個部署缺口。
  why missed  -> 作者測了函式與測試環境，未核對容器的環境變數清單。

FINDING 2: 客戶的 GET 請求可把 Apify 費用記到內部帳戶
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/trending/route.ts:121
  confidence  -> CONFIRMED
  scenario    -> token 已配置、當日某地區尚無快取，客戶呼叫 `GET /api/content/trending?geo=TW` → GET 直接收集趨勢，未經 `withFeature` 建立客戶帳務範圍；`runApifyTrend` 的 `grantFor()` 因而按 `grant.ts:49-55` 使用 system 身分，並依 `subject.ts:63-67` 選內部帳戶持有及結算費用。
  why missed  -> 新 block 只檢查自己取得了 hold；作者未追查 GET 呼叫者如何決定 hold 屬於哪個帳戶。

FINDING 3: 已啟動的 Actor 若遇到連線逾時，實際費用會被記為零
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/trending-sources.ts:436
  confidence  -> CONFIRMED
  scenario    -> Apify 已接受並啟動付費 run，但連線在本地 105 秒逾時前中斷 → `catch` 保持 `ran=false`，第 438 行計算費用為零；`logToolCost` 會釋放整筆 hold，且依 `log-ai-call.ts:270-278` 不寫成本紀錄。Apify [官方文件](https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items-post) 明示連線中斷時呼叫端不會收到 run 的狀態；斷線不等於 run 未執行。
  why missed  -> 測試只涵蓋成功回應與執行前拒絕，沒有涵蓋請求送出後失去回應。

TOTAL: 3 findings
