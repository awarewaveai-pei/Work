---
name: project-wp-plugin-autoinstall
description: "WP Plugin Auto-Install system — current progress, done items, and pending deploys"
metadata: 
  node_type: memory
  type: project
  originSessionId: 756d4be6-ee4e-40e4-aff0-4378180ff2da
---

## 已完成（全部 commit + push to main）

- `wp-plugin-stack-catalog.ts` — 純加法包模型（base 必裝 + ecommerce/tourism/brand checkbox）、LiteSpeed `condition` 欄位、跨模組 slug dedup、`resolveConditionalPlugins`、`resolvePaidPluginsForPacks`
- `wp-install-plugins.ts` — 改用 `ssh2` npm（不再需要系統 `ssh` binary）、私鑰直接傳內容不寫暫存檔、`--force --skip-plugins`、per-client vault key 解析
- `OnboardWizard.tsx` Step2 — 純加法勾選 UI（基礎包 + 3 個 addon checkbox）
- `OnboardWizard.tsx` Step4 — 每個服務各自一張卡片（Sentry/PostHog/Uptime Kuma/n8n/GitHub/Trigger.dev/Supabase），Hint 欄位嵌在對應卡片內，placeholder 顯示自動衍生值，全選/全部取消按鈕
- `apps/wordpress/Dockerfile` — 加入 WP-CLI v2.11.0（必須重建 lobster-wordpress container 才生效）
- `packages/workflows/package.json` — 加入 `ssh2 ^1.16.0`

**Why:** Why: operator 在 OnboardWizard 選好外掛包後，系統透過 Trigger.dev + WP-CLI 一鍵 SSH 安裝外掛到客戶主機。

## 待做（下次開工必做）

1. **`/sg-deploy`** — 重建 SG VPS 的 `lobster-wordpress` container（Dockerfile 新增 WP-CLI，不部署就沒有 WP-CLI）
2. **Trigger.dev re-deploy** — `packages/workflows` 加了 `ssh2`，需要 `trigger deploy` 到 EU 讓新 task image 含 ssh2
   - 用 `trigger-deploy-agent` 或 `.\scripts\lobster-trigger-deploy.ps1`
   - 需要 vault key: `TRIGGER_DEPLOY_PAT`（`tr_pat_*`）
3. **Smoke test** — 跑一次 Step4 的 provision-services flow，確認 7 個服務卡片 UI 正確，hint 欄位 disabled 狀態正常

## How to apply

下次 AO-RESUME 時，在「目前進度」區塊提醒：WP plugin install 系統主要邏輯已完成，但 sg-deploy（WordPress 重建）和 Trigger.dev re-deploy 還沒跑，外掛一鍵安裝實際上還不能用。
