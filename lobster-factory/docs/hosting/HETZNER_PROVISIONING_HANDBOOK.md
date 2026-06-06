# Hetzner 一鍵租機 Provisioning — 維護手冊（後人參考）

> **這份是什麼**：給未來工程師/AI 的「**這系統怎麼運作、怎麼維護、怎麼擴充、踩過哪些坑**」維護手冊。
> 不是計畫（看 `HETZNER_HOSTING_LAYER_PLAN.md`）、不是政策（`..._POLICY_COMPLETE_V2.md`）、不是嵌入 recipe（`EMBED_PROVISION_INTO_APP.md`）。這份是**已建成系統的操作說明書**。
> **建成日**：2026-06-06，真機驗證通過（cpx12@sin）。作者：AwareWave 全能工程師（Claude Opus）。

---

## 1. 這系統做什麼（一段）
讓「開一台全新的、安全硬化好的 Hetzner 主機」變成**一次函式呼叫**。輸入客戶/方案，它自動：租機 → 開機當下套 day-1 安全硬化（v4+v6 防火牆、無密碼 SSH、Docker 逃逸防護）→ 接 Cloudflare DNS。**冪等**（重複呼叫不重複開機）、**可回滾**（失敗自動刪機+IP，零孤兒計費）、**機密安全**（私鑰不入 cloud-init、token 只進 header）。

---

## 2. 心智模型：3 個關鍵設計決策（先懂這個再看 code）

### 決策 0 — 程序在「函式」裡，觸發可換（雙觸發）
**最重要的觀念**：核心是一個函式 `provisionClient()`，不是 Slash Command、不是 Runbook。
- 為什麼：網頁按鈕無法呼叫「對話中的 AI」；要「點按鈕自動處理」，邏輯**必須**在部署好的 code 裡。
- 好處：同一個函式，**Slash Command（現在）和 app 按鈕（之後）共用**，零重寫。
```
        provisionClient()  ← 程序 SSOT（一次寫好）
              ▲
   ┌──────────┴──────────┐
 /provision-client    app 按鈕 → API route
 (CLI 觸發)            (之後嵌，呼叫同函式)
```
- **30 年含義**：未來要換觸發方式（CLI→按鈕→排程），改觸發層即可，核心不動。**禁止**把租機邏輯重寫進按鈕。

### 決策 1 — 演化既有，不建重複模組
機層 adapter 演化既有 `packages/workflows/src/hosting/`（站層 adapter 的家），不另建 `packages/hosting`。理由：避免兩套 hosting 抽象並存 = 維護分叉。

### 決策 2 — IaC 混合：靜態宣告式、動態命令式
- 靜態共用基盤（firewall/network）→ OpenTofu（`infra/hetzner/opentofu/`，宣告式、可 drift 偵測）
- per-租戶動態開機 → 命令式 adapter（貼工作流、可程式化 rollback）

---

## 3. 兩層架構：機層 vs 站層（別搞混）
```
[機層 machine layer]  ← 本系統新建：租一台機 + 硬化 + DNS。產出 sshHost/ipv4/wpRootPath
        ↓ 把 ref 餵下去
[站層 site layer]     ← 既有：在主機上裝 WordPress（resolveStagingProvisioning / create-wp-site）
```
機層**已完成驗證**；站層**早已存在**；兩層的「串接」是 Phase 5（嵌進 app 時做）。

---

## 4. 檔案地圖（每個檔幹嘛）
全在 `lobster-factory/packages/workflows/src/`：

| 檔案 | 職責 |
|---|---|
| `provision/provisionClient.ts` | **SSOT 編排器**：server → DNS。injectable deps（全可測） |
| `provision/cli.ts` | CLI 入口（`/provision-client` 走這）。薄 wrapper，只解析參數 |
| `provision/serverAdapterFactory.ts` | env→adapter（none/mock/hetzner_cloud）+ tier→cpx 機型映射 |
| `hosting/serverTypes.ts` | `ServerProvisionResult` 完整 union（idle/mock/provisioned/reused/dry_run/rolled_back/blocked） |
| `hosting/providers/serverProvisionContract.ts` | `ServerProvisionAdapter` 契約 |
| `hosting/resolveServerProvisioning.ts` | 輕量 mode 選擇器（none/mock）+ `isBillableProvisionEnabled` 雙閘 |
| `hosting/mockServerAdapter.ts` | 確定性 mock（IP 走 RFC5737 文件空間，永不可路由） |
| `hosting/providers/hetzner/HetznerHostingAdapter.ts` | **真 Hetzner adapter**：冪等查重/runtime cpx 確認/dry-run/poll/M9 rollback |
| `hosting/providers/hetzner/cloudInit.ts` | day-1 硬化 #cloud-config renderer（v4+v6 firewall/無密碼/DOCKER-USER） |
| `hosting/providers/hetzner/secretStore.ts` | ed25519 keygen + OpenSSH 編碼（私鑰只進 sink） |
| `hosting/providers/cloudflare/dns.ts` | A-record idempotent upsert/delete |

靜態 IaC：`infra/hetzner/opentofu/`（firewall/network）。指令：`.claude/commands/provision-client.md`。

---

## 5. 一次 provision 的資料流（端到端）
```
provisionClient(input, {serverAdapter, dns})
  → serverAdapter.provisionServer(input)：
      1. 冪等：GET /servers?label_selector=lobster-site-id → 有健康的就 reused
      2. runtime GET /server_types → 確認 cpx 在 sin 可用（cx 已停售）
      3. dry-run gate：billable=false → 回 dry_run（渲染但不開機，不花錢）
      4. 真開：生 ed25519 key（私鑰存 vault sink，公鑰進 cloud-init）
      5. POST /servers（cpx + ubuntu-24.04 + cloud-init + label）→ poll running
      6. 失敗 → teardown（DELETE server，poll primary_ip 到可刪）→ rolled_back
  → 拿到 ref(ipv4) + domain → Cloudflare upsert A-record
  → 回 {status, ref, dns}
```

---

## 6. 安全模型（為什麼能 30 年安全跑）
- **雙 env-gate 預設 OFF**：`LOBSTER_SERVER_ADAPTER`(none) + `LOBSTER_SERVER_PROVISION_ENABLED`(off→dry-run)。**程式放進 repo 不會自己花錢開機**，要兩個都 ON 才真開。
- **冪等（C2）**：label `lobster-site-id` 查重 → 重送回 reused，不重複計費。
- **回滾（M9）**：失敗自動刪 server+primary_ip，零孤兒。
- **機密衛生（M7+挖礦課）**：純 fetch 不繼承 env；token 只進 Authorization header；私鑰只進 vault sink，cloud-init 只放公鑰。
- **approval gate（C1）**：billable 開機沿用 `build/runs/route.ts` 的 approval_required（嵌 app 時務必保留）。

---

## 7. 怎麼擴充（最常見 3 種）
1. **加新雲端商（Vultr/DigitalOcean）**：在 `hosting/providers/<vendor>/` 實作 `ServerProvisionAdapter`，在 `serverAdapterFactory` 加一個 mode。**不動** provisionClient。
2. **加客戶方案 tier**：改 `serverAdapterFactory.ts` 的 `TIER_SERVER_TYPE` map。
3. **加 day-1 硬化項**：改 `cloudInit.ts`（記得 ≤32KiB + 加對應 test 斷言 + 真機驗）。

---

## 8. 怎麼驗證（維護時必跑）
- **單元測（72→75 個，mock-fetch，不花錢）**：`cd packages/workflows && npm test`
- **型別檢查**（package 無 tsconfig）：建臨時 `tsconfig.tmp.json`（module esnext/moduleResolution bundler/target es2022/strict/types node）→ `npx -p typescript@5.6.3 tsc -p tsconfig.tmp.json` → 跑完刪。**只要你的新檔 0 錯**（總有 ~20 個 pre-existing 錯與本系統無關）。
- **真機驗收（~€0.004）**：在隔離 Hetzner project 開 cpx12@sin → SSH 驗 `iptables -S INPUT`(v4+v6 DROP) / `sshd -T`(password+root off) / `cat /var/log/day1-hardening.json` → 刪。**絕不在 production project 測。**

---

## 9. 真實踩過的坑（後人別再踩）
這些是建置過程**真的爆過/被官方限制打臉**的，全已修，列此供警惕：

| 坑 | 真相 | 修法 |
|---|---|---|
| **cx 系列停售** | cx22/32/42/52 2026-01-01 起不可開 | Singapore 用 **cpx**（AMD）；runtime 查 server_types 不硬編 |
| **token 無細粒度** | Hetzner token 只 project 層 Read/Write，無 per-action | staging/prod **各開一 project** 隔離 |
| **IPv6 全開**（critic 抓的 Critical） | 只設 IPv4 iptables = 公開 /64 全暴露 | cloud-init 同時 `ip6tables` v6 firewall |
| **primary_ip 刪不掉**（真機才抓到） | 刪 server 後 `DELETE primary_ip` 回 422 must_be_unassigned | teardown poll IP：gone→done/unassigned→delete/assigned→retry |
| **SMTP 465 被封** | Hetzner 預設封 outbound 25/465 | Resend 改 port **587** |
| **cloud-init ≤32KiB** | 超過 Hetzner 拒收 | renderer 斷言大小（實際 4201 bytes，很安全） |
| **CP950 編碼陷阱** | Windows python/PS 預設 cp950 讀 UTF-8 爆 | 所有 open 加 `encoding="utf-8"`（本專案老問題） |
| **bash `${var}` 在 JS template** | cloud-init 字串裡 `${r:0:1}` 被 JS 當插值 | 跳脫成 `\${r:0:1}` |

---

## 10. 嵌進 app / 上線（指路）
- 嵌進 app.aware-wave.com 按鈕：照 `EMBED_PROVISION_INTO_APP.md`（加 API route 呼叫 provisionClient）。
- 上線前 env：填 `HETZNER_STAGING_TOKEN`（`AWARE_WAVE_CREDENTIALS.md §十三`）+ 配 secretStore putSecret sink + `CLOUDFLARE_API_TOKEN/ZONE_ID`。
- dispatcher 上線前 2 follow-up（M10 orphan reaper + partial index 0037）：見 `agency-os/TASKS.md`。

---

## 11. SSOT 索引
| 想知道 | 看 |
|---|---|
| 為什麼這樣設計 / 完整計畫 | `HETZNER_HOSTING_LAYER_PLAN.md` |
| 策略政策（regions/tiers/RTO） | `HETZNER_HOSTING_POLICY_COMPLETE_V2.md` |
| 19 條硬化注意事項 | `HETZNER_PROVISIONING_HARDENING_SOP.md` |
| 怎麼嵌進 app | `EMBED_PROVISION_INTO_APP.md` |
| 怎麼運作/維護/擴充（本檔） | `HETZNER_PROVISIONING_HANDBOOK.md` |
| 建置 + 真機驗收紀錄 | `agency-os/WORKLOG.md` 2026-06-06 |
