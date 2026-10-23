#!/usr/bin/env bash
# scripts/aw-hosting-gate.sh against a THROWAWAY stack: mariadb:11 + wordpress:php8.2-apache with wp-cli 2.11.0
# (= prod's lobster-phase1-wordpress:local base and pinned wp-cli), under prod's container names, labelled
# aw-gate-test=1 on a private network. Refuses to run if a lobster-wordpress(-db) exists without that label.
# Needs Docker + internet (wp core download). From the repo root (Git Bash: path conversion off):
#   MSYS_NO_PATHCONV=1 bash lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/hosting-gate.test.sh
# GATE=<file> runs a mutated copy. Never point this at a real host: it creates and drops databases.
set -uo pipefail
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
GATE="${GATE:-$HERE/../../scripts/aw-hosting-gate.sh}"
WP=lobster-wordpress
DB=lobster-wordpress-db
ROOT=/var/www/html/staging

pass=0; failed=0
check() { local d="$1"; shift; if "$@"; then echo "PASS $d"; pass=$((pass + 1)); else echo "FAIL $d"; failed=$((failed + 1)); fi; }
not() { ! "$@"; }

for n in "$WP" "$DB"; do
  if docker inspect "$n" >/dev/null 2>&1 && [[ "$(docker inspect -f '{{index .Config.Labels "aw-gate-test"}}' "$n")" != 1 ]]; then
    echo "refusing: container $n exists and is not a test container"; exit 2
  fi
done
teardown() {
  local ids; ids="$(docker ps -aq --filter label=aw-gate-test=1)"
  [[ -z "$ids" ]] || docker rm -f $ids >/dev/null
  docker network rm aw-gate-test >/dev/null 2>&1 || true
}
teardown; [[ "${KEEP:-}" == 1 ]] || trap teardown EXIT   # KEEP=1: leave the stack up for debugging

docker build -q -t aw-gate-test-wp - >/dev/null <<'EOF' || { echo "image build failed"; exit 2; }
FROM wordpress:php8.2-apache
RUN curl -sSL https://github.com/wp-cli/wp-cli/releases/download/v2.11.0/wp-cli-2.11.0.phar -o /usr/local/bin/wp && chmod +x /usr/local/bin/wp
EOF
# The gate runs as on ks-aw-01: Linux bash + coreutils + docker CLI on its hardcoded PATH, talking to this
# Docker daemon through the socket (a Git Bash host would not match prod's PATH/tools).
docker build -q -t aw-gate-test-runner - >/dev/null <<'EOF' || { echo "runner build failed"; exit 2; }
FROM docker:cli
RUN apk add --no-cache bash coreutils util-linux grep curl python3
EOF
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
GATE_DIR="$(hostpath "$(cd "$(dirname "$GATE")" && pwd)")"
GATE_FILE="$(basename "$GATE")"
docker network create aw-gate-test >/dev/null
docker run -d --label aw-gate-test=1 --name "$DB" --network aw-gate-test \
  -e MYSQL_ROOT_PASSWORD=rootpw-test -e MYSQL_USER=wpuser -e MYSQL_PASSWORD=mainpw-test -e MYSQL_DATABASE=wp_main mariadb:11 >/dev/null
docker run -d --label aw-gate-test=1 --name "$WP" --network aw-gate-test \
  -e WORDPRESS_DB_HOST=lobster-wordpress-db -e WORDPRESS_DB_NAME=wp_main -e WORDPRESS_DB_USER=wpuser \
  -e WORDPRESS_DB_PASSWORD=mainpw-test aw-gate-test-wp >/dev/null

for _ in $(seq 60); do docker exec "$DB" sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -uroot -e "select 1"' >/dev/null 2>&1 && break; sleep 2; done
for _ in $(seq 60); do docker exec "$WP" test -f /var/www/html/wp-config.php 2>/dev/null && break; sleep 2; done
wpat() { local p="$1"; shift; docker exec -u www-data "$WP" php -d memory_limit=256M /usr/local/bin/wp --path="$p/" "$@"; }
wpat /var/www/html core install --url=http://main.test --title=main --admin_user=a --admin_password=x \
  --admin_email=a@x.invalid --skip-email --quiet || { echo "main site install failed"; exit 2; }
docker exec "$WP" mkdir -p "$ROOT"   # root:root 755, as on ks-aw-01
main_sha() { docker exec "$WP" sha256sum /var/www/html/wp-config.php | cut -d' ' -f1; }
MAIN0="$(main_sha)"

gate() {
  docker run --rm -i --label aw-gate-test=1 -e SSH_CLIENT="gate-test 0 0" -e SSH_ORIGINAL_COMMAND="$1" \
    -v /var/run/docker.sock:/var/run/docker.sock -v "$GATE_DIR:/g:ro" aw-gate-test-runner bash "/g/$GATE_FILE"
}
login_ok() {  # <site dir>: the site's own wp-config credentials log in to its own DB
  local u p d; u="$(wpat "$1" config get DB_USER)"; p="$(wpat "$1" config get DB_PASSWORD)"; d="$(wpat "$1" config get DB_NAME)"
  printf '%s\n%s\n%s\n' "$u" "$p" "$d" | docker exec -i "$WP" php -r \
    '$l=explode("\n",stream_get_contents(STDIN)); mysqli_report(MYSQLI_REPORT_OFF); exit(@mysqli_connect("lobster-wordpress-db",$l[0],$l[1],$l[2]) ? 0 : 1);'
}
has() { [[ "$1" == *"$2"* ]]; }
ok_archive() { [[ "$1" == 0 && "$2" == *"ARCHIVES=1"* ]]; }   # exit 0 AND a backup archive (archive alone exists even on a later abort)

# --- new site ---
out="$(gate 'staging-prepare site-a wp_s_aaa111' 2>&1)"; rc=$?
check "prepare new site -> created" has "$rc $out" "0 AW_PREPARE_OK state=created"
check "new site's config uses its own account" test "$(wpat $ROOT/site-a config get DB_USER)" = wp_s_aaa111
check "new site's account logs in" login_ok $ROOT/site-a
check "the new DB password is not on the gate's output" not has "$out" "$(wpat $ROOT/site-a config get DB_PASSWORD)"
out="$(gate 'staging-prepare site-a wp_s_aaa111' 2>&1)"; rc=$?
check "prepare again -> reused" has "$rc $out" "0 AW_PREPARE_OK state=reused"
check "account still logs in after reuse" login_ok $ROOT/site-a
proxy_blocks() { docker exec "$WP" grep -c AW_PROXY_HTTPS "$1/wp-config.php"; }
check "wp-config gets the proxy https block once, kept once on reuse" test "$(proxy_blocks $ROOT/site-a)" = 1

# --- staging-wp: the route's install shape (admin password via --prompt on stdin, never argv) ---
script='wpcli() { php -d memory_limit=256M /usr/local/bin/wp --path='"'$ROOT/site-a/'"' "$@"; }
printf "%s\n" '"'Adm1n pw\$(id)'"' | wpcli core install --url=http://site-a.test --title='"'T \$(touch /tmp/pwned)'"' --admin_user=admin --admin_email=a@x.invalid --skip-email --prompt=admin_password --quiet >/dev/null
echo "INSTALL_RC=$?"
wpcli eval '"'"'echo wp_check_password("Adm1n pw\$(id)", get_user_by("login","admin")->user_pass) ? "PW_OK" : "PW_BAD";'"'"'
wpcli option get blogname'
out="$(printf '%s' "$script" | gate 'staging-wp site-a' 2>&1)"; rc=$?
check "staging-wp runs the install script" has "$rc $out" "INSTALL_RC=0"
check "admin password arrives intact via --prompt" has "$out" "PW_OK"
check "title with \$(...) stays literal" has "$out" 'T $(touch /tmp/pwned)'
check "no command substitution executed" not docker exec "$WP" test -e /tmp/pwned
# Behind the https proxy WordPress must offer application passwords (the index lists them only when available).
rest_index() { docker exec "$WP" curl -s "$@" "http://localhost/staging/site-a/?rest_route=/"; }
check "proxied https request: application passwords available" has "$(rest_index -H 'X-Forwarded-Proto: https')" '"application-passwords"'
check "plain http request: still not offered (control)" not has "$(rest_index)" '"application-passwords"'
out="$(printf 'cat >/dev/null\necho AFTER_STDIN_READ\n' | gate 'staging-wp site-a' 2>&1)"
check "a stdin-reading command cannot swallow the script" has "$out" AFTER_STDIN_READ
out="$(head -c 1048600 /dev/zero | tr '\0' '#' | gate 'staging-wp site-a' 2>&1)"; rc=$?
check "script over 1 MiB refused (125)" test "$rc" = 125
out="$(printf 'echo X\n' | gate 'staging-wp no-such-site' 2>&1)"; rc=$?
check "staging-wp on a missing site refused (3)" test "$rc" = 3

# --- legacy site on the main account (the 7 sites on ks-aw-01 before 2026-09-24) -> migrated ---
docker exec "$WP" bash -c "mkdir -p $ROOT/site-b && cp -a $ROOT/site-a/. $ROOT/site-b/ && rm $ROOT/site-b/wp-config.php && chown -R www-data:www-data $ROOT/site-b"
printf "CREATE DATABASE wp_s_bbb222; GRANT ALL PRIVILEGES ON wp_s_bbb222.* TO 'wpuser'@'%%';\n" \
  | docker exec -i "$DB" sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -uroot'
wpat $ROOT/site-b config create --dbname=wp_s_bbb222 --dbuser=wpuser --dbpass=mainpw-test --dbhost=lobster-wordpress-db --quiet
wpat $ROOT/site-b core install --url=http://site-b.test --title=legacy-b --admin_user=admin --admin_password=x --admin_email=a@x.invalid --skip-email --quiet
out="$(gate 'staging-prepare site-b wp_s_bbb222' 2>&1)"; rc=$?
check "legacy site -> migrated" has "$rc $out" "0 AW_PREPARE_OK state=migrated"
check "migrated config uses its own account" test "$(wpat $ROOT/site-b config get DB_USER)" = wp_s_bbb222
check "migrated site keeps its data" test "$(wpat $ROOT/site-b option get blogname)" = legacy-b
check "migrated config holds no main password" not docker exec "$WP" grep -q mainpw-test $ROOT/site-b/wp-config.php
check "migrated legacy site gets the proxy https block" test "$(proxy_blocks $ROOT/site-b)" = 1

# --- guards ---
out="$(gate 'staging-prepare site-c wp_s_aaa111' 2>&1)"; rc=$?
check "a DB that belongs to another site is refused (3)" has "$rc $out" "3 aw-hosting-gate: DB wp_s_aaa111 already belongs"
out="$(gate 'staging-prepare site-d wp_main' 2>&1)"; rc=$?
check "the main site's DB is refused (3)" test "$rc" = 3
out="$(gate 'staging-prepare site-a wp_s_zzz999' 2>&1)"; rc=$?
check "an existing site with a different DB is refused (3)" test "$rc" = 3
for c in 'staging-wp ../x' 'staging-wp site-a;id' 'staging-prepare site-a wp_s_aaa111 x' 'staging-prepare  site-a wp_s_aaa111' 'id' ''; do
  out="$(printf 'touch /tmp/denied-ran\n' | gate "$c" 2>&1)"; rc=$?
  check "DENY: '$c'" test "$rc" = 126
done
check "denied commands executed nothing" not docker exec "$WP" test -e /tmp/denied-ran

# --- deprovision-staging.sh: tears down exactly what staging-prepare built (one site <-> one DB <-> one account) ---
# Supabase stubs (supabase-stub.py): sb-stub = no rows; sb-html = HTTP 200 with an HTML body; sb-org = a site
# with a wp_sites row, an org site_url and a vaulted admin credential; writes are logged (docker logs).
STUB_DIR="$(hostpath "$HERE")"
for m in stub:empty html:html org:org; do
  docker run -d --label aw-gate-test=1 --name "sb-${m%%:*}" --network aw-gate-test -e MODE="${m##*:}" \
    -v "$STUB_DIR:/s:ro" python:3-alpine python -u /s/supabase-stub.py >/dev/null
done
sleep 2
deprov() {  # <supabase url> <args...>: runs the real script as on ks-aw-01; prints its output, then ARCHIVES=<n>
  local sb="$1"; shift
  docker run --rm -i --label aw-gate-test=1 --network aw-gate-test -e DEPROVISION_ENV_FILE=/tmp/env \
    -v /var/run/docker.sock:/var/run/docker.sock -v "$GATE_DIR:/g:ro" aw-gate-test-runner bash -c \
    'printf "SUPABASE_URL=%s\nSUPABASE_SERVICE_ROLE_KEY=test\n" "$0" > /tmp/env; bash /g/deprovision-staging.sh "$@"; rc=$?;
     echo "ARCHIVES=$(ls /root/lobster-phase1/backups/deprovision/*.tar.gz 2>/dev/null | wc -l)"; exit $rc' "$sb" "$@"
}
sqlq() { printf '%s\n' "$1" | docker exec -i "$DB" sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -uroot --batch --skip-column-names'; }
SB=http://sb-stub:8080
out="$(deprov $SB --slug site-a 2>&1)"; rc=$?
check "deprovision dry run lists the site's own DB account" has "$rc $out" "db user  : wp_s_aaa111"
check "dry run changes nothing" docker exec "$WP" test -d $ROOT/site-a
out="$(deprov http://sb-stub:9 --slug site-a --apply --confirm site-a 2>&1)"; rc=$?
check "Supabase unreachable -> abort (3), not treated as 0 rows" test "$rc" = 3
check "...and nothing was deleted" docker exec "$WP" test -f $ROOT/site-a/wp-config.php
out="$(deprov http://sb-html:8080 --slug site-a --apply --confirm site-a 2>&1)"; rc=$?
check "Supabase HTTP 200 with a non-JSON body -> abort (3), not 0 rows (codex)" test "$rc" = 3
check "...and nothing was deleted" docker exec "$WP" test -f $ROOT/site-a/wp-config.php
out="$(deprov $SB --slug site-a --apply --confirm site-a 2>&1)"; rc=$?
check "deprovision apply succeeds with a backup archive" ok_archive "$rc" "$out"
check "site dir removed" not docker exec "$WP" test -e $ROOT/site-a
check "site DB dropped" test "$(sqlq "select count(*) from information_schema.schemata where schema_name='wp_s_aaa111';")" = 0
check "site DB account dropped" test "$(sqlq "select count(*) from mysql.user where user='wp_s_aaa111';")" = 0
sqlq "CREATE DATABASE wp_s_ccc333; CREATE USER 'wp_s_ccc333'@'%' IDENTIFIED BY 'x'; CREATE TABLE wp_s_ccc333.t (i int);" >/dev/null
out="$(deprov $SB --db wp_s_ccc333 --apply --confirm wp_s_ccc333 2>&1)"; rc=$?
check "--db orphan: backed up and dropped" ok_archive "$rc" "$out"
check "--db orphan: DB and same-name account gone" test "$(sqlq "select (select count(*) from information_schema.schemata where schema_name='wp_s_ccc333') + (select count(*) from mysql.user where user='wp_s_ccc333');")" = 0
out="$(deprov $SB --db wp_s_bbb222 --apply --confirm wp_s_bbb222 2>&1)"; rc=$?
check "--db refuses a DB a site still uses (2)" test "$rc" = 2
out="$(deprov $SB --db wp_main --apply --confirm wp_main 2>&1)"; rc=$?
check "--db refuses the main site's DB (2)" test "$rc" = 2
check "site-b untouched by the refusals" test "$(wpat $ROOT/site-b option get blogname)" = legacy-b
# Full Supabase path: vault secret -> credential row -> wp_sites row -> org site_url, then DB/account/dir.
out="$(deprov http://sb-org:8080 --slug site-b --apply --confirm site-b 2>&1)"; rc=$?
check "deprovision with row + org + vaulted credential succeeds" ok_archive "$rc" "$out"
w="$(docker logs sb-org 2>&1)"
check "vault secret deleted via rpc" has "$w" 'POST /rest/v1/rpc/secret_delete {"p_name": "client_cred:cc-1"}'
check "credential row deleted" has "$w" "DELETE /rest/v1/client_credentials?id=in.(cc-1)"
check "vault secret deleted before its row" test "$(printf '%s\n' "$w" | grep -n 'secret_delete' | cut -d: -f1)" -lt "$(printf '%s\n' "$w" | grep -n 'client_credentials' | cut -d: -f1)"
check "wp_sites row deleted" has "$w" "DELETE /rest/v1/wp_sites?url=eq.https%3A%2F%2Faware-wave.com%2Fstaging%2Fsite-b"
check "org site_url cleared, other keys kept" has "$w" 'PATCH /rest/v1/organizations?id=eq.org-1 {"metadata": {"client_config": {"brandColors": {"primary": "#123456"}}}}'
check "site-b dir, DB and own account gone" test "$(docker exec "$WP" test -e $ROOT/site-b && echo dir)$(sqlq "select count(*) from information_schema.schemata where schema_name='wp_s_bbb222';")$(sqlq "select count(*) from mysql.user where user='wp_s_bbb222';")" = 00

# --- the invariant behind the 2026-09-24 incident: nothing here may touch the main site's config ---
check "main site's wp-config.php unchanged by every case" test "$(main_sha)" = "$MAIN0"
check "main site still up on its own account" test "$(wpat /var/www/html option get blogname)" = main

echo "hosting-gate: $pass passed, $failed failed"
[[ "$failed" -eq 0 ]]
