# 全自動客服系統 — 進化版總計畫（Automation Master Plan）

> **SSOT 宣告**：本檔是「全自動客服」的**主計畫（SSOT）**。
> 附錄：`Customer_service_competitive_research.md`（頂規競品研究證據）、**`Customer_service_uiux_design.md`（客戶體驗 UI/UX 設計規範，§18 摘要）**、`Customer_service_platform_research.md`（通道可行性）、`Customer_service_plan.md`（最初決策摘要）。
> **本次範圍：只出計畫，不寫 code。** 每個 Phase 的實作另起 R0 流程。
> **狀態**：草案 **v2.1**（2026-06-25）｜v2.0 = 研究全球頂規系統（Fin/Sierra/Decagon/Ada/Zendesk/Agentforce）全面升級（雙軸自主、agentic 安全、supervisor、Contextual Retrieval、prompt-injection 防禦、開源 eval 棧、多供應商容錯）。**v2.1 = 加客戶體驗層**（清新自然設計語言 + headless 自建 widget，§18）。**已鎖定決策**見 §0。

---

## §0 核心決策（已拍板，鎖定）

| # | 決策 | 拍板結果 |
|---|---|---|
| D1 | 自動化目標 | **雙軸漸進**：答覆自主 L1→L2、行動能力 A1→A2 逐意圖經 eval 升級；**金錢/身分/法律/醫療永不自動**（§1） |
| D2 | 服務對象 | **三維一起建**（自用+代客戶+產品 SaaS）；多租戶為一級公民；上線順序自家先當金絲雀 |
| D3 | Embeddings | **OpenAI `text-embedding-3-small` 起步、介面可插拔**（資料主權客戶切自架 bge-m3） |
| D4 | 個人帳號軌 | **商業軌=主幹**（全平台官方 API）；個人軌=隔離高風險選配，不進產品 |
| D5 | Chatwoot 部署 | **獨立 VPS**（EU cpx32 8GB 已驗證近滿） |
| D6 | 對話儲存 | **Chatwoot 擁有對話/訊息**；我方層只擁有知識庫+eval+稽核+記憶+租戶設定（無雙真相源） |
| D7 | AI 引擎 | **自建 Claude+RAG+agentic**（非 Chatwoot 付費 Captain）；Captain 是付費牆且不能執行外部動作，天花板低 |
| D8 | Chatwoot 整合 | **Pattern A：AgentBot API + webhook**（自主 inbox）+ **Pattern C：account webhook**（真人 inbox 的 copilot）；用 **Community 版**（免費，不需 Captain） |
| D9 | 行動架構 | **agentic 行動分階**：A1 唯讀 → A2 確認後受閘寫入 → **金錢/身分用 deterministic code gate（程式硬閘，非 LLM 判斷）**；分階見 §3.4 |
| D10 | 品質/護欄棧 | **開源自架**：Arize Phoenix（tracing）+ RAGAS + DeepEval（eval）+ NeMo Guardrails + LlamaFirewall/PromptGuard 2（jailbreak）+ Anthropic Contextual Retrieval + hybrid search |
| D11 | 編排 | **先純 tool-calling**（Anthropic 官方：線性流跳過框架）；複雜分支/durable 才加 LangGraph；型別安全+成本上限用 PydanticAI；durable retry 用既有 Trigger.dev |
| D12 | 顧客 widget | **headless 自建 widget**（Client API + WebSocket/pubsub_token），**不用 Chatwoot 預設 iframe widget**（樣式鎖死，達不到頂規 UI）。設計語言=清新自然（§18 + `_uiux_design.md`）|

**一句話架構**：Chatwoot Community（獨立 VPS）當全通道載體 → AgentBot webhook 進 `lib/cs/` 深模組（自建 Claude agentic 引擎）→ 雙軸漸進自主、金錢/身分 code 硬閘永不自動、supervisor 模型把關、Contextual-Retrieval RAG、開源 eval/護欄棧、多供應商容錯、一鍵 kill-switch；**顧客端=清新自然 headless 自建 widget**。

---

## §1 雙軸自主分級（頂規關鍵：答覆 × 行動兩條獨立軸）

研究最大發現：**頂規天花板是「agentic 行動」不是 RAG 問答**——純問答 bot deflection 卡 30–40%；Fin/Sierra/Decagon 都讓 AI 直接執行動作。故自主要分兩軸：

### 軸一：答覆自主（誰送出回覆）
| L0 純人工 | L1 協作副駕（草擬，真人按送） | L2 條件自動（高信心+過 eval 的意圖自動送，其餘轉真人） |

### 軸二：行動能力（AI 能對後端「做」什麼）
| A0 無行動 | A1 唯讀（查訂單/物流/帳戶狀態，可逆，可立即授權） | A2 受閘寫入（改地址/寄重設信/加標籤；**確認 checkpoint + 程式驗證**） | **A3 金錢/身分（退款/退訂/帳號變更/身分驗證）= 永遠人類閘，無論 AI 多強** |

**目標 = 答覆 L2 × 行動 A2，A3 永遠人類閘。** 每個意圖獨立畢業（過離線 eval 才升級）；money/身分/法律/醫療**永遠停在 L1/A3**。**可退級**：任何意圖出問題，config 一鍵降回（kill-switch），不需 deploy。**永不到 L3 監督自動 / A3 自動**（紅線，與你 POD A2 fulfillment money 紅線同紀律）。

---

## §2 系統架構總覽

```
┌──────────────────────────────────────────────────────────────┐
│  next-admin / ops console (Next.js 15 + Supabase, EU VPS)      │
│  · /ops/cs：知識庫管理 · eval/模擬儀表板 · 意圖開關 · 行動 allowlist │
│  · 成本/resolution 儀表板 · deep-link/SSO 進 Chatwoot 坐席台      │
└───────────────┬──────────────────────────────┬───────────────┘
                │ (管理面)                       │ (AI 核心 lib/cs/ 深模組)
                │                                ▼
                │   ┌──────────────────────────────────────────────────────┐
                │   │  cs-engine (lib/cs/)                                    │
                │   │  進站護欄→分類→RAG→生成→supervisor→送/動作/轉           │
                │   │  · 模型路由(haiku 分類 / sonnet 生成 / judge 評審)        │
                │   │  · 多供應商容錯(Claude→Gemini，重用既有 gemini.ts)        │
                │   │  · tool-calling loop(行動) · deterministic code gate     │
                │   │  重用 @anthropic-ai/sdk·supabase·secret-vault·           │
                │   │       ai_call_logs·ops-inbox/notify/dispatcher           │
                │   └──┬──────────────┬───────────────┬─────────────────────┘
                │ AgentBot│           │ pgvector       │ Phoenix/Langfuse
                │ webhook │           │ 檢索            │ tracing+eval
                ▼         │           ▼                ▼
┌────────────────────────┴──┐  ┌──────────────────┐  ┌──────────────────────┐
│ Chatwoot Community(獨立VPS)│  │ Supabase pgvector│  │ 業務系統(唯讀/受閘寫) │
│ Account→Team→Inbox 多租戶  │  │ contextual chunks│  │ WooCommerce/訂單/CRM  │
│ 對話真相源 · pending→open  │  │ + BM25 + metadata│  │ (tool-calling 目標)   │
└───────┬───────────────────┘  └──────────────────┘  └──────────────────────┘
        │ 商業帳號軌(官方 API,主幹)                個人帳號軌(Phase 隔離,自用限定)
        ▼                                          ▼
  WhatsApp Cloud API/Messenger/IG/LINE/            Matrix(Synapse)+mautrix
  Telegram/Email/Website widget (+Voice 後期)       (高風險,不進產品)
```

**模組邊界（為「30 年 + 可擴可刪」）**：`lib/cs/` 是 deep module，對外只露 `handleInbound(ctx)` / `ingestKnowledge(src)` / `registerTool(spec)` 三窄介面，內部 RAG/護欄/eval/行動全封裝。要抽成獨立 `cs-engine` 微服務只搬此資料夾。通道層/AI 層/知識層/行動層四者解耦。

---

## §3 AI 核心控制流（全自動的心臟，含 agentic 行動）

```
1. 進站  AgentBot webhook → cs-engine（驗 X-Chatwoot-Signature HMAC + idempotency=message_id）
2. 安全  · PromptGuard 2 掃客訊 + 掃「待注入的檢索內容」(prompt injection 防禦,OWASP #1)
         · 三段隔離: <system>品牌+護欄 / <user>客訊 / <retrieved>知識  ←絕不把客訊插進 system
3. 前置  · 租戶解析 organization_id · 營業時間 · 已轉真人?(是→AI 噤聲) · loop 偵測 · rate limit
4. 分類  意圖分類(haiku 快模型)→intent+信心。命中敏感表(退款/個資/法律/醫療/投訴)→直接(8)轉真人
5. 檢索  hybrid: vector+BM25→RRF 融合→rerank→top-4。WHERE organization_id 強制過濾(租戶隔離)
         檢索 top score 過低(知識庫沒答案)→(8)轉真人,不硬答
6. 生成  Claude sonnet + 注入 top-4 檢索塊 + 客戶記憶 + CIS 品牌語氣(BrandVoiceProfile,同內容引擎) → 草擬回覆
         · 需行動時(查訂單等)→tool-calling loop(見 §3.4),只能呼叫 allowlist 內 tool
7. 護欄  supervisor 把關(獨立評估,defense-in-depth):
         · grounding: 回覆主張須對應檢索塊,否則 hallucination→轉真人
         · 信心門檻: intent 信心 × 檢索分 < 該意圖閾值→轉真人
         · 輸出掃描: PII 外洩/禁語/離題/長度
         · 動作閘: 寫入動作須過 §3.4 checkpoint;金錢/身分→deterministic code 或人類閘
8. 送出  · 答覆 L2: Chatwoot API 送出,標「AI 已回」+ 記 cs_ai_replies(含推理鏈/引用塊/動作)
         · L1 或轉真人: 建私有草稿 + PATCH status=open 指派坐席 + (可選)ops-inbox 告警
9. 學習  每則 AI 回覆 + 坐席改寫/接手 → 回流 eval 集 + 知識缺口偵測(§5.5)
10.稽核  Phoenix/Langfuse trace 全程(檢索塊/分數/模型/token/延遲/動作) → 可解釋+成本
```

### 3.4 Agentic 行動分階（D9，研究綜合的安全執行）
- **A1 唯讀（低風險，可立即授權）**：`get_order_status` / `get_tracking` / `get_account_tier`。固定 **tool allowlist**，Claude 不能呼叫清單外。每次呼叫記 `cs_action_log`。
- **A2 受閘寫入（中風險）**：`update_shipping_address` / `send_password_reset` / `add_label`。**確認 checkpoint**：Claude 草擬動作 → 客戶確認 →（才）發 structured tool call → **deterministic code 驗證 input 並執行**（非 Claude 直接組 payload 發送）。
- **A3 金錢/身分（高風險，永不全自動）**：退款/退訂/帳號變更/身分驗證。**永遠人類確認閘或硬性程式規則**。閾值寫 **code 常數**（`MAX_REFUND_CENTS=N`，LLM 改不動）；低於閾值可程式自動 + 通知人類 + 24h 可逆窗；高於閾值 Claude 蒐集資訊+草擬摘要+帶全脈絡轉真人。
- **紅線永不自動**：超閾值金錢、帳號刪除/永久刪資料、身分驗證裁決、24h 內不可逆、輸入源自未消毒外部內容（email body/訂單備註）的動作。

**冪等與可靠**：webhook 用 message_id 去重；失敗走 Trigger.dev durable retry，避免重複回覆/重複動作。

**平台 24h 時窗（WhatsApp/Meta）**：客戶來訊 24h 內可自由回覆；逾時僅能送核准範本，AI 不可自由發訊 → 逾時走「範本+轉真人」。Email/Telegram/Web 無此限（Phase 1 先打這三條最快見效）。

---

## §4 RAG 管線（頂規檢索，pgvector 目前不存在 → 新建）

**RAG = Retrieval-Augmented Generation（檢索增強生成）**：AI 只根據你餵的真實文件回答，大幅降編造。

### 4.1 來源盤點
| 來源 | 取得 | 切塊 |
|---|---|---|
| 產品/服務文件、FAQ | 上傳 / WP REST / LlamaIndex 連接器 | recursive 400–512 token + 50–100 overlap |
| 客服 SOP / 退換貨政策 | 上傳 | 段落切，標 `is_sensitive` |
| 過往對話（已結案）| Chatwoot API 匯出 | Q-A 對切，人工標可作範例才入庫 |
| 訂單/會員等動態資料 | **不入向量庫**，A1 tool 即時查 | — |

### 4.2 頂規檢索管線（D10）
```
文件→切塊→[Contextual Retrieval: 每塊預置 Claude 生成 50-100 token 脈絡]→
  embeddings(可插拔 OpenAI small | bge-m3) 存 pgvector + 同步建 BM25 索引
查詢→vector top-150 + BM25 top-150 → RRF 融合(0.8/0.2) → cross-encoder rerank top-20 → top-4 注入
```
- **Anthropic Contextual Retrieval**（2024 最大檢索進展）：Anthropic 自測 baseline 87% → contextual 92% → +hybrid 93% → +rerank **95%**（檢索失敗率降 67%）；prompt caching 省 69% 成本。
- **Hybrid（vector+BM25+RRF+rerank）**：純向量漏精確匹配（料號/錯誤碼），純 BM25 漏語意 → 兩者融合。
- **Metadata**：每塊標 `organization_id/source_version/last_modified/doc_type/product/region`。**租戶隔離在檢索層用 metadata filter 強制，絕不靠 LLM 自律。**
- **可插拔 embeddings**（D3）：`EmbeddingProvider.embed()` 抽象；換供應商須整租戶重建（維度不同），故記 `embed_model`。`openai` npm 套件尚非直接依賴，實作補裝。

### 4.3 新鮮度與衝突（60% 生產 RAG 死於新鮮度）
- **Stale chunk 問題**：文件更新後舊塊仍可檢索 → 新舊混用生「貌似合理但矛盾」答案。
- **安全增量更新**：每塊 `doc_family_id+source_version`；更新時**原子替換**（同時升新+降舊）；**驗證 delete 傳播**（舊塊從 vector+BM25+cache 全消失，不只確認新塊出現）；每次內容發布跑 freshness gate 查詢。
- **衝突**：檢索分加新鮮度 boost（`0.7*相似度+0.3*新鮮度`）；system prompt 指示衝突時取最新 `last_modified` 並標記。
- **KB 編輯標準**：祈使句、寫明 outcome、去行銷語、每文章 ≤400 token。行銷腔 KB 殺死 RAG 品質。

---

## §5 Eval & 安全護欄 Harness（頂規命門，開源自架）

### 5.1 起手意圖分類（哪些可自動畢業、哪些永遠轉真人）
| 自動安全候選（L2/A1-A2 目標，須過 eval） | 永遠轉真人（is_sensitive，A3） |
|---|---|
| 營業時間/地址/聯絡方式 | 退款/扣款/開通**執行**（money 紅線）|
| 運費/到貨時間（A1 查物流）| 訂單金額爭議、帳單糾紛 |
| 退換貨**政策說明**（非執行）| 帳號/密碼/個資**變更**（身分紅線）|
| 產品規格/靜態查詢 | 客訴升級/情緒激動/威脅 |
| 訂單狀態查詢（A1 即時 API）| 法律/合約/保固爭議、醫療建議 |
| 標準故障排除（依 SOP）| 知識庫沒有的客製報價/議價 |

判準：**答錯只讓客戶多等→可自動；答錯動到錢/身分/法律/情緒→永遠轉真人。**

### 5.2 離線評估（offline eval — 升級的畢業考）
- **Golden set**（存 `cs_eval_cases`）：MVP 50–100；生產 200–500；成熟 1000+。**必含 out-of-scope/歧義/對抗輸入**（只放簡單題高估品質 25–30%）。
- **升級條件**（意圖從 L1→L2 / A1→A2）：① golden set ≥30 ② RAGAS/DeepEval 跑分 ③ **Faithfulness ≥0.85、Context Recall ≥0.80、正確率 ≥95%、危險誤答=0、該轉真人卻自動答 recall=0** ④ 過 simulation。未過留 L1。
- **CI/CD 硬閘**：每次改 KB/prompt/意圖，DeepEval pytest 重跑 golden set，未達門檻 block（修一個壞十個）。
- **LLM-as-judge**：用 `evaluation_steps`（明確推理步驟）比 `criteria` 穩；**必與人標交叉校準**，不可當唯一閘。

### 5.3 模擬測試（simulation — 上線前抓 regression）
改任何意圖/procedure/tool 前，自動跑 20–50 條合成對話（含 mock 動作）對定義成功準則，全綠才 GA（Fin Simulations / Decagon offline→online 模式）。

### 5.4 線上護欄（online guardrails — 每則即時把關）
| 護欄 | 機制（開源工具）| 失敗動作 |
|---|---|---|
| Prompt injection/jailbreak | **PromptGuard 2**（22M，掃客訊+檢索內容）+ 三段隔離 | 攔截+標記 |
| 敏感意圖 | money/個資/法律/醫療命中表 | **強制轉真人** |
| Grounding | supervisor 比對回覆主張 vs 檢索塊（NeMo / GroundedAI）| hallucination→轉真人 |
| 信心門檻 | intent 信心 × 檢索分 | <閾值→轉真人 |
| 知識缺口 | 檢索 top score 過低 | 轉真人（不硬答）|
| PII 外洩 | Guardrails AI + Presidio 進站+出站雙遮罩 | 攔截+告警（多租戶尤須）|
| Topic restriction | NeMo dialog rails / Role Adherence | 拒答離題 |
| 動作閘 | §3.4 checkpoint + code gate | 受閘/轉真人 |
| Rate limit / 成本上限 | 每客戶/每租戶；讀 `ai_call_logs` | 節流/降級/告警 |

### 5.5 知識缺口偵測（3 訊號 → 自我改進）
① 未答/升級查詢 ② 低檢索相關分（top cosine <0.5）③ **真人坐席改寫紀錄（query+bot答+人答=金標）**。每週語意聚類，5+ 同類無 KB 文章=缺口 → LLM 草擬 stub → **人審發布**（全自動寫 KB=高風險）。

### 5.6 漸進放量 + 持續改進
```
新意圖: L1 草稿 → 離線 eval 過 → simulation 過 → shadow(生成但不送,比對真人答)
      → canary(5%→25%→100% 流量自動送) → 全自動 L2。指標退步自動回退。
```
坐席每次改寫/接手=訓練訊號 → 回灌 golden set + 知識庫缺口。每季對抗 red-team（把 bot 當不可信使用者測 injection/jailbreak）。

---

## §6 人類交接 / 升級（human-in-the-loop）

- **交接觸發**：§5 任一護欄 fail、客戶要真人、坐席手動接管、A3 動作。
- **機制（Chatwoot 原生）**：bot 用 conversation update API 把 `pending`→`open` 指派坐席。
- **AI 噤聲**：對話轉真人/坐席介入後 AI 停止自動回（控制流第 3 關），避免人機打架。
- **帶完整脈絡交接**（頂規要點，非只轉逐字稿）：坐席接手時拿到 對話歷史 + AI 診斷 + 建議下一步 + 情緒分 + 相關 KB + 待辦動作 + 客戶記憶 → 客戶不重述。
- **漏回告警（重用既有）**：超 SLA 未回 → `lib/ops-inbox/notify/dispatcher.ts`（Slack+Telegram 規則引擎）。不重造告警。
- **坐席台**：Chatwoot 原生介面（「AI 已回」標記、一鍵接管、私有草稿）；next-admin 只放管理面，不重做聊天 UI。

---

## §7 多租戶隔離 + 合規 + 客戶記憶

### 7.1 隔離（沿用既有慣例 + 檢索層強制）
- **載體層**：Chatwoot Account→Team→Inbox（自家=Account#0；每客戶各自 Account）。
- **資料層**：新表帶 `organization_id` + RLS `user_has_org_access()`（既有 `0010_*.sql` 慣例）；service-role client（`lib/supabase-server.ts`）。
- **RAG 層**：檢索**強制 `WHERE organization_id` metadata filter** → A 租戶 AI 不可能檢索到 B 的知識（物理隔離 + RLS 雙保險，絕不靠 LLM 自律）。
- **密鑰層**：平台 token 走既有 vault（`lib/secret-vault.ts` + `tenant_integration_bindings`/`client_credentials`），禁硬編。

### 7.2 客戶記憶（Memories，頂規但須謹慎）
- per-customer 持久記憶（偏好/歷史問題/語言），跨對話注入（對應 Sierra ADP / Chatwoot Memories / Letta）。
- **GDPR 約束**：記憶內容受保留期/同意管轄；客戶要求刪除 → 連動刪記憶。**不存敏感 PII**（信用卡/身分證）。

### 7.3 合規（GDPR / 個資）
- **資料出境**：客訊送 Claude 生成=出境 → **Anthropic DPA + 零保留設定**；embeddings 起步 OpenAI（同須 DPA），資料主權客戶切自架 bge-m3 讓檢索全留 EU。
- **PII 最小化**：送 LLM 前遮罩可遮 PII（Presidio）。
- **保留/同意/可刪**：每租戶可設對話保留期 + opt-out AI；刪除請求連動刪 Chatwoot 對話 + 向量塊 + 記憶 + 稽核（被遺忘權）。
- **權限繼承**（仿 Einstein Trust Layer）：A1/A2 tool 只能取該租戶該客戶可見資料。

---

## §8 可觀測 + 成本 + 容錯 + Kill-switch

- **可觀測（D10，頂規可解釋性）**：**Arize Phoenix / Langfuse 自架**，trace 每則的 檢索塊/分數/模型/token/延遲/動作/推理鏈 → 對應 Decagon Watchtower / Kustomer Observability。`cs_ai_replies` 留稽核證據鏈。
- **成本（重用）**：`lib/ai/log-ai-call.ts`→`ai_call_logs`（migration 0043）已記 token/cost/model；CS 加 `kind=cs`。每則約略 **$0.005–0.012**（embed ~$0.00002 + haiku 分類 ~$0.001 + sonnet 生成 ~$0.003–0.01）；一則人工成本遠高 → deflection 即回本。每租戶日/月上限，超額降級/告警。
- **頂規指標儀表板（/ops/cs）**：resolution rate（自定義「resolved」）、deflection rate（自助解決率）、handoff rate、hallucination 攔截數、知識缺口數、CSAT、首回/自動回延遲、每租戶成本。
- **多供應商容錯（頂規必備）**：Claude 逾時/錯誤 → fallback Gemini（**重用既有 `lib/ops-inbox/ai/gemini.ts`**）→ 本機模型 → 退 L0。單供應商當機不致全停。
- **降級鐵則（30 年命門）**：

| 失效 | 偵測 | 降級 |
|---|---|---|
| Claude API 逾時/錯誤 | timeout+try/catch | fallback 供應商；皆失敗退 L0（客訊照進 Chatwoot，AI 不回，告警坐席）|
| pgvector 慢/失敗 | 查詢 timeout | 跳過 RAG → 無檢索一律轉真人，絕不硬答 |
| Chatwoot down | healthcheck/uptime | 監控告警；平台端 webhook 重送 |
| embeddings 失敗 | ingest 捕捉 | 來源標 dirty 重試；不影響既有索引查詢 |
| tool/業務系統失敗 | 呼叫錯誤 | 不猜結果，告知客戶查詢中+轉真人 |
| 成本爆量 | `ai_call_logs` 累計 | 達上限降 L1/噤聲+告警 |

**任何元件失效 → 退安全態（人工），永不「猜著回客戶」。**

- **Kill-switch（三層，config-driven 不需 deploy）**：① 全域全停 AI（退 L0）② 每租戶關 AI ③ 每意圖降 L1/停用。對應 POD A2 kill-switch 慣例。

---

## §9 資料模型（新表草案，沿用既有慣例，下個 migration = `0051`）

> 慣例（已驗證）：`id uuid pk` + `organization_id` FK + `created_at/updated_at` + `metadata jsonb` + RLS。**對話/訊息不建表**（Chatwoot 擁有，D6）。

```sql
-- 0051_cs_core.sql （草案，實作時定稿）
create extension if not exists vector;

create table if not exists cs_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('doc','faq','sop','conversation','url')),
  title text not null,
  doc_family_id uuid not null default gen_random_uuid(),  -- 原子替換用
  source_version int not null default 1,
  status text not null default 'active' check (status in ('active','dirty','archived')),
  is_sensitive boolean not null default false,
  last_modified timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cs_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source_id uuid not null references cs_knowledge_sources(id) on delete cascade,
  doc_family_id uuid not null,
  source_version int not null,
  content text not null,
  contextual_prefix text,                 -- Anthropic Contextual Retrieval 生成的脈絡
  embedding vector(1536),                 -- OpenAI text-embedding-3-small
  embed_model text not null,
  bm25_tsv tsvector,                       -- hybrid search 的 BM25/keyword 索引
  metadata jsonb not null default '{}'::jsonb,  -- doc_type/product/region
  last_modified timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on cs_knowledge_chunks using hnsw (embedding vector_cosine_ops);
create index on cs_knowledge_chunks using gin (bm25_tsv);
create index on cs_knowledge_chunks (organization_id, doc_family_id, source_version);

create table if not exists cs_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  label text not null,
  answer_level text not null default 'L1' check (answer_level in ('L0','L1','L2')),
  action_level text not null default 'A0' check (action_level in ('A0','A1','A2')),  -- A3 永遠人類閘,不入此欄
  is_sensitive boolean not null default false,
  confidence_threshold numeric not null default 0.8,
  canary_pct int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table if not exists cs_tools (                -- 行動 allowlist（每租戶）
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,                                -- get_order_status / update_address ...
  risk text not null check (risk in ('A1_read','A2_gated_write','A3_human_only')),
  schema jsonb not null,                             -- tool 參數 schema
  is_enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists cs_eval_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  intent_key text not null,
  question text not null,
  expected_points jsonb not null default '[]'::jsonb,
  expect_handoff boolean not null default false,
  is_adversarial boolean not null default false,     -- 對抗/越獄測例
  created_at timestamptz not null default now()
);

create table if not exists cs_customer_memory (      -- Memories（GDPR 受管）
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_ref text not null,                          -- Chatwoot contact id
  fact text not null,
  expires_at timestamptz,                             -- 保留期
  created_at timestamptz not null default now(),
  unique (organization_id, contact_ref, fact)
);

create table if not exists cs_ai_replies (           -- 每則自動回的證據鏈
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  chatwoot_conversation_id text not null,
  chatwoot_message_id text not null,                 -- 冪等鍵
  intent_key text,
  confidence numeric,
  retrieval_score numeric,
  answer_level text,
  action text not null check (action in ('auto_sent','draft','handoff','suppressed','action_taken')),
  retrieved_chunk_ids uuid[] not null default '{}',
  reasoning_trace_ref text,                           -- Phoenix/Langfuse trace id
  model text,
  reviewed_by_agent boolean not null default false,  -- 坐席改寫/接手=學習訊號
  created_at timestamptz not null default now(),
  unique (organization_id, chatwoot_message_id)
);

create table if not exists cs_action_log (           -- 每個 tool 呼叫稽核
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  chatwoot_conversation_id text not null,
  tool_name text not null,
  risk text not null,
  params jsonb not null default '{}'::jsonb,
  result_status text not null check (result_status in ('ok','denied','error','pending_confirm','pending_human')),
  confirmed_by text,                                  -- 客戶確認 / 坐席核准
  created_at timestamptz not null default now()
);
-- RLS：全部 enable + user_has_org_access(organization_id)（user-facing）或 service-role-only（ops），依 0010/0048 慣例擇一
```

---

## §10 商業帳號軌 vs 個人帳號軌（D4 澄清）

| | 商業軌（主幹） | 個人軌（隔離選配） |
|---|---|---|
| 平台 | WhatsApp/IG/Messenger/LINE/Telegram/Email/Web | WhatsApp/IG/Messenger（個人號）|
| 接法 | **官方 API**（WhatsApp Cloud API / Meta Graph）| mautrix 逆向私有 API |
| 帳號 | WhatsApp Business / FB Page / IG Professional | 你平常的個人號碼 |
| 合規 | 🟢 合 ToS | 🔴 違 ToS、封號、VPS IP 放大 |
| 用途 | 自用/客戶/產品全部 | 僅「本來用個人號做客服、不想換商業號」搶救 |
| 本計畫 | **Phase 1–6 全走** | **隔離 Phase**，自用+獨立 IP+風險旗標，不進產品 |

商業軌一樣涵蓋 WhatsApp/IG/Messenger（官方 API）= 主幹；個人軌不是另一組平台，是同平台用違規方式接個人號，故隔離。

---

## §11 Roadmap（自動化優先 + agentic 能力階梯）

| Phase | 內容 | 軸（答覆×行動）| 風險 | 外部前置 | DoD |
|---|---|---|---|---|---|
| **0 決策&選址** | 獨立 Chatwoot VPS、域名、備份、Anthropic/OpenAI DPA、Phoenix/Langfuse | — | Low | DPA | VPS+DPA+tracing 就緒 |
| **1 載體+副駕** | Chatwoot Community(healthcheck/smoke/rollback) + Email/Web widget/Telegram + **AgentBot 接 Claude L1 草稿**；自家 Account#0 先用 | L1×A0 | Low | 無 | 真實訊息端到端 + AI 草稿進坐席台 |
| **2 RAG+eval+升 L2** | Contextual-Retrieval+hybrid RAG + RAGAS/DeepEval/Phoenix eval + NeMo/PromptGuard 護欄 + simulation；FAQ 意圖 shadow→canary→**自動 L2** | L2×A0 | **Med** | 知識庫整理 | ≥1 意圖過 eval 自動回 + 護欄實測轉真人 + injection 測試擋下 |
| **3 唯讀行動 A1** | tool-calling loop + allowlist；查訂單/物流/帳戶（唯讀，可逆）| L2×A1 | Med | 業務系統 API | 真實訂單查詢端到端 + action_log 稽核 |
| **4 受閘寫入 A2** | 確認 checkpoint + deterministic code gate；改地址/重設信/加標籤 | L2×A2 | **Med-High** | — | 寫入動作經確認+程式驗證 + 金錢/身分實測擋下強制轉真人 |
| **5 Meta 三平台** | WhatsApp Cloud API + Messenger + Instagram（官方 API）| L2×A2 | Med | Meta 驗證+App Review | 三平台真實訊息 + AI 處理 |
| **6 LINE** | LINE 官方帳號 + Messaging API | L2×A2 | Low | LINE 官方帳號 | LINE 端到端 |
| **7 產品化** | 客戶自助接通道、知識庫上傳 UI、**outcome-based 計價**、SSO、多租戶隔離壓測 | — | Med | 定價/商業模式 | 外部客戶自助上線 + 跨租戶隔離驗證 |
| **8 進階（選配）** | Voice AI、主動外展/防流失、多語句級切換、知識缺口自動草擬 | — | Med-High | — | 逐項 DoD |
| **9 個人軌（隔離選配）** | Matrix+mautrix；自用、獨立 IP、封號旗標 | — | **High** | 接受 ToS 風險 | 自用端到端+風險簽核 |
| **旁路 X** | pay-per-use 單向發文，掛 next-admin content（不進收件匣）| — | Med | X developer 付費 | 單向發文驗證 |

**每 Phase 強制**：healthcheck 綠 + 真實訊息端到端（REALTEST_EVIDENCE）+ rollback runbook + kill-switch 測試 + WORKLOG。新可部署服務（Chatwoot、cs-engine）走 AGENTS.md「新部署 6 項」（unit test/healthcheck/smoke/rollback/notify/typecheck gate）。
**三維一起建（D2）**：資料模型/隔離/RAG namespace 從 Phase 1 按多租戶設計；第一個真實流量租戶=自家 Account#0 當金絲雀養肥 eval 集，客戶/產品租戶結構同時就緒隨時可開。
**顧客 widget（D12，與上表並行）**：headless 自建 widget 分 4 階（MVP→互動類型渲染→inline 知識+a11y→語音/多語/主動，詳 `_uiux_design.md` §10）。Widget P1 對齊主 Phase 1（先 Email/Telegram 內部測，Website widget 同期上自建版）。

---

## §12 待拍板決策點（實作前逐 Phase 確認）

1. **Chatwoot VPS 規格/位置**：cpx32(8GB) 放哪區（延遲 vs EU 同區備份）？
2. **知識庫第一批資料**：自家 Account#0 先餵哪些文件？來源清單？
3. **第一個畢業意圖**：Phase 2 先升哪個（建議最安全的「營業時間/政策查詢」）？
4. **第一批 A1 唯讀 tool**：接哪個業務系統先（WooCommerce 訂單查詢？）？
5. **Meta 送審時程**：商業驗證+App Review 何時送（建議 Phase 1 並行先送）？
6. **產品化計價**：outcome-based per-resolution 加成？單價？
7. **個人軌做不做**：即使隔離仍接受 ToS/封號/維運？（建議延後或放棄）

---

## §13 與既有系統銜接清單（已 grep 親自驗證）

| 重用對象 | 路徑 | 用途 |
|---|---|---|
| Anthropic SDK | `…/next-admin/package.json:14`（`@anthropic-ai/sdk ^0.69.0`）| 分類+生成+tool-calling |
| Gemini fallback | `…/next-admin/lib/ops-inbox/ai/gemini.ts` | 多供應商容錯 |
| Vault | `…/next-admin/lib/secret-vault.ts`（putSecret/getSecret）| 平台 token，禁硬編 |
| 告警派送 | `…/next-admin/lib/ops-inbox/notify/dispatcher.ts` | 漏回客訊告警 |
| Telegram | `…/next-admin/lib/command-plane/telegramAuth.ts`/`telegramSender.ts` | Telegram 通道 |
| 成本記錄 | `…/next-admin/lib/ai/log-ai-call.ts`→`ai_call_logs`(migration 0043) | 每租戶成本 |
| 多租戶模型 | `lobster-factory/packages/db/migrations/0001_core.sql:3`（organizations）| `organization_id` 隔離 |
| RLS 慣例 | `…/0010_clerk_org_mapping_and_rls_expansion.sql`（`user_has_org_access`）| 新表 RLS |
| 整合綁定 | `…/0024_tenant_integration_registry.sql`/`0050_client_credentials.sql` | 通道憑證 |
| Supabase client | `…/next-admin/lib/supabase-server.ts` | service-role 存取 |
| OpenAI 模型慣例 | `…/next-admin/lib/ai/text-model-options.ts:6`（GPT 系列）| 註：`openai` npm 套件尚非直接依賴，embeddings 需補裝 |
| **CIS 品牌色（VI）** | `…/next-admin/app/api/ops/clients/[slug]/brand-colors/route.ts:33`（`metadata.client_config.brandColors{primary,secondary,accent}`）| widget 標準色錨點，**重用不重造** |
| **CIS 品牌語氣（BI/MI）** | `…/next-admin/app/api/content/brand-voice/route.ts:9`（`BrandVoiceProfile` + `promptInjection`）| 客服 AI persona，與內容引擎同源 |
| 下個 migration | `…/migrations/`（最新 0050）→ **0051** | 新表 DDL |

**pgvector 確認不存在**（grep 空）→ §4/§9 新建。**無既有 messaging/helpdesk 入口**（無 FluentSupport）→ 不衝突。

---

## §14 反模式 / 禁止事項（30 年紀律）

- ❌ 自建 `/chat` 聊天 UI（Chatwoot 已涵蓋；違零重工）
- ❌ 把對話鏡進 Supabase（雙真相源；對話歸 Chatwoot，D6）
- ❌ 動態資料（訂單狀態）做 embedding（會過期；改 A1 tool 即時查）
- ❌ 任何意圖未過離線 eval + simulation 就開 L2/A2
- ❌ **金錢/身分動作靠 LLM 判斷執行**（必 deterministic code gate + 人類閘；A3 永不自動）
- ❌ **把客戶輸入插進 system prompt**（prompt injection；三段隔離）
- ❌ 不掃 prompt injection 就把檢索內容/客訊餵 LLM
- ❌ 跨租戶檢索（RAG 必帶 `organization_id` metadata filter）
- ❌ 硬編平台 token（走 vault）
- ❌ stale chunk（更新 KB 只加新塊不驗舊塊刪除傳播）
- ❌ Chatwoot 與 EU 重服務共機（已驗證會 OOM；獨立 VPS）
- ❌ 個人帳號軌進產品線（ToS/封號；僅自用隔離）
- ❌ 無 kill-switch / 無 supervisor / 無 eval 就上自動
- ❌ 元件失效時硬答客戶（必退人工）

---

## §15 頂規 Top-15 能力 → 我們的覆蓋路線

| # | 頂規能力 | 我們對應 | Phase |
|---|---|---|---|
| 1 | 真後端行動執行 | tool-calling + allowlist + code gate | 3–4 |
| 2 | agentic 多步推理 | Claude tool loop（複雜才 LangGraph）| 3–4 |
| 3 | 跨通道共享脈絡 | Chatwoot 統一對話 + cs_customer_memory | 1,5,6 |
| 4 | outcome 計價對齊 | 定義 resolved + resolution 儀表板 | 2,7 |
| 5 | 自我改進知識庫 | 知識缺口偵測 §5.5 | 2+ |
| 6 | 推理透明/可解釋 | Phoenix/Langfuse + cs_ai_replies | 2 |
| 7 | 上線前模擬 | simulation §5.3 | 2 |
| 8 | 帶脈絡人類交接 | §6 完整脈絡交接 | 1 |
| 9 | Voice AI | Chatwoot voice（後期）| 8 |
| 10 | 多語 | Claude 原生多語 + 句級偵測 | 8 |
| 11 | 主動外展/防流失 | 行為訊號觸發 | 8 |
| 12 | 領域訓練 | 強系統提示+Contextual Retrieval+rerank（非自訓模型）| 2 |
| 13 | 100% 自動 QA | 全對話 LLM-judge 評分 | 2+ |
| 14 | 多供應商容錯 | Claude→Gemini→本機 failover | 2 |
| 15 | 無碼流程建構器 | /ops/cs 意圖/tool/allowlist UI（config-driven）| 2,7 |

**坦白差距**：不自訓領域模型（#12 用提示工程+檢索補）；Voice/主動外展列後期。其餘 13 項涵蓋。對話品質與隱私/成本**勝商業**（Claude 自架、BYOK 資料不出境、無 per-resolution 抽成）。

---

## §16 技術棧決策（開源自架，D10/D11）

| 層 | 選用 | 理由 / 略過 |
|---|---|---|
| 載體 | **Chatwoot Community**（獨立 VPS）| 開源唯一正解；不需付費 Captain |
| 整合 | **AgentBot API + webhook**（Pattern A）+ account webhook（Pattern C copilot）| 全控、可接任意 tool |
| 生成 | **Claude**（sonnet 生成 / haiku 分類 / judge 評審）| 已有 SDK；客服任務勝 GPT-4o |
| 容錯 | **Gemini fallback**（重用 gemini.ts）→ 本機 | 多供應商不單點 |
| 編排 | **純 tool-calling 起步**；複雜才 LangGraph；型別/成本上限 PydanticAI；durable retry 用 Trigger.dev | Anthropic 官方：線性流跳過框架；CrewAI 無上限迴圈風險 |
| 向量 | **pgvector**（既有 Supabase）| 免新增基礎設施 |
| 檢索 | **Contextual Retrieval + hybrid(vector+BM25+RRF) + cross-encoder rerank** | 檢索失敗率降 67% |
| RAG 匯入 | **LlamaIndex**（多源）| 多源知識才用 |
| eval | **RAGAS + DeepEval（CI 閘）+ Arize Phoenix（tracing）** | 全開源自架 |
| 護欄 | **NeMo Guardrails + LlamaFirewall/PromptGuard 2 + Guardrails AI(Presidio PII)** | jailbreak/hallucination/PII |
| 記憶 | **Letta**（量大時）| per-customer 跨 session |
| embeddings | **OpenAI text-embedding-3-small（可插拔）→ bge-m3 自架** | D3 |
| 顧客 widget | **headless 自建**（Chatwoot Client API + WebSocket）+ Next embed script | 預設 iframe widget 樣式鎖死 |
| 設計系統 | 清新自然 token（CSS vars）+ General Sans/Fraunces/Noto Sans TC + Framer Motion spring | `_uiux_design.md` |

---

## §17 上線前 Must-Have Checklist（每意圖開自動前逐項打勾）

**安全**：□ 三段隔離（system/user/retrieved）□ PromptGuard 2 掃客訊+檢索 □ supervisor grounding 檢查 □ PII 進出雙遮罩 □ topic restriction □ 低信心「不知道」不編造
**Eval**：□ golden set 200–500（含 out-of-scope/對抗）□ DeepEval CI 閘 Faithfulness≥0.85/Recall≥0.80 □ Phoenix trace 全程 □ shadow 過 □ simulation 20–50 例過 □ 危險誤答=0/該轉真人 recall=0
**RAG**：□ hybrid(vector+BM25+RRF) □ Contextual Retrieval □ rerank □ metadata 含 tenant/version □ 租戶 filter 強制 □ stale chunk delete 傳播驗證
**行動**：□ tool allowlist □ A2 確認 checkpoint □ 金錢/身分 code gate（閾值常數）□ action_log 稽核 □ 紅線動作擋下實測
**運維**：□ 多供應商 failover □ 三層 kill-switch □ 降級退人工 □ 每租戶成本上限 □ rollback runbook □ WORKLOG 四動作

---

## §18 客戶體驗層（清新自然 UI/UX，摘要 — 完整見 `Customer_service_uiux_design.md`）

**核心判定**：Chatwoot 預設 widget 是 **iframe 鎖死**（外部 CSS 進不去）→ 要頂規 UI **必走 headless 自建**：用 Chatwoot **Client API + WebSocket（pubsub_token）**當後端，前端 100% 自刻（官方 `client-api-demo` 證實即時訊息可收）。坐席端用 Chatwoot 原生坐席台（不重造），管理面 `/ops/cs` 自建同設計語言。

**設計語言「晨間工作室」清新自然**（研究全球最佳網站 Linear/Airbnb/Headspace/Aesop + 反 AI-slop）：
- **色**：暖米白 `#F7F4F0` + 尤加利鼠尾草 `#547C65` + 暖土 `#D5B295`；中性全拉暖（非冷灰）；純白/純黑禁用。
- **字**：General Sans（UI）+ Fraunces（標題襯線帶溫度）+ **Noto Sans TC**（CJK 必顯式載）。
- **形/動**：不對稱對話泡泡、圓角、暖調柔陰影、grain 微紋；spring 柔性動效（緩慢呼吸非快速手勢）。
- **反 AI-slop**：禁紫藍漸層 / Inter 零客製 / 純白底 / 通用 fade / 無 easing snap / 玻璃擬態濫用。
- **企業識別系統（CIS）配置 — 重用既有，不重造（多租戶核心）**：CIS=MI/BI/VI 三層。**VI 標準色**重用既有 `organizations.metadata.client_config.brandColors{primary,secondary,accent}`（`brand-colors/route.ts`，Banner Studio 已用）當錨點，演算法只填周邊色階/中性/狀態色+保 AA（單色 OKLCH 推導降為無品牌時的 fallback）；補 logo/標準字/輔助圖形（擴 `brandKit`）。**BI/MI 語氣**重用既有 `BrandVoiceProfile{tone,personality,preferWords,avoidWords,promptInjection}`（`brand-voice/route.ts`）注入**客服 AI system prompt → 客服語氣 = 內容引擎同源**，跨觸點一致。詳 `_uiux_design.md §2.6`。

**非常棒的互動**（Chatwoot 原生互動類型 headless 自渲染）：快速回覆 chips（`input_select`）、即時訂單/物流卡（`cards`+A1 tool）、inline 表單（`form`）、inline 知識搜尋（`article`+RAG）、AI 打字 spring 指示、AI 已回透明標記、一鍵轉真人狀態、滿意度即時星評、檔案上傳；後期語音輸入/多語句級切換/主動訊息。

**Widget 分 4 階**（`_uiux_design.md` §10）：P1 headless MVP（Client API+WS+基本對話）→ P2 互動類型渲染器+打字+滿意度 → P3 inline 知識+交接 UI+a11y 全過（WCAG AA、鍵盤、reduced-motion、ARIA live）→ P4 語音/多語/主動/行動原生。

**已附互動原型**：本對話已渲染清新自然 widget 互動示意（快速回覆/AI 打字/訂單卡/轉真人/星評可點）。

---

## 附：本計畫產出方式（R0 紀律）
- doc-only，未動既有 code；原 3 附錄檔保留可回滾。
- §13 每個 file:line 聲稱已 grep 親自驗證；pgvector 不存在已確認。
- 競品事實見 `Customer_service_competitive_research.md`（含出處；廠商 resolution rate 自報、低信心、不作架構依據）。
- 實作各 Phase 另起 R0：理解→現況→風險→方案→建議→計畫→驗證四動作（REALTEST/REVIEW/BUGHUNT/WORKLOG）。
