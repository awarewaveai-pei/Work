# 統一聊天介面（Unified Chat Inbox）— 完整計畫

## Context（為什麼做這個）

使用者看過一種網站，能把所有聊天/社群軟體的訊息聚合在同一視窗管理（Beeper / Rambox / respond.io / Missive 類）。目標平台：**WhatsApp、Facebook Messenger、Instagram、X(Twitter)、LINE、Telegram、Email**。

使用者三個維度全選「都要」：
- **帳號類型**：商業帳號（官方 API）+ 個人帳號（Beeper 式橋接）
- **用途**：AwareWave 自用 + 代客戶管理 + 做成可賣產品
- **本次範圍**：只出完整計畫，不寫 code
- **建置策略**：整合開源 **Chatwoot**（不自建）

這份計畫的產出是「決策 + 架構 + 分期落地藍圖」，不含實作。

---

## 核心結論（先講重點）

1. **商業帳號軌 → 自架 Chatwoot 就是答案**。Chatwoot v4.15.1（2026-06）原生支援 WhatsApp Cloud API、Messenger、IG Direct、LINE、Telegram、Email、SMS、Website、API channel。省下數月自建工程，且天然多租戶（帳戶/團隊/收件匣分層），三個用途維度一套打通。
2. **X(Twitter) DM 是唯一紅燈**：Chatwoot 自 2023-04 已下架 Twitter 整合；即時收 DM 需 X 的 Account Activity API，只在 ~$42K/月 Enterprise 方案。Pay-per-use（2026-02 起）只能逐則送/讀 DM（$0.015/則），**收不到即時 webhook**。→ **X 不納入即時收件匣**，僅保留「發文/逐則回覆」的旁路選項（見 §X 處理建議）。
3. **個人帳號軌（Beeper 式）技術可行但高風險**：走 `Matrix homeserver + mautrix bridges + beeper/chatwoot 橋` 把個人 WhatsApp/IG/Messenger 灌進 Chatwoot。**違反各平台 ToS、有封號風險（VPS IP 放大風險）、維護脆弱**。→ 列為**獨立 Phase、明確風險旗標**，建議只給「自用/實驗」，**不**放進賣給客戶的產品線。
4. **不要自建 `/chat` 模組**。研究確認 Chatwoot 涵蓋所有需求 channel；自建等於重造 respond.io，違反 30 年工程紀律的「零重工」。改為「整合 + 在現有 next-admin/ops console 做深度連結與單一登入入口」。

---

## 平台可行性對照（2026-06 查證）

| 平台 | 商業帳號軌（官方 API via Chatwoot） | 個人帳號軌（mautrix bridge） |
|---|---|---|
| WhatsApp | 🟢 Cloud API 原生，直連 Meta 免 BSP 費 | 🟡 mautrix-whatsapp，ToS 違規、封號風險 |
| Messenger | 🟢 需 FB Page + Meta app review | 🟡 mautrix-meta |
| Instagram | 🟢 需 IG Professional + 連 FB Page | 🟡 mautrix-meta |
| LINE | 🟢 需 LINE 官方帳號 + Messaging API | — (LINE 個人無實用 bridge) |
| Telegram | 🟢 原生（v4.3.0 起 Business mode） | 🟢 個人可用 Telegram 官方 client API |
| Email | 🟢 原生 IMAP/SMTP 共享收件匣 | 🟢 同（個人信箱也走 IMAP） |
| X(Twitter) | 🔴 Chatwoot 已下架；即時 DM 需 $42K/月 | 🔴 mautrix-twitter 極脆弱、X 積極封爬蟲 |

註：商業帳號軌每個平台都需各自的商業驗證/開發者 app（WhatsApp 需 Meta Business 驗證 2–10 工作天、Messenger/IG 需 Meta App Review、LINE 需官方帳號）。這些是**外部前置作業**，不是寫 code 能跳過的。

---

## 架構設計

```
                         ┌─────────────────────────────────────┐
                         │   AwareWave 既有 next-admin /ops      │
                         │   (Next.js 15 + Supabase, EU VPS)     │
                         │   → 加「統一收件匣」入口卡片 + SSO 連結  │
                         └──────────────┬──────────────────────┘
                                        │ (deep link / iframe / SSO)
                                        ▼
              ┌──────────────────────────────────────────────────┐
              │         Chatwoot（自架, Docker Compose）            │
              │   多租戶: Account → Team → Inbox 三層               │
              │   自用=自家 Account；客戶=各自 Account/Team；       │
              │   產品=每客戶一 Account（SaaS 多租戶）              │
              └───┬──────────────────────────┬───────────────────┘
                  │ 商業帳號軌（官方 API）        │ 個人帳號軌（Phase 4, 高風險）
                  ▼                            ▼
   ┌──────────────────────────┐   ┌────────────────────────────────────┐
   │ WhatsApp Cloud API        │   │ beeper/chatwoot 橋                  │
   │ Messenger / IG (Meta)     │   │   ▲                                 │
   │ LINE Messaging API        │   │ Matrix homeserver (Synapse)         │
   │ Telegram Bot API          │   │   ▲                                 │
   │ Email IMAP/SMTP           │   │ mautrix-whatsapp / -meta / -twitter │
   └──────────────────────────┘   └────────────────────────────────────┘
```

### 為什麼用 Chatwoot 而非自建
- 既有 stack 已是 Docker + Postgres + Redis（Supabase/n8n），Chatwoot 同棧，運維熟悉。
- 多租戶原生：完美對應「自用/客戶/產品」三維度，不必自寫 RBAC 收件匣分層。
- 開源 self-host，資料留在自家 EU VPS，符合既有「資料主權」慣例。

### 與既有系統的銜接（重用，不重造）
- **入口**：在 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/` 新增一張「統一收件匣」卡片/路由，deep-link 或 iframe 嵌 Chatwoot（後續 Phase 可做 SSO）。參考既有 `app/ops/integrations/page.tsx` 的整合面板模式。
- **密鑰**：各平台 token 走既有 vault（`scripts/secrets-vault.ps1` / `mcp/user-env.ps1`），**禁止硬編**，與 `tenant_integration_bindings` 模式一致。
- **告警/事件**：Chatwoot webhook 可接回既有 ops-inbox notify dispatcher（`lib/ops-inbox/notify/`），讓「漏回客訊」也能進告警體系。
- **部署規範**：新增可部署服務 → 必須走 AGENTS.md「新部署路徑強制清單 6 項」（healthcheck / smoke / rollback runbook / 通知 / typecheck gate）。Chatwoot 用官方 image，重點落在 compose healthcheck + smoke + rollback runbook。

---

## 三維度（自用 / 客戶 / 產品）如何用同一套 Chatwoot 實現

| 維度 | Chatwoot 對應 | 說明 |
|---|---|---|
| AwareWave 自用 | 一個自家 Account，多個 Inbox | 自家品牌的 WA/IG/LINE/Email 集中管 |
| 代客戶管理 | 每客戶一 Account 或 Team | agency 坐席跨客戶切換；沿用既有 organizations/client 概念 |
| 做成產品賣 | 每客戶一獨立 Account（多租戶 SaaS） | 客戶自助登入、自接自己的 channel；計費另議 |

三者共用同一 Chatwoot 實例即可；差別只在 Account/Team 切分與權限，不需三套系統。

---

## X(Twitter) 的處理建議（唯一紅燈）

- **不納入即時統一收件匣**（技術天花板：Account Activity API = $42K/月）。
- 若仍要「在同介面發 X / 回覆特定 DM」：用 X pay-per-use API（$0.015/則）做**單向旁路**，可放進 next-admin 既有 `app/api/content/`（已有社群 syndication）而非 Chatwoot inbox。
- 個人 X DM（mautrix-twitter）= 🔴 最脆弱，建議**不做**。

---

## AI 自動客服層（餵全部資料 → 自動回覆）

在 Chatwoot 之上**疊一層 AI**：自動讀客訊 → 查你餵的知識庫 → 自動回覆，答不出來轉真人。兩條路：

### 方案 A：Chatwoot 內建 Captain（AI Agent）
- 原生功能：Assistant（自動回客 + 卡住轉真人）、Co-Pilot（替坐席草擬/翻譯）、Smart FAQs（找知識庫缺口）、Memories（記每位客戶上下文）。學你的 help center / 過往對話 / FAQ。
- **關鍵限制**：
  - **自架免費版（Community Edition）不含 Captain**。Captain 只在**付費自架（Premium Support / Enterprise，~$19/agent/月）**或雲端方案。
  - 底層用 **OpenAI GPT**（不是 Claude），品牌語氣/模型掌控度較低。
  - 用量計 credit（雲端每月附 300–800，超出 $20/1,000 credit）。
- 適合：要最省工、不想自己寫整合。

### 方案 B：自接 Claude + RAG（建議）
- Chatwoot webhook 把進站客訊丟給你自己的服務 → Claude 讀「你餵的全部資料」（產品/SOP/客戶知識庫，做成向量檢索 RAG）→ 生成回覆 → 經 Chatwoot API 回覆客戶。
- **為什麼建議**：
  - next-admin 已內建 **Anthropic SDK**，直接重用，不必另接 GPT。
  - 向量庫用既有 **Supabase（pgvector）**，不必新增基礎設施。
  - 模型、提示詞、品牌語氣、護欄全在你手上；多租戶資料隔離自己控；省 Captain 的 per-agent/per-credit 費用。
- 代價：要寫整合（webhook 接收 + RAG 檢索 + 回覆 + 人類交接邏輯）。

### 「餵全部資料」要處理的事（新需求，務必納入）
1. **資料來源盤點**：哪些餵 AI（產品文件 / 客服 SOP / 過往對話 / 客戶資料），怎麼整理成知識庫。
2. **RAG 管線**：文件切塊 → 向量化 → 存 Supabase pgvector → 檢索注入提示。
3. **護欄（critical）**：禁止亂答/編造；信心不足或敏感問題（退款/個資/法律）**強制轉真人**；輸出格式與品牌語氣約束。
4. **多租戶隔離**：自用 / 各客戶的知識庫與對話**嚴格隔離**，A 客戶的 AI 不得讀到 B 的資料（對應 Chatwoot Account 分層 + RAG 依租戶分 namespace）。
5. **隱私/合規**：自動處理客戶私訊牽涉 GDPR/個資；餵資料前確認可用範圍、保留期限、客戶同意。
6. **人類交接**：AI 回覆要可被坐席接手、可關閉、可審核（避免全自動失控）。

---

## 分期落地路線（Roadmap，本次不實作）

| Phase | 內容 | 帳號軌 | 風險 | 外部前置 |
|---|---|---|---|---|
| **0. 決策 & 選址** | 確認 VPS 放哪（資源見 §風險）、域名、備份策略 | — | Low | — |
| **1. Chatwoot 上線** | Docker Compose 自架 + healthcheck + smoke + rollback runbook；接 **Email + Telegram**（最快、無商業驗證門檻） | 商業 | Low | 無 |
| **2. Meta 三平台** | WhatsApp Cloud API + Messenger + Instagram | 商業 | Med | Meta Business 驗證、App Review（數天～數週） |
| **3. LINE** | LINE 官方帳號 + Messaging API channel | 商業 | Low | LINE 官方帳號申請 |
| **4. 個人帳號軌（高風險，自用限定）** | Matrix(Synapse) + mautrix-whatsapp/-meta + beeper/chatwoot 橋 | 個人 | **High** | 需獨立 IP/實驗環境；明確接受 ToS/封號風險 |
| **5. AI 自動客服層** | 建議走 Claude+RAG（webhook + Supabase pgvector + 護欄 + 人類交接）；或付費 Captain | 兩者 | Med | 知識庫資料整理 + 護欄/隔離設計 |
| **6. 產品化（選配）** | 多租戶開放、客戶自助接 channel、計費、SSO | 商業 | Med | 商業模式確認 |
| **(旁路) X** | pay-per-use 單向發文/回覆，掛 next-admin content | 商業 | Med | X developer 付費 |

每個 Phase 完成 DoD：服務 healthcheck 綠 + 一條真實訊息端到端收發驗證（REALTEST_EVIDENCE）+ WORKLOG。

---

## 風險清單

1. **VPS 資源**：Chatwoot 建議 8GB RAM / 4 vCPU（Sidekiq 吃記憶體）。EU `cpx32`（8GB/4vCPU）已跑 Supabase + n8n + Trigger.dev 等 → **可能不夠**。**決策點**：① 開獨立 VPS 給 Chatwoot（最穩）② EU 升級規格 ③ 共用但加 swap 並監控。建議 ①。
2. **個人帳號軌 ToS/封號**：WhatsApp/Meta/X 都禁第三方 client；VPS IP 放大封號機率；mautrix-twitter 隨 X 改 API 隨時壞。→ 只給自用、明確風險告知、**不**進客戶產品。
3. **X 即時 DM 不可行**：已是平台天花板，非工程問題，計畫已繞開。
4. **Meta App Review 工期**：WhatsApp/Messenger/IG production 需審核，數天到數週，屬外部依賴，需提早送件。
5. **資料隱私/合規**：聚合客戶私訊牽涉 GDPR/個資；產品化前需隱私政策與資料處理協議（DPA）。
6. **維護負擔**：個人帳號軌（Matrix + 3 bridges + 橋）是長期維運包袱，與 30 年穩定原則衝突 → 嚴格隔離為實驗線。

---

## 驗證計畫（實作階段每 Phase 適用，本次計畫階段不執行）

1. **實測（REALTEST）**：每接一個 channel，從該平台發一條真實訊息 → 確認進 Chatwoot inbox → 回覆 → 確認對方收到。記 `REALTEST_EVIDENCE`。
2. **健康檢查**：Chatwoot compose `healthcheck` + `/api` smoke curl；接回既有 `/health`、smoke-test 體系。
3. **Review**：Chatwoot 設定（webhook URL、token 來源走 vault 非硬編）讀回確認。
4. **抓蟲**：grep 既有 next-admin 是否有重複的 messaging 入口造成混淆；確認 ops console 入口連結正確。
5. **WORKLOG**：每 Phase 記根因/步驟/驗證。

---

## 待你拍板的決策點（實作前）

1. **VPS 放哪**：獨立新 VPS（建議）／ EU 升級 ／ EU 共用加 swap？
2. **個人帳號軌做不做**：考量封號與維護，是否只先做商業軌、個人軌延後或放棄？
3. **X**：接受「不進統一收件匣、僅旁路發文」還是整個略過？
4. **Phase 1 起點**：先 Email + Telegram 打通端到端（最快見效）對嗎？
5. **AI 自動客服**：走自接 Claude+RAG（建議，重用既有 SDK+Supabase）還是付費 Chatwoot Captain？知識庫資料來源有哪些？

---
