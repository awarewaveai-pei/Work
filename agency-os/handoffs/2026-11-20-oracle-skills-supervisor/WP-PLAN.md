# 算命站 WordPress 階段：派工計畫

續接語：我是這個階段的監工。讀本檔 → `data.mjs`（唯一狀態）→ `mcp__ccd_session_mgmt__list_sessions {linked:true}` 看工人；工人交回照 §4 驗收；操作者授權監工自己派工、選模型、判 RISKS，已定的事不再問她（`ORACLE-WP-SPEC.md` §0、§7）。回報繁中、金額 NT$。建議模型：Fable 5.2 或 Opus 5.5。

監工台：https://claude.ai/artifact/9PGQAU9kFciKoTJT3UxZGi（來源 `data.mjs`；改後 `node build.mjs && node check.mjs`，再以同一個檔案路徑重新發布；別的對話要帶 `url=` 才不會開新網址）。

設計正本：產品 `briefs/ORACLE-WP-SPEC.md`；平台 `briefs/SITE-FLOW-COMPLETION-PLAN.md`；決策 `agency-os/reports/decisions/2026-11-21-oracle-wp-front-door-architecture.md`。本檔只寫「誰做、何時做、怎麼收」，不重述做法。

## 0. 現況快照（2026-11-24；接手先讀這節，再讀 `data.mjs`）

- 批 1–4 全部併入，四批 RISKS 總檢完成（`data.mjs` 四張表；第四批 21 列，2026-11-24）。批 4：E6、P4、SF-K、SF-J2 程式、SF-I2、SF-P（`e6aa5ff91`）；SF-K 清單外兩處假狀態由監工補修（`3fbbf1968`）。SF-P 的問卷後續（規格產內容、品牌色、綁回問卷、問卷狀態）判定本階段不做：正式庫問卷 9 筆皆測試資料。
- 下一步依序：① 已做：next-admin 2026-11-24 手動部署到 `a7a8367b5`（操作者：需要部署才能接著做就部署，03:00 只是保底），正式站 `/onboard`、`/build` 回 308，Playwright smoke 30 passed；備份腳本單站 `.env` 錯誤改計 `SITE_ERRORS`（`00f14c40a`，未上主機）。② 已做：SF-L（見下一條）。③ 批 5（SF-L 已完成）：SF-L → GO-1 → GO-2 → GO-3、SF-O、SF-A。
- **SF-L 完成（2026-11-24）**：`sf-e2e.aware-wave.com` 在正式主機九步走完 → 02:15 UTC 排程備份含此站、02:45 verify PASSED、用該備份實際還原 → `deprovision-site.sh --apply --purge-volumes` → 容器、volume、vhost、登記檔、DB 列（org／site／environment／wp_sites／client_credentials／vault secret）、MainWP 站、DNS、憑證全部歸零；主機開關檔已刪、`site.*` 七列已關回。實跑修掉四個本機測不到的問題：`1a34b4b1f`（`ct_state`）、`d2bbad5a1`（外掛代號）、`1ea446da7`（私有發佈專案 → 主機鏡像 `/var/lib/awarewave/plugin-releases/<repo>/<tag>/<asset>.zip`，操作者決定不公開）、`a3b97256b`（固定網址）。next-admin 已部署 `d2bbad5a1`。**GO-2 前置三項已做（`72e407787`，未部署，03:00 自動部署帶上）**：`scripts/mirror-plugin-release.sh <slug> <tag>`（`release-wp-bridge.sh` 發佈後自動呼叫；oracle 外掛同法，release repo 用 private）；status 的失敗原因取 `output_payload.stages` 失敗階段的 detail；`site-preflight` 回 `busy`。**GO-2 前置再完成兩項（2026-11-24）**：待決 7 → `0181_environments_host_slug_unique`（`403b297d6`，已套用，`environments` 0 列）；oracle 外掛 `v0.5.0` 發佈到 private repo `awarewaveai-pei/aware-wave-oracle`，主機鏡像 `/var/lib/awarewave/plugin-releases/aware-wave-oracle/v0.5.0/`（sha `b21a1c84…`），catalog 已釘 `0.5.0`。**GO-2 內要做**：`ORACLE_SITES`（外掛產生金鑰後）、`AW_SITE_GATEWAY_SLUGS` 加 oracle slug、SF-I2 的內容工具訊息在 oracle 站上試。**GO-1 完成（2026-11-24，`.deployed-commit` `a83b4284b`）**：`sg-deploy.sh oracle-web` smoke 全綠；部署前後 32 個網址（sitemap 全部＋`/`、404、robots、sitemap）狀態／Location／title／canonical／內文雜湊相同，差異只有 CSP 標頭出現與頁面 `Cache-Control` 由 `s-maxage=31536000` 變 `no-store`；`/embed/zh-TW/ziwei` 200；`OPENAI_MODEL_DEEP` 已移除（`printenv` exit 1，備份 `.env.production.bak-go1-20261124`），deep 實打回 `gpt-5.4`；`ORACLE_SITES` 未設（金鑰要等 GO-2 外掛產生，改在 GO-2 加）；`X-Real-IP` 實測為訪客位址。**GO-2 完成（2026-11-24，`32b218619`）**：站 `dd88b1bb-c921-466e-a68e-4b62f83ea0b4`（org 名 `Oracle`，slug `oracle-aware-wave-com`，env `878ea75e…` `metadata.ingress=product-gateway` 由監工以 SQL 設）；容器 `oracle-aware-wave-com-wp`／`-db` 在 `lobster-net`；流程第 1–7 步完成，第 8 步（三項手動）與第 9 步（開放＝GO-3）未做；19 外掛含 `aware-wave-oracle` 0.5.0、`server_engine_url=http://oracle-web:3000`。`lobster-nginx` oracle 區塊改 `map $uri $oracle_backend`（`nginx/default.conf`，repo＝live）；`/` 帶 WP query var 走 WordPress。引擎 `.env.production` 加 `ORACLE_SITES`（key_id `oracle`，備份 `.bak-go2-20261124`），站→引擎 signed batch 實測通過。32 URL 比對 31 同。**開關現況**：`/etc/default/aw-hosting-gate.local`（`AW_SITE_VERBS=on`、`AW_SITE_GATEWAY_SLUGS=oracle-aware-wave-com`）與 `site.*` 七列**仍開**（留給「重設管理員密碼」），操作者確認能登入後關。**等操作者**：登入 `/wp-admin/`、第 8 步三項、建頁面。**第 8 步（2026-11-24）**：Uptime Kuma 監控 28（`/wp-json/`）、29（`/zh-TW` keyword `命理`）已加並勾選（DB 備份 `kuma.db.bak-20261124-oracle-monitors`）；FluentSMTP 連線已由主站複製（`fluentMailGetSettings`→`fluentMailSetSettings`，sender `noreply@oracle.aware-wave.com`），測試信 Resend 回 422（推定主站 key 限 `aware-wave.com` 網域；要新 key）；WPvivid 遠端未設（Google OAuth 要操作者）。Cloudflare `http_ratelimit` 規則的 WP 後台路徑放行只含 `aware-wave.com`／`www`，未含 oracle（待操作者同意才改）；`wp-login.php` 有 managed challenge（規則 `cedbaa68…`，全 zone）。**2026-11-25**：操作者確認能登入 `/wp-admin/`（帳號 `peijingartstudio@gmail.com`）→ 開關全關（drop-in 已刪、`site.*` 七列 false；GO-3 再開）。Resend 新 key `oracle.aware-wave.com WordPress`（sending_access、限該網域，id `751962ff…`）寫入 FluentSMTP → `wp_mail` sent（證實舊 key 限網域）。Cloudflare `http_ratelimit` 規則 `b8ffa72d…` 的 WP 路徑放行加入 `oracle.aware-wave.com`（expression 1106→1146 字；回滾＝刪 ` or http.host eq "oracle.aware-wave.com"`）。**Resend 分帳號（同日，操作者提出）**：`oracle.aware-wave.com` 從主帳號刪除（舊 domain `86fd3992…`、舊 key `751962ff…` 隨之失效）→ 加入算命站獨立帳號（Google `oracle.aware@gmail.com`；domain `7da94026…`，us-east-1）→ Cloudflare `resend._domainkey.oracle` TXT 換新 DKIM（MX／SPF／`rsend` CNAME 不變）→ verified → 新 sending key（id `e6117103…`，限網域）寫入 FluentSMTP → `wp_mail` sent。本機 Resend MCP 仍連主帳號，管不到新帳號（管理金鑰在憑證檔 7.2）。GO-3 前：P3 的 Resend 退信 webhook 要設在新帳號。**WPvivid 遠端（同日）**：主站 `wpvivid_upload_setting` 的 googledrive remote（`Update_Backup`，path `wpvivid_backup`；token 僅 base64，非站台專屬，`class-wpvivid-google-drive.php:770-806`）經 pipe 以 `WPvivid_Setting::add_remote_options` 加到 oracle 站（新 id `wpvivid-remote-6b066da64cbab`）＋`WPvivid_Schedule::set_schedule_ex` 每週 files+db→remote；`wp cron event run wpvivid_main_schedule_event` 實跑：task `wpvivid-e00297af17019` completed，log `Upload success`（109.65 MB）。**流程頁第 8 步三項皆已勾，1–8 步完成，只剩第 9 步＝GO-3。** **zh-TW 頁面（同日，wp-cli）**：`/tools/`（id 5）＋十二工具子頁（id 6–17，`[aw_oracle tool="<slug>"]`，slug＝`lib/site.ts` `PAGE_SLUGS`）、`home`（18，`page_on_front`）、`/my-charts/`（19）、`/daily-letter/`（20）；選單 term 2 掛 `primary`＋`mobile`；`aworacle_settings.page_map` 12 筆；預設範例文章／頁面進回收桶。實測 `the_content` 輸出 iframe `src=/embed/zh-TW/ziwei`、`Renderer::locale()=zh-TW`。**會員與每日信設定（同日）**：`wp-config.php` 常數 `AWORACLE_DATA_KEY`（站內產生）、`AWORACLE_RESEND_WEBHOOK_SECRET`（oracle Resend 帳號 webhook `f33c2fc7…`，events `email.bounced`／`email.complained`）、`AWORACLE_TURNSTILE_SECRET`（Cloudflare widget `oracle.aware-wave.com daily letter signup`，sitekey `0x4AAAAAAGR7K-oMWjgKFMGQ`）；`aworacle_settings` `mailer=fluentcrm`、`turnstile_site_key`；三把密鑰副本在憑證檔 7.2。`dataKeyStatus=ok`、`/daily-letter/` 輸出 `div.aworacle-daily`（表單由 `assets/daily.js` 畫）、`aworacle_daily_run` 已排程。**英文頁定案（同日）**：TranslatePress 3.4.1（免費版）裝在 oracle 站，`trp_settings` `default-language=zh_TW`、`url-slugs={zh_TW:zh,en_US:english}`、預設語言不加子目錄（原值備份在 option `trp_settings_bak_20261125`；回滾＝停用外掛）。`/english/…` 不在 nginx `$oracle_backend` 的引擎前綴內 → WordPress 回應；實測（主機內、五分鐘臨時登入）`/english/tools/ziwei/` 200、`<html lang="en-US">`、iframe `src=/embed/en/ziwei`、hreflang 四條、選單連結皆 `/english/…`；`/tools/ziwei/` 仍 `zh-TW`＋`/embed/zh-TW/ziwei`。翻譯 47 列直接寫入 `wp_trp_dictionary_zh_tw_en_us`（`status=2`；工具名用引擎 `messages/en.json` 的寫法）。**未解**：`<title>` 與 Rank Math 的 meta description 在英文頁仍是中文（免費版不翻；付費 SEO Pack 才翻）→ 做法定為 oracle 外掛 0.5.1 在非預設語言時以 `trp_translate()` 過濾 `rank_math/frontend/title`、`rank_math/frontend/description`（未做）。臨時登入那次誤用 `destroy_all()`，操作者在 oracle 站的登入被清掉（要重登一次）；之後只 `destroy($token)`。**SF-I2 實測（同日，正式站，wp_sites `f787d53e…`）**：`POST /api/tools/publish {action:clients}` 含 `env:878ea75e…` Oracle；`/api/content/categories`、`/tags`、`/api/video/wp-posts` 回空清單（站上無文章，正確）；`PATCH /api/content/wp-post` 回 404 `Site not found or token missing` → 修成 503 `BRIDGE_ONLY_SITE_ERROR`（`4d14a6a2a`：`wp-post-core.ts` `writePost`、`wp-post/route.ts` DELETE；未部署，03:00 自動部署帶上）。**Cloudflare 限流（同日，操作者開 `/en` 遇 Error 1015 後同意）**：`http_ratelimit` 規則 `b8ffa72d…` 尾端加 ` and not (http.host eq "oracle.aware-wave.com" and starts_with(http.request.uri.path, "/_next/static/"))`（expression 1146→1250 字；回滾＝刪這段）；`/en` 一頁＝15 個 static＋12 條預先載入；實測同來源 70 次 static 全 200、隨後 `/en` 200。引擎首頁 EN 按鈕不改：GO-3 的 `ORACLE_FRONT_PAGES` 會把 `/en` 308 到 `/english/`。**外掛 0.5.1（同日）**：`includes/Seo/TranslatedTitles.php`（`6ce09b1b7`，工人 Sonnet 5.5）：非預設語言頁把 `document_title_parts`、`rank_math/replacements` 與 Rank Math 前台 title／description／og／twitter filter 過 `trp_translate()`；無 TranslatePress 不掛。發佈 `v0.5.1`（release repo CI 過；主機鏡像 sha `233064ac…`），catalog 釘 `0.5.1`（`b38af511b`），oracle 站 `wp plugin install <鏡像 zip> --force` → active 0.5.1；實測 `/english/tools/ziwei/` `<title>Zi Wei Dou Shu – oracle.aware-wave.com`、`/tools/ziwei/` 仍中文。**發現**：站 `blog_public=0`，且中英文頁 HTML 都沒有 meta description／og（`wp_head` 內無 Rank Math 輸出；`rank_math_is_configured` option 不存在；原因未查明）。**批 5 文件（同日）**：SF-O `lobster-factory/docs/hosting/CLIENT_SITE_FLOW.md`（`06abaf0e1`）、SF-A 21 檔改成指向手冊（`b66fedfe4`），工人 `wp-docs`（Sonnet 5.5）。工人回報第 9 步 verify 打 `/`、共用網域站會假成功 → `889b303e2`：`steps/open.ts` 改打 `OPEN_PROBE_PATH=/aw-open-check/`；`TOOL_TRIGGER_MAP.md` 加建站列指向手冊。未處理並記錄：`backup-restore-drill.py` 不讀 `sites.d`。**GO-3 順序**：先確認 next-admin 已部署 `889b303e2`，再按第 9 步。**GO-3 前還缺**：`users_can_register=0`（待操作者決定）、操作者實走一次訂閱→確認→收信（Turnstile 擋自動化）、FluentCRM 信尾文字、`blog_public` 改 1＋Rank Math 輸出 description／og 查明、操作者看過畫面（含英文頁）。`ORACLE_FRONT_PAGES` 屆時 `pages` zh-TW `/tools/{slug}/`、en `/english/tools/{slug}/`；`home` zh-TW `/`、en `/english/`。**下一步**：GO-3（待決 6）等操作者說頁面與每日信可用。**等操作者**：`fluent-reviews` 是哪個外掛。（`soulfulexpression.org` 主機憑證已於 2026-11-24 改成 `authenticator = nginx` 並續到 2027-02-22，`cloudflare.ini` 已刪，見 WORKLOG 同日。）主機留下的無害殘留：`/var/lib/wp-cron-runner/lock.sf-e2e-aware-wave-com-wp`、`/run/awarewave/site-locks/sf-e2e-aware-wave-com.lock`、`/var/lib/awarewave/site-jobs/sj-20261124021016-230babd1.*`、`/var/lib/awarewave/deprovisioned/sf-e2e-aware-wave-com-20261124T025910Z/`。
- 等操作者點頭（`data.mjs` `OPEN`，到時一次問一件）：#6 GO-3。#1（0176）、#2（MainWP 金鑰）、#3、#4、#7（0181）、#8（private repo）已完成。
- 部署狀態：引擎線上＝`a83b4284b`（GO-1，2026-11-24；之後的引擎改動仍要手動 `sg-deploy.sh oracle-web`）；外掛 0.5.0 未安裝到任何網站；next-admin 每晚 03:00 自動部署，`site.*` 七個 catalog 開關全關、主機開關檔未設 `AW_SITE_VERBS=on`；`AW_SITE_GATEWAY_SLUGS` 未設（GO-2 前加 oracle 的 slug）。
- 併入做法（`D:\Work` 常被別的 session 的本機 commit 卡住，不在那裡併）：在 `D:/Worktrees/Work/oracle-int` `git fetch && git checkout --detach origin/main && git cherry-pick <sha>` → 引擎在該處跑 `npx tsc --noEmit`＋`npx vitest run`；next-admin 要到有 `node_modules` 的工人 worktree（閒置的那個）`git checkout --detach <整合後 sha>` 跑全套 → `git push origin HEAD:main`。文件與 WORKLOG 也在 `oracle-int` 提交（`python /d/Work/scripts/worklog-insert-entry.py <檔> --date <日> --worklog agency-os/WORKLOG.md`）。監工台從 `oracle-int` 的 `supervisor.html` 發布並帶 `url=`。
- 工人：四條線的 session id 用 `list_sessions {linked:true}` 依 name 查（`wp-engine-a`／`wp-engine-b`／`wp-host`／`wp-admin`）。同帳號共用額度，四個同時跑約一小時多撞 5 小時上限；停了就等重設後用訊息叫回（讀各自的 `HANDOFF-<卡>.md`）。next-admin 全套 vitest 在本機同時跑多個 session 時會有 `app/api/social`、`ops/billing` 的逾時紅燈，重跑即過。
- 規格外的後續（未派工）：`ORACLE-WP-SPEC.md` §8 深度付費報告（Z1–Z3；單次購買、OpenAI、免費版約 1,500 字六段＋一段完整試讀、結尾一次收束）、§9 梅花易數（M1–M3）。Codex 額度 2026-11-24 起恢復，之後的卡可恢復 `/codex-review`。

## 1. 批次

同一批內的卡同時做（各自 worktree、檔案不重疊）；一條線＝一個工人 session，線內依序。批與批之間做一次「一起看 RISKS」（§5）。

| 批 | 線 1（引擎） | 線 2（引擎→外掛） | 線 3（主機腳本） | 線 4（next-admin） | 監工自己 |
|---|---|---|---|---|---|
| 1 | E1 → E3 | E4 | SF-C → SF-D | SF-B | A1 |
| 2 | E2 | P1 | SF-E → SF-F | SF-G | 套 migration（SF-B，需同意） |
| 3 | E5（Sonnet 5.5）→ P3 | P2 | SF-E2 → SF-H | SF-J（Sonnet 5.5）；SF-I 等 SF-I0 | SF-I0（需同意） |
| 4 | E6 | P4（含訂閱表單人機驗證、網址變更清快取、7.4 檢查、翻譯） | SF-K → SF-I2 | SF-J2 → SF-P | SF-L 前置（備份腳本修正與上主機）；SF-L（需同意） |
| 5 | — | — | — | — | GO-1 → GO-2 → GO-3（每步需同意）；SF-O、SF-A（文件要指到 SF-L 跑完才存在的手冊與流程） |

- 關鍵路徑：E1 → P1 → P3 → GO-3；平台 SF-C → SF-D → SF-E → SF-H → SF-L → GO-2。
- 批 1 派出時 E3、SF-D 不另開 session：同一條線的工人交回前一張、監工併入後，用 `SendMessage` 派下一張（context 過長先 `clear_session`）。

## 2. 卡片一覽

| 卡 | 內容（一句） | 正本 | brief | 模型 | 等級 |
|---|---|---|---|---|---|
| E1 | 引擎嵌入版頁面 | SPEC §2-2、§2-4 | `briefs/WP-E1-embed-page.md` | Opus 5.5 | Medium |
| E3 | 既有工具網址轉到 WordPress 頁；sitemap／robots 讓位 | SPEC §2-3、§2-12 | `briefs/WP-E3-front-redirect.md` | Opus 5.5 | Low |
| E4 | 會員票與 AI 每日上限 | SPEC §2-7 | `briefs/WP-E4-member-ticket.md` | Opus 5.5 | Medium（auth） |
| E2 | 引擎全站 CSP | SPEC §2-14 | 批 2 前寫 | Opus 5.5 | Medium（安全） |
| P1 | 外掛修 1M/6n＋同網域嵌入輸出 | SPEC §3 P1′ | 批 2 前寫 | Opus 5.5 | Medium |
| P2 | 命盤與「我存的對象」、加密、隱私匯出刪除 | SPEC §3 P2′ | 批 3 前寫 | Opus 5.5 | High（個資） |
| P3 | 每日信、Resend 退信 webhook、會員票 REST | SPEC §3 P3′ | 批 3 前寫 | Opus 5.5 | High（寄信、個資） |
| P4 | 外掛發佈管道 | SPEC §3 P4 | 批 4 前寫 | Sonnet 5.5 | Medium |
| A1 | ADR 015、017、018 修訂 | SPEC §2-15 | 監工 | 監工 | Medium |
| SF-A | 平台文件更正 | SITE-FLOW §1 第 7 列 | 監工 | 監工 | Low |
| SF-B | 資料模型與紀錄（migration 檔，不套用） | SITE-FLOW §1-4、§3 | `briefs/WP-SF-B-records.md` | Opus 5.5＋`db-expert` | Medium |
| SF-C | `safe-infra-patch.sh` 新建型 | SITE-FLOW §1-3、§3 | `briefs/WP-SF-C-patch-create.md` | Opus 5.5＋`critic` Deep | High |
| SF-D | 站台範本、主機登記、cron、拆除 | SITE-FLOW §1-3、§3 | `briefs/WP-SF-D-site-template.md` | Opus 5.5 | High |
| SF-E | 閘門新動詞（固定子動詞） | SITE-FLOW §1-3、§3 | 批 2 前寫 | Opus 5.5＋`critic` Deep | High |
| SF-F | 備份讀登記 | SITE-FLOW §3 | 批 2 前寫 | Opus 5.5 | High |
| SF-G | 步驟引擎＋API（失敗就不做） | SITE-FLOW §0 I6、§3 | 批 2 前寫 | Opus 5.5 | Medium |
| SF-H | 主機步驟實作 | SITE-FLOW §3 | 批 3 前寫 | Opus 5.5 | High |
| E5 | 引擎收尾：CSP 範圍互補測試、工具結果區標記、sg-deploy smoke 改打嵌入頁 | 第二批 RISKS | 批 3 前寫 | Sonnet 5.5 | Low（smoke 屬部署腳本，Medium） |
| SF-E2 | 主機腳本加固（第二批 RISKS 的主機項） | 第二批 RISKS | 批 3 前寫 | Opus 5.5＋`critic` Deep | High |
| SF-J2 | 建站表單補強：明確選新／既有客戶；`environments.metadata.host_slug` 唯一性（migration，套用需同意） | 第三批 RISKS | 批 4 前寫 | Opus 5.5＋`db-expert` | Medium |
| E6 | 引擎：框內頁向父頁取會員票（`window.parent.awOracleTicket()`）；`lib/daily.ts` 宜忌英文 | 第三批 RISKS | 批 4 前寫 | Opus 5.5 | Medium |
| SF-I2 | `listBridgeClients`／`bridgeClientForSite` 的呼叫端改讀 `listBridgeClientsWithRegistered` | 第三批 RISKS | 批 4 前寫 | Opus 5.5 | Medium |
| SF-I0 | MainWP 金鑰進 next-admin | SITE-FLOW §3 | 監工 | 監工 | High |
| SF-I | MainWP、wp-bridge、寫 `wp_sites` | SITE-FLOW §3 | 批 3 前寫 | Opus 5.5＋`critic` ×2（憑證） | High |
| SF-J | 兩個頁面 | SITE-FLOW §2、§3 | 批 3 前寫 | Sonnet 5.5（`frontend-designer`） | Medium |
| SF-K | 假狀態清除 | SITE-FLOW §1-5 | 批 4 前寫 | Sonnet 5.5 | Low–Medium |
| SF-P | 舊頁退場 | SITE-FLOW §1 第 2 列 | 批 4 前寫 | Sonnet 5.5 | Medium |
| SF-L | 拋棄式網域全流程 | SITE-FLOW §3 | 監工 | 監工 | High |
| SF-O | 手冊＋可跑示範 | SITE-FLOW §3 | 監工 | 監工 | Low |
| GO-1…3 | oracle 上線三步 | SPEC §3 上線 | 監工 | 監工 | High |

後面批次的 brief 在該批開始前寫，因為它們要引用前一批實際定下的東西（E1 的工具根元素 id、SF-C 的型別名稱、SF-D 的登記檔欄位）。先寫會寫錯。

模型選擇：會進 commit 且錯了很貴的（安全、主機、個資、資料模型）＝Opus 5.5；照既有元件搬的頁面與文件＝Sonnet 5.5；純資料填寫本階段沒有，不用 Haiku。

## 3. 工人 session

| 線 | name | 模型 | worktree | 現在的卡 |
|---|---|---|---|---|
| 1 | `wp-engine-a` | Opus 5.5 | 各自（app 建立） | 見 `data.mjs` |
| 2 | `wp-engine-b` | Opus 5.5 | 同上 | 同上 |
| 3 | `wp-host` | Opus 5.5 | 同上 | 同上 |
| 4 | `wp-admin` | Opus 5.5 | 同上 | 同上 |

- 同時最多 4 個工人。session id 用 `mcp__ccd_session_mgmt__list_sessions {linked:true}` 依 name 查，不另外抄寫。
- 沿用同一條線的 session 派下一張（`SendMessage`）；上一張 context 已長就先 `mcp__ccd_session_mgmt__clear_session` 再派。工人自己接近上限時照 `COMMON-WP.md` 的 Context 條。
- 工人不 push、不部署、不連主機、不套 migration；這些全在監工。

## 4. 驗收與併入（每張卡）

1. 讀工人的 FILES／TESTS／RISKS → `git -C <worktree> diff origin/main...HEAD` 讀 diff；回報裡的 `file:line` grep 驗真。
2. 併入：引擎卡 `bash agency-os/handoffs/2026-11-20-oracle-skills-supervisor/pick.sh <sha>`（`D:/Worktrees/Work/oracle-int`；程式檔衝突手動合）→ 專案目錄 `npx tsc --noEmit`＋全套 `npx vitest run` → `git rebase main` → D:\Work `git merge --ff-only` → push。next-admin 與主機腳本卡同法，測試改跑該卡 brief 的指令＋next-admin `npx tsc --noEmit`。
3. 有畫面的卡：監工用預覽實看繁中、英文、375px 各一次。
4. `data.mjs` 改該卡狀態與 commit → `node build.mjs && node check.mjs` → 重新發布同一個監工台網址。
5. WORKLOG：`scripts/worklog-insert-entry.py`＋`scripts/git-partial-worktree-commit.py`（私有 index）。
6. 派該線下一張，或清空／封存 session。

next-admin 每天 03:00 自動部署 main：SF-G、SF-H、SF-I、SF-J 併入後按鈕由 catalog 開關與主機開關檔擋著（SITE-FLOW §0 I6），不需要 `DEPLOY_HOLD`。含 migration 的 commit 必須在 migration 套用後才推（`check-migrations-applied.sh`）：SF-B 的 migration 檔留在工人分支，等操作者同意套用當天再併。

## 5. 一起看 RISKS（每批交回後獨立一步）

- 全批卡都交回才做。把各卡 RISKS 並排，每條三選一：現在修（回派原工人或監工修）、實測驗證、記錄不處理的理由。
- 結果寫進 `data.mjs` `RISKS`（每批一張表，每列必有處置，`check.mjs` 擋空白）與 WORKLOG；監工台重新發布。
- 下一批的 brief 這時才寫，把上一批的結果帶進去。

## 6. 要操作者點頭的時刻（到時一次問一件）

| # | 事 | 在哪張卡之前 |
|---|---|---|
| 1 | 套用 SF-B 的 migration 到正式庫 | 批 2 併 SF-G 之前 |
| 2 | MainWP 金鑰放進 next-admin 容器（主機 compose 變更） | SF-I0 |
| 3 | 開主機開關檔與 catalog、建測試網域 DNS，跑拋棄式全流程 | SF-L |
| 4 | 部署引擎（含目前 main 上所有未部署的引擎卡） | GO-1 |
| 5 | 改 `lobster-nginx` 的 oracle 區塊，讓 WordPress 接非引擎路徑 | GO-2 |
| 6 | 首頁換到 WordPress、正式開放 | GO-3 |

## 7. 已知未驗證（帶進對應的卡）

SPEC §6 全部；Resend 網域 `oracle.aware-wave.com` 驗證狀態（建立於 2026-11-22，當時 pending，P3 開工前 `get-domain` 確認）；經 FluentSMTP 能否帶 Resend 標籤（P3）。
