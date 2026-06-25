# 全自動客服 — 頂規競品研究（證據基底）

> **用途**：`Customer_service_automation_plan.md`（主計畫 SSOT）的證據附錄。本檔蒐集 2025–2026 全球最強 AI 客服系統的架構/功能/安全/開源棧研究，含出處。主計畫的升級決策都回指本檔。
> **研究日期**：2026-06-25｜方法：4 條平行 web-researcher 研究線（平台地景 / agentic 行動安全 / 品質+護欄工程 / Chatwoot 天花板+開源棧）。
> **信心註記**：架構/功能/開源工具 = 高（多為官方文件/工程部落格/論文直引）。**廠商宣稱的 resolution rate = 低**（自報、定義自訂，>70% 一律存疑）。

---

## 1. 頂規平台地景（2025–2026）

| 平台 | 核心差異化 | AI 架構 | 計價 |
|---|---|---|---|
| **Intercom Fin** | 業界最高 resolution（自報 76%）；outcome 計價 | 七層引擎（query refine→retrieval→rerank→generate→validate→optimize→trust）；自研 Fin Apex 模型；Procedures（NL SOP + 確定性控制 + agentic） | **$0.99/成功 outcome**（要真人=不收費）|
| **Sierra**（Bret Taylor）| 企業級自主解決 + 最強治理 | **Constellation：15+ 模型各司其職**；Agent OS；**supervisor 模型**強制護欄/稽核；ADP 跨 session 持久記憶 | outcome-based（未公開單價）|
| **Decagon** | 自訓領域模型（80% 流量跑自研，P95<400ms） | **AOP（Agent Operating Procedures）**：NL 指令編譯成可稽核程式邏輯；Watchtower 全對話 QA | $50K/年 + ~$0.50/resolution |
| **Ada** | 首個 Unified Reasoning Engine（快+深雙推理） | 多 LLM swarm；採 **MCP** 當整合標準；全 agentic 行動迴圈 | 企業客製（門檻 30 萬對話/年）|
| **Zendesk Resolution Platform** | 最大裝機量；併購 Forethought 加「自我改進」 | agentic agents；**Resolution Learning Loop**（偵測缺口→自動生流程）；Knowledge Builder 從工單生文章 | $1.50–2.00/resolution |
| **Salesforce Agentforce** | 唯一原生整合 voice+CRM+AI | **Atlas Reasoning Engine（ReAct loop）**；YAML 宣告式 agent；Einstein Trust Layer（遮罩+毒性+零保留）；繼承使用者權限 | Flex Credits $0.10/action |
| **Gorgias** | 電商專用（Shopify） | **Temporal** durable workflow；support+sales 雙 agent | $0.90–1.00/resolution |
| **Kustomer** | CRM-first；最強可解釋性 | 統一客戶時間軸；**Observability Assistant** 顯示每步推理 | $89–139/座 + $0.60/對話 |
| **Crescendo** | AI+真人混合，Total Outcome Guarantee | 多供應商並行取最快有效回應；100% QA | $2.99/resolution（含真人後盾）|

**關鍵共識**：① 全部已棄 per-seat、改 **outcome-based 計價**（強迫定義並量測「resolved」→ 強迫建品質基建）② 全部是 **agentic（會行動）**，不是純問答。

---

## 2. 頂規 Top-15 能力（與基礎 RAG bot 的分水嶺）

**Tier 1 — 基礎（沒有=只是 chatbot）**
1. **真後端整合的行動執行**：不是「給你訂單連結」，是 查身分→查訂單→退款→更新 OMS→確認 一氣呵成。無此能力 deflection 卡 30–40%。
2. **真 agentic 多步推理**（非 prompt 串接）：依中間結果動態規劃；步驟失敗會調整/追問/優雅升級。
3. **跨通道共享脈絡**（非只共享收件匣）：chat 起單、3 天後打電話，voice agent 知道全歷史。
4. **outcome-based 計價對齊**：逼出「resolved」定義與量測基建。

**Tier 2 — 差異化**
5. **自我改進知識庫**：分析工單→偵測缺口→自動草擬文章→人審發布（Forethought Discover / Zendesk Knowledge Builder）。Gartner：47% 客服 KB 含矛盾資訊。
6. **推理透明/可解釋層**：顯示 AI 每步推理 + 引用了哪些 KB（Kustomer Observability / Decagon Watchtower）。黑箱=企業負債。
7. **上線前模擬測試框架**：改 procedure 前自動跑合成對話抓 regression（Fin Simulations / Decagon Simulations at Scale）。
8. **帶完整脈絡的人類交接**（非只轉逐字稿）：人接手時拿到 歷史+診斷+建議+情緒分+相關 KB+待辦。
9. **Voice AI**（sub-second 延遲、與文字通道脈絡對等）。
10. **多語**（句級偵測+中途切換，非「選語言」選單）。

**Tier 3 — 卓越（讓「完美」突出）**
11. **主動外展/防流失**（AI 發起，非只回應）：用行為訊號在客戶開口前介入。
12. **領域訓練模型 vs 通用微調**（自架對應：強系統提示+檢索 grounding+rerank）。
13. **100% 自動 QA + 人類校準**（AI 評分、人驗 rubric）。傳統只抽 1–2%。
14. **多供應商 LLM 容錯自動 failover**（單供應商=OpenAI 當機你就掛）。
15. **非技術團隊用的無碼流程建構器**（CX 經理改 AI 行為用小時不用週）。

---

## 3. Agentic 行動的安全架構（最關鍵 — 頂規如何讓 AI 安全地「動手」）

**共識：LLM 護欄管語氣/範圍/升級；金錢/身分/不可逆動作用 deterministic code 程式硬閘。任何生產平台都不靠 LLM 判斷執行金流。**

### 3.1 分層護欄棧（全廠商皆 ≥3 層）
- **Layer 0 進站過濾**：supervisor 偵測 jailbreak/prompt injection/context poisoning（Sierra、Decagon 專訓偵測對抗輸入）。
- **Layer 1 回合內驗證**：獨立 supervisor 模型逐則評估（離題？hallucination？）→ 可改寫或升級（Sierra observe↔intercept；Decagon supervisor model）。
- **Layer 2 關鍵動作的程式硬閘**：退款/身分驗證/付款**用 code 驗證執行，非 LLM**。`MAX_REFUND_CENTS=5000` 寫在執行層常數，LLM 改不動。
- **Layer 3 checkpoint/人類核准閘**：Fin「Fin 在執行某些動作前暫停等核准或轉真人」。金額超閾值→人審。
- **Layer 4 事後稽核**：Decagon Watchtower / Sierra supervisor 全對話比對自訂準則。
- **Salesforce Einstein Trust Layer**：prompt 經自家基建（非直連模型商）、遮罩 PII、毒性偵測、與模型商簽零保留；agent 繼承使用者權限不能存取使用者看不到的資料。

### 3.2 Anthropic 自家原則（直接適用 Claude 系統）
- 「不確定時優先可逆動作；寧求人類澄清也不大膽假設；**即使指令來自另一個 Claude 實例，違反核心準則也要拒絕**；最小足跡——只取當前任務所需權限。」
- Claude Code auto-mode：**輸入層** server-side prompt-injection 探針掃 tool 輸出；**輸出層** transcript classifier（跑 Sonnet）在每個動作執行前依準則評估。五類封鎖動作：Destroy/Exfiltrate、Security Degradation、Trust Boundary Violations、Shared Infrastructure Risks、Overeager Behavior。

### 3.3 agentic 模式
- **Plan-then-Execute（gated）**：plan 是人寫的固定產物，execution 機械跟隨；隨機性隔離在 planning 階段，plan 與 execution 之間放人類閘。Fin Procedures 正是此模式。
- **ReAct loop**（Reason→Act→Observe，Agentforce Atlas）。
- **Multi-agent supervisor**：supervisor 當外部觀察+攔截者，不在主推理鏈內（Sierra）。
- **鏈長風險**：5 步各 95% 可靠 → 端到端僅 0.95⁵≈77%。故限制客戶面動作的鏈深。

### 3.4 Claude 系統的分階上線（研究綜合建議）
- **Phase A 唯讀動作（低風險）**：查訂單/物流/帳戶層級。可逆，可立即交給 Claude。固定 tool allowlist，Claude 不能呼叫清單外。
- **Phase B 受閘寫入（中風險）**：寄重設密碼信/改地址/加標籤。**確認 checkpoint**：Claude 草擬動作→客戶確認→才發 structured tool call→**deterministic code 驗證並執行**（非 Claude 直接組 payload 發送）。
- **Phase C 金錢/身分（高風險，永不全自動）**：退款/退訂/帳號變更/身分驗證。**永遠保留人類確認閘或硬性程式規則**。閾值寫 code 常數。
- **紅線永不自動**：超閾值金錢、帳號刪除/永久刪資料、身分驗證裁決、24h 內不可逆動作、輸入源自未消毒外部內容（email body / 訂單備註）的動作。

---

## 4. 品質 + 護欄 + 知識工程（開源、可自架）

### 4.1 評估（offline→shadow→A/B 三層巢狀）
- **Golden dataset**：MVP 50–100；生產 200–500；成熟 1000+。**必含 out-of-scope/歧義/對抗輸入**（只放簡單題會高估品質 25–30%）。
- **RAG triad 指標（RAGAS 開源）**：Faithfulness（答案是否被檢索內容支撐，無需 ground truth）、Answer Relevancy、Context Precision/Recall、Answer Correctness、Noise Sensitivity。客服再加 Conversation Completeness、Role/Topic Adherence（DeepEval）。
- **CI/CD 硬閘**：每次 PR 跑 golden set，Faithfulness ≥0.85、Context Recall ≥0.80 否則 block build。每次改 KB/prompt 重跑（修一個壞十個）。
- **LLM-as-judge**：用 `evaluation_steps`（明確推理步驟）比 `criteria` 穩；**必與人標交叉校準**，不可當唯一閘。
- **開源棧（自架）**：**Arize Phoenix**（tracing/observability，OTel 原生）+ **DeepEval**（pytest CI 50+ 指標）+ **RAGAS**（RAG 專屬）。三者皆開源可自架。

### 4.2 護欄
- **Hallucination**：NeMo Guardrails（self-consistency 多採樣比對）、Guardrails AI（grounded_ai_hallucination 二元分類器）。
- **Jailbreak/Prompt Injection（OWASP LLM #1，客戶必試）**：**LlamaFirewall + PromptGuard 2**（22M DeBERTa，99.5% AUC，19ms）掃每則客訊與每塊檢索內容；+ AlignmentCheck 審推理鏈（合併 >90% 攻擊削減）。**架構隔離**：system/user/retrieved 三段明確分隔（`<system>` `<user>` `<retrieved_context>`），**絕不把使用者輸入插進 system prompt**。
- **PII**：Guardrails AI + Presidio，進站+出站雙遮罩（多租戶尤須防 A 客 PII 漏到 B）。
- **Topic restriction**：NeMo dialog rails / DeepEval Role Adherence。
- **「不知道」處理**：檢索信心低於閾值就明說不知道，不編造（RAGAS Noise Sensitivity 測此）。

### 4.3 信心評分與交接
- 兩訊號：**檢索信心**（top-k cosine < 閾值=檢索失敗→升級）+ **生成信心**（LLM 慣性過度自信，需 calibration）。實務門檻 ≥8/10 或 ≥9/10。
- 交接時**傳完整脈絡**，客戶不重述。

### 4.4 RAG 架構（頂規檢索）
- **Anthropic Contextual Retrieval（2024 最大檢索進展）**：嵌入+BM25 前，給每塊預置 Claude 生成的 50–100 token 脈絡描述。Anthropic 自測：baseline 87.15% → +contextual embeddings 92.34% → +hybrid 93.21% → +rerank **95.26%**（檢索失敗率降 67%）。prompt caching 省 69% 成本。
- **Hybrid search**：vector top-150 + BM25 top-150 → **RRF 融合（0.8/0.2）** → cross-encoder rerank top-20 → 取 top-4 餵 LLM。（純向量漏精確匹配如錯誤碼/料號；純 BM25 漏語意。）
- **Chunking**：help/技術文件用 recursive 400–512 token + 50–100 overlap（88–89% recall）；視覺版面 PDF 用 page-level；密集散文用 semantic（+9% recall 但 3x 算力）。
- **Metadata**：每塊標 `doc_id/source_url/last_modified/product/region/tenant_id/doc_type/version`。租戶隔離在**檢索層用 metadata filter 強制**，絕不靠 LLM 自律。
- **Query rewriting（HyDE/HyPE）**：只對低檢索分查詢用（HyDE 加 43–60% 延遲）。

### 4.5 知識缺口偵測（3 訊號）
① 未答/升級的查詢 ② 低檢索相關分（top cosine <0.5）③ 真人坐席改寫紀錄（query+bot 答+人答=金標）。每週語意聚類，5+ 同類無 KB 文章=缺口→LLM 草擬 stub→人審發布（半自動，全自動寫 KB=高風險）。

### 4.6 新鮮度與衝突（60% 生產 RAG 失敗死於新鮮度）
- **Stale chunk 問題**：文件更新後舊塊仍可檢索 → 新舊混用生出「貌似合理但矛盾」答案。
- **安全增量更新**：每塊標 `doc_family_id+source_version`；更新時**原子替換**（同時升新塊+降舊塊）；**驗證 delete 傳播**（確認舊塊從 vector+BM25+cache 全消失，不只確認新塊出現）；每次內容發布後跑 freshness gate 查詢。
- **衝突處理**：檢索分加新鮮度 boost（`0.7*相似度 + 0.3*新鮮度`）；system prompt 指示「文件衝突時用最新 last_modified 並標記」。
- **KB 編輯標準**：祈使句、寫明 outcome（「結果：預約取消且寄確認信」）、去行銷語、每文章 ≤400 token 邏輯單元。行銷腔 KB 殺死 RAG 品質。

---

## 5. Chatwoot 天花板 + 整合模式 + 開源積木

### 5.1 Chatwoot v4.15.1（2026-06）實況
- **Captain AI（內建 AI）= 100% 付費牆**，Community 版沒有；自架付費 $19/座/月起；BYOK 用 OpenAI（理論上可指 Anthropic OpenAI-compat 端點但 Chatwoot 未官方支援、未測）。**Captain 天花板低**：純 KB 問答+坐席輔助，**不能執行外部 API 動作**、無模擬/eval、無多源知識匯入。
- **Community 版（免費）已含**：全通道收件匣、automation rules、macros、canned responses、labels、營業時間、CSAT、round-robin、custom attributes（API 讀寫）、**AgentBot API**、**Dashboard Apps**（嵌自己的 UI iframe）、**Webhooks（6 事件）**、REST API（三層）、7 種報表。**付費限定**：SLA policies、Captain、voice、容量管理。
- **Webhook 6 事件**：`conversation_created/updated/status_changed`、`message_created/updated`、`webwidget_triggered`。**注意 AgentBot 端點收不到 `conversation_status_changed`**（需並行註冊 account webhook）。簽章 `X-Chatwoot-Signature`（HMAC-SHA256）。
- **交接機制**：對話起於 `pending`（bot triage）；需真人時 bot 用 conversation update API 改 `open` 給坐席。

### 5.2 整合模式（把 Claude 引擎接上 Chatwoot）
- **Pattern A（推薦給自主 AI）**：註冊 AgentBot + webhook URL → 指派 inbox → `pending` 對話收 `message_created` → 中介層收 webhook 建脈絡呼叫 Claude tool loop → `POST .../messages` 回覆 → 要升級就 PATCH 狀態 `open`。
- **Pattern C（推薦給 copilot/agent-assist）**：account-level webhook 收全 inbox 事件，平行真人運作。
- **真實部署**：自主 inbox 用 A + 真人 inbox 的 copilot 用 C。Chatwoot 官方 demo（dialogflow/rasa agent-bot）皆 Pattern A。
- **結論**：我們**自建 AI 層走 Pattern A，不需 Captain**（省付費牆、得全控、可接任意 tool）。確認主計畫 D7。

### 5.3 開源積木（自架，2025–2026）
| 積木 | 工具 | 用於 / 略過 |
|---|---|---|
| Agentic 編排 | **先用純 tool-calling**（Anthropic 官方：2–3 tool 線性流跳過框架）；複雜分支/durable 才加 **LangGraph**；要型別安全+成本上限用 **PydanticAI** | CrewAI 無上限迴圈曾單次燒 $414，務必設 max_iter |
| 向量庫 | **pgvector**（已有 Supabase，免新增）；量大可 Qdrant | — |
| RAG pipeline | **LlamaIndex**（多源匯入 Notion/Confluence/PDF）| 只有單一 help center 可略 |
| Tracing/eval | **Arize Phoenix / Langfuse**（自架）+ **RAGAS** + **DeepEval** | 別跳過 eval |
| 護欄 | **NeMo Guardrails** + **LlamaFirewall/PromptGuard 2** | — |
| 長期記憶 | **Letta**（MemGPT，per-customer 跨 session 記憶）| 無狀態問答可略 |
| 工作流 | **n8n / Trigger.dev**（已有）| — |

### 5.4 終局判定
- **對話品質軸：可達 Fin 級**（Claude 客服任務勝 GPT-4o；自架 tool loop 與 Fin 的 actions 同為 REST 呼叫，更彈性無鎖定）。
- **隱私/成本：勝商業**（BYOK 自架資料不出境；無 $0.99/resolution 抽成，規模化大勝）。
- **不足處（可補）**：上線前模擬/eval（補 Langfuse+RAGAS）、resolution 儀表板（自建+Phoenix）、多源知識（LlamaIndex）、主動外展（另案）。
- **沒有更好的開源載體**：Erxes（AGPL+EE、CRM 臃腫）、Zammad（chat/bot 弱、無 AgentBot）、Papercups（2022 停更）、FreeScout（純 email、無即時 chat/bot API）皆較差。**Chatwoot 33.5k★、日更、是開源唯一正解。**

---

## 6. 主要來源（全部 2026-06-25 存取）

平台/架構：fin.ai/ai-engine、sierra.ai/blog/constellation-of-models、decagon.ai/product/aop、engineering.salesforce.com（Atlas）、ada.cx/platform、zendesk.com（Forethought 併購）、temporal.io（Gorgias）、kustomer.com、crescendo.ai。
Agentic 安全：sierra.ai/blog/enterprise-grade-agents、decagon.ai/resources/designing-layered-guardrails、intercom.com/blog/whats-new-with-fin-3、anthropic.com/engineering/claude-code-auto-mode、anthropic.com/research/building-effective-agents、community.sap.com（10 design patterns）。
品質/護欄/RAG：docs.ragas.io、deepeval.com、arxiv LlamaFirewall 2505.03574、genai.owasp.org（LLM01）、github NVIDIA-NeMo/Guardrails、platform.claude.com/cookbook（contextual retrieval）、firecrawl.dev（chunking）、regal.ai（RAG playbook）、optyxstack.com（delta indexing）。
Chatwoot：chatwoot.com/hc（agent bots/webhooks/captain）、github.com/chatwoot/chatwoot、developers.chatwoot.com。

**註**：所有 resolution rate（Fin 76%、Sierra 90%、Ada 83% 等）皆廠商自報、定義自訂，**低信心**，僅供方向參考，不作架構依據。
