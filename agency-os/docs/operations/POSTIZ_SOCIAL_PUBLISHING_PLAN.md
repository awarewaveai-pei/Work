# Postiz 社群發佈整合計畫（Content Studio）

> 狀態：PLANNED（2026-06-14）。內容引擎 SSOT = `docs/wp-kadence-ai-seo-geo-content-engine.md` §49；本計畫是其「社群層另開工單」（handoff `agency-os/handoffs/2026-06-06-2029-tomo-202949.md:38`）的拆解。
> 需求：全平台（IG/FB/Threads/X/LinkedIn/TikTok/Pinterest/Reddit）+ 兩種發佈模式（排程+人審、即時）。
> 決策基礎：自架 Postiz（開源 AGPL，一套處理多平台 OAuth+排程）；不用 Metricool/Buffer/Ayrshare。

## Definition of Done
登入操作者在 `/tools/content` 能：(1) 連接客戶社群帳號（≥ IG/FB/Reddit 先上線）經自架 `postiz.aware-wave.com`；(2) 把 studio 已生成的各平台文案 + 圖片建立 Postiz 貼文，**排程草稿（人審後發）** 或 **即時發佈**；(3) 預設 draft-first（spec §49.7 紅線：永不自動 publish）。真實測試帳號有貼文落地。

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
| D3 | 租戶模型 | 單一共用 workspace vs 每客戶獨立 workspace（影響客戶 A 能否看到客戶 B 帳號）— **必須你決定** |
| D4 | 模式對應 | Task 0 確認 Postiz API 是否原生支援 draft/scheduled/publish-now；若無 draft，「人審」=排程遠期+Telegram 通知 |
| D5 | 審核順序 + X 預算 | 先送 Meta(IG+FB)+Reddit+LinkedIn；X 發文 API 要付費層（$100/月起）→ 確認預算；TikTok 延後 |

## Task 0 結果（Postiz Public API 契約事實表，✅ 已完成 2026-06-16）

> **⚠ 狀態校正（VBC 2026-06-16）**：本檔原為 2026-06-14 PLANNED 草案，**Task 1（部署）其實早已完成** — Postiz v2.11.3 已上線 `postiz.aware-wave.com`（EU，commit `a951190c`「Postiz live on EU (Task 1)」），且 **Bluesky 端到端發文已實測通過（2026-06-15）**。**社群層 live-status SSOT = [`CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md`](CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md) §0.5/A11**（本檔為 API 契約細節補充，狀態以該檔為準）。故下表是**整合碼（Task 3）的契約參考**，不是「待部署」清單。
>
> 來源：官方 `docs.postiz.com/public-api`（WebFetch 2026-06-16）。Postiz 已部署，契約可直接對已上線的 `/public/v1` 用 curl 對照鎖定。

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
| 自架部署需求（Task 1 用） | Docker image `ghcr.io/gitroomhq/postiz-app`；需 Postgres + Redis；核心 env（`MAIN_URL`/`FRONTEND_URL`/`NEXT_PUBLIC_BACKEND_URL`/`JWT_SECRET`/`DATABASE_URL`/`REDIS_URL`/`STORAGE_PROVIDER`）+ 各平台 OAuth app 憑證 | 中（以 Task 1 部署時官方 compose/configuration 文件為準） |

**對 D4 的結論**：Postiz **原生支援 `draft`** → 「排程草稿+人審」= 建貼文 `type:"draft"`，操作者在 Postiz UI 審核後手動發；「即時」= `type:"now"`（per-post 明確動作+確認，符合 spec §49.7 紅線）。**無需** 原 D4 假設的「排程遠期+Telegram 通知」workaround。

**gate 解除**：Task 1（部署）與 Task 3（`lib/content/postiz.ts` + `/api/content/social-publish`，draft 預設 = `type:"draft"`）可照此契約開工。唯一仍待部署後實測的細節：`GET /integrations` 完整 response 欄位（用於 UI 逐平台 gate）。

## Task 分解（六要素契約見原始 planner 輸出；摘要）
- **Task 0** `web-researcher`：✅ 完成（見上「Task 0 結果」事實表，2026-06-16）。Postiz API 原生 draft/schedule/now，gate 已解除。
- **Task 1** `devops-engineer`：EU 架 Postiz `postiz.aware-wave.com`（新 `infra/postiz/docker-compose.yml` + CF DNS + nginx）。**今天可開始**，不需 dev app。
- **Task 2** `web-researcher`+操作者：各平台 dev app + 審核送件，callback 指向 Postiz。**今天開始**（長外部瓶頸，並行）。
- **Task 3** `fullstack-engineer`：`lib/content/postiz.ts` + `/api/content/social-publish` route（雙模式、draft 預設）。不卡審核。
- **Task 4** `fullstack-engineer`：帳號連接 flow + `social-channels` route。
- **Task 5** `fullstack-engineer`：把死面板接成真發佈（channel 選擇 + 模式 toggle + 發佈鈕，帶 `imgResult.imageUrl`）。需 3+4。
- **Task 6** `fullstack-engineer`：客戶 onboarding doc + ops runbook（token 過期重連），回扣 SSOT §49。

## 關鍵路徑
`Task 0 → Task 1 →（Task 3 ∥ Task 4）→ Task 5 → 連接帳號真發佈`。**Task 2 審核並行整條 code track**；每個平台按鈕在其審核通過時上線；Reddit/Meta 先到先上，不必等齊。

## 風險重點
- 平台審核延遲（Meta App Review / X 付費 / TikTok）→ code 與審核解耦，UI 按連接狀態逐平台 gate。
- OAuth secret：全走 `secrets-vault.ps1` → EU `.env`，禁進 repo；Postiz 自存 user token 於其 DB（納入 D2 備份）。
- AGPL：自架未改 image 即合規；**禁 fork/改 Postiz 原始碼**（只 config/env）。
- 自動發佈違反 §49.7：預設排程草稿+人審；即時需明確 per-post 動作+確認。

## Rollback
Task 1 失敗：`docker compose -f infra/postiz/... down`（需 `# CONFIRMED-HIGH-RISK`）+ 移除 CF DNS/nginx + drop `postiz` DB；不影響 n8n/supabase/trigger。Task 3-5：revert next-admin commit，面板退回純文字 copy（現況），sg-deploy 自動 rollback 覆蓋。

## 原始完整 planner 輸出
見本 session（2026-06-14）對話記錄；六要素契約逐 task 完整版。
