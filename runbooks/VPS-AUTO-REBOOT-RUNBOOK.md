# Runbook: VPS 套件升級自動 Reboot (B-Minimal)

> **🚨 2026-08-30 單機復活**：SG+EU 已於 2026-08-28 整併進 ks-aw-01，舊兩台已刪除退租；本文件下方大部分內容（雙機、53 stagger、`/sg-reboot`/`/eu-reboot`）描述的是**歷史拓樸**，機制本身**已在 ks-aw-01 重新啟用**（同一套 apt 原生機制，非重寫）。現況：
> - **SSOT** 改為 `lobster-factory/infra/hetzner-phase1-core/auto-reboot/ks-aw-01-auto-reboot.conf`（部署到同樣的 `/etc/apt/apt.conf.d/52awarewave-auto-reboot` 路徑，內容邏輯不變，只改敘述與時間——單機不需要 53 錯位檔）
> - **新增一塊 B-Minimal 原版沒有的東西**：`ks-aw-01-boot-health-notify.sh` + `ks-aw-01-boot-notify.service`（同目錄），**每次開機**（自動或手動）都跑健康檢查並用 Telegram 回報結果。這是單機拓樸特有的風險補強——雙機時代一台壞了另一台還在，沒人需要盯著 reboot 發生；單機現在一次 reboot 壞了就是全站掛，2026-08-30 操作者直接問「會不會壞掉而不知」，這塊就是答案。
> - **手動 reboot 指令**改為 `.claude/commands/ks-aw-01-reboot.md`（合併原 `/sg-reboot` + `/eu-reboot` 的 checklist 為聯集），`scripts/ao-resume.ps1` 的告警 escalation 已同步改指這支
> - `scripts/check-vps-auto-reboot-health.ps1` 已改回真的探測 ks-aw-01（先前因舊機刪除而短路成 `topology-retired` 假象，2026-08-30 隨本次啟用一併訂正，SHA256/daemon/pending 全部實測 🟢）
> - **這不是「daily reboot = daily 全站停機」**：apt 的 `Automatic-Reboot "true"` 只在真的有補丁在等重開機時才觸發（見下方機制圖），沒補丁的日子什麼都不會發生——這件事下方全文一直是對的，只是 TASKS.md 曾經把它誤講成「每天固定停機」，2026-08-30 已訂正
>
> **Established**: 2026-05-23（原始雙機設計，機制沿用至今）
> **SSOT for apt config（歷史，雙機時代）**: `lobster-factory/infra/hetzner-phase1-core/auto-reboot/52awarewave-auto-reboot.conf`
> **Applies to（歷史，雙機時代）**: SG VPS (`5.223.93.113`) + EU VPS (`204.168.175.41`)
> **Replaces（歷史）**: 手動 `/sg-reboot` / `/eu-reboot`，現由 `/ks-aw-01-reboot` 取代

---

## 1. 此 runbook 解什麼問題

**問題類型**：30 年級重複事件

每 1-2 週，Ubuntu `unattended-upgrades` 自動裝 kernel / glibc / openssl / systemd 等安全 patch，這些套件**必須 reboot 才生效**。Linux 寫 `/var/run/reboot-required` marker；netdata 監測；告警鏈一路傳到 Slack `#infra-alerts` + Ops Inbox。

之前的處理鏈是純手動：操作者讀告警 → 跑 `/sg-reboot` 或 `/eu-reboot` runbook。

**問題**：
- 2026-05-21 EU 套件升級 → 操作者逾期 22 小時才處理
- 2026-05-23 SG 套件升級 → 操作者逾期 4+ 小時才處理
- 30 年 × 12-24 次/年 = ~720 次手動 reboot 點按，**不可持續**

**B-Minimal 設計**：信任 Ubuntu 內建 `unattended-upgrades::Automatic-Reboot` 機制 + 既有 netdata/uptime-kuma/backup-health 監控；不寫任何客製 wrapper。

---

## 2. 此 runbook **不**解的問題

| 場景 | 仍走原路徑 |
|------|----------|
| 緊急 reboot（kernel panic、disk corrupt、處理入侵） | `/sg-reboot` / `/eu-reboot` 手動 |
| Hetzner GRUB 新 kernel 開機失敗 | Hetzner Cloud Console + `apt-mark hold linux-image-X` |
| Container 大規模 unhealthy 需重啟 host | 手動 + 先排查根因 |
| Reboot 前需 staging 演練 | 手動 + 預先準備 |

---

## 3. 自動化行為（after deploy）

```
每日 06:00-06:30 UTC (cron) - unattended-upgrades 跑
   ↓
若套用了 kernel/lib 級 patch → 寫 /var/run/reboot-required
   ↓
unattended-upgrades 服務監測：「設定 Automatic-Reboot=true 且 marker 存在」
   ↓
等到當日 20:00 UTC (= 04:00 TPE) 自動執行 systemctl reboot
   ↓
Ubuntu 走標準 graceful shutdown:
   ├─ Docker daemon 收 SIGTERM
   ├─ 容器收 SIGTERM (有 SIGTERM-aware 的會自己保存狀態; e.g. postgres)
   ├─ 容器 30 秒內未停 → SIGKILL
   └─ systemd 結束，kernel reboot
   ↓
新 kernel 啟動，systemd 把 docker.service 起來
   ↓
docker 依 restart=unless-stopped 拉起所有容器
   ↓
container healthcheck 在 30-90 秒內回 healthy
   ↓
netdata 重新評估 /var/run/reboot-required → marker 消失 → post_update_reboot_status=0
   ↓
uptime-kuma 偵測端點 200 OK
```

**預期影響**：30-90 秒 downtime，落在 04:00 TPE（操作者熟睡，US 客戶下班後，EU 客戶深夜，亞洲尚未上班）。

---

## 4. 套用步驟（首次部署 / 新 VPS）

### 4.1 Pre-flight

1. 確認 OS 是 Ubuntu LTS：`cat /etc/os-release | grep VERSION_ID`
2. 確認 `unattended-upgrades` 套件已裝且 active：`systemctl is-active unattended-upgrades` → `active`
3. 確認 `/etc/apt/apt.conf.d/20auto-upgrades` 含 `APT::Periodic::Unattended-Upgrade "1";`
4. 確認 TZ：`timedatectl | grep -i zone` — 必須是 `Etc/UTC`，否則需調整 conf 的 `Automatic-Reboot-Time`
5. 確認無已存在的 `Automatic-Reboot` 設定衝突：
   ```bash
   grep -rh "Automatic-Reboot" /etc/apt/apt.conf.d/ 2>/dev/null
   ```
   應為空（pre-deploy）。

### 4.2 Deploy

```bash
# 從 dev 機 scp 上傳 SSOT
scp lobster-factory/infra/hetzner-phase1-core/auto-reboot/52awarewave-auto-reboot.conf \
    root@<vps>:/etc/apt/apt.conf.d/52awarewave-auto-reboot

# 或從 git pull 後本機 cp（若 repo 已部署到 VPS）
ssh root@<vps> 'cp /root/<repo-path>/lobster-factory/infra/hetzner-phase1-core/auto-reboot/52awarewave-auto-reboot.conf /etc/apt/apt.conf.d/52awarewave-auto-reboot'
```

### 4.3 Post-deploy 驗證

```bash
# 1. 檔案存在 + 權限正確 (root:root, 0644)
ssh root@<vps> 'ls -la /etc/apt/apt.conf.d/52awarewave-auto-reboot'

# 2. apt-config 真的讀到設定（這才是 ground truth）
ssh root@<vps> 'apt-config dump | grep -i "Automatic-Reboot"'
# 預期輸出:
# Unattended-Upgrade::Automatic-Reboot "true";
# Unattended-Upgrade::Automatic-Reboot-Time "20:00";
# Unattended-Upgrade::Automatic-Reboot-WithUsers "true";

# 3. dry-run 模擬 unattended-upgrade 行為（不真重啟）
ssh root@<vps> 'unattended-upgrade --dry-run -d 2>&1 | tail -30'
# 找含 "Will reboot" 或 "No reboot required" 的行
```

### 4.4 Smoke test（部署後第一個自動 reboot 週期）

等下一輪 unattended-upgrades 套用 kernel patch 後，**監聽** 20:00 UTC：

```bash
# 在 dev 機（or operator's phone via Telegram）
# 20:00 UTC ± 5 min 應收到:
# - Uptime Kuma incident notification (brief down)
# - Slack #infra-alerts: netdata system.post_update_reboot_status flap (1 → 0)
# - 21:00 UTC 後驗證:
ssh root@<vps> 'last reboot | head -3'
# 應看到剛剛的 reboot 時間
ssh root@<vps> 'uname -r'
# kernel 是新版
ssh root@<vps> 'ls /var/run/reboot-required* 2>&1'
# 應為 "No such file or directory"
```

---

## 4.5. 狀態查詢（自動 + 手動）

### 自動（你不需要記任何指令）

**每次 AO-RESUME 自動跑** `scripts/check-vps-auto-reboot-health.ps1`，產出：

- `agency-os/reports/status/auto-reboot-LATEST.md` — 人類讀的 verdict 表
- `agency-os/reports/status/auto-reboot-LATEST.json` — 機器讀的完整 snapshot

**AGENTS.md trigger rule** 規定 AO-RESUME 七段式必讀此檔，若非 🟢 healthy 或有 pending reboot 會於系統快照段點名。**這是真自動化** — 你只要每天開 IDE 就會看到，不需要記任何指令。

### 手動 ad-hoc 重查（少用）

如果想立即重跑（例如剛改完 conf 想驗證），兩種等價路徑：

```
/auto-reboot-status
```

或在 PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-vps-auto-reboot-health.ps1
```

兩者都 SSH SG + EU 查同樣項目：apt-config 三鍵 / 52 + 53 SHA256 / daemon / reboot-required / 最近 reboot。Read-only，無風險。

## 5. 監控訊號（自動化 ON 後，操作者該怎麼看）

| 訊號 | 含義 | 操作 |
|------|------|------|
| netdata `system.post_update_reboot_status` flap 1→0 在 20:00-20:05 UTC | 自動 reboot 成功 | 無 — 預期行為 |
| netdata flap **未** 在 20:00 UTC 後 16 小時內回 0 | 自動化失敗 | 走 `/sg-reboot` 或 `/eu-reboot` 手動 runbook |
| Uptime Kuma 多個 monitor 同時 down > 5 分鐘 | reboot 後容器沒回來 | 立即手動處理 — Hetzner Console 或 SSH 登入排查 |
| Slack #infra-alerts 連續 2 週 quiet（無 reboot 告警） | OS 沒有需要 reboot 的 patch；正常 | 無 |
| backup-health LATEST 顯示 FAIL 且當日 20:00 reboot 仍照常發生 | 風險：reboot 前最近 backup 可能過時 | 評估是否需手動 rollback 或 staging 演練 |

---

## 6. Rollback / 停用

完全可逆。

### 6.1 暫時停用一晚（例如：今晚要做 staging 演練不想被打斷）

```bash
ssh root@<vps> 'mv /etc/apt/apt.conf.d/52awarewave-auto-reboot /etc/apt/apt.conf.d/52awarewave-auto-reboot.disabled'
# 第二天恢復:
ssh root@<vps> 'mv /etc/apt/apt.conf.d/52awarewave-auto-reboot.disabled /etc/apt/apt.conf.d/52awarewave-auto-reboot'
```

### 6.2 永久 rollback

```bash
ssh root@<vps> 'rm /etc/apt/apt.conf.d/52awarewave-auto-reboot'
# 回到「自動裝 patch，不自動 reboot」狀態（= 2026-05-22 之前的行為）
# 手動 reboot 仍可透過 /sg-reboot 或 /eu-reboot runbook
```

對應 git 動作：`git revert` 包含此 runbook 與 SSOT conf 檔的 commit。

---

## 7. 已知 caveats

1. **同晨 SG + EU 雙重啟**：Ubuntu CVE 通常週二批次發佈，兩台都接到同 patch 時會在同一個 20:00 UTC 重啟。30-90s 雙服務同步 down，**已接受**（04:00 TPE 影響極小）。若未來需要錯開，可改 EU `Automatic-Reboot-Time "20:30"`（30 分鐘錯位）。
2. **`Automatic-Reboot-WithUsers "true"`**：意思是即使有 SSH session 連著（例如操作者半夜登入排查），仍會 reboot；若要更保守可改 `"false"`，但會導致 SSH 久連時自動化失效。
3. **不影響容器 image 更新**：apt 只動 OS 層級套件。Docker image（含 ClickHouse `25.7.5` 鎖定）不被觸碰。
4. **不適用於非 Ubuntu**：未來若加 Debian / Alma / RHEL 系統，需另寫對應方案。
5. **`/var/run/reboot-required` 由 `update-notifier-common` 寫**：若該套件被移除（極不可能），auto-reboot 不會觸發。`MAINTENANCE_CALENDAR.md` 月檢可確認。

---

## 8. 相關 SSOT / 參考

- apt conf：`lobster-factory/infra/hetzner-phase1-core/auto-reboot/52awarewave-auto-reboot.conf`
- 手動 runbook（保留）：`~/.claude/commands/sg-reboot.md` + `~/.claude/commands/eu-reboot.md`
- Trigger rule（AGENTS.md）：`agency-os/AGENTS.md` §代理自動工具使用規則 reboot 訊號分支
- 維護日曆：`lobster-factory/infra/hetzner-phase1-core/MAINTENANCE_CALENDAR.md`
- 長期 ops 紀律：`lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md`
- WORKLOG 落地紀錄：`agency-os/WORKLOG.md` §2026-05-23 SG VPS reboot + B-Minimal
- 30 年治理：`agency-os/docs/operations/BUG_HUNT_PROTOCOL.md` Tier 4b（stack-change triggered audit）

---

## 9. 衍生未完成項目（追蹤於 TASKS.md）

- [ ] **Ops Inbox netdata CLEAR auto-resolve bug** — 2026-05-23 在做 P3 時發現 `webhooks/netdata/route.ts:29-31` 對 CLEAR signal 只 skip 不 resolve；且 fingerprint 含 alarm value 不穩定。每次 auto-reboot 後仍會留下 stale incident。需單獨 PR 修 fingerprint + 加 active resolve。詳見 `agency-os/docs/operations/AUDIT_REGISTRY.md` 對應 entry。
