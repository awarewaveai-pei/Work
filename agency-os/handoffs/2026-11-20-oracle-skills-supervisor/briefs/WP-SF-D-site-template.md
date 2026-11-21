# SF-D 站台範本、主機登記、拆除

先讀：`COMMON-WP.md`、`SITE-FLOW-COMPLETION-PLAN.md` §0 I5、I7、§1-3（「建容器」「掛網址」兩列）、§1-4「主機端登記」、§3 的 SF-D 列。SF-C 已併入後才做（同一個工人）。`INFRA/`＝`lobster-factory/infra/hetzner-phase1-core/`。模型 Opus 5.5。

## 目的
新站容器與 vhost 的範本、主機上「有哪些站」的登記檔格式、以及把一個站完整拆掉的腳本。全部以參數渲染，沒有任何站名或網域寫死。

## 已知事實
- 同型前例：`lobster-factory/infra/soulful/docker-compose.yml:1-60`（容器名＝備份合約、具名 volume、DB 不開埠）、`lobster-factory/infra/soulful/nginx/soulfulexpression.org.conf:9-49`（不要抄其商店快取段）。
- 排程：`INFRA/scripts/wp-cron-runner.sh:2-6` 每分鐘自動發現所有「掛 `/var/www/html`、有 wp-cli、且 WordPress 回報 `DISABLE_WP_CRON`」的容器。範本只要設 `DISABLE_WP_CRON`，**不要另寫排程**。它需要容器內有 wp-cli：先讀該腳本確認怎麼判定與執行，範本的映像要滿足；soulful 怎麼解就照做。
- 拆除前例與原則：`INFRA/scripts/deprovision-staging.sh:17,21-27`（只做主機端腳本、預設 dry-run）。
- 範本要放在 `INFRA/scripts/` 底下才會隨 `INFRA/scripts/sync-host-scripts.sh` 上主機。

## 要做
1. `INFRA/scripts/templates/client-wp/docker-compose.yml.tmpl`：映像固定版本；`<slug>-wp`、`<slug>-db`；DB 不開埠；具名 volume `<slug>_wordpress_data`、`<slug>_db_data`；WordPress 只綁 `127.0.0.1:<port>`；記憶體上限；healthcheck；wp-config 代理 https 區塊；`DISABLE_WP_CRON`；選項 `same_host_products`（預設關；開＝加入外部網路 `lobster-net`）。秘密只從同目錄 `.env` 讀，範本內沒有任何值。
2. `INFRA/scripts/templates/client-wp/vhost.conf.tmpl`：80→443、憑證路徑為參數、反代到 `127.0.0.1:<port>`、`X-Real-IP`／`X-Forwarded-*`、`client_max_body_size`。
3. 渲染器（一支小 shell 函式檔，SF-E 的閘門會呼叫）：參數只有 slug、domain、port、cert 路徑、`same_host_products`；slug 用 `aw-hosting-gate.sh:29` 的 `SLUG_RE`，domain 用 SITE-FLOW §1-3 的 `DOMAIN_RE`；輸出到 stdout（交給 `safe-infra-patch.sh compose-new`／`host-nginx-new`）。
4. 登記檔 `/etc/awarewave/sites.d/<slug>.json` 的結構（範本＋一段說明註解）：`slug`、`domain`、`ingress`、`container`、`db_container`、`volumes[]`、`port`、`compose_file`、`vhost_file`（`product-gateway` 時為 null）、`created_at`。
5. `INFRA/scripts/deprovision-site.sh`：預設 dry-run 列出將拆的四層；`--apply --confirm <slug>` 才動手：`compose down`（不帶 `-v`）、移除 vhost 連結與檔並 reload（`nginx -t` 先過）、刪登記檔；`--purge-volumes` 另需 `--confirm-purge <slug>` 才刪 volume。登記檔不存在即拒（不靠猜容器名）。

## 檔案
新：上列範本兩檔、渲染器、`deprovision-site.sh`、測試 `INFRA/tests/host-scripts/client-wp-template.test.sh`。不改既有檔。

## 驗收
- 測試：以樣本參數渲染 → `docker compose config`（本機 docker 可用）通過且輸出含 `DISABLE_WP_CRON`、不含樣本以外的網域；`same_host_products` 開／關兩種輸出只差網路段；vhost 渲染後在 `nginx:alpine` 容器內 `nginx -t` 通過（憑證用測試自簽，放 `$TEMP`）；不合法 slug／domain 被拒。
- `deprovision-site.sh`：dry-run 對假登記檔列出四層且不呼叫任何會改東西的指令（墊片記錄呼叫）；`--apply` 少 `--confirm` 被拒；`down` 的參數不含 `-v`；沒有 `--confirm-purge` 時 volume 指令不被呼叫。
- `bash -n` 綠。

## 邊界
不寫閘門動詞（SF-E）；不改備份腳本（SF-F）；不連主機；不建任何真的站。
