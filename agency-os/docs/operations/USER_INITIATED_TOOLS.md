# 需要你主動說的工具（23 個）

> 這些工具沒有自動觸發條件，需要你明確說出意圖才會啟動。
> 其他所有工具（~80 個）由 Hook / AO 生命週期 / 我的情境判斷自動處理。
> Last updated: 2026-06-03

---

## 一、High-risk 需要你說 go（3 個）

我會自己準備好並告知，但最後一步需要你確認。

| 工具 | 功能 | 你要說什麼 |
|-----|------|----------|
| `/sg-deploy` | 部署 SG VPS（lobster-phase1：WordPress / Node API / Next Admin）| 「部署」「deploy」「推上去」「可以上了」「go」— 我會先跑 `/check-drift` + `/verify` 確認安全後提議，你說 go 才執行 |
| `/sg-reboot` | 安全重啟 SG VPS `5.223.93.113`（含 pre/post-flight 檢查）| 「重啟 SG」「SG reboot」— 我會跑 pre-flight 確認，你再確認一次才執行 |
| `/eu-reboot` | 安全重啟 EU VPS `204.168.175.41`（含 pre/post-flight 檢查）| 「重啟 EU」「EU reboot」— 同上 |

---

## 二、需要你的意圖才能啟動（5 個）

這些任務需要你提供目標，我無法自己發明。

| 工具 | 功能 | 你要說什麼 |
|-----|------|----------|
| `/tomo` | 建立跨 session carry-over packet，把今天的工作脈絡保存到明天 | `/tomo <hint>`，例：`/tomo 正在做 onboarding portal，API 還沒接完` |
| `/client-onboarding` | 新客戶上線 Ops Dashboard（建 Supabase 組織、設 client_config、存 SSH key）| 「幫我上線新客戶」「新增客戶 XXX」|
| `/build-tenant` | Lobster Factory 佈建新租戶（建 GitHub repo / Sentry / PostHog / Supabase schema / n8n workflow）| 「幫我佈建新 tenant XXX」「build tenant」|
| `posthog-analyst` | 查 PostHog 數據：events / funnel / retention / feature flag 分析（唯讀）| 「看一下轉換率」「有人用 XXX 功能嗎」「PostHog 數據怎樣」|
| `site-builder` | 與 `/build-tenant` 相同，透過 Agent 工具執行 | 「provision new client」「建立租戶」|

---

## 三、工具設定類（需要你有具體需求）（13 個）

你遇到這些情境時說，我馬上處理。

### Code 品質

| 工具 | 功能 | 你要說什麼 |
|-----|------|----------|
| `simplify` | 審查最近改動的 code，找重複/冗餘/可簡化的地方並直接修 | 「幫我簡化這段」「code 太複雜了」「simplify」|
| `level-check` | 稽核專案是否符合 5 Levels of Claude Code 框架，自動修補缺口 | 「check 一下 level」「level check」「專案架構稽核」|
| `fewer-permission-prompts` | 掃描 transcript，把常見的唯讀操作加進 allowlist，減少 permission prompt | 「permission 問太多了」「幫我減少 allow prompt」|

### 自動化設定

| 工具 | 功能 | 你要說什麼 |
|-----|------|----------|
| `update-config` | 修改 `settings.json` / hooks，讓某個行為自動化（「從現在開始每次 X 就做 Y」）| 「從現在開始每次改 `.ts` 都提醒我跑 tsc」「允許 npm 指令不用問」|
| `loop` | 以固定間隔重複執行某個指令或 skill | 「每 5 分鐘跑一次 /health」「loop 30m /signals」|
| `schedule` | 建立排程 remote agent（cron 式，固定時間自動執行）| 「每天早上 8 點跑 /smoke-test」「排程每週一 /wp-maintenance」|

### 開發工具

| 工具 | 功能 | 你要說什麼 |
|-----|------|----------|
| `claude-api` | 建立 / 除錯 / 優化使用 Anthropic SDK 的程式（含 prompt caching / tool use / batch）| 開始寫用到 `anthropic` / `@anthropic-ai/sdk` 的程式時自然觸發；或說「幫我用 Claude API 做 XXX」|
| `run` | 啟動這個專案的 app 並觀察行為，確認改動有沒有 work | 「跑起來看看」「run the app」「確認一下這個改動有沒有問題」|
| `init` | 新專案初始化（建 Claude Code 基礎設定、CLAUDE.md、AGENTS.md 結構）| 「初始化新專案」「新 repo 設定一下」|

### 環境設定

| 工具 | 功能 | 你要說什麼 |
|-----|------|----------|
| `keybindings-help` | 自訂 Claude Code 快捷鍵（`~/.claude/keybindings.json`）| 「幫我改快捷鍵」「rebind ctrl+s」「加一個 chord shortcut」|
| `statusline-setup` | 設定 Claude Code status line 顯示內容 | 「設定 status line」「改一下底部狀態列」|

---

## 四、稀有但需要你說的（2 個）

| 工具 | 功能 | 你要說什麼 |
|-----|------|----------|
| `/audit-cross-machine-bom` | 稽核走 Google Drive 同步的 `.md` 是否有 UTF-8 BOM，防止跨機 CJK 亂碼 | 「跑 bom 稽核」「audit-cross-machine-bom」— 通常在 CREDENTIALS.md 或 memory 檔案出現亂碼時需要 |
| `ADD-PERIODIC-HEALTH-CHECK.md` | 新增週期性健康檢查的 SOP runbook | 「我要新增一個健康檢查」「參考 runbook 加一個 cron 監控」|

---

## 快速備忘

```
你說「go」系列（3）：    sg-deploy / sg-reboot / eu-reboot
你給目標系列（5）：      tomo / client-onboarding / build-tenant / site-builder / posthog-analyst
你有需求再說（13）：     simplify / level-check / fewer-permission-prompts /
                        update-config / loop / schedule /
                        claude-api / run / init /
                        keybindings-help / statusline-setup /
                        fix-sidebars（sidebar 壞了）/ tool-expert（工具鏈問題）
稀有（2）：              audit-cross-machine-bom / ADD-PERIODIC-HEALTH-CHECK
```
