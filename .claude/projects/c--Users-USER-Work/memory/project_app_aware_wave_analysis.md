---
name: project-app-aware-wave-analysis
description: 2026-06-04 徹底讀完 app.aware-wave.com 全部程式碼後的系統分析與問題清單
metadata:
  type: project
---

## 系統全貌（2026-06-04 全讀）

app.aware-wave.com = Lobster Factory Admin Console，Next.js 15 + React 19，部署在 SG VPS Docker container `lobster-next-admin`。

### 已徹底讀完的範圍
- 全部 6 個 webhook routes + normalizers
- 全部 AI 模組（claude/gemini/quotaGuard/triggerAutoClassify）
- 全部 Repair Center（service/policy/backup/github/ssh/run-state）
- 全部 Command Plane（11 個 handlers + router + policy + killSwitch）
- 全部 UI 頁面 + 元件（inbox/repairs/clients/approvals/system-modes/integrations/build/onboard）
- 全部 API routes（~40 個）
- docker-compose.yml、nginx/default.conf、Dockerfile

### 關鍵架構資訊
- **Auth**：middleware.ts 攔截 `/api/ops/*` + `/ops/*`，production 下需要 `x-ops-proxy-auth` header，nginx 沒注入
- **Supabase client**：read（anon key）+ write（service role key），`getSupabaseServerClient()` 優先 write
- **Webhook auth**：Bearer `OPS_INBOX_INGEST_TOKEN`，timing-safe HMAC-SHA256
- **DB SSOT**：EU VPS Supabase，35 個 migrations（0001-0035）
- **Repair pipeline**：detected → triage_needed → backing_up → approved → repairing → pr_ready → deploy_pending → deploying → resolved
- **Command Plane**：Telegram 11 個指令，policy engine 硬擋 high/critical from telegram

## 12 個邏輯與操作問題（需改）

1. **Auth production 預設 403** — middleware 要求 `x-ops-proxy-auth`，nginx 沒注入，整個 admin 在 production 對瀏覽器不可用
2. **WpUpdateButtons 用了 Tailwind 但 app 無 Tailwind** — 所有 wave1/2/3 按鈕完全無樣式
3. **Ops Inbox = Incident Engine** — 同一個頁面（`/ops/inbox`），側欄三個不同名稱，Dashboard 又叫 "Ops Inbox"
4. **兩個 Onboarding 入口** — `/onboard`（OnboardWizard）和 `/ops/onboarding` 做同樣的事，使用者不知用哪個
5. **Repair Center 佇列邏輯錯誤** — incident 有任何 repair_run（含已結案）就從佇列消失，無法重啟
6. **GitHub webhook 不處理 PR 棄案** — PR closed but not merged → repair_run 永遠卡在 pr_ready
7. **`/api/ops/repairs/health` 每次 GET 做真實 SSH** — 每次頁面載入 SSH 進 SG+EU，極重
8. **Approvals 頁面幾乎永遠空** — `/normal_mode` 被 policy 硬擋不進佇列，解 Kill Switch 路徑跟 Approvals 無關
9. **Incident 詳情頁 label 寫死 "Gemini auto-summary"** — 實際主要 provider 是 Claude Haiku
10. **沒有任何即時更新** — 所有操作頁面需手動重整，只有 Build Console poll 和 OpsInboxBadge 30s poll
11. **Ops Console 是孤兒頁面** — 重複 Clients + Build Console 資料，AI image jobs 功能未完成
12. **Ops Inbox → Repair Center 單向導覽** — Inbox 詳情頁沒有「啟動修復」按鈕

**Why:** 2026-06-04 花一整天全讀 codebase，這是要下班前記錄的分析結果。
**How to apply:** 筆電 session 繼續時，直接從這 12 個問題開始規劃修復，不用重新讀 code。
