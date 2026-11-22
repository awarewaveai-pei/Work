# SF-F 每日備份自動涵蓋新網站

先讀：`COMMON-WP.md`、`SITE-FLOW-COMPLETION-PLAN.md` §3 的 SF-F 列（`:135`）。整檔讀：`lobster-factory/infra/ks-aw-01-backup/backup-ks-aw-01.sh`、`verify-backup-ks-aw-01.sh`、`lobster-factory/infra/hetzner-phase1-core/scripts/backup-coverage-check.py`、`scripts/templates/client-wp/render.sh`（登記檔格式與 `client_wp_*` 函式）。模型 Opus 5.5。

## 目的
新網站建好的當晚就要被備份，不靠人記得去加。不變量：登記檔 `/etc/awarewave/sites.d/<slug>.json` 裡的每個站，其資料庫與檔案 volume 都在當晚的備份清單與覆蓋檢查裡；既有站（soulful 等）的備份輸出不變。

## 已知事實
- 登記檔格式與欄位在 `render.sh:8-27`（main `380b3cec1`）：`slug`、`domain`、`container`、`db_container`、`volumes`、`compose_file`、`vhost_file`、`port`、`ingress`、`created_at`。資料庫密碼在站台目錄的 `.env`（`client_wp_env_file`），不在登記檔。
- 拆站後登記檔被移到 `/var/lib/awarewave/deprovisioned/<slug>-<時間>/`，volume 預設保留並留 `DEPROVISIONED` 標記（`deprovision-site.sh`）。

## 要做
1. `backup-ks-aw-01.sh`：在既有清單之外加一段讀 `sites.d` 的迴圈，每站備份資料庫（從 `db_container` 匯出）與檔案 volume；做法、命名、保留期照同檔既有站的慣例，不另創一套。登記檔讀不懂的站：記錯、跳過該站、整體結束碼非 0，不讓其他站的備份中斷。
2. `backup-coverage-check.py`：把 `sites.d` 的站列為必須涵蓋；漏了要報。
3. `verify-backup-ks-aw-01.sh`：驗證範圍含登記的站。
4. 已拆除但保留 volume 的站（有 `DEPROVISIONED` 標記）：資料還在主機上卻不再被每日備份。定出做法並寫明理由（建議：拆除當下由 `deprovision-site.sh` 之外的本卡腳本不處理，覆蓋檢查把這類 volume 列為「保留中、未備份」的提示而非錯誤）；不改 `deprovision-site.sh`。
5. 密碼不出現在備份 log。

## 檔案
改：上列三檔。新：`lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/` 下本卡的測試（或該備份目錄既有的測試位置，照現況）。

## 驗收
- 假登記檔（兩個站）dry-run：清單列出每站的資料庫與檔案兩項。
- 沒有 `sites.d`、空的 `sites.d`、有一個壞登記檔：三種情況既有站的輸出與改前逐行相同（改前先存一份 dry-run 輸出，`diff` 驗）。
- 覆蓋檢查：登記的站被涵蓋時不報；從清單拿掉一個站時報漏。
- `bash -n`、`python -m py_compile`；`critic` 一輪。

## 邊界
不連主機、不跑真的備份、不 push。這三支腳本併入 main 後會同步到主機並在當晚執行，所以「既有站輸出逐行相同」是底線。
