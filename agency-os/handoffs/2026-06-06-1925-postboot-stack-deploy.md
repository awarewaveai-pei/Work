---
slug: postboot-stack-deploy
created_utc: 2026-06-06T19:25:17Z
hint: "客戶機開機後全棧部署+維護層 provider無關 BYO R0計畫已寫完未實作 next P1抽共用硬化"
source_session_summary: "Hetzner 一鍵租機+硬化+DNS 程式+真機驗證完成後，發現新機只是『安全空機』，缺 production 等級的全棧部署+維護；寫了 R0 計畫補這缺口"
---

# 客戶機「開機後全棧部署 + 維護」層（provider 無關）— 實作 R0 計畫

## 1. 任務目標
讓「一鍵架站」開出來的機（或客戶自帶的別家機）**自動部署成 production 等級全副武裝**：Docker + observability(Grafana+Loki+Netdata+Sentry+Uptime) + 快取加速 + swap + 備份 + 限速/WAF/fail2ban。**計畫已寫完，未實作。**

## 2. 為什麼做
現在自動化只開「安全空機」（防火牆/SSH/重開機硬化，已真機驗過），但 production 那 2 台有一整套持續維護+監控+加速，新機完全沒有。客戶機可能在別家（Vultr/DO/自帶）→ 部署層必須 provider 無關。

## 3. 已試過
- 機層「租 Hetzner+硬化+DNS」**已完成+真機驗證**（cpx12@sin，見 WORKLOG 2026-06-06 Phase 4 / `HETZNER_PROVISIONING_HANDBOOK.md`）。
- agent 全盤盤點 production 部署：**料件 90%+ 現成可復用**，唯一缺「一個編排腳本把它們串起來」。
- 完整 R0 計畫已寫：`$WORK_ROOT/lobster-factory/docs/hosting/SERVER_STACK_DEPLOYMENT_PLAN.md`（含現況分析 file:line / 7 風險 / 3 方案 / 5 階段）。

## 4. 卡在哪
未開始實作。等批准。**最大紅線：禁止重寫既有 compose/腳本，只能「編排」**（90%+ 已存在，重寫=違反 R0 零重工）。

## 5. 下一步指令（依計畫 5 階段，全 env-gate + dry-run 預設安全）
1. **讀計畫** `$WORK_ROOT/lobster-factory/docs/hosting/SERVER_STACK_DEPLOYMENT_PLAN.md`（建議方案=分兩層：機層 provider-specific / bootstrap 層 provider-agnostic 純 SSH）。
2. **P1 抽共用硬化**：把 `packages/workflows/src/hosting/providers/hetzner/cloudInit.ts` 的硬化規則抽成純 shell `infra/hetzner-phase1-core/scripts/harden-server.sh`（firewall v4+v6 / SSH drop-in / fail2ban / auto-reboot / sysctl / **swap**(缺口,新增 fallocate)）。cloud-init 與 bootstrap 都呼叫它=單一 SSOT。`bash -n`+shellcheck 驗。
3. **P2 編排器** `scripts/provision-stack.sh`：8 步依序**呼叫既有腳本**（base-install→harden→deploy-stack(既有 sg-deploy 模式)→observability(既有 deploy-observability-vps.sh)→maintenance(既有 install-maintenance-crons.sh)→offsite-backup(既有 setup-offsite-backup.sh)→security(cp nginx/fail2ban/auto-reboot conf)→verify)。參數 `--role/--skip/--dry-run/--host`。
4. **P3 BYO adapter**：`serverAdapterFactory.ts` 加 `byo` mode（客戶自帶機，input 含 sshHost，不呼叫雲 API，回 provisioned ref）。
5. **P4 接 provisionClient**：拿到 ref 後多一步呼叫 bootstrap（env-gate `LOBSTER_BOOTSTRAP_ENABLED` 預設 OFF）+ 站層 WP install 併入。
6. **P5 真機驗收**（隔離 project lobster-staging，~€0.01）：開 cpx12→全 8 步→SSH 驗(docker ps stack/curl 127.0.0.1:3009 Grafana/crontab 備份/swapon/iptables v4+v6/fail2ban-client status)→銷毀。BYO 驗：非 Hetzner 機跑一次。
7. 每階段 R0 四動作寫 WORKLOG。

## 6. 相關資源
- **計畫 SSOT**：`lobster-factory/docs/hosting/SERVER_STACK_DEPLOYMENT_PLAN.md`
- 機層已完成：`HETZNER_PROVISIONING_HANDBOOK.md`、`provisionClient.ts`、`serverAdapterFactory.ts`、`cloudInit.ts`
- **現成可復用料件**（全在 `lobster-factory/infra/hetzner-phase1-core/`）：`docker-compose{,.observability,.staging}.yml`、`scripts/{sg-deploy,install-maintenance-crons,backup-phase1,verify-backup,setup-offsite-backup,deploy-observability-vps,rollback-phase1}.sh`、`nginx/{aware-wave-security,cloudflare-real-ip}.conf`+`system-sites/scanner-block.inc`、`fail2ban/jail.d/`、`netdata/health.d/aware-wave.conf`、`auto-reboot/52awarewave-auto-reboot.conf`、`observability/`
- **Landmines**：① 禁止重寫既有腳本/compose，只編排 ② host 偵測對新機失效→顯式 `--host` ③ 客戶自帶機沒經 cloud-init→bootstrap 必須也套 harden ④ swap 無現成腳本(P1 補) ⑤ BYO 在客戶既有機跑要先 dry-run+備份其設定 ⑥ `.env` 含密碼不入 git/不 log，走 vault/SSH 注入 ⑦ Uptime Kuma 架構待確認(可能 SaaS)
