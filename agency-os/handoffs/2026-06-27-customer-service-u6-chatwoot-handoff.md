# 全自動客服系統 — U6 Chatwoot 接手包（8 月回來直接照做）

**建立於：** 2026-06-27
**狀態：** U0–U5 + 操作 UI **已上 prod 並 live 驗證**；U4 widget 程式碼完成；**只剩 U6 Chatwoot**，卡在「操作者買二手 dedicated」（7 月出國、8 月回來再辦）
**給誰讀：** 8 月回來的**冷啟動 session**（你或新 AI，無本次對話記憶）。讀完本包 + 下方 SSOT，即完全掌握、可直接動工。

---

## 一句話現況

**AI 自動客服的「大腦」全部建好且活在 production**（餵知識→向量化→意圖→自動回的引擎、操作介面、CIS 都驗過）。**唯一缺的是「耳朵」= Chatwoot 收件匣**（接 LINE/IG/FB/WhatsApp/Telegram/Email 進站訊息）。買一台機器裝 Chatwoot + 接線，就端到端通。

## 已完成（別重做！）

| 單元 | 狀態 | 證據 |
|---|---|---|
| U0 資料地基 migration 0051（8 表+pgvector+RPC）| ✅ **已 apply EU prod** | psql 驗 8表/8RLS/RPC |
| U1 cs-engine `lib/cs/`（護欄→分類→RAG→生成→supervisor→雙軸自主）| ✅ | tsc0/vitest/critic |
| U2 CIS「品牌識別」tab（重用 brandColors+BrandVoiceProfile）| ✅ prod | — |
| U3 客服 tab + 頂層 section + kill-switch | ✅ prod | — |
| U5 eval/護欄 harness | ✅ | vitest |
| 操作 UI（餵知識+建意圖 CRUD）| ✅ **prod live 實測**：餵知識→`embed_dim=1536` 進 pgvector | 瀏覽器+psql 閉環 |
| U4 headless 清新自然 widget | 🟡 **程式碼完成**（`lib/cs-widget/` 6 檔 + demo `/cs-widget`）等 U6 接 | tsc0/vitest49 |

> 部署在 **SG `lobster-next-admin`**（5.223.93.113），讀 **EU Supabase**（204.168.175.41）的 cs_* 表。`OPENAI_API_KEY` 已在容器（embeddings 可用）。

## 唯一剩的事 = U6 Chatwoot（買機 → 裝 → ★接線）

**步驟（搬家細節 SSOT = `runbooks/HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md`）**：
1. **買機**（操作者刷卡）：i7-7700 / 64GB / **2×512GB SSD（絕不 HDD）** / ~€48.70月 / FSN — 見 runbook **§0b**
2. **裝 OS + RAID 1 + SMART**（runbook §3）—— ⚠️ **順序坑**：RAID 1 = 開機進 **Hetzner `rescue` → `smartctl` 先驗兩碟健康（壞碟趁早換）→ `installimage` 選 RAID 1（會清碟重裝 OS，不是在活 OS 上加）→ reboot → `cat /proc/mdstat` 看 `[UU]`**。SSH 硬化（key-only/ufw/fail2ban）+ 裝 Chatwoot 都在 RAID OS 起來**之後**才做。別先 ssh 進預設 OS 驗機/硬化——那個 OS 會被 installimage 蓋掉。
3. **裝 Chatwoot Community**（docker-compose，greenfield，零搬遷風險）+ 走「新部署 6 項」（healthcheck/smoke/rollback/notify/typecheck）
4. **★ 接線（讓 Chatwoot 接上已建好的 AI 大腦 —— 這是 U6 真正的工）**：見下「接線步驟」
5. EU 服務之後照 runbook §5 一台台搬 → 退雲端兩台

## ★ 接線步驟（U6 程式工，目前還沒寫，回來要建）

讓 Chatwoot 進站訊息 → 觸發已建好的 `handleInbound` → 回覆：

1. **Chatwoot 端**：建一個 **API inbox** + 註冊 **AgentBot**（Super Admin），webhook URL 指向 next-admin。
2. **next-admin 端（新建 1 個 route）**：`app/api/cs/chatwoot-webhook/route.ts` —— 驗 `X-Chatwoot-Signature`(HMAC) → 解析 `message_created` → 組 `InboundMessage`（8 欄，Chatwoot payload 直接對映：organizationId 由 inbox→tenant 查表、conversationId/messageId/contactRef/channel/conversationStatus/text 來自 payload）→ **呼叫 `handleInbound`（已存在 `@/lib/cs`，回傳 `CsDecision`）** → 讀 `decision.replyText` + `decision.action`：**自動回覆**就把 `replyText` 經 Chatwoot API POST 回 + 設對話狀態；**handoff/suppressed** 留給真人（`pending` 不動 / assign）。
   - ⚠️ **不要在 route 再寫 `cs_ai_replies`** —— `handleInbound` 內部已寫（`orchestrator.ts` persist() → recordReply → `lib/cs/db.ts:187` `cs_ai_replies.upsert`）。route 重寫 = 重複。
   - `cs_action_log`（migration 0051:183）表存在但**目前零 writer**，Telegram/Email 自動回 MVP 用不到；要記 tool 行動再接，不是 route 的必做。
   - **冪等鍵 = Chatwoot message id**：webhook 會重送 → 必須把它放進 `InboundMessage.messageId`（type 註解明寫 idempotency key），否則同一則回兩次。
   - **靜音規則已在 brain**（`isFromAgent` / `conversationStatus==="open"` → `suppressed`）→ route 不用自己過濾。
   - `handleInbound` 已含 kill-switch、雙軸自主、護欄、RAG、supervisor —— **不要重寫，只要接上**。
3. **widget 端（改 1 行）**：`app/cs-widget/page.tsx` 把 `new MockTransport()` 換成 `new ChatwootTransport(config)`（`ChatwootTransport` 已寫好在 `lib/cs-widget/chatwoot-transport.ts`），`config` 帶真實 `baseUrl`(Chatwoot host) + `inboxIdentifier`。
4. **設定**：Chatwoot baseUrl + 每租戶 inbox identifier 存哪（建議 `client_config` JSONB，沿用 CIS 慣例）。
5. **驗證**：從 Telegram/Email 發一則真實訊息 → 進 Chatwoot → 觸發 webhook → AI 回 → 確認對方收到（REALTEST_EVIDENCE）。

> widget 接線注意（critic 已標，已在 chatwoot-transport.ts 處理）：`content_attributes.items` 解包、`reject_subscription` 清 stale token、WS `onclose` 自動重連（Minor，待補）。

## 8 通道現實（別誤會「全部都能即時收」）

| 可即時收件匣（Chatwoot）| 不行 |
|---|---|
| Email / Telegram / WhatsApp / Messenger / Instagram / LINE | **X(Twitter)**：即時 DM 需 ~$42K/月，**不可**（只能 Postiz 單向發文）；**Threads**：Chatwoot 無支援，**接不了** |

各通道要**操作者本人辦商業帳號**（WhatsApp/Meta/LINE 驗證，需企業身分，AI 代辦不了）。最快見效：先接 **Telegram + Email**（免商業驗證、當天通）。

## SSOT 指標（讀這些就懂全部）

- **執行細節**：`agency-os/docs/Customer_service/Customer_service_BUILD_PLAN.md`（U0–U6/順序/§5 逐單元證據/U6 接線）
- **設計**：`Customer_service_automation_plan.md` v2.1（§3 控制流、§18 widget、§0 D1–D12 決策）
- **頂規競品依據**：`_competitive_research.md`｜**清新自然 UX + CIS**：`_uiux_design.md`（§2.6/2.7 CIS、§3 widget headless 架構）
- **搬家/買機/RAID/還原**：`runbooks/HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md`（**§0b** 決策、§3 RAID、§5 遷移、§7 checklist）
- **主紀錄**：`agency-os/WORKLOG.md` 2026-06-27 `feat(cs)` 條目

## 回來第一步（建議）

1. 讀本包 + BUILD_PLAN §3/§5 + runbook §0b → 30 秒掌握
2. 操作者下單買機（§0b 規格）→ 給 IP+root
3. 照 runbook §3 設 RAID → 裝 Chatwoot → 接線（上方 5 步）→ 先打通 Telegram/Email 端到端
4. **無新機也能先推進的唯一項**：runbook §7「補第二異地（R2 二 bucket / Storage Box）取代 SG-offsite」

## 雜項

- prod `awarewave-ops` 有 1 筆測試知識 +1 個測試意圖（標題含「【測試】」、`order_status`），可由客服分頁 × 刪。
- 軟體層（cs-engine/UI/widget）全綠，**不需要再改**；U6 純粹是「裝 Chatwoot + 接線 + 各通道辦帳號」。
