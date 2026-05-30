# aware-wave-wp-bridge — 讓 AI 完整、順暢、快速控制整個 WordPress 的控制平面

## Context（為什麼做、要達成什麼）
同事 `jonjonesai` 做了一套讓 Claude 操作 WP 的工具(核心:GPL 外掛 `mega-kadence-bridge` + POD 建店 skill)。
使用者要：**用他的核心零件(Bridge),做出比他更強、更安全的版本,讓 AI 能「完整、順暢、快速」控制整個網站**——
規格化批量生成文章與商品、控制站內任何 plugin、操作任何東西——而且要強到讓他驚訝、回頭求教。

**真正的目標(使用者澄清)**：不是只「安全地改幾個設定」,而是一個**完整的全站控制平面 (control plane) + 內容/商品工廠**：
AI 給規格 → 系統批量、可驗證、可回滾地把整站建好/改好。

**已確認的環境事實**：
- soulfulexpression.org = Hostinger + LiteSpeed + Kadence 1.3.6 + Woo 10.6.1(已交接客戶的 **LIVE** 站,直接練手危險)。
- aware-wave.com = 自管 Hetzner(Nginx + Redis + Cloudflare,**無 LiteSpeed**,沒 Kadence/Woo)→ 工具必須跨快取層、多租戶,不能 Hostinger-locked。
- repo 已有成熟治理：R0 四動作驗證、WPvivid 備份門控、tenant `lifecycle` gate、`secrets-vault.ps1`、sg-deploy 的「snapshot→build→smoke→自動回滾」(使用者已信任這套自我修復語意)。

**核心論點(贏過他的根本)**：他做的是**遙控器**;我們做的是**有回饋迴路的控制系統**——
*一筆寫入不算「完成」,直到 Bridge 自己重新 render 觀察到改動生效;沒生效就自動回滾。* 一切差異都從這一條推導出來。

---

## 名詞
- **POD = Print-On-Demand(隨需印刷)**：下單才印不囤貨。他的建店 skill 用;使用者目前不建店,**只取 Bridge 零件**,POD 留未來選項。
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

## E. 安全模型（補掉他全部已確認漏洞 → 威脅模型表）
保留他做得好的:模組化 `includes/`、`/render` 繞快取真相源、history/rollback。**換掉認證與寫入層。**
- **scoped key(read / write 分離)** + 寫入端點額外斷言對應 **WP capability**(`edit_posts`/`manage_options`…)。
- **HMAC 簽章 + timestamp(±300s)+ nonce 單次** 防重放;**只收 header**,`?_key=` 一律 `400`。
- 伺服器**只存 key 的 hash**(明文僅建立時回一次)——修他「明文存 `credentials.json` on disk」。
- **key rotation** 端點(grace overlap);**per-key IP allowlist**;**rate limit**(token bucket → `429`)。
- **無任何 `shell_exec`**(L4 passthrough 走白名單+escape,不是裸 shell)。

| # | 威脅 | 他的暴露 | 我們的緩解 |
|---|------|---------|-----------|
|1|憑證進 log|`?_key=` 入 access log|header-only;`?_key=` 拒|
|2|靜態秘密外洩|明文 `credentials.json`|只存 hash,明文僅回一次|
|3|越權寫入|寫端點無 capability 檢查|scope→WP capability 斷言|
|4|RCE|cache flush 內 `shell_exec`|零 shell_exec;cache 走 hook;L4 白名單+escape|
|5|序列化注入|theme-mod 存 raw|schema+型別收斂;禁 unserialize|
|6|重放|單一靜態 key|timestamp 窗 + nonce 單次|
|7|暴力/濫用|無 rate limit|token bucket + `429`|
|8|無法究責|無稽核|append-only EventLog(who/what/before/after)|
|9|爆炸半徑|單 key 全權|read/write 分離 + rotation + IP allowlist|
|10|靜默損毀|壞 Kadence block 無感|KadenceValidator 寫前 `422`|
|11|寫了沒生效|fire-and-hope|self-healing transaction:render verify + 自動回滾|

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
- **generated typed TS client**(`lobster-factory/packages/wp-bridge-client/`):signed-fetch wrapper 自動算 HMAC、set timestamp/nonce/idempotency、從 vault 讀 key;與既有 `wpFactory.ts` 風格一致。
- **PS/curl wrapper**(`lobster-factory/scripts/wp-bridge-call.ps1`):runbook/操作者用,從 `secrets-vault.ps1` 取 key、簽章、漂亮印 transaction 結果。
- **可觀測性**:append-only EventLog(JSON)、RenderStore(pre/post render diff,保留上限)、`/health`(版本/scopes 數/cache 策略/clock skew/最近 N 筆 op 狀態)接 Uptime Kuma;`rolled_back` 事件推 ops-inbox/Slack,失敗的自我修復**可見不靜默**。

---

## I. 三段式畢業 + repo 原生整合（風險分級）
**新檔路徑**:
- `lobster-factory/packages/wp-bridge-plugin/`(PHP 外掛 + composer.json + phpunit.xml + tests/ + openapi/)
- `lobster-factory/packages/wp-bridge-client/`(typed TS client)、`lobster-factory/packages/wp-content-factory/`(ContentSpec/ProductSpec generators)
- `lobster-factory/scripts/wp-bridge-call.ps1`、`lobster-factory/infra/github/workflows/wp-bridge-ci.yml`
- `.claude/commands/wp-operate.md`(讀為預設、寫先 dry-run;dispatch)、`.claude/agents/wp-rest-operator.md`(繼承備份門控+風險分級;只透過 signed client 動 live 站)
- `agency-os/docs/operations/WP_BRIDGE_OPERATIONS_RUNBOOK.md`
- 擴充每 tenant `core/wp-update-config.json` 加 `bridge` 區塊(baseUrl/keyEnv/keyIdEnv/scope/cache.strategies/ipAllowlist/lifecycle)
- vault:`WP_<TENANT>_BRIDGE_KEY` / `WP_<TENANT>_BRIDGE_KEY_ID` / `WP_<TENANT>_CLOUDFLARE_PURGE_TOKEN`(UPPER_SNAKE,絕不硬編)

**Phase A — 本機沙盒(風險 LOW)**：`bootstrap-local-wordpress-windows.ps1` 起本機 WP+Kadence+Woo,離線開發外掛 + PHPUnit + wp-env Integration,跑通完整迴路 + 自動回滾測試。**不碰任何線上站。多數工程在此完成且已可證明正確。**
**Phase B — repo 原生工具(風險 LOW–MEDIUM)**：落地外掛/OpenAPI/TS client/generators/`/wp-operate`/agent/CI/runbook。CI 閘啟用。僅 `lifecycle=provision_pending`,不寫 live。
**Phase C — 上 staging 再上 prod(風險 MEDIUM–HIGH)**：先建 soulful **staging**(本就是待辦),裝外掛 → 唯讀+dry-run → 單筆低風險寫入(過 WPvivid 備份門控,scope=files+DB)→ staging 全綠才翻 `lifecycle:live` 開 prod 寫入,write-scope key 窄發。aware-wave 的 Cloudflare/Redis 路徑另行驗證。**HIGH 風險僅在 live-prod 寫入那一步,且全程門控。**

---

## J. 大方的框架（把對手的「不服」轉成「求教」）
`README.md` / `SECURITY.md`:
- **開頭顯著致謝**:「本外掛是 jonjonesai/mega-kadence-bridge(GPL)的 hardened fork。其優秀的模組化 `includes/`、繞快取的 `/render` 真相源、history/rollback 模型是他的設計,也是我們的地基——保留是因為它本來就對。」保留 GPL 授權 + 標頭署名。
- **把升級寫成共享威脅模型,不是拆台**:威脅表呈現為「相對上游 baseline 的 hardening deltas」,每列「上游這樣做對單操作者合理;多租戶代理場景我們需要 Y」。
- **把成果回饋**:註明 auth/transaction/validator 模組可往上游 merge,附 CI 證據。語氣是延伸同儕好點子的資深工程師,不是踩人。**這才會讓對手主動求教。**

---

## K. 範圍/工時誠實評估
- **MVP(已決定性贏過他,Phase A+B,約 1.5–2.5 週)**:scoped+hashed key/HMAC/replay/header-only(威脅1,2,6,9)、寫入 capability(3)、零 shell_exec(4)、schema 驗證(5)、KadenceValidator(10)、單筆 self-healing transaction + dry-run(11)、PHPUnit+CI 自動回滾測試、LiteSpeed+Redis+Cloudflare purge-by-URL、**L1 通用原語 + L3 plugin 管理 + ContentSpec/ProductSpec 基礎生成**。
- **Pro-tier(jaw-drop,+1–2 週)**:all-or-nothing batch、非同步 job 佇列大量生成、OpenAPI+typed client+drift gate、render-diff 可觀測性、key rotation+IP allowlist、完整 WooValidator、L2 全 adapter(Fluent/RankMath)、L4 白名單 WP-CLI passthrough。
- **Phase C** 是數小時的謹慎門控執行,非開發工時,但真風險在此。

**設計本身的 top 3 風險**:
1. **/render verify 保真度**:若 verify 被沒清到的層(邊緣 CDN/片段快取/登入態)騙過,壞寫入可能「假通過」。緩解:用他已證明的繞快取 render、斷言穩定結構標記而非易變 HTML、**verify 不確定即視為失敗(回滾)**。
2. **副作用寫入的回滾完整性**:內容/option/theme-mod 可乾淨快照還原;但**有外部副作用的操作(寄 Woo 信、收款、刪訂單)不可假裝能 undo**。緩解:硬分類為**非交易型 / 需人工門控**,拒絕自動回滾,絕不假裝撤銷不可撤銷之事。
3. **clock skew / nonce store 可用性**:時間窗+nonce 依賴可靠時鐘與 transient/Redis;store 故障可能誤拒或悄悄關掉防重放。緩解:`/health` clock-skew 自檢、nonce store 不可達時 **fail-closed(拒絕)**、ops-inbox 告警。

---

## L. 驗證計畫（R0 四動作）
1. **實測**:Phase A 本機 curl/PHPUnit 打每端點 + PoC 每個修好的漏洞(`?_key=`→401、無 cap 寫→403、注入 fatal→自動回滾且 byte 還原);PHP `php -l`;TS 端 `npx tsc --noEmit`。
2. **Review**:`/review`(critic)讀回外掛 + command/agent + generators;markdown code-fence 配對。
3. **抓蟲**:Grep 新 symbol(`wp-operate`/`bridge`/`WP_*_BRIDGE_*`/`ContentSpec`)call sites,scope 含 `agency-os scripts .claude lobster-factory`;確認 tenant json schema 改動無 stale 消費者。
4. **WORKLOG**:[驗證結果] file:line 記四動作 + REALTEST_EVIDENCE / REVIEW_DONE / BUGHUNT_DONE 機械閘行。

## M. 回滾
- A/B:純本機 + repo 新檔,`git revert`;外掛只在本機。
- C:刪 WP 上 key(瞬間撤權)+ 停用外掛;prod 任何寫入前已有 WPvivid 完整備份。

## 採用範圍對齊
✅ fork 他的 Bridge(強化)作連線層 ✅ repo 原生 `/wp-operate` + 四層控制平面 + 內容/商品工廠 + 自我修復 + 測試/CI
❌ 不採用他的 store-drop POD 建店整套 / Archon CLI ⏸ POD 建店留未來選項
