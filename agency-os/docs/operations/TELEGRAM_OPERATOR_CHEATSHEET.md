# Telegram 操作者 Cheat Sheet（出國 / 沒筆電 必看）

> **誰用**：你（操作者，唯一）
> **何時用**：出國、在外、半夜不想開電腦、急需控制系統時
> **owner doc**：本檔
> **其它技術文件**（架構／policy／schema）：見 §10 Related
> **🚨 現役連線（2026-08-31）**：緊急時只連 **ks-aw-01**：Hostname `145.239.195.47` / Port `58122` / Username `ubuntu` / key `id_ed25519`。前任與舊 EU/SG 主機皆已退場。

---

## 0. 出國前 5 分鐘自我檢查（**必跑**）

在家用 4G 模擬國外網路，跑這 5 步：

| # | 動作 | 預期 PASS 標誌 |
|---|------|--------------|
| 1 | 手機關 wifi / 用 4G | — |
| 2 | Termius 連 ks-aw-01（`145.239.195.47` / port `58122` / user `ubuntu`（+sudo）/ key `id_ed25519`）| 看到 `ubuntu@ns31414856:~$` |
| 3 | `whoami && sudo ls /root/lobster-phase1/scripts/sg-deploy.sh` | `ubuntu` + 路徑存在 |
| 4 | `sudo /root/lobster-phase1/scripts/sg-deploy.sh next-admin --dry-run` | rsync 輸出 + exit 0 |
| 5 | `sudo docker ps --format '{{.Names}} {{.Status}}'` | `lobster-next-admin Up X (healthy)` |

5 步全綠 = 你出國能應急。任一步卡住，**現在**解決比國外解決容易 10×。

---

## 1. 三個工具的角色

| 工具 | 角色 | 國外能用？ |
|------|------|---------|
| **Telegram bot** `@awarewave_ops_bot` | 遙控器（你下指令）+ 手機備援通知 | ✅ 任何網路 |
| **Slack** `#infra-alerts` / `#ops-incidents` | 系統主要通知面；`#ops-incidents` 是人工第一入口 | ✅ |
| **Telegram bot DM** | 對講機備用：endpoint 掛掉/恢復、deploy drift、Ops Inbox 中高優先事故 | ✅ Slack 漫遊 / 靜音時的保險 |
| **Web ops console**（`app.aware-wave.com/ops/...`）| 🛠️ 工具箱（複雜操作 + 高風險簽核）| ✅ 手機瀏覽器 + Clerk SSO 登入 |
| **Termius**（手機 SSH）| 🔧 螺絲起子（部署、看 log、跑腳本）| ✅ 任何網路 |

**家裡電腦關機 100% 不影響**。所有東西跑在 SG/EU VPS + 雲端。

---

## 2. 緊急 SOP（出事按順序試）

```
Slack #ops-incidents 或 Telegram 推播警報
        ↓
① 手機 Telegram /status
        ↓ 看狀況
② 嚴重 → /emergency_stop（鎖系統，先保命）
        ↓
③ 看是否能等回家：
   能等 → 留鎖、回家再修
   不能等 → ④
        ↓
④ Termius SSH 上 SG → /sg-deploy 或人工
        ↓
⑤ 修完 → 手機瀏覽器 app.aware-wave.com/ops/system-modes → 解鎖
        ↓
⑥ /status 再確認
```

---

## 3. Telegram 指令清單（按使用情境）

> 開 Telegram → 跟 `@awarewave_ops_bot` 對話 → 打 `/` 出選單

### 3.1 看狀態（隨便用，安全）🟢

| 指令 | 用途 |
|------|------|
| `/start` 或 `/help` | bot 簡介、指令清單 |
| `/status` | 系統當前狀態 + 最近 5 個指令 + 開放 incident |
| `/health` | 24h 錯誤計數 |
| `/daily_review` | 24h AI 摘要（會花 ~10 秒）|
| `/weekly_review` | 7 天 AI 摘要（會花 ~20 秒）|
| `/list_failed_runs` | 最近失敗的 workflow runs |
| `/client_status` | 最早 30 個有網站的客戶健康狀態 + WordPress 更新摘要（顯示總數；看其他客戶用 `/client_status <slug>`） |
| `/client_status soulful` | 單一客戶詳細狀態、plugin wave、最近更新結果 |

### 3.2 緊急鎖（中風險，但你只能鎖自己系統）🟡

| 指令 | 效果 |
|------|------|
| `/emergency_stop` | 🛑 全鎖 — 所有指令都被擋下 |
| `/maintenance_mode` | 🔧 維護模式 — low-risk 仍允許 |
| `/read_only_mode` | 🔒 唯讀模式 — 只允許 low-risk 讀取 |

> ⚠️ **解鎖回 normal 不能從 Telegram**（policy 硬擋）。必須從 web ops console（§4）。

### 3.3 觸發 workflow（中風險）🟡

| 指令 | 用途 |
|------|------|
| `/trigger_staging_workflow ao-infrastructure-check` | 觸發 staging workflow（白名單只有這條） |
| `/replay_dead_letter <uuid>` | 看某個失敗的 dead-letter event 細節（不會自動 retry） |

### 3.4 WordPress 維護指令（規劃中，尚未上線）

這些是 MainWP + WPvivid safe update routine 的預定 Telegram 介面。現在先不要期待 bot 選單會出現；handler 上線前，未知指令仍會被 policy 擋下。

| 指令 | 風險 | 用途 |
|------|------|------|
| `/wp_backup_status [client]` | 低 | 查 WPvivid 最近備份、備份範圍、遠端儲存狀態 |
| `/wp_update_plan <client>` | 低 | 查待更新 plugin 與 wave 分類，不執行更新 |
| `/mainwp_sync_status` | 低 | 查 MainWP child sites 是否能同步 |
| `/wpvivid_storage_audit` | 低 | 查 Dropbox/Google Drive/S3 空間是否快滿 |
| `/wp_safe_update <client> <wave>` | 高 | 只建立簽核請求；不能從 Telegram 直接更新 production |

操作原則：production plugin update 前必須先通過 `agency-os/docs/operations/MAINWP_WPVIVID_CLIENT_BACKUP_RUNBOOK.md` 的 backup gate。

### 3.5 高風險（**永遠**從 Telegram 擋下）🔴

從 Telegram 打這些指令，**只會 queue 在 ops console** 等簽核，不會直接執行：

- `/normal_mode`（解鎖 emergency_stop — 必須從 web 簽核）
- `/deploy_production`（尚無 handler，目前任何 deploy 走 Termius SSH）
- `/refund` / `/dns_change` / `/rotate_secrets`（尚無 handler）

### 3.6 危險指令（**永遠**擋下，連 queue 都不會）⛔

```
/drop_table /read_secrets /destructive_migration
/cross_tenant_export /disable_killswitch
```

從 Telegram 打 = 直接 `blocked_by_policy`。設計如此，你**不能**繞過。

---

## 4. 解鎖系統（從手機瀏覽器）

### 4.1 一般情況（建議）

1. 手機瀏覽器開 https://app.aware-wave.com/ops/system-modes
2. Clerk SSO 登入（Google + 2FA / passkey）
3. 看到「目前模式：emergency_stop（🛑）」
4. 下拉選 `normal` → 填理由（例：「上游事故已解決」） → 按【🔓 解鎖為 normal】
5. 確認 dialog → 完成

### 4.2 簽核 Telegram 來的高風險指令

1. 手機瀏覽器開 https://app.aware-wave.com/ops/approvals
2. 看到「待簽核指令」清單
3. 點【核准】→ 確認 dialog → 完成

### 4.3 最後手段（**前面兩個都壞了**才用）

只有 web ops console 完全壞掉、Telegram 也下不了指令時，從 Termius SSH 直接打 SQL：

```bash
# Termius 連 ks-aw-01（Supabase host）
ssh -i ~/.ssh/id_ed25519 -p 58122 ubuntu@145.239.195.47
sudo -i

# 進 Postgres（細節見 CREDENTIALS.md §三 進入方式 C）
docker exec -it supabase-db psql -U postgres

# UPDATE 解鎖
UPDATE public.system_modes
SET mode='normal', reason='emergency manual unlock', set_at=now()
WHERE scope_type='global' AND scope_id IS NULL;

# 確認
SELECT mode, reason, set_at FROM public.system_modes WHERE scope_type='global';
```

這條是核武器 — 沒走 audit、沒走 RBAC、寫不進 ops_audit_events。**正常情況不要用**。

---

## 5. Termius Snippets 建議（提前存好）

開 Termius → SG host → Snippets → 新增：

| Snippet 名 | 指令 |
|-----------|------|
| `🔍 status` | `docker ps --format 'table {{.Names}}\t{{.Status}}'` |
| `📋 deploy next-admin` | `/root/lobster-phase1/scripts/sg-deploy.sh next-admin` |
| `📋 deploy --dry-run` | `/root/lobster-phase1/scripts/sg-deploy.sh next-admin --dry-run` |
| `📊 drift log` | `tail -50 /var/log/sg-deploy-drift.log` |
| `📊 deploy log` | `ls -t /root/lobster-phase1/logs/sg-deploy-*.log \| head -1 \| xargs tail -100` |
| `🔄 restart next-admin` | `cd /root/lobster-phase1 && docker compose restart next-admin` |
| `⚠️ rollback` | `bash /root/lobster-phase1/scripts/rollback-phase1.sh next-admin` |

**部署前永遠先跑 `📋 deploy --dry-run`** 看 rsync 變更清單，再跑真的部署。

---

## 6. 常見情境劇本

### 6.1 「Slack 跳警告：next-admin 503」

```
1. Telegram /status → 確認 admin 真掛
2. Termius SSH → docker ps → 看 lobster-next-admin 狀態
3a. 如果 unhealthy → docker restart lobster-next-admin → 等 30 秒 → /status 看好沒
3b. 如果 image 出問題 → /sg-deploy（重 build）
4. 修復 → Slack 自動回收 alert
```

### 6.2 「Slack 跳警告：drift behind 5 commits」

```
今天剛 push 過 → 通常該重 deploy
1. 不急 → 等回家
2. 急 → Termius → /sg-deploy next-admin → 等 healthcheck
3. 跑 /check-drift（從 Claude Code 桌前才能跑；手機上看 deploy log 確認）
```

### 6.3 「我發現有奇怪流量／可能被攻擊」

```
1. Telegram /emergency_stop → 立刻全鎖
2. Termius SSH → 看 nginx access log:
   tail -100 /var/log/nginx/access.log
3. 看 IP 模式判斷
4. 嚴重 → 暫不解鎖、等回家詳查
5. 誤判 → web ops console 解鎖回 normal
```

### 6.4 「半夜兩點 Sentry 跳 critical error」

```
1. 看清楚是不是 false positive（Sentry 偶有測試噪音）
2. 真的 critical → /emergency_stop 鎖（保命，避免錯誤擴散）
3. /list_failed_runs 看詳情
4. 不急 → 留鎖到隔天早上
5. 急（影響客戶）→ Termius → 看 log → /sg-deploy 重 build（如果是 env / build 問題）
   或 → docker restart（如果是暫時性 OOM）
```

### 6.5 「Termius 連不上、網路通但 SSH 卡住」

```
1. 換網路（4G ↔ wifi 切）
2. 如果 Hetzner 機房斷網（很罕見）→ 等 + 看 Hetzner status
3. 同時 Slack 告警頻道應該也會跳（Uptime Kuma 偵測到下行）
4. 撐到回家用筆電查
```

---

## 7. 不能做的事（從手機）

| 不能做 | 為什麼 | workaround |
|--------|------|------|
| 寫 / 改 code | 沒 IDE、key 鍵盤過小 | 等回家或租筆電 |
| 自動部署 production | High-STOP 紅線（CLAUDE.md 規定）| Termius SSH 跑 sg-deploy.sh（手動觸發 OK） |
| 跑 Claude Code 寫 PR | 手機沒 Claude Code 桌面版 | Claude.ai web 可開但功能受限 |
| 跨機 vault 存取 | DPAPI 綁本機 Windows 帳號 | 從 SG `.env` 讀取（細節見 CREDENTIALS.md §三 + §十五）|
| 改 governance docs（治理檔）| 需 doc-sync + verify gates | 留 git issue 給自己回家補 |

---

## 8. SSH key 與 Termius 設定（出國前準備）

### 8.1 把 SSH private key 弄到手機（**最安全**）

**A. 加密 zip + 雲端**（推薦）：

```powershell
# 在家用電腦
cd $env:USERPROFILE\.ssh

# 7zip 加密壓縮（記住密碼）
7z a -tzip -p"<強密碼>" -mhe=on id_ed25519.zip id_ed25519

# 上傳 iCloud Drive / Google Drive
# 手機開檔 → 解壓（輸入密碼）→ Termius Keychain → Import
```

**B. AirDrop / Quick Share**（小心）：
- ⚠️ 只在「同一房間、雙方信任設備」時用；**不**在公共網路
- AirDrop 是端對端加密，但解開後 key 就在手機檔案系統裡

**C. Termius Pro 雲同步**（付費）：
- desktop 端登入 → import → 同步 → 手機端登入即同步
- 約 $9 USD/月，solo operator 不必要

### 8.2 主機設定（唯一主機 ks-aw-01；舊 SG/EU 已於 2026-08-31 退租）

```
Address:   145.239.195.47
Port:      58122
Username:  ubuntu      (root 操作一律 sudo)
Auth:      Key (id_ed25519)
Label:     ks-aw-01
```

### 8.3 雲端裝置遺失時的應變

如果手機掉了 / 被偷：

1. 立刻把手機上的 key 從主機撤下（任何能 SSH 的機器；都不能連時用主機商管理面板的 rescue／KVM 主控台）：
   ```bash
   sed -i '/<指紋>/d' /home/ubuntu/.ssh/authorized_keys
   sudo sed -i '/<指紋>/d' /root/.ssh/authorized_keys
   ```
2. 同時換 vault 中所有 token（Telegram bot revoke、Anthropic key rotate 等）— 細節見 `agency-os/docs/operations/mcp-secrets-hardening-runbook.md`
3. 換新 key pair → push 公鑰到 server → 手機端 import 私鑰

---

## 9. 真的失聯時的最後溝通管道

如果 Telegram bot、Slack、Web ops console 全部都壞了：

1. **Hetzner 管理面板**：https://console.hetzner.com → 從 web 登入 → 用 web console 直接操作 server（密碼登入已禁用，但 web console 是 KVM 級存取，不需 SSH）
2. **Cloudflare 管理面板**：DNS / WAF 急救
3. **GitHub web**：手動編輯檔案、merge PR

這些雲端 SaaS console 是「**最後絕對能進去**」的後門。記住帳號密碼（CREDENTIALS.md §一 / §六）。

---

## 10. Related Documents

技術／設計文件（不是給操作者看的）：

- `agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md` — owner doc，整體架構
- `agency-os/docs/operations/ALWAYS_ON_COMMAND_PLANE_OPERATIONS.md` — 維運手冊（換 token、smoke test）
- `agency-os/docs/operations/MAINWP_WPVIVID_CLIENT_BACKUP_RUNBOOK.md` — MainWP + WPvivid 備份 gate / WordPress safe update routine
- `agency-os/docs/operations/TELEGRAM_COMMAND_POLICY.md` — 25 個指令 policy 詳細
- `lobster-factory/packages/db/migrations/0025_always_on_command_plane.sql` — schema
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/command-plane/policyEngine.ts` — RISK_TABLE 真相

機密與啟動：

- `C:\Users\user1115\Desktop\AWARE_WAVE_CREDENTIALS.md` §24 — Telegram bot token、webhook secret
- `mcp/registry.template.json` — MCP server registry

部署相關：

- `agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md` §2.1 — sg-deploy.sh 標準路徑
- `agency-os/docs/operations/SG_PHASE1_DOCKER_LAYOUT.md` — SG VPS 佈局

緊急應變：

- `runbooks/HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md`
- `runbooks/HETZNER-SERVER-SECURITY-INCIDENT-CRYPTO-MINER.md`
- `runbooks/SERVER-SECURITY-BREACH-RESPONSE-PLAYBOOK.md`

---

## 11. 30 年穩固性自盤

- ✅ **單一主人**：本檔是 Telegram 操作者唯一 cheat sheet；技術文件分工不重疊
- ✅ **不重工**：指令清單來自 `policyEngine.ts` RISK_TABLE（單一真相）；URL 連到既有 owner docs
- ✅ **可擴充**：新增指令只需更新 §3 對應分組
- ✅ **可刪減**：移除指令僅需從 §3 刪除 row，不影響系統
- ✅ **不依賴單一機器**：所有 SOP 在 Hetzner / 雲端 SaaS / GitHub 之間操作；你的個人電腦可關機
- ✅ **失聯後備**：§9 列出最後備案路徑（Hetzner web console / Cloudflare dashboard）

---

_Last updated: 2026-05-09 · 出國前必讀 · 印一份在皮夾錢包都不為過_
