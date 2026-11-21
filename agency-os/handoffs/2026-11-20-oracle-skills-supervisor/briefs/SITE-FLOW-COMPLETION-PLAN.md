# 客戶建站流程補完計畫（操作者能從頁面一路做完；oracle.aware-wave.com 為第一個實走案例）

狀態：規劃（2026-11-21 產出；**2026-11-22 依 `briefs/PLAN-REVIEW.md` 與門面定案就地修訂**；未改任何程式；等操作者看過 §4 後才派卡）。前置文件：`briefs/SYSTEM-OPERABILITY-AUDIT.md`（盤點）。
分工：本檔只寫建站平台（next-admin 與主機）。算命站的產品（引擎、外掛）與 oracle 上線順序 GO-1–GO-3 在 `briefs/ORACLE-WP-SPEC.md`，本檔不重述。`briefs/WP-front-door-plan.md` 已作廢。
縮寫：`NA/`＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`、`INFRA/`＝`lobster-factory/infra/hetzner-phase1-core/`、`WF/`＝`lobster-factory/packages/workflows/src/`、`MIG/`＝`lobster-factory/packages/db/migrations/`。
所有給 worker 的 brief 照抄兩句：「回報操作者一律繁體中文」、AGENTS §1「不做無效益測試」句。

---

## §0 設計不變量（每張卡都要守）

- I1 **頁面狀態一律由即時觀測得出**（主機探測＋`ops_action_runs` 最後一筆），不存「已完成」布林。理由：現有假狀態全是寫死或把計畫當實況（§1-5）。
- I2 **會動主機的每一步＝同一個契約**：precheck → plan（預覽＋雜湊）→ 操作者按確認 → execute → verify → 失敗自動 rollback → `ops_action_runs` 留紀錄。沿用 `NA/lib/repair-center/remediations/types.ts:26-36` 與 `engine.ts:146-188` 的形狀，不另發明。
- I3 **next-admin 不持有主機 shell**：只經既有 SSH forced command `INFRA/scripts/aw-hosting-gate.sh`（文法白名單 `:42-49`，非白名單 exit 126）；主機檔案改動一律經 `INFRA/scripts/safe-infra-patch.sh`（AGENTS §0、§6）。
- I4 **秘密只存參照**：值進 Supabase Vault（`NA/lib/secret-vault.ts:20,30`），表內只存 `client_credentials.secret_ref`（`MIG/0050_*.sql:8,49`）；DB 密碼在主機端產生，不經 next-admin（前例 `aw-hosting-gate.sh:69,157-161`）。
- I5 **建立的每一種持久資源都有拆除路徑**（`INFRA/scripts/deprovision-staging.sh:17`）；拆除只做主機端腳本、不開 HTTP／SSH 動詞（同檔 `:21-27` 的理由）。
- I6 **雙鑰預設關，失敗就不做**：主機端開關檔＝總閘（主機腳本一推上 main 就同步到主機，`INFRA/scripts/sync-host-scripts.sh:3-6`）；`ops_action_catalog.enabled`＝逐步驟開放。兩者皆開才生效。`site.*` 動作**不走** `NA/lib/ops-actions/record.ts` 的自動補列（`:38-58` 沒有 catalog 列時會補一列 `enabled: true`）與寫入失敗照做（`:34-36`）：沒有 catalog 列就拒絕；`ops_action_runs` 寫不進去就不執行。改 `/etc/default/aw-hosting-gate.local` 照 `CLAUDE.md`「VPS drop-in 並行」做 mtime 檢查。
- I7 不為 oracle 寫特例：網域、埠、容器名、憑證路徑全是參數或觀測結果。

---

## §1 決定表

| # | 項目 | 建議 | 一句理由 | 否決的替代 |
|---|---|---|---|---|
| 1 | 範圍切法 | **本輪（走完 oracle 的最小集合）**：①新增客戶＋站紀錄 ②網址檢查（DNS 讀取、憑證涵蓋、網址佔用、容器現況）③建正式站容器（含備份登記）④裝 WordPress＋佈景＋外掛（含自有外掛 release 網址）⑤掛網址上線（建置中模式）⑥MainWP ⑦wp-bridge 金鑰與連線 ⑧手動項目勾選（Uptime 監控、WPvivid 遠端、寄信）⑨正式開放。Uptime 監控本輪手動：Uptime Kuma 沒有建監控的 REST API（`lobster-factory/packages/workflows/src/lib/tenant-provisioning/providers/uptimeKuma.ts:6`）。**之後**：預覽網址（搬既有網站的客戶用）、監控自動化（socket.io 側車）、租新主機（盤點 2b）、從頁面簽新網域憑證、從頁面寫 DNS、試做站→正式站搬移、外部主機接管（SSH 欄位編輯、`wp-update` 改讀新表）、Sentry、tenant 資料夾自動化、刪舊頁、金鑰輪替。**頁面**：新頁 `/ops/sites/new`（建立）＋`/ops/sites/[siteId]`（流程頁）；客戶頁「佈建」分頁改為同一份狀態摘要＋連結 | oracle 需要的每一步都在；其餘不是 oracle 案例的必要條件 | staging 子目錄當必經步驟：要另做搬移工具（WP-front-door G1），oracle 不需要；DNS 自動寫入：`WF/hosting/providers/cloudflare/dns.ts:96-104` 對既有紀錄直接 PUT 覆蓋，且客戶網域多半不在我們的 Cloudflare 帳號 |
| 1a | 試做站與正式站 | 正式站直接建在獨立容器；掛網址時 WordPress 設「建置中」（`blog_public=0`＋維護頁），設定完按「正式開放」 | 新網域沒人來，建置中模式就是預覽；不需搬移工具、不需暫時網址與憑證。**只適用「網域目前沒有站在服務」**；網域已有站在服務的（oracle、搬家的客戶）不走這條：oracle 的接法在 `ORACLE-WP-SPEC.md` GO-2／GO-3（現站不中斷），搬家客戶的預覽網址列入之後 | 先建 `aware-wave.com/staging/<slug>/` 再搬：多一張 High 搬移卡；內部埠＋Host 標頭預覽：操作者瀏覽器做不到 |
| 2 | 一條或兩條流程 | **收斂為一條**「客戶建站流程」（`/ops/sites/*`）。`/ops/onboarding` 保留為選用的 AI 需求問卷，其「觸發建站」改為「用這份規格建立建站流程」；**本輪就退場**（卡 SF-P）：`/onboard` 的 Step 3 部門選型、Step 4 外部服務搬進客戶頁的分頁；`/onboard`、`/build` 兩頁刪除並 308 轉到 `/ops/sites/new`（API 留給測試）；入口一併清：`app/(shell)/page.tsx:57-59`、`app/sidebar-sections.ts:43`、`app/(shell)/ops-console/page.tsx:131`、`ClientHubTabs.tsx:664` | 一個狀態來源；不留兩套並存 | 加橫幅、下一輪再刪：就是兩套並存；三頁都保留並補狀態：三份狀態來源必然漂移 |
| 3 | 主機步驟的安全做法 | 見 §1-3 子表 | — | — |
| 4 | 設定資料模型 | 啟用**既有未使用**的 `environments` 表（`MIG/0001_core.sql:134-151`：`base_url`、`hosting_provider`、`server_ref`、`wp_root_path`、`credentials_ref`、`status`、`metadata`；next-admin 與 workflows 零寫入者，`WF/trigger/create-wp-site.ts:331-338` 只回傳物件）。每站每環境一列；`ops_action_runs.environment_id` 已有外鍵（`MIG/0011_ops_console_control_plane.sql:20`）。細節 §1-4 | 一組織可多站多環境；`client_config` 一組織一份，已靠 `staging_url`／`site_url` 兩鍵硬撐（`provision-staging/route.ts:210-213`） | 繼續塞 `organizations.metadata.client_config`：一組織一站，且 `/api/ops/organizations` 會整包覆蓋 metadata（`api/ops/organizations/route.ts:42-53`）；新開表：既有表已是這個形狀 |
| 5 | 假狀態清除 | 見 §1-5 子表 | — | — |
| 6 | 網域已被佔用 | 「網址檢查」由閘門 `site-preflight` 讀主機 `/etc/nginx/sites-enabled/*` 的 `server_name` 回報佔用檔名；被他檔佔用時「掛網址」步驟 **blocked**（顯示佔用者），建容器與裝 WP 照做（只在內部埠）。環境列有參數 `metadata.ingress` ∈ {`host-vhost`（預設：流程建主機 vhost）, `product-gateway`（網址由既有產品閘道分路，例如與產品共用網域）}；`product-gateway` 時「掛網址」顯示「由工程師在產品閘道設定」並改為手動勾選，範本的 `same_host_products` 開（容器加入 `lobster-net`）。oracle 用 `product-gateway`，閘道那一步是 `ORACLE-WP-SPEC.md` GO-2。客戶頁健康探測改為「該網址回應的是不是這個 WP」（讀 `environments.base_url`，比對 `/wp-json/` 站名），不再只看 200（`ops/clients/[slug]/page.tsx:73`） | 佔用者是我們自己的產品基礎設施，不是客戶站；改產品閘道不做成客戶流程按鈕（爆炸半徑＝所有產品） | 流程內建「讓出網域」按鈕：要能改別的產品 vhost，爆炸半徑＝任何站；不檢查：照現況會把引擎的 200 當成 WP 健康（盤點 §oracle） |
| 7 | 文件 | 單一事實來源：**現況＝程式＋新手冊 `lobster-factory/docs/hosting/CLIENT_SITE_FLOW.md`**（卡 SF-O，E2E 後寫）。`APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md` 只留願景與路線圖，「現況」表（`:84-92`）與 Stage 1（`:143-150`）改一行指標；`EMBED_PROVISION_INTO_APP.md:1-4` 標「未接；route 派不存在的任務（`api/provision/route.ts:115-120,162`）；列入之後」；`NEW_TENANT_ONBOARDING_SOP.md` 加「頁面建站」路徑、修 `:42` 與 `:105` 矛盾（G4）；頁面建立的站其 URL SSOT 改為 DB `environments`，`CLAUDE.md` 目錄分工表 `ENVIRONMENT_REGISTRY.md` 列與 `.claude/agents/client-onboarding.md:19,59` 同步改寫 | 頁面寫不了 repo 檔，URL 只能以 DB 為準；tenant 檔改成指向客戶頁 | 讓頁面寫 repo：prod 容器不該有 git 寫權；保持 `ENVIRONMENT_REGISTRY.md` 為 SSOT：每建一站都要人手同步，必漂移 |
| 8 | 測試與上線 | 見 §1-8 子表 | — | — |

### §1-3 會動主機的步驟

共同做法：
- next-admin → 既有 SSH key（`HOSTING_BRIDGE_SSH_*`，`INFRA/docker-compose.yml:506-511`，含主機指紋釘選）→ `aw-hosting-gate.sh` 新動詞 → 主機執行。
- 超過 Cloudflare 約 100 秒上限的動作（建容器、拉映像）在主機以 `systemd-run` 背景執行，回 job id；頁面輪詢 `site-job <id>`（next-admin 不能在回應後繼續做事，`provision-staging/route.ts:530-536`）。job 狀態檔放 `/var/lib/awarewave/site-jobs/`。
- 新動詞需主機開關檔 `/etc/default/aw-hosting-gate.local` 內 `AW_SITE_VERBS=on`，否則 126（I6）；既有 `staging-*` 不受影響。
- 參數只有 slug 與 domain；容器名、埠、volume、憑證路徑由主機登記檔 `/etc/awarewave/sites.d/<slug>.json` 或觀測決定，不從 argv 帶入。
- 文法：`SLUG_RE` 沿用（`aw-hosting-gate.sh:29`）；`DOMAIN_RE` ＝ `^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$`＋長度 ≤253；`JOB_RE` ＝ `^sj-[0-9]{14}-[0-9a-f]{8}$`。
- `safe-infra-patch.sh` 要求檔案已存在（`:28`），新站 compose 與 vhost 無法建立 → 卡 SF-C 加兩種「新建」型 `compose-new`、`host-nginx-new`；rollback＝`compose down`（不刪 volume）＋刪檔／刪 sites-enabled 連結。仍是同一支腳本，維持「唯一合法路徑」。
- 頁面確認：先按「看要做什麼」→ 伺服器算出計畫（將寫入的主機檔路徑、容器名、埠、網域、憑證、回滾方式）＋雜湊 → 按「確認執行」帶雜湊，伺服器重算不符回 409（防按到過期計畫）→ `ops_action_runs` 寫 `approval_status=approved`＋操作者（欄位已存在，`api/onboarding/trigger-build/route.ts:389-390`）。

| 步驟 | 閘門動詞／呼叫 | 執行內容 | 冪等 | verify | rollback |
|---|---|---|---|---|---|
| 網址檢查 | `site-preflight <slug> <domain>`（唯讀）＋Cloudflare API 讀 DNS（既有 `CLOUDFLARE_API_TOKEN`，`docker-compose.yml:476`；只用 GET） | 回 JSON：佔用此網域的 vhost 檔、涵蓋此網域的 live 憑證路徑（讀 SAN）、`<slug>-wp`／`<slug>-db` 容器狀態、登記檔、DNS 是否指向本機 IP 且 proxied | 唯讀 | — | — |
| 建容器 | `site-create <slug> <domain>`（背景 job） | 從範本 `INFRA/scripts/templates/client-wp/`（放 scripts 下才會隨 `sync-host-scripts.sh` 上主機）產生 `/root/sites/<slug>/docker-compose.yml`、`.env`（DB 密碼主機端產生、0600）；埠取 8100–8199 未用者；`safe-infra-patch.sh compose-new` → healthy → 寫 `/etc/awarewave/sites.d/<slug>.json`；wp-config 設 `DISABLE_WP_CRON`，並由登記檔產生主機 cron「每分鐘 `wp cron event run --due-now`」（前例 `lobster-factory/infra/soulful/nginx/soulfulexpression.org.conf:133` 的 `wp-cron-runner.sh`；拆站時一起移除）；最後以 Host 標頭打內部埠確認 WP 回應 | 登記檔在且容器 healthy → `state=reused` | healthy＋內部埠 200/302 | `compose-new` 失敗自動 down＋刪檔；成功後要拆＝`deprovision-site.sh`（主機端，預設 dry-run） |
| 裝 WP＋外掛 | `site-wp <slug> <子動詞> [白名單參數]`：**固定子動詞**（`install`、`plugins`、`open`、`close`、`set-mainwp-id`、`put-bridge-pubkey`、`reset-admin-password`），腳本內建在主機端，**不收任意 stdin 腳本**（正式站的 `wp eval` 等於能讀該站全部會員資料；既有 `staging-wp` 的 stdin 形狀只留給 staging，`aw-hosting-gate.sh:13-15`）；容器名取自登記檔 | `wp core install`（url＝https://domain、語系、管理員＝操作者 email，非固定 `admin`，對照 `provision-staging/route.ts:36-37`）；管理員密碼主機端產生、**只在該次回應顯示一次、不存 Vault**（wp-cli 經閘門執行不需要密碼；忘了用 `reset-admin-password`）；Kadence；外掛＝catalog 的 WordPress.org slug＋**自有外掛 release 網址白名單**（前綴 `https://github.com/awarewaveai-pei/<repo>/releases/download/`，repo 清單取自 catalog）；`mainwp-child`；wp-bridge | `core is-installed` 判斷（`provision-staging/route.ts:455-466` 同法）；已裝外掛 no-op | `wp plugin list` 與計畫一致；`/wp-json/` 200 | 安裝前 `wp db export` 到 volume 內；失敗還原 |
| 掛網址上線 | `site-vhost <slug>`（網域取自登記檔） | 重跑佔用檢查，被他檔佔用即拒；無涵蓋憑證即拒；範本產生 `/etc/nginx/sites-available/<domain>.conf`（soulful 同型 `infra/soulful/nginx/soulfulexpression.org.conf:9-49`，不含其商店快取段）→ `safe-infra-patch.sh host-nginx-new <檔> <domain>`；同時 WP 設建置中 | 內容相同 → no-op | safe-infra-patch 經 127.0.0.1 探測 https（`:217-241`）＋頁面再確認回應是此 WP | 腳本失敗自動還原；成功後撤銷＝主機端腳本移除連結 |
| 備份 | 隨「建容器」寫登記檔；卡 SF-F 讓 `backup-ks-aw-01.sh`（現逐站寫死 `:92-121`）與 `backup-coverage-check.py`（要求每個可寫掛載都列入，`backup-inventory.json:2`）讀 `sites.d` | — | — | 備份 dry-run 列出 `<slug>-db`、`<slug>_wordpress_data` | soulful 合約名不變（`infra/soulful/docker-compose.yml:6-12`） |
| MainWP | next-admin 呼叫既有 `addSiteToMainWp`（`WF/integrations/integration-steps.ts:371-436`）；先經 `site-wp` 在站上設 unique id（同 `provision-staging/route.ts:308-317`） | 需 `MAINWP_DASHBOARD_URL/CONSUMER_KEY/CONSUMER_SECRET` 進 next-admin 容器（現只 Trigger 端讀，`integration-steps.ts:60-65`；next-admin compose 無此變數）→ 一次性 compose 變更（SF-I0） | MainWP 已有該 URL → 完成 | 回 `success:1`＋站 id，寫 `environments.metadata.mainwp_site_id` | MainWP 移除（手動，頁上記錄） |
| wp-bridge | next-admin 產 Ed25519 金鑰對；公鑰經 `site-wp` 寫入站上 `{prefix}awbridge_keys`（欄位見 `packages/wp-bridge-plugin/includes/Admin/AdminPage.php:162-166`）；私鑰進 Vault，`client_credentials` 存參照；`NA/lib/payments/woo.ts` 的 client 清單在 env 之外加讀「已登記站」 | 私鑰不出 next-admin 程序（I4） | key_id 已存在 → 不重產 | 簽一個 `/health` 請求 200 且版本相符 | 站上標 revoked＋刪 Vault 列 |
| 監控 | 本輪手動（第 8 步勾選項）：操作者在 Uptime Kuma 介面加一筆，回流程頁打勾並填監控名稱 | 打公開網址（Uptime Kuma 負責 public reachability，AGENTS §0） | — | — | 刪監控 |
| 正式開放 | `site-wp`：關建置中、`blog_public=1` | — | 已開放 → no-op | 首頁非維護頁 | 改回建置中 |

### §1-4 資料模型

| 資料 | 位置 | 誰能改 |
|---|---|---|
| 客戶（組織） | `organizations`（`kind` 預設 customer，`MIG/0110_plans_entitlements.sql:36-37`）；建立走新 `lib/site-flow/records.ts`，**合併** metadata，不覆蓋 | owner/admin（`canWriteTenantConfig`） |
| 站 | `sites`（`MIG/0001_core.sql:117-132`） | 流程頁「新增」；名稱可改 |
| 環境（主機類型、網址、路徑） | `environments` 一列／環境；`hosting_provider` ∈ {`ks-aw-01-docker`, `ks-aw-01-staging-subdir`, `external-ssh`}（`ks-aw-01-docker` 與 `scripts/update-client-wp-plugins.ps1` 既有 profile 同名）；`server_ref` ＝ `ks-aw-01`；`base_url`；`wp_root_path`；`metadata.{ingress, container, db_container, port, vhost_file, mainwp_site_id, bridge:{key_id, credential_id}}` | **只由步驟寫**，不開手改端點（防 DB 與主機分歧） |
| 秘密（bridge 私鑰；**不含** WP 管理員密碼） | Vault；`client_credentials.secret_ref`；`environments.credentials_ref` 指向 `client_credentials.id` | 只由步驟寫；頁面只顯示「已設定／未設定」 |
| 站屬於哪個組織（bridge 寫入、內容工具選站都讀它） | `wp_sites`（`organization_id`；讀取者 `NA/lib/payments/woo.ts:53-74` `bridgeSiteOrg`、`provision-staging/route.ts:211-214`）。**建站步驟「wp-bridge」完成時寫入一列**，否則該站只能走全域模式、內容工具選不到 | 只由步驟寫 |
| 站台身分各事實的唯一位置 | 網址、主機類型、容器＝`environments`；組織歸屬＝`wp_sites`；站台公鑰（付款、登入、產品用）＝`seller_sites` 形狀（`MIG/0133_seller_sites.sql:18-29`）；主機 `sites.d`＝快取，由 `site-preflight` 比對 | — |
| 更新波次、備註、手動項目勾選 | `sites.metadata.{waves, notes, manual_checks[{key, by, at, note}]}` | owner/admin，PATCH＋`ops_audit_events`（前例 `api/ops/clients/[slug]/brand-colors/route.ts:69-86`） |
| 主機端登記 | `/etc/awarewave/sites.d/<slug>.json`（容器、volume、埠、網域）＝備份與閘門的來源；DB `environments`＝頁面來源；同一步驟寫兩邊，`site-preflight` 每次比對，不一致即顯示 | 只由閘門寫 |
| 既有客戶（soulful、AW、舊 staging 組織） | 無 `environments` 列；流程頁顯示「此客戶不是經建站流程建立」，客戶頁不再顯示假打勾；`wp-update` 照舊讀 `client_config.ssh_*`（`api/ops/clients/[slug]/wp-update/route.ts:208-227`），下一輪「外部主機接管」再遷 | — |

- migration（卡 SF-B）：`environments` 加部分唯一索引 `(site_id, environment_type)`，條件 status 不等於 archived；`ops_action_catalog` 新增 `site.*` 各列 `enabled=false`，**`on conflict do nothing`**（既有種子 `MIG/0021_seed_build_console_actions.sql:42` 用 `enabled = excluded.enabled`，重跑會蓋掉操作者開關）；附 down。寫入權沿用 0136 只限 service role（`MIG/0136_control_plane_tables_writes_only.sql:50-53`）。

### §1-5 假狀態清除

| 位置 | 現況 | 處置 |
|---|---|---|
| `NA/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx:642-658` | 「佈建步驟」五項寫死 ✓ | 改讀流程狀態（I1）；無 `environments` 列顯示「不是經建站流程建立」；連結改 `/ops/sites/[siteId]` |
| `NA/app/(shell)/build/BuildConsole.tsx:945-962`＋`NA/lib/build-console/contracts.ts:391-400` | 計畫的 Stages／Smoke 清單以實況樣式顯示（MainWP、監控、smoke、handoff 標 automated；`local_direct` 都沒做） | 從 UI 移除兩區塊（contracts 留給 API，頁退場時一起刪） |
| `BuildConsole.tsx:426-437` 機層面板 | `/api/provision` 預設永遠 idle（`api/provision/route.ts:85-96`） | 移除面板 |
| provider 選單 `OnboardWizard.tsx:261-263`、`BuildConsole.tsx:646-654,676-684`；`api/onboarding/trigger-build/route.ts:316` 寫死 `hostinger` | 值沒被使用（`build/runs/route.ts:324-331`），實際建在 ks-aw-01 | 移除選單；`hosting_provider` 由步驟寫實值 |
| `onboard/page.tsx:16-19`、`OnboardWizard.tsx:940-941` | 「4 步驟」實為 5；叫人手動到 Supabase 建紀錄 | 改橫幅＋刪 Step 5 |
| `NA/app/(shell)/page.tsx:57-59` | 把兩條流程寫成「第 1/2/3 步」一條鏈；「enqueue 送 Trigger.dev」非預設 | 改為一張「客戶建站」卡片指向 `/ops/sites/new` |
| `NA/app/(shell)/ops/repairs/page.tsx:152,232` | 「部署僅能透過 sg-deploy.sh / Build Console 手動」——Build Console 不部署，且每晚自動部署（AGENTS §0） | 改寫實況：「每天 03:00 自動部署 main；手動提前＝sg-deploy.sh」 |
| `NA/app/(shell)/ops/clients/[slug]/page.tsx:73` | 健康＝`site_url` 回 200（oracle 會拿到引擎的 200） | 有 `environments` 列者驗「回應的是這個 WP」；其餘保持並標「僅連通」 |
| `provision-staging/route.ts:437,538` | 回傳隨機 `environmentId`，從未存入 | 改為寫 staging `environments` 列並回傳真 id |
| `api/onboarding/trigger-build/route.ts:1-6` 註解 | 叫人呼叫 `provisionClient()` | 改指向本計畫「之後」清單 |

### §1-8 測試與上線

- 與每日 03:00 自動部署並存：**不用 `DEPLOY_HOLD`**（會擋住所有 next-admin 部署數天，且擋不住主機腳本——`sync-host-scripts.sh:3-6` 在判斷 hold 之前就同步）。改用 I6 雙鑰：程式可隨時合併上線，按鈕顯示「此步驟尚未開放」（讀 catalog），主機動詞未開關檔時 126。
- migration：推上 main 前先套用（`check-migrations-applied.sh:5-7`：repo 有未套用檔時整個部署被拒）；套用屬 High，SF-B 合併當天由操作者同意。
- 依記憶規則「一批一次部署」：SF-B～SF-K 合併完一次部署＋一次 smoke。
- 驗收三層：①單元／契約測試（每卡列明）②**staging 子目錄站實跑**：與主機容器無關的步驟（MainWP、wp-bridge、外掛、正式開放）透過 `hosting_provider` ＝ `ks-aw-01-staging-subdir` 轉接 `staging-wp`，先在既有 staging 站驗 ③**拋棄式網域 `sf-e2e.aware-wave.com` 全流程**（SF-L，主 session；DNS 一筆手動建，驗完 `deprovision-site.sh` 拆光並確認四層歸零）。
- **oracle 由操作者親手按**：建容器、裝 WP、MainWP、wp-bridge、手動項目（掛網址與正式開放照 `ORACLE-WP-SPEC.md` GO-2、GO-3 由工程師做，她同意）（每個 High 步驟都是她按確認）；AI 只旁看 `ops_action_runs` 與主機狀態。

---

## §2 操作者會看到的流程（一頁一頁）

以下是一般新站（網域目前沒有站）的流程。oracle 的網址目前由算命引擎在服務，所以第 5 步由工程師在產品閘道設定（`ORACLE-WP-SPEC.md` GO-2），其餘步驟相同；現有算命站全程不中斷。

1. **客戶列表 → 按「新增客戶網站」**
   - 您填：客戶名稱（例「AwareWave 算命站」）、網址（`oracle.aware-wave.com`）、語言（繁中）、外掛組合（打勾）、費用方式（自用 0 元）。
   - 系統做：建立客戶、站、正式環境三筆紀錄。
   - 您看到：跳到這個站的「建站流程」頁。
2. **建站流程頁（一欄，由上到下 9 步）**
   - 每步一個狀態：未開始／可以做／被擋住（寫原因）／執行中／完成／失敗（寫原因，可重試）。
   - 會動主機的步驟都是兩下：先按「看要做什麼」，系統列出會建什麼、放哪裡、出錯怎麼還原；您看完按「確認執行」。
3. **第 1 步 網址檢查**（隨時可按「重新檢查」）
   - 您看到三行：網址有沒有指到我們的主機；安全憑證有沒有涵蓋這個網址；這個網址現在有沒有別的站在用。
   - oracle 會顯示「與算命引擎共用網址」，第 5 步因此顯示「由工程師設定」。
4. **第 2 步 建立網站主機** → 確認 → 約 1–3 分鐘 → 「主機已啟動、內部檢查通過、已列入每日備份」。
5. **第 3 步 安裝 WordPress 與外掛** → 確認 → 「WordPress 已安裝；外掛 N 個已裝」；管理員密碼**只顯示這一次**（系統不保存，忘了按「重設管理員密碼」）。
6. **第 4 步 每日備份**：顯示「已列入」與「最近一次備份時間」（第一次在當晚）。
7. **第 5 步 掛上網址** → 確認 → 「網址已連到這個站，目前是『建置中』，訪客看到維護頁」。按「打開 WordPress 後台」去建頁面、設定算命外掛。
8. **第 6 步 接上 MainWP**、**第 7 步 接上 AI 控制通道**：各按一次確認；完成後顯示對方系統裡的編號。
9. **第 8 步 手動項目**：加入監控（Uptime Kuma）、WPvivid 遠端備份、寄信設定——您在對應系統做完，回來打勾並寫一句備註（頁面標明「您手動確認」）。
10. **第 9 步 正式開放** → 確認 → 「建置中已關閉，搜尋引擎可收錄」。
11. **客戶頁「佈建」分頁**：顯示同一份 9 步狀態摘要；按「打開建站流程」回到第 2 頁。

---

## §3 卡片

等級依 AGENTS §3。「需同意」＝該步上線或在 prod 執行前操作者明示 go。★＝走完 oracle 的最短路徑。

| 代號 | 目的 | 檔案 | 驗收 | 依賴 | 等級 | 需同意 | 派工 |
|---|---|---|---|---|---|---|---|
| ★SF-B | 資料模型與紀錄 | 新 `MIG/NNNN_site_flow.sql`＋`.down.sql`（§1-4）；新 `NA/lib/site-flow/records.ts`（建組織／工作區／專案／站／環境，冪等、合併 metadata）；`NA/app/api/ops/organizations/route.ts` 改走 records（修整包覆蓋 `:42-53`）；`api/onboarding/trigger-build/route.ts:149-295` 改呼叫 records；`provision-staging/route.ts:437` 寫 staging 環境列 | vitest：同 slug 重送不覆蓋既有 metadata 其他鍵（舊資料測試）；環境列重送不重複；down 後再 up 綠；`npx tsc --noEmit` 綠；`db-expert` 審 migration | — | Medium（migration 套用 High） | **是**（套用 migration） | `fullstack-engineer`＋`db-expert` 審 |
| ★SF-C | safe-infra-patch 新建型 | `INFRA/scripts/safe-infra-patch.sh`（加 `compose-new`、`host-nginx-new`；檔案必須**不存在**才收；rollback＝down／刪檔／刪連結；既有四型行為不變）；新 `INFRA/scripts/tests/safe-infra-patch-create.test.sh`（PATH 墊片假 docker／nginx／systemctl，產物在 `$TEMP`） | 新建成功；health 失敗 → 檔案與連結消失、容器 down、volume 保留；既有 `compose`／`host-nginx` 型回歸（同測試檔）不變；`bash -n` 綠 | — | High（全 infra 共用） | **是** | `fullstack-engineer`（Opus）＋`critic` Deep |
| ★SF-D | 站台範本＋主機登記＋拆除 | 新 `INFRA/scripts/templates/client-wp/{docker-compose.yml.tmpl, vhost.conf.tmpl}`（官方映像固定版本、DB 不開埠、具名 volume、只綁 127.0.0.1、記憶體上限、healthcheck、wp-config 代理 https 區塊；選項 `same_host_products` 預設關＝不加入 lobster-net，`ingress=product-gateway` 時開；`DISABLE_WP_CRON`）；主機 cron 產生器（每站每分鐘 `wp cron event run --due-now`，由登記檔產生、拆站移除）；登記檔 JSON 結構；新 `INFRA/scripts/deprovision-site.sh`（預設 dry-run，`--apply --confirm <slug>`；拆容器、vhost、登記檔，volume 需 `--purge-volumes`；環境列標 archived） | 範本以樣本參數渲染後 `docker compose config` 綠、`nginx -t`（nginx 映像內）綠；拆除 dry-run 列出五層（含 cron）；假登記檔產生的 cron 行正確、移除登記檔後該行消失 | SF-C（語意） | High | **是** | `fullstack-engineer` |
| ★SF-E | 閘門新動詞 | `INFRA/scripts/aw-hosting-gate.sh`（`site-preflight`、`site-create`、`site-wp`、`site-vhost`、`site-job`；開關檔；`--list`／`--check` 同步）；`NA/lib/hosting/__tests__/hosting-gate-contract.test.ts` 擴充 | `--check` 每動詞 ALLOW、畸形 DENY（tab、雙空白、超長網域、`..`、大寫）；開關檔缺 → 126；`site-wp` 只收固定子動詞與白名單參數，未知子動詞與任何 stdin 腳本 DENY；容器名只取自登記檔；job 狀態可讀 | SF-C、SF-D | High | **是**（開主機開關檔） | `fullstack-engineer`（Opus）＋`critic` Deep |
| ★SF-F | 備份讀登記（吸收 WP-front-door G2） | `infra/ks-aw-01-backup/backup-ks-aw-01.sh`（`:92-121` 之外加 `sites.d` 迴圈）；`INFRA/scripts/backup-coverage-check.py` 讀 `sites.d`；`infra/ks-aw-01-backup/verify-backup-ks-aw-01.sh` | 假登記檔 dry-run 列出新站兩項；soulful 輸出與改前逐行相同；coverage check 對已登記站不報漏 | SF-D | High | **是** | `fullstack-engineer` |
| ★SF-G | 步驟引擎＋API | 新 `NA/lib/site-flow/{types.ts, engine.ts, gate-client.ts}`（I2 契約、計畫雜湊、catalog 開關、`checkProductionChangeAllowed`、`ops_action_runs` begin/finish、host job 輪詢與收尾 CAS）；新 `NA/app/api/ops/site-flow/[siteId]/route.ts`（GET 全部步驟狀態）、`[siteId]/[step]/route.ts`（POST plan／execute、GET run）；轉接層 `ks-aw-01-docker`→`site-wp`、`ks-aw-01-staging-subdir`→`staging-wp` | vitest：雜湊不符 409；catalog 關 → 拒且留 run；**沒有 catalog 列 → 拒，不自動補列**；**`ops_action_runs` 寫入失敗 → 不呼叫閘門**（I6）；系統模式擋 → 留 run（同 `engine.ts:102-138`）；verify 失敗呼叫 rollback；非 owner/admin 403；狀態全由觀測函式算出（斷言無存布林） | SF-B | Medium | 否 | `fullstack-engineer` |
| ★SF-H | 主機步驟實作 | `NA/lib/site-flow/steps/{preflight, container, wp-install, vhost, open, manual-checks}.ts`（`ingress=product-gateway` 時 vhost 步驟為手動勾選）；管理員密碼只在該次回應回傳一次、不寫 Vault、不寫 run output；`NA/lib/wp-plugin-stack-catalog.ts` 加 `installSource:"release-url"` 自有外掛列＋白名單，修佈景 `kadence` 被當外掛（`:72`） | vitest（假 gate）；staging 子目錄站實跑 `wp-install` 外掛部分與 `open`；密碼不出現在任何 run output（斷言） | SF-E、SF-G | High | **是**（catalog 開關） | `fullstack-engineer` |
| SF-I0 | MainWP 金鑰進 next-admin | 主機 `/root/lobster-phase1/docker-compose.yml` 加 `MAINWP_*` 三變數（`safe-infra-patch.sh compose`）＋repo 對照檔同步 | `docker exec next-admin printenv MAINWP_DASHBOARD_URL` 有值（AGENTS §0 唯一驗證法） | — | High | **是** | 主 session |
| ★SF-I | 整合步驟 | `NA/lib/site-flow/steps/{mainwp, bridge}.ts`；bridge 步驟完成時寫 `wp_sites` 一列（組織歸屬，§1-4）；`NA/lib/payments/woo.ts:84-158` 加讀已登記站（env 路徑行為不變） | staging 子目錄站實跑：MainWP 出現且 connected（順帶關閉 `agency-os/TASKS.md` MainWP E2E 條目）；bridge 簽章 `/health` 200；`bridgeSiteOrg` 對新站回該組織（不是全域模式）；woo.ts 既有 env 測試全綠＋新增「DB 站」測試；私鑰不進任何 log | SF-G、SF-I0 | High（憑證） | **是** | `fullstack-engineer`＋`critic` ≥2（憑證） |
| ★SF-J | 頁面 | 新 `NA/app/(shell)/ops/sites/new/page.tsx`、`ops/sites/[siteId]/page.tsx`（§2；單欄、不用下拉、全域 class＋主題 token、零 hex）；`ClientHubTabs.tsx` ProvisioningTab 換成狀態摘要；`ops/clients/ClientPanelNav.tsx:38` 連結 | Playwright：建立 → 流程頁 9 步渲染；catalog 關時按鈕「尚未開放」；預覽 → 確認 → 執行中 → 完成（假 gate）；密碼只顯示一次（重整後不見） | SF-G（API 合約） | Medium | 否 | `frontend-designer` |
| ★SF-K | 假狀態清除 | §1-5 全表（`/onboard`、`/build` 兩頁的列由 SF-P 連頁一起刪） | 每列改後截圖；`grep` 確認 §1-5 列出的字串已不存在 | SF-J | Low–Medium | 否 | `fullstack-engineer` |
| ★SF-P | 舊頁退場 | §1 第 2 列：部門選型、外部服務搬進客戶頁分頁（沿用原元件）；刪 `/onboard`、`/build` 頁並 308 到 `/ops/sites/new`；清四處入口 | 客戶頁兩個新分頁可存可讀既有客戶的設定（舊資料測試）；`grep -rn 'href="/build"\|href="/onboard"'` 於 `NA/app` 0 筆；兩個舊網址 308 | SF-J | Medium | 否 | `fullstack-engineer` |
| SF-A | 文件更正 | §1-7 所列；`CLAUDE.md` 列、`.claude/agents/client-onboarding.md:19,59`、`NA/app/api/ops/clients/route.ts:19` 註解對齊 `hosting_provider` 列舉（吸收 G3、G4） | `node scripts/verify-governance-pointers.mjs` 綠；`/doc-sync` | — | Low（`CLAUDE.md` 屬治理） | 否 | `fullstack-engineer` |
| ★SF-L | 拋棄式網域全流程 E2E | `sf-e2e.aware-wave.com`：DNS 一筆手動建 → 9 步全跑 → 當晚備份含此站 → `deprovision-site.sh --apply` → 五層（容器、volume、vhost、cron、登記檔／環境列）歸零 | 每步 `ops_action_runs` ok；`curl -sI https://sf-e2e.aware-wave.com/` 200；拆後無容器、vhost 不在 | SF-F、SF-H、SF-I、SF-J | High | **是**（開主機開關、開 catalog、建 DNS） | 主 session |
| — | oracle 上線 | 不在本檔：`ORACLE-WP-SPEC.md` GO-1–GO-3（引擎不改名；`ingress=product-gateway`；現站不中斷）。原 SF-M、SF-N 作廢 | — | SF-L | — | — | 主 session |
| SF-O | 手冊＋可跑示範 | 新 `lobster-factory/docs/hosting/CLIENT_SITE_FLOW.md`（架構、步驟、拆除、雙鑰開關）；`agency-os/docs/operations/RUNNABLE_DEMOS.md` 登記 | 新 session 只讀手冊可完成 SF-L | SF-L | Low | 否 | `fullstack-engineer` |

### 執行順序

- 第 1 批（可同時）：SF-B、SF-C、SF-D、SF-A。
- 第 2 批：SF-E（等 C、D）、SF-F（等 D）、SF-G（等 B）、SF-I0。
- 第 3 批：SF-H（等 E、G）、SF-I（等 G、I0）、SF-J（等 G 合約）。
- 第 4 批：SF-K、SF-P；一次部署＋smoke；SF-L。
- 第 5 批：SF-O；oracle 的 GO-2 從這裡接。
- 關鍵路徑：SF-B → SF-G → SF-H（另一支 SF-C → SF-D → SF-E → SF-H）→ SF-L。
- 扇出：每批 ≤5 個 Agent（AGENTS §5）；critic 每 commit 1 個，SF-C、SF-E 用 Deep，SF-I ≥2（憑證）。
- 建議模型：SF-C／SF-E／SF-I＝Opus 5.5；SF-B／SF-D／SF-F／SF-G／SF-H／SF-K＝`fullstack-engineer`（卡已寫死）；SF-J＝`frontend-designer`；SF-L＝主 session（Opus 5.5）。

### 風險

| 風險 | 可能 | 影響 | 處置 |
|---|---|---|---|
| 閘門新動詞擴大 next-admin 金鑰權限（外洩＝可建站、改 vhost、對正式站執行固定的 wp 動作） | M | H | 動詞只收 slug／domain；`site-wp` 只有固定子動詞、不收腳本（讀不到會員資料表）；vhost 拒改他檔佔用網域；開關檔預設關；拆除不開 SSH 動詞（I5） |
| safe-infra-patch 改動弄壞既有四型（全 infra 共用） | M | H | 新型為獨立分支；既有型回歸測試；critic Deep |
| 主機腳本不受 DEPLOY_HOLD 管（`sync-host-scripts.sh:3-6`） | H（必然） | M | I6 開關檔；合併即上主機，SF-C／E 合併前必須過審 |
| migration 未套用就推 main → 全部部署被拒（`check-migrations-applied.sh:5-7`） | M | H | SF-B 先套用再推，同日 |
| 背景 job 主機重開後狀態遺失 | L | M | 狀態檔在 `/var/lib/awarewave/site-jobs/`；讀不到 → 標 failed，重跑靠冪等 |
| 容器 → 公開網址 hairpin 逾時（`trigger-build/route.ts:461-464`） | M | M | 監控用 Uptime Kuma（public）；站→引擎預設公開網址，實測逾時再開 `same_host_products` |
| 憑證不涵蓋網域 → 掛網址永遠 blocked | M | M | 網址檢查明示；新網域簽證屬「之後」，期間主 session 手動 certbot dns-01 一次（前例 soulful conf `:44-49`） |
| `CLOUDFLARE_API_TOKEN` 權限不含目標 zone | M | L | DNS 只讀；讀不到顯示「無法檢查，請手動確認」，不擋後續 |
| 管理員密碼顯示一次被外流 | L | M | 只在該次回應、不存 Vault 與 run output；可「重設」 |
| `wp_sites.token` 明文存 WP 應用密碼（`MIG/0039_wp_sites.sql:3,9`） | 既有 | M | 本計畫不新增寫入；既有債另案 |

### Rollback

- 程式：每卡單獨 commit，`git revert`；catalog 關＋移除主機開關檔＝所有按鈕立即失效。
- migration：`.down.sql`（刪 `site.*` catalog 列、刪索引）。
- 主機：safe-infra-patch 失敗自動還原；成功後撤銷＝`deprovision-site.sh`，volume 預設保留，`--purge-volumes` 另確認。
- oracle：見 `ORACLE-WP-SPEC.md` GO-2、GO-3 的回滾欄，WP 容器保留。

---

## §4 需要操作者決定（4 題）

1. **新站直接建在正式主機，掛上網址時先顯示「建置中」，設定完才正式開放**（只用於網域目前沒有站的情況；oracle 不走這條，現有算命站不中斷）。建議：同意。
2. **舊的 `/onboard`、`/build` 兩頁這一輪就刪**，部門選型和外部服務搬到客戶頁。建議：同意。
3. **MainWP 的連線金鑰放進主系統設定**（一次性主機設定，高風險）。建議：同意；不放的話第 6 步只能手動在 MainWP 加站。替代：金鑰留在 Trigger 工人端（現在就在那裡，`integration-steps.ts:60-65`），第 6 步改成派一個 Trigger 工作，主系統不多持有一把金鑰。
4. **新網域安全憑證這一輪不做成按鈕**：測試用網域不被現有憑證涵蓋時 AI 手動簽一次（用它自己的憑證名稱，不擴充 15 個產品共用的那張）；oracle 的網域不變，不需要新憑證。建議：同意；下一輪做成按鈕（真正客戶的網域會需要）。

---

## §5 抽驗紀錄與盤點檔不符之處

### 與盤點檔（`SYSTEM-OPERABILITY-AUDIT.md`）不符或盤點漏列
- 盤點步驟 1：`/api/ops/organizations` 不只覆蓋 `client_config`，是**整包覆蓋 `metadata`**（`route.ts:46` 以 `body.metadata ?? {}` 寫入＋`:51-53` 依 slug upsert）→ 抹掉 `wp_update_latest`、品牌、客服設定等。
- 盤點「總計畫 `:84-87` 的 2026-07-04 證據在 WORKLOG 找不到」：run id `d21ab292` 確實不在 WORKLOG，但其產出站 `e2e-verify-0704-6e2b91` 存在有據（`agency-os/WORKLOG.md:4280`）→ 部分有據。
- 盤點漏列的假狀態：`app/(shell)/ops/repairs/page.tsx:152,232`、`app/(shell)/page.tsx:57-59`、`OnboardWizard.tsx:940-941`、`api/onboarding/trigger-build/route.ts:316`（provider 寫死 hostinger）。
- 盤點漏列：`environments` 表（`MIG/0001_core.sql:134-151`）全 repo 零寫入者；`provision-staging/route.ts:437` 回傳的 `environmentId` 是隨機值、從未存入。
- 盤點漏列：`safe-infra-patch.sh:28` 要求檔案已存在 → 新站 vhost／compose 沒有合法建立路徑（WP-front-door S4、S5 也假設可用）。
- 盤點漏列：`MAINWP_*` 不在 next-admin compose（`INFRA/docker-compose.yml` 無此字串），只有 Trigger 端 `mainWpConfigFromEnv`（`integration-steps.ts:60-65`）讀 → 頁面目前無法直接註冊 MainWP。
- 盤點漏列：主機腳本同步不受 `DEPLOY_HOLD` 管（`sync-host-scripts.sh:3-6`）。
- 盤點漏列：`dns.ts:96-104` 對既有紀錄直接 PUT，會靜默改掉既有 A 紀錄。
- 位置更正：`rollout-wp-bridge.ps1:45-48` 是外掛對照表，`ValidateSet` 在 `:33`；ClientHubTabs 假打勾實際範圍 `:642-658`（連結到 `:668`）。
- 範本預設不加入 `lobster-net`（I7，客戶站一律公開網址）；`ingress=product-gateway` 的站才開 `same_host_products`。

### 抽驗過且與盤點一致
- `provision-staging/route.ts:33-34,433-434`；`api/ops/tenants/[id]/config/route.ts:12`；`onboard/page.tsx:16`；`build/runs/route.ts:324-331`；`api/provision/route.ts:85-96,115-120,162`；`ops/clients/[slug]/page.tsx:73`；`INFRA/docker-compose.yml:468-474`；`sg-stack.aware-wave.com.conf:15-27`；`APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md:84-92,143-150`；`EMBED_PROVISION_INTO_APP.md:1-4`；`NEW_TENANT_ONBOARDING_SOP.md:42,105`。

### 本計畫依據的其他 `路徑:行號`
- 閘門與修補：`aw-hosting-gate.sh:10-17,26-31,42-49,66-69,115-179`；`safe-infra-patch.sh:96-133,217-241`；`deprovision-staging.sh:17,21-27`；`sync-host-scripts.sh:2-21`；`check-migrations-applied.sh:1-14`。
- 修復引擎：`NA/lib/repair-center/remediations/engine.ts:5-21,85-217`；`types.ts:3-36`。
- 資料：`MIG/0001_core.sql:3-5,117-151`；`MIG/0011_ops_console_control_plane.sql:1-20`；`MIG/0021_seed_build_console_actions.sql:42`；`MIG/0050_*.sql:8,44-49`；`MIG/0110_plans_entitlements.sql:36-37`；`MIG/0136_control_plane_tables_writes_only.sql:50-53`；`NA/lib/secret-vault.ts:20,30,53`；`NA/lib/hosting/staging-admin-credential.ts:3-9`。
- 整合：`WF/integrations/integration-steps.ts:60-65,87,371-436`；`NA/lib/payments/woo.ts:17-23,84-158`；`packages/wp-bridge-plugin/includes/Admin/AdminPage.php:148-166`；`WF/hosting/providers/cloudflare/dns.ts:72-110`。
- 備份：`infra/ks-aw-01-backup/backup-ks-aw-01.sh:47,54-59,92-121`；`INFRA/scripts/backup-inventory.json:2`；`infra/soulful/docker-compose.yml:6-15`；`infra/soulful/nginx/soulfulexpression.org.conf:9-49`。
- 頁面：`api/onboarding/trigger-build/route.ts:1-6,149-295,316,389-390,446-465`；`OnboardWizard.tsx:261-263,850-962,979-1031`；`BuildConsole.tsx:426-437,646-684,945-962`；`NA/lib/build-console/contracts.ts:385-400`；`ClientHubTabs.tsx:610-668,852-858`；`NA/app/api/ops/clients/route.ts:18-41`；`api/ops/clients/[slug]/wp-update/route.ts:208-227`；`api/ops/clients/[slug]/brand-colors/route.ts:49-86`。

### 未讀（未抽驗）
- `OnboardWizard.tsx` Step 2–4 內文、`BuildConsole.tsx` 其餘部分、`WF/trigger/create-wp-site.ts` 除 `:320-399` 以外、`update-client-wp-plugins.ps1:111-122`（沿用盤點引用）、`aw-autorepair-gate.sh`；主機現況未連線：`aware-wave.com` 憑證 SAN、Cloudflare SSL 模式、`CLOUDFLARE_API_TOKEN` 權限皆未知。
