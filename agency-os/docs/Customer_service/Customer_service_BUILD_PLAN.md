# 全自動客服 — 建置執行總計畫（BUILD PLAN / 執行 SSOT）

> **這份是「執行 SSOT」** —— 要知道「做到哪、下一步、誰依賴誰、哪些 gate、跑哪台機」，看這份。
> **設計 SSOT** 是 [`Customer_service_automation_plan.md`](Customer_service_automation_plan.md)（架構/分級/RAG/eval/agentic）。兩份分工同 Cold Outreach 的 SPEC + BUILD_PLAN 範式。
> **建置原則**（操作者拍板 2026-06-26）：**軟體先行、硬體後搬** —— U0–U5 全部現在零花費在現有機器建好驗證；只有 U6（Chatwoot 載體）之後搬大記憶體機器。

---

## §0 文件地圖（這專案的所有文件）

| 檔 | 角色 |
|---|---|
| **`Customer_service_BUILD_PLAN.md`（本檔）** | **執行 SSOT** — 單元/順序/進度/gate/IA 落點 |
| [`Customer_service_automation_plan.md`](Customer_service_automation_plan.md) | **設計 SSOT** — v2.1 主計畫（§0 決策 / §1 雙軸分級 / §3 控制流 / §4 RAG / §5 eval / §8 容錯 / §9 資料模型 / §11 roadmap / §15-17 / §18 客戶體驗）|
| [`Customer_service_competitive_research.md`](Customer_service_competitive_research.md) | 頂規競品研究證據（Fin/Sierra/Decagon… + 開源棧，含出處）|
| [`Customer_service_uiux_design.md`](Customer_service_uiux_design.md) | 客戶體驗 UX + 清新自然設計語言 + **CIS（§2.6 品牌色引擎 / §2.7 brandKit+csVoice schema）**+ headless widget |
| [`Customer_service_plan.md`](Customer_service_plan.md) | 最初決策摘要（原檔，附錄）|
| [`Customer_service_platform_research.md`](Customer_service_platform_research.md) | 通道可行性研究（原檔，附錄）|
| 互動原型 | `D:\tmp\cs-widget-demo.html`（清新自然 widget，瀏覽器可開）+ 對話內 2 個 show_widget（配色引擎 / CIS 設定 tab）|

---

## §1 鎖定決策速查（D1–D12，詳設計 SSOT §0）

| D | 決策 |
|---|---|
| D1 | 雙軸漸進：答覆 L1→L2 × 行動 A1→A2；money/身分/法律/醫療**永不自動**（code 硬閘）|
| D2 | 三維一起建（自用+客戶自用+代操）；自家 Account#0 先金絲雀 |
| D3 | OpenAI embeddings 可插拔（資料主權客戶切 bge-m3）|
| D4 | 商業軌（官方 API）主幹；個人軌隔離不進產品 |
| D5 | 獨立 Chatwoot 機器（**軟體先行、之後搬大機**）|
| D6 | Chatwoot 擁有對話；我方只存知識/eval/稽核/記憶/CIS |
| D7 | 自建 Claude+RAG+agentic（非付費 Captain）|
| D8 | Chatwoot Pattern A（AgentBot+webhook）+ Community 版 |
| D9 | agentic 行動分階 A1 唯讀→A2 受閘寫→A3 金錢/身分人類閘 |
| D10 | 開源護欄棧：Phoenix+RAGAS+DeepEval+NeMo+PromptGuard2+Contextual Retrieval+hybrid |
| D11 | 先純 tool-calling；複雜才 LangGraph；durable 用 Trigger.dev |
| D12 | headless 自建 widget（清新自然）；CIS 重用既有 brandColors+BrandVoiceProfile |

---

## §2 IA 落點（已驗證 `next-admin/app/SidebarNav.tsx` + `ClientHubTabs.tsx`）

```
per-client hub  /ops/clients/[slug]   （既有 7 tab：內容工具/整合/佈建/維護/設定/社群頻道/憑證庫）
  ├─ ➕ tab「品牌識別(CIS)」   ← VI 標準色(錨點 brandColors)+Logo+標準字 / BI·MI 客服語氣(BrandVoiceProfile)
  └─ ➕ tab「客服」            ← 該客戶 知識庫/通道/intent autonomy

頂層 sidebar ➕ section「客服」（仿 Cold Outreach 作戰中心）
  ← 跨客戶營運：Chatwoot 收件匣 / eval·模擬 / 意圖開關 / resolution·成本 / kill-switch 三層

客戶自用（賣，Phase 5）  ← 不另寫；同一批 per-client 元件在自助 portal 限定該 org 重用
```
**原則**：設計一次，自用+代操今天可用（agency ops 視角）；客戶自助 Phase 5 重用同元件。**不新增孤立入口。**

---

## §3 建置單元與依賴順序（U0–U6）

> 狀態：✅ 完成 ｜ 🔨 進行中 ｜ ⏭ 下一個 ｜ ⏳ 排隊 ｜ ⛔ gated（等 go-ahead）
> 跑哪：💻 現有機器($0) ｜ 📦 之後搬大機

| U | 單元 | 跑哪 | 依賴 | 對應 Phase | 狀態 |
|---|---|---|---|---|---|
| **U0** | **資料地基** migration 0051（8 表 + pgvector + RLS + RPC）| 💻 EU prod Supabase | — | 全 Phase 地基 | ✅ **建好+apply+live 驗證**（8表/8RLS/8policy/RPC/pgvector）|
| **U1** | **cs-engine 核心** `lib/cs/`（webhook→護欄→分類→RAG→生成→supervisor→送/動作/轉）| 💻 next-admin | U0 | P1–P4 | ✅ **建好+驗證**（13 檔+測試；tsc 0 / vitest 35 / critic 修訖）|
| **U2** | **CIS 配置 + tab**（brandKit+csVoice JSONB + 「品牌識別」tab，重用 brandColors/BrandVoiceProfile）| 💻 next-admin UI | — | P1 | ✅ **建好+驗證**（tab+cis route；tsc 0 / critic 0C0M）|
| **U3** | **客服 tab + 頂層「客服」section**（per-client config + 跨客戶營運中心）| 💻 next-admin UI | U0,U1 | P1–P2 | ✅ **建好+驗證**（tab+cs-config route+/ops/cs+sidebar；tsc 0 / critic 1C 修；kill-switch 接進 engine）|
| **U4** | **headless widget**（Client API+WS+清新自然+互動類型）| 💻 next-admin embed | U1,U6 | P1 | 🟡 **程式碼完成+驗證**（6 檔；tsc 0/vitest 49/critic XSS-clean+4 Major 修）— **等 U6 接 live** |
| **U5** | **eval/護欄 harness**（golden set runner + LLM-judge + 畢業 gate）| 💻 自架現有機 | U1 | P2 | ✅ **建好+驗證**（lib/cs/eval+route+7 測；tsc 0/vitest 42；critic 2C 修：跑真實 decideAnswerAction）|
| **U6** | **Chatwoot 載體**（docker-compose Community + healthcheck/smoke/rollback）| 📦 ks-aw-01 | — | P1 | 🟡 **四容器 healthy，公開可訪問（2026-09-11）**——`https://chatwoot.aware-wave.com/` 經 Cloudflare→nginx→chatwoot-rails 全鏈路，真實回 302→onboarding；webhook 接線+billing bridge 已 commit 待 deploy。Account#1 已建（操作者親自完成，帳號/密碼建立不可由 AI 代做）+ API Inbox + AgentBot 已透過 API 接線完成。詳 WORKLOG 2026-09-11 各批。**剩**：next-admin deploy 完成後端到端重測 |

**U1 cs-engine 子任務**（建時細分，仿 Cold Outreach T1–T12）：
- U1a RAG 管線：切塊 + Contextual Retrieval + embeddings(可插拔) + pgvector 寫入/檢索 + hybrid(vector+BM25+RRF+rerank)
- U1b 控制流：webhook 接收(HMAC+冪等) + 前置(租戶/營業時間/loop/rate) + 意圖分類(haiku)
- U1c 護欄：PromptGuard2 + 三段隔離 + grounding supervisor + 信心門檻 + PII + 敏感意圖轉真人
- U1d 生成：Claude sonnet + CIS 品牌語氣注入(BrandVoiceProfile) + 多供應商 failover(Gemini)
- U1e agentic 行動：tool-loop + allowlist(cs_tools) + A2 確認 checkpoint + A3 code 硬閘
- U1f 送出/交接：Chatwoot Client/AgentBot API 回覆 + pending→open + cs_ai_replies/cs_action_log 稽核 + ops-inbox 漏回告警
- U1g 成本/可觀測：ai_call_logs(kind=cs) + Phoenix/Langfuse trace

**Phase 對照**（設計 SSOT §11）：U0+U1b/c/d+U2+U6+U4 = Phase 1（載體+L1 副駕）；U1a+U5 = Phase 2（RAG+eval 升 L2）；U1e(A1) = Phase 3；U1e(A2) = Phase 4。

---

## §4 High-Risk Gates（不經 go-ahead 不做）

| Gate | 觸發 | 規則 |
|---|---|---|
| **apply migration 0051** | U0 寫入 prod Supabase | High：等明示 go-ahead；apply 前確認實例有 pgvector + hnsw |
| **Chatwoot deploy** | U6 docker-compose 上機 | High：走新部署 6 項（healthcheck/smoke/rollback/notify/typecheck）+ go-ahead |
| **租/搬 VPS** | U6 搬大記憶體機器 | High：規格/區域/成本由操作者拍板（D5，目前暫緩）|
| **money/身分自動化** | A3 動作 | 紅線：**永不自動**，code 硬閘 + 人類閘 |
| **DPA** | 送客戶 PII 到 LLM（Phase 2 前）| 帳號層：Anthropic+OpenAI 零保留設定 |

---

## §5 建置進度 Log

**2026-06-26 — U0 資料地基 ✅**
- 建：[`packages/db/migrations/0051_cs_core.sql`](../../../lobster-factory/packages/db/migrations/0051_cs_core.sql)（8 表：cs_knowledge_sources / cs_knowledge_chunks[pgvector+BM25] / cs_intents[雙軸] / cs_tools[allowlist] / cs_eval_cases / cs_customer_memory / cs_ai_replies[稽核] / cs_action_log）+ [`scripts/0051_cs_core_down.sql`](../../../lobster-factory/packages/db/scripts/0051_cs_core_down.sql)
- 慣例：照 0050（BEGIN/COMMIT + service-role RLS + NOTIFY pgrst + WHY/SCHEMA/SECURITY 註解）
- 驗證：✅ 0051 未被佔 / cs_ 表名無衝突 / vector+hnsw 首用 / down 就位
- **apply（2026-06-26，operator go-ahead）**：pre-flight（supabase-db 在 / pgvector available=1 / cs_ 表=0）→ `cat 0051 | ssh EU "docker exec -i supabase-db psql -U supabase_admin -v ON_ERROR_STOP=1"` → **PSQL_EXIT=0 原子 COMMIT** → live 驗證 **cs_tables=8 / rls_on=8 / policies=8 / rpc=1 / vector_ext=1 / RPC smoke 回 0 列**。`- REALTEST_EVIDENCE: tool=SSH | cmd=docker exec supabase-db psql apply 0051 + verify | exit=0`

**2026-06-26 — U1 cs-engine 核心 ✅**
- 建 13 檔 `lib/cs/`：`config`(models/閾值/紅線常數 MAX_REFUND_CENTS=0) · `types` · `autonomy`(雙軸決策/RRF/紅線,純) · `guardrails`(injection/PII,純) · `llm`(Claude+Gemini failover+logAiCall) · `cis`(載入+system prompt 三段隔離) · `db`(cs_* 存取+向量/關鍵字檢索) · `rag`(OpenAI embeddings 可插拔+hybrid+切塊) · `intent`(haiku 分類) · `tools`(行動閘 A1放/A2A3人類+money code 硬閘) · `generate`(生成+supervisor+agentic tool-loop) · `orchestrator`(handleInbound 管線,任何失敗退安全態) · `index`(公開介面)。+ `__tests__/cs-core.test.ts`。
- **REALTEST**：`npx tsc --noEmit` = **0 錯**（全專案）；`vitest run lib/cs` = **35/35 過**。`- REALTEST_EVIDENCE: tool=Bash | cmd=tsc --noEmit && vitest run lib/cs | exit=0 | ms=~40000`
- **REVIEW**：critic（外部 oracle）審 → 0 Critical、2 High（supervisor `safe` fail-open；tool 名稱 backstop 缺）+ minors → **全修 + 重驗**（safe 改 fail-closed `parseVerdict`；tools.ts 加 `hitsRedLine(name)` backstop + 負數金額 abs；PII NFKC 正規化抓全形/小寫/Unicode dash；denied tool `is_error`；down migration 補 DROP FUNCTION）。`- REVIEW_DONE: critic=Deep | verdict=pass(修後) | findings=0c/2h/5m`
- **BUGHUNT**：`grep cs_match_chunks/cs_knowledge_chunks/handleInbound` 跨 `lobster-factory agency-os scripts` → 單一存取點（db.ts+migration）、無重複模組、無外部 stale caller。`- BUGHUNT_DONE: scope=lobster-factory,agency-os,scripts | grep=cs_match_chunks|handleInbound | hits=單一存取點確認`
- **待 / 已知 seam**（非 bug，後續單元）：① agentic auto-send 的 grounding 目前看 chunks 非 tool 輸出 → 工具型答案會退 handoff（fail-safe；Phase 3 接業務系統時補）② `parseJsonObject` greedy（退 fail-safe，可靠性 nit）③ `withinBusinessHours` 欄位留給交接/通知層（AI 24h 回，非決策）。
- 待：apply U0 + 接 Chatwoot AgentBot webhook route（U3/U6）才能 live 端到端。

**2026-06-26 — U2 CIS「品牌識別」tab ✅**
- 建：`app/api/ops/clients/[slug]/cis/route.ts`（PATCH，brandKit+csVoice 進 client_config JSONB，鏡像 brand-colors：canWriteTenantConfig + ops_audit_events）+ `ClientHubTabs.tsx` 加 `BrandIdentityTab`（BrandColorsCard 重用 + BrandKitCard logo/字/圖形 + CsVoiceCard 人格/語氣/emoji/敬語）+ `CisText/CisSelect` helper + wire TABS「品牌識別」+ render；`ClientConfig` 加 brandKit/csVoice 型別；品牌色從「設定」tab 移出（consolidation）。
- **REALTEST**：`tsc --noEmit` = **0 錯**；vitest 35/35（型別改動無破壞）。`- REALTEST_EVIDENCE: tool=Bash | cmd=tsc --noEmit && vitest run lib/cs | exit=0` ｜ live UI/route smoke 待 app 跑起（dev server / deploy）。
- **REVIEW**：critic → **0 Critical / 0 Major**（auth 閘、slug→org 多租戶、prototype-pollution、merge 保留全乾淨）+ 2 Minor → **修**（csVoice 改保留外部 key 不清 brandVoice/apologyStyle/slogan；free-text 加長度上限防 prompt 膨脹）。`- REVIEW_DONE: critic=Deep | verdict=pass | findings=0c/0m/2minor修`
- **BUGHUNT**：grep「品牌識別」wired / BrandColorsCard 單一 render / cis route 被呼叫 / brandKit·csVoice 跨 6 檔一致。`- BUGHUNT_DONE: scope=lobster-factory | grep=brandKit|csVoice|品牌識別 | hits=一致`

**2026-06-26 — U3 客服 tab + 頂層「客服」section ✅**
- 建：`cs-config/route.ts`（GET 讀 intents/knowledge/csEnabled + PATCH 每租戶 kill-switch，service-role 讀 cs_ 表）+ `ClientHubTabs.tsx` 加 `CustomerServiceTab`（client-side fetch，kill-switch toggle + 雙軸 autonomy 徽章 + 知識源數）+ wire「客服」tab + `SidebarNav.tsx` 加頂層「Customer Service」section + `app/ops/cs/page.tsx`（跨客戶營運中心，聚合 cs_ counts）。
- **REALTEST**：`tsc --noEmit` = **0**；vitest 35/35；**live prod 驗證**（org 解析=1 / cs_intents 7 欄 SELECT 對得上 schema / knowledge·replies 查詢不爆）。`- REALTEST_EVIDENCE: tool=SSH | cmd=tsc 0 + psql validate cs-config SELECT cols vs EU prod | exit=0`
- **REVIEW**：critic → **1 Critical**（kill-switch inert：UI/API 寫 csEnabled 但 engine 沒讀 → 切了沒用）+ 1 Major（型別未綁）+ 2 Minor → **全修**：kill-switch 接進 `orchestrator.handleInbound`（step 2 後、LLM spend 前 `cis.csEnabled===false → makeHandoff("tenant_killswitch")`）+ `loadCis` 回傳 csEnabled + `CisProfile`/`ClientConfig` 加型別 + `HandoffReason` 加 `tenant_killswitch` + loadCounts 查詢失敗回 null + setCsEnabled 用 server echo。`- REVIEW_DONE: critic=Deep | verdict=pass(修後) | findings=1c/1m/2minor 全修`
- **BUGHUNT**：`csEnabled` 從 0 consumer → 6 檔（types/cis/orchestrator/route/cs-config/ClientHubTabs）；客服 tab wired；/ops/cs 連結 + sidebar section 無 404（critic 驗）。`- BUGHUNT_DONE: scope=lobster-factory | grep=csEnabled | hits=6檔一致`
- 待 hardening：`handleInbound` 整合測試（mock loadCis 驗 kill-switch 觸發）。

**2026-06-26 — U5 eval/護欄 harness ✅**
- 建：`lib/cs/eval.ts`（judgeCovers LLM-judge + runEvalCase + summarize/gradeIntent 純函式 + runEval）+ `db.loadEvalCases` + `app/api/ops/cs/eval/route.ts`（POST，operator+ gated，只回 metrics 不回答案=防 PII）+ types(EvalCase/Result/Summary/IntentGrade) + `cs-eval.test.ts`（7 測）。畢業 gate：n≥30 / passRate≥0.95 / **危險誤答=0（零容忍）** / handoffRecall=1。
- **REALTEST**：`tsc` 0；vitest **42/42**（+7 eval 純邏輯）；**live prod 驗** cs_eval_cases 5 欄 SELECT 對得上 schema。`- REALTEST_EVIDENCE: tool=SSH | cmd=tsc 0 + vitest 42 + psql validate eval cols vs EU prod | exit=0`
- **REVIEW**：critic → **2 Critical**（eval 重寫 lossy 子集，只複製 7 個 handoff 觸發的 2 個 → 可放行 prod 不安全意圖）+ 2 Major + 3 Minor → **修**：runEvalCase 改呼叫**真實 `decideAnswerAction`**（input guards→classify→resolveIntent→retrieve→supervise→真實 7-gate 決策；export orchestrator.resolveIntent 重用）+ 空 expectedPoints 答題不免費過 + per-case try/catch（errored=handoff）+ 逐意圖才評級。#6/#7 文件記（golden set 須含 handoff 案例；大集移背景 job）。`- REVIEW_DONE: critic=Deep | verdict=pass(修後) | findings=2c/2m/3minor`
- **BUGHUNT**：resolveIntent 1 export/1 import；decideAnswerAction 真實 gate 接上；runEval/gradeIntent 導出+route 用。`- BUGHUNT_DONE: scope=lobster-factory | grep=decideAnswerAction|resolveIntent | hits=一致`
- 待 hardening：runEvalCase 整合測試（mock DB/LLM）；eval 移 Trigger.dev 背景 job（n≥30 sequential 恐逾 maxDuration）。

**2026-06-26 — U4 headless 清新自然 widget（程式碼完成，等 U6 接 live）🟡**
- 建 6 檔：`lib/cs-widget/{types,theme,chatwoot-transport,mock-transport}.ts` + `app/cs-widget/{CsWidget.tsx,page.tsx}` + `__tests__/theme.test.ts`。transport 抽象（真 Chatwoot Client API+ActionCable WS / Mock）；CIS seed→OKLCH 清新自然色盤（主色亮度鎖保 AA）；泡泡/快速回覆/卡片/打字/轉真人/launcher；demo 頁 MockTransport 可渲染。
- **REALTEST**：`tsc` 0；vitest **49/49**（+7 theme 純邏輯：hexToHueSat NaN-safe / 主色亮度鎖 / 灰種低彩度）。`- REALTEST_EVIDENCE: tool=Bash | cmd=tsc 0 + vitest 49 (theme pure) | exit=0` ｜ live UI/Chatwoot 端到端待 U6（無後端）。
- **REVIEW**：critic → **XSS 面乾淨**（React escaping，無 dangerouslySetInnerHTML）+ 4 Major → **修**：window.open URL scheme 驗證 http/https+noreferrer（唯一真資安）/ content_attributes.items 解包（否則互動內容 prod 全失效）/ reject_subscription 清 stale token / Number(cached) NaN guard；+ IME isComposing（繁中 audience）+ close/launcher/card-action 改 `<button>` a11y。`- REVIEW_DONE: critic=Deep | verdict=pass(修後) | findings=0c/4m/5minor`
- **BUGHUNT**：safeOpen wired / content items 解包 / reject_subscription。`- BUGHUNT_DONE: scope=lobster-factory | grep=safeOpen|content_attributes|reject_subscription | hits=一致`
- 待 U6 接 live：MockTransport→ChatwootTransport(config)；WS onclose 自動重連（critic Minor）；inbox_identifier/baseUrl 從 CIS 設定帶入。

**2026-06-27 — 操作介面（data-entry）✅ — 操作者反映「沒有填資料的頁面」**
- 根因：先前 /ops/cs 與客戶「客服」分頁皆**唯讀**（只顯示數量+kill-switch），沒有建意圖/餵知識庫的入口 → 0/0/0 無從輸入。
- 建：`db.ts` 加 upsertIntent/deleteIntent/listKnowledgeSources/deleteKnowledgeSource → index 導出；`cs-intents/route.ts`（POST upsert + DELETE）+ `cs-knowledge/route.ts`（GET list + POST ingestKnowledge + DELETE）；`CustomerServiceTab` 擴成可操作（**餵知識庫表單**：標題+內容→切塊+向量化；**建意圖表單**：key/名稱/答覆 L0-L2/行動 A0-A2/敏感；逐列刪除）。操作位置=**客戶中心 →「客服」分頁**；CIS 在「品牌識別」分頁。
- **REALTEST**：`tsc` 0；vitest 49/49。`- REALTEST_EVIDENCE: tool=Bash | cmd=tsc 0 + vitest 49 | exit=0` ｜ live 端到端（實際餵資料→RAG 檢索）需 next-admin 部署 + `OPENAI_API_KEY`。
- **REVIEW**：critic → **0 Critical**（auth/多租戶/RLS/onConflict/cascade/XSS 全乾淨；middleware strip 偽造 role header）+ 2 Major + 1 Minor → **修**：knowledge body 上限 10 萬字（防 OpenAI 失控成本/硬失敗）+ ingestKnowledge embed 失敗 rollback source row（不留 0-塊 ghost）+ 4 mutation 加 ops_audit_events parity。`- REVIEW_DONE: critic=Deep | verdict=pass(修後) | findings=0c/2m/1minor`
- **BUGHUNT**：audit/rollback/cap 接線；helper 各檔一致。`- BUGHUNT_DONE: scope=lobster-factory | grep=ops_audit_events|deleteKnowledgeSource|body_too_long | hits=一致`
- **附帶修**：`app/api/internal/hosting/provision-staging/route.ts` 並行 session bad-merge 把 5 個 content-seed helper 定義兩次（405 行）→ 全專案 tsc 10 錯擋部署。刪舊 Copy（保留 2026-06-27 SG 驗證的新版 `shq(unknown)`+MAX_SEED_PAGES）→ 307 行、tsc 0。非 CS 檔但擋 build，line-precise sed 刪除，備份 `/d/tmp/provision-staging-backup.ts`。

**2026-06-27 — 上線部署 + live 端到端實測（prod 驗證通過）✅**
- **部署**：`/check-drift`（SG prod 落後 3）→ `/verify`（ALL PASSED + tsc 0 + vitest 49）→ 確認 SG `lobster-next-admin` 容器 `OPENAI_API_KEY` 已 SET → **`sg-deploy.sh next-admin`**（git pull→docker build→healthy 7s→HTTP smoke login/api/wordpress/node-api 全 200→commit `024b52c3`）。新 route `cs-intents`/`cs-knowledge` 確認在部署 build 內（`docker exec ls .next/server/app/...`）。`- REALTEST_EVIDENCE: tool=SSH | cmd=sg-deploy.sh next-admin | exit=0 (healthy+smoke200)`
- **live e2e（瀏覽器驅動 prod app）**：客戶中心 `awarewave-ops` →「客服」分頁 → 餵知識「【測試】退換貨政策」→ UI「✓ 已建索引（1 塊）」+ 來源清單 0→1；建意圖 `order_status`(L1/A0) → 清單 0→1。**DB 閉環**（EU prod psql）：`sources=1 / chunks_with_embedding=1 / embed_dim=1536 / intents=1` → **OpenAI embeddings→pgvector 全鏈在 production 跑通**。`- REALTEST_EVIDENCE: tool=Chrome+SSH | cmd=browser feed knowledge+intent → psql verify EU prod | embed_dim=1536`
- 留測試資料於 awarewave-ops（標題含「【測試】」，可由 × 刪）。

**2026-06-27 — U6 Chatwoot 決策（買哪台 + 順序 + HA）→ 寫入 runbook**
- 決策：買二手 dedicated（i7-7700/64GB/**2×512SSD**/~€48.70月/FSN）；**Chatwoot greenfield 先裝**（零搬遷風險）→ EU 服務照 §5 慢慢搬 → 退雲端兩台；**單台 + RAID1 + R2 夠用，HA 第二台延後**（量測：EU 8G 滿+3G swap、SG 僅 4G，現有塞不下）。
- 寫入 `runbooks/HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md §0b` + §7 checklist +5 項。卡點：操作者下單買機（刷卡非 Claude）。

---

## §6 每單元驗證標準（R0 四動作，逐單元）
- **REALTEST**：U1+ code → `npx tsc --noEmit` + 真實 invoke（webhook/curl/DB round-trip）；U0 migration → apply 後查表/RLS；REALTEST_EVIDENCE 入 WORKLOG
- **REVIEW**：critic subagent 外部 oracle，結論入 [驗證結果]
- **BUGHUNT**：跨檔 grep call sites（scope 含 agency-os/scripts/lobster-factory）
- **WORKLOG**：每單元根因/步驟/驗證 + 本檔 §5 進度 log 更新

---

_本檔為執行 SSOT；設計細節一律回指 `Customer_service_automation_plan.md`。新單元完成 → 更新 §3 狀態 + §5 log。_
