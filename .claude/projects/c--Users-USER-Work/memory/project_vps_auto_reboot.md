---
name: project-vps-auto-reboot
description: "VPS 套件升級自動 reboot 系統 (B-Minimal, 2026-05-23) - SG/EU 兩台都已啟用 unattended-upgrades auto-reboot @ 20:00 UTC (04:00 TPE). 30-year 設計, 信任 Ubuntu 內建, 零自寫 wrapper. 不要重新提議自動化."
metadata: 
  node_type: memory
  type: project
  originSessionId: d574b37b-fcdc-468c-accb-147aa2d238b4
---

# VPS 套件升級自動 reboot 系統 (B-Minimal)

**部署日期**: 2026-05-23
**狀態**: 已部署於 SG (5.223.93.113, Ubuntu 24.04) + EU (204.168.175.41, Ubuntu 22.04)

## 結構

- **SSOT (apt conf)**:
  - `lobster-factory/infra/hetzner-phase1-core/auto-reboot/52awarewave-auto-reboot.conf` (base, both VPSes) — `Automatic-Reboot=true` / `Time=20:00` / `WithUsers=true`
  - `lobster-factory/infra/hetzner-phase1-core/auto-reboot/53awarewave-stagger-eu.conf` (EU only) — override Time to `20:30` (30 分鐘 stagger)
  - 部署路徑：`/etc/apt/apt.conf.d/`（52/53 編號 > stock 50，疊加不改 stock）
- **自動健康監控（操作者零記憶負擔）**：`scripts/check-vps-auto-reboot-health.ps1`
  - 由 `ao-resume.ps1` AUTO-CALL，**每次 AO-RESUME 自動跑**
  - SSH SG + EU 查 apt-config / SHA256 / daemon / reboot-required
  - 寫 `agency-os/reports/status/auto-reboot-LATEST.md` (+ .json)
  - AGENTS.md trigger rule 強制 AO-RESUME 必讀此檔，非 🟢 自動點名
- **Runbook**: `runbooks/VPS-AUTO-REBOOT-RUNBOOK.md`（操作原理 + rollback + monitoring）
- **手動 ad-hoc 重查**: `/auto-reboot-status` slash command（與 ps1 等價，但 ad-hoc 用，少需）
- **手動 fallback reboot**: `/sg-reboot` + `/eu-reboot`（保留作為 manual override）
- **AGENTS.md trigger**: §代理自動工具使用規則 reboot 訊號段 — 16h 未消失或 LATEST 非 🟢 才升級為手動

## 30-year 設計決策（為什麼是 B-Minimal）

當時操作者問「一勞永逸」，我先過度設計了 5 檔 wrapper（pre-reboot gate + systemd service + post-reboot healthcheck + Slack ping + install.sh），自我批判後收斂為 **2 行 apt conf**：

| 元件 | 我原本提的 | B-Minimal | 為什麼 less |
|------|----------|----------|------------|
| Pre-reboot gate | 自寫 bash 檢查 backup age | 移除 | `backup-health LATEST` 已每天告警 |
| Post-reboot health check | 自寫 curl 6 端點 | 移除 | uptime-kuma 60s 內偵測 |
| Boot-time Slack ping | 自寫 systemd oneshot | 移除 | netdata `post_update_reboot_status` flap 自然顯示 |
| Day-of-week 排程 | 自寫 cron timer | 移除 | 同晨雙 reboot ~5% 機率，30-90s 無感 |

**根本原則**：信任 Ubuntu 內建 + 既有監控；自寫代碼會 bit-rot；30 年穩定的東西不會是自寫腳本。

## 維護鏈（自動 + 人工 escalation）

```
unattended-upgrades 每日 06:00 UTC 裝 patch
  ↓ (若觸發 kernel/lib 級升級)
寫 /var/run/reboot-required
  ↓
等到當日 20:00 UTC (= 04:00 TPE) 自動 reboot (30-90s downtime)
  ↓
netdata post_update_reboot_status 1→0
  ↓
[如果 16 小時內仍 = 1] → AGENTS.md trigger rule 升級為手動
                       → Claude 自動跑 /sg-reboot 或 /eu-reboot pre-flight
```

## 不要重新提議

**FUTURE CLAUDE**: 看到 `post_update_reboot_status` 告警時的判斷：
1. 訊號時戳 < 16h → 「auto-reboot 將於下一個 20:00 UTC 處理」，**不主動跑** /sg-reboot
2. 訊號時戳 ≥ 16h → 升級為手動 pre-flight + 等操作者 go-ahead

不要：
- 重新提議「來把 VPS reboot 自動化吧」（已做）
- 提議裝 Livepatch（評估過，外部依賴只省 50%，不值）
- 提議改成「pre-reboot gate + post-flight check + Slack ping」的 wrapper（過度設計，已 critique 後拒絕）

## 衍生未完成（追蹤於 TASKS.md）

[[ops-inbox-clear-resolve-bug]] — 2026-05-23 P3 發現 `webhooks/netdata/route.ts:29-31` 對 CLEAR 訊號 skip 不 resolve + fingerprint 不穩。已寫 AUDIT_REGISTRY entry 與 TASKS 條目；目前 workaround = 手動 SQL UPDATE。

## 相關 memory

- [[feedback-inspect-before-design]] — 此次部署中再次驗證：先讀既有 routine pattern 比抽象研究強
- [[feedback-bug-hunt-protocol]] — P3 走 BUG_HUNT_PROTOCOL 把 webhook bug 寫進 AUDIT_REGISTRY
- [[feedback-test-review-default]] — P0 偵察 + P14 [驗證結果] 完整四動作

## 相關 commit

`<P15 commit hash will fill here when WORKLOG references it>`
