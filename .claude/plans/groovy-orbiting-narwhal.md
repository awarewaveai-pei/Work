# 計畫：Hetzner 一鍵租機自動化 + 架站 SOP 注意事項 + Open-Gaps 修復

## Context（為什麼做這個）

目標：把「新客戶一鍵架站」做成可重複、零事故的 SOP 系統。客戶選方案 → 自動租 Hetzner 主機 → day-1 安全硬化 → 交付。

**現況三大事實（已徹底盤點驗證）：**
1. **「開機」這層根本不存在**。現有 hosting adapter（`resolveStagingProvisioning.ts`）只有 `none/mock/provider_stub/http_json`，全部假設「主機已存在」。全 codebase grep `hetzner` 無任何 provisioning provider。
2. **沒有單一「Hetzner 開機 + 硬化注意事項」SOP**。知識散在 10 本 runbook + audit reports + WORKLOG。現有 SOP（ONE_CLICK_BUILD_SOP / NEW_TENANT_ONBOARDING_SOP / LONG_TERM_OPS）都是上層或既有機營運，不含開機硬化。
3. **一鍵架站 provisioning 骨幹有 9 Major + 11 Minor open gaps**，其中 M9（中途失敗無 rollback → 孤兒站）對「零事故」最致命。

這些坑全是真實事故換來（挖礦入侵 2026-04-20、ClickHouse OOM、502 flood、auto-deploy 連敗 36h、webhook 全斷 2.3h）。自動化必須 day-1 內建所有修復，否則每開一台新機就重蹈覆轍。

> 並行風險：另一個 AI 正在大修 app.aware-wave.com（範圍未知）。本計畫的核心（`packages/workflows` provisioning 骨幹）與 UI 層解耦，可並行，但需先存 baseline + 給紅線（見「並行協調」）。

---

## 交付物總覽（三塊，使用者確認「都要」）

| # | 交付物 | 性質 | 狀態 |
|---|--------|------|------|
| D1 | **Hetzner 架站 SOP 注意事項 + 機制對照 + open-gaps register**（知識基線文件） | 文件/規格 SSOT | 新建 |
| D2 | **致命 open gaps 修復**（M9/M7/M10/M3/M1-2 等） | 修舊 | 改 code |
| D3 | **Hetzner 開機自動化**（adapter + cloud-init + 接 Cloud API） | 開新 | 新建 code |

---

## D1 — Hetzner 架站 SOP 注意事項（知識基線文件）

**新建**：`lobster-factory/docs/HETZNER_PROVISIONING_HARDENING_SOP.md`
**角色**：D3 自動化的驗收 SSOT；每條注意事項 = automation 必過的 gate。每條附事故 `file:line` 證據。

### 19 條硬化基線（== SOP 注意事項本體）

**A. 安全（挖礦入侵 2026-04-20 根因，`runbooks/HETZNER-SERVER-SECURITY-INCIDENT-CRYPTO-MINER.md`）**
1. 預設密碼一個都不能留 — Postgres/MinIO/Redis/n8n 開機即改（挖礦根因 = Supabase `your-super-secret-...` 沒改）
2. DB port 永不對外 — 5432/5433/6543/3306 一律 `127.0.0.1:` 綁定（runbook:63-72）
3. **Docker 繞過 UFW 是盲點** — 必須 `DOCKER-USER` chain 雙層（runbook:110-148）；UFW deny 對 Docker 容器無效
4. 開機 iptables INPUT default DROP，只開 22/80/443（runbook:139-148）
5. SSH key-only，禁密碼登入

**B. 記憶體/OOM（ClickHouse OOM + 502，`runbooks/HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md`）**
6. 每容器 `mem_limit` + 服務內 `max_server_memory_usage`（playbook:117-129）
7. system log 表 TTL 必設（40+ 表堆積根因）
8. swap + Netdata 閾值告警

**C. Nginx/限速（502 + scanner flood，WORKLOG 2026-05-22 D1-D5）**
9. `limit_req_zone` 定義了必須在 server block 加 `limit_req`（定義不套用 = 無效）
10. `scanner-block.inc` 攔掃描路徑 + 獨立 log（不污染 access.log = 不誤告警）
11. 不留 stock default site（無限速）

**D. TLS（certbot 自動續期壞，WORKLOG 2026-05-25）**
12. host nginx 沒綁 port 80（Docker 佔用）→ 用 DNS-01（Cloudflare API），不要 HTTP-01
13. cert 續期實測 `renew --dry-run`，不假設自動跑

**E. 部署（auto-deploy 連敗 36h，WORKLOG 2026-05-08）**
14. build artifact（tsbuildinfo）不進 git（dirty tree 斷 `git pull`）
15. git→staging 用 rsync 不用 git pull，`--exclude .env*`
16. deploy 內建 test gate + healthcheck + smoke + 自動 rollback（已有 `sg-deploy.sh`）

**F. DB schema（webhook 全斷 2.3h，WORKLOG 2026-06-04）**
17. migration 後必 `NOTIFY pgrst, 'reload schema'`

**G. 維運/逃生**
18. unattended-upgrades + 自動 reboot（SG 20:00 / EU 20:30 UTC stagger，`52/53awarewave-auto-reboot.conf`）
19. SSH 壞掉逃生路徑：保留 Hetzner API token + server ID（reset_password / rescue mode / VNC base64 寫 key，502-playbook:51-99）

### 機制對照表（坑 → 已做成的機制）

文件含完整對照（已盤點）：Slash Commands（`/sg-deploy /check-drift /health /smoke-test /vault-* /sg-reboot /eu-reboot /auto-reboot-status`）、Agents（`devops-engineer / incident-responder / critic / db-expert / debugger`）、Hooks（`high-risk-bash-warn / git-log-injector / auto-repair-guard / verify-gate-*`）、Scripts（`sg-deploy.sh / install-maintenance-crons.sh / sync-hetzner-*.ps1 / backup-phase1.sh / endpoint-alert.sh`）、Routines（cron: backup/drift/cleanup; systemd: endpoint-alert; auto-reboot conf）、Runbooks（10 本）。

### Open-Gaps Register（還沒處理好的，準確版 per AUDIT_REGISTRY）
- 一鍵架站骨幹：9 Major + 11 Minor（M9/M7/M10/M3/M1-2 致命，見 D2）
- Repair Center：M2（無 per-source HMAC）、M4（fingerprint 可偽造）
- 架構大洞：Hetzner 開機層不存在（見 D3）
- AutoRepair Phase 4 GitHub App 未裝；Certbot 到期監控仍手動

---

## D2 — 致命 Open-Gaps 修復（先穩骨幹再開新）

全在 `lobster-factory/packages/workflows/src/`。按致命度：

| Gap | 檔案 | 修法 | 驗證 |
|-----|------|------|------|
| **M9** 中途失敗無 rollback → 孤兒站 | `trigger/orchestrate-tenant-provisioning.ts:82-115`、`create-wp-site.ts` | 階段化 compensating rollback；失敗標記/銷毀已開資源，secretRef 保留進 error detail | 注入 502 驗無孤兒 |
| **M7** spawn 繼承 process.env 含 secrets | `executor/installManifestStaging.ts:99-106` | spawn 改 env allowlist（只傳必要變數） | grep 確認無 secret 進 stdout |
| **M10** dispatch 非原子 → 重複 dispatch | `trigger/dispatch-action-run.ts:118-156` | mark-running → trigger → mark-dispatched 改原子（DB 條件 update） | db-expert 審 + 併發測 |
| **M3** dry-run 寫 `status="completed"` | `tasks/wp-install-plugins.ts:160-186` | dry-run 寫 `mode="skipped_dry_run"`，不偽報 completed | 測 dashboard 不再騙人 |
| **M1/M2** TODO 佔位字串當 SSH host | `create-wp-site.ts:222,323` | D3 機層產出真 sshHost 後消除死路（與 D3 同 PR） | tsc + 實測 |

風險分級：M10 改 DB 寫入 → `db-expert` 先審（Medium）。其餘 Low-Medium。每項 R0 四動作 + `critic`。

---

## D3 — Hetzner 開機自動化（新層，藍圖已設計）

### 架構取捨（關鍵）
- **新增獨立 `ServerProvisionAdapter`（機層）**，不塞進 `StagingProvisionAdapter`（站層）。機層先跑產出 `sshHost/wpRootPath`，餵給既有站層 + `wp-install-plugins`（消除 M1 死路）。
- **cloud-init 為主 + 開機後 SSH 為輔**：cloud-init 做「裸機自保」（firewall/無密碼/auto-reboot conf — 必須第一個封包前生效）；SSH 階段做「需 vault 機密 + 復用既有腳本」（install-maintenance-crons / sync-hetzner-* / DNS-01 certbot）。機密絕不入 user-data（metadata 明文）。

### 新建檔案
| 檔案 | 職責 |
|------|------|
| `packages/workflows/src/hosting/providers/serverProvisionContract.ts` | `ServerProvisionAdapter` 契約 + `ServerProvisionResult` union（provisioned/blocked/reused/rolled_back/dry_run） |
| `packages/workflows/src/hosting/providers/hetznerCloud.ts` | 主檔：Hetzner Cloud API createServer + 冪等 label 查重 + secret 生成存 vault + M9 rollback + M7 純 fetch 不繼承 env |
| `packages/workflows/src/hosting/providers/hetznerCloud.input.ts` | Zod「客戶選方案」schema：serverType/region/image 白名單 enum + noSsrf |
| `packages/workflows/src/hosting/resolveServerProvisioning.ts` | 機層進入點，鏡像 `resolveStagingProvisioning` 的 env-gate 模式 |
| `packages/workflows/src/hosting/ssrf.ts` | 抽 `create-wp-site.ts:43-78` 的 SSRF 防禦共用（站層機層共用一套） |
| `infra/hetzner-provision/cloud-init/day1-hardening.yaml.tmpl` | **核心交付**：19 條基線「裸機自保」子集編碼成 user-data |
| `infra/hetzner-provision/scripts/post-boot-bootstrap.sh` | 開機後復用既有腳本（install-maintenance-crons / sync-hetzner-* / DNS-01） |
| `infra/hetzner-provision/README.md` + `docs/hosting/SERVER_PROVISION_ADAPTER_CONTRACT.md` | 分工 + 契約文件 |

### 修改檔案
- `packages/workflows/src/trigger/create-wp-site.ts`：在 `resolveStagingProvisioning()`（line 136）前插入 `resolveServerProvisioning()`；機層 blocked/rolled_back → 走既有 blocked 分支不開站
- `apps/next-admin/app/api/build/runs/route.ts` + `lib/build-console/contracts.ts`：**含 serverPlan 的 run 強制 `approvalRequired=true` + `riskLevel=high`**，cron/dispatcher 不可繞過（C1 lesson：billable 開機須人工核可）

### 歷史教訓 gate 落地
- C1 billable→approval：`route.ts`+`contracts.ts` 強制 approval
- C2 冪等：`hetznerCloud.ts` label_selector `lobster-site-id` 查重 → `reused`
- M7 不繼承 env：純 fetch + ssh2 content-key，token 單點讀不 log
- M9 rollback：階段化 try/catch，失敗 DELETE / `orphan-pending` label
- 挖礦：per-tenant 生成密碼/key 存 vault、雙層 firewall、127.0.0.1 綁定 pre-flight

### 復用既有資產（不重造）
`install-maintenance-crons.sh`（冪等+host偵測）、`backup-phase1.sh`/`verify-backup.sh`/`endpoint-alert.sh`、`sync-hetzner-*.ps1`（4 支 vault 注入）、`secrets-vault.ps1`、`52/53awarewave-auto-reboot.conf`、`wp-install-plugins.ts` 的 ssh2 pattern、vault key `HETZNER_API_TOKEN`。

### Env gate（仿 LOBSTER_ENABLE_DB_WRITES，雙層保險）
- `LOBSTER_SERVER_ADAPTER`（預設 `none`）：none/mock/hetzner_cloud
- `LOBSTER_SERVER_PROVISION_ENABLED`（預設 OFF）：OFF 時 hetzner_cloud 進 **dry-run**（渲染 cloud-init + 驗 schema + 查冪等，但不 POST createServer，不花錢）
- 兩者都 ON 才真開機

---

## 執行順序（30 年紀律，最小爆炸半徑）

**Phase 0 — Baseline + 並行協調**（先做，~30 分）
- 存 git checkpoint baseline（之後 diff 另一 AI 改動）
- 給另一 AI 紅線清單：勿碰 `packages/workflows/` / webhook routes / migrations / Repair Center
- **D1 知識基線文件**先寫（純文件，Low risk，立即可交付 = 使用者要的 SOP）

**Phase 1 — 穩骨幹**（修 D2 致命 gaps）
- M9 → M7 → M10 → M3，每項 R0 四動作 + critic；M10 經 db-expert 審

**Phase 2 — 開新層 dry-run 可跑**（D3 不花錢部分）
- 新 adapter + contract + cloud-init 模板 + mock + resolveServerProvisioning + ssrf.ts 抽取
- M1/M2 隨此 PR 消除（機層產真 sshHost）
- Layer 1 驗證（純本機/CI，mock + dry-run）

**Phase 3 — 真機驗收**（D3 billable，High risk，需明示 go-ahead）
- 手動 approve 開 cx22 → 硬化驗收（port scan / DOCKER-USER 繞過測 / 無密碼登入 / rate-limit / cert / auto-reboot / cron / `/var/log/day1-hardening.json`）→ 立即 teardown
- Layer 3：冪等（同 siteId 回 reused）+ rollback（注入失敗驗無孤兒）

---

## 驗證計畫（端到端）

- **Layer 1 純本機/CI**：`resolveServerProvisioning.test.ts` + `hetznerCloud.test.ts`（mock fetch）斷言 cloud-init 渲染、SSRF 拒私網、serverType/region 白名單、冪等查重、rollback 路徑；併入 `validate-workflows-integrations-baseline.mjs`
- **Layer 2 真機（cx22 開完即銷毀）**：nmap 只見 22/80/443；臨時容器綁 `0.0.0.0:9999` 外部 filtered（挖礦迴歸測試）；無 key SSH 被拒；curl 迴圈觸發 429/503；`curl -vI https` 驗 DNS-01 cert；`apt-config dump` 驗 auto-reboot 三鍵；`/etc/cron.d/lobster-backup` 存在
- **Layer 3 冪等/rollback 真機**：同 siteId 回 reused 不開第二台；注入 boot 失敗驗 server 被 DELETE 無孤兒計費
- 每階段 R0 四動作寫 WORKLOG（REALTEST_EVIDENCE / REVIEW_DONE / BUGHUNT_DONE）

## 風險與 Rollback
- 整功能：env gate `LOBSTER_SERVER_ADAPTER=none` 即回現況（不開機）；所有新檔 additive，`create-wp-site.ts` 插入點可 gate 短路
- 孤兒計費：M9 階段化 rollback + 可選 reaper 掃 `orphan-pending` 超時即刪
- firewall 鎖死自己：模板先 ACCEPT 22 再 DROP；保留 Hetzner Console rescue break-glass
- 真機開機 = High risk = 需使用者明示 go-ahead（不自動跑 Phase 3）
