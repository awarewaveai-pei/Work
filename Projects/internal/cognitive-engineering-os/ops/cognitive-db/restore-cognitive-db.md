# 還原 cognitive-db

這份步驟只在上線前演練。它把資料還原到一次性的 throwaway container，不碰正式服務。

## 準備

先在本機產生只給這次演練使用的 PostgreSQL 密碼檔，放在 `RESTORE_PASSWORD_FILE` 指向的位置。檔案只能由操作者讀取，演練結束後刪除。

```bash
export RESTORE_PASSWORD_FILE=/tmp/cognitive-db-restore-password
test -s "$RESTORE_PASSWORD_FILE"
export DUMP_FILE=/root/backups/cognitive-db/$(ls -1t /root/backups/cognitive-db/cognitive-db-*.dump | head -n 1 | xargs -n 1 basename)
test -s "$DUMP_FILE"
```

不要把密碼寫進指令列，也不要把密碼印到終端機。

## 還原到一次性容器

```bash
docker network inspect lobster-net >/dev/null
docker run -d --rm --name cognitive-db-restore-test \
  --network lobster-net \
  -e POSTGRES_USER=cognitive \
  -e POSTGRES_DB=cognitive_os \
  -e POSTGRES_PASSWORD_FILE=/run/secrets/cognitive_db_password \
  --mount type=bind,source="$RESTORE_PASSWORD_FILE",target=/run/secrets/cognitive_db_password,readonly \
  postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24

until docker exec cognitive-db-restore-test pg_isready -U cognitive -d cognitive_os; do sleep 1; done
docker exec cognitive-db-restore-test createdb -U cognitive restore_check
docker cp "$DUMP_FILE" cognitive-db-restore-test:/tmp/restore.dump
docker exec cognitive-db-restore-test pg_restore --list /tmp/restore.dump >/tmp/cognitive-db-restore-list.txt
docker exec cognitive-db-restore-test pg_restore --clean --if-exists --exit-on-error \
  --no-owner --dbname=restore_check /tmp/restore.dump
docker exec cognitive-db-restore-test psql -U cognitive -d restore_check -c '\dt'
```

`pg_restore --list` 必須成功。還原指令也必須成功。最後的 `\dt` 必須能列出資料表。

## 清理與判定

```bash
docker rm -f cognitive-db-restore-test
rm -f -- "$RESTORE_PASSWORD_FILE" /tmp/cognitive-db-restore-list.txt
```

演練只有在清理成功、資料表存在、備份檔仍可列出時才算通過。演練失敗就不要進行資料搬移或正式套用。
