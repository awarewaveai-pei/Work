# Runbook: VPS 套件升級自動 Reboot (B-Minimal)

> **Established**: 2026-05-23
> **SSOT for apt config**: `lobster-factory/infra/hetzner-phase1-core/auto-reboot/52awarewave-auto-reboot.conf`
> **Applies to**: SG VPS (`5.223.93.113`) + EU VPS (`204.168.175.41`)
> **Replaces (default behavior, NOT runbook)**: 手動 `/sg-reboot` / `/eu-reboot` 仍保留作為 emergency / forced override 路徑

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

## 4.5. 快速狀態查詢（slash command）

部署後任何時候可跑：

```
/auto-reboot-status
```

這個 slash command（[`~/.claude/commands/auto-reboot-status.md`](../.claude/commands/auto-reboot-status.md)）會 SSH 進 SG + EU，並列查：
- `apt-config dump` 三個 Automatic-Reboot 鍵值
- 52 / 53 conf 檔 SHA256（對照 repo SSOT 是否漂移）
- `unattended-upgrades` daemon active/enabled
- `/var/run/reboot-required` 是否存在（待 reboot）
- 最近 3 次 reboot 時間

回報格式：一張表 + 一行 verdict（🟢/🟡/🔴）。Read-only，無風險。

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
