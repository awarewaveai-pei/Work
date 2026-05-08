# AwareWave 自動告警維修系統 — 完整計劃書

**版本**：v3.2 Final（含多客戶擴展 + Dashboard + 備份路徑統一）
**日期**：2026-05-08
**狀態**：待執行

---

## 一、這份文件是什麼

這是一份完整的施工計劃書，讓 Sentry / Uptime Kuma / Netdata 偵測到問題後，AI 自動幫你修，你只需要在手機 Slack 上按兩下。

**你的角色**：看通知 → 按 Approve → 看摘要 → 按 Merge → 打 `/sg-deploy`。其餘全自動。

**這份文件可以直接交給 Claude Code 執行。**

---

## 二、你的現有架構（已確認，不可更動）

### 伺服器

```
SG 機 (5.223.93.113) — 應用層
├── lobster-next-admin (Next.js)   → app.aware-wave.com
├── lobster-wordpress              → aware-wave.com
├── lobster-node-api               → api.aware-wave.com
├── lobster-nginx                  → 反向代理
├── lobster-redis                  → 快取
└── lobster-wordpress-db (MariaDB) → WordPress 資料庫

EU 機 (204.168.175.41) — 資料 + 工作流
├── supabase-db (PostgreSQL)       ← P0 主資料庫（含 n8n database）
├── supabase-storage               ← container 在跑但無使用
├── trigger-postgres               ← Trigger.dev 獨立資料庫
├── n8n                            ← 工作流引擎
├── trigger-webapp                 ← Trigger.dev
└── uptime-kuma                    ← 網站監控
```

### 已有工具（不重做）

| 工具 | 狀態 | 備註 |
|------|------|------|
| GitHub Actions (4 個 workflow) | ✅ 運作中 | lobster-workflows-validate-main.yml, release-gate-main.yml, tenant-staging-ssot.yml, trigger-infra-config-guard.yml |
| CLAUDE.md | ✅ 有內容 (10605 bytes) | 追加規則，不覆蓋 |
| system-health-check | ✅ 有 100% PASS 紀錄 | 整合，不重寫 |
| rollback-phase1.sh + rollback.log | ✅ 有實際使用紀錄 | 整合，不重寫 |
| BACKUP_RESTORE_PROOF 模板 | ✅ 存在 | 延用 |
| backup-eu-stack.sh (02:30 UTC) | ✅ 運作中 | 整合，不重寫 |
| verify-backup-eu.sh (03:00 UTC) | ✅ 運作中 | 不動 |
| SG ↔ EU rclone sftp 互備 | ✅ 運作中 | 不動 |
| Hetzner 自動 backup image | ✅ 運作中 | 不動 |
| Sentry | ✅ 有在收錯誤 | 需接 webhook |
| Uptime Kuma | ✅ uptime.aware-wave.com | 需接 webhook |
| Netdata | ✅ 已設定 | 需接 webhook |
| Slack workspace | ✅ 已有 #infra-alerts | 需建新頻道 + 設 App |
| Web ops console | ✅ app.aware-wave.com/ops | 高風險指令核准在這（不動）|
| sg-deploy.sh | ✅ 已有 | 整合，不重寫 |

### 不使用

| 工具 | 原因 |
|------|------|
| Telegram | 剛裝、無整合、多一個維護點 |
| n8n 做 Slack 中間層 | 直接用 Next.js route 更簡潔、少一個跳轉 |
| 自動 deploy on merge | 多一道人工關卡更安全（`/sg-deploy`）|

---

## 三、完整流程

```
1.  Sentry / Uptime Kuma / Netdata 偵測到問題
                    ↓
2.  Slack #alerts-critical 收到通知
    （問題摘要 + 嚴重度 + Approve 按鈕）
                    ↓
3.  ★ 你按「Approve — 叫 AI 修」           ← 你的第 1 下
                    ↓
4.  自動備份（SG WordPress DB + EU Supabase DB）
    備份失敗 → 停止，Slack 通知你「備份失敗，暫停自動修」
                    ↓
5.  備份成功 → GitHub Issue 自動建立
    Claude Code 開始分析 + 修 code + 開 PR
                    ↓
6.  CI 自動跑（已有的 4 個 workflow）
                    ↓
7.  Slack 通知你：PR 已開好
    你看中文摘要 + 綠勾
    ★ 你按 Merge                            ← 你的第 2 下
                    ↓
8.  ★ 你打 /sg-deploy                       ← 你的第 3 下
                    ↓
9.  sg-deploy.sh 自動部署 + health check
    失敗 → rollback-phase1.sh 自動還原
                    ↓
10. Slack 完成報告
    ✅ 成功：修了什麼、部署結果、備份 ID
    ⚠️ 失敗：已 rollback、請查看
```

### 你的三個動作

| 動作 | 在哪裡 | 什麼時候 | 風險 |
|------|--------|----------|------|
| 按 Approve | Slack 手機 | 看到告警時 | 低（只是叫 AI 去看） |
| 按 Merge | GitHub（從 Slack 點連結跳過去） | 看完中文摘要 + 綠勾 | 中（code 會進 repo） |
| 打 /sg-deploy | Slack 或 terminal | 確認要上線時 | 中（會更新 production） |

### 你不按的話

什麼都不會發生。網站維持原樣。那個 bug 還在但不會更壞。

---

## 四、三種告警的差別處理

### Sentry（程式碼 bug）→ 自動修

```
Sentry error
  → Slack 通知 + Approve 按鈕
  → 你按 Approve
  → 備份 → Claude 修 → PR → CI → 你 Merge → 你 /sg-deploy
```

AI 可以修的原因：Sentry 有 stack trace、檔案名、行號，通常是 code bug。

### Uptime Kuma（網站掛了）→ AI 只分析，不自動修

```
Uptime Kuma DOWN
  → Slack 通知 + Approve 按鈕
  → 你按 Approve
  → 備份 → Claude 只寫 triage 報告（可能原因 top 3 + 建議）
  → 只有確認是 code 問題才開 PR
  → 不確定 → 不開 PR，只貼分析
```

AI 不直接修的原因：網站掛可能是 DB、nginx、disk、DNS，不一定是 code。

### Netdata（基礎設施告警）→ AI 只分析，不修不開 PR

```
Netdata critical
  → Slack 通知（沒有 Approve 按鈕，只有「已讀」）
  → Claude 自動在 GitHub Issue 寫分析報告
  → 不開 PR、不修 code
```

AI 不碰的原因：CPU、RAM、disk 問題改 code 改不好。

---

## 五、四層保護機制（你怎麼知道 AI 修壞了）

### 第 1 層：CI 自動測試

```
✅ 綠勾 = 測試全過                 → 可以考慮 Merge
❌ 紅叉 = 測試沒過                 → 絕對不要 Merge（按鈕也是灰的）
```

### 第 2 層：AI 中文摘要

每個 PR 必須包含：

```
問題：[一句話]
原因：[為什麼壞]
修法：[怎麼修]
風險：[低/中/高]
建議：[可以 merge / 需要人工檢查 / 不建議 merge]
```

你的判斷口訣：

```
綠勾 + 風險低 + 建議 merge → 按 Merge
其他任何情況               → 不按
```

### 第 3 層：Health check（部署後自動）

sg-deploy.sh 部署後自動檢查：

```
app.aware-wave.com  → 200 OK？
aware-wave.com      → 200 OK？
api.aware-wave.com  → 200 OK？
```

全 OK → 完成。任何一個不 OK → rollback-phase1.sh 自動還原。

### 第 4 層：Sentry 持續監控

部署後 Sentry 繼續看。同一個 bug 又出現 → 再次告警 → 標記 `needs-human-review`（代表 AI 搞不定）。

---

## 六、備份策略

### 已有的備份機制（實查確認，不動）

```
SG 機 (5.223.93.113)：
  cron: /etc/cron.d/lobster-backup
  腳本: /root/lobster-phase1/scripts/backup-phase1.sh（每天 02:00 UTC）
  驗證: /root/lobster-phase1/scripts/verify-backup.sh（每天 02:30 UTC）
  目錄: /root/backups/（目前 400MB）
  保留: 7 天自動清理
  最舊檔案: 2026-05-07

EU 機 (204.168.175.41)：
  cron: /etc/cron.d/eu-backup
  腳本: /root/scripts/backup-eu-stack.sh（每天 02:30 UTC）
  驗證: /root/scripts/verify-backup-eu.sh（每天 03:00 UTC）
  目錄: /root/backups/（目前 66MB）
  保留: 7 天自動清理
  最舊檔案: 2026-05-08

另外：Hetzner 自動 backup image + SG ↔ EU rclone sftp 互備
```

### 本計劃新增的備份（pre-repair）

```
時機：你按 Approve 之後、AI 動手之前
  → SG: mysqldump lobster-wordpress-db → /root/backups/pre-repair-{id}-wp.sql.gz
  → EU: 觸發已有的 backup-eu-stack.sh（存到 /root/backups/）
  → 備份失敗 → 停止整條鏈，不讓 AI 動手
```

### 備份路徑統一

```
所有備份都存到 /root/backups/（SG 和 EU 各自的）
  → 已有的 7 天清理 cron 自動涵蓋
  → 不需要額外建清理機制
  → 不需要新目錄
```

### 備份命名格式

```
pre-repair-{YYYYMMDD}-{HHMM}-{source}-{id}-wp.sql.gz        （SG）
pre-repair-{YYYYMMDD}-{HHMM}-{source}-{id}-eu-supabase.sql.gz（EU，由 backup-eu-stack.sh 產生）

範例：
pre-repair-20260508-1430-sentry-58291-wp.sql.gz
```

### 備份驗證

沿用已有的 BACKUP_RESTORE_PROOF 模板、verify-backup.sh（SG）、verify-backup-eu.sh（EU）。

---

## 七、安全紅線（寫進 CLAUDE.md）

### Claude Code 絕對不能做

1. 不能改 `.env`、`.env.local`、`secrets/`、`*.key`、`*.pem`
2. 不能改 database migration（schema 變更必須人工審）
3. 不能改 auth、payment、user permission 邏輯
4. 不能改 nginx config、Dockerfile、docker-compose.yml
5. 不能執行 `rm -rf`、`DROP TABLE`、`TRUNCATE`、`DELETE FROM`（無 WHERE）
6. 不能用 try/catch 吞掉錯誤當作「修好了」
7. 改動超過 100 行必須拆成多個 PR
8. 修不好就說修不好，不要猜

### 必須標記 needs-human-review 的情況

1. 改了 API endpoint 的 response 格式
2. 改了 cron job 或排程邏輯
3. 涉及第三方 API 呼叫
4. 同一個 bug 第二次修
5. 影響超過 3 個檔案

### PR 格式要求

```markdown
### 給老闆看的（中文）

> **問題**：[一句話]
> **原因**：[為什麼壞]
> **修法**：[怎麼修]
> **風險**：[低/中/高] — [為什麼]
> **建議**：[可以 merge / 需要人工檢查 / 不建議 merge]
> **Incident ID**：[auto-YYYYMMDD-HHMM-source-id]

### 技術細節

- What changed and why
- Files modified
- Test coverage added

### Incident 結案

> **Root cause**：[根因]
> **Fix applied**：[修復內容]
> **Impact scope**：[影響範圍]
> **Monitoring period**：[建議觀察期，預設 48 小時]
```

### Incident 結案規範

所有告警/incident 處理完畢後，必須在 WORKLOG 寫結案紀錄。
沒有結案紀錄等於沒結案。

---

## 八、防重複 incident loop

同一個 error 在 30 分鐘內只觸發一次 Slack 通知。

實作方式：在 Next.js webhook route 裡用 fingerprint（error title hash）+ 時間戳做 dedup。

```
收到 Sentry webhook
  → hash(event.title) 作為 fingerprint
  → 查 Redis/memory：這個 fingerprint 30 分鐘內送過？
  → 送過 → 靜默，不通知
  → 沒送過 → 送 Slack + 記錄 fingerprint + timestamp
```

---

## 九、Slack 頻道與通知設定

### 頻道

| 頻道 | 用途 | 通知設定 |
|------|------|----------|
| #alerts-critical | Sentry error、Uptime Kuma DOWN、部署失敗 | 每則推播 + 聲音 |
| #alerts-info | 部署成功、備份完成、一般資訊 | 靜音 |
| #github-prs | Claude 開的 PR 通知 | 只有 @你 才響 |

### 勿擾時段

Slack 設定 → 勿擾：23:00 — 08:00
但 #alerts-critical 穿透勿擾。

### Slack 訊息格式（告警帶按鈕）

```
🚨 *Sentry Error*
*TypeError: Cannot read property 'email' of undefined*
嚴重度：error
檔案：src/auth/login.ts:42

[✅ Approve — 叫 AI 修]  [👀 只看不修]
```

---

## 十、技術實作細節

### 10-A. 告警 → Slack（在 Next.js 裡實作，不用 n8n）

#### Sentry webhook route

檔案：`app/api/webhooks/sentry/route.ts`（extend 已有的，不新建）

邏輯：
```
POST /api/webhooks/sentry
  → 驗證 Sentry webhook secret
  → 解析 event payload
  → fingerprint dedup（30 分鐘）
  → 格式化 Slack Block Kit 訊息（含 Approve 按鈕）
  → POST 到 Slack API
  → 回覆 200
```

#### Uptime Kuma webhook route

檔案：`app/api/webhooks/uptime-kuma/route.ts`（新建或 extend）

邏輯：
```
POST /api/webhooks/uptime-kuma
  → 驗證 secret
  → 解析 payload
  → DOWN → 送 #alerts-critical + Approve 按鈕
  → UP → 送 #alerts-info「✅ 恢復了」
```

#### Netdata webhook route

檔案：`app/api/webhooks/netdata/route.ts`（新建或 extend）

邏輯：
```
POST /api/webhooks/netdata
  → 驗證 secret
  → 解析 payload
  → critical → #alerts-critical（只有「已讀」按鈕，沒有 Approve）
  → warning → #alerts-info
```

### 10-B. Slack Approve callback → 備份 → GitHub Issue

檔案：`app/api/internal/commands/slack/route.ts`（新建）

邏輯：
```
POST /api/internal/commands/slack
  → 驗證 Slack signing secret
  → 解析 interaction payload
  → action_id == "approve_repair" → 繼續
  → action_id == "acknowledge_only" → 更新訊息加 👀 → 結束

  繼續：
  → 觸發備份：
      SSH SG: mysqldump lobster-wordpress-db | gzip > /root/backups/pre-repair-{id}-wp.sql.gz
      SSH EU: /path/to/backup-eu-stack.sh
  → 驗證備份：
      檔案大小 > 1KB？
      → 失敗 → Slack 回覆「備份失敗，暫停自動修」→ 結束
      → 成功 → 繼續

  → GitHub API: Create Issue
      owner: awarewaveai-pei
      repo: (repo name)
      title: 根據 alert source 選模板
      body: alert 資訊 + @claude
      labels: ["auto-repair", "{source}"]

  → Slack: 更新原始訊息
      「✅ 備份完成，已建 GitHub Issue #{number}，Claude 開始分析」
      移除按鈕（防重複按）
```

### 10-C. Claude Code GitHub Action

檔案：`.github/workflows/auto-repair-claude.yml`（新建）

```yaml
name: Auto-Repair — Claude Code

on:
  issue_comment:
    types: [created]
  issues:
    types: [opened]

jobs:
  claude-repair:
    if: |
      contains(github.event.issue.labels.*.name, 'auto-repair') &&
      contains(github.event.comment.body || github.event.issue.body, '@claude')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          claude_args: "--max-turns 10"

      - name: Notify Slack
        if: always()
        run: |
          STATUS="${{ job.status }}"
          if [ "$STATUS" = "success" ]; then
            MSG=":white_check_mark: Claude 分析完畢"
          else
            MSG=":warning: Claude 分析失敗，請人工查看"
          fi

          curl -X POST "${{ secrets.SLACK_WEBHOOK_URL }}" \
            -H 'Content-Type: application/json' \
            -d "{\"text\": \"${MSG}：#${{ github.event.issue.number }} ${{ github.event.issue.title }}\"}"
```

### 10-D. PR 通知到 Slack

檔案：`.github/workflows/auto-repair-pr-notify.yml`（新建）

```yaml
name: Auto-Repair — PR Notification

on:
  pull_request:
    types: [opened, ready_for_review]

jobs:
  notify:
    if: contains(github.event.pull_request.labels.*.name, 'auto-repair')
    runs-on: ubuntu-latest
    steps:
      - name: Notify Slack
        run: |
          curl -X POST "${{ secrets.SLACK_WEBHOOK_URL }}" \
            -H 'Content-Type: application/json' \
            -d '{
              "channel": "#github-prs",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": ":wrench: *Claude 修好了，等你 Merge*\n*${{ github.event.pull_request.title }}*\n<${{ github.event.pull_request.html_url }}|看 PR + 中文摘要>"
                  }
                },
                {
                  "type": "context",
                  "elements": [
                    {
                      "type": "mrkdwn",
                      "text": "確認：綠勾 + 風險低 + 建議 merge → 才按 Merge"
                    }
                  ]
                }
              ]
            }'
```

### 10-E. 部署 + Health Check + Rollback

不新建 deploy workflow。使用已有的 `sg-deploy.sh` + `rollback-phase1.sh`。

只需確保 sg-deploy.sh 包含以下邏輯（如果沒有，補上）：

```bash
# sg-deploy.sh 應有的邏輯

# 1. 部署
cd $DEPLOY_DIR
git pull origin main
docker compose pull
docker compose up -d --remove-orphans
sleep 15

# 2. Health check
for endpoint in "https://app.aware-wave.com" "https://aware-wave.com" "https://api.aware-wave.com"; do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$endpoint")
  if [ "$HTTP_STATUS" != "200" ]; then
    echo "FAIL: $endpoint returned $HTTP_STATUS"
    echo "Starting rollback..."
    bash rollback-phase1.sh
    # Slack 通知
    curl -X POST "$SLACK_WEBHOOK" -H 'Content-Type: application/json' \
      -d '{"channel":"#alerts-critical","text":"⚠️ 部署失敗，已自動 Rollback"}'
    exit 1
  fi
done

# 3. 成功通知
curl -X POST "$SLACK_WEBHOOK" -H 'Content-Type: application/json' \
  -d "{\"channel\":\"#alerts-info\",\"text\":\"✅ 部署完成，三個端點全部正常\"}"
```

### 10-F. 完成報告

部署完成後（不管成功失敗），Slack 收到完成報告：

**成功：**
```
✅ 維修完成報告
─────────────
結果：部署成功
時間：2026-05-08 14:30 UTC
Commit：abc1234
備份 ID：auto-repair-20260508-1430-sentry-58291
SG Health：✅ 通過
Incident ID：auto-20260508-1430-sentry-58291
[查看變更] [查看 PR]
```

**失敗：**
```
⚠️ 維修失敗報告
─────────────
結果：部署失敗，已自動 Rollback
時間：2026-05-08 14:30 UTC
Commit：abc1234
已還原到：上一版
備份 ID：auto-repair-20260508-1430-sentry-58291
[查看 Actions Log]
```

---

## 十一、GitHub 設定

### Secrets（repo → Settings → Secrets）

```
ANTHROPIC_API_KEY      = Claude Code API key
SLACK_WEBHOOK_URL      = Slack incoming webhook URL
SLACK_BOT_TOKEN        = Slack App bot token（發送互動訊息用）
SLACK_SIGNING_SECRET   = Slack App signing secret（驗證 callback）
```

### Branch Protection（repo → Settings → Branches → main）

- ✅ Require a pull request before merging
- ✅ Require approvals: 1
- ✅ Require status checks to pass（加入已有的 CI job names）
- ❌ 不開 Allow auto-merge
- ✅ Do not allow bypassing the above settings

---

## 十二、與已有系統的關係

### 不衝突清單

| 新增的 | 已有的 | 關係 |
|--------|--------|------|
| auto-repair-claude.yml | lobster-workflows-validate-main.yml | 不同觸發條件（issue vs push），不衝突 |
| auto-repair-claude.yml | release-gate-main.yml | 不同觸發條件，不衝突 |
| auto-repair-pr-notify.yml | tenant-staging-ssot.yml | 不同觸發條件，不衝突 |
| Slack Approve callback | Web ops console approve | 不同用途（code 修 vs ops 指令），各自獨立 |
| 備份 pre-repair | backup-eu-stack.sh 定期備份 | pre-repair 存到 /root/backups/，已有 7 天清理 cron 自動管 |
| health check in sg-deploy | system-health-check | 同一套邏輯，不重做 |

### 不重工清單

| 不做的事 | 原因 |
|----------|------|
| 不新建 CI workflow | 已有 4 個 workflow 會在 PR 觸發 |
| 不新建 deploy workflow | 已有 sg-deploy.sh |
| 不新建 rollback 腳本 | 已有 rollback-phase1.sh |
| 不新建備份腳本 | 已有 backup-eu-stack.sh |
| 不用 n8n 接 Slack | 直接在 Next.js 寫 route |
| 不用 Telegram | 剛裝、無整合、多一個維護點 |
| 不做 auto-merge / auto-deploy | /sg-deploy 手動觸發更安全 |

---

## 十三、執行計劃

### Phase 1：你做（30 分鐘）

| 步驟 | 動作 | 完成標準 |
|------|------|----------|
| 1.1 | 在 Slack 建 3 個頻道：#alerts-critical、#alerts-info、#github-prs | 頻道存在 |
| 1.2 | 設定各頻道通知偏好（critical 推播+聲音、info 靜音、prs 只@提及）| 手機通知設定完成 |
| 1.3 | 建立 Slack App：拿到 Bot Token + Signing Secret + Webhook URL | 三個值都拿到 |
| 1.4 | 在 GitHub repo 設定 4 個 Secrets：ANTHROPIC_API_KEY、SLACK_WEBHOOK_URL、SLACK_BOT_TOKEN、SLACK_SIGNING_SECRET | Secrets 頁面看到 4 個 |
| 1.5 | 設定 Branch Protection（main branch） | Protection rules 啟用 |

### Phase 2：Claude Code 做（2-3 小時）

| 步驟 | 動作 | 檔案 |
|------|------|------|
| 2.1 | Extend 已有 Sentry webhook route，加 fingerprint dedup + Slack Block Kit 訊息 | app/api/webhooks/sentry/route.ts |
| 2.2 | 新建或 extend Uptime Kuma webhook route | app/api/webhooks/uptime-kuma/route.ts |
| 2.3 | 新建或 extend Netdata webhook route | app/api/webhooks/netdata/route.ts |
| 2.4 | 新建 Slack callback handler（Approve → 備份 → GitHub Issue）| app/api/internal/commands/slack/route.ts |
| 2.5 | 新建 auto-repair-claude.yml | .github/workflows/auto-repair-claude.yml |
| 2.6 | 新建 auto-repair-pr-notify.yml | .github/workflows/auto-repair-pr-notify.yml |
| 2.7 | 確認 sg-deploy.sh 有 health check + Slack 通知 | sg-deploy.sh |
| 2.8 | 在 CLAUDE.md 尾部追加自動維修規則 + PR 格式 + 紅線 | CLAUDE.md |

### Phase 3：端到端驗收（1 小時）

| # | 測試步驟 | 預期結果 | ✅/❌ |
|---|----------|----------|-------|
| 1 | 手動在 Sentry 觸發 test error | Sentry 收到 | |
| 2 | 等 Slack #alerts-critical | 收到通知 + Approve 按鈕 | |
| 3 | 按「✅ Approve — 叫 AI 修」 | 按鈕消失，顯示「處理中」 | |
| 4 | 等備份 | Slack 顯示「備份完成」 | |
| 5 | 等 GitHub Issue | Issue 建立，有 auto-repair label | |
| 6 | 等 Claude Code Action | Action 開始跑 | |
| 7 | 等 PR | PR 建立 | |
| 8 | 看 PR 有中文摘要 | 有「問題/原因/修法/風險/建議」 | |
| 9 | 看 CI | 已有 workflow 跑 PR 觸發的測試 | |
| 10 | Slack #github-prs 收到 PR 通知 | 有 PR 標題 + 連結 | |
| 11 | 在 GitHub 按 Merge | PR merged | |
| 12 | 在 Slack 打 /sg-deploy | 開始部署 | |
| 13 | 等 health check | 三個端點都 200 | |
| 14 | Slack #alerts-info 收到完成報告 | 有結果 + 備份 ID + commit | |
| 15 | 在 Sentry 確認 test error 不再出現 | 錯誤消失或被 resolve | |

### Phase 3-B：驗收 rollback

| # | 測試步驟 | 預期結果 | ✅/❌ |
|---|----------|----------|-------|
| 16 | 故意部署一個壞的 commit | deploy 成功但 health check 失敗 | |
| 17 | 等 rollback | rollback-phase1.sh 自動執行 | |
| 18 | 等 Slack | #alerts-critical 收到「部署失敗，已 Rollback」 | |
| 19 | 確認網站正常 | 三個端點都 200（回到上一版）| |

### Phase 3-C：驗收備份失敗阻擋

| # | 測試步驟 | 預期結果 | ✅/❌ |
|---|----------|----------|-------|
| 20 | 暫時讓備份指令失敗（例如暫停 docker） | 備份失敗 | |
| 21 | 按 Approve | Slack 回覆「備份失敗，暫停自動修」 | |
| 22 | 確認沒有建 GitHub Issue | Issue 沒有被建立 | |

---

## 十四、Phase 4 — 觀察期（30 天）

### 每週日做（5 分鐘）

1. 打開 GitHub → 看本週的 auto-repair PR
2. 有沒有同一個 bug 修多次？有 → 需要人工介入
3. 有沒有 needs-human-review 標記的 PR？有 → 找人看
4. BACKUP_RESTORE_PROOF 最新一筆是什麼時候？超過 7 天 → 檢查備份系統

### 每月初做（10 分鐘）

1. 看 Hetzner Console → 最新 backup image 日期
2. 看 /root/backups/ 目錄 → 備份檔案有在長（SG 和 EU 都要看）
3. 看 GitHub Actions → auto-repair 相關的 action 有沒有異常失敗率

---

## 十五、Phase 5 — 多客戶擴展 + Dashboard（Phase 4 完成後做）

### 前置條件

Phase 1-3 跑通 + Phase 4 觀察期 30 天穩定，才開始 Phase 5。
不穩定就做多客戶 = 兩邊同時出問題 = 你不知道是哪邊壞。

### 你的多客戶現況

```
類型 A：幫不同客戶架獨立網站
  → 目前 2-3 個，以後會增加
  → WordPress 為主
  → 各自 Sentry project
  → 有些有 GitHub repo，有些只在 server 上

類型 B：app.aware-wave.com 上有不同客戶帳號
  → 同一個 repo，同一個 Sentry project
  → bug 可能只影響特定客戶
```

### 多客戶架構

```
                    app.aware-wave.com/ops/repairs
                         Dashboard（你看這裡）
                              ↑
                    supabase-db（incident 紀錄）
                              ↑
              ┌───────────────┼───────────────┐
              ↑               ↑               ↑
        AwareWave 自己    客戶 A 網站      客戶 B 網站
        (Next.js + WP)    (WordPress)      (WordPress)
        Sentry Project 1  Sentry Project 2  Sentry Project 3
        GitHub Repo ✅    GitHub Repo ✅    只在 Server ❌
```

### 資料庫設計（在 supabase-db 建表）

```sql
-- 客戶設定表：每個客戶一筆，新增客戶 = 加一筆
create table incidents_config (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,             -- '客戶A股份有限公司'
  client_slug text unique not null,      -- 'client-a'
  sentry_project text,                   -- Sentry project slug
  sentry_dsn text,                       -- Sentry DSN
  github_owner text,                     -- 'awarewaveai-pei'
  github_repo text,                      -- 'client-a-site'（可以為空）
  server_host text,                      -- '5.223.93.113'
  server_user text default 'root',
  site_url text not null,                -- 'https://client-a.com'
  health_check_url text,                 -- 'https://client-a.com/wp-json'
  auto_repair_enabled boolean default false,
  deploy_command text,                   -- '/client-a-deploy' 或 null
  backup_script_path text,              -- '/root/scripts/backup-client-a.sh' 或 null
  slack_channel text default '#alerts-critical',
  notes text,                            -- 備註
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Incident 紀錄表：每次告警一筆，從偵測到完成全程追蹤
create table incidents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references incidents_config(id),
  source text not null,                  -- 'sentry' / 'uptime_kuma' / 'netdata'
  severity text not null,                -- 'critical' / 'warning' / 'info'
  title text not null,                   -- 錯誤標題
  description text,                      -- 詳細描述
  sentry_url text,
  sentry_issue_id text,
  github_issue_number int,
  github_pr_number int,
  github_pr_url text,
  status text not null default 'pending',
    -- pending：剛進來，等你 Approve
    -- approved：你按了 Approve
    -- backing_up：正在備份
    -- backup_failed：備份失敗，流程停止
    -- fixing：Claude 在修
    -- pr_ready：PR 開好了，等你 Merge
    -- merged：你按了 Merge
    -- deploying：正在部署
    -- deployed：部署成功
    -- failed：部署失敗
    -- rollback：已自動還原
    -- resolved：手動標記解決
    -- ignored：你按了「只看不修」
  backup_id text,
  error_fingerprint text,                -- dedup 用
  approved_at timestamptz,
  fixed_at timestamptz,
  merged_at timestamptz,
  deployed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 索引：常用查詢
create index idx_incidents_client on incidents(client_id);
create index idx_incidents_status on incidents(status);
create index idx_incidents_created on incidents(created_at desc);
create index idx_incidents_fingerprint on incidents(error_fingerprint, created_at);
```

### 告警分流邏輯

```
Sentry webhook 進來
  → 從 payload 取出 sentry_project
  → 查 incidents_config：哪個客戶？
  → 找到 → 帶客戶名稱的 Slack 通知
  → 找不到 → 送 #alerts-info「未知 Sentry project，請檢查設定」

Slack 訊息格式：
  🚨 *[客戶A] Sentry Error*
  *TypeError: Cannot read property 'email' of undefined*
  嚴重度：error
  網站：https://client-a.com

  [✅ Approve — 叫 AI 修]  [👀 只看不修]
```

### 有 GitHub repo 的客戶 → 完整流程

```
跟 AwareWave 自己的流程一模一樣：
  Approve → 備份 → Claude 修 → PR → CI → Merge → deploy → 報告

差別只在：
  → GitHub Issue 建在那個客戶的 repo
  → 備份用那個客戶的 backup script
  → deploy 用那個客戶的 deploy command
  → health check 用那個客戶的 health_check_url
```

### 沒有 GitHub repo 的客戶 → 降級流程

```
  Approve → 備份 → Claude 只寫分析報告（不開 PR）
  → 報告貼在 Slack + Dashboard
  → 你手動修或找人修
  → 在 Dashboard 手動標記「已解決」

建議：逐步把客戶的 WordPress 放進 GitHub repo。
  一個一個搬就好，不急。搬完就能走完整流程。
```

### Dashboard 設計

位置：`app.aware-wave.com/ops/repairs`

功能：
```
1. 總覽面板
   → 本週告警數 / 已修數 / 待處理數
   → 按客戶分的餅圖
   → 平均修復時間

2. 待處理清單
   → 按時間排序
   → 每筆顯示：客戶名、錯誤標題、來源、時間、狀態
   → 可以直接按 Approve（呼叫同一個 Slack callback API）

3. 客戶篩選
   → [全部] [AwareWave] [客戶A] [客戶B] ...
   → 點一個客戶只看那個客戶的 incident

4. 歷史紀錄
   → 最近完成的修復
   → 修復成功率
   → 平均耗時
   → 可搜尋、可篩選日期

5. 客戶設定頁
   → app.aware-wave.com/ops/repairs/settings
   → 新增 / 編輯 / 停用客戶
   → 不用改 code，在網頁上操作
```

Dashboard 資料來源：直接讀 supabase-db 的 incidents 和 incidents_config 表。
用你已有的 Next.js + Supabase 架構，不需要新服務。

### 新增客戶的步驟（以後每次新增客戶做一次）

```
1. 在 Dashboard settings 頁面填入：
   - 客戶名稱
   - 網站 URL
   - Sentry project slug
   - GitHub repo（如果有）
   - Server host
   - Health check URL
   → 存入 incidents_config

2. 在那個客戶的 Sentry 設 webhook：
   → URL: https://app.aware-wave.com/api/webhooks/sentry
   （跟 AwareWave 自己的共用同一個 endpoint，靠 project slug 分流）

3. 如果有 GitHub repo：
   → 在 repo 加 auto-repair-claude.yml（複製 AwareWave 的）
   → 在 repo 加 CLAUDE.md（複製 AwareWave 的紅線規則）

4. 完成。不需要改 Dashboard code、不需要改 Slack 設定。
```

### Phase 5 執行計劃

| 步驟 | 動作 | 誰做 | 時間 |
|------|------|------|------|
| 5.1 | 在 supabase-db 建 incidents_config + incidents 表 | Claude Code | 30 分鐘 |
| 5.2 | 改 webhook route：查 incidents_config 分流 + 寫 incidents 紀錄 | Claude Code | 2 小時 |
| 5.3 | 改 Slack callback handler：支援多 repo | Claude Code | 1 小時 |
| 5.4 | 建 Dashboard 頁面：/ops/repairs | Claude Code | 3-4 小時 |
| 5.5 | 建 Settings 頁面：/ops/repairs/settings | Claude Code | 2 小時 |
| 5.6 | 把 AwareWave 自己加進 incidents_config 第一筆 | Claude Code | 5 分鐘 |
| 5.7 | 驗收：用 AwareWave 自己的告警測一次完整流程 | 你 + Claude Code | 1 小時 |
| 5.8 | 加入第一個客戶 | 你在 settings 頁面操作 | 10 分鐘 |
| 5.9 | 驗收：用那個客戶的 Sentry 測一次 | 你 | 30 分鐘 |

### Phase 5 完成後你的日常（多客戶版）

```
早上起床：
  → 打開 app.aware-wave.com/ops/repairs
  → 看有沒有紅色的待處理
  → 有 → 點進去看，按 Approve 或忽略
  → 沒有 → 關掉，去做別的事

收到 Slack 通知：
  → 看是哪個客戶、什麼問題
  → 按 Approve 或 只看不修
  → 等 Claude 修完 → 看摘要 → Merge → /deploy
  → 看完成報告

每月給客戶的報告：
  → Dashboard 自動有數據
  → 本月告警數、修復數、平均修復時間
  → 可以截圖或匯出給客戶看
```

---

## 十六、未來擴充方向（Phase 5 之後）

| 方向 | 什麼時候做 | 風險 |
|------|-----------|------|
| 備份推到 Cloudflare R2（異地）| Phase 4 期間就可以做 | 低 |
| Merge 後自動 deploy（拿掉手動步驟）| Phase 4 完成後，信任度夠了 | 中 |
| EU 機也納入自動修範圍 | Phase 5 之後 | 高 |
| 撤銷 AI 的 SSH 權限（架設期 → 維運期交接）| 架設期結束時 | 需規劃 |
| Vault 異地備份到 R2 | 越快越好，但跟本計劃獨立 | 低 |
| Dashboard 加上客戶自助查看功能 | Phase 5 穩定後 | 低 |
| 自動產生月報 PDF 給客戶 | Phase 5 穩定後 | 低 |

---

## 十七、這份文件的使用方式

1. **Phase 1**：你自己照表做，30 分鐘
2. **Phase 2**：把「第十節：技術實作細節」整段貼給 Claude Code，叫它照著建
3. **Phase 3**：跑驗收清單，22 步全綠才算完成
4. **Phase 4**：每週日 5 分鐘、每月初 10 分鐘，持續觀察 30 天
5. **Phase 5**：30 天穩定後，把「第十五節：Phase 5」整段貼給 Claude Code，建多客戶 + Dashboard

完成後你的日常就是：**Slack 嗶 → 按 Approve → 看摘要 → 按 Merge → 打 /sg-deploy → 看報告。**
多客戶之後多一個：**早上開 Dashboard 掃一眼。**

三下搞定。其餘全自動。
