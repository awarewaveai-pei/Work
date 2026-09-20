---
name: provision-client
description: Rent and harden a new VPS for a client (day-1 hardening plus DNS). HIGH-RISK: spends money and creates an external host.
disable-model-invocation: true
---

# /provision-client — 一鍵租主機 + day-1 硬化 + DNS（Decision 0 Phase-1 觸發）

> 主機商依客戶而定（Hostinger / SiteGround / Cloudways / OVH 皆可能）。不要假設 Hetzner：我方自用主機 ks-aw-01 已不在 Hetzner。供應商在 adapter seam 選，不硬綁。

呼叫 `provisionClient` 編排器（SSOT），替新客戶租主機。觸發層之一（之後 app 按鈕 Phase 5 呼叫同一支）。

## 安全預設（重要）
- **預設 dry-run / mock，不花錢、不碰真機。**
- 真實 billable 開機需**同時**：`LOBSTER_SERVER_ADAPTER=hetzner_cloud` **且** `LOBSTER_SERVER_PROVISION_ENABLED=true`（雙閘）+ `HETZNER_STAGING_TOKEN` 已填（Phase 4 前提）。
- 真機開機 = High risk = 需操作者明示 go-ahead，**不自動跑**。

## 用法

```bash
cd lobster-factory/packages/workflows
# dry-run（預設，不花錢）— 先驗整條鏈
LOBSTER_SERVER_ADAPTER=mock npx tsx src/provision/cli.ts \
  --site-id <uuid> --site-name "Acme Shop" --org-id <uuid> \
  --tier business [--region sin] [--domain acme.aware-wave.com]
```

參數：
- `--tier` starter|business|commerce|premium → 自動帶 serverType（cpx11/21/31/41，D6）
- `--region` 預設 `sin`（Singapore 交付平面；控制平面 hel1 不放 public runtime）
- `--domain` 給了才建 Cloudflare A-record（需 `CLOUDFLARE_API_TOKEN`+`CLOUDFLARE_ZONE_ID`）

## 輸出 status
`idle`(none) / `mock` / `dry_run`(含 plan) / `provisioned` / `reused`(冪等) / `blocked`(缺 token 等) / `rolled_back`(M9 失敗已清，無孤兒)。
exit 0=ok；1=blocked/rolled_back；2=缺必填參數。

## 內建保護（程式層，非靠人記得）
- C2 冪等：label `lobster-site-id` 查重 → reused，不重複開機/計費
- M9 rollback：失敗 DELETE server + primary_ip（不留孤兒費）
- M7：純 fetch 不繼承 env；機密只走 vault，cloud-init 只放公鑰
- cloud-init ≤32KiB + day-1 硬化（iptables INPUT DROP+DOCKER-USER 雙層 / 無密碼 / auto-reboot）

## SSOT
- 編排器：`lobster-factory/packages/workflows/src/provision/provisionClient.ts`
- 計畫：`lobster-factory/docs/hosting/HETZNER_HOSTING_LAYER_PLAN.md`（決策0/D3/附錄A）
- 硬化驗收：`lobster-factory/docs/hosting/HETZNER_PROVISIONING_HARDENING_SOP.md`

## Phase 4（真機驗收，需 go-ahead）
填 `HETZNER_STAGING_TOKEN`（建 staging+prod 兩個 Hetzner project token）→ 開 cpx 最小機驗硬化（nmap 只見 22/80/443、DOCKER-USER 繞過測、587 SMTP、cert）→ 即銷毀。
