# 自動告警維修系統 v2-light（Auto-Repair System）

> **版本**：v2-light（基於 v2 + 7 條 hard fixes，整合 AwareWave 既有 Phase 2 架構）
> **生成**：2026-05-08
> **狀態**：proposal — 待操作者授權後 Phase 1 開始執行
> **適用環境**：AwareWave SG / EU 雙機架構，solo operator
> **owner doc**：本檔（單一主人）

> 2026-05-12 狀態更新：本檔改為歷史參考，不再是 auto-repair 的施工正本。
> 正式施工與交接基準改以 `docs/awarewave-auto-repair-plan-v3.2-final.md` 與 `agency-os/docs/operations/slack-notification-routing.md` 為準。
> 如本檔內容與上述文件衝突，一律以上述兩份較新的文件為準。
> 本檔後續段落若仍出現 legacy 的 `#ops`、單 channel、或 n8n hot-path 範例，視為歷史內容保留，不得直接照抄實作。

---

## 0. 摘要

| 項目 | 內容 |
|------|------|
| **目標** | Sentry / Uptime Kuma / Netdata 發現問題 → Slack 通知附 Approve 按鈕 → 你按下 → Claude 自動分析開 PR → 你 merge → 你跑 `/sg-deploy` 部署 |
| **範圍** | alert ingress、approve callback、Claude Code GitHub Action、PR 自動化、文件規則 |
| **非範圍** | ops console 整合（solo 階段不需要）、multi-tenant scope、auto-deploy（拒絕） |
| **預估工時** | Phase 1: 30 分鐘（你做） / Phase 2: 2-3 小時（Claude 做） / Phase 3: 1 小時（驗收） |
| **風險** | Low（不動既有 production 服務；不 auto-deploy；既有 rollback 路徑保留） |
| **可逆性** | High（隨時可拆，n8n workflow 刪除 + 移除 GitHub Action 即還原） |
| **與既有 Phase 2 衝突** | 零（本系統與 ops console approval 平行運作，不混用 audit trail） |

---

## 1. 背景

### 1.1 現況

AwareWave 既有「告警接收」與「指令執行」兩條 ops 路徑：

- **告警接收**：Sentry / Uptime Kuma / Netdata / Grafana → 已有 webhook 寫 `ops_incidents` 表 → `/ops/inbox` UI 可看；但**沒有「自動派 AI 修」的觸發機制**
- **指令執行**：Telegram bot @awarewave_ops_bot 可下 11+ 個指令（Phase 1+2a+2b+2c production live 2026-05-08）；高風險指令走 ops console approval

### 1.2 痛點

操作者目前需要：
1. 看到 Slack alert
2. 自己讀 Sentry log + 推測根因
3. 自己寫 fix
4. 自己開 PR + 寫摘要
5. 自己 merge
6. 自己 deploy

**Phase 2c 已解決「指令執行」這條線**（手機可下指令、可從 ops console 簽核高風險）。但「**告警 → 程式自動修**」這條線目前完全手動。

### 1.3 為什麼現在做

- Sentry / Uptime Kuma / Netdata 都已 production 運作，有實質告警量
- Claude Code GitHub Action（`anthropics/claude-code-action@v1`）已成熟
- 既有 GitHub Actions 4 個 + system-health-check + sg-deploy.sh + rollback-phase1.sh 都備齊，可作 building block
- Solo operator 的瓶頸是「修 bug 寫 PR 的時間」，自動化此段可省 30-60%

---

## 2. 設計原則（30Y constraint 對齊）

本計畫書相對於原版 v2 套用了 7 條 hard fixes，每條對應 30Y constraint：

| # | Fix | 對應 30Y 原則 |
|---|-----|------------|
| 1 | **不自動 deploy**：取消 `on: push: main`，deploy 永遠手動跑 `sg-deploy.sh` | 不衝突（CLAUDE.md High-STOP）；每次 push to main 不該 trigger deploy |
| 2 | **n8n 不在 hot path**：Slack incoming webhook 直連 + Block Kit 帶按鈕；n8n 只處理單一 callback | 不 lock-in（n8n 掛了 alert 仍進得來） |
| 3 | **Telegram 角色不降級**：Telegram 仍是 phone-ops 主動通道，且現已補上手機備援通知角色 | 不重工（不浪費既有投資） |
| 4 | **Health check 用既有 `scripts/system-health-check.ps1`**：手動 deploy 後自動 call | 不重工 |
| 5 | **Rollback 直接 call `rollback-phase1.sh`**：不寫 fallback yaml | 不重工 |
| 6 | **Slack 採既有雙層路由**：`#infra-alerts` = raw infra、`#ops-incidents` = curated incident，不重建新 channel 體系 | 不重工（沿用正式營運契約） |
| 7 | **Dedup 用 fingerprint + 24 小時視窗**：用 `lib/ops-inbox/fingerprint.ts` 既有實作 | 不重工 + 不衝突（既有架構已內建） |

---

## 3. 架構圖

```
┌──────────────────────────────────────────────────────────────────────┐
│                            告警源（既有）                              │
│  Sentry          Uptime Kuma         Netdata            Grafana       │
│   │                  │                  │                  │           │
│   └──────────────────┼──────────────────┼──────────────────┘           │
│                      │ webhook                                         │
│                      ▼                                                 │
│  ┌─────────────────────────────────────────────────────────┐         │
│  │  Slack incoming webhook（直連，不經 n8n）                │         │
│  │  Block Kit 訊息（含 Approve / 只看不修 兩個按鈕）         │         │
│  │  Channel: #ops（單一）                                   │         │
│  │  Fingerprint dedup（hash(title + culprit) 24h 內不重發）  │         │
│  └─────────────────────────────────────────────────────────┘         │
│                      │                                                 │
│                      ▼ 操作者按 Approve                                 │
│  ┌─────────────────────────────────────────────────────────┐         │
│  │  Slack Interactivity callback                            │         │
│  │       ↓                                                   │         │
│  │  n8n single workflow: slack-approve-handler              │         │
│  │  （n8n 唯一進 hot path 的地方；scope 限縮）               │         │
│  │       ↓                                                   │         │
│  │  POST GitHub API: 建 Issue + label `auto-repair` + @claude│         │
│  │       ↓                                                   │         │
│  │  Slack: update message → "已建 Issue #N"（移除按鈕）       │         │
│  └─────────────────────────────────────────────────────────┘         │
│                      │                                                 │
│                      ▼                                                 │
│  ┌─────────────────────────────────────────────────────────┐         │
│  │  GitHub Action: auto-repair-claude.yml                   │         │
│  │  trigger: issue.opened + label='auto-repair' + body 含 @claude │     │
│  │       ↓                                                   │         │
│  │  anthropics/claude-code-action@v1                         │         │
│  │  Claude 讀 issue → 分析 → 開 PR + 中文摘要                 │         │
│  └─────────────────────────────────────────────────────────┘         │
│                      │                                                 │
│                      ▼                                                 │
│  ┌─────────────────────────────────────────────────────────┐         │
│  │  CI（既有 4 個 workflow）— 不新增                         │         │
│  │  - lobster-workflows-validate-main.yml                   │         │
│  │  - release-gate-main.yml                                 │         │
│  │  - tenant-staging-ssot.yml                               │         │
│  │  - trigger-infra-config-guard.yml                        │         │
│  └─────────────────────────────────────────────────────────┘         │
│                      │                                                 │
│                      ▼ Slack 通知 PR 開了 + CI 狀態                     │
│  ┌─────────────────────────────────────────────────────────┐         │
│  │  操作者讀中文摘要 + 看 CI 通過 → GitHub UI 點 Merge        │         │
│  └─────────────────────────────────────────────────────────┘         │
│                      │                                                 │
│                      ▼ ★ 不自動 deploy ★                                │
│  ┌─────────────────────────────────────────────────────────┐         │
│  │  你從 Claude Code 打 `/sg-deploy` slash command          │         │
│  │  或：SSH SG 直接跑 /root/lobster-phase1/scripts/sg-deploy.sh │       │
│  │       ↓                                                   │         │
│  │  既有 sg-deploy.sh 自動：git pull → rsync → build → up    │         │
│  │  → 寫 .deployed-commit → wait healthy（既有，今日 ship）  │         │
│  │       ↓ 失敗自動                                           │         │
│  │  既有 rollback-phase1.sh fallback                         │         │
│  │       ↓                                                   │         │
│  │  Slack: 部署完成 / 失敗報告（單通知）                      │         │
│  └─────────────────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.1 各組件責任

| 組件 | 責任 | 已存在？ | 本系統需要做的 |
|------|------|---------|--------------|
| Sentry / Uptime Kuma / Netdata | 偵測異常並送 webhook | ✅ | 設定 webhook URL 指向 Slack 而非 n8n |
| Slack `#ops` channel | 收所有 alert + 互動按鈕 | ✅ | 設定 1 channel + 1 個 Slack App（with Interactivity） |
| Fingerprint dedup | 24h 內同 hash 不重發 | 部分（`lib/ops-inbox/fingerprint.ts`）| 沿用既有 fingerprint 邏輯，移植到 Slack webhook 入口前的中介 |
| n8n: slack-approve-handler | 單一 workflow，把 Slack approve callback 轉成 GitHub Issue | ❌ | 新建 1 個 workflow（不是 4 個） |
| GitHub Action: auto-repair-claude | trigger Claude Code Action 對 auto-repair label issue 自動分析 | ❌ | 新建 1 個 yaml |
| GitHub Action: auto-repair-pr-notify | PR opened 後通知 Slack | ❌ | 新建 1 個 yaml |
| CI workflow | PR 跑 lint/test/build | ✅（4 個既有）| **不新增** |
| Deploy | git → staging → build → up → healthcheck | ✅（`sg-deploy.sh` 今日 ship）| 手動觸發；不寫進 GitHub Actions |
| Rollback | 失敗自動還原 | ✅（`rollback-phase1.sh`）| 由 sg-deploy.sh 失敗自動 invoke |
| Health check | 系統健康驗證 | ✅（`system-health-check.ps1` 100%）| sg-deploy.sh 完成後可選擇 call |
| Backup | 部署前備份 | ✅（`backup-eu-stack.sh` + Hetzner snapshot）| 不在本系統觸發；由既有 cron 維持 |
| CLAUDE.md 規則 | 自動修紅線 | ✅ 主檔 | append 一段「自動維修紅線」 |

---

## 4. 既有資產清單（嚴格不可重做）

### 4.1 GitHub Actions 已有 4 個

```
.github/workflows/
├── lobster-workflows-validate-main.yml
├── release-gate-main.yml
├── tenant-staging-ssot.yml
└── trigger-infra-config-guard.yml
```

**規則**：本計畫新增的 yaml 都以 `auto-repair-` 開頭。如果未來需要 PR validation，先 grep 既有 4 個確認沒覆蓋；確定缺才新增。

### 4.2 既有腳本（不重寫，呼叫即可）

| 腳本 | 路徑 | 角色 |
|------|------|------|
| `system-health-check.ps1` | `scripts/system-health-check.ps1` | 100% PASS gate（361/361 checks） |
| `verify-build-gates.ps1` | `scripts/verify-build-gates.ps1` | build / test / governance gates |
| `sg-deploy.sh` | SG: `/root/lobster-phase1/scripts/sg-deploy.sh`（git: `lobster-factory/infra/hetzner-phase1-core/scripts/`）| 標準部署：rsync git→staging + build + up + write `.deployed-commit` |
| `rollback-phase1.sh` | SG: `/root/lobster-phase1/scripts/rollback-phase1.sh` | image snapshot rollback |
| `backup-eu-stack.sh` | EU: `/root/scripts/backup-eu-stack.sh`（02:30 UTC cron）| 自動備份 EU supabase |
| `verify-backup-eu.sh` | EU（03:00 UTC cron）| 驗備份檔可還原 |
| `check-deploy-drift.ps1` | `scripts/check-deploy-drift.ps1` | drift detection（今日 ship） |
| `check-drift-and-alert.sh` | SG（01:00 UTC cron）| drift Slack alert（今日 ship） |
| `check-governance-docs-drift.ps1` | `scripts/check-governance-docs-drift.ps1` | 月度治理檔 drift（今日 ship） |
| `commit-checkpoint.ps1` | `scripts/commit-checkpoint.ps1` | mid-session git checkpoint |
| `ao-resume.ps1` / `ao-close.ps1` | `scripts/` | 開工 / 收工 lifecycle |

### 4.3 既有 Phase 2 Command Plane（保留，本系統不混用）

| 元件 | 角色 | 跟本系統的關係 |
|------|------|---------------|
| `@awarewave_ops_bot` Telegram bot | phone-ops 主動指令通道；Phase 1+2a+2b+2c live | **平行運作**，不取代不混用 |
| `command_requests` Postgres 表 | 指令 audit SoR | auto-repair 不寫此表（避免雙系統混 audit） |
| `policyEngine.ts` RISK_TABLE | 11+ 指令 + risk classification | 不影響 |
| `/ops/approvals` web UI | 高風險指令 ops console 簽核 | 平行運作 |
| `/ops/system-modes` | 全域 kill switch UI | 平行運作 |
| `/ops/inbox` | ops_incidents 已有 list/triage UI | 可選擇是否在 inbox 顯示 auto-repair issue（建議：不顯示，避免重疊） |

### 4.4 既有 Vault 機密（已在 user env / GitHub Secrets）

| Vault key | 用途 | 本系統是否用 |
|----------|------|-----------|
| `SLACK_WEBHOOK_URL` | 既有（drift cron 已用） | ✅ 直接用 |
| `SLACK_BOT_TOKEN` (xoxp) | 既有 | ⚠ 看是否需 Slack App OAuth（下節決定） |
| `SENTRY_AUTH_TOKEN` | 既有 | ✅（設 Sentry webhook 時） |
| `UPTIME_KUMA_API_KEY` | 既有 | ✅ |
| `TELEGRAM_BOT_TOKEN` | 既有（Phase 2 用） | ✅ 手機備援通知 + command plane |
| `ANTHROPIC_API_KEY` | 既有 | ✅（Claude Code Action） |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | 既有 | ⚠ Action 自動 GITHUB_TOKEN 可能就夠；用 PAT 才能跨 repo |
| `OPS_INBOX_INGEST_TOKEN` | 既有 | ❌（不寫 ops_incidents） |
| `OPS_PROXY_SHARED_SECRET` | 既有（Phase 2c） | ❌（不接 ops console） |

---

## 5. 不在範圍 (Out of Scope)

| 項目 | 為什麼不做 | 何時可做 |
|------|----------|---------|
| ops console 整合（v3）| solo operator 不需要雙 RBAC；GitHub repo write = 你獨享 | 第 2 個操作者加入，或 tenant-facing alert 出現 |
| `command_requests` SoR 整合 | solo 階段 GitHub PR history 已是足夠 audit | 同上 |
| Multi-tenant 隔離 | 目前無 tenant；alert 都是自家 | 客戶上線後 |
| `on: push: main` auto-deploy | High-STOP 紅線，CLAUDE.md 不允許 | 永遠不做（即使未來有 staging gate 也不該主分支 auto-deploy） |
| Slack 切多 channel | solo operator 注意力負擔 > 收益 | 團隊 ≥ 3 人 |
| 用 n8n 做 alert ingress | n8n hot path lock-in；Slack 直連可避 | 永遠不做 |

---

## 6. 實作細節

### 6.1 Phase 1 — 你做（30 分鐘）

#### 6.1.1 Slack 設定（5 分鐘）

1. **頻道**：沿用既有 `#infra-alerts`、`#ops-incidents`；只新增 `#github-prs`
2. **頻道通知偏好**：`#ops-incidents` 設為「每則訊息」+ 音效；`#infra-alerts` 視需要靜音；`#github-prs` 僅 @ 提及
3. **勿擾時段**：23:00–08:00；讓 `#ops-incidents` 與 Telegram 備援保持可見

#### 6.1.2 Slack App 建立（10 分鐘）

> Slack App 是讓 Slack 訊息可帶**互動按鈕**並把 callback 送回我們系統的必備設定。

1. https://api.slack.com/apps → Create New App → From scratch
2. App Name: `AwareWave Auto-Repair`
3. **Features → Interactivity & Shortcuts**：
   - Enable Interactivity: ON
   - Request URL: `https://n8n.aware-wave.com/webhook/slack-interaction`（待 Phase 2 建立後改）
   - Save
4. **Features → OAuth & Permissions**：
   - Bot Token Scopes 加：`chat:write`, `chat:write.public`, `incoming-webhook`, `commands`
5. **Install App → Install to Workspace**
   - 同意並讓 incoming webhook 指向 `#ops-incidents`
   - 拿到 Bot User OAuth Token (xoxb-...)
   - 拿到 Webhook URL（`hooks.slack.com/services/...`）
6. **記下兩個值**，Phase 2 會放進 vault。

#### 6.1.3 GitHub Secrets 設定（5 分鐘）

到 repo → Settings → Secrets and variables → Actions：

```
# 必要（多數已有）
ANTHROPIC_API_KEY            # 已在 vault；複製到 GitHub
SLACK_WEBHOOK_URL            # 已在 vault
SLACK_BOT_TOKEN              # 6.1.2 拿到的 xoxb-
SLACK_SIGNING_SECRET         # 6.1.2 中 Basic Information 找到
GITHUB_TOKEN                 # 自動有（不需設）

# 部署 secrets（既有 sg-deploy.sh 會用，本系統不直接調用）
# 不需設給 GitHub Actions（deploy 不在 Actions 跑）

# 選填
SENTRY_WEBHOOK_SECRET        # 你在 Sentry 設的 webhook secret，n8n 會驗
UPTIME_KUMA_SECRET           # 同上
NETDATA_SECRET               # 同上
```

> **重要**：本計畫**不要求** `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` 進 GitHub Secrets。Telegram 角色由 Phase 2c 維持，本系統不混用。

#### 6.1.4 Branch Protection（5 分鐘）

GitHub repo → Settings → Branches → Add rule → `main`：

- ✅ Require a pull request before merging
- ✅ Require approvals: 1（你自己 approve；或設 0 但要求 status check 通過）
- ✅ Require status checks to pass：加入既有 4 個 workflow 中的 PR 驗證 job 名（grep yml 確認）
- ❌ 不開 Allow auto-merge
- ✅ Do not allow bypassing

#### 6.1.5 確認既有 Sentry / Uptime Kuma / Netdata webhook URL（5 分鐘）

清單既有 webhook 配置：
- Sentry → 既有可能直連 Slack 或寫 ops_incidents；本計畫**不改**這些既有 webhook
- Uptime Kuma → 同
- Netdata → 同

> Phase 2 起，Slack incoming webhook 為 alert 主入口，但既有的 ops_incidents 寫入路徑保留作 audit / inbox UI 用途。

---

### 6.2 Phase 2 — Claude 建（2-3 小時）

#### 6.2.1 n8n single workflow：`slack-approve-handler`

> **唯一一個 n8n workflow**。處理 Slack interactivity callback → 建 GitHub Issue。

**workflow JSON（建議由 Claude Code 建立後 import）**：

```
節點 1: Webhook
  Method: POST
  Path: /slack-interaction
  Authentication: Header Auth - X-Slack-Signature 驗證（用 SLACK_SIGNING_SECRET）

節點 2: Function（解析 Slack interaction payload）
  Input: payload (JSON form-encoded `payload=`)
  解析：
    - payload.actions[0].action_id (approve_repair / acknowledge_only)
    - payload.actions[0].value (alert_data JSON)
    - payload.message.ts (原訊息 timestamp，給節點 5 用)
    - payload.channel.id

節點 3: Switch (action_id)
  case "approve_repair": → 節點 4
  case "acknowledge_only": → 節點 6
  default: → 節點 7（log + return）

節點 4: GitHub - Create Issue
  Owner: awarewaveai-pei
  Repo: Work
  Title: 由 alert source 決定模板（見 §6.3）
  Body: 由 alert_data 填入 + @claude tag
  Labels: ["auto-repair", "<source>"]
  Output: issue_number, issue_url

節點 5: Slack - Update Message (chat.update)
  channel: payload.channel.id
  ts: payload.message.ts
  blocks: 顯示 "✅ 已建 Issue #{{issue_number}} — Claude 開始分析"，移除按鈕

節點 6: Slack - Add Reaction
  channel: payload.channel.id
  timestamp: payload.message.ts
  name: "eyes"
  → 結束（不建 Issue）

節點 7: Function - log unknown action
  → 結束
```

**關鍵 hard fix**：`Webhook signature verification`（節點 1 不能省）。Slack POST 會帶 `X-Slack-Signature` 與 `X-Slack-Request-Timestamp`，n8n 用 SLACK_SIGNING_SECRET 計算 HMAC-SHA256 驗證；不對就 403。否則任何人知道你 n8n URL 就能偽造按鈕。

#### 6.2.2 Slack incoming webhook + Block Kit（不用 n8n）

各告警源直接 POST 到 Slack incoming webhook（`hooks.slack.com/services/...`），payload 格式如下：

**通用 Block Kit 模板**：

```json
{
  "channel": "#ops",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": ":rotating_light: *<SOURCE> 告警*\n*<TITLE>*\n嚴重度：<LEVEL>\n細節：<DETAIL>\n<ORIGINAL_URL|在 <SOURCE> 查看>"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "fingerprint: <FINGERPRINT> | 時間：<TIMESTAMP>"
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {"type": "plain_text", "text": "✅ Approve — 叫 AI 修"},
          "action_id": "approve_repair",
          "value": "<ALERT_DATA_JSON_STRING>",
          "style": "primary"
        },
        {
          "type": "button",
          "text": {"type": "plain_text", "text": "👀 只看不修"},
          "action_id": "acknowledge_only",
          "value": "<ALERT_DATA_JSON_STRING>"
        }
      ]
    }
  ]
}
```

#### 6.2.3 Fingerprint dedup（24h）

使用既有 `lib/ops-inbox/fingerprint.ts` 的 hash 邏輯（不重做）。

實作位置：在告警源 → Slack 之間加一支輕量 lambda / Cloudflare Worker / SG nginx 模組（建議直接擴 `app/api/webhooks/sentry/route.ts` 等既有 webhook handler）：

```typescript
// 既有 app/api/webhooks/sentry/route.ts (extend)
import { fingerprintForSource } from "@/lib/ops-inbox/fingerprint";

export async function POST(request: Request) {
  const payload = await request.json();
  const fingerprint = fingerprintForSource("sentry", payload);

  // dedup: 24h 內同 fingerprint 已送過？
  const recent = await checkFingerprintRecent(fingerprint, 24 * 3600);
  if (recent) {
    // skip Slack post + write ops_incidents row "deduped"
    return NextResponse.json({ ok: true, deduped: true, fingerprint });
  }

  // 1. 既有: 寫 ops_incidents（不變）
  await writeOpsIncident(payload);

  // 2. 新增: post 到 Slack with Block Kit + Approve 按鈕
  await postToSlackWithApproveButton({
    source: "sentry",
    title: payload.event.title,
    detail: payload.event.culprit,
    level: payload.event.level,
    url: payload.url,
    fingerprint,
    alertDataJson: JSON.stringify({
      source: "sentry",
      title: payload.event.title,
      culprit: payload.event.culprit,
      sentry_url: payload.url,
      issue_id: payload.event.event_id,
      fingerprint,
    }),
  });

  // 3. 紀錄 fingerprint
  await recordFingerprintSent(fingerprint, Date.now());

  return NextResponse.json({ ok: true });
}
```

對 Uptime Kuma / Netdata 同樣 pattern。

#### 6.2.4 GitHub Action 1：`.github/workflows/auto-repair-claude.yml`

```yaml
name: Auto-Repair — Claude Code

on:
  issues:
    types: [opened]
  issue_comment:
    types: [created]

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

      - name: Claude Code Action
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          claude_args: "--max-turns 10"

      - name: Notify Slack on completion
        if: always()
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK_URL }}
          ISSUE_NUM: ${{ github.event.issue.number }}
          ISSUE_TITLE: ${{ github.event.issue.title }}
          STATUS: ${{ job.status }}
        run: |
          if [ "$STATUS" = "success" ]; then
            EMOJI=":white_check_mark:"
            MSG="分析完畢"
          else
            EMOJI=":warning:"
            MSG="分析失敗，請人工檢查"
          fi
          curl -X POST "$SLACK_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "{
              \"channel\": \"#ops\",
              \"text\": \"${EMOJI} Claude ${MSG}：#${ISSUE_NUM} ${ISSUE_TITLE}\"
            }"
```

> **沒有 Telegram fallback step**（v2 原版有；本計畫拿掉，避免 Telegram 角色錯置）。

#### 6.2.5 GitHub Action 2：`.github/workflows/auto-repair-pr-notify.yml`

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
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK_URL }}
        run: |
          curl -X POST "$SLACK_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d '{
              "channel": "#ops",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": ":wrench: *Claude 開了 Auto-Repair PR*\n*${{ github.event.pull_request.title }}*\nCI 狀態：進行中\n<${{ github.event.pull_request.html_url }}|點這裡看 PR>"
                  }
                },
                {
                  "type": "context",
                  "elements": [
                    {
                      "type": "mrkdwn",
                      "text": "請先讀中文摘要，CI 通過後再 Merge。Merge 後手動跑 /sg-deploy 部署。"
                    }
                  ]
                }
              ]
            }'
```

#### 6.2.6 ⚠ 不新建 `auto-repair-deploy.yml`

本計畫**主動移除** v2 原版的 deploy.yml。原因：

1. CLAUDE.md High-STOP 拒絕 production auto-deploy
2. `on: push: branches: [main]` 會跟你日常 work-on-main 衝突（每次 commit 觸發 deploy）
3. 既有 `sg-deploy.sh` 已是手動觸發、含 healthcheck、含 rollback fallback、寫 `.deployed-commit`，**比 yaml 更穩**

部署路徑（Phase 1 Step 6.4 已完成）：
- 從 Claude Code 打 `/sg-deploy` slash command（最快）
- 或 SSH SG：`/root/lobster-phase1/scripts/sg-deploy.sh next-admin`
- 失敗自動 invoke `rollback-phase1.sh`
- 完成後可選 call `system-health-check.ps1` 驗證 100%

---

### 6.3 GitHub Issue 模板（三套）

#### 6.3.1 Sentry 模板

```markdown
# 🔧 Auto-repair: {{error_title}}

## Alert source
- Source: Sentry
- Severity: {{level}}
- Service: {{service_name}}
- File: {{culprit}}
- Sentry URL: {{sentry_url}}
- Time: {{timestamp}}
- Fingerprint: {{fingerprint}}
- Incident ID: auto-{{YYYYMMDD}}-{{HHMM}}-sentry-{{sentry_issue_id}}

## Error details
（Sentry 的 stack trace 貼在這裡）

## Instructions for @claude

Please investigate and fix this production error.

Rules:
1. **Minimal change**：以最少行數為原則。
2. **Forbidden files**：絕對不改 `.env`, `.env.local`, `secrets/`, `*.key`, `*.pem`, database migrations (`packages/db/migrations/*.sql`), `docker-compose.yml`, `nginx/*.conf`, `Dockerfile`, `.cursor/rules/*`（已退場路徑；不得重建）, `mcp/registry.template.json`.
3. **Tests**：加或更新 test 覆蓋此 fix。
4. **No swallow-catch**：禁止用 try/catch 吞錯誤當作修好。
5. **PR 必含**:
   - **中文摘要**（給操作者看，放最上方，見 §6.4 PR 模板）
   - English technical summary
   - Incident ID（同上）
6. **Honest fail**：修不出來就明說，**不要猜**。Comment 寫「無法自動修：<原因>」並加 label `needs-human-review`。
7. **Auth/payment/permission boundary**：若 fix 觸及 auth、payment、user permission 邏輯，**不要動**。Comment 解釋 + 加 label `needs-human-review`。
8. **Second-time auto-repair**：若同一 fingerprint 第二次被 auto-repair，加 label `needs-human-review`，PR 描述補一段「上次修法 + 為什麼這次又出現」。
```

#### 6.3.2 Uptime Kuma 模板

```markdown
# 🔍 Triage: {{monitor_name}} DOWN

## Alert source
- Source: Uptime Kuma
- Monitor: {{monitor_name}}
- URL: {{url}}
- Status: DOWN since {{downtime}}
- HTTP Status: {{http_status}}
- Fingerprint: {{fingerprint}}
- Incident ID: auto-{{YYYYMMDD}}-{{HHMM}}-uptime-{{monitor_id}}

## Instructions for @claude

This is a TRIAGE request, NOT a fix request.

1. Check recent commits for related changes.
2. Check if the error is in application code or infrastructure.
3. Write triage report:
   - 可能原因 top 3（中文）
   - 建議修復方向
   - 是否可用 code 修（yes/no + 原因）
4. **Only if** the cause is clearly application code:
   - Open a PR following the Sentry fix rules above.
5. **If infrastructure** (DB, nginx, disk, DNS, container):
   - Do NOT open a PR.
   - List recommended manual steps (e.g. `docker compose restart X`).
   - Suggest cross-ref to runbook（`agency-os/docs/operations/HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md` 等）。
```

#### 6.3.3 Netdata 模板

```markdown
# 📊 Infra analysis: {{alert_name}} on {{node}}

## Alert source
- Source: Netdata
- Node: {{node}}
- Alert: {{alert_name}}
- Severity: {{severity}}
- Value: {{value}}
- Fingerprint: {{fingerprint}}
- Incident ID: auto-{{YYYYMMDD}}-{{HHMM}}-netdata-{{alert_id}}

## Instructions for @claude

This is an ANALYSIS-ONLY request. **Do NOT modify any code or configuration.**

1. Analyze whether this repo has code or config contributing to this issue.
2. Check for resource leaks, excessive logging, inefficient patterns in recent commits.
3. Write analysis comment with:
   - 可能的 code 層原因
   - 可能的 infra 層原因
   - 建議處置方式
4. Do NOT open a PR. Comment on this issue only.
5. If pattern suggests `runbooks/HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md` applies, link it.
```

---

### 6.4 PR 中文摘要模板（Claude 寫 PR 時依此）

寫進 `CLAUDE.md` 「自動維修規則」段落（見 §6.5）：

```markdown
> **問題**：[一句話描述]
> **原因**：[為什麼壞]
> **修法**：[改了什麼，為什麼能解]
> **風險**：[低 / 中 / 高] — [評估理由]
> **建議**：[可以 merge / 需要人工檢查 / 不建議 merge]
> **Incident ID**：[auto-YYYYMMDD-HHMM-source-id]
> **Fingerprint**：[hash 值，方便未來追蹤是否第二次出現]
```

PR description 必含：
1. 中文摘要（如上）
2. English technical summary
3. 改動清單（檔案 + 行數）
4. Test coverage（新加 test 連結 / 既有 test 覆蓋）
5. （若 high risk）`needs-human-review` label

---

### 6.5 CLAUDE.md 規則補充

> 不覆蓋既有內容；append 到尾部。

```markdown
---

## 自動維修規則（Auto-Repair System v2-light）

> 對應 owner doc：`agency-os/docs/operations/AUTO_REPAIR_SYSTEM_V2_LIGHT.md`
> 觸發路徑：Sentry / Uptime Kuma / Netdata → Slack `#ops` Approve 按鈕 → n8n → GitHub Issue + @claude → Claude Code Action → PR
> 部署：Merge 後**操作者手動** 跑 `/sg-deploy`，**不**自動 deploy production

### PR 格式要求

每個由 auto-repair 觸發的 PR 必須包含：

#### 中文摘要（給操作者看，放在 PR description 最上方）

> **問題**：[一句話]
> **原因**：[為什麼壞]
> **修法**：[怎麼修]
> **風險**：[低/中/高] — [為什麼]
> **建議**：[可以 merge / 需要人工檢查 / 不建議 merge]
> **Incident ID**：[auto-YYYYMMDD-HHMM-source-id]
> **Fingerprint**：[hash]

#### 技術細節（English）

- What changed and why
- Files modified（list with line counts）
- Test coverage

#### Incident 結案（若有）

> **Root cause**: [根因]
> **Fix applied**: [修復內容]
> **Impact scope**: [影響範圍]
> **Monitoring period**: [建議觀察期，預設 48 小時]

### 自動維修紅線（絕對不能做）

1. **不能改**：`.env`, `.env.local`, `secrets/`, `*.key`, `*.pem`
2. **不能改**：`packages/db/migrations/*.sql`（database migrations）
3. **不能改**：auth、payment、user permission 邏輯
4. **不能改**：`nginx/*.conf`, `Dockerfile`, `docker-compose.yml`
5. **不能改**：`.cursor/rules/*`（已退場路徑；不得重建）, `mcp/registry.template.json`, `agency-os/AGENTS.md`, `CLAUDE.md`
6. **不能改**：`.claude/skills/*`, `.claude/commands/*`, `.claude/agents/*`
7. **不能執行**：破壞性指令（`rm -rf`, `DROP TABLE`, `TRUNCATE`, `DELETE` 無 `WHERE`）
8. **不能用**：try/catch 吞掉錯誤當作修好
9. **改動超過 100 行**：必須拆成多個 PR
10. **修不出來就明說**：禁止猜測
11. **production 部署**：**永遠手動**（操作者跑 `/sg-deploy`），auto-repair 不觸發 deploy

### 必須標記 `needs-human-review` 的情況

1. 改了 API response 格式
2. 改了 cron / 排程邏輯
3. 涉及第三方 API 呼叫
4. 同一 fingerprint 第二次被 auto-repair
5. 影響超過 3 個檔案
6. 任何改動觸及 §自動維修紅線 第 1-6 條的 *附近區域*（即使沒直接改該檔，但改的檔會 import 它）

### Incident 結案規範

所有 alert/incident 處理完畢後（PR merge + deploy 完），必須在當日 `agency-os/WORKLOG.md` 寫一段結案紀錄：

- Root cause（根因）
- Fix applied（修復內容 + 連結 PR）
- Impact scope（影響範圍）
- Monitoring period（後續觀察期，預設 48 小時）
- Incident ID（同 PR 中的 ID）

沒有結案紀錄等於沒結案。可由 AO-CLOSE 流程自動 prompt 補。
```

---

### 6.6 Phase 3 — 驗收測試（1 小時）

依序做：

#### 6.6.1 Slack 端到端

1. 在 Sentry 觸發一個 test error（Sentry CLI 或 dashboard 「Send Test Notification」）
2. ✅ Slack `#ops` 收到訊息，含【✅ Approve — 叫 AI 修】+【👀 只看不修】兩個按鈕
3. 訊息含 fingerprint、Incident ID
4. 同一 error 30 秒內再觸發一次：
5. ✅ Slack **不** 重複發訊息（dedup 起作用）

#### 6.6.2 GitHub Issue 建立

6. 點【✅ Approve】
7. ✅ Slack 訊息更新成「已建 Issue #N」（按鈕消失）
8. ✅ GitHub Issue 建立，title 對、body 對、label `auto-repair` + `sentry`、@claude tag

#### 6.6.3 Claude Code Action 跑

9. ✅ Action 開始跑（GitHub Actions tab 看得到）
10. ✅ Slack `#ops` 收到「Claude 分析中」（可選 — 視 Action 是否中段通知）
11. 等 Claude 跑完
12. ✅ Slack 收到「Claude 分析完畢」+ 連結 PR
13. ✅ PR 開啟、description 含中文摘要、Incident ID、Fingerprint

#### 6.6.4 CI 跑

14. ✅ 既有 4 個 workflow 中至少 1 個觸發（branch protection 要求的那個）
15. ✅ 等 CI 結果

#### 6.6.5 Merge + Deploy（手動）

16. 你讀完中文摘要 + 確認 CI 通過 + GitHub UI 點【Merge】
17. ✅ 沒有 GitHub Action 自動 deploy（如果有就是 misconfig）
18. 在 Claude Code 打 `/sg-deploy`
19. ✅ 部署成功 + healthcheck PASS
20. （可選）跑 `powershell -File scripts/system-health-check.ps1` 確認 100%

#### 6.6.6 結案紀錄

21. 在 WORKLOG.md 寫 incident 結案
22. （可選）下次 AO-CLOSE 時自動將 AUTO_TASK_DONE 對應到此 incident

**所有 22 步通過 = Phase 3 驗收 PASS**。

---

### 6.7 Phase 4 — 30 天觀察期

每週日花 5 分鐘做：

| 觀察項 | 警訊 | 行動 |
|-------|------|-----|
| Auto-repair PR 數量 | 突然爆量（>5/週）→ alert 噪音 | 檢查 Sentry 規則是否過鬆 |
| 重複 fingerprint | 同 hash 在不同週重複 → 修法不徹底 | 加 `needs-human-review` 規則：第二次自動標記 |
| Claude 修法品質 | PR 中文摘要寫「無法判斷」比例 > 30% | 收緊 CLAUDE.md 紅線；alert 加更多 context |
| `needs-human-review` 比例 | < 10% → 太樂觀（可能 missing safeguards） | 拉高 review 標準 |
| Merge 後 production 故障 | rollback 觸發次數 > 1/月 | 暫停 auto-repair，檢討哪步 leak |
| Slack 噪音疲勞 | 你開始忽略 alert | 加更多 dedup（fingerprint 維度擴）|

30 天後決策：

| 結果 | 下一步 |
|------|------|
| 系統穩定 + 修法品質好 | 繼續運行；考慮升級 v3（整合 ops console） |
| 有 1-2 次 false fix 但 rollback 救回 | 收緊紅線；繼續 |
| Multiple production incident from auto-repair | **暫停系統**，檢討；可能需要回到全手動 |

---

## 7. Verification Tests（DoD）

| # | 測試項 | DoD 通過條件 |
|---|-------|------------|
| 1 | Sentry test error → Slack 通知 | 1 條訊息出現於 `#ops`，含 2 按鈕 + fingerprint + Incident ID |
| 2 | Dedup（30 秒內同 error） | 第二次不發 Slack |
| 3 | Approve → GitHub Issue | Issue 建立、有 label、@claude tag、原 alert 訊息按鈕消失 |
| 4 | Claude Code Action 跑通 | PR opened，含中文摘要 + Incident ID + Fingerprint |
| 5 | CI 跑通 | 既有 4 個 workflow 中應觸發者 PASS |
| 6 | Merge → 不自動 deploy | GitHub Actions 中**沒有** auto-deploy job 跑 |
| 7 | 手動 `/sg-deploy` → production 健康 | sg-deploy.sh exit 0 + healthcheck PASS |
| 8 | 故意失敗 → rollback | 模擬 build break，rollback-phase1.sh 自動 invoke |
| 9 | WORKLOG 結案 | 當日 WORKLOG.md 含 incident 結案紀錄 |
| 10 | 30 天觀察 | 無 production incident 由 auto-repair 引起 |

---

## 8. Rollback Strategy

如果 v2-light 系統本身（非個別 PR）出問題：

| 場景 | 動作 | 回到 |
|------|------|------|
| Slack alert 失靈 | 既有 ops_incidents webhook 路徑保留，可直接看 `/ops/inbox` | Phase 0 手動 |
| n8n workflow 壞掉 | Slack 訊息按鈕點了沒反應；手動建 GitHub Issue 即可 | 部分手動 |
| Claude Code Action 失靈 | Issue 不會跑 PR；你自己讀 issue 自己修 | 部分手動 |
| `/sg-deploy` 出問題 | 既有 rollback-phase1.sh fallback；或 SSH 手動 git checkout | 全手動 |
| **整個系統需 disable** | 移除兩個 GitHub Action yaml + 停用 n8n workflow + Slack channel webhook 取消 | Phase 0 |

關鍵：**本系統不對既有 production code / data / infrastructure 做任何改動**。整個系統可以「拆掉」回到 Phase 0，不留疤痕。

---

## 9. Risk Register

| # | 風險 | 機率 | 影響 | Mitigation |
|---|------|-----|------|----------|
| R1 | Slack webhook URL 洩漏 → 偽造 alert | Low | Medium | URL 進 vault；Slack interactivity 用 signing secret 驗 |
| R2 | n8n workflow 處理 callback 出錯 | Medium | Low | callback 失敗只影響「Approve 按鈕」；alert 仍進 Slack 顯示 |
| R3 | Claude 修法錯誤 → 引入新 bug | Medium | Medium | 你 merge 前讀中文摘要 + CI gate；30 天觀察期主動監察 |
| R4 | Auto-repair PR 過多噪音 | Medium | Low | dedup（fingerprint）+ second-time `needs-human-review` |
| R5 | Sentry / Uptime Kuma 改 webhook payload schema | Low | Medium | webhook handler 加 schema validation；schema 不對就 log + skip |
| R6 | `claude-code-action@v1` 大版本 breaking | Low | Medium | pin major version；觀察 30 天；breaking 時 fallback 全手動 |
| R7 | GitHub Action 跑超時（Claude 卡住） | Low | Low | `claude_args: "--max-turns 10"` 限制；超時 issue 不會自動 PR，可人工 |
| R8 | Branch protection 設錯 → 直 push to main 不過 CI | Low | High | Phase 1 step 4 必檢；本系統不影響 |
| R9 | `/sg-deploy` 路徑與 GitHub Actions 不同步 | Low | Low | 本系統**不**用 GitHub Actions deploy；不會發生 |
| R10 | 同一 fingerprint 在跨 alert source 撞 hash | Very Low | Low | fingerprintForSource() 已含 source prefix；不會跨源撞 |

### 9.1 30Y 穩定性自盤

| 30Y 規則 | 本系統是否違反 |
|---------|------------|
| #1 Deterministic entry points | ✅ Slack `#ops` 是唯一 alert 入口 |
| #2 Mechanized checks over tribal knowledge | ✅ CLAUDE.md 紅線 + n8n workflow + Action yaml 都 git-tracked |
| #3 Narrow interfaces | ✅ Slack incoming webhook 是 industry standard；fingerprint 是既有實作；GitHub Action 是 Anthropic 官方 |
| #4 Operational observability | ✅ alert → Slack（人類可見）+ GitHub Issue（永久）+ PR description（中文摘要）+ WORKLOG 結案 |
| #5 Low-friction extensibility | ✅ 加新 alert source 只需擴 `app/api/webhooks/<source>/route.ts`；加新 risk rule 只需改 CLAUDE.md |
| #6 Deprecation discipline | ✅ 整套可乾淨拆除（§8 Rollback）|

---

## 10. Future Extensions

### 10.1 升級到 v3（整合 ops console）

**何時升級**：
- 第 2 個操作者加入（Slack channel 變多人可見，需 RBAC）
- Tenant-facing alert 出現（需 multi-tenant scope）
- Auto-repair 想升級到「approve to deploy」自動化（需 ops console approval）

**升級內容**（不重做，只擴）：
- Slack 訊息按鈕從「Approve」改成「→ 點此到 ops console 簽核」連結
- n8n callback 改寫 `command_requests` 表（不直接建 GitHub Issue）
- 新增 ops console handler `/api/ops/auto-repair-approve`，approval 後才建 Issue
- Phase 2c approval flow 自然涵蓋

**升級成本**：~3-4 hr 工程（既有 Phase 2c 已涵蓋 80%）

### 10.2 加 Multi-tenant scope

**何時加**：第一個 tenant 上線

**內容**：
- alert webhook handler 加 tenant 識別（從 payload 抽 organization_id）
- 每個 tenant 有自己的 Slack channel + GitHub repo
- Claude Code Action 跑在 per-tenant repo

### 10.3 加更多 alert sources

PagerDuty / Datadog / New Relic / 自家 cron alert：

只需擴 `app/api/webhooks/<source>/route.ts`，沿用 fingerprint + Slack post + Approve 流程。

---

## 11. 7 條 Hard Fixes 對照表（v2 → v2-light）

| # | v2 原版設計 | v2-light 修正 | 為什麼修 |
|---|----------|------------|--------|
| 1 | `auto-repair-deploy.yml` 用 `on: push: main` 自動部署 | **移除整個 yaml**；deploy 永遠手動 `/sg-deploy` | CLAUDE.md High-STOP；`main` 是日常工作分支，每次 push 自動 deploy 災難 |
| 2 | n8n 4 個 workflow（Sentry/Uptime/Netdata/Approve callback）全在 hot path | n8n 只剩 1 個（slack-approve-callback）；alert ingress 用 Slack incoming webhook 直連 | n8n 掛了 alert 全失，violation of escape hatch；Slack 是 industry-standard alert destination |
| 3 | Telegram 標「選填」、定位「Slack 掛了的備用」 | **完全不動 Telegram**；Phase 2c 既有角色保留 | 浪費既有 11+ 指令 + 5 個 vault key 投資；錯置 Phase 2 設計 |
| 4 | health check 自己刻 6 retries × curl 3 endpoints | 用既有 `system-health-check.ps1` + `sg-deploy.sh` 內建 healthcheck | 重工；既有 100% PASS gate 已驗證 |
| 5 | rollback yaml 寫了 fallback path | 直接 call `rollback-phase1.sh`；不存在就 fail（不靜默 fallback） | 重工；fallback 路徑 v2 沒測過 |
| 6 | Slack 切 `#alerts-critical` / `#alerts-info` / `#github-prs` 三個 channel + 設通知 | 1 個 channel `#ops`；訊息分級用 emoji prefix | solo operator 認知負擔 |
| 7 | Dedup 用 n8n Static Data 存 30 分鐘 title | 用既有 `lib/ops-inbox/fingerprint.ts` + 24h 視窗 | 重工 + 30 分鐘太短，第 31 分鐘同 bug 又起會撞 |

---

## 12. 執行順序總表

| Phase | 誰 | 動作 | 預估時間 |
|-------|---|------|---------|
| 1.1 | 你 | Slack channel + 通知偏好 | 5 min |
| 1.2 | 你 | Slack App + Bot + Interactivity URL（先佔位） | 10 min |
| 1.3 | 你 | GitHub Secrets 設定 | 5 min |
| 1.4 | 你 | Branch Protection | 5 min |
| 1.5 | 你 | 確認既有 webhook 配置 | 5 min |
| **Phase 1 小計** | | | **30 min** |
| 2.1 | Claude | n8n workflow `slack-approve-handler`（單一）| 30 min |
| 2.2 | Claude | extend 既有 webhook handlers 加 Slack post + fingerprint dedup | 60 min |
| 2.3 | Claude | `auto-repair-claude.yml` + `auto-repair-pr-notify.yml` | 30 min |
| 2.4 | Claude | CLAUDE.md append「自動維修規則」 | 15 min |
| 2.5 | Claude | 三套 GitHub Issue 模板（直接寫進 n8n workflow 節點 4） | 15 min |
| **Phase 2 小計** | | | **2.5 hr** |
| 3.1-22 | 你 + Claude | 端到端驗收 22 步 | 60 min |
| **Phase 3 小計** | | | **1 hr** |
| 4 | 你 | 30 天每週日 5 分鐘觀察 | 5 min × 4 週 |
| **Phase 4 小計** | | | **20 min（spread）** |
| **TOTAL（含 phase 4 part）** | | | **~4 hr 工程 + 30 天觀察** |

---

## 13. 完整 Secrets 清單（給 Phase 1 step 1.3）

```bash
# === GitHub Secrets ===

# 必要
ANTHROPIC_API_KEY            # 已在 vault；複製
SLACK_WEBHOOK_URL            # 已在 vault
SLACK_BOT_TOKEN              # 6.1.2 拿到的 xoxb-...
SLACK_SIGNING_SECRET         # 6.1.2 中拿到（用於驗 callback signature）

# 選填（webhook signature 驗證）
SENTRY_WEBHOOK_SECRET        # 在 Sentry 設 webhook 時自訂；n8n 驗
UPTIME_KUMA_SECRET           # Uptime Kuma webhook header secret
NETDATA_SECRET               # Netdata notification.conf 自訂

# === 不需設給 GitHub Actions ===

# Telegram-related — 本系統不用
# TELEGRAM_BOT_TOKEN
# TELEGRAM_CHAT_ID

# Server SSH keys — 本系統不在 Actions 跑 deploy
# SG_HOST / SG_USER / SG_SSH_KEY
# EU_HOST / EU_USER / EU_SSH_KEY

# Phase 2c-related — 本系統不接 ops console
# OPS_PROXY_SHARED_SECRET
# OPS_INBOX_INGEST_TOKEN
```

> **與 v2 原版差異**：
> - 砍掉 SG_HOST/USER/SSH_KEY、EU_HOST/USER/SSH_KEY（deploy 不在 Actions 跑）
> - 砍掉 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID（不用 Telegram）
> - 加上 SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET（signature 驗證必要）
> - 加上 SENTRY_WEBHOOK_SECRET 等三條（webhook 驗證；可選但建議）

---

## 14. 注意事項與已知限制

1. 本計畫**只**處理「告警觸發 → AI 自動分析 → PR 自動產生 → 人工 merge → 人工 deploy」流程。
2. 備份系統（異地 R2 推送、WordPress DB 定期 dump）是獨立 owner doc：`agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md` + `BACKUP_RESTORE_PROOF.md`。
3. **第一個月不開 auto-merge**。即使 CI 通過，你**手動** Merge，建立信任後再考慮（v3 升級時的議題）。
4. n8n workflow 的 Interactivity URL 必須在 Slack App 設定裡指向 n8n（Phase 1 step 1.2 先佔位，Phase 2 建好後改實際 URL）。
5. 既有 `rollback-phase1.sh` 與 `system-health-check.ps1` 路徑變動時，本計畫的 `sg-deploy.sh` 失敗 fallback path 須同步更新。
6. **Phase 2c approval UI 與本系統平行運作，不混用**：高風險指令（`/normal_mode` 等）走 ops console；alert 自動修走 Slack。`command_requests` 表只記錄前者。
7. **AGENTS.md 與本計畫對齊**：未來若加新 alert source，需同步更新 AGENTS.md「文件治理規則」與 `CHANGE_IMPACT_MATRIX.md`。

---

## 15. 文件治理連動

新增此 owner doc 後須做：

1. **`agency-os/docs/CHANGE_IMPACT_MATRIX.md`** 加一行：本檔 → 連動 `CLAUDE.md`「自動維修規則」+ `DEPLOY_ROLLBACK_RUNBOOK.md` §2.4 cron alert 章節
2. **`agency-os/AGENTS.md`** §8（記憶與文件的長期紀律）加一行指本檔
3. **`README.md`** 入口加一行（按 `docs/operations/new-doc-linkage-checklist.md`）
4. **`scripts/register-new-governance-doc.ps1`** 跑：
   ```powershell
   .\scripts\register-new-governance-doc.ps1 -Path agency-os/docs/operations/AUTO_REPAIR_SYSTEM_V2_LIGHT.md -Targets CLAUDE.md,AGENTS.md,DEPLOY_ROLLBACK_RUNBOOK.md
   ```
5. `doc-sync-automation.ps1 -AutoDetect` 跑一次

---

## 16. 與 v2 原版的關係

本計畫書（v2-light）**取代** v2，但保留 v2 的好設計：
- ✅ Sentry/Uptime/Netdata 三套 GitHub Issue 模板（對應不同處置策略）
- ✅ `claude-code-action@v1` 整合
- ✅ PR 中文摘要要求
- ✅ Incident ID 格式
- ✅ CLAUDE.md 自動維修紅線
- ✅ Branch protection
- ✅ 4 個 phase 的執行節奏

修正 v2 的：
- ❌ 自動 deploy 觸發
- ❌ n8n hot path lock-in
- ❌ Telegram 角色降級
- ❌ health/rollback/CI 重做
- ❌ Slack 過度切 channel
- ❌ 30 分鐘短 dedup
- ❌ 雙 approval 系統並存

---

## Related Documents

- `CLAUDE.md`（會 append §自動維修規則）
- `agency-os/AGENTS.md`（§長期營運紀律 加註）
- `agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md`（§2.1 sg-deploy.sh 是本系統 deploy step；§2.4 drift cron 設計概念延伸至此）
- `agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md`（Phase 2 三件套 — 本系統與其平行運作）
- `agency-os/docs/operations/SG_PHASE1_DOCKER_LAYOUT.md`（部署環境 SG/EU 邊界）
- `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`（強制路由 — 本系統不影響此規格）
- `runbooks/HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md`（Uptime Kuma triage 模板會 cross-ref）
- `agency-os/docs/CHANGE_IMPACT_MATRIX.md`（須加一行）

---

_本計畫書版本：v2-light · 2026-05-08 · 取代外部來源 v2（963 行原版）_
