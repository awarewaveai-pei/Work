# 採用並超越 jonjonesai 的 Claude × WordPress 工具鏈

## Context（為什麼做這個）
使用者的同事 `jonjonesai` 做了一套讓 Claude 操作 WordPress/Kadence/WooCommerce 的工具,核心是一個自寫的
WP 外掛 **Mega Kadence Bridge**(REST 控制層)+ 一個 POD 建店技能 `store-drop-skill`。使用者想「**用他的東西讓自己的
Claude 能操作 WP/Kadence/Woo,而且要做得比他更強更安全**」。經調查:
- 使用者的 **soulfulexpression.org** 環境(Hostinger + LiteSpeed + Kadence 1.3.6 + Woo 10.6.1)正好完全相容他的工具,
  但那是**已交接給客戶的正式站**,直接拿來練手風險高(使用者自己也覺得危險)。
- 已讀過他兩個 Bridge 外掛的 PHP 原始碼,確認**多項安全弱點**(見下),這是我們「做得更好」的著力點。
- 使用者 repo 已有成熟 WP 維運紀律(MainWP+WPvivid 備份門控、`secrets-vault.ps1`、tenant `lifecycle` gate、R0 四動作),
  新工具必須接進這套,而不是繞過。

**目標成果**:一個 repo 原生的 `/wp-operate` 能力,讓 Claude 透過 **強化版 Bridge 外掛** 安全操作 Kadence/Woo 站,
先在沙盒練熟,再經備份門控上正式站,且跨整個機隊(Hostinger LiteSpeed + 自管 Nginx/Redis/Cloudflare)都能用。

---

## 名詞(供日後查閱）
- **POD = Print-On-Demand(隨需印刷)**:客人下單才印製出貨(T 恤/馬克杯/海報…),不囤庫存,背後接 Printful/Printify。
  他的 `store-drop-skill` 是「一鍵生 POD 店」;使用者目前不需要建店,只需要「操作既有站」能力,故**不採用整套 skill,只取 Bridge 零件**。
- **Bridge 外掛**:裝在 WP 上、開一組私有 REST API 讓 Claude 改站的 PHP plugin。是這整套真正可重用的核心。

---

## 他的 Bridge 安全弱點（已讀 PHP 證實 → 我們的改進清單）
來源:`mega-agent-bridge.php`(單檔版)+ `mega-kadence-bridge.php`(v1.1.0,模組版)原始碼。

| # | 他的弱點 | 我們的強化版做法 |
|---|---------|----------------|
| 1 | API key 可放網址列 `?_key=`(被 access log / 瀏覽器歷史記錄) | **只接受 header 認證**,移除 query-param 路徑 |
| 2 | 寫入端點(posts/theme-mod/css)**無 capability 檢查** | 每個寫入端點加 `current_user_can('edit_posts'/'manage_options')` |
| 3 | cache flush 內含 `shell_exec("wp litespeed-purge…")` = RCE 面 | 移除 shell_exec,改用 LiteSpeed 官方 action hook + Cloudflare API |
| 4 | **無 rate limiting**,可暴力嘗試 | 加 per-IP / per-key 簡易 rate limit(transient 計數) |
| 5 | **無稽核日誌**,改了什麼查不到 | 每筆寫入記 who/what/before/after/when 到 audit log + history |
| 6 | 輸入未驗證/未消毒(theme-mod 值存 raw PHP,序列化注入風險) | 型別白名單 + `sanitize_*` + 拒絕序列化物件 |
| 7 | cache flush **只覆蓋 LiteSpeed 系**,自管 Nginx/Redis/CF 站失效 | 多層 flush:LiteSpeed + Redis object cache + **Cloudflare API purge** + WP Rocket/W3TC |
| 8 | 無「改前完整備份」門控(只有事後 rollback snapshot) | **寫入前驗證 WPvivid 新備份存在**(接 repo 現有備份門控)才放行 POST |

> 結論:我們不從零寫,而是 **fork 他的 `mega-kadence-bridge`(已 GPL,結構乾淨:`includes/` 模組化 + history/rollback)**,
> 把上述 8 點補上,改名 `aware-wave-wp-bridge`。保留他做得好的部分:`/render` 繞快取回讀驗證、history/rollback、Kadence kbVersion:2 規則。

---

## 推薦方案:三段式畢業 + repo 原生治理整合

### Phase A — 本機沙盒練手（零風險,先做）
**目的**:在不碰任何線上站的前提下,把「Claude 經 Bridge 操作 Kadence/Woo」整條流程跑通、把強化版 Bridge 開發+驗證完成。
1. 用既有 `scripts/bootstrap-local-wordpress-windows.ps1` 起本機 WP(`-EnsurePhpIni`)。
2. 本機裝 Kadence + Kadence Blocks + WooCommerce(對齊 soulful 版本:Kadence 1.3.6 / Woo 10.6.1)。
3. 裝**他原版** Bridge 跑一遍,確認流程(READ→PLAN→CHANGE→PURGE→VERIFY)。
4. 在此沙盒**開發強化版 `aware-wave-wp-bridge`**,逐項補完上表 8 點,本機 curl 實測每個端點。
- 風險:Low(純本機)。

### Phase B — repo 原生能力（與你的治理紀律融合）
新增檔案,遵循 repo 既有 skill/agent/command 慣例:
- `lobster-factory/packages/wp-bridge/`(或 `lobster-factory/infra/wp-bridge/`)— **強化版 Bridge 外掛原始碼**(fork+harden),
  含 `aware-wave-wp-bridge.php` + `includes/`,並寫 `README.md` 列端點與安裝步驟。
- `.claude/commands/wp-operate.md` — 入口 slash command(dispatch 到 agent;子命令 `info|render|theme-mod|page|product|cache-flush|history|rollback`)。
- `.claude/agents/wp-rest-operator.md` — 執行 agent(繼承 AwareWave 工程師身份;READ→PLAN→CHANGE→PURGE→VERIFY;
  寫入前查 tenant `lifecycle==live` + 備份門控;render 回讀為 source of truth)。
- `agency-os/docs/operations/WP_REST_BRIDGE_RUNBOOK.md` — 完整 runbook(安裝/認證/安全操作/錯誤恢復/vault key 名稱)。
- 每 tenant `core/wp-update-config.json` 加 `restBridge: { enabled, baseUrl, userLogin, vaultKey, cacheLayer }` 欄位。
- **憑證走 vault**:`scripts/secrets-vault.ps1 -Action set -Name WP_SOULFUL_BRIDGE_APP_PASSWORD`(命名 `WP_<TENANT>_BRIDGE_APP_PASSWORD`);
  **禁止**把 App Password 寫進任何 `.json`/`.md`(repo R0/R4 紅線)。
- 復用既有:`lobster-factory/apps/api/src/services/wp/wpFactory.ts`(install plan 慣例可參考)。
- 風險:Low–Medium(repo 內新檔 + 1 個既有 json schema 擴充)。

### Phase C — 上線畢業（嚴格門控）
1. **先建 staging**:`staging.soulfulexpression.org` 目前 `provision_pending`(`ENVIRONMENT_REGISTRY.md`)。
   建 staging(Hostinger 子網域,LiteSpeed 與正式站相同)→ 裝強化版 Bridge → 全流程實測。
2. **正式站**:僅在 staging 全綠後,於正式站操作,且**每次寫入前過 WPvivid 備份門控**
   (`BACKUP_RESTORE_PROOF.md` 證據 + 既有 `wp-maintenance` safe-update 紀律);先只開 **GET/render 唯讀**,確認穩定再開寫入。
3. 風險:**High(正式客戶站 / 建 claude-bot 用戶 / REST 寫入端點)** — 需使用者逐站明示 go-ahead + 先備份;
   符合 repo「操作風險分級」與 Auto-Repair 紅線(禁改 auth 類預設關閉,需明示開啟)。

---

## 關鍵檔案一覽
**讀(參考慣例)**:`.claude/agents/wordpress-maintenance-agent.md`、`.claude/agents/wordpress-plugin-expert.md`、
`.claude/commands/wp-maintenance.md`、`agency-os/docs/operations/MAINWP_WPVIVID_CLIENT_BACKUP_RUNBOOK.md`、
`lobster-factory/apps/api/src/services/wp/wpFactory.ts`、`agency-os/tenants/company-soulful-expression/core/wp-update-config.json`。
**新增/改**:`lobster-factory/packages/wp-bridge/*`(強化版外掛)、`.claude/commands/wp-operate.md`、
`.claude/agents/wp-rest-operator.md`、`agency-os/docs/operations/WP_REST_BRIDGE_RUNBOOK.md`、各 tenant `wp-update-config.json`(加 restBridge 欄位)。
**vault**:`WP_<TENANT>_BRIDGE_APP_PASSWORD`(經 `scripts/secrets-vault.ps1`)。

---

## 驗證計畫（R0 四動作）
1. **實測 end-to-end**:Phase A 本機 curl 打每個端點(GET /info、POST /theme-mod、POST /pages/ensure、POST /cache/flush、
   GET /render 回讀比對改動生效);強化端點逐一 PoC 安全弱點已修(如 `?_key=` 應回 401、無 cap 的寫入應回 403)。
   `aware-wave-wp-bridge.php` 改動 → `php -l` 語法檢查;若有 TS(wpFactory 周邊)→ `npx tsc --noEmit`。
2. **Review**:`/review`(critic subagent)讀回強化版外掛 + 新 command/agent;markdown lint code-fence 配對。
3. **抓蟲**:Grep 跨檔搜新 symbol(`wp-operate`/`restBridge`/`WP_*_BRIDGE_APP_PASSWORD`)call sites,
   scope 含 `agency-os`、`scripts`、`.claude`、`lobster-factory`;確認 tenant json schema 改動無 stale 消費者。
4. **WORKLOG**:[驗證結果] 以 file:line 記錄四動作;含 REALTEST_EVIDENCE / REVIEW_DONE / BUGHUNT_DONE 機械閘格式行。

## 回滾
- Phase A/B:純本機 + repo 新檔,`git revert` 即可;外掛只在本機。
- Phase C:刪除 WP 上的 App Password(瞬間撤權)+ 停用/移除 Bridge 外掛;正式站任何寫入前已有 WPvivid 完整備份可還原。

## 剩餘不確定點
- 強化版外掛的 8 項改進實作量(估中等;fork 既有結構,非從零)。
- Cloudflare purge 需 aware-wave 站才用得到;soulful(Hostinger)主要靠 LiteSpeed,此端點對 soulful 非必要。
- staging 建置本身是獨立子任務(Day-2 待辦),會與本案串接。

---

## 採用範圍確認（與使用者意圖對齊)
- ✅ 採用他的 **Bridge 外掛**(fork + 強化)作為連線層。
- ✅ 在 repo 內建**原生** `/wp-operate` 能力,融合既有備份門控/vault/lifecycle gate(= 比他更安全)。
- ❌ **不**採用他的 `store-drop-skill` 整套 / Archon CLI / POD 建店 DAG(使用者目前需求是「操作既有站」,非「建 POD 店」)。
- ⏸ POD 建店能力保留為未來選項(若日後 soulful 要賣周邊商品再評估)。
