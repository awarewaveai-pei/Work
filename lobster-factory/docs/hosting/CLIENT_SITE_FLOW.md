# 客戶建站流程手冊（後台九步開一個 WordPress 站）

現況正本＝程式＋本檔。設計理由不重述，見 [SITE-FLOW-COMPLETION-PLAN](../../../agency-os/handoffs/2026-11-20-oracle-skills-supervisor/briefs/SITE-FLOW-COMPLETION-PLAN.md)。
實跑過兩次：`sf-e2e.aware-wave.com`（拋棄式，2026-11-24）、`oracle.aware-wave.com`（共用網域，2026-11-24）；紀錄在 `agency-os/WORKLOG.md`。

路徑縮寫：`NA/`＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`、`HS/`＝`lobster-factory/infra/hetzner-phase1-core/scripts/`。
主機：`ssh -p 58122 ubuntu@145.239.195.47`；下文「主機上」的指令都在這個連線裡執行。主機上 `HS/` 對應 `/root/lobster-phase1/scripts/`。
風險：開開關、建站、掛網址、開放、拆除、刪 DB 列都是 High（`agency-os/AGENTS.md` §3），執行前要操作者同意。

## 1. 架構

```
後台頁面 /ops/sites/new、/ops/sites/<siteId>
  → API NA/app/api/ops/site-flow/**（寫入只准 owner／admin）
  → 步驟引擎 NA/lib/site-flow/engine.ts（步驟本體 NA/lib/site-flow/steps/）
  → SSH 固定動作 NA/lib/site-flow/gate-client.ts → 主機 HS/aw-hosting-gate.sh（site-*）
  → 主機改檔一律經 HS/safe-infra-patch.sh（compose-new、host-nginx-new）
```

| 事實 | 位置 |
|---|---|
| 客戶、站、環境 | `organizations`、`sites`、`environments`（`metadata.host_slug`、`metadata.ingress`）；新客戶的組織 id＝`<siteId>` |
| 每步執行紀錄 | `ops_action_runs`（完整 `stages` 在 `output_payload`） |
| 每步開關 | `ops_action_catalog` 的 `site.*` 七列 |
| 主機登記檔 | `/etc/awarewave/sites.d/<slug>.json`（備份、閘門、拆除都讀它） |
| 站的檔案 | `/root/sites/<slug>/`（`docker-compose.yml`、`.env`） |
| 容器／資料卷 | `<slug>-wp`、`<slug>-db`／`<slug>_wordpress_data`、`<slug>_db_data`；只綁 127.0.0.1:8100–8199 |
| vhost | `/etc/nginx/sites-available/<domain>.conf`（範本 `HS/templates/client-wp/`） |

- 步驟狀態由即時觀測得出，不存「已完成」。例外：正式開放看最後一次執行結果；安裝步驟看容器現況加最後一次安裝紀錄。
- 引擎規則：同一環境一次只跑一步；確認的計畫與重算不符回 409（重看再確認）；系統模式擋住回 423（失敗後的自動還原也會被擋，需人工收）。
- 主機腳本不是合併就上主機：`HS/sync-host-scripts.sh` 由 19:00、20:00 UTC 的排程與 `sg-deploy.sh` 呼叫；急用在主機上先 `sudo git -C /root/Work fetch origin main`，再 `sudo /root/lobster-phase1/scripts/sync-host-scripts.sh`。上了主機的 `site-*` 動詞由下面的開關擋著。

## 2. 雙鑰開關（兩把都開才會動主機；用完關掉）

### 2-1 主機開關檔 `/etc/default/aw-hosting-gate.local`

| 行 | 作用 |
|---|---|
| `AW_SITE_VERBS=on` | 缺檔、非 root 擁有、群組或他人可寫、值不是 `on` → 所有 `site-*` 回 126 |
| `AW_SITE_GATEWAY_SLUGS=<slug> <slug>` | 只有列出的 slug 能用共用網域（§6）；這一行混進其他字元（例如註解）整行作廢 |
| `AW_SITE_MAX=<n>` | 站數上限，沒寫＝10 |

開關關著時流程頁讀不到主機，主機相關步驟顯示「無法確認現況」；這不代表站壞了。

主機上，先看有沒有別人剛改過（`CLAUDE.md`「VPS drop-in 並行」：mtime 超過 5 分鐘才動；沒有這個檔＝目前是關的）：

```bash
sudo stat -c "mtime=%y" /etc/default/aw-hosting-gate.local; sudo cat /etc/default/aw-hosting-gate.local
```

開（檔案不存在時用這行；已存在就用編輯器加行，不要覆蓋掉 `AW_SITE_GATEWAY_SLUGS`）：

```bash
printf 'AW_SITE_VERBS=on\n' | sudo tee /etc/default/aw-hosting-gate.local >/dev/null; sudo chmod 600 /etc/default/aw-hosting-gate.local
```

關：

```bash
sudo rm /etc/default/aw-hosting-gate.local
```

改完 5 分鐘後再看一次（上面的 `stat` 指令），確認沒有被另一個 session 蓋掉。

### 2-2 資料庫 `ops_action_catalog`（沒有後台介面，用 SQL）

七列：`site.preflight`、`site.create`、`site.wp_install`、`site.vhost`、`site.mainwp`、`site.bridge`、`site.open`（`0176_site_flow.sql` 建立，預設全關）。沒有列＝拒絕執行。

主機上，開（關＝把 `true` 改 `false`），預期回 7 列：

```bash
echo "update public.ops_action_catalog set enabled=true where action_key in ('site.preflight','site.create','site.wp_install','site.vhost','site.mainwp','site.bridge','site.open') returning action_key, enabled;" | sudo docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1
```

## 3. 開站：以拋棄式網域走完全流程

例：`<domain>`＝`sf-e2e.aware-wave.com`，`<slug>`＝`sf-e2e-aware-wave-com`（建立表單會顯示 slug）。

### 3-1 前置

1. DNS：Cloudflare 加 A 記錄 `<domain>` → `145.239.195.47`（proxied）。
2. 憑證：主機上要有一張涵蓋 `<domain>` 的有效憑證，否則第 5 步被擋。沒有就在主機簽一張獨立名稱的（照畫面指示在 Cloudflare 加 TXT `_acme-challenge.<domain>`）：

```bash
sudo certbot certonly --manual --preferred-challenges dns --cert-name <domain> -d <domain>
```

3. 後台容器有設定（只印 `set`／`MISSING`，不印值；八項都要 `set`。`HOSTING_BRIDGE_SSH_*` 缺任一項，閘門呼叫全部失敗，頁面看起來像開關沒開）：

```bash
sudo docker exec lobster-next-admin sh -c 'for v in HOSTING_BRIDGE_SSH_HOST HOSTING_BRIDGE_SSH_PORT HOSTING_BRIDGE_SSH_USER HOSTING_BRIDGE_SSH_KEY_B64 HOSTING_BRIDGE_SSH_HOST_KEY_SHA256 MAINWP_DASHBOARD_URL MAINWP_CONSUMER_KEY MAINWP_CONSUMER_SECRET; do eval "x=\$$v"; [ -n "$x" ] && echo "$v set" || echo "$v MISSING"; done'
```

4. 自有外掛的安裝檔已在主機（§5）。
5. 開雙鑰（§2）。

### 3-2 建立紀錄

https://app.aware-wave.com/ops/sites/new（owner／admin 登入）：新客戶或既有客戶、網址（只填網域）、語言、外掛組合 → 「建立」→「前往建站流程」。網址列的 `<siteId>` 記下來。

- 拋棄式測試用「新客戶」（拆除時才能整個組織刪掉，§4）。
- 外掛組合只選「基本包」最穩：電商包會停在 `fluent-reviews`（WordPress.org 查無此代號）；旅遊包的安裝不在本流程，第 3 步直接拒絕。

### 3-3 九步

會動主機的步驟都按兩下：「看要做什麼」→ 讀計畫 →「確認執行」。失敗原因顯示在該步；要看全部看 `ops_action_runs.output_payload`。

| # | 步驟 | 做什麼 | 前置 | 成功判定 | 失敗怎麼重跑 |
|---|---|---|---|---|---|
| 1 | 網址檢查 | 唯讀：網址佔用、憑證涵蓋、容器現況（不查 DNS） | 雙鑰 | 完成；佔用／缺憑證只列在說明，擋第 5 步 | 修好後按「重新檢查」 |
| 2 | 建立網站主機 | 背景工作建兩個容器、`.env`（DB 密碼主機產生）、登記檔，列入每日備份 | 1 | 兩容器 healthy＋登記檔；約 1–3 分鐘 | 主機自動移除容器與 compose 檔，資料卷與 `.env` 保留，直接重跑沿用。工作紀錄 `/var/lib/awarewave/site-jobs/<job>.log`。30 分鐘逾時 |
| 3 | 安裝 WordPress 與外掛 | 填管理員 email；裝 WP、Kadence、外掛；進建置中模式。**密碼只顯示一次** | 2 | 計畫內外掛全部確認啟用 | 重跑接著已完成的部分。**頁面要開著**，進度靠頁面輪詢；45 分鐘後該次執行被收回。沒看到密碼按「重設管理員密碼」 |
| 4 | 每日備份 | 唯讀面板 | 2 | 顯示「已列入」（備份時間主機不回報） | 不用跑 |
| 5 | 掛上網址 | 寫 vhost 並啟用；訪客看到維護頁 | 3＋憑證＋網址沒被別的站佔用 | 登記檔記著 vhost 且 nginx 實際用它 | 主機自動還原；看 `/root/lobster-phase1/safe-patch.log`，修好重跑。共用網域站改手動勾選（§6） |
| 6 | 接上 MainWP | 設站上連線碼、MainWP 加站 | 5 | MainWP 列出且 connected | 重跑沿用已加入的站。顯示斷線＝到 MainWP 按 Reconnect（重跑修不了） |
| 7 | 接上 AI 控制通道 | 產金鑰（私鑰只進 Vault）、公鑰寫到站上、寫 `wp_sites` | 5 | 簽章請求成功且 `wp_sites` 屬於此客戶 | 重跑沿用同一把金鑰。`wp_sites` 歸屬衝突＝停下由工程師確認 |
| 8 | 手動項目 | Uptime Kuma 監控、WPvivid 遠端備份、FluentSMTP 寄信測試；做完回來勾選加備註 | 5（要能開站的後台） | 三項已勾（您手動確認） | 取消勾選可重勾 |
| 9 | 正式開放 | 關建置中、允許搜尋引擎收錄 | 5（系統不檢查 6–8，由人確認） | 後台打開首頁不是維護頁（共用網域站此確認無效，見 §6） | 確認不到會自動改回建置中；修好重跑。10 分鐘逾時 |

「重設管理員密碼」按鈕在第 3 步，同樣需要雙鑰開著。

### 3-4 驗收

```bash
curl -sI https://<domain>/
```

開放前 503，開放後 200；`https://<domain>/wp-json/` 全程 200。

備份（當晚 02:15 UTC 產生、02:45 UTC 驗證），主機上：

```bash
sudo grep -E "<slug>|verify-backup-ks-aw-01" /var/log/ks-aw-01-backup.log | tail -n 20
```

要看到 `<slug>-db.sql.gz`、`<slug>-wordpress.tgz` OK 與 `PASSED`。檔案在 `/root/backups/<時間戳>/`。

### 3-5 收尾

拋棄式站：拆除（§4）→ 關雙鑰（§2）。保留的站也要關雙鑰。

## 4. 拆除

`HS/deprovision-site.sh`，只能在主機上跑（沒有 HTTP／SSH 動詞）。預設只列出四層（vhost、容器、資料卷、登記檔），不改東西：

```bash
sudo /root/lobster-phase1/scripts/deprovision-site.sh --slug <slug>
```

保留資料卷拆除：

```bash
sudo /root/lobster-phase1/scripts/deprovision-site.sh --slug <slug> --apply --confirm <slug>
```

連資料一起刪（不可回復；拋棄式站用這個）：

```bash
sudo /root/lobster-phase1/scripts/deprovision-site.sh --slug <slug> --apply --confirm <slug> --purge-volumes --confirm-purge <slug>
```

- 中途失敗（exit 3）照原指令重跑。封存在 `/var/lib/awarewave/deprovisioned/<slug>-<時間戳>/`。
- 保留資料卷後想重建同一 slug 會被拒（`DEPROVISIONED` 標記）：先 purge，或手動刪標記沿用舊資料。
- 建站失敗、沒有登記檔的殘留，也用 purge 那一行清。

腳本不處理、要手動清的：

| 項目 | 做法 |
|---|---|
| MainWP 站 | MainWP 介面移除（先核對網址） |
| Uptime Kuma 監控、WPvivid 遠端檔案 | 各自介面刪除 |
| DNS 記錄 | Cloudflare 刪除 |
| 測試憑證 | 主機上 `sudo certbot delete --cert-name <domain>` |
| 資料庫紀錄 | 下面的 SQL（腳本不改 DB） |

只限 §3-2 用「新客戶」建的拋棄式站。主機上先確認名字：

```bash
echo "select id, name from public.organizations where id='<siteId>';" | sudo docker exec -i supabase-db psql -U supabase_admin -d postgres
```

刪組織會連帶刪掉該站的 `ops_action_runs` 與 `ops_audit_events`（含手動勾選紀錄）。要留證據先存檔：

```bash
echo "select * from public.ops_action_runs where organization_id='<siteId>'; select * from public.ops_audit_events where organization_id='<siteId>';" | sudo docker exec -i supabase-db psql -U supabase_admin -d postgres -x > ~/<slug>-runs.txt
```

名字對了才刪：

```bash
echo "begin; select public.secret_delete('client_cred:'||id) from public.client_credentials where client_id='<siteId>'; delete from public.wp_sites where organization_id='<siteId>'; delete from public.organizations where id='<siteId>'; commit;" | sudo docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1
```

既有客戶的站不可刪組織：由工程師只把該站的 `environments` 列設 `status='archived'`，並刪它的 `wp_sites` 列與金鑰（§7）。

## 5. 私有外掛安裝檔鏡像

自有外掛的 release repo 是私有的，主機沒有 GitHub token；閘門從 `/var/lib/awarewave/plugin-releases/<repo>/<tag>/<repo>-<tag>.zip` 安裝，沒有鏡像檔才嘗試直接下載。

- `scripts/release-wp-bridge.sh`（`--plugin bridge|store|oracle`）發佈成功後自動鏡像。
- 手動補（本機需 `gh` 已登入、可 SSH）：

```bash
bash scripts/mirror-plugin-release.sh aware-wave-wp-bridge v0.22.0
```

- 建站裝哪一版由 `NA/lib/wp-plugin-stack-catalog.ts` 的 `releaseVersion` 決定；鏡像的 tag 要對得上。
- 同版或較舊的自有外掛不會覆蓋站上已裝的版本。

## 6. 共用網域站（只給工程師）

網址已由別的服務在用（例：oracle 與算命引擎）時，用 `environments.metadata.ingress=product-gateway`。建立表單沒有這個選項。

1. 在第 2 步之前改（主機上）：

```bash
echo "update public.environments set metadata = metadata || '{\"ingress\":\"product-gateway\"}'::jsonb where site_id='<siteId>' and status<>'archived' returning metadata;" | sudo docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1
```

2. 主機開關檔加 `AW_SITE_GATEWAY_SLUGS=<slug>`。容器會加入 `lobster-net`，與所有產品同網。
3. 第 5 步不建 vhost：工程師用 `HS/safe-infra-patch.sh nginx` 改 `lobster-nginx` 的分路（`agency-os/AGENTS.md` §0），再勾「工程師已在產品閘道把這個網址接到這個站」。必須送到 `<slug>-wp` 的路徑（現成範本：`lobster-factory/infra/hetzner-phase1-core/nginx/default.conf` 的 `map $uri $oracle_backend` 與 `map $args $oracle_home_backend`）：
   - `/wp-json/`、`/wp-admin/`、`/wp-login.php`、`/wp-content/`、`/wp-includes/`
   - `/` 帶 WordPress 查詢參數（`rest_route=`、`p=`、`page_id=`、`preview=`、`post_type=`、`customize_changeset_uuid=`）。漏了 `rest_route=`，第 7 步必失敗。
4. 拆除腳本不碰閘道設定，要另外還原。
5. 第 9 步的自動確認只打 `https://<domain>/`；首頁分給別的服務時，WordPress 仍在建置中也會顯示完成。開放後人工確認一個分到 WordPress 的不存在路徑：

```bash
curl -s -o /dev/null -w "%{http_code}
" https://<domain>/no-such-page-check
```

回 404 才算開放；503＝還在建置中。

## 7. 注意事項

| 情況 | 要知道的事 | 怎麼處理 |
|---|---|---|
| `safe-infra-patch.sh` 還原中 | 還原中又收到第二次中斷訊號（Ctrl+C、SSH 斷線），還原會被打斷 | 不要連按；中斷過就看 `/root/lobster-phase1/safe-patch.log` 有沒有 `rollback-done`，沒有就人工核對檔案與容器 |
| 拆站的 nginx 重載 | 腳本不確認新設定真的生效，已拆的站可能多被服務一會兒 | 主機上 `sudo nginx -t && sudo systemctl reload nginx`（拆完後重跑拆除腳本不會再重載） |
| 外掛步驟失敗 | 只還原資料庫；已升級的外掛**檔案**留在新版 | 修掉原因後重跑第 3 步往前完成 |
| 安裝中關掉頁面 | 進度停住，45 分鐘後該次執行被收回 | 重新執行，接著已完成的部分做 |
| 有人在主機上手動改站 | 「安裝」「正式開放」看最後一次執行結果，頁面看不出手動改動 | 主機上的改動只走本流程 |
| 撤銷 wp-bridge 金鑰（含換金鑰） | 主機沒有撤銷動詞；後台憑證分頁也擋住這類紀錄。平常重跑第 7 步沿用同一把，不需撤銷 | ① 站的 WordPress 後台 → AwareWave Bridge 撤銷 ② 主機上刪 Vault 與紀錄（SQL 見表下）③ 重跑第 7 步產新金鑰 |
| oracle 外掛 `AWORACLE_DATA_KEY`（`wp-config.php`） | **不可更換**：沒有換金鑰工具，換掉後會員舊資料打不開；資料庫備份只有密文 | 另存一份在主機以外 |
| oracle 外掛訂閱表單的 Turnstile | 外掛只驗票是真的，不比對產生票的網域 | 建 Cloudflare Turnstile widget 時網域只填該站 |
| 每月還原演練 | `HS/backup-restore-drill.py` 不讀 `sites.d`，新站**不在**演練內 | 需要時手動還原驗證（表下） |
| 正式站的憑證 | §3-1 的 manual 憑證不會自動續期 | DNS 指到本機後改 nginx 驗證：`sudo certbot renew --cert-name <domain> --authenticator nginx --installer nginx --dry-run` 成功再去掉 `--dry-run`（在別的站驗過；本流程建的 vhost 上未驗） |
| 主機記憶體 | 可用記憶體低於 4 GiB 時拒絕建站 | 先看 `free -h` |

撤銷金鑰的 SQL（`<credentialId>`＝`environments.metadata.bridge.credential_id`）：

```bash
echo "begin; select public.secret_delete('client_cred:<credentialId>'); delete from public.client_credentials where id='<credentialId>'; commit;" | sudo docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1
```

手動還原一個站的資料庫（**覆蓋該站現有資料**）：

```bash
sudo zcat /root/backups/<時間戳>/<slug>-db.sql.gz | sudo docker exec -i <slug>-db sh -c 'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb -uroot wordpress'
```

## 8. 唯讀查詢

主機上，目前登記的站與開關：

```bash
sudo ls /etc/awarewave/sites.d/; sudo cat /etc/default/aw-hosting-gate.local
```

本機，閘門接受哪些指令（不連主機）：

```bash
bash lobster-factory/infra/hetzner-phase1-core/scripts/aw-hosting-gate.sh --list
```
