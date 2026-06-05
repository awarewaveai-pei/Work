# aware-wave-wp-bridge — 讓 AI 完整、順暢、快速控制整個 WordPress 的控制平面（設計 SSOT）

> **這份是跨機同步的設計 SSOT（git-tracked）。** 筆電本機的
> `~/.claude/plans/https-github-com-jonjonesai-claude-wp-sequential-clock.md` 是不同步的鏡像，
> 以本檔為準。換機（公司桌機）`git pull` 即取得。
>
> **進度（2026-05-30）**：安全脊椎已實作並驗證 —— `includes/Auth/SignatureVerifier.php`（Ed25519），
> 真測 7/7 PASS（`php -d extension=sodium`）。後續見 §I Phase A 順序。
>
> **深化（2026-06-05，本檔由 `DESIGN.md` 改名為可辨識檔名）**：以 soulfulexpression.org 真實外掛 stack
> 校準，補入 7 項實站護欄（§B 深層頁 verify=1；§D2 護欄 2-5；§E2 並行鎖=6；§I Phase C restore-drill 硬 gate=7）
> 與安全地基決策（§I「安全地基」）。兩個 hard-to-reverse 決策（Ed25519、可逆性分類門控）另記
> [ADR 007](../../../agency-os/docs/architecture/decisions/007-wp-bridge-ed25519-and-reversibility-gating.md)。

## Context（為什麼做、要達成什麼）
同事 `jonjonesai` 做了一套讓 Claude 操作 WP 的工具(核心:GPL 外掛 `mega-kadence-bridge` + POD 建店 skill)。
使用者要：**用他的核心零件(Bridge)的概念,做出比他更強、更安全的版本,讓 AI 能「完整、順暢、快速」控制整個網站**——
規格化批量生成文章與商品、控制站內任何 plugin、操作任何東西——而且要強到讓他驚訝、回頭求教。

**真正的目標(使用者澄清)**：不是只「安全地改幾個設定」,而是一個**完整的全站控制平面 (control plane) + 內容/商品工廠**：
AI 給規格 → 系統批量、可驗證、可回滾地把整站建好/改好。

**已確認的環境事實**：
- soulfulexpression.org = Hostinger + LiteSpeed + Kadence 1.3.6 + Woo 10.6.1(已交接客戶的 **LIVE** 站,直接練手危險)。
- aware-wave.com = 自管 Hetzner(Nginx + Redis + Cloudflare,**無 LiteSpeed**,沒 Kadence/Woo)→ 工具必須跨快取層、多租戶,不能 Hostinger-locked。
- repo 已有成熟治理：R0 四動作驗證、WPvivid 備份門控、tenant `lifecycle` gate、`secrets-vault.ps1`、sg-deploy 的「snapshot→build→smoke→自動回滾」(使用者已信任這套自我修復語意)。

**核心論點(贏過他的根本)**：他做的是**遙控器**;我們做的是**有回饋迴路的控制系統**——
*一筆寫入不算「完成」,直到 Bridge 自己重新 render 觀察到改動生效;沒生效就自動回滾。* 一切差異都從這一條推導出來。

**商業定位(2026-05-30 鎖定,地基級)**：
- **這是要販售的產品**,不只是內部工具 → 架構從 day-1 即多租戶(tenant = 付費客戶)、可白牌、授權抽象層可插拔。
- **授權地基 = Clean-room 自寫**:他的程式碼只當「行為/規格參考」,**一行不抄**,用已讀懂的架構知識獨立重寫 → 完全授權自由(可閉源/雙授權/商業)、**不掛他名字、不被 GPL 傳染**。
- **販售模式先不綁死**:做成「SaaS 託管 / 自管 license-key / 白牌」三種都能套的中性設計(多租戶就緒 + entitlement 抽象層),晚點再選。
- **主介面 = 對話**(他的 UX 就是直接跟 Claude 講話):`/wp-operate` command + agent + Bridge 這條對話脊椎是 MVP 核心;Dashboard(§N)是加分駕駛艙,非必需。
- **可閉源護城河放 SaaS 層**:真正賣錢的價值(Dashboard、內容/商品工廠、orchestration、typed SDK、CI 品質、範本庫)放**雲端專有層,永不下放到客戶伺服器**(open-core / proprietary-SaaS 標準模型),避開 WP-GPL 灰區。

---

## 名詞
- **POD = Print-On-Demand(隨需印刷)**：下單才印不囤貨。他的建店 skill 用;使用者目前不建店,**只取 Bridge 概念**,POD 留未來選項。
- **control plane(控制平面)**：統一入口,AI 透過它讀寫/操作全站所有東西。
- **spec-driven(規格化生成)**：定義一份 ContentSpec / ProductSpec 範本,AI 填值 → 批量生成,結果可驗證、可回滾。

---

## A. 完整控制平面 — 「操作任何東西」的四層架構（回應核心需求）
固定 REST 外掛無法天生覆蓋每個 plugin 的設定(各自存法不同)。要真正「控制 anything」,分四層:

| 層 | 覆蓋範圍 | 端點/機制 |
|---|---------|----------|
| **L1 通用原語** | 站內**任何**標準儲存:任何 `option`、任何 post/term/user `meta`、任何 **post type**、任何 **taxonomy/term** | `GET/POST /option/{key}`、`/meta/{type}/{id}/{key}`、`/cpt/{type}`、`/term/{tax}` —— 多數 plugin 設定其實就存在 options/CPT/meta,L1 即覆蓋大半「任何東西」 |
| **L2 型別化 adapter** | 常用 plugin 的友善型別端點 + 驗證護欄:**Kadence / WooCommerce / Fluent 系 / Rank Math / LiteSpeed** | `/kadence/*`、`/woo/products|orders|categories`、`/forms/*`、`/seo/*` —— 帶 schema 驗證(見 D) |
| **L3 plugin 生命週期** | **安裝 / 啟用 / 停用 / 更新 / 設定任何 plugin**;主題切換 | `/plugins`(list/activate/deactivate/update)、`/plugins/install`(從 wp.org slug 或上傳 zip);REST 做不到的(如裝 zip)走 **L4 受控 passthrough** |
| **L4 受控 WP-CLI passthrough** | 真正的「任何東西」逃生艙,但**不是裸 shell**(否則=他的 `shell_exec` RCE 漏洞) | `POST /wpcli`,**僅允許白名單子命令**(`plugin install/activate`、`option update`、`cache flush`、`core verify-checksums`…),參數 escape,write-scope + `manage_options` + 稽核 + dry-run;**禁** `eval`/`db query`/任意 shell |

> 「控制任何東西」= L1 通用原語(覆蓋大半)+ L2 典型 adapter(友善+安全)+ L3 plugin 管理 + L4 白名單 CLI(補齊長尾)。
> 每一層的**寫入都走同一個自我修復 transaction(B)+ 驗證護欄(D)+ 稽核**,所以「強大」不等於「危險」。

**競爭事實 —「完整控制 WP 後台」的真相**:對手宣稱其工具「可完整控制 WP 後台」。讀其 PHP 原始碼:他開的是**精選 REST 端點**(theme-mod/posts/pages/menus/media/Kadence/Woo/options/history),這是「覆蓋常用後台操作」,**非**「完整控制後台」。純 REST adapter 的**天花板**:覆蓋不了任意 plugin 的 admin page(很多 plugin 走自有 AJAX/nonce 或寫非標準資料表)、任意 CPT/使用者管理/plugin 安裝。要真正「完整控制後台」**架構上必須** L1(任意 option/meta/CPT——後台設定頁九成是寫 options)+ L3(plugin 生命週期)+ L4(受控 CLI 補長尾)——**這三層他都沒有,本設計三層皆備且全程門控**。結論:他宣稱的能力,他的工具其實做不到;那正是本設計已解掉的部分。

---

## B. 自我修復寫入 transaction（頭號差異點，移植她信任的 sg-deploy Step 7）
每一筆寫入都是一個 transaction：**validate → (idempotency) → snapshot(含 pre-render hash) → apply → 目標 URL 精準 purge → /render 重新觀察驗證 → 通過則 commit,失敗則自動回滾到 snapshot 並再驗證回滾成功 → 寫結構化稽核事件**。
- **dry-run 模式**：`?dry_run=true` 只回 diff 預覽不套用 → AI/操作者先看清楚要改什麼。
- **idempotency key**：重試不會重複套用。
- **all-or-nothing batch**：`POST /batch` 多筆一起,任一驗證失敗 → 反序全回滾。
- 回應契約(成功/`rolled_back`/`dry_run`)含 `render_hash_before/after`、`assertions`、`cache.purged_urls`、`rollback_token`、`audit_event_id`。
- **verify URL 集合 ≠ 單一目標 URL（護欄 1，soulful 校準）**：影響「全站結構」的寫入（permalink 結構、theme-mod、template、taxonomy）必須 render-verify **一組深層頁樣本**（首頁 + ≥3 個深層 post/page/product/category URL），非只驗目標頁。根因：Permalink Manager Pro 改壞時首頁照常 render、深層頁全 404 → 單頁 verify 會假通過。樣本集存 tenant `bridge.verifyUrlSamples`，預設由 sitemap 抽樣。

---

## C. 規格化生成：文章工廠 + 商品工廠（回應「規格化生成文章和商品」+ 速度）
在 Bridge 之上建 **generator 層**(repo 端 TS,呼叫 Bridge),把「批量、規格化、快」做出來:
- **ContentSpec → 批量文章**：一份 spec(主題/受眾/語氣/字數/SEO 關鍵字/內鏈規則/Kadence 區塊範本)→ AI 生成 N 篇 → 每篇走 transaction(含 KadenceValidator)→ 批量發布,失敗自動回滾該篇。
- **ProductSpec → 批量 Woo 商品**：spec(分類/價格規則/變體/圖片來源/SKU 規則/庫存)→ 批量建商品 + 變體 + 分類 + 圖片(`/media/upload-from-url`),WooValidator 驗價格/SKU/庫存。
- **範本庫(templatized)**：頁面/文章/商品的 Kadence 區塊範本存 repo(`templates/`),spec 只填變數 → 產出一致風格。
- **速度/順暢**：① `/batch` 一次多筆 ② 大量生成走**非同步 job 佇列**(`POST /jobs` 回 job_id,`GET /jobs/{id}` 輪詢進度,避免 PHP timeout)③ 客戶端 typed SDK 並行呼叫 ④ 精準 purge-by-URL 不全清,verify 快。
- 對 AI 友善:OpenAPI + typed client 讓 Claude 的呼叫**型別安全、自我描述**,少試錯 = 順暢快速。

---

## D. 護欄：把他的血淚變成伺服器端 fail-fast 驗證
- **KadenceValidator**：每個 `kadence/rowlayout`/`column` 必含 `"kbVersion":2`(否則 RWD 靜默壞——他試錯學到的);`uniqueID` 非空且不重複;巢狀完整;`serialize(parse(x))===x`;`kadence/*` 區塊名白名單。違反 → `422` 帶 `block_index` + 修法 hint。
- **WooValidator**：價格 decimal≥0、`sale<regular`、`stock_status` 列舉、SKU 不撞、狀態轉移合法、**絕不靜默刪訂單/明細**、變體父商品存在。
- **Schema 驗證**：每端點 JSON-schema + 型別收斂後才 `update_option`/`set_theme_mod`;**禁 unserialize 不信任輸入**(修他的序列化注入風險)。

---

## D2. soulful 實站校準護欄（2026-06-05 深化 — DESIGN 通用設計對 soulful 真實 stack 的補完）
> soulful 實際外掛（`agency-os/tenants/company-soulful-expression/core/wp-update-config.json` waves）：Kadence(+Pro) + **Astra-portfolio** + **CartFlows** + FluentForms/**FluentCRM**/**FluentSMTP** + **Permalink Manager Pro** + ACF Pro + Ultimate Member + Woo(+Points&Rewards) + LiteSpeed。通用 Kadence/Woo validator **覆蓋不足**，補三條：

- **護欄 2 — PermalinkValidator（致命：改壞 = 全站深層頁 404）**：任何寫 `permalink_structure` / Permalink Manager Pro 的 option/CPT-rewrite 前，先 dry-run 算新規則對 ≥3 個深層頁的 URL 影響；apply 後強制走 §B 深層頁 verify；任一深層頁非 200 → 立即回滾。**permalink 結構寫入歸不可逆敏感類（見 §I 門控表）**。
- **護欄 3 — Fluent 系寫入 = 側效類（會寄真信給訂閱者）**：`/forms/*` 讀取安全；但 **FluentCRM automation / campaign / contact-tag 觸發、FluentSMTP 寄送設定** 的寫入可能對真實訂閱者群發 → 歸**不可逆人工門控類，永不自動回滾**（§I 門控表）。FluentForms 的「送出測試」亦視為側效。
- **護欄 4 — Astra-portfolio / CartFlows 無 L2 adapter → 落 L1 + 加倍保護**：這兩個外掛無友善型別端點，只能走 L1 通用原語 raw 寫入 → **強制 dry-run + 結構 schema 嗅探 + 深層頁 verify**，不得無 preview 直寫。CartFlows 的 flow/checkout 步驟改動歸側效類（影響結帳）。標記為「L1-only，validator backlog」。
- **護欄 5 — L3 plugin 更新對 license-gated 外掛必 detect + refuse（禁 silent fail）**：soulful 有 5 個 license-gated 外掛（ACF Pro / Kadence Blocks Pro / Permalink Manager Pro / Astra Pro / Woo Points&Rewards），**WP-CLI 抓不到 license server → 更新會靜默失敗**。L3 `/plugins/update` 前先比對 **既有 SSOT `wp-update-config.json` 的 `licenseGated` 清單**（禁新建平行清單），命中 → 回 `409 license_required` + 「請 WP admin 手動更新」hint，**不得回報 completed**。對應既有 `wp-install-plugins.ts` 的 `mode=skipped_*` 範式。

---

## E. 安全模型（補掉他全部已確認漏洞 → 威脅模型表）
保留他做得好的概念:模組化 `includes/`、`/render` 繞快取真相源、history/rollback。**換掉認證與寫入層,並一行不抄、clean-room 自寫。**

**認證決定:採 Ed25519 非對稱簽章(優於 HMAC)。** 客戶端 SDK / SaaS 控制平面持**私鑰**(在 vault,永不下放到站);
WP 外掛只存**公鑰**。每請求簽章綁定 `METHOD\nPATH\nTIMESTAMP\nNONCE\nsha256(body)`。
→ **站被駭也偽造不了寫入**(站上無私鑰);HMAC/Basic 則偷到伺服器那份共享密鑰就能全偽造。已實作 `SignatureVerifier.php`,真測 7/7。
- **scoped key(read / write 分離)** + 寫入端點額外斷言對應 **WP capability**(`edit_posts`/`manage_options`…)。
- **Ed25519 簽章 + timestamp(±300s)+ nonce 單次** 防重放;**只收 header**,`?_key=` 一律 `400`(不接受網址列帶 key)。
- 站上**只存公鑰**(私鑰在 vault)——修他「明文存 `credentials.json` on disk」且被駭也無法偽造。
- **key rotation** 端點(grace overlap);**per-key IP allowlist**;**rate limit**(token bucket → `429`)。
- **無任何 `shell_exec`**(L4 passthrough 走白名單+escape,不是裸 shell)。

| # | 威脅 | 他的暴露 | 我們的緩解 |
|---|------|---------|-----------|
|1|憑證進 log|`?_key=` 入 access log|header-only;`?_key=` 拒;簽章而非密鑰上線|
|2|靜態秘密外洩|明文 `credentials.json`|站上只存公鑰;私鑰在 vault,站被駭也無法偽造|
|3|越權寫入|寫端點無 capability 檢查|scope→WP capability 斷言|
|4|RCE|cache flush 內 `shell_exec`|零 shell_exec;cache 走 hook;L4 白名單+escape|
|5|序列化注入|theme-mod 存 raw|schema+型別收斂;禁 unserialize|
|6|重放|單一靜態 key|Ed25519 簽章 + timestamp 窗 + nonce 單次|
|7|暴力/濫用|無 rate limit|token bucket + `429`|
|8|無法究責|無稽核|append-only EventLog(who/what/before/after)|
|9|爆炸半徑|單 key 全權|read/write 分離 + rotation + IP allowlist|
|10|靜默損毀|壞 Kadence block 無感|KadenceValidator 寫前 `422`|
|11|寫了沒生效|fire-and-hope|self-healing transaction:render verify + 自動回滾|

### E2. 並行寫入控制（護欄 6 — 多 AI session / 多操作者同時寫同站）
威脅 #12：兩個 writer（bridge + 人工 / 兩個 AI session）同時對同一 tenant 寫入 → snapshot 互蓋、回滾還原到錯誤基準。
- **緩解**：每筆寫入 transaction 開始前，取得 **per-tenant 寫入鎖**，**重用既有 `resource_locks` 表**（`packages/db/migrations` 已存在，禁新建平行鎖機制）。lock key = `wp-bridge:<tenant>:write`；持鎖期含 snapshot→apply→verify→commit；釋放於 commit 或 rollback 後。
- 取鎖逾時 → `409 Conflict` + `retry_after`，不排隊盲等。`/health` 報目前持鎖狀態。read-scope 操作不取鎖。

---

## F. 快取層可攜（soulful 與 aware-wave 都能跑）
`CacheStrategy` 介面 + 依 tenant 設定選用:**LiteSpeed(hook,非 shell_exec)+ Redis object cache + Cloudflare API purge-by-URL(非 purge-all)+ WP Rocket/W3TC + Null**。soulful 用 `["litespeed"]`,aware-wave 用 `["redis","cloudflare"]`。verify 在 purge 後才讀,絕不被邊緣快取騙。

---

## G. 可證明的正確性：測試 + CI（資深工程師會肅然起敬的關鍵；他完全沒有）
- **PHPUnit**:Unit(簽章 valid/expired/replayed/tampered、nonce 拒重放、KadenceValidator 全 invariant + 他真實壞 block 的 golden fixture、WooValidator、capability、各 CacheStrategy mock);Integration(真 WP DB 跑完整 READ→PLAN→CHANGE→PURGE→VERIFY,**頭號測試:注入會 PHP fatal 的寫入 → 斷言自動回滾且內容 byte 級還原**)。
- **容器化 harness**:`@wordpress/env`/Docker WP+MariaDB+Kadence+Woo,本機(Phase A)先綠。
- **GitHub Actions**(`lobster-factory/infra/github/workflows/wp-bridge-ci.yml`):PHPCS(WP-Extra)+ PHPStan → Unit → wp-env Integration → **安全閘**(grep 斷言無 `shell_exec`/`eval`,且 `?_key=` 路徑回 400)→ OpenAPI↔client 不漂移。任一紅 = 擋 merge。

---

## H. 型別化契約 + 客戶端 + 可觀測性
- **OpenAPI 3.1**(`packages/wp-bridge-plugin/openapi/...yaml`):每端點/auth header/transaction 信封/dry-run/batch/job/錯誤碼;無 spec 條目的端點 CI fail。
- **generated typed TS client**(`lobster-factory/packages/wp-bridge-client/`):signed-fetch wrapper 自動算 **Ed25519 簽章**、set timestamp/nonce/idempotency、從 vault 讀私鑰;與既有 `wpFactory.ts` 風格一致。
- **PS/curl wrapper**(`lobster-factory/scripts/wp-bridge-call.ps1`):runbook/操作者用,從 `secrets-vault.ps1` 取私鑰、簽章、漂亮印 transaction 結果。
- **可觀測性**:append-only EventLog(JSON)、RenderStore(pre/post render diff,保留上限)、`/health`(版本/scopes 數/cache 策略/clock skew/最近 N 筆 op 狀態)接 Uptime Kuma;`rolled_back` 事件推 ops-inbox/Slack,失敗的自我修復**可見不靜默**。

---

## I. 三段式畢業 + repo 原生整合（風險分級）
**新檔路徑**:
- `lobster-factory/packages/wp-bridge-plugin/`(PHP 外掛 + composer.json + phpunit.xml + tests/ + openapi/) ← **已起頭:README.md + includes/Auth/SignatureVerifier.php**
- `lobster-factory/packages/wp-bridge-client/`(typed TS client)、`lobster-factory/packages/wp-content-factory/`(ContentSpec/ProductSpec generators)
- `lobster-factory/scripts/wp-bridge-call.ps1`、`lobster-factory/infra/github/workflows/wp-bridge-ci.yml`
- `.claude/commands/wp-operate.md`(讀為預設、寫先 dry-run;dispatch)、`.claude/agents/wp-rest-operator.md`(繼承備份門控+風險分級;只透過 signed client 動 live 站)
- `agency-os/docs/operations/WP_BRIDGE_OPERATIONS_RUNBOOK.md`
- 擴充每 tenant `core/wp-update-config.json` 加 `bridge` 區塊(baseUrl/keyId/scope/cache.strategies/ipAllowlist/lifecycle)
- vault:`WP_<TENANT>_BRIDGE_PRIVATE_KEY` / `WP_<TENANT>_BRIDGE_KEY_ID` / `WP_<TENANT>_CLOUDFLARE_PURGE_TOKEN`(UPPER_SNAKE,絕不硬編)

**Phase A — 本機沙盒(風險 LOW)**：`bootstrap-local-wordpress-windows.ps1` 起本機 WP+Kadence+Woo,離線開發外掛 + PHPUnit + wp-env Integration,跑通完整迴路 + 自動回滾測試。**不碰任何線上站。多數工程在此完成且已可證明正確。**
  - 砌磚順序:✅SignatureVerifier(Ed25519,7/7) → NonceCache(單次性,fail-closed) → KeyStore(公鑰記錄+scope+rotation) → Http/Router+capability → 自我修復 Transaction+dry-run → KadenceValidator/WooValidator → CacheStrategy(LiteSpeed/Redis/Cloudflare) → L1 通用原語 → L3 plugin 生命週期 → L4 白名單 WP-CLI → PHPUnit+CI。
**Phase B — repo 原生工具(風險 LOW–MEDIUM)**：落地外掛/OpenAPI/TS client/generators/`/wp-operate`/agent/CI/runbook。CI 閘啟用。僅 `lifecycle=provision_pending`,不寫 live。
**Phase C — 上 staging 再上 prod(風險 MEDIUM–HIGH)**：
1. **建 soulful staging**（`ENVIRONMENT_REGISTRY.md` 現為 `provision_pending`，無 staging）。
   **Hostinger Premium 不含一鍵 staging（Business+/Cloud 才有），但 Premium 可架多站（本帳號 3 站、soulful 僅用 1 → 有空位）→ 把 staging 加成「獨立網站格」**：
   在 hPanel 把 `staging.soulfulexpression.org` 新增為**獨立網站**（自己的 docroot + 自己的 DB，**檔案/資料庫真隔離**），再用既有 SSH（`wp-update-config.json` host `191.101.230.176:65002`, key `hostinger_soulful`）`wp db export` + `rsync` files → clone 進 staging 格 → `wp search-replace` 換 URL。**不裝第三方 staging plugin、不升 Business**，用既有信任工具鏈。唯一共用層 = 同帳號伺服器資源/LiteSpeed/IP（CacheStrategy 已處理 LiteSpeed），對驗 restore + bridge 迴路足夠。
   - **sodium 驗證**：建 staging 時順手 `php -m | grep sodium`（Ed25519 依賴；sodium 自 PHP 7.2 為核心內建，PHP 8.2 預設帶 → 風險 LOW，**不為此單獨 SSH prod**，折入本步免費驗）。
2. **護欄 7 — restore drill 硬 gate（不可跳）**：在開放任何 live 寫入前，**必須對 staging 跑一次完整 restore drill 並證明 byte 還原**（soulful 的 `BACKUP_RESTORE_PROOF.md` 目前「未執行」= 安全網未驗）。drill 未綠 → live 寫入一律 `423 Locked`。
3. staging 唯讀+dry-run → 單筆低風險寫入（過 WPvivid 備份門控,scope=files+DB）→ staging 全綠才翻 `lifecycle:live`。
4. live 開放後 **按下方可逆性分類門控**；write-scope key 窄發。aware-wave 的 Cloudflare/Redis 路徑另行驗證。**HIGH 風險僅在 live-prod 寫入那一步,且全程門控。**

### 安全地基（2026-06-05 架構決策，授權人：操作者；決策人：本專案架構師）
**C → A 混合，B 永不當預設**：① 本機沙盒（Phase A）跑通完整迴路 + fatal 注入自動回滾 → ② 建 soulful staging + restore drill 硬 gate → ③ 才開 live，且按可逆性分類。理由：把「最快見效」收斂在「本機可全速、live 才慢」，爆炸半徑最小，符合 30-yr 紀律；Phase A 本來就是主戰場，不浪費。

### 可逆性分類門控表（強制 — 每個寫入端點啟動時標類）
| 類別 | 操作例 | 處置 |
|------|--------|------|
| **可逆（自動）** | blog 文章/頁面、option/meta、Kadence block、Woo 商品**草稿**欄位 | self-healing transaction → 沒生效自動回滾，無需人工 |
| **不可逆敏感（人工門控，永不自動回滾）** | Woo 訂單刪改/退款/收款、**FluentCRM automation/campaign 觸發**、FluentSMTP 寄送、**permalink 結構**、CartFlows checkout flow、Woo 商品**發佈/下架/價格** | dry-run → Dashboard `approvals` 人按 approve → 才 commit；**絕不假裝能 undo 已寄出/已收款** |
| **拒絕（不開放）** | 裸 SQL、任意 shell、`eval`、`db query` | L4 白名單外一律 `403` |

---

## J. Clean-room 與授權姿態（取代「致謝 fork」——因為要商業販售且獨立於他）
- **Clean-room 自寫**:不抄、不衍生他的任何原始碼;僅參考 WordPress REST / Kadence / Woo 的**公開行為與資料模型**。授權由我們決定(可閉源/雙授權)。
- **不依賴、不掛他名字、不受 GPL 傳染**(這是商業販售 + 心理獨立的前提)。
- **WP-GPL 灰區防護**:把可閉源的價值(Dashboard、generators、SDK、CI、範本庫)放**雲端專有層,永不下放客戶伺服器**(open-core / proprietary-SaaS 標準)。

---

## K. 範圍/工時誠實評估
- **MVP(已決定性贏過他,Phase A+B,約 1.5–2.5 週)**:scoped key + **Ed25519 簽章(非對稱,站上只存公鑰)**+replay/header-only(威脅1,2,6,9)、寫入 capability(3)、零 shell_exec(4)、schema 驗證(5)、KadenceValidator(10)、單筆 self-healing transaction + dry-run(11)、PHPUnit+CI 自動回滾測試、LiteSpeed+Redis+Cloudflare purge-by-URL、**L1 通用原語 + L3 plugin 管理 + ContentSpec/ProductSpec 基礎生成**。
- **Pro-tier(jaw-drop,+1–2 週)**:all-or-nothing batch、非同步 job 佇列大量生成、OpenAPI+typed client+drift gate、render-diff 可觀測性、key rotation+IP allowlist、完整 WooValidator、L2 全 adapter(Fluent/RankMath)、L4 白名單 WP-CLI passthrough。
- **Phase C** 是數小時的謹慎門控執行,非開發工時,但真風險在此。

**設計本身的 top 3 風險**:
1. **/render verify 保真度**:若 verify 被沒清到的層(邊緣 CDN/片段快取/登入態)騙過,壞寫入可能「假通過」。緩解:用繞快取 render、斷言穩定結構標記而非易變 HTML、**verify 不確定即視為失敗(回滾)**。
2. **副作用寫入的回滾完整性**:內容/option/theme-mod 可乾淨快照還原;但**有外部副作用的操作(寄 Woo 信、收款、刪訂單)不可假裝能 undo**。緩解:硬分類為**非交易型 / 需人工門控**,拒絕自動回滾,絕不假裝撤銷不可撤銷之事。
3. **clock skew / nonce store 可用性**:時間窗+nonce 依賴可靠時鐘與 transient/Redis;store 故障可能誤拒或悄悄關掉防重放。緩解:`/health` clock-skew 自檢、nonce store 不可達時 **fail-closed(拒絕)**、ops-inbox 告警。

---

## L. 驗證計畫（R0 四動作）
1. **實測**:Phase A 本機 curl/PHPUnit 打每端點 + PoC 每個修好的漏洞(`?_key=`→400、無 cap 寫→403、注入 fatal→自動回滾且 byte 還原);PHP `php -d extension=sodium -l`;TS 端 `npx tsc --noEmit`。
2. **Review**:`/review`(critic)讀回外掛 + command/agent + generators;markdown code-fence 配對。
3. **抓蟲**:Grep 新 symbol(`wp-operate`/`bridge`/`WP_*_BRIDGE_*`/`ContentSpec`)call sites,scope 含 `agency-os scripts .claude lobster-factory`;確認 tenant json schema 改動無 stale 消費者。
4. **WORKLOG**:[驗證結果] file:line 記四動作 + REALTEST_EVIDENCE / REVIEW_DONE / BUGHUNT_DONE 機械閘行。

## M. 回滾
- A/B:純本機 + repo 新檔,`git revert`;外掛只在本機。
- C:刪 WP 上 key(瞬間撤權)+ 停用外掛;prod 任何寫入前已有 WPvivid 完整備份。

## N. 整合進 app.aware-wave.com（Ops Dashboard / lobster-next-admin）— 強相關，非牛馬不相干
**定位**:現有 Dashboard = 駕駛艙(cockpit,人看/審批);Bridge = 執行器(actuator,動 client WP)。AI 用 typed client 驅動 Bridge,人在 Dashboard 看/批。兩者共用同一個 `wp-bridge-client` SDK。Dashboard **已具備 ~80% 接點**(實際讀到的現有路由):
- `app/ops/clients/page.tsx` + `app/ops/clients/[slug]/page.tsx` —— 每租戶頁,**已有** `api/ops/clients/[slug]/wp-report/route.ts`、`wp-update/route.ts`。→ 在 `[slug]` 頁加「**WP Control**」面板:per-tenant `/health`、最近 ops(committed/rolled_back)、render-diff、key 狀態、一鍵 dry-run。
- `app/ops/approvals/page.tsx` + `api/ops/approvals/[id]/approve|reject/route.ts` —— **既有審批流**。→ Bridge 對 prod 的寫入/批量生成走此 gate:AI 提交 dry-run 結果 → Dashboard 顯示 diff → 人按 approve 才 commit。**「prod 寫入人工門控」UI 已經存在,直接接。**
- `api/ops/audit-events/route.ts` —— Bridge 的 EventLog(who/what/before/after/rolled_back)直接 fan-in 此稽核流。
- `api/ops/ai-image-jobs/route.ts` —— 非同步 job 先例。→ ContentSpec/ProductSpec 批量生成做成 `api/ops/wp-jobs`,沿用同模式(回 job_id + 進度)。
- `app/ops/inbox/*` —— `rolled_back` / 失敗自我修復事件推此,**可見不靜默**。

**新增(next-admin 端)**:`app/ops/clients/[slug]` 內 WP Control 面板元件 + `api/ops/clients/[slug]/wp-bridge/*` route(server-side 用 `wp-bridge-client` 呼叫該租戶 Bridge,私鑰從 env/vault 讀,**不外露到瀏覽器**)+ `api/ops/wp-jobs/*`。
**架構注意(誠實)**:next-admin 在 SG VPS,Bridge 在各 client 站(如 Hostinger)→ Dashboard 的 API route **server 端**跨網呼叫 Bridge(SG→Hostinger 有延遲但控制操作可接受;簽章/私鑰留在 server)。
**治理注意**:next-admin 改動走 `sg-deploy.sh`(npm test + typecheck + smoke + 自動回滾)且受 auto-repair guard 規則管;新 UI/API 須過這條 pipeline,符合既有閘。
**注意**:`app.aware-wave.com` 仍在使用者持續改/整合中 → §N 為**最後、可選**一層,等 Dashboard 穩定再接;Phase A/B 完全不碰 next-admin。

## P. 平台全景 + Gap 分析（2026-05-30 範圍擴張：從「WP bridge」→「整個 Client Onboarding 建站平台」）
使用者把目標擴大成完整的 Onboarding Portal → 表單 → Claude 生規格 → staging-first 建站 → 監控 → 自修復。
**R0 重大發現:此平台 ~80% 已存在於 repo,任務本質是「補完缺口」而非「從零建」。**

### 已存在（重用，禁止重做）— file:evidence 見 2026-05-30 三份 Explore 報告
- **多租戶 Supabase schema**:`packages/db/migrations/0001..0025`：organizations→workspaces→projects→sites→environments、`workflow_runs`、`package_install_runs`、`approval_policies/approvals/approval_steps`、`agents/agent_runs`、`ops_incidents`、`repair_runs`、`command_requests`、`system_modes`、`ai_image_jobs`、`media_assets`、`tenant_integration_bindings`、`smoke_test_results`、`adopt_audits`、`handoff_reports`、`resource_locks`、`ops_audit_events`。
- **Onboard/Build UI**:`app/onboard/OnboardWizard.tsx`(5 步)、`app/build/BuildConsole.tsx`(profile_a/b/c)、`lib/build-console/contracts.ts`。
- **Manifests**:`packages/manifests/{wp-basic,wp-business,wc-core}.json` + Zod `apps/api/src/types/manifest.ts` + `wpFactory.ts` validator。
- **Trigger.dev 任務**:`create-wp-site`、`apply-manifest`、`adopt-client-os`、`orchestrate-tenant-provisioning`、`record-tenant-integration`、`dispatch-action-run`、`wp-install-plugins`、`ao-infrastructure-check`(`packages/workflows/src/trigger/`)。
- **監控/webhook/notify**:`app/api/webhooks/{sentry,uptime-kuma,netdata,grafana,posthog}/route.ts` + `lib/ops-inbox/{redactSecrets,fingerprint,verifyIngestToken,transition,notify/{slack,telegram,rules,dispatcher}}`。
- **Repair Center**:`lib/repair-center/{types,policy,run-state,service,backup,github}.ts` + `app/api/ops/repairs/**`(policy catalog:sentry=auto_repair / uptime,grafana=analysis_only / netdata,deploy=human_only、狀態機、critical pipeline gate、health gate）。
- **Approvals**:`app/api/ops/approvals/**` + `command_requests`(high/critical gating + RBAC)。
- **Plugin packs SSOT**:`agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md`(base16 + ecommerce/tourism/brand)。M3 部門:`next-admin/lib/department-catalog.ts`(20 clusters)。
- **Run/rollback 範式**:`workflow_runs`(status: queued/running/succeeded/failed/waiting_approval)、`package_install_runs`(含 rollback_run_id)、`sg-deploy.sh`+`rollback-phase1.sh`、`LOBSTER_ENABLE_DB_WRITES`/`LOBSTER_MANIFEST_EXECUTION_MODE` gates。

### Net-new（真正要做的缺口）
1. **🆕 Client-facing 智能 Intake Portal**:現有 OnboardWizard 是**操作者導向、技術性**(slug/plugin pack/department)。缺的是**客戶導向的探索式表單**(公司/品牌/產品/客群/目標/參考站/視覺風格/素材/頁面/功能/SEO-GEO/CRM/電商/客服/自動化)= sc-icg.com / yangsheep.art 那種 intake。**這是主要新工作。**
2. **🆕 Spec-generation 大腦**:Claude 把 intake → 完整網站規格(sitemap/頁面結構/首頁文案/設計方向/圖片需求/plugin-pack 選擇邏輯/逐 plugin 配置/staging→QA→launch)。建材都有,缺的是 generator + prompt + 輸出 schema。
3. **🆕 Package 自動選擇規則引擎**:產業/目標/功能 → package + manifest。packs 已存在,規則引擎是新的。
4. **🆕 客製商品電商 package**(`wc-custom`/POD):新 manifest + **ProductSpec/客製商品 generator**(變體、個人化欄位、印製範圍、供應商)。**→ 此處他的 store-drop POD DAG 重獲參考價值(見下)。**
5. **🆕 Per-tenant 監控自動佈建**:平台級監控已有;缺「建站後自動幫該客戶開 Sentry project + Uptime Kuma monitors + 告警路由到客戶 Slack/Telegram」。`orchestrate-tenant-provisioning` 已部分做,需補齊 checkout/form/CRM-webhook/plugin-fatal 監控項。
6. **🆕 WP 執行 bridge(本案原始範圍)**:把生成的規格**安全地套到站上**(對話式/自我修復)= `aware-wave-wp-bridge`,當 `apply-manifest` 之後的「逐 block/逐設定」精修層。
7. **🆕 Client-zero dogfooding**:aware-wave.com 自身當 profile_a 客戶,跑同一條 pipeline。

### POD 參考價值重估
**對,改判。** 原本因為「只操作既有站」判 POD 無關;但使用者要做**客製商品電商**(net-new #4),
他的 `store-drop-skill` 43-node DAG(palette→products→pages→menus→dark-mode→verify 的 staging-first 驗證式建店序列)
**對「電商 package 的建站步驟序列 + Kadence/Woo 商店設定知識」是有效參考**。界線不變:**只當行為/步驟參考,clean-room 自寫,不抄 code、不用 Archon CLI**。

### Client-zero
**對,且架構已支援。** 現有 `profile_a`(AO-agent / aware-wave.com internal)就是為此存在。
aware-wave.com 當「客戶零號」跑完整 intake→spec→build→monitor pipeline = 最佳 dogfooding + 第一個展示案例(像 sc-icg/yangsheep 拿自己網站當招牌)。

## 採用範圍對齊
✅ clean-room 自寫 Bridge(net-new #6)作執行層 ✅ 接既有 onboard/build/manifests/trigger/repair/approvals,**不重做 80% 已存在部分**
✅ 整合進 app.aware-wave.com(Dashboard 當駕駛艙,最後一層) ✅ **他的 POD 重列為「電商 package 建站序列」參考**(clean-room)
✅ 客製商品電商 = 新 `wc-custom` package + ProductSpec generator ✅ aware-wave.com = client-zero(profile_a dogfooding)
❌ 不抄他的 code / 不用 Archon CLI ⏸ 販售商業模式先不綁死(中性多租戶設計)
