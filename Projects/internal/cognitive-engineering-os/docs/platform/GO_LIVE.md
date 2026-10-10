# GO_LIVE：Cognitive OS 從 SQLite 搬上 PostgreSQL 的上線步驟

狀態：2026-10-10 寫成；**同日在 ks-aw-01 執行完 A1–B8**（停站 22:23:48–22:30:59 UTC，搬 3 租戶／4 帳號／60 事件／15 檔，證明相等；B2b 與 out/ 擁有者兩處是執行時補的）。原本寫：本機（假網路 `gl_net`、`postgres:17-alpine`、用 a76af28da 引擎寫出的夾具）跑過的：`install-cognitive-db.sh`（含 dry-run、兩種失敗回滾、拒絕已存在的卷）、`move_sqlite_to_pg.py` 在容器內以 uid 1001 的 dry-run／move／verify（本文 `cosmove` 的同一組參數）、`lib-db.sh` 的預檢／dump／migration／回滾（含舊映像不能用的分支）、`restore-live-cognitive-db.sh`（C2 同一個腳本）。**沒跑過**：A1–A3（git、migration 0095、`sg-deploy.sh`）、完整的 `deploy.sh`（測試閘與建映像只能在主機上）、cron、nginx、真正的資料量。
上線是 High-STOP（`agency-os/AGENTS.md` §3）：**每個標「High-STOP」的步驟，操作者說 go ahead 才做**。每步格式：**做**（指令）、**預期**（看到什麼才算對）、**退回**（這步出錯怎麼回到上一步）。

工具對照（都在 `Projects/internal/cognitive-engineering-os/`）：

| 工具 | 做什麼 |
|---|---|
| `ops/cognitive-db/install-cognitive-db.sh` | 裝 PostgreSQL 服務、migration 到 head、備份一次、還原演練一次；失敗只拆自己建的東西 |
| `ai_lego/apps/cli/move_sqlite_to_pg.py` | 搬資料：`--dry-run`、`move`、`verify`；兩邊證明相等才 commit |
| `deploy/deploy.sh` + `deploy/lib-db.sh` | 部署：預檢 → 部署前 dump → 明確的 migration → 啟動 → 健康 → smoke（含資料庫）；失敗時映像與資料庫一起回滾 |
| `ops/cognitive-db/restore-live-cognitive-db.sh` | 把正式資料庫換回某個 dump（改名交換，被換下的留著） |

## 0. 開始前，操作者先決定四件事

| # | 決定 | 說明 |
|---|---|---|
| D1 | 第一個區域的名字 `<region>`（小寫字母、數字、`-`；例 `eu`） | 今天每個租戶的 `data_residency_region` 都是 `local-dev`；搬的時候全部對到這一個名字（`--region-map local-dev=<region>`）。名字也會出現在檔案卷 `cognitive-os-files-<region>`。之後改名 = 搬資料。 |
| D2 | 停站窗口多長 | 窗口 = B1 到 B8，三段決定長度：複本（B2，看資料量）、搬移（B4，看列數與檔案數）、`deploy.sh`（B7，測試閘 + 建映像 + 啟動，通常最久）。前兩段在 A8 的 `time` 先量到；第三段看上一次部署的時間戳（指令在表下）。停站期間訪客看到 nginx 的 502；要不要放維護頁 = 另一個 nginx 變更（`safe-infra-patch.sh`，另行批准），本文不含。 |
| D3 | SQLite 舊卷與各種複本留多久 | 舊卷、`$WORK/src`、部署前 dump 都含個資；留著等於讓「已抹除」的人還在複本裡。建議回滾期（例 7 天）一過就刪（D 節）。 |
| D4 | 物理保留 | **已決定（2026-10-10，操作者授權）並已實作**：抹除的每個交易 commit 後，`erasure.physical_retention_hook` 在背景 VACUUM 它刪改過列的表；每晚 dump 留 7 天（正式 cron 傳 `COGNITIVE_DB_BACKUP_KEEP_DAYS=7`，腳本預設也是 7）。**還沒做到**：VACUUM 釋放空間但不清零，在頁面空閒區邊緣的舊列位元組留到之後的寫入蓋過；WAL 留到回收；dump 留到 7 天過期。細節 `STORAGE_SWITCH.md`「Physical retention decision」。 |

D2 的第三段：`grep -E 'test-gate [|]|done' /opt/cognitive-os/Projects/internal/cognitive-engineering-os/deploy/deploy.log | tail -6`。

次序規則（`agency-os/handoffs/2026-10-04-1400-cos-step2-merged-storage-next.md:68`）：**migration 0095 → next-admin 部署 → 引擎部署**。A2、A3 做完才能做 B7；它們跟 PostgreSQL 的安裝互不相依，可以另一天先做。

## 1. 變數（在主機上，以 `ubuntu` 身分；SSH `-p 58122`，主機見 `AGENTS.md` §0）

```bash
export REGION=<region>                                   # D1
export COS=/opt/cognitive-os
export PRODUCT=$COS/Projects/internal/cognitive-engineering-os
export OLDVOL=cognitive-engineering-os_cognitive-os-identity-data
export WORK=/home/ubuntu/cos-golive-$(date -u +%Y%m%d)   # 複本與證明放這裡，不進 git
export RT=/app/Projects/internal/cognitive-engineering-os/.runtime   # 引擎映像裡的檔案根；新卷掛在這裡
mkdir -p $WORK/out && chmod 700 $WORK && sudo -n chown 1001:1001 $WORK/out   # 容器以 uid 1001 寫報告；2026-10-10 第一次 B4 因 out/ 屬 ubuntu 在 commit 後寫報告失敗，走了 C2 重來

cosmove() {   # cosmove <來源目錄> move [--dry-run] [--report /out/x.json]   |   cosmove <來源目錄> verify
  local src="$1"; shift
  docker run --rm --user 1001:1001 --network lobster-net --env-file $WORK/url.env \
    -v "$src":/src:ro -v $WORK/out:/out -v cognitive-os-files-$REGION:$RT cognitive-os-api:golive \
    python -m ai_lego.apps.cli.move_sqlite_to_pg "$@" --source-dir /src --region-map local-dev=$REGION --files-root $RT
}
```

`cosmove` 的資料庫網址只從 `$WORK/url.env` 進容器（A7 建，只含那一行）；密碼不在指令列、不在輸出。引擎在容器裡是 uid 1001（Dockerfile），所以複本與新卷都用 1001。

## A. 窗口之前（不停站；每步都可獨立退回）

**A1 程式碼上主機。** 做：

```bash
cd $COS && git rev-parse HEAD | tee $WORK/prev-sha.txt      # 現在跑著的版本，回滾要用
git pull --ff-only && git log -1 --oneline
ls $PRODUCT/ops/cognitive-db/install-cognitive-db.sh $PRODUCT/deploy/lib-db.sh
```

預期：`git log` 是要上線的那個 commit；兩個檔案都在。`ls` 找不到 `ops/`：這個稀疏檢出沒含它，`git sparse-checkout add Projects/internal/cognitive-engineering-os/ops` 後再 `ls`。退回：`git checkout --detach $(cat $WORK/prev-sha.txt)`（站還沒動，沒有別的要退）。

**A2 migration 0095（High-STOP，Medium 風險、只加不改）。** 在筆電（已載入 `mcp/user-env.ps1` 的 `AWAREWAVE_SSH_*`）：

```bash
node scripts/apply-db-migration.mjs --check 0095
node scripts/apply-db-migration.mjs 0095
node scripts/apply-db-migration.mjs --status
```

預期：`--check` 只印不改；套用後 `--status` 顯示 0095 已記帳。退回：**先撤 next-admin 程式碼（A3 的退回），再**

```bash
ssh -p 58122 <user>@145.239.195.47 'docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1' < lobster-factory/packages/db/scripts/0095_collect_claimreview_mirror_down.sql
```

（同一個交易也刪掉帳本那一列。）

**A3 next-admin 部署（High-STOP）。** 先 `/check-drift` → `/verify`，再在主機：

```bash
sudo -n /root/lobster-phase1/scripts/sg-deploy.sh next-admin
```

預期：npm test、healthcheck、HTTP smoke 全過，腳本以 0 結束；之後 `/playwright smoke`。第一次整點 heartbeat 後（0095 的 go-live 檢查）：`select current_generation, reviews, built_at, last_error from public.collect_claimreview_mirror;` 的 `built_at` 有值、`last_error` 空。退回：`sg-deploy.sh` 在 smoke 失敗時自己回滾；手動用 `/root/lobster-phase1/scripts/rollback-phase1.sh`。

**A4 用獨立的 tag 建新引擎映像**（不動 `:latest`，所以舊站不受影響）。做：

```bash
cd $COS && docker build --target runtime -t cognitive-os-api:golive -f Projects/internal/cognitive-engineering-os/Dockerfile .
docker run --rm cognitive-os-api:golive python -m ai_lego.apps.cli.migrate_db --head
```

預期：第二行印出 head 版本（寫文件時是 `0007`）。退回：`docker rmi cognitive-os-api:golive`。

**A5 資料庫密碼檔**（只在 root 下、不在任何 git 檢出裡）。做：

```bash
sudo sh -c 'umask 077; openssl rand -hex 24 > /root/cognitive-db-password' && sudo stat -c %a /root/cognitive-db-password
```

預期：`600`。退回：`sudo rm -f /root/cognitive-db-password`。

**A6 安裝腳本 dry-run**（預檢是真的，之後的指令只印不跑）。做：

```bash
sudo -n env COGNITIVE_DB_PASSWORD_FILE=/root/cognitive-db-password COGNITIVE_DB_ENGINE_IMAGE=cognitive-os-api:golive \
  COGNITIVE_DB_ENGINE_ENV_FILE=$PRODUCT/deploy/.env bash $PRODUCT/ops/cognitive-db/install-cognitive-db.sh --region $REGION --dry-run
```

預期：`preflight ok: ... engine image cognitive-os-api:golive (head 0007) ...`，接著每個 `+ (dry-run) ...` 指令，最後 `DRY RUN OK`。任何 `REFUSED:` 照字面處理（網路不存在、卷已存在、密碼檔權限…）。退回：不用，沒做任何事。

**A7 安裝 cognitive-db（High-STOP：新增服務）。** 做：A6 同一行去掉 `--dry-run`。預期（依序）：

```text
step 1/6 preflight ... step 2/6 create ... step 3/6 wait for pg_isready ... accepting connections
step 4/6 migrate the EMPTY database to head (0007)
region <region>: none -> 0007
region <region>: at head 0007
step 5/6 backup once ... step 6/6 restore rehearsal ...
RESTORE OK: cognitive-db-<date>-636f676e69746976655f6f73-<run>.dump -> restore_check
OK. Next: ...
```

安裝腳本要求 `deploy/.env` 已存在時是 mode 600、擁有者與 `deploy/` 資料夾相同，否則 `REFUSED`（先 `chmod 600`／`chown`）；它新建這個檔時會自己設好。再確認（不要印值）：`grep -c '^COGNITIVE_OS_DATABASE_URLS=' $PRODUCT/deploy/.env` 是 `1`（安裝腳本從密碼檔寫進去的；密碼不在 git、不在指令列）；然後建搬移用的網址檔：`grep '^COGNITIVE_OS_DATABASE_URLS=' $PRODUCT/deploy/.env > $WORK/url.env && chmod 600 $WORK/url.env`。**第一份 dump（空的、已 migrate 的資料庫）留著**：C2「退掉搬移」靠它。
加每晚備份：把 `ops/cognitive-db/README.md`「備份」節那行 cron 加到 `/etc/cron.d/ks-stack-backup`（路徑已是 `/opt/cognitive-os/...`）；隔天 `ls -la /root/backups/cognitive-db` 要有新檔。
退回：安裝腳本中途失敗會自動拆掉它建的東西（容器、卷、這次寫的 dump、這次寫進 `deploy/.env` 的那一行）並通知，直接重跑。安裝成功後、搬資料之前想拆掉：

```bash
sudo -n env COGNITIVE_DB_PASSWORD_FILE=/root/cognitive-db-password COGNITIVE_DB_NETWORK=lobster-net \
  docker compose -p cognitive-db -f $PRODUCT/ops/cognitive-db/docker-compose.cognitive-db.yml down --volumes
```

並刪掉 `deploy/.env` 那一行與 cron 那一行。**搬資料之後不要用這個**（會刪掉資料庫），用 C 節。

**A8 在活站的一致性複本上 dry-run 搬移**（不停站，不寫任何東西；先把格式問題挖出來）。做：

```bash
sudo -n python3 - /var/lib/docker/volumes/$OLDVOL/_data $WORK/rehearsal-src <<'PY'
import pathlib, shutil, sqlite3, sys
src, dst = map(pathlib.Path, sys.argv[1:3])
for p in sorted(src.rglob("*")):
    q = dst / p.relative_to(src)
    if p.is_dir(): q.mkdir(parents=True, exist_ok=True); continue
    q.parent.mkdir(parents=True, exist_ok=True)
    if p.name.endswith(("-wal", "-shm", "-journal")): continue
    if p.suffix == ".sqlite3":
        s = sqlite3.connect(f"file:{p}?mode=ro", uri=True); d = sqlite3.connect(q); s.backup(d); d.close(); s.close()
    else: shutil.copy2(p, q)
PY
sudo -n chown -R 1001:1001 $WORK/rehearsal-src
docker volume create cognitive-os-files-$REGION >/dev/null
time cosmove $WORK/rehearsal-src move --dry-run
```

預期：每張表一行 `source rows N`，`event aggregates hashed: N; files: N in N tenant(s)`，`DRY RUN OK: nothing written`。錯誤碼的意思與處理見 C 節末的表；`SOURCE_SHAPE` / `CONVERT` 在這裡出現就先修，不要等到窗口。退回：`sudo rm -r $WORK/rehearsal-src`（個資複本，用完就刪）；`docker volume rm cognitive-os-files-$REGION`（還是空的時候）。

## B. 窗口（停站）

記下開始時間。順序不可換；B7 之前任何一步出錯，都先照該步「退回」，站就能原樣回來。

**B1 停站。** 做：`docker stop cognitive-os-web cognitive-os-api`。預期：`curl -s -o /dev/null -w '%{http_code}\n' https://cognitive.aware-wave.com/` 變成 502。退回（也是整個 B 節在 B7 之前的總退回）：`docker start cognitive-os-api cognitive-os-web`，舊映像、舊卷原封不動。

**B2 複製活檔（引擎已停，所以是安靜的複本）並記雜湊。** 做：

```bash
sudo -n cp -a /var/lib/docker/volumes/$OLDVOL/_data $WORK/src
sudo -n chown -R 1001:1001 $WORK/src
ls $WORK/src/*.sqlite3*                                    # 只該有三個 .sqlite3，沒有 -wal / -journal / -shm
(cd $WORK/src && sudo -n find . -type f -print0 | sort -z | sudo -n xargs -0 sha256sum) > $WORK/src.sha256
```

預期：`identity.sqlite3 projects.sqlite3 custom_workflows.sqlite3`。退回：`sudo rm -r $WORK/src`。

**B2b 活站比 a76af28da 舊時，先把複本升到那個形狀**（2026-10-10 正式站是 ebbf363c；A8 會報 `SOURCE_SHAPE`）。用 a76af28da 的引擎開一次複本（只動複本；雜湊在這之後才記）：`git archive a76af28da Projects/internal/cognitive-engineering-os agency-os/docs/AI_LEGO_Cognitive_Engineering_OS | tar -x -C $WORK/a76ctx`，`docker build --target runtime -t cognitive-os-api:a76 -f $WORK/a76ctx/Projects/internal/cognitive-engineering-os/Dockerfile $WORK/a76ctx`，再以 uid 1001 執行一個只建構 `IdentityStore`、`ProjectSourceRepository`、`CustomWorkflowRepository`（各指向複本的三個檔）的 python。之後複本旁不得有 `-wal`/`-journal`。B2 的雜湊改在這一步之後記。

**B3 乾跑一次最終複本。** 做：`time cosmove $WORK/src move --dry-run`。預期：`DRY RUN OK: nothing written`。退回：無（沒寫東西）。

**B4 搬移（第一次寫入正式資料庫）。** 做：

```bash
time cosmove $WORK/src move --report /out/move-report.json
```

預期：每張表 `source rows N  target rows N`（兩欄相等），最後 `MOVE OK: committed, proof equal on both sides`，退出碼 0。證明內容：每表的列數與每列的摘要、`events`/`workspace` 的 rowid 順序、兩個序號、每個聚合的事件雜湊（兩邊各算）、每個租戶的檔案數/位元組/雜湊。退回：失敗（非 0）= 資料庫整個交易回滾、這次複製的檔案刪掉，目標仍是空的，修好原因重跑即可；成功後想退掉見 C2。

**B5 再證明一次，並確認來源沒被動過。** 做：`cosmove $WORK/src verify`；然後 `(cd $WORK/src && sudo -n sha256sum -c ../src.sha256 | grep -vc ': OK$')`。預期：`VERIFY OK: proof equal on both sides`；雜湊檢查印 `0`（沒有任何不是 OK 的行）。把 `$WORK/out/move-report.json` 的計數貼進 WORKLOG（只有數字與雜湊，沒有內容）。注意：`verify` 只在引擎還沒寫任何新資料前有效。

**B6 先看一眼資料庫**（不印密碼）：

```bash
docker exec $(docker ps -q --filter label=com.docker.compose.project=cognitive-db --filter label=com.docker.compose.service=cognitive-db) \
  psql -U cognitive -d cognitive_os -Atc "select (select count(*) from tenant), (select count(*) from identity), (select count(*) from platform_projects), (select count(*) from events)"
```

預期：四個數字等於 B4 表裡對應的列數。

**B7 部署引擎與網頁（High-STOP：prod 部署）。** 做：

```bash
cd $COS && bash $PRODUCT/deploy/deploy.sh
```

預期（`deploy.log` 的關鍵行，依序）：

```text
db | preflight ok: region <region>, cognitive-db healthy
db | schema at head: dump only
db | pre-deploy dump: /home/ubuntu/cos-predeploy-backups/cognitive-db-<date>-636f676e69746976655f6f73-<run>.dump
healthcheck | cognitive-os-api healthy after Ns
healthcheck | cognitive-os-web healthy after Ns
smoke | local: PASS    smoke | web local: PASS    smoke | database: PASS
notify | deployed successfully, local health OK
done
```

`docker compose` 若印一行「volume ... already exists but was not created by Docker Compose」是 A8 先建卷造成的，正常。
退回：測試閘、建映像、預檢失敗 = 什麼都沒變，舊容器只是被 B1 停著：`docker start cognitive-os-api cognitive-os-web`。`deploy.sh` 啟動新容器之後任何一步失敗會停掉新容器；因為舊映像是 SQLite 引擎、跑不了新 compose，它**不會**自動換回去，會印 `no previous API image that speaks PostgreSQL` 並通知。這時照 C1 退回舊站。

**B8 驗收，然後結束窗口。** 做：

```bash
curl -s https://cognitive.aware-wave.com/api/health                                   # {"status":"ok"}
docker exec cognitive-os-api printenv COGNITIVE_OS_DB_PATH; echo "exit=$?"            # exit=1：SQLite 路徑已不存在
docker exec cognitive-os-api sh -c 'printenv COGNITIVE_OS_DATABASE_URLS >/dev/null'; echo "exit=$?"   # exit=0（不印值）
```

再用網頁登入一個真帳號：專案數量與 B4 的 `platform_projects` 一致，打開一個有來源的專案能讀到內容（檔案卷）。預期全過。記下結束時間；`/playwright smoke`；WORKLOG 照 `AGENTS.md` §1 的四行證據寫。退回：C1。

## C. 回滾（依做到哪一步）

**C1 退回舊站（B7 之後；SQLite 舊卷從沒被改過）。**

```bash
cd $COS && git checkout --detach $(cat $WORK/prev-sha.txt)          # 舊 compose（掛 SQLite 卷）與舊 deploy.sh
docker tag cognitive-os-api:rollback cognitive-os-api:latest && docker tag cognitive-os-web:rollback cognitive-os-web:latest
docker compose -f $PRODUCT/docker-compose.yml up -d
curl -s https://cognitive.aware-wave.com/api/health
```

預期：`{"status":"ok"}`，舊資料原樣在。窗口內若有人在新站寫過東西，那些資料不在舊卷裡（窗口內不該有）。PostgreSQL 與檔案卷留著不動，等修好再來。修好後 `git checkout main` 回到主線。

**C2 退掉搬移但保留 PostgreSQL 服務（讓空資料庫重來一次；B7 還沒做，或已照 C1 退回舊站）。**

```bash
sudo -n env COGNITIVE_DB_CONTAINER=$(docker ps -q --filter label=com.docker.compose.project=cognitive-db --filter label=com.docker.compose.service=cognitive-db) \
  bash $PRODUCT/ops/cognitive-db/restore-live-cognitive-db.sh /root/backups/cognitive-db/cognitive-db-<date>-636f676e69746976655f6f73-<安裝時那一份>.dump
docker volume rm cognitive-os-files-$REGION                         # 只有這次搬進去的檔案；舊卷不碰
```

預期：`RESTORE LIVE OK ...; the replaced database is kept as cognitive_os_failed_<時間>`；`psql ... -c 'select count(*) from tenant'` 是 0。被換下的 `cognitive_os_failed_*` 含搬進去的個資：檢查完就 `DROP DATABASE`。之後從 B4 重做（卷要重新 `docker volume create`）。

**C3 部署後的日常失敗**（上線已完成之後的普通部署）：`deploy.sh` 自己處理——待跑的 migration 先停 API/網頁再 dump，失敗就停新容器、把 dump 換回去、換回舊映像、再啟動；沒有待跑的 migration 就只換映像。失敗訊息裡有 dump 路徑。`ROLLBACK FAILED` = 要人處理。

**搬移指令的錯誤碼（B3、B4、A8）：**

| 碼 | 意思 | 處理 |
|---|---|---|
| `SOURCE_NOT_QUIET` | 複本旁有 `-wal`/`-journal`/`-shm` | 引擎沒停就複製了；停站後重新複製 |
| `SOURCE_SHAPE` | 檔案不是 a76af28da 的形狀（缺表/缺欄） | 活站跑的版本比 a76af28da 舊：用 a76af28da 的引擎對複本開一次（它開檔時會自己升級），**不要**手改 |
| `EVENT_OWNER_MISSING` | 有紀錄沒有擁有者（之後無法抹除） | 停，交給工程師；不要略過 |
| `CONVERT` | 某表某列某欄的時間或 JSON 格式不合（訊息只給表名、rowid、欄名） | 停，交給工程師看那一列 |
| `REGION_UNMAPPED` / `REGION_MAP_UNUSED` / `REGION_NOT_CONFIGURED` | `--region-map` 沒涵蓋租戶的區域、多寫了、或不是 `deploy/.env` 設定的那個區域 | 改參數 |
| `FILES_ORPHAN` / `FILES_UNKNOWN` | 複本裡有不屬於任何租戶的目錄或不認得的項目 | 看是什麼；是垃圾就從**複本**刪掉再跑 |
| `TARGET_NOT_EMPTY` / `TARGET_SCHEMA_BEHIND` / `FILES_TARGET_NOT_EMPTY` | 目標有列、有序號被用過、或不在 head | 空資料庫才能搬；要重來走 C2。搬移自己失敗並回滾時會把序號還原，所以直接重跑不會被這條擋住；程序被殺掉才可能留下用過的序號 |
| `PROOF_FAILED` | 兩邊不相等 | 什麼都沒提交；保留輸出重跑一次，再失敗就停，交給工程師 |
| `INSERT` | 資料庫拒絕某列（只給 SQLSTATE 與約束名） | 停，交給工程師 |

## D. 之後

1. 隔天確認每晚備份有產生：`ls -la /root/backups/cognitive-db`。每週用 `ops/cognitive-db/restore-cognitive-db.sh` 把最新 dump 還原到一次性容器演練一次。
2. 回滾期（D3）一過：`docker volume rm $OLDVOL`、`sudo rm -r $WORK`（含複本與 `url.env`）。部署前的 dump 在 `~/cos-predeploy-backups`，備份腳本自己只留 7 天。這些是刪除性操作，High-STOP。
3. 刪掉 `cognitive_os_failed_*` 資料庫（若有）。
4. `scripts/dev/cos_live_counts.sh`、`cos_predeploy_trial.sh` 讀的是 SQLite 卷，上線後作廢；換成對 PostgreSQL 的版本是另一張卡。
5. `docs/platform/STORAGE_SWITCH.md` 的 D8 與 Not built（D7 每區域檔案根：現在只有一個區域）在第二個區域開之前不用動。
