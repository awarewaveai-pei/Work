# 全自動客服系統 — 進化版總計畫（Automation Master Plan）

> **SSOT 宣告**：本檔是「全自動客服」的**主計畫（SSOT）**，取代 `Customer_service_plan.md` 的 roadmap 與 AI 層設計。
> `Customer_service_plan.md`（決策摘要）與 `Customer_service_platform_research.md`（通道可行性研究）降為**附錄**，事實仍有效，但排序/AI 架構以本檔為準。
> **本次範圍：只出計畫，不寫 code。** 每個 Phase 的實作另起 R0 流程。
> **狀態**：草案 v1.1（2026-06-25）｜**已鎖定決策**見 §0。（v1.1 補：失效降級 §8.4、成本單位經濟 §8.5、24h 時窗 §3、起手意圖表 §5.0、AI 引擎決策 D7）

---

## §0 核心決策（已與操作者拍板，鎖定）

| # | 決策 | 拍板結果 | 影響 |
|---|---|---|---|
| D1 | 自動化程度目標 | **L1→L2 漸進**（co-pilot 起步，逐意圖經 eval 升自動；money/身分/法律/醫療永不自動） | 整份安全哲學 |
| D2 | 服務對象 | **三維一起建**（自用+代客戶+產品 SaaS）；**上線順序**自家先當金絲雀（tenant #0），客戶/產品結構同步就緒 | 多租戶為一級公民 |
| D3 | Embeddings 供應商 | **OpenAI `text-embedding-3-small` 起步，介面可插拔**（資料主權型客戶日後切自架 bge-m3） | RAG 管線抽象層 |
| D4 | 個人帳號軌 | **商業軌=主幹**（全平台官方 API）；**個人軌=隔離高風險選配**，僅自用實驗、獨立 IP、明確封號旗標，不進產品 | Roadmap Phase 6 隔離 |
| D5 | Chatwoot VPS | **獨立 VPS**（已驗證 EU cpx32 8GB 近滿，塞不下） | 基礎設施 |
| D6 | 對話儲存歸屬 | **Chatwoot 擁有對話/訊息**；我方層經 webhook+API 讀，自己只擁有「知識庫+eval+AI 稽核+租戶設定」（無雙真相源） | 資料模型邊界 |
| D7 | AI 引擎 build vs buy | **自建 Claude+RAG**（非 Chatwoot 付費 Captain）：重用既有 SDK/Supabase、模型/護欄/品牌語氣自控、省 per-agent + per-credit 費 | AI 層全自研 |

**一句話架構**：Chatwoot 當全通道載體（獨立 VPS）+ 自建 `lib/cs/` 深模組（重用 Claude SDK / Supabase pgvector / vault / ops-inbox 派送器）做 AI 核心；自動化 L1→L2 逐意圖漸進、money/身分永不自動、全程 eval 護欄 + 一鍵 kill-switch。

---

## §1 「全自動」分級定義（先把詞講清楚）

業界沒有統一標準，本專案自訂 **CS Autonomy Levels（客服自主分級）L0–L4**，類比自駕車 SAE Levels：

| 級 | 名稱 | AI 做什麼 | 真人做什麼 | 風險 |
|---|---|---|---|---|
| **L0** | 純人工 | 無（只聚合收件匣） | 全部回覆 | — |
| **L1** | 協作副駕（co-pilot） | 草擬回覆、翻譯、摘要客戶歷史 | **逐則審核後按送** | Low |
| **L2** | 條件自動（conditional auto） | **高信心、已 eval 通過的意圖**自動回；其餘轉真人 | 監看 + 接手低信心/敏感 | Med |
| **L3** | 監督自動（supervised auto） | 自動回絕大多數，含追問澄清 | 抽查 + 例外接手 | High |
| **L4** | 全自主（full auto） | 含執行動作（退款/改單/帳號） | 幾乎不介入 | **紅線禁區** |

**本專案目標 = L2（progressive）**。意思是：
- **每個意圖（intent）獨立畢業**：不是整個系統一次升級，而是「退貨查詢」這類意圖先過離線 eval → shadow → canary → 全自動；「退款執行」這類**永遠停在 L1（強制轉真人）**。
- **永不到 L4**：money（退款/扣款/開通）、身分（改帳號/重設密碼）、法律/醫療建議 → **硬性轉真人**，與你 POD A2 fulfillment 的 money 紅線同紀律。
- **可退級**：任何意圖出問題，config 一鍵降回 L1 或關閉（kill-switch），不需 deploy。

---

## §2 系統架構總覽

```
┌──────────────────────────────────────────────────────────────┐
│  next-admin / ops console (Next.js 15 + Supabase, EU VPS)      │
│  · /ops/cs 入口卡片：知識庫管理、eval 儀表板、意圖開關、成本      │
│  · deep-link / SSO 進 Chatwoot 坐席台                          │
└───────────────┬──────────────────────────────┬───────────────┘
                │ (管理面)                       │ (AI 核心，新建 lib/cs/)
                │                                ▼
                │            ┌─────────────────────────────────────────┐
                │            │  cs-engine  (lib/cs/ — deep module)        │
                │            │  webhook→分類→RAG→生成→護欄→送/轉           │
                │            │  重用: @anthropic-ai/sdk · supabase ·       │
                │            │        secret-vault · ai_call_logs ·        │
                │            │        ops-inbox/notify/dispatcher          │
                │            └───────┬──────────────────┬────────────────┘
                │   webhook(進站客訊) │                  │ pgvector 檢索
                ▼                    │                  ▼
┌────────────────────────────┐      │      ┌────────────────────────────┐
│  Chatwoot (獨立 VPS, Docker) │◄─────┘      │ Supabase pgvector (EU)      │
│  Account→Team→Inbox 三層多租戶│  API 回覆    │ cs_knowledge_chunks (新表)   │
│  對話/訊息真相源              │─────────────►│ + cs_intents/eval/ai_replies │
└───────┬────────────────────┘             └────────────────────────────┘
        │ 商業帳號軌（官方 API，主幹）          │ 個人帳號軌（Phase 6 隔離，自用限定）
        ▼                                    ▼
  WhatsApp Cloud API / Messenger / IG /     Matrix(Synapse) + mautrix bridges
  LINE / Telegram / Email / Website widget   （高風險、獨立 IP、不進產品）
```

**模組邊界（為「30 年 + 可擴可刪」）**：
- `lib/cs/` 設計成 **deep module（深模組）**：對外只露 `handleInboundMessage(ctx)` 與 `ingestKnowledge(source)` 兩個窄介面，內部 RAG/護欄/eval 全封裝。日後要抽成獨立 `cs-engine` 微服務，只搬這個資料夾。
- **通道層、AI 層、知識層三者解耦**：加一個通道（e.g. LINE）不動 AI 層；換 embeddings 供應商不動通道層；關一個意圖只改 config。

---

## §3 AI 核心控制流（全自動的心臟）

進站客訊的處理管線（pipeline），每一關都是可關閉的閘門：

```
1. 進站  Chatwoot webhook → cs-engine（驗 HMAC 簽章 + 冪等鍵 idempotency-key）
2. 前置  · 租戶解析（organization_id）· 是否在營業時間 · 是否已轉真人(若是→AI 噤聲)
         · loop 偵測（對方是不是 bot / 同句洗版）· rate limit（每客戶/每租戶）
3. 分類  意圖分類（intent classification）：Claude haiku 快模型 → intent + 信心分數
         · 命中「敏感意圖表」(退款/個資/法律/醫療/投訴升級) → 直接跳 (7) 轉真人
4. 檢索  RAG：依 intent + 客訊 embed → pgvector 查該租戶 namespace 的知識塊 top-k
         · 檢索分數過低（知識庫沒答案）→ 跳 (7) 轉真人，不硬答
5. 生成  Claude sonnet/opus + 系統提示（品牌語氣+護欄）+ 注入檢索塊 → 草擬回覆
6. 護欄  · 引用強制（grounding check）：回覆主張須能對應檢索塊，否則判為 hallucination → 轉真人
         · 信心門檻：intent 信心 × 檢索分數 < 該意圖閾值 → 轉真人
         · 該 intent 的自動化級別：L1→寫成 Chatwoot 私有草稿給坐席；L2→自動送出
         · 輸出檢查：PII 外洩 / 禁語 / 長度 / 格式
7. 送出  · L2 自動：Chatwoot API 送出，標記「AI 已回」+ 記 cs_ai_replies 稽核
         · L1 或轉真人：建 Chatwoot 私有筆記（草稿）+ 指派坐席 + ops-inbox 告警（可選）
8. 學習  每則 AI 回覆 + 坐席是否改寫/接手 → 回流 eval 資料集（持續改進）
```

**冪等與可靠性**：webhook 用 `idempotency-key`（Chatwoot message id）去重；失敗走 Trigger.dev（既有）做 durable retry（持久重試），避免重複回覆客戶。

**平台時窗限制（WhatsApp/Meta 24h window，自動化必懂）**：客戶來訊後 **24 小時內**可自由回覆（AI 自動或人工皆可）；**逾 24h 僅能送平台核准的範本訊息（template）**，AI 不可自由發訊。故 AI 自動回覆**只在時窗內**運作；逾時的對話走「核准範本 + 轉真人」。Email / Telegram / Website widget **無此限制**（這也是 Phase 1 先打這三條最快見效的原因）。

---

## §4 RAG 管線（知識庫核心，目前 pgvector 不存在 → 新建）

**RAG = Retrieval-Augmented Generation（檢索增強生成）**：不靠模型背知識，而是把「你餵的資料」即時檢索出來注入提示，讓 AI 只根據你的真實文件回答 → 大幅降低編造。

### 4.1 資料來源盤點（餵什麼）
| 來源 | 取得 | 切塊策略 |
|---|---|---|
| 產品/服務文件、FAQ | 手動上傳 / WP REST 抓 | 依標題層級切，保留 heading 脈絡 |
| 客服 SOP / 退換貨政策 | 手動上傳 | 段落切，標 `is_sensitive` |
| 過往對話（已結案）| Chatwoot API 匯出 | Q-A 對切塊，人工標「可作範例」才入庫 |
| 客戶結構化資料（訂單/會員）| **不入向量庫**，走即時 API 查（function calling） | — |

> **重要**：訂單狀態這類動態資料**不做 embedding**（會過期），改用工具呼叫即時查；向量庫只放穩定的知識文件。

### 4.2 管線（可插拔 embeddings — D3）
```
文件 → 清洗/切塊(chunk) → embeddings(可插拔: OpenAI text-embedding-3-small | 自架 bge-m3)
     → 存 cs_knowledge_chunks(pgvector, 依 organization_id 分 namespace)
     → 查詢時：客訊 embed → 同 namespace cosine 相似度 top-k → 注入提示
```
- **抽象介面** `EmbeddingProvider.embed(texts) → vectors`：起步 OpenAI（已有 OpenAI 模型慣例，惟 `openai` npm 套件**尚非直接依賴**，實作時補裝 SDK 或走 REST）；資料主權型客戶切 `BgeM3Provider`（自架）。**切供應商須整租戶重建索引**（維度不同），故 `cs_knowledge_chunks` 記 `embed_model` 欄位。
- **重建策略**：知識來源更新 → 標 `dirty` → Trigger.dev 背景重嵌入；不即時阻塞客服。

### 4.3 pgvector schema（草案，§9 完整 DDL）
- 在 Supabase 啟用 `vector` extension；`cs_knowledge_chunks.embedding vector(1536)`（OpenAI small 維度；換模型則另欄/另表）。
- 索引：`ivfflat` 或 `hnsw`（資料量大用 hnsw），`WHERE organization_id = ?` 先過濾再相似度 → **租戶隔離 + 效能**。

---

## §5 Eval & 安全護欄 Harness（最重要章節 — 沒這個就不該開自動）

**這是「全自動但安全」的命門。現計畫只一句帶過，本檔補完整。**

### 5.1 離線評估（offline eval — 自動化的畢業考）
- 每租戶每意圖維護 **golden set（黃金測試集）**：`問題 → 期望要點/期望轉真人` 的配對（存 `cs_eval_cases`）。
- 一個意圖要從 L1 升 L2，**必須**：
  1. golden set ≥ N 題（建議 ≥30）
  2. 跑離線 eval：AI 答案 vs 期望，用「LLM-as-judge（模型當評審）+ 引用命中率」打分
  3. 通過率 ≥ 閾值（建議正確率 ≥95%、**危險誤答率 = 0**）
  4. 「該轉真人卻自動答」的 recall（漏接率）必須 0
- 未過 → 留在 L1，不准自動。

### 5.2 線上護欄（online guardrails — 每則即時把關）
| 護欄 | 機制 | 失敗動作 |
|---|---|---|
| 敏感意圖 | money/個資/法律/醫療/投訴 命中表 | **強制轉真人** |
| 信心門檻 | intent 信心 × 檢索分數 < 閾值 | 轉真人 |
| 引用強制 grounding | 回覆主張須對應檢索塊 | 判 hallucination → 轉真人 |
| 知識缺口 | 檢索 top score 過低 | 轉真人（不硬答）|
| PII 外洩 | 輸出掃描信用卡/身分證/他人個資 | 攔截 + 告警 |
| AI-loop | 對方疑似 bot / 同句洗版 | 噤聲 + 標記 |
| Rate limit | 每客戶/每租戶上限 | 節流 |
| 成本上限 | 每租戶日/月 token 上限（讀 `ai_call_logs`）| 超額降級/告警 |

### 5.3 漸進放量（progressive rollout）
```
新意圖：  L1 草稿  →  離線 eval 過  →  shadow(影子: 自動生成但不送，只記錄與真人答比對)
        →  canary(金絲雀: 只對 5%→25%→100% 流量自動送)  →  全自動 L2
```
- 每階段看線上指標（§8）不退步才進下一階；退步自動回退。

### 5.4 持續改進迴圈
- 坐席每次「改寫 AI 草稿/接手」= 一筆訓練訊號 → 半自動回灌 golden set 與知識庫缺口（對應 Chatwoot Captain 的 Smart FAQs 概念，但自建可控）。

---

## §6 人類交接 / 升級（human-in-the-loop）

- **交接觸發**：§5 任一護欄 fail、客戶明確要真人、坐席手動接管。
- **AI 噤聲規則**：對話一旦轉真人/坐席介入，AI **停止自動回**（控制流第 2 關），避免人機打架。
- **漏回告警（重用既有）**：客訊超 SLA 未回 → 走 `lib/ops-inbox/notify/dispatcher.ts`（已驗證存在，Slack+Telegram 規則引擎）發告警。**不重造告警系統。**
- **坐席台**：用 Chatwoot 原生坐席介面（含「AI 已回」標記、一鍵接管、私有草稿）。next-admin 只放管理面（知識庫/eval/開關/成本），不重做聊天 UI。

---

## §7 多租戶隔離 + 合規（D2 三維一起建 → 隔離是一級公民）

### 7.1 隔離（沿用既有慣例，不自創）
- **載體層**：Chatwoot Account→Team→Inbox 三層（自家=Account#0；每客戶=各自 Account）。
- **資料層**：所有新表帶 `organization_id` + RLS `user_has_org_access()`（已驗證 `0010_*.sql` 慣例）；服務端走 service-role client（`lib/supabase-server.ts`）。
- **RAG 層**：`cs_knowledge_chunks` 查詢**強制** `WHERE organization_id = ?` → A 租戶的 AI **不可能**檢索到 B 的知識（namespace 物理隔離 + RLS 雙保險）。
- **密鑰層**：各平台 token 走既有 vault（`lib/secret-vault.ts` putSecret/getSecret + `tenant_integration_bindings`/`client_credentials`），**禁硬編**。

### 7.2 合規（GDPR / 個資）
- **資料出境**：客訊送 Claude 生成 = 出境 → 須 **Anthropic DPA（資料處理協議）+ 零保留（zero-retention）設定**；embeddings 起步走 OpenAI（同須 DPA），資料主權型客戶切自架 bge-m3 讓檢索全留 EU。
- **PII 最小化**：送 LLM 前可遮罩可遮的 PII。
- **保留期/同意**：每租戶可設對話保留期；產品化前需隱私政策 + 客戶 DPA 範本；客戶可逐租戶 opt-out AI。
- **可刪除**：客戶要求刪資料 → 連動刪 Chatwoot 對話 + 向量塊 + 稽核（GDPR 被遺忘權）。

---

## §8 可觀測 + 成本 + Kill-switch

- **成本（重用）**：`lib/ai/log-ai-call.ts` → `ai_call_logs`（migration 0043）已記 token/cost/model；CS 加 `kind=cs` 標籤即得每租戶成本。每租戶**日/月成本上限**，超額自動降級為 L1 或告警。
- **CS 專屬指標（新增儀表板於 /ops/cs）**：
  - deflection rate（自助解決率：未轉真人即解決 %）
  - handoff rate（轉真人率）、hallucination 攔截數、知識缺口數
  - CSAT（客戶滿意，可選結案問卷）、首回延遲、自動回覆延遲
- **Kill-switch（紅線必備）**：三層開關，皆 config-driven 不需 deploy：
  1. 全域：一鍵全停 AI（退回純人工 L0）
  2. 每租戶：關某客戶的 AI
  3. 每意圖：把某意圖降回 L1 或停用
- 對應你 POD A2 的 kill-switch 慣例（測試期預設保守）。

---

## §9 資料模型（新表 DDL 草案，沿用既有慣例，下個 migration = `0051`）

> 慣例（已驗證）：`id uuid pk` + `organization_id` FK + `created_at/updated_at` + `metadata jsonb` + RLS。**對話/訊息不建表**（Chatwoot 擁有，D6）。

```sql
-- 0051_cs_core.sql （草案，實作時再定稿）
create extension if not exists vector;

-- 知識來源（檔案/FAQ/SOP/對話匯出）
create table if not exists cs_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('doc','faq','sop','conversation','url')),
  title text not null,
  status text not null default 'active' check (status in ('active','dirty','archived')),
  is_sensitive boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 知識塊（pgvector）
create table if not exists cs_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source_id uuid not null references cs_knowledge_sources(id) on delete cascade,
  content text not null,
  embedding vector(1536),                 -- OpenAI text-embedding-3-small 維度
  embed_model text not null,              -- 換供應商需重建；記模型名
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
-- 租戶先過濾再相似度
create index on cs_knowledge_chunks using hnsw (embedding vector_cosine_ops);
create index on cs_knowledge_chunks (organization_id);

-- 意圖 + 自動化級別（config-driven，kill-switch 載體）
create table if not exists cs_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  key text not null,                      -- e.g. 'order_status'
  label text not null,
  autonomy_level text not null default 'L1' check (autonomy_level in ('L0','L1','L2')),
  is_sensitive boolean not null default false,   -- money/個資/法律 → 永遠轉真人
  confidence_threshold numeric not null default 0.8,
  canary_pct int not null default 0,      -- 0..100 漸進放量
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

-- 離線 eval 黃金測試集
create table if not exists cs_eval_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  intent_key text not null,
  question text not null,
  expected_points jsonb not null default '[]'::jsonb,
  expect_handoff boolean not null default false,
  created_at timestamptz not null default now()
);

-- AI 回覆稽核（每則自動回都留證據鏈）
create table if not exists cs_ai_replies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  chatwoot_conversation_id text not null,
  chatwoot_message_id text not null,      -- 冪等鍵
  intent_key text,
  confidence numeric,
  retrieval_score numeric,
  autonomy_level text,                    -- 本則實際走的級別
  action text not null check (action in ('auto_sent','draft','handoff','suppressed')),
  retrieved_chunk_ids uuid[] not null default '{}',
  model text,
  reviewed_by_agent boolean not null default false,  -- 坐席是否改寫/接手 → 學習訊號
  created_at timestamptz not null default now(),
  unique (organization_id, chatwoot_message_id)
);
-- RLS：全部 enable + user_has_org_access(organization_id)（user-facing）或 service-role-only（ops 用），依 0010/0048 慣例擇一
```

---

## §10 商業帳號軌 vs 個人帳號軌（D4 澄清）

| | 商業軌（主幹） | 個人軌（隔離選配） |
|---|---|---|
| 平台 | WhatsApp/IG/Messenger/LINE/Telegram/Email/Web | WhatsApp/IG/Messenger（個人號）|
| 接法 | **官方 API**（WhatsApp Cloud API / Meta Graph） | mautrix 逆向私有 API |
| 帳號 | WhatsApp Business / FB Page / IG Professional | 你平常的個人號碼 |
| 合規 | 🟢 合 ToS | 🔴 違 ToS、封號、VPS IP 放大 |
| 用途 | 自用/客戶/產品**全部** | 僅「我本來用個人號做客服、不想換商業號」搶救 |
| 本計畫 | **Phase 1–5 全走這條** | **Phase 6 隔離**，自用+獨立 IP+風險旗標，不進產品 |

**結論**：你疑問成立 —— 商業軌一樣涵蓋 WhatsApp/IG/Messenger，那就是主幹。個人軌不是「另一組平台」，是「同平台用違規方式接個人號」，只在特定搶救情境且高風險，故隔離。

---

## §11 自動化優先 Roadmap（重排：AI 不等 Phase 5，第 1 期就上 co-pilot）

| Phase | 內容 | 帳號軌 | 風險 | 外部前置 | DoD |
|---|---|---|---|---|---|
| **0 決策&選址** | 獨立 Chatwoot VPS、域名、備份、Anthropic/OpenAI DPA | — | Low | DPA 簽署 | VPS 就緒 + DPA 到位 |
| **1 載體+副駕** | Chatwoot 上線(healthcheck/smoke/rollback runbook) + Email/Website widget/Telegram + **AI 協作副駕 L1（草稿模式）同步上**；自家 Account#0 先用 | 商業 | Low | 無 | 真實訊息端到端收發(REALTEST) + AI 草稿出現在坐席台 |
| **2 知識庫+eval+升 L2** | pgvector RAG + 離線 eval harness + 護欄；FAQ 意圖 shadow→canary→自動 L2 | 商業 | **Med** | 知識庫整理 | ≥1 意圖通過 eval 並自動回覆 + 護欄實測轉真人 |
| **3 Meta 三平台** | WhatsApp Cloud API + Messenger + Instagram（官方 API） | 商業 | Med | Meta Business 驗證 + App Review（數天～數週，提早送件）| 三平台真實訊息進站 + AI 處理 |
| **4 LINE** | LINE 官方帳號 + Messaging API | 商業 | Low | LINE 官方帳號申請 | LINE 端到端 |
| **5 產品化** | 客戶自助接通道、知識庫上傳 UI、計費、SSO；多租戶隔離壓測 | 商業 | Med | 商業模式/定價 | 一個外部客戶自助上線 + 跨租戶隔離驗證 |
| **6 個人軌（隔離選配）** | Matrix(Synapse) + mautrix bridges；**自用、獨立 IP、封號風險旗標** | 個人 | **High** | 接受 ToS 風險 | 自用端到端 + 風險文件簽核 |
| **旁路 X** | pay-per-use 單向發文/回覆，掛 next-admin content（不進收件匣） | 商業 | Med | X developer 付費 | 單向發文驗證 |

**每 Phase 強制**：服務 healthcheck 綠 + 一條真實訊息端到端（REALTEST_EVIDENCE）+ rollback runbook + kill-switch 測試 + WORKLOG。新可部署服務（Chatwoot、cs-engine）走 AGENTS.md「新部署路徑強制清單 6 項」（unit test/healthcheck/smoke/rollback/notify/typecheck gate）。

**三維一起建怎麼落地（D2）**：資料模型/隔離/RAG namespace 從 Phase 1 就按多租戶設計（不是先單租戶再改）；但**第一個有真實流量的租戶 = 自家 Account#0**，用自家客服當金絲雀把 eval 集養肥，客戶/產品租戶結構同時就緒、隨時可開。

---

## §12 待拍板決策點（更新版，實作前逐 Phase 確認）

1. **Chatwoot VPS 規格/位置**：Hetzner cpx32(8GB) 新機放哪個區（延遲 vs 與 EU 同區備份）？
2. **知識庫第一批資料**：自家 Account#0 先餵哪些文件（FAQ/SOP/產品頁）？來源清單？
3. **第一個畢業意圖**：Phase 2 先讓哪個意圖升 L2（建議最安全的「營業時間/地址/退換貨政策查詢」類）？
4. **Meta 送審時程**：商業驗證+App Review 是外部依賴，何時送件（建議 Phase 1 並行先送）？
5. **產品化定價模型**：per-agent / per-conversation / per-token 加成？（影響 §8 成本上限設計）
6. **個人軌要不要做**：即使隔離，仍接受 ToS/封號/維運成本嗎？（建議延到最後或放棄）

---

## §13 與既有系統銜接清單（已 grep 驗證，實作前再確認確切行號）

| 重用對象 | 路徑 | 用途 |
|---|---|---|
| Anthropic SDK | `…/next-admin/package.json:14`（`@anthropic-ai/sdk ^0.69.0`）| 意圖分類 + 生成 |
| Vault | `…/next-admin/lib/secret-vault.ts`（putSecret/getSecret/`feature:id` ref）| 各平台 token，禁硬編 |
| 告警派送 | `…/next-admin/lib/ops-inbox/notify/dispatcher.ts` | 漏回客訊告警 |
| Telegram | `…/next-admin/lib/command-plane/telegramAuth.ts` / `telegramSender.ts` | Telegram 通道 |
| 成本記錄 | `…/next-admin/lib/ai/log-ai-call.ts` → `ai_call_logs`(migration 0043) | 每租戶成本 |
| 多租戶模型 | `lobster-factory/packages/db/migrations/0001_core.sql:3`（organizations）| `organization_id` 隔離 |
| RLS 慣例 | `…/0010_clerk_org_mapping_and_rls_expansion.sql`（`user_has_org_access`）| 新表 RLS |
| 整合綁定 | `…/0024_tenant_integration_registry.sql` / `0050_client_credentials.sql` | 通道憑證綁定 |
| Supabase client | `…/next-admin/lib/supabase-server.ts` | service-role 存取 |
| OpenAI 模型慣例 | `…/next-admin/lib/ai/text-model-options.ts:6`（GPT 系列）| 註：`openai` npm 套件**尚非直接依賴**，embeddings 實作需補裝 |
| 下個 migration | `…/migrations/`（最新 0050）→ **0051** | 新表 DDL |

**pgvector 確認不存在**（grep 空）→ §4/§9 為**新建**，非重造。**無既有 messaging/helpdesk 入口**（無 FluentSupport）→ 不衝突。

---

## §14 反模式 / 禁止事項（30 年紀律）

- ❌ 自建 `/chat` 聊天 UI（Chatwoot 已涵蓋；違零重工）
- ❌ 把對話鏡進 Supabase（雙真相源；對話歸 Chatwoot，D6）
- ❌ 動態資料（訂單狀態）做 embedding（會過期；改即時 API 查）
- ❌ 任何意圖未過離線 eval 就開 L2 自動
- ❌ money/身分/法律/醫療自動回覆（永遠轉真人，無例外）
- ❌ 硬編平台 token（走 vault）
- ❌ 跨租戶檢索（RAG 必帶 `organization_id` 過濾）
- ❌ Chatwoot 與 EU 重服務共機（已驗證會 OOM；獨立 VPS）
- ❌ 個人帳號軌進產品線（ToS/封號；僅自用隔離）
- ❌ 無 kill-switch 上線（全域/租戶/意圖三層必備）

---

## 附：本計畫產出方式（R0 紀律）

- 本檔 doc-only，未動既有 code；原 `Customer_service_plan.md` / `_platform_research.md` 保留為附錄可回滾。
- 每個 file:line 聲稱已 grep 親自驗證（§13）；pgvector 不存在已確認。
- 實作各 Phase 另起 R0：任務理解→現況→風險→方案→建議→計畫→驗證四動作（REALTEST/REVIEW/BUGHUNT/WORKLOG）。
