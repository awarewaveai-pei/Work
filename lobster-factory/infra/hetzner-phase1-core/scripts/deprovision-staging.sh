#!/usr/bin/env bash
# deprovision-staging.sh — 拆除一個 staging 站，四層一次拆乾淨。
#
# 存在理由（2026-08-26）
# ---------------------
# app/api/internal/hosting/provision-staging/route.ts 會建立四種持久資源：容器內的檔案系統
# 目錄、MariaDB 資料庫、Supabase 的 wp_sites 列（含 WP Application Password）、以及
# organizations.metadata.client_config.site_url。在這支腳本之前，**這四種資源沒有任何一種
# 有拆除路徑**。route.ts:263 那段 rollback 只回收「同一次佈建中途失敗」的預留列，不處理
# 「成功佈建之後要拆掉」—— rollback 不等於 teardown。
#
# 代價是可以數的。2026-08-26 實測 SG：staging 目錄 7 個（2.0 GB）、staging 資料庫 13 個、
# Supabase wp_sites 只有 3 列。三層數字全對不上，而且是各自獨立在漏：4 個目錄從沒進過
# wp_sites（wiring 是 best-effort，失敗只回 WARN 不擋佈建），6 個資料庫連目錄都沒有
# （step 2 建了 DB、後面步驟炸掉就留在原地）。
#
# 不變量：**佈建流程建立的每一種持久資源，都必須有對應的拆除路徑。**
#
# 為什麼是這裡而不是一條 HTTP route
# --------------------------------
# 佈建是 route，因為 Trigger.dev 要呼叫它。拆除今天沒有任何編排器需要呼叫，只有操作者。
# 把「刪光一個站」掛到 LOBSTER_HOSTING_API_TOKEN 後面，會讓那把今天只能「建立」的 token
# 變成也能「摧毀」—— token 外洩的爆炸半徑因此放大一級，換來的只是一個沒人要用的呼叫方式。
# 這支腳本跟著 sg-deploy 的 rsync 一起上（sg-deploy.sh:117），需要 root@SG 才跑得動。
# 將來 app.aware-wave.com 真的需要一顆「刪除客戶」按鈕時，走 next-admin 既有的 SSH 路徑
# 呼叫這支即可（與佈建同一條信任邊界，不新增 HTTP 能力）。
#
# 用法
#   deprovision-staging.sh --slug <slug>                                  # 預設 DRY RUN
#   deprovision-staging.sh --slug <slug> --apply --confirm <slug>
#   deprovision-staging.sh --slug <slug> --apply --confirm <slug> --keep-days 90
#
# 退出碼：0 成功／dry-run 完成；2 參數或守衛拒絕；3 執行中失敗
set -euo pipefail

ENV_FILE="/root/lobster-phase1/.env"
WP_ROOT_BASE="/var/www/html/staging"
STAGING_BASE_URL="https://aware-wave.com/staging"
WP_CONTAINER="lobster-wordpress"
DB_CONTAINER="lobster-wordpress-db"
WP_CLI="php -d memory_limit=256M /usr/local/bin/wp"
BACKUP_ROOT="/root/lobster-phase1/backups/deprovision"
KEEP_DAYS=90

SLUG=""
APPLY=0
CONFIRM=""

log()  { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { log "ERROR: $*"; exit 3; }
deny() { log "DENIED: $*"; exit 2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug)      SLUG="${2:-}"; shift 2 ;;
    --apply)     APPLY=1; shift ;;
    --confirm)   CONFIRM="${2:-}"; shift 2 ;;
    --keep-days) KEEP_DAYS="${2:-90}"; shift 2 ;;
    -h|--help)   sed -n '1,32p' "$0"; exit 0 ;;
    *)           deny "unknown argument: $1" ;;
  esac
done

# ── 守衛 ─────────────────────────────────────────────────────────────────────
# 每一條都是「不滿足就拒絕」，沒有一條是警告。這支腳本會 rm -rf 與 DROP DATABASE，
# 在這裡放水等於把整台機器交出去。

[[ -n "$SLUG" ]] || deny "--slug is required"
# 只允許小寫英數與連字號：擋掉 ../、絕對路徑、shell metachar、空白。
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || deny "slug 格式不合法（只允許 ^[a-z0-9][a-z0-9-]{0,62}$）：$SLUG"
# --keep-days 直接餵給 find -mtime；負數或非數字會讓保留策略變成「立刻刪光所有備份」。
[[ "$KEEP_DAYS" =~ ^[0-9]{1,4}$ ]] || deny "--keep-days 必須是非負整數：$KEEP_DAYS"

[[ -f "$ENV_FILE" ]] || fail "env file not found: $ENV_FILE"
# 只取需要的 key，不 source 整份 .env（避免把一整包 secret 帶進這個 shell 的環境）
DB_ROOT_PASS="$(grep -oP '^WORDPRESS_DB_ROOT_PASSWORD=\K.*' "$ENV_FILE" || true)"
PROD_DB_NAME="$(grep -oP '^WORDPRESS_DB_NAME=\K.*' "$ENV_FILE" || true)"
SUPABASE_URL="$(grep -oP '^SUPABASE_URL=\K.*' "$ENV_FILE" || true)"
SUPABASE_KEY="$(grep -oP '^SUPABASE_SERVICE_ROLE_KEY=\K.*' "$ENV_FILE" || true)"

[[ -n "$DB_ROOT_PASS" ]] || fail "WORDPRESS_DB_ROOT_PASSWORD 讀不到"
# PROD_DB_NAME 是「不准碰的那一個」。讀不到就代表無法證明自己沒在刪正式站 → 拒絕。
[[ -n "$PROD_DB_NAME" ]] || deny "WORDPRESS_DB_NAME 讀不到 —— 無法證明目標不是正式站資料庫，拒絕執行"

WP_PATH="$WP_ROOT_BASE/$SLUG"
SITE_URL="$STAGING_BASE_URL/$SLUG"

in_wp() { docker exec "$WP_CONTAINER" bash -c "$1"; }
# wp-cli 必須以 www-data 執行：以 root 跑會被 wp-cli 擋下（"YIKES! ... running this as root"）
# 並把錯誤寫到 stderr、stdout 留空 —— 於是 DB_NAME 讀成空字串。守衛會 fail-closed 擋住，
# 所以不會誤刪，但工具會完全不能用。provision-staging 的每一個 wp-cli 呼叫也都是 -u www-data。
in_wp_cli() { docker exec -u www-data "$WP_CONTAINER" bash -c "$1"; }
in_db() { docker exec "$DB_CONTAINER" mariadb -u root -p"$DB_ROOT_PASS" "$@"; }

in_wp "[ -d '$WP_PATH' ]" 2>/dev/null || deny "目錄不存在：$WP_PATH"
in_wp "[ -f '$WP_PATH/wp-config.php' ]" 2>/dev/null \
  || deny "$WP_PATH 沒有 wp-config.php —— 拒絕刪除非 WordPress 安裝的目錄"

DB_NAME="$(in_wp_cli "$WP_CLI config get DB_NAME --path='$WP_PATH/' 2>/dev/null" | tr -d '\r\n' || true)"
[[ -n "$DB_NAME" ]] || deny "從 $WP_PATH/wp-config.php 讀不到 DB_NAME"
# 刻意讀 wp-config 而不是用 siteId 重算 toDbName()：手工建立的站（例如 wp_staging_testpilot）
# 命名規則不同，重算會算出一個不存在的名字，然後「什麼都沒刪」卻回報成功。
[[ "$DB_NAME" =~ ^wp_[A-Za-z0-9_]{1,60}$ ]] || deny "DB_NAME 不符 staging 命名（^wp_...）：$DB_NAME"
[[ "$DB_NAME" != "$PROD_DB_NAME" ]] || deny "目標資料庫等於正式站資料庫（$PROD_DB_NAME）—— 拒絕"
case "$DB_NAME" in
  mysql|information_schema|performance_schema|sys) deny "目標是系統資料庫：$DB_NAME" ;;
esac
# 自己的 DB 帳號（aw-hosting-gate.sh staging-prepare：帳號名 = DB_NAME）一起拆；舊站仍用主站帳號的只拆 DB。
DB_USER_CFG="$(in_wp_cli "$WP_CLI config get DB_USER --path='$WP_PATH/' 2>/dev/null" | tr -d '\r\n' || true)"
DROP_DB_USER=""
[[ "$DB_USER_CFG" == "$DB_NAME" ]] && DROP_DB_USER="$DB_NAME"

# 有沒有第二個安裝共用同一個資料庫？有的話 DROP 會順手弄壞別人。
SHARED="$(in_wp "grep -l \"DB_NAME.*'$DB_NAME'\" $WP_ROOT_BASE/*/wp-config.php 2>/dev/null || true" \
          | tr -d '\r' | grep -v "^$WP_PATH/wp-config.php$" | tr '\n' ' ' || true)"
[[ -z "${SHARED// /}" ]] || deny "資料庫 $DB_NAME 也被這些安裝使用，拒絕 DROP：$SHARED"

# ── 盤點（dry-run 與 apply 共用同一份，所以計畫就是實際會做的事）────────────
DIR_SIZE="$(in_wp "du -sh '$WP_PATH' 2>/dev/null | cut -f1" | tr -d '\r\n')"
DB_SIZE_MB="$(in_db -N -e "select coalesce(round(sum(data_length+index_length)/1024/1024,1),0) from information_schema.tables where table_schema='$DB_NAME';" | tr -d '\r\n')"

SB_ROW="[]"
if [[ -n "$SUPABASE_URL" && -n "$SUPABASE_KEY" ]]; then
  SB_ROW="$(curl -sS -G "$SUPABASE_URL/rest/v1/wp_sites" \
      --data-urlencode "url=eq.$SITE_URL" --data-urlencode "select=*" \
      -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY" || echo '[]')"
else
  log "WARN: Supabase 憑證讀不到 —— 只會拆 SG 這一側，wp_sites 列會留下（層與層之間仍會對不上）"
fi
SB_COUNT="$(printf '%s' "$SB_ROW" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))' 2>/dev/null || echo 0)"
SB_ORG="$(printf '%s' "$SB_ROW" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d[0].get("organization_id") or "") if d else "")' 2>/dev/null || echo "")"

log "=== deprovision plan: $SLUG ==="
log "  files    : $WP_PATH  ($DIR_SIZE)"
log "  database : $DB_NAME  (${DB_SIZE_MB} MB)"
log "  db user  : ${DROP_DB_USER:-（無自己的帳號；wp-config 用 ${DB_USER_CFG:-?}，不動）}"
log "  wp_sites : $SB_COUNT row(s) for $SITE_URL  (org=${SB_ORG:-none})"
log "  org key  : organizations.metadata.client_config.site_url（若指向本站則清除）"
log "  backup   : $BACKUP_ROOT/$SLUG-<stamp>.tar.gz（保留 ${KEEP_DAYS} 天）"

if [[ "$APPLY" -ne 1 ]]; then
  log "DRY RUN —— 沒有任何東西被改動。要真的執行：--apply --confirm $SLUG"
  exit 0
fi
[[ "$CONFIRM" == "$SLUG" ]] || deny "--apply 需要 --confirm $SLUG（收到：'${CONFIRM}'）"

# ── 執行（順序 = 建立的反序，且先備份）──────────────────────────────────────
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$BACKUP_ROOT/.work-$SLUG-$STAMP"
ARCHIVE="$BACKUP_ROOT/$SLUG-$STAMP.tar.gz"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

log "--- 1/5 備份 ---"
docker exec "$DB_CONTAINER" mariadb-dump -u root -p"$DB_ROOT_PASS" --single-transaction "$DB_NAME" > "$WORK/db.sql"
[[ -s "$WORK/db.sql" ]] || fail "資料庫 dump 產出空檔，中止（什麼都還沒刪）"
docker exec "$WP_CONTAINER" tar -czf - -C "$WP_ROOT_BASE" "$SLUG" > "$WORK/files.tar.gz"
[[ -s "$WORK/files.tar.gz" ]] || fail "檔案封存產出空檔，中止（什麼都還沒刪）"
printf '%s' "$SB_ROW" > "$WORK/wp_sites.json"
{
  echo "slug=$SLUG"
  echo "site_url=$SITE_URL"
  echo "wp_path=$WP_PATH"
  echo "db_name=$DB_NAME"
  echo "organization_id=${SB_ORG:-}"
  echo "deprovisioned_at=$STAMP"
} > "$WORK/MANIFEST.txt"
tar -czf "$ARCHIVE" -C "$WORK" .
[[ -s "$ARCHIVE" ]] || fail "封存失敗，中止（什麼都還沒刪）"
log "  backup ok: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

log "--- 2/5 Supabase wp_sites 列 ---"
# **順序是刻意的，且這一步失敗必須中止。** 資料列是四層裡唯一可逆的一層（重建一列很容易，
# 重建 357 MB 的站不容易），所以先做它；而且 curl 預設對 HTTP 4xx/5xx 回 exit 0 —— 不檢查
# 狀態碼的話，Supabase 掛掉時腳本會若無其事地繼續 DROP DATABASE 與 rm -rf，留下一個
# row_only 孤兒，也就是「拆一半」。這正是這支腳本要消滅的那種狀態，不能自己製造。
if [[ -n "$SUPABASE_URL" && -n "$SUPABASE_KEY" && "$SB_COUNT" != "0" ]]; then
  ENC_URL="$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$SITE_URL")"
  DEL_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$SUPABASE_URL/rest/v1/wp_sites?url=eq.$ENC_URL" \
    -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY" \
    -H "Prefer: return=minimal" || echo "000")"
  case "$DEL_CODE" in
    2*) log "  deleted $SB_COUNT row(s) (HTTP $DEL_CODE)" ;;
    *)  fail "刪除 wp_sites 列失敗（HTTP $DEL_CODE）—— 中止，SG 這一側完全未動。備份留在 $ARCHIVE" ;;
  esac
elif [[ -z "$SUPABASE_URL" || -z "$SUPABASE_KEY" ]]; then
  # 沒憑證就繼續拆 SG，會保證留下 row_only 孤兒。寧可什麼都不做。
  fail "Supabase 憑證讀不到 —— 中止，否則必然拆成半殘狀態。備份留在 $ARCHIVE"
else
  log "  skip（本來就沒有對應的列）"
fi

log "--- 3/5 organizations.client_config.site_url ---"
if [[ -n "$SUPABASE_URL" && -n "$SUPABASE_KEY" && -n "$SB_ORG" ]]; then
  ORG_JSON="$(curl -sS -G "$SUPABASE_URL/rest/v1/organizations" \
      --data-urlencode "id=eq.$SB_ORG" --data-urlencode "select=metadata" \
      -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY")"
  NEW_META="$(printf '%s' "$ORG_JSON" | python3 - "$SITE_URL" <<'PYEOF'
import json, sys
rows = json.load(sys.stdin)
target = sys.argv[1].rstrip("/")
if not rows:
    print("")
    sys.exit(0)
meta = rows[0].get("metadata") or {}
cc = meta.get("client_config") or {}
# 只在它指向這個被拆掉的站時才清除 —— 指向別處就不是我們造成的，不要順手改別人的資料
if (cc.get("site_url") or "").rstrip("/") == target:
    cc.pop("site_url", None)
    meta["client_config"] = cc
    print(json.dumps({"metadata": meta}))
else:
    print("")
PYEOF
)"
  if [[ -n "$NEW_META" ]]; then
    printf '%s' "$NEW_META" | curl -sS -X PATCH "$SUPABASE_URL/rest/v1/organizations?id=eq.$SB_ORG" \
      -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY" \
      -H "Content-Type: application/json" -H "Prefer: return=minimal" --data-binary @- >/dev/null
    log "  cleared site_url on org $SB_ORG"
  else
    log "  skip（org 的 site_url 並未指向本站）"
  fi
else
  log "  skip（無 org 或無憑證）"
fi

log "--- 4/5 DROP DATABASE $DB_NAME ---"
in_db -e "DROP DATABASE IF EXISTS \`$DB_NAME\`;"
log "  dropped"
if [[ -n "$DROP_DB_USER" ]]; then
  in_db -e "DROP USER IF EXISTS '$DROP_DB_USER'@'%';"
  log "  dropped DB user $DROP_DB_USER"
fi

log "--- 5/5 rm -rf $WP_PATH ---"
# 刪之前把守衛再跑一次：這是整支腳本唯一不可逆的地方，多花 20ms 再確認一次路徑形狀。
[[ "$WP_PATH" == "$WP_ROOT_BASE/$SLUG" ]] || fail "路徑守衛在最後一刻不通過，中止"
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || fail "slug 守衛在最後一刻不通過，中止"
in_wp "rm -rf '$WP_PATH'"
in_wp "[ ! -e '$WP_PATH' ]" || fail "刪除後目錄仍存在：$WP_PATH"
log "  removed"

find "$BACKUP_ROOT" -maxdepth 1 -name '*.tar.gz' -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true

log "=== deprovision complete: $SLUG ==="
log "backup:  $ARCHIVE"
log "restore: tar -xzf <archive> -C <tmpdir> && cat <tmpdir>/MANIFEST.txt"
