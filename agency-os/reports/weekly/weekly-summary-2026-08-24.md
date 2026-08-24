# Weekly Summary 2026-08-24

**期間**：2026-08-18 → 2026-08-24  
**產生時間**：2026-08-24 01:06 UTC（遠端週報代理自動生成）

---

## 本週完成事項

本週（2026-08-18–2026-08-24）以基礎設施規劃、生產環境修復與治理工具化為主軸。操作者高強度作業集中於 2026-08-18–2026-08-20；2026-08-21 後無新 WORKLOG 條目（daily notes 的 Done Today 均為空白）。

### 2026-08-18 — Dedicated 主機採購定案

- ✅ **OVH KS-6 月租採購時機決策**：`reports/decisions/2026-08-18-dedicated-host-purchase-timing.md` 定案，C6 勝出（立刻買 KS-6 月租 $59.80，不再觀望 Hetzner auction 至 8/31）。7 候選方案權衡矩陣、Pre-mortem、安裝/上線計畫全寫入。
- ✅ **UFW/DOCKER-USER 雙層防火牆漏洞修正**：發現本次安裝計畫草案 P2.4 與 2026-04-20 挖礦事件為同款漏洞（Docker 繞過 UFW INPUT chain）。於決策文件補 P2.4/P2.4b/P2.4c（DOCKER-USER chain + 綁 127.0.0.1 + 密碼輪換）及週期稽核 P6.10，並同步 DR runbook §7。
- ✅ **2026-08-17 規格決策文件**標記 superseded，機型表改指向 08-18 新正本。

### 2026-08-19 — 全套規劃文件組 + 生產環境 ClickHouse 修復

- ✅ **全套自架服務已知坑清單**（`runbooks/KS6-SELF-HOSTED-STACK-HARDENING-CHECKLIST.md`）：逐服務（Supabase/ClickHouse/Chatwoot/Trigger.dev/n8n/WordPress×10/MainWP/Postiz/Uptime Kuma）已知安全/資源問題，含 CVE 連結與官方文件依據。重點：Uptime Kuma RCE CVE + MainWP Child CVE-2024-10783 + ClickHouse 系統表 TTL 磁碟洞。
- ✅ **ClickHouse 系統表 TTL 第二批坑**：宣告式 `<ttl>` 寫法對部分系統表不適用（容器崩潰）；補 `restart: unless-stopped` / image pinning / `fstrim.timer` / n8n 授權確認。
- ✅ **OVH KS-6 官方文件交叉查證**：四份一手來源確認 P1/P2 計畫覆蓋所有官方建議，補 P2.5（SSH 非標準埠）/ P2.5b（非 root 工作帳號）/ P2.5c（OVH Network Firewall 確認項）。**核心發現**：OVH/Kimsufi 官方教學本身不涵蓋 Docker/UFW 衝突，這解釋了 4/20 事故為何在「照教學做」後仍發生。
- ✅ **EU ClickHouse 生產環境真實修復**（第三輪）：SSH 進 `trigger-clickhouse`，`part_log`/`opentelemetry_span_log`/`query_views_log`/`query_metric_log` 四張系統表 ALTER TABLE MODIFY TTL；`system.metric_log` TRUNCATE 止血（CPU 90%→4.34%）；六張孤兒分身表（`_0/_1` 各三對）DROP 清理。過程中引發真實 CPU 事故並完整處理。
- ✅ **`check-clickhouse-health.ps1` 新增兩項偵測**：無 TTL 的 MergeTree 表 + 孤兒 `_N` 分身表；`mergetree_total` canary 防偵測器啞了看起來像健康。Codex 覆審 0c/2m fixed/3n（M1 canary / M2 正則取代寫死後綴）。
- ✅ **採購文件組覆核**（第四輪）：系統性掃描 6 份文件連結完整性；**抓到自己在 BUGHUNT_DONE 中聲稱「已修正 TASKS.md 8/31 字串」但實際沒修**（典型聲稱驗證未驗證案例），當場補修；Google 日曆死線提醒更新至 OVH KS-6 決策內容。
- ✅ **KS6-BUILDOUT-SEQUENCE.md**（純索引文件）：soulful + EU/SG 整併並列同等份量，P1–P8 對照表 + EU①–⑥ / SG⑦–⑫ 兩張表。
- ✅ **DR runbook §5 補 SG DNS 表**：CF API 即時查詢 5 筆 SG DNS 記錄（`5.223.93.113`）補入遷移對照表；消除原有「除非也搬 SG，不要動」的過期條件句。
- ✅ **TASKS.md 補 EU①–⑥ / SG⑦–⑫ 具名待辦**：原本 SG 服務從未被具名列出；本次操作者澄清「EU 和 SG 都要搬」後補上 8 個具名核取方塊。
- ✅ **KS6 硬化清單補服務搬遷專屬坑**：六類（密碼原封不動搬/檔案權限/寫死 IP/SSH known_hosts/cron 路徑/舊帳號），針對「舊服務搬過來」情境（既有清單均為新機從零裝視角）。
- ✅ **SG 七項服務具名對照表**（第八輪）：SSH 實查 `docker inspect oracle-web`（Next.js 紫微斗數產品，非殘留）+ 觀測堆疊（Loki+Promtail+Grafana loopback-only）；KS6 清單補六類坑對應每個具名服務。
- ✅ **本機明文金鑰堆積發現**（計畫外）：`agency-os/Backups/claude-userlevel-*/mcp.json.before` 17+ 個快照含完整 OpenAI API key，確認在 `.gitignore` 內未進 git，已回報操作者決定是否處理。

### 2026-08-20 — Codex Oracle 制度化

- ✅ **`scripts/codex-oracle.ps1`**（新增）：唯一入口，硬寫死 `-s read-only` + `-c mcp_servers={}` + `-o` 取最終訊息；防止裸 `codex exec` 噴 ~120KB 進 context（實測 850 倍差距）。Dogfood 審自己抓到 4 條真實 bug（DiffRef 語意錯誤 / git 錯誤混入 diff / 無 Path 時機密外送 / CP950 解碼）全修正。
- ✅ **`AGENTS.md` §跨模型 oracle**：分工表（讀/寫分界：Claude 唯一寫入者 / Codex 讀為主）、寫入不可委派理由（hooks 不覆蓋 Codex）、四條禁止、session 衛生 cost 優先序。
- ✅ **Oracle prompt 固定隱藏依賴提問**：`-Mode review` 在 SPECIFIC QUESTIONS 後插入「你沒被問到但重要的東西」段落，要求 Codex 先自問隱藏依賴（config 值/保留期/timeout/schema 假設等）再報告。

### AUTO_TASK_DONE 本週

- `AUTO_TASK_DONE: 把 08-17 驗證有效的 Codex oracle 從「當次對話」變成常駐機制`（2026-08-20）

---

## 開放任務

> 本節依 TASKS.md `### 未完成` 整理，以 2026-08-24 快照為準。

### 🔴 緊急 / 逾期

- **【資安複盤 逾期 ~68 天】Defender 木馬 `Trojan:Win32/PowhidSubExec.B` 善後** — 目標日期 2026-06-17。暫存檔清理 / 排程任務驗證 / Hook 強化仍未完成。
- **【資安】transcript 憑證外洩三項待輪換** — `TELEGRAM_BOT_TOKEN`、`PRINTFUL_API_KEY`、`soulfulexpression01@gmail.com` 密碼；待操作者處理。
- **【DB migration 0060】`media_assets.object_key` unique index 未套用** — `recordVideoAsset()` upsert 靜默降級；SSH EU VPS 一行 psql 即可套用。
- **【已知風險｜操作者已決定不輪換】`~/.codex/config.toml` 明文憑證** — 30 組正式憑證，操作者 2026-08-17 明確決定不輪換（但 Hetzner 可刪機 / Cloudflare 可改 DNS 風險仍存）。

### 🟠 閘控 / 等待操作者動作

| 任務 | 阻塞原因 | 死線 |
|------|---------|------|
| **Soulful 搬機 §3→§6** | 需操作者刷卡買機（**買機死線 9/30**） | 2026-11-12 |
| **EU→Dedicated 搬機（OVH KS-6）** | 需操作者刷卡（$59.80/月） | — |
| **CS U6 Chatwoot** | gated 等買機 | — |
| **一鍵架站 Stage 4 開閘** | `HETZNER_STAGING_TOKEN` 空 + SG .env 三 flag + sg-deploy | — |
| **Cold Outreach T10 Gmail OAuth** | High risk，等 go-ahead | — |

### 🟡 人工任務（需操作者瀏覽器/登入）

- POD Phase 4 真實 e2e：Woo+Printful 建品+對帳
- Canvas 完整瀏覽器 e2e：Undo/Redo、genfill、群組
- Postiz OAuth app：Meta IG+FB（App Review）、Reddit、LinkedIn
- Postiz 測試草稿清理：Draft ID `cmqo1wijz0005p58ncl1mtssr`
- Postiz 帳號 → 客戶 Hub 連結（Bluesky）
- n8n 授權使用情境確認（Sustainable Use License — 是否幫客戶跑付費自動化？）

### 基礎設施

- EU/SG 搬機具名待辦：EU①Supabase / EU②Trigger.dev / EU③n8n / EU④Postiz / EU⑤MainWP / EU⑥Uptime Kuma / SG⑦next-admin+WP+DB+API / SG⑧oracle-web+觀測堆疊
- TASKS [x] 自動歸檔 + 重複行偵測閘（`archive-completed-tasks.ps1`，R0 已批方案 A）
- smoke 04-onboard spec 補 app session 登入

### 內容 / 工具

- Content Engine RSS block + 第二批積木
- SEO/GEO Soulful 真實資料填寫
- Mockup Studio 功能異常：卡操作者提供 F12 截圖

### wp-bridge

- `/product` dry_run 支援（bump AWBRIDGE_VERSION + release flow）
- Featured image sideload + update-existing-post + product delete
- wp-bridge → app.aware-wave.com Ops Dashboard 展示

---

## 系統健康

> 最後已知 AO-CLOSE 狀態：2026-08-20（oracle 制度化，`codex-oracle.ps1`）

| 元件 | 狀態 | 備註 |
|------|------|------|
| SG VPS (`5.223.93.113`) | ✅ 最後已知健康 | 2026-08-15: health 100% (372/372)；disk 55% |
| EU VPS (`204.168.175.41`) | ✅ 最後已知健康 | ClickHouse 四張系統表 TTL 2026-08-19 實機修復 |
| EU ClickHouse | ✅ 穩定 | CPU 正常（2026-08-19 修復後）；孤兒表清零；監控補 canary |
| Supabase (EU) | ⚠️ migration 0060 待套用 | upsert 靜默降級 |
| next-admin (SG) | ✅ 最後已知健康 | 最後 deploy: 2026-08-15 之前 |
| hook 系統 | ✅ 已部署 | oracle 制度化 hook 接線 2026-08-20 |
| Soulful 站 | ✅ CF DNS live | nameserver 已切；備份還原演練 PASS |
| 客戶外寄信監控 | ✅ 已建立 | client_mail 站外監控納入 ao-resume |
| Auto-Repair | ✅ A1+A2+A3 運作中 | Phase 4 OK |
| 一鍵架站流水線 | 🟡 Stage 4 閘控 | Stage 0–3 完成 |
| 週報自動化 | ✅ 正常 | 本次第七週連續生成 |
| 操作者狀態 | 🟢 在線 | 2026-08-21 後 daily 無 AO-CLOSE 記錄 |

**整體健康評估**：基礎設施規劃文件完備（KS-6 採購、硬化清單、DR runbook、搬機索引）；EU ClickHouse 生產已修復；核心阻塞全在「操作者刷卡買機」。

---

## 風險與阻塞項

| 風險 | 嚴重度 | 狀態 |
|------|--------|------|
| Defender 木馬資安複盤 | 🔴 高 | **逾期 ~68 天**（目標 2026-06-17）|
| transcript 憑證外洩三項 | 🔴 高 | 待操作者輪換 |
| migration 0060 未套用 | 🔴 功能風險 | 影片記錄可能重複；SSH EU 一行可修 |
| `~/.codex/config.toml` 明文憑證 | 🔴 接受風險 | 操作者決定不輪換；Hetzner/CF 二者仍有實質風險 |
| **買機死線 9/30** | 🔴 硬死線 | OVH KS-6 月租定案；需操作者刷卡 |
| Soulful 搬機 | 🟠 硬死線 | 2026-11-12；CF DNS 已切，本體待買機後執行 |
| S2–S5 多租戶 IDOR 隔離 | 🟠 資安 | ~20 個未套用；S1 完成 |
| Stage 4 一鍵架站 | 🟠 閘控 | `HETZNER_STAGING_TOKEN` 空 |
| EU→Dedicated 搬機 | 🟡 閘控 | 等刷卡；Chatwoot U6 依賴此機 |
| 本機 17+ 個 mcp.json.before 明文金鑰 | 🟡 知悉 | `.gitignore` 保護，未入 git；已回報操作者 |

---

## 記憶重點

- **OVH KS-6 月租定案**（2026-08-18）：不再觀望 Hetzner auction；月租 $59.80 可隨時取消，是買「30 天觀察期選擇權」的設計。操作者澄清 EU + SG **全部搬**（非只有 Soulful）。
- **Codex oracle 制度化**（2026-08-20）：`scripts/codex-oracle.ps1` 是唯一入口，Claude 唯一寫入者，Codex 讀為主。分工線在「讀 vs 寫」不在「規劃 vs 執行」。三輪 oracle 共 7 條 finding 全真。Context 成本：裸 codex exec 噴 120KB → 包裝後 143B（850 倍差距）。
- **EU ClickHouse 四張系統表 TTL**（2026-08-19 生產修復）：設定檔宣告式寫法不適用這四張表（原因未查明）；靠 `check-clickhouse-health.ps1` 補償控制（canary + 正則孤兒偵測）。禁止 mem_limit 調高或清資料了事。
- **「聲稱驗證但沒驗證」具體案例**（2026-08-19）：BUGHUNT_DONE 寫「TASKS.md 已修正 8/31 字串」但沒修；第四輪覆核靠實際重新 grep 才抓到。任何 BUGHUNT_DONE 前必須對確切 pattern 重新跑一次。
- **4/20 挖礦事件同款漏洞差點在規劃中重演**：新機安裝計畫初稿沒主動核對既有事故 runbook。規則：涉及新主機/服務的計畫寫完後必須逐一核對 `runbooks/` 含「SECURITY/INCIDENT/BREACH」的文件。
- **下週優先動作**：
  1. 操作者刷卡購買 OVH KS-6（**買機死線 9/30**）
  2. Migration 0060 apply（SSH EU，一行 psql）
  3. transcript 憑證三項輪換
  4. Defender 資安複盤（逾期 68 天）
