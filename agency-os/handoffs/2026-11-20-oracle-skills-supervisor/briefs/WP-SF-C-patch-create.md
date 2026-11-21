# SF-C `safe-infra-patch.sh` 新建型

先讀：`COMMON-WP.md`、`SITE-FLOW-COMPLETION-PLAN.md` §0 I3、§1-3「共同做法」、§3 的 SF-C 列。`INFRA/`＝`lobster-factory/infra/hetzner-phase1-core/`。模型 Opus 5.5；完成後 `critic` Deep（這支腳本是所有主機檔案改動的唯一合法路徑）。

## 目的
新站的 compose 檔與 nginx vhost 檔原本不存在，而 `safe-infra-patch.sh` 只收已存在的檔（`INFRA/scripts/safe-infra-patch.sh:28`）。加兩種「新建」型，讓建站也走同一支腳本的「套用 → 檢查 → 失敗還原」。

## 已知事實
- 現有四型與用法：同檔 `:7-13`（`compose`、`nginx`、`host-nginx`、`file`）；備份位置規則 `:30-38`；compose 型的專案推導 `:40` 起。
- 既有測試（PATH 墊片假 docker／nginx／systemctl 的寫法）：`INFRA/tests/host-scripts/safe-infra-patch-host-nginx.test.sh`、`safe-infra-patch-compose-labels.test.sh`。

## 要做
1. `compose-new <file-path> <service>`：檔案必須不存在（存在即拒，exit 1，不動任何東西）；父目錄不存在則建立（0700）；寫入 stdin → `docker compose -f <file> config` → `up -d` → 等 `<service>` healthy（沿用既有逾時變數）。失敗還原＝`docker compose -f <file> down`（**不帶 `-v`，不刪 volume**）＋刪該檔（父目錄若由本次建立且已空則刪）。
2. `host-nginx-new <file-path> <vhost-to-probe>[/open-path]`：`<file-path>` 必須在 `/etc/nginx/sites-available/` 下且不存在；寫入 → 建 `sites-enabled` 同名連結（連結已存在即拒）→ `nginx -t` → reload → 沿用 `host-nginx` 型既有的 127.0.0.1 https 探測。失敗還原＝刪連結、刪檔、`nginx -t` 通過後 reload。
3. 既有四型的行為與輸出不改；新型是獨立分支。用法說明（檔頭與錯誤訊息的 Usage）補上兩型。稽核 log 沿用同一個檔。
4. 新測試 `INFRA/tests/host-scripts/safe-infra-patch-create.test.sh`（同目錄既有測試的墊片寫法，產物在 `$TEMP`）。

## 檔案
改：`INFRA/scripts/safe-infra-patch.sh`。新：`INFRA/tests/host-scripts/safe-infra-patch-create.test.sh`。

## 驗收
- 新測試涵蓋：兩型成功；檔案已存在被拒且內容不變；health 失敗 → 檔與連結消失、`down` 被呼叫且參數不含 `-v`；`nginx -t` 失敗 → 檔與連結消失、未 reload；`host-nginx-new` 路徑不在 `sites-available` 下被拒（含 `..`）。
- 既有兩支 safe-infra-patch 測試原樣全過（不改它們）。
- `bash -n` 綠；本機有 `shellcheck` 就跑。

## 邊界
不新增刪除 volume 的任何路徑；不改 `aw-hosting-gate.sh`（SF-E）；不連主機。
