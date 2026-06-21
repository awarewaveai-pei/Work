# Postiz 社群發佈整合計畫（Content Studio）

> 狀態：Task 0 ✅（API 契約，2026-06-16）+ Task 1 ✅（Postiz 部署上線，2026-06-14/15）；Task 2 並行中；Task 3–6 PENDING。live-status SSOT = [`CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md`](CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md) §A11。內容引擎 SSOT = `docs/wp-kadence-ai-seo-geo-content-engine.md` §49；本計畫是其「社群層另開工單」（handoff `agency-os/handoffs/2026-06-06-2029-tomo-202949.md:38`）的拆解。
> 需求：全平台（IG/FB/Threads/X/LinkedIn/TikTok/Pinterest/Reddit）+ 兩種發佈模式（草稿人審、即時）。
> 決策基礎：自架 Postiz（開源 AGPL，一套處理多平台 OAuth+排程）；不用 Metricool/Buffer/Ayrshare。
>
> **2026-06-21 架構師補強**：補強 10 個缺口（C1–C10）：圖片 pipeline 兩形態處理、next-admin Supabase client 連線模式決策、API base path 鎖定、secret 設計重定義、per-platform 串行 call、schedule 排 v2、syndicate 定位、now 不可撤回聲明、fixture 路徑、multi-workspace 預驗。

---

## Definition of Done

登入操作者在 `/tools/content` 能：(1) 連接客戶社群帳號（≥ IG/FB/Reddit 先上線）經自架 `postiz.aware-wave.com`；(2) 把 studio 已生成的各平台文案 + 圖片建立 Postiz 貼文，**Postiz draft（人審後發）** 或 **即時發佈**；(3) 預設 draft-first（spec §49.7 紅線：永不自動 publish）。真實測試帳號有貼文落地。

### v1 成功標準
**v1 不承諾全平台一次到位。** v1 成功 = `Content Studio → Postiz draft → 人工審核 → 測試帳號真實發文` 閉環成立，且至少 **IG/FB/Reddit/LinkedIn 任三個平台**可在測試帳號落地。

v1 必須具備：
- 每客戶明確隔離的 Postiz integration mapping（本系統 DB 有 `client_id → postiz_integration_id/platform/status`）。
- 預設 `type:"draft"`；`type:"now"` 只能在操作者明確選擇 + 二次確認（含不可撤回警語）後送出。
- 圖片 flow 完整：Content Studio 的 `imgResult.imageUrl`（R2 HTTPS URL 或 base64 data URL）均可 multipart upload 到 Postiz media，`{ id, path }` 放入 post payload。
- UI 按「已連接 channel」逐平台 gate；未連接或平台未通過審核時不可送出。
- 失敗時不吞錯：401/403/404/429/5xx 都在 UI 與 server log 顯示可操作原因。
- **v1 不含 `type:"schedule"`**（date picker + 排程邏輯列入 v2）。

### v2 / production-grade 才納入
- `type:"schedule"` 支援（date picker、ISO-8601 `date` 欄位）。
- Threads / TikTok / Pinterest / X 全平台完整支援。
- Postiz UI 深度嵌入或自建完整 account connect UX。
- 審核工作流、多人 approval、排程日曆、發佈後 analytics / reporting。
- 每平台 settings schema 完整管理與版本化。

---

## 整合流程序列（兩步驟，不合併）

> **[C8 決策]** `/api/content/syndicate`（AI 文案生成）與 `/api/content/social-publish`（推 Postiz）保持兩條獨立路由，不合併。理由：文案生成是 AI 消費，發佈是外部副作用；兩者失敗原因不同，混在一起使錯誤難以追蹤。

```
[Content Studio UI]
  │
  ├─① 呼叫 /api/content/syndicate
  │     └─ Claude Haiku 生成各平台文案 → 回 { posts: {instagram: "...", facebook: "...", ...} }
  │         UI 顯示文案供操作者修改
  │
  └─② 操作者選擇平台 + 確認模式 → 呼叫 /api/content/social-publish
        ├─ server 查 social_postiz_connections → 取 allowed integration ids
        ├─ 若有圖：upload image → Postiz /public/v1/upload → { id, path }
        └─ per-platform 串行 call：POST /public/v1/posts（一次一個 integration）
             → 回 [{ platform, integrationId, status, postizPostId?, error? }]
```

---

## 現況（已驗證 file:line）

- 死面板：`ContentStudio.tsx:3407-3478` 10 個勾選框 + 「生成社群貼文」；`handleSyndicate()` 只 POST `/api/content/syndicate` 拿文字 → copy 框。無發佈、無帳號 state。
- `app/api/content/syndicate/route.ts`：Claude Haiku 純生成文字，回 `{ok,posts}`。無 OAuth、無 Postiz。**保留，不改。**
- 生成圖 `imgResult.imageUrl` 有兩種形態（見 Gate C）；目前**沒**傳進任何發佈路徑。
- 發佈模板：`app/api/content/publish/route.ts`（thin HTTP shell + `lib/content/publish/wordpress-core.ts`）→ 新 `social-publish` route 照此薄殼 + 厚 lib 分層慣例。
- Postiz infra：`infra/postiz/docker-compose.yml`；`STORAGE_PROVIDER=local`（不是 R2）；port `127.0.0.1:4007`；`NEXT_PUBLIC_BACKEND_URL=https://postiz.aware-wave.com/api`。
- next-admin 目前**無 Supabase client**（搜不到 `createClient`、`supabase-js`、`DATABASE_URL` 使用）→ Gate E.1 解決。

---

## 待操作者決定（開工前必決）

| # | 決策 | 建議 / 現況 |
|---|------|------------|
| D1 | 整合方式 | 混合：發佈走 Postiz **API**（文字+圖、雙模式）；帳號連接 OAuth 用 Postiz UI（新分頁） |
| D2 | Postiz DB | 共用 `supabase-db` 開獨立 `postiz` DB/user（已部署）；備份需涵蓋 `postiz` DB |
| D3 | Secret 儲存 | **[C4 決策]** v1 single-workspace → `POSTIZ_API_KEY` 直接放 EU `.env`，不需 DB secret ref。若 Gate E.2 確認可多 workspace → 每 client API key 以 `AES-256-GCM` 加密後存 DB column，解密走 `POSTIZ_ENCRYPTION_KEY` env var |
| D4 | 模式對應 | **已解除**：Postiz 原生 `draft` / `schedule` / `now`；預設一律 `draft`，`now` 僅允許明確二次確認後執行；`schedule` 列 v2 |
| D5 | 審核順序 + X 預算 | 先送 Meta(IG+FB)+Reddit+LinkedIn；**X 不列入 v1 承諾**（pricing/credits/寫入權限另驗）；TikTok 延後 |
| D6 | Tenant model | Gate E.2 驗 Postiz multi-workspace 可行性後決定：可行 → 每客戶獨立 workspace；不可行 → single workspace + DB integration allowlist per client_id |

---

## Gate A — API base path smoke test ✅ 完成 2026-06-22

**結果：**
- `POSTIZ_API_BASE_URL=https://postiz.aware-wave.com/api` **鎖定**（無 redirect，無 CF rewrite）
- `Authorization: <raw_key>`（無 Bearer 前綴）確認有效
- API key 從 `Organization.apiKey` 欄位讀取（DB table，非 Postiz UI 手動建立；已存入 vault + SG .env）
- curl on EU: `curl -si "http://127.0.0.1:4007/api/public/v1/integrations" -H "Authorization: $POSTIZ_API_KEY"` → **HTTP/1.1 200 OK**，無 trailing slash 需求
- 鎖定值已存：SG `/root/lobster-phase1/.env` + 本機 `secrets-vault.ps1`

---

## Gate B — `GET /integrations` schema snapshot ✅ 完成 2026-06-22

實機 response（v2.11.3，1 個 Bluesky integration）已存入 fixture：
**`app/api/content/social-publish/__tests__/fixtures/postiz-integrations.sample.json`**

**API response 欄位實測結果：**
```json
[{ "id": "cmqe3jw960001p58nt0xohbi8", "name": "soulfulexpression.bsky.social",
   "identifier": "bluesky", "picture": null, "disabled": false,
   "profile": "soulfulexpression.bsky.social" }]
```
- `id` = postiz integration id（內部 cuid）
- `identifier` = platform 識別字（`bluesky`、`instagram` 等）— **這是 `platform` 欄位的值**
- `disabled` = boolean（true = 停用）
- **無 workspace 欄位**（single-workspace 實例）— D6 confirmed: single workspace

前端 channel gate 不得猜欄位；必須透過 `lib/content/postiz.ts` normalize 成內部型別：

```ts
// lib/content/postiz.ts
export type SocialChannel = {
  clientId: string
  postizIntegrationId: string
  platform: 'instagram' | 'facebook' | 'reddit' | 'linkedin' | 'x' | 'threads' | 'tiktok' | 'pinterest' | 'bluesky'
  label: string
  status: 'connected' | 'disabled' | 'expired' | 'unsupported'
}
```

---

## Gate C — media upload pipeline（完整修訂）✅ 完成 2026-06-22

**實測結果（from SG `5.223.93.113` → `postiz.aware-wave.com`）：**
- `POST /public/v1/upload` (multipart PNG 69B) → HTTP 201 `{ id: "e9d185d9-f649-4274-b6f6-dff9ffdcb323", path: "https://postiz.aware-wave.com/uploads/2026/06/21/ba8810a2aef6f3e16f234fdc2f8b2d49d.png" }`
- `POST /public/v1/posts` (type:draft, Bluesky + image) → HTTP 201 `[{ postId: "cmqo1wijz0005p58ncl1mtssr", integration: "cmqe3jw960001p58nt0xohbi8" }]`
- Rate limit: `x-ratelimit-limit: 30 / reset: 3600s` 確認
- ⚠️ 測試 draft `cmqo1wijz0005p58ncl1mtssr` 在 Postiz UI 中，需手動刪除

**[C1 補強]** `imgResult.imageUrl` 有兩種形態，Postiz 用 `STORAGE_PROVIDER=local`（不支援 upload-from-url）。唯一路徑：multipart upload 到 `POST /public/v1/upload`。

**兩種 imageUrl 的處理：**

```
imageUrl 形態偵測
├─ 以 "data:" 開頭（base64 data URL，R2 未設定時的 fallback）
│    └─ base64 decode → Buffer → multipart FormData → POST /public/v1/upload
└─ 以 "https://" 開頭（R2 公開 HTTPS URL，R2 已設定時）
     └─ server-side fetch(imageUrl) → arrayBuffer → multipart FormData → POST /public/v1/upload
```

multipart upload 成功 → 回 `{ id, path }` → 放入 post payload：
```json
"image": [{ "id": "<postiz-media-id>", "path": "<postiz-media-path>" }]
```

**Fail closed 原則（不靜默送出無圖貼文）：**
- imageUrl 為空字串 → 建純文字 draft（無圖），UI 告知「此貼文不含圖片」
- fetch 失敗（4xx/5xx/timeout）→ typed error，整筆 draft 停止
- content-type 非 image/* → typed error，整筆 draft 停止
- base64 decode 失敗 → typed error，整筆 draft 停止
- Postiz upload 返回非 200 → typed error，停止建立 post

---

## Gate D — tenant isolation（DB schema）

**[C4 更新]** 預設決策：v1 使用 single Postiz workspace，以 DB 的 `client_id → postiz_integration_id` allowlist 做隔離（不依賴前端 filter）。

```sql
-- migration: 0042_social_postiz_connections.sql（放 infra/supabase/migrations/）
create table social_postiz_connections (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null,                     -- 對應 organizations.id
  postiz_workspace_id   text,                              -- v1 可 null（single workspace）
  postiz_integration_id text not null,
  platform              text not null,                     -- 'instagram'/'facebook' etc.
  label                 text,                              -- 顯示名稱
  status                text not null default 'connected', -- connected/disabled/expired
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (client_id, postiz_integration_id)
);
-- RLS: operator/admin 只能讀寫自己 org 的 rows（見 Gate E.1）
```

**[C4 重定義]** v1 secret 設計：
- `POSTIZ_API_KEY`（single workspace）→ 直接放 EU `.env` + `secrets-vault.ps1`，不進 DB
- API route 從 `process.env.POSTIZ_API_KEY` 讀取；`lib/content/postiz.ts` 的 `getPostizConfig()` 負責讀取並在缺失時 throw typed error

---

## Gate E — 前置驗證（所有 Task 3+ 開工前）

### Gate E.1 — next-admin Supabase client 連線模式 ✅ 完成 2026-06-22

**實際狀況（VBC 已查）**：next-admin 已有 `lib/supabase-server.ts` 提供 `getSupabaseWriteClient()`（service role）和 `getSupabaseReadClient()`（anon），`@supabase/supabase-js ^2.49.8` 已在 `package.json`，env vars `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 已在 SG `.env`。

**結論**：無需新建任何 client 或安裝套件。`lib/content/postiz.ts` 直接 `import { getSupabaseWriteClient } from "@/lib/supabase-server"`。

### Gate E.2 — Postiz multi-workspace ✅ 完成 2026-06-22（D6 決策落地）

**實際查驗（DB + API）**：
- `Organization` 表只有 1 筆（id `b4e7399b...`，name `AwareWave`）
- API key 儲存在 `Organization.apiKey` 欄位（per-org，非 Postiz UI 手動建立）
- v2.11.3 `DISABLE_REGISTRATION=true`（單帳號），無法在 UI 建立第二個 workspace

**D6 決策（confirmed single-workspace）**：v1 維持 single workspace + `social_postiz_connections` integration allowlist per `client_id`。API key 單一 env var `POSTIZ_API_KEY`，不加密存 DB。v2 才評估 multi-workspace。

---

## Phase 2 開工前 gates 一覽（Task 5 UI 合併前必完成）

| Gate | 狀態 | 關鍵產出 |
|------|------|---------|
| **E.1** Supabase client 模式 | ✅ 2026-06-22 | 已有 `lib/supabase-server.ts`；直接用 `getSupabaseWriteClient()` |
| **E.2** Multi-workspace 可行性 | ✅ 2026-06-22 | D6 confirmed: single workspace + allowlist |
| **A** Base path smoke test | ✅ 2026-06-22 | `POSTIZ_API_BASE_URL=https://postiz.aware-wave.com/api` 鎖定 |
| **B** Integrations schema snapshot | ✅ 2026-06-22 | fixture JSON 存入 `__tests__/fixtures/` |
| **C** Media upload pipeline | ✅ 2026-06-22 | multipart upload → `{ id, path }` + draft+image POST → `postId` 實測通過（from SG→postiz.aware-wave.com） |
| **D** Tenant isolation schema | ✅ 2026-06-22 | `social_postiz_connections` deployed on EU Supabase |

---

## Task 0 結果（Postiz Public API 契約事實表，✅ 已完成 2026-06-16）

> **⚠ 狀態校正（VBC 2026-06-16）**：Task 1（部署）**已完成** — Postiz v2.11.3 已上線 `postiz.aware-wave.com`（EU，commit `a951190c`），**Bluesky 端到端發文實測通過（2026-06-15）**。**社群層 live-status SSOT = [`CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md`](CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md) §0.5/A11**；故下表是**整合碼（Task 3）的契約參考**。
>
> 來源：官方 `docs.postiz.com/public-api`（WebFetch 2026-06-16；2026-06-21 再核對）。X API 已改為 pay-per-use / credit-based，v1 不應綁死「$100/月起」假設。

| 項目 | 事實（verbatim 欄位名） | 信心 |
|------|------------------------|------|
| Base path | `$POSTIZ_API_BASE_URL/public/v1`（**Gate A 鎖定前不寫死**）| 高（format）/ 待鎖（value）|
| Auth | header `Authorization: <api_key>`（**raw key，無 `Bearer` 前綴**）；key 在 Postiz UI Settings > Developers > Public API 產生（per-workspace） | 高 |
| 建立貼文 | `POST /public/v1/posts` | 高 |
| 貼文 body | `{ type, date(ISO-8601), shortLink(bool), tags[], posts[] }`；每個 `posts[]` = `{ integration:{ id }, value:[{ content, image:[{ id, path }] }], settings:{ __type:<platform>, …平台專屬 } }` | 高 |
| **type enum** | **`draft` / `schedule` / `now`** — `draft` = 存草稿永不自動發；`schedule` = 需帶 `date`（v2）；`now` = 立即發佈 | 高 |
| 列出 channel | `GET /public/v1/integrations`（response 欄位待 Gate B curl 補） | 高（path）/ 待鎖（欄位）|
| 媒體上傳 | `POST /public/v1/upload`，`multipart/form-data` 欄位 `file` → 回 `{ id, path }` | 高 |
| Rate limit | **90 req/hr（自架）**；僅限 create-post；自架可調 env `API_LIMIT` | 高 |
| 帳號連接 | 不走 public API — 是 Postiz web UI 的 OAuth flow | 高 |
| Storage | `STORAGE_PROVIDER=local`（本機 volume）— **不支援 upload-from-url，只走 multipart** | 高（已驗 docker-compose）|
| Per-platform call | **[C6 決策]** 每個 integration 獨立呼叫 create-post（串行）；partial failure 可接受；不依賴 Postiz 單一 call 的 partial success 行為 | 中（待實測確認）|
| 部署事實 | v2.11.3 running on EU；`DISABLE_REGISTRATION=true`（單帳號）；multi-workspace 待 Gate E.2 確認 | 高 |

---

## Task 分解

- **Task 0** `web-researcher`：✅ 完成（API 契約事實表，2026-06-16）
- **Task 1** `devops-engineer`：✅ 完成（Postiz v2.11.3 live，Bluesky e2e 2026-06-15）；補項：smoke test 記錄、備份策略確認、`API_LIMIT` env 確認。
- **Task 2** `web-researcher` + 操作者：各平台 dev app + 審核送件，callback 指向 Postiz。並行整條 code track；每平台審核通過時上線，不阻塞。
- **Task 3** `fullstack-engineer`：✅ 完成 2026-06-22 — `lib/content/postiz.ts` + `/api/content/social-publish/route.ts`（Gate E.1 已有 `lib/supabase-server.ts`；Gate A/D 已完成）。
- **Task 4** `fullstack-engineer`：✅ 完成 2026-06-22 — `GET /api/content/social-channels?clientId=xxx`（operator+）+ `GET /api/content/social-admin/integrations`（admin+）+ `POST/DELETE /api/content/social-admin/connections`（admin+，server-side org 驗證 + platform 由 server 從 Postiz 推導，不信任 client）+ `ClientHubTabs` 新增「社群頻道」tab（connect/disconnect UI，useEffect 含 mounted guard）。
- **Task 5** `fullstack-engineer`：✅ 完成 2026-06-22 — ContentStudio.tsx 死面板接線：postizChannels state + loadPostizChannels() + handlePostizPublish() + channel checkbox UI + per-channel textarea（synContent 預填）+ Draft/Now toggle + 二次確認 modal（不可撤回警語）+ results（含 skipped 顯示）。Critic Major fix: modal 確認鈕 disabled guard 防雙擊。
- **Task 6** `fullstack-engineer`：ops runbook（token 過期重連、rate limit 處理、連線狀態巡查），回扣 SSOT §49。

### Task 3 實作契約

`lib/content/postiz.ts` 必須提供：

```ts
// 設定 guard — 缺 env 時 early throw typed error，不讓後續 call 傳播 undefined
export function getPostizConfig(): { baseUrl: string; apiKey: string }

// server-side 查 social_postiz_connections + Postiz /integrations，normalize 成 SocialChannel[]
export async function listIntegrations(clientId: string): Promise<SocialChannel[]>

// 偵測 data URL vs HTTPS URL → 均走 multipart → 回 { id, path } | typed error
export async function uploadMedia(opts: {
  imageUrl: string    // "data:image/webp;base64,..." OR "https://..."
  filename?: string
}): Promise<{ id: string; path: string }>

// per-platform 串行 call（不依賴 Postiz 的 partial success 行為）
// mode v1 只允許 'draft' | 'now'；'schedule' 列 v2
export async function createSocialPost(opts: {
  clientId: string
  mode: 'draft' | 'now'
  posts: Array<{ integrationId: string; platform: string; content: string }>
  media?: { id: string; path: string }
}): Promise<Array<{
  platform: string
  integrationId: string
  status: 'ok' | 'error'
  postizPostId?: string
  error?: string
}>>

// 即時發佈的雙重 gate：ops-role + confirmPublishNow flag
export function assertCanPublishNow(role: OpsRole, confirmPublishNow: boolean): void
```

`/api/content/social-publish` 必須：
- `resolveOpsRole(req)` + `canCreateAiImageJob(role)` → 403
- 從 `social_postiz_connections` 取 `client_id` 的 allowed integration ids；前端傳入的 platform 只是 **selection intent**，server 用 DB allowlist gate 後才送 Postiz
- `mode === 'now'` → 額外要求 body 含 `confirmPublishNow: true`，否則 400
- 若 body 含 `imageUrl` → 先 `uploadMedia()` 再建 post
- 回傳每平台結果陣列；HTTP 200（即使部分平台失敗）；個別失敗含可操作原因

### Task 4/5 UI 契約

- Channel selector 顯示 `connected` / `disabled` / `expired` / `unsupported` 四種狀態
- Publish mode 預設 `Draft for review`；`Publish now` 放在 secondary action
- `Publish now` 必須開 modal，**包含**：「此操作不可撤回：貼文送出後將立即出現在社群平台，系統無法從平台端刪除。確定即時發佈？」
- 未連接 channel 顯示「到 Postiz 連接帳號 ↗」（新分頁），不用 iframe（OAuth callback 會卡）
- 發佈後顯示每平台狀態列表（✓ Draft 建立 / ✗ 錯誤原因），並保留文案 copy fallback

---

## 驗收測試清單

### API / service tests
- `GET /api/content/social-channels?client_id=X`：只回該 client 可用 channel，不洩漏其他客戶 integration。
- `POST /api/content/social-publish` default：未傳 mode → 建 Postiz `draft`，不發佈。
- `POST /api/content/social-publish` now：缺 `confirmPublishNow` → 400；有確認且有權限 → 送 `type:"now"`。
- image upload（R2 HTTPS URL）：有效 URL → fetch → multipart → 成功回 Postiz media id。
- image upload（data URL）：有效 base64 → decode → multipart → 成功回 Postiz media id。
- image upload（過期 URL / 403 / 非 image content-type）→ typed error，整筆 draft 停止。
- Postiz 401/403 → UI 顯示「API key/權限錯誤，請重連或更新 secret」。
- Postiz 429 → UI 顯示 rate limit，server log 含 client/platform/timestamp，不自動無限 retry。
- Postiz 5xx / timeout → 短 retry with backoff（最多 2 次）；仍失敗 → 保留文案與圖片，不標記成功。

### E2E acceptance
- IG/FB/Reddit/LinkedIn 任三平台：Content Studio 產文案 + 生成圖 → 建 draft → Postiz UI 看得到文案與圖片 → 人工發佈測試帳號成功。
- 未連接平台：前端不可選，或送出前被 gate 擋下（HTTP 400）。
- 客戶隔離：client A 的 session 送 client B 的 `postiz_integration_id` → server 拒絕（403 或 400 with "integration not allowed"）。
- rollback：revert Task 3–5 commit + sg-deploy → Content Studio 回到純文字 copy flow，`/api/content/syndicate` 繼續正常工作。

---

## 關鍵路徑

```
Gate E.1 + Gate A + Gate D（並行完成）
  └→ Task 3（lib/content/postiz.ts + social-publish route）
       ∥
     Gate E.2 + Gate B（並行完成）
  └→ Task 4（social-channels route + admin mapping UI）
       └→ Task 5（UI 整合，接 Task 3 + 4 + Gate C）
            └→ 連接帳號真發佈驗收

Task 2（平台 dev app 審核）並行整條 code track；每平台審核通過時上線，不阻塞。
```

---

## 風險重點

| 風險 | 等級 | 緩解 |
|------|------|------|
| 平台審核延遲（Meta / TikTok）| 🟡 Med | code 與審核解耦，UI 按連接狀態 gate；Reddit 無審核，先用 |
| 租戶隔離錯誤（最高產品風險）| 🔴 High | server route 用 `client_id` + DB allowlist gate，禁止前端直傳 integration id 直送 Postiz |
| `type:"now"` 不可撤回 | 🟡 Med | UI 二次確認含不可撤回警語；server log 每次 now-publish 記錄 timestamp + client + platform |
| OAuth secret 外洩 | 🟡 Med | 全走 `secrets-vault.ps1` → EU `.env`；禁進 repo；Postiz 自存 user token 於其 DB（D2 備份涵蓋）|
| AGPL 合規 | 🟠 Low | 自架未改 image 即合規；**禁 fork/改 Postiz 原始碼**（只 config/env）|
| 自動發佈違反 §49.7 | 🔴 High | 預設 `draft`；`now` 需明確 per-post 二次確認；server 雙重 gate（ops-role + confirmPublishNow flag）|
| Rate limit（90 req/hr）| 🟠 Low | per-platform 串行 call 不會爆；若未來多客戶並發需調 `API_LIMIT` env |

---

## Rollback

**Task 1（Postiz infra）失敗：**
```bash
# CONFIRMED-HIGH-RISK: stop postiz on EU
docker compose -f /root/postiz/docker-compose.yml down
```
移除 CF DNS / nginx vhost；drop `postiz` DB（需備份確認）；不影響 n8n/supabase/trigger。

**Task 3–5（next-admin code）：**
revert commit + `sg-deploy.sh next-admin` → Content Studio 回到純文字 copy flow。`/api/content/syndicate` 不受影響。

**已建立的 `social_postiz_connections` rows：** rollback **不刪 DB 資料**，只停用 UI entrypoint（移除 social-publish 入口按鈕）。若需要防止舊版部署仍能呼叫 Postiz，rotate `POSTIZ_API_KEY`。

> **[C9 紅線]** `type:"now"` 已透過 Postiz 發佈到社群平台的貼文**無法從本系統端撤回**。系統 rollback 僅阻止後續發佈；已發出的貼文必須由操作者手動登入各平台刪除。此限制必須在 Task 5 UI 的 `Publish now` 確認 modal 中向操作者明確說明。

---

## 補強摘要

### 2026-06-21 架構師補強（v2）
- **[C1]** Gate C 全文重寫：刪 upload-from-url（Postiz local storage 不支援），兩種 imageUrl 形態（R2 HTTPS / base64 data URL）均走 multipart；加 fail-closed policy。
- **[C2]** 新增 Gate E.1：next-admin 加入 `@supabase/supabase-js` server client；`lib/supabase/server.ts` + 兩個 env vars（`NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`）。
- **[C3]** Gate A 補強：加暫定 `POSTIZ_API_BASE_URL` 值（`https://postiz.aware-wave.com/api`）與 curl 指令；Gate A 完成前禁止 Task 3 開工。
- **[C4]** D3 secret 設計重定義：v1 直接 env var；multi-workspace 才需加密存 DB。移除 `postiz_api_key_secret_ref` 懸空欄位。
- **[C5]** 新增 Gate E.2：Postiz multi-workspace 可行性驗證，結果決定 D6 tenant model。
- **[C6]** Task 3 `createSocialPost` 改 per-platform 串行 call；不依賴 Postiz 的 partial success 行為；回傳聚合結果。
- **[C7]** v1 scope 明確排除 `type:"schedule"`，date picker + 排程邏輯列 v2。
- **[C8]** 新增整合流程序列圖：syndicate（AI 文案生成）與 social-publish（推 Postiz）保持兩條獨立路由，不合併。
- **[C9]** Rollback 段加 `type:"now"` 不可撤回紅線聲明；Task 5 UI 確認 modal 必含警語。
- **[C10]** Gate B fixture 路徑改為 `app/api/content/social-publish/__tests__/fixtures/`，符合現有 `lib/**/__tests__/` 慣例。

### 2026-06-21 前版補強（v1）
- v1 成功標準切割；D3 建議每客戶獨立 workspace；D4 標示已解除；D5 更新 X API；新增 Gate A–D；新增 Task 3/4/5 實作契約與驗收測試清單。

---

## 原始完整 planner 輸出
見本 session（2026-06-14）對話記錄；六要素契約逐 task 完整版。
