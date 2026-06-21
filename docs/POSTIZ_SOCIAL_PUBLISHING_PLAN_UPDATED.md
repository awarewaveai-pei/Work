# Postiz 社群發佈整合計畫（Content Studio）

> 狀態：Task 0 ✅（API 契約，2026-06-16）+ Task 1 ✅（Postiz 部署上線，2026-06-14/15）；Task 3–6 PENDING。live-status SSOT = [`CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md`](CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md) §A11。內容引擎 SSOT = `docs/wp-kadence-ai-seo-geo-content-engine.md` §49；本計畫是其「社群層另開工單」（handoff `agency-os/handoffs/2026-06-06-2029-tomo-202949.md:38`）的拆解。
> 需求：全平台（IG/FB/Threads/X/LinkedIn/TikTok/Pinterest/Reddit）+ 兩種發佈模式（排程+人審、即時）。
> 決策基礎：自架 Postiz（開源 AGPL，一套處理多平台 OAuth+排程）；不用 Metricool/Buffer/Ayrshare。

## Definition of Done
登入操作者在 `/tools/content` 能：(1) 連接客戶社群帳號（≥ IG/FB/Reddit 先上線）經自架 `postiz.aware-wave.com`；(2) 把 studio 已生成的各平台文案 + 圖片建立 Postiz 貼文，**Postiz draft（人審後發）** 或 **即時發佈**；(3) 預設 draft-first（spec §49.7 紅線：永不自動 publish）。真實測試帳號有貼文落地。

### v1 成功標準（2026-06-21 補強）
**v1 不承諾全平台一次到位。** v1 成功 = `Content Studio → Postiz draft → 人工審核 → 測試帳號真實發文` 閉環成立，且至少 **IG/FB/Reddit/LinkedIn 任三個平台**可在測試帳號落地。

v1 必須具備：
- 每客戶明確隔離的 Postiz integration mapping（最低限度：本系統 DB 有 `client_id → postiz_workspace_id/api_key/integration_id/platform/status`）。
- 預設 `type:"draft"`；`type:"now"` 只能在操作者明確選擇 + 二次確認後送出。
- 圖片 flow 完整：Content Studio 的 `imgResult.imageUrl` 必須能被 server 轉成 Postiz media asset（`id/path`），再被放入 post payload。
- UI 按照「已連接 channel」逐平台 gate；未連接或平台未通過審核時不可送出。
- 失敗時不吞錯：401/403/404/429/5xx 都要在 UI 與 server log 顯示可操作原因。

### v2 / production-grade 才納入
- Threads / TikTok / Pinterest / X 全平台完整支援。
- Postiz UI 深度嵌入或自建完整 account connect UX。
- 審核工作流、多人 approval、排程日曆、發佈後 analytics / reporting。
- 每平台 settings schema 完整管理與版本化。


## 現況（已驗證 file:line）
- 死面板：`ContentStudio.tsx:1563-1636` 10 個勾選框 + 「生成社群貼文」；`handleSyndicate()`（`:646-659`）只 POST `/api/content/syndicate` 拿文字 → copy 框。無發佈、無帳號 state。
- `app/api/content/syndicate/route.ts`：Claude Haiku 純生成文字，回 `{ok,posts}`。無 OAuth、無 Postiz。
- 生成圖 `imgResult.imageUrl`（`ContentStudio.tsx:302`）目前**沒**傳進 syndicate，整合要接上。
- 發佈模板：`app/api/content/publish/route.ts`（ops-role gate `:135-138`、draft-first `:201`）→ 新 `social-publish` route 照抄此結構。
- EU compose 慣例（`infra/n8n/docker-compose.yml`）：單服務 compose、image pin、bind `127.0.0.1:PORT`、加入 external `supabase_default` 網路、共用 `supabase-db`、env 走主機 `.env`。

## 待操作者決定（Phase 2 code 前必決）
| # | 決策 | 建議 |
|---|------|------|
| D1 | 整合方式 | 混合：發佈動作走 Postiz **API**（帶我們的文字+圖、雙模式）；帳號連接 OAuth 用 Postiz UI（iframe/新分頁） |
| D2 | Postiz DB | 共用 `supabase-db` 開獨立 `postiz` DB/user（比照 n8n）；影響備份範圍 |
| D3 | 租戶模型 | **建議採每客戶獨立 workspace / API key / integration mapping**；若短期只能單 workspace，必須在本系統 DB 加 `client_id → postiz_workspace_id/api_key/integration_id` 隔離層，禁止前端直接暴露跨客戶 channel |
| D4 | 模式對應 | **已解除**：Postiz 原生 `draft` / `schedule` / `now`；預設一律 `draft`，`now` 僅允許明確二次確認後執行 |
| D5 | 審核順序 + X 預算 | 先送 Meta(IG+FB)+Reddit+LinkedIn；**X 不列入 v1 承諾**，因 X API 現行 pricing/credits 與寫入權限需另行驗證；TikTok 延後 |

## Task 0 結果（Postiz Public API 契約事實表，✅ 已完成 2026-06-16）

> **⚠ 狀態校正（VBC 2026-06-16）**：本檔原為 2026-06-14 PLANNED 草案，**Task 1（部署）其實早已完成** — Postiz v2.11.3 已上線 `postiz.aware-wave.com`（EU，commit `a951190c`「Postiz live on EU (Task 1)」），且 **Bluesky 端到端發文已實測通過（2026-06-15）**。**社群層 live-status SSOT = [`CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md`](CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md) §0.5/A11**（本檔為 API 契約細節補充，狀態以該檔為準）。故下表是**整合碼（Task 3）的契約參考**，不是「待部署」清單。
>
> 來源：官方 `docs.postiz.com/public-api`（WebFetch 2026-06-16；2026-06-21 再核對）。Postiz 已部署，契約可直接對已上線的 `/public/v1` 或部署實際 proxy base path 用 curl 對照鎖定。
>
> 2026-06-21 補強：官方 Create Post 文件仍列 `type` = `now` / `schedule` / `draft`；官方 Upload 文件列 multipart upload 回 `{ id, path }` 可放入 post `image`；官方 Introduction 文件列 create-post endpoint rate limit 90 req/hr（self-host）/100 req/hr（cloud）。X API 則已改為 pay-per-use / credit-based 敘述，因此 v1 不應綁死「$100/月起」假設。

| 項目 | 事實（verbatim 欄位名） | 信心 |
|------|------------------------|------|
| Base path | `https://{NEXT_PUBLIC_BACKEND_URL}/public/v1`（public API 與 app 內部 API 分離） | 高 |
| Auth（驗證） | header `Authorization: <api_key>`（**raw key，無 `Bearer` 前綴**）；key 在 Postiz UI `Settings > Developers > Public API` 產生（per-workspace） | 高 |
| 建立貼文（create post） | `POST /public/v1/posts` | 高 |
| 貼文 body | `{ type, date(ISO-8601), shortLink(bool), tags[], posts[] }`；每個 `posts[]` = `{ integration:{ id }, value:[{ content, image:[{ id, path }] }], settings:{ __type:<platform>, …平台專屬 } }`（一個 entry 對一個已連接 channel，帶該平台文案+媒體） | 高 |
| **type enum** | **`draft` / `schedule` / `now`** — **`draft` = 存草稿、永不自動發** | 高 |
| 列出已連接 channel（integrations） | `GET /public/v1/integrations`（doc 未列完整 response 欄位；至少含 `id`，平台/名稱/disabled 待 Task 1 後 curl 補） | 高（path）/ 中（欄位） |
| 媒體上傳（upload） | `POST /public/v1/upload`，`multipart/form-data` 欄位 `file` → 回 `{ id, path }`，於貼文 `image:[{ id }]` 引用 | 高 |
| Rate limit | **90 req/hr 自架**（cloud 100），**僅限 create-post endpoint**；自架可調 env `API_LIMIT` | 高 |
| 帳號連接（OAuth connect） | **不走 public API** — 連帳號是 Postiz web UI 的 OAuth flow（per platform）。public API 只「列已連接」+「建貼文」 | 高 |
| 自架部署事實（Task 1 ✅ 已上線） | Docker image `ghcr.io/gitroomhq/postiz-app`（v2.11.3 running on EU）；Postgres + Redis；核心 env（`MAIN_URL`/`FRONTEND_URL`/`NEXT_PUBLIC_BACKEND_URL`/`JWT_SECRET`/`DATABASE_URL`/`REDIS_URL`/`STORAGE_PROVIDER`）+ 各平台 OAuth app 憑證。實機狀態以 [`CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md`](CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md) §A11 為準 | 高（已部署，curl `/public/v1` → 307 live） |

**對 D4 的結論**：Postiz **原生支援 `draft`** → 「排程草稿+人審」= 建貼文 `type:"draft"`，操作者在 Postiz UI 審核後手動發；「即時」= `type:"now"`（per-post 明確動作+確認，符合 spec §49.7 紅線）。**無需** 原 D4 假設的「排程遠期+Telegram 通知」workaround。

**gate 解除**：Task 1（部署）**已完成**（Postiz v2.11.3 live，Bluesky e2e 2026-06-15）。剩 Task 3（`lib/content/postiz.ts` + `/api/content/social-publish`，draft 預設 = `type:"draft"`）可照此契約開工 — 因 Postiz 已上線，契約可直接對 `https://postiz.aware-wave.com/public/v1` 用 curl 對照鎖定。唯一仍待整合時 curl 補的細節：`GET /integrations` 完整 response 欄位（用於 UI 逐平台 gate）。

## Phase 2 開工前 gates（2026-06-21 補強）
以下四項未完成前，不進 Task 5 UI 合併；可以並行做 Task 3/4，但不得宣稱 production ready。

### Gate A — API base path smoke test
在 EU 實機用同一組 `POSTIZ_API_BASE_URL` / `POSTIZ_API_KEY` 跑：
```bash
curl -i "$POSTIZ_API_BASE_URL/integrations" \
  -H "Authorization: $POSTIZ_API_KEY"
```
必須記錄：實際 base path、status code、response shape、是否需要 trailing slash、是否經 nginx/CF redirect。`POSTIZ_API_BASE_URL` 必須走 env，不得在程式寫死 `/public/v1` 或 `/api/public/v1`。

### Gate B — `GET /integrations` schema snapshot
把實機 response 存成 fixture：`tests/fixtures/postiz-integrations.sample.json`。至少要確認並映射：
- Postiz integration id
- platform/provider type
- display name / account name
- disabled / expired / connected 狀態
- workspace / organization 關聯欄位（若 response 有）

前端 channel gate 不得猜欄位；必須透過 `lib/content/postiz.ts` normalize 成內部型別：
```ts
type SocialChannel = {
  clientId: string
  postizIntegrationId: string
  platform: 'instagram' | 'facebook' | 'reddit' | 'linkedin' | 'x' | 'threads' | 'tiktok' | 'pinterest' | 'bluesky'
  label: string
  status: 'connected' | 'disabled' | 'expired' | 'unsupported'
}
```

### Gate C — media upload pipeline
`imgResult.imageUrl` 不能只傳給 `/api/content/syndicate` 產文案；必須在 `/api/content/social-publish` 內完成以下其中一種：
1. server 下載 imageUrl → `multipart/form-data` POST Postiz upload；或
2. imageUrl 是 Postiz backend 可公開讀取的 HTTPS CDN/R2/S3 URL → Postiz upload-from-url。

完成後把回傳 `{ id, path }` 放入每個 post value：
```json
"image": [{ "id": "<postiz-media-id>", "path": "<postiz-media-path>" }]
```
若圖片不可讀、過期、非 HTTPS、content-type 不支援，要 fail closed：建立文字 draft 或整筆失敗由操作者重試，不能靜默送出無圖貼文。

### Gate D — tenant isolation decision
預設決策：**每客戶獨立 workspace / API key / integration mapping**。若短期做不到，MVP 至少要有資料表：
```sql
create table social_postiz_connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  postiz_workspace_id text,
  postiz_api_key_secret_ref text not null,
  postiz_integration_id text not null,
  platform text not null,
  label text,
  status text not null default 'connected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, postiz_integration_id)
);
```
API route 必須以 `client_id` 查詢 allowed integrations；不得接受前端任意傳來的 integration id 後直接送 Postiz。

## Task 分解（六要素契約見原始 planner 輸出；摘要）
- **Task 0** `web-researcher`：✅ 完成（見上「Task 0 結果」事實表，2026-06-16）。Postiz API 原生 draft/schedule/now，gate 已解除。
- **Task 1** `devops-engineer`：✅ 已完成。EU Postiz `postiz.aware-wave.com` 已上線；後續只需補 smoke test 記錄、nginx/CF path 確認、備份與監控檢查。
- **Task 2** `web-researcher`+操作者：各平台 dev app + 審核送件，callback 指向 Postiz。**今天開始**（長外部瓶頸，並行）。
- **Task 3** `fullstack-engineer`：`lib/content/postiz.ts` + `/api/content/social-publish` route（雙模式、draft 預設）。不卡審核。
- **Task 4** `fullstack-engineer`：帳號連接 flow + `social-channels` route。
- **Task 5** `fullstack-engineer`：把死面板接成真發佈（channel 選擇 + 模式 toggle + 發佈鈕，帶 `imgResult.imageUrl`）。需 3+4。
- **Task 6** `fullstack-engineer`：客戶 onboarding doc + ops runbook（token 過期重連），回扣 SSOT §49。

### Task 3 補充實作契約
`lib/content/postiz.ts` 必須提供：
- `listIntegrations(clientId)`：server-side 查 client mapping + Postiz integrations，normalize 成 `SocialChannel[]`。
- `uploadMedia({ clientId, imageUrl })`：回 `{ id, path }`；所有網路錯誤、content-type 錯誤、檔案過大要 typed error。
- `createSocialPost({ clientId, mode, posts, media })`：`mode` 只允許 `'draft' | 'now' | 'schedule'`；預設 `draft`。
- `assertCanPublishNow(user, clientId)`：即時發佈必須通過 ops-role gate + explicit confirmation flag。

`/api/content/social-publish` 必須：
- 從 session/user role 驗證操作者權限。
- 從 server-side client mapping 取 integration id；前端傳入的 channel 只能是 selection intent，不是信任來源。
- 建立 `draft` 時不需要二次確認；建立 `now` 時必須要求 `confirmPublishNow === true`。
- 回傳每平台結果 `{ platform, integrationId, status, postizPostId?, error? }`，允許部分平台失敗但必須清楚顯示。

### Task 4/5 補充 UI 契約
- Channel selector 顯示 connected / disabled / expired / unsupported。
- Publish mode 預設 `Draft for review`；`Publish now` 放在 secondary/advanced action，需二次確認 modal。
- 未連接 channel 顯示「到 Postiz 連接帳號」按鈕（新分頁），不要 iframe 卡 OAuth callback。
- 發佈後顯示 Postiz draft/post link（若 API 有回），並保留 copy fallback。

## 關鍵路徑
`Task 0 → Task 1 →（Task 3 ∥ Task 4）→ Task 5 → 連接帳號真發佈`。**Task 2 審核並行整條 code track**；每個平台按鈕在其審核通過時上線；Reddit/Meta 先到先上，不必等齊。

## 驗收測試清單（2026-06-21 補強）

### API / service tests
- `GET /api/content/social-channels?client_id=...`：只回該 client 可用 channel，不洩漏其他客戶 integration。
- `POST /api/content/social-publish` default mode：未傳 mode 時建立 Postiz `draft`，不發佈。
- `POST /api/content/social-publish` now mode：缺 `confirmPublishNow` 時 400；有確認且有權限才送 `type:"now"`。
- image upload：有效 HTTPS 圖片成功回 Postiz media id；過期 URL / 403 / 非圖片 content-type 要回 typed error。
- Postiz 401/403：UI 顯示「API key/權限錯誤，請重連或更新 secret」。
- Postiz 429：UI 顯示 rate limit，server log 包含 client/platform/request id，不自動無限 retry。
- Postiz 5xx / timeout：最多短 retry with backoff；仍失敗則保留文案與圖片，不標記成功。

### E2E acceptance
- IG/FB/Reddit/LinkedIn 任三平台：Content Studio 產文案+圖片 → 建 draft → Postiz UI 看得到文案與圖片 → 人工發佈測試帳號成功。
- 未連接平台：前端不可選或送出前被 gate 擋下。
- 客戶隔離：client A 看不到/不能送 client B 的 channel。
- rollback：revert Task 3–5 commit 後，Content Studio 回到純文字 copy flow，不影響既有 content publish route。

## 風險重點
- 平台審核延遲（Meta App Review / X API credits/寫入權限 / TikTok）→ code 與審核解耦，UI 按連接狀態逐平台 gate；X 不阻塞 v1。
- 租戶隔離錯誤是最高產品風險：不得用「單 workspace + 前端 filter」當安全邊界；server route 必須用 `client_id` 對 integration allowlist 做 gate。
- OAuth secret：全走 `secrets-vault.ps1` → EU `.env`，禁進 repo；Postiz 自存 user token 於其 DB（納入 D2 備份）。
- AGPL：自架未改 image 即合規；**禁 fork/改 Postiz 原始碼**（只 config/env）。
- 自動發佈違反 §49.7：預設排程草稿+人審；即時需明確 per-post 動作+確認。

## Rollback
Task 1 失敗：`docker compose -f infra/postiz/... down`（需 `# CONFIRMED-HIGH-RISK`）+ 移除 CF DNS/nginx + drop `postiz` DB；不影響 n8n/supabase/trigger。Task 3-5：revert next-admin commit，面板退回純文字 copy（現況），sg-deploy 自動 rollback 覆蓋。

補強：若 social route 已建立 client mapping，rollback 不刪資料表，只停用 UI entrypoint；必要時 rotate `POSTIZ_API_KEY` / secret ref，避免舊部署仍可建立貼文。

## 2026-06-21 補強摘要
- 明確切出 v1 成功標準：先完成 draft-first 發佈閉環，不承諾全平台一次到位。
- D3 改為建議「每客戶獨立 workspace / API key / integration mapping」。
- D4 標示已解除：Postiz 原生 `draft` / `schedule` / `now`。
- D5 更新：X API 不列入 v1 承諾，因 pricing/credits/權限需另驗。
- 新增 Phase 2 gates：API base path smoke test、integrations schema snapshot、media upload pipeline、tenant isolation。
- 新增 Task 3/4/5 實作契約與驗收測試清單。

## 原始完整 planner 輸出
見本 session（2026-06-14）對話記錄；六要素契約逐 task 完整版。
