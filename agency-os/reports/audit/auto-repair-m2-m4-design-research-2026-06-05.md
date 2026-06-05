# Auto-Repair M2/M4 Webhook Auth Hardening — 全方面設計研究

- 日期: 2026-06-05
- 範圍: Post-Phase 4 — M2 (per-source HMAC) + M4 (fingerprint forgery)
- 來源 handoff: `agency-os/handoffs/2026-05-28-1807-batch-3-post-phase.md`
- 原始 finding: `agency-os/reports/audit/auto-repair-2026-05-23.md` §M2 (line 136) / §M4 (line 138)
- 狀態: **設計研究，未動 code，待操作者拍板**
- 證據等級: 平台能力 = web-researcher 查證附官方 URL；DB 安全 = db-expert 讀 migration 實證

---

## 0. 結論（先看這段）

第一版「方案 B」是正確方向但**有兩個會在實作時炸的隱藏盲點**，經兩位專家查證後修正：

1. **Sentry 矛盾（必須先到 VPS 實測）**：`normalizeSentry` 讀 `data.issue` = Sentry **Internal Integration** 的 payload 形狀。而 Internal Integration **天然就發 `Sentry-Hook-Signature`（HMAC-SHA256）但「不」能帶自訂 `Authorization: Bearer`**。可是 user-guide 說 5 個來源都用 shared Bearer 驗證。→ **這兩件事不可能同時為真。** 必須先抓一筆真實 Sentry request 看它到底送什麼 header，才知道 Sentry 現況是 Tier-2-ready 還是根本沒在驗。
2. **M4 in-place 重算有 race，會「靜默製造重複 incident」**：salt 改了 fingerprint，若 deploy 新 code 在 backfill 之前（或 backfill 期間有 webhook 進來），舊 open incident 立刻變孤兒 + 可能撞 `(fingerprint, environment)` unique violation。db-expert 建議改用 **dual-column `fingerprint_v2` 漸進路徑**（零中斷、可瞬間 rollback）取代就地覆寫。

---

## 1. 平台能力 Ground Truth（web-researcher 查證，附官方 URL）

| 平台 | 自訂 Bearer header | Body HMAC 簽章 | Replay 欄位 | Tier 上限 |
|------|------------------|---------------|------------|----------|
| **Sentry** (Internal Integration) | ❌ 不能帶自訂 Authorization | ✅ `Sentry-Hook-Signature` = HMAC-SHA256(`JSON.stringify(body)`, **Client Secret**) | ✅ `Sentry-Hook-Timestamp`（自行設窗）| **Tier-2 天然** |
| **Grafana** | ✅ Bearer/Basic/Extra Headers | ✅ `X-Grafana-Alerting-Signature` HMAC-SHA256（**v12.0.0+，2025-05-05**）| ✅ 可選 Timestamp Header | **Tier-2**（需 v12+）|
| **Uptime Kuma** | ✅ Additional headers（**v1.19.0+**）| ❌ 無 | ❌ 無 | Tier-1 |
| **Netdata** | ✅ Bearer/Basic/mTLS | ❌ 無 | ❌ 無 | Tier-1 |
| **PostHog** | ✅（source code 有 headers input，UI 文件薄弱）| ❌ 無記載 | ❌ 無 | Tier-1 |

**關鍵細節**：
- Sentry 簽的是 `JSON.stringify(request.body)`，**不是** raw bytes（與 Stripe 不同）→ 接收端要重新 `JSON.stringify(parsed)` 來比，或更穩妥地驗 raw（需確認 Sentry 到底簽哪個；官方範例用 stringify）。`body.raw`（redact 前）是我們手上的原始 bytes，但 Sentry 的 HMAC 對象是它自己 stringify 的版本 → **這裡有 byte 級不一致風險，要實測對齊**。
- Grafana 兩種簽法分支：設 Timestamp Header → `HMAC(timestamp + ":" + body)`；沒設 → `HMAC(body)`。實作要分支。
- Sentry payload 兩型：Internal Integration issue webhook = `data.issue`（我們現況）；Alert Rule action = `data.event` + `data.triggered_rule`。
- 業界 replay 標準（Stripe）：簽 `timestamp + "." + raw_body`，容忍窗 **300 秒**。GitHub 不放 timestamp → 只能靠 delivery-UUID + nonce store。

---

## 2. Sentry 矛盾 — ✅ 已由 Phase 0 SSH 實測解決（2026-06-05）

**結論：5 來源現全是 Tier-1（Bearer-only）。Tier-2 HMAC 是全新工程，非現況。**

Phase 0 SSH SG `/root/lobster-phase1/.env` 證據（唯讀，未印值）：
- 只有 `SENTRY_AUTH_TOKEN`（Sentry API 用）+ `SENTRY_DSN*`；**無任何 webhook 簽章 secret**（無 client secret / hook secret）。
- Grafana 只有 `GRAFANA_SERVICE_ACCOUNT_TOKEN`（query API），**無 HMAC secret**。
- → 接收端根本沒有可驗 `Sentry-Hook-Signature` / `X-Grafana-Alerting-Signature` 的 secret → **Tier-2 目前不存在**。要做需 Sentry 改 Internal Integration（sentry.io 操作）+ 加 client secret；Grafana 升 v12 + 加 secret。**Tier-2 = optional 新 initiative，不綁 M2 baseline。**
- 額外發現：5 監控 webhook（sentry/grafana/netdata/uptime_kuma/posthog）近期**零流量**（health `ingest_fresh` 由內部 probe + `deploy` source 撐；近 8h incident 僅 2 筆 `deploy`）。對方 handoff 載 webhook 06-04 09:21 才從「全斷」修好 → 需獨立驗是否真復流（非 M2/M4 blocking）。
- 協調：SG 有 `app.bak-20260605-authcutover` → 對方 nginx auth cutover 進行中，部署時機需錯開。

下表為實測前的三假設（保留供歷史對照）；實測證明落在「現況靠 shared Bearer，無簽章」：

| 假設 | 若為真，Sentry 現況 | 對策 |
|------|-------------------|------|
| A. Internal Integration（data.issue 暗示）| 已在發 `Sentry-Hook-Signature`，**但沒帶 Bearer** → 現有 `verifyIngestToken` 對 Sentry 應該一直 401？除非有別的路徑 | 若 Sentry 事件其實有進來 → 代表驗證根本沒擋到（漏洞），或走 URL query token。實測 header 才知道 |
| B. Legacy Webhook Plugin（湊巧也給 data.issue 樣）| 不發 signature，靠 Bearer | 只能 Tier-1，或升 Internal Integration |
| C. Alert action + 自訂 header | 帶 Bearer，payload 應是 data.event 不是 data.issue | 與 normalizeSentry 不符，需重查 |

**實測動作**：SSH SG → 看 `/root/lobster-phase1` nginx/app log 一筆真實 `/api/webhooks/sentry` request 的 headers；或在 route 暫時 log `req.headers`（一次性、redact 後）。確認 `Authorization` 與 `Sentry-Hook-Signature` 到底有沒有、是哪個。**這題答案決定 Sentry 是 Tier-1 還是 Tier-2，以及現況有無漏洞。**

---

## 3. M2 設計（修正版）

### 3.1 分層
- **Tier-1（地基，全 5 source）**：每來源獨立 secret，`Authorization: Bearer <per-source-token>`。已證實 5 平台都能帶 header（現在就在帶），零交付風險。
- **Tier-2（body 簽章，僅 Sentry + Grafana≥v12）**：
  - Sentry：驗 `Sentry-Hook-Signature`（待 §2 實測確認交付方式）
  - Grafana：驗 `X-Grafana-Alerting-Signature`（需確認線上 Grafana 版本 ≥ 12.0.0）
- **Replay（殘餘，可選）**：Uptime Kuma/Netdata/PostHog 無原生 timestamp → 要防 replay 只能接收端自建 nonce store（Redis/DB），成本高。建議**先列已知殘餘、不在本批做**（最小爆炸半徑）；Sentry/Grafana 有 timestamp 可低成本加窗。

### 3.2 verifyIngestToken.ts 演進（精確 fallback 語意 — 修正第一版的鬆散）
```
verifyIngestSource(req, source):
  perSourceSecret = env[SOURCE_SECRET_ENV[source]]
  legacy          = env.OPS_INBOX_INGEST_TOKEN
  dualAccept      = env.OPS_INBOX_DUAL_ACCEPT_LEGACY === "true"
  bearer = extractBearer(req)
  // 精確規則：per-source 未設 → 一律回退收 legacy（避免 deploy 當下斷流）
  if perSourceSecret:
      if timingSafeEqual(bearer, perSourceSecret): return ok
      if dualAccept and timingSafeEqual(bearer, legacy): return ok
      return fail
  else:                       // 該 source 尚未佈 per-source secret
      return timingSafeEqual(bearer, legacy)   // 維持現況，零破壞
```
- Sentry/Grafana 額外 `verifySignature(req, body.raw)`，在 `readWebhookBody` 之後（bearer 仍在 body 前做便宜早拒，HMAC 在 body 後）。
- 保留舊 `verifyIngestToken` 為 deprecated alias，先 grep 確認無 5-route 外 caller（github/deploy/tenant-integration 用各自 auth）。
- 共用 `lib/security/timingSafeEqual.ts`（已 length-leak-safe）。

---

## 4. M4 設計（db-expert 修正版 — 改走 dual-column）

### 4.1 為何不能 in-place 覆寫
- `ops_incidents` 有 **兩個** unique：`(source, external_id)` 與 `(fingerprint, environment)`（`0013_ops_inbox.sql:54-55`）。`upsert_incident_atomic` 只 `ON CONFLICT (fingerprint, environment)`（`0035:36`）。
- in-place 覆寫風險：① deploy 新 salt code 早於 backfill → 真告警算新 fingerprint、查不到舊 row → **INSERT 重複 open incident**，舊的變孤兒。② backfill 與 live ingest 並發 → lost-update + `23505` unique violation。
- collision 只來自 stale-logic row（2026-05-23 前的 netdata `alarm`→`name` 改版，`fingerprint.ts:33-41`）。必須**先 dry-run** `GROUP BY (new_fp, environment) HAVING count>1` 證明為空，不能靠 runtime 撞 23505 才發現。

### 4.2 建議路徑：dual-column `fingerprint_v2`（零中斷 + 瞬間 rollback）
1. 加 nullable `fingerprint_v2 text`（無 constraint）— 非阻塞 `ADD COLUMN`（先例 `0026:6-7` client_slug）。
2. backfill `fingerprint_v2`（讀 stored `raw` 重算 salted）— **對 live `fingerprint` 零影響**，dedup 照常。
3. deploy code：**雙寫**（fingerprint + fingerprint_v2）+ **讀 v2 fallback v1**。
4. 全 open incident 都有 v2 後 → 最終 migration 把 unique 換到 `(fingerprint_v2, environment)`、drop/rename 舊欄。

> ⚠️ **Phase 3 不變量（db-expert + critic 複審 2026-06-05，實作已採納）**
> - **HMAC 不是 sha256-concat**：1b 程式採 `HMAC-SHA256(key=salt, msg=v1)`（critic Major：secret-prefix MAC 是反模式）。primitive 已定，未來 promote v2 為 dedup key 不需因此 re-key。
> - **salt 必須在 promote 之前已設**：salt 未設時 v2==v1，M4 防護為零；promote 後才設/輪換 salt → 既有 row 的 v2 全變 → 同因新告警 dedup 不到舊 row → **大量重複 incident**。salt 上線即視為穩定，輪換需配套 re-backfill。
> - **`SET NOT NULL` 前先 explicit backfill**：0036 後到 Phase 3 間從未再現的 row 其 `fingerprint_v2=NULL`。
> - **0036 已加註解版 down-migration + `CREATE OR REPLACE`（可重跑）+ apply 後必跑 `NOTIFY pgrst,'reload schema'`**（12→13 arg 簽名變更使 PostgREST cache 失效，否則 PGRST202）。
5. rollback = 直接退回讀 `fingerprint`，零資料動作。

### 4.3 若堅持簡單 in-place（僅當能保證停 ingest）
SOP（db-expert）：① `CREATE TABLE ops_incidents_fp_bak_<date> AS SELECT id, fingerprint, environment, source, raw ...`（自架 Supabase 無自動備份，**必做**）② dry-run collision scan ③ **停 ingest**（停 next-admin 容器或 rotate token）④ 同窗 deploy+backfill，單一交易，撞 23505 整個 abort ⑤ verify 兩條 query ⑥ 每 source smoke 一發確認 dedup 到舊 row ⑦ resume。停 ingest 期間 = 監控盲窗，務必數秒內、離峰做。

### 4.4 salt 注意
- salt 只進 sha256 輸入，**不改 collision 機率**（sha256 抗碰撞）；唯一碰撞源是 stale-logic row。
- salt 未設 → fingerprint.ts 維持現行（向後相容、漸進）。
- `manual` / `deploy` 兩個非 webhook source 也走 computeFingerprint，salt 一樣影響 → backfill 範圍要含全表非 terminal row，不只 5 webhook source。

---

## 5. 跨切面全方面檢核（neither agent 專責，補齊）

| # | 維度 | 注意事項 |
|---|------|---------|
| 1 | **Secrets 管理** | 新增 token（5 per-source + Sentry client secret + Grafana HMAC secret + salt + dual-accept flag）走 vault SSOT（`secrets-vault.ps1`）+ `mcp/user-env.ps1`，**禁硬編**；兩機各自 `vault-sync`。app 在 **SG** `/root/lobster-phase1/.env`；Supabase 在 **EU**。 |
| 2 | **Deploy 邊界** | next-admin 走 `sg-deploy.sh`（npm test → healthcheck → smoke → 失敗 rollback），勿直接 git pull。HMAC/per-source 改動屬 auth → Medium-High。 |
| 3 | **Observability** | 401 必須 log **哪個 source + 哪個原因**（bad_bearer / missing_sig / bad_sig / replay_expired），否則遷移期分不清「打錯 token」還是「真攻擊」。考慮 Sentry breadcrumb + 計數。health endpoint `ingest_fresh` 會因停 ingest 短暫 stale，預期內。 |
| 4 | **redactSecrets 順序** | HMAC 必須用 `body.raw`（redact 前原始 bytes）；fingerprint 用 redact 後 `parsed`。兩者順序不能搞混（route 已先 raw 後 redact，正確）。 |
| 5 | **PostHog 既有 m3** | feature-flag-before-auth 順序（`posthog/route.ts:22-25`）要保留，新 verify 不得破壞。 |
| 6 | **遷移期雙送** | 某平台同時被舊共用 token 與新 per-source 設定打 → dual-accept 期間都收，無害；關 flag 前確認每平台已切。 |
| 7 | **測試矩陣** | 每 source × {正確 token / 錯 token / 缺 token / dual-accept on+legacy / dual-accept off+legacy} + Sentry/Grafana {正確 sig / 錯 sig / 缺 sig / 過期 timestamp} + salt {改變 fingerprint / 跨 source 不通用} + backfill {collision dry-run / dedup 到舊 row}。 |
| 8 | **vuln-verifier** | auth 改動完成後依 AGENTS.md 召 `critic` → `vuln-verifier` 寫 PoC：偽造 incident 被擋、leaked 單 source token 無法跨打其餘 4、pre-seed fingerprint 失效。 |
| 9 | **TS build gate** | `.ts` 改動先 `npx tsc --noEmit`（vitest 不做型別）再 REALTEST。 |
| 10 | **跨機 .md BOM** | 本研究文件在 repo 內（走 git），免 BOM。 |
| 11 | **Grafana 版本** | Tier-2 需線上 Grafana ≥ v12.0.0 — 部署前 SSH 確認版本，否則 Grafana 只能 Tier-1。 |
| 12 | **監控盲窗** | M4 若走 in-place 停 ingest，期間真 incident 不進。dual-column 路徑無此問題 → 又一個選 dual-column 的理由。 |

---

## 6. 風險登記

| 風險 | 等級 | 緩解 |
|------|------|------|
| Sentry 現況未知（§2 矛盾）| 🔴 Blocking | 實測 header 後才設計 Sentry auth |
| M4 in-place race 製造重複 incident | 🔴 Blocking | dual-column 路徑 OR 停 ingest+備份+dry-run |
| 切換期 ingestion 全 401 | 🟠 | dual-accept fallback（per-source 未設→回退 legacy）|
| Sentry HMAC byte 對不齊（stringify vs raw）| 🟠 | 實測一筆對齊比對方式 |
| Grafana < v12 無 HMAC | 🟡 | 部署前確認版本，否則 Tier-1 |
| backfill 撞 collision | 🟡 | dry-run GROUP BY 先證空 |
| 自架 Supabase 無自動備份 | 🟠 | backfill 前手動快照 fingerprint 欄 |
| replay 無防護（3 平台）| 🟡 已知殘餘 | 列 WORKLOG，本批不做（Sentry/Grafana 可低成本加窗）|

---

## 7. 分階段執行（修正版）

**Phase 0 — 實測（先做，解 blocking）**
- SSH SG 抓真實 Sentry/Grafana request headers → 確認 Sentry 交付方式 + Grafana 版本。

**Phase 1 — Code（向後相容，env 未設=現況，我實作 + 本機 tsc+vitest）**
- `verifyIngestToken.ts`：`verifyIngestSource` + `verifySignature`（Sentry/Grafana）+ 精確 fallback。
- 5 route 接上。
- `fingerprint.ts`：salt（未設則現行）。
- migration：`ADD COLUMN fingerprint_v2`（nullable）+ 雙寫/讀 v2 fallback v1。
- vitest 全矩陣（§5.7）。

**Phase 2 — Rollout（High，操作者協調，另行 go-ahead）**
- 產生 secret → vault → 兩機 → SG `.env`（dual-accept=true）→ `sg-deploy`。
- 逐平台 dashboard 改 token / 開 HMAC → 各 curl 實測。
- backfill `fingerprint_v2`（讀 raw 重算）。
- 全切完 → 換 unique 到 v2 + dual-accept=false → 端到端真告警驗。

**Phase 3 — 收尾**
- AUDIT_REGISTRY M2/M4 🔴→🔴 FIXED + commit hash；WORKLOG 四動作 + 已知殘餘（replay）。

---

## 8. 待操作者拍板（3 題）

1. **Sentry Tier**：先做 §2 實測；若是 Internal Integration 已簽 → 直接接 Tier-2；若 legacy → 留 Tier-1 還是升級？
2. **M4 路徑**：dual-column `fingerprint_v2`（推薦，零中斷）vs in-place 停 ingest（簡單但有盲窗）？
3. **Replay**：本批只列殘餘（推薦）vs 連 Sentry/Grafana timestamp 窗一起做？
