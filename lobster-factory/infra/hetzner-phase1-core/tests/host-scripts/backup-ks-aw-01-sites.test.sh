#!/usr/bin/env bash
# SF-F acceptance: infra/ks-aw-01-backup/{backup,verify-backup}-ks-aw-01.sh back up and verify every client site in
# the registry sites.d (registry files rendered by templates/client-wp/render.sh, so the names cannot drift).
# docker is a PATH shim (argv logged; dumps and archives are small fakes); nothing touches a real container or R2.
# From the repo root:
#   bash lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/backup-ks-aw-01-sites.test.sh
# BASE=<older backup-ks-aw-01.sh> additionally diffs its output (no sites) line by line against the current script.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
BK="$(cd "$HERE/../../../ks-aw-01-backup" && pwd)"
pass=0; failed=0
check() { local d="$1"; shift; if "$@"; then echo "PASS $d"; pass=$((pass + 1)); else echo "FAIL $d"; failed=$((failed + 1)); fi; }
WORK="$(mktemp -d "${TMPDIR:-/tmp}/aw-sff.XXXXXX")"
[[ "${KEEP:-}" == 1 ]] || trap 'rm -rf -- "$WORK"' EXIT

mkdir -p "$WORK/bin"
cat >"$WORK/bin/docker" <<'SH'
#!/usr/bin/env bash
echo "$*" >>"$SHIM_LOG"
case "$1" in
  info) exit 0 ;;
  ps) printf '%s\n' $FAKE_CONTAINERS ;;
  volume) [[ " $FAKE_VOLUMES " == *" $3 "* ]] ;;
  exec)
    [[ -z "${SHIM_RM_ON_EXEC:-}" ]] || rm -f "$SHIM_RM_ON_EXEC"   # a site torn down while its dump runs
    printf -- '-- MariaDB dump\n'
    for i in $(seq 1 12); do printf 'CREATE TABLE `wp_t%s` (id int);\n' "$i"; done
    head -c 3000 /dev/urandom | base64
    printf -- '-- Dump completed on 2026-11-22\n' ;;
  run)
    host="" name=""
    for a in "$@"; do case "$a" in *:/backup) host="${a%:/backup}" ;; /backup/*) name="${a#/backup/}" ;; esac; done
    src="$(mktemp -d)"
    for i in $(seq 1 1000); do : >"$src/f$i"; done
    head -c 1100000 /dev/urandom >"$src/big"
    tar czf "$host/$name" -C "$src" . && rm -rf "$src" ;;
  *) exit 99 ;;
esac
SH
printf '#!/usr/bin/env bash\nexit 0\n' >"$WORK/bin/upload-ok"
chmod +x "$WORK/bin/docker" "$WORK/bin/upload-ok"

# shellcheck source=../../scripts/templates/client-wp/render.sh
source "$HERE/../../scripts/templates/client-wp/render.sh"
mksites() {  # <dir> <slug>...
  mkdir -p "$1"; local d="$1" s p=8100; shift
  for s in "$@"; do client_wp_render_registry "$s" "$s.example.org" "$((p++))" host-vhost 1 2026-01-01T00:00:00Z >"$d/$s.json"; done
}

# run <name> <script> <sites dir> [env...] -> $WORK/<name>.out (stdout+stderr), $WORK/<name>.rc, backups in $WORK/<name>.d
run() {
  local name="$1" script="$2" sites="$3"; shift 3
  mkdir -p "$WORK/$name.d"
  env PATH="$WORK/bin:$PATH" SHIM_LOG="$WORK/$name.argv" BACKUP_DIR="$WORK/$name.d" CLIENT_WP_REGISTRY_DIR="$sites" \
    EXPECT_SERVICES="soulful chatwoot" FAKE_CONTAINERS="soulful-db chatwoot-postgres a-db b-db" \
    FAKE_VOLUMES="soulful_wordpress_data chatwoot_chatwoot_storage a_wordpress_data b_wordpress_data" \
    MARIADB_ROOT_PASSWORD=leak-canary-7f3 R2_API_TOKEN= "$@" bash "$script" >"$WORK/$name.out" 2>&1
  echo $? >"$WORK/$name.rc"
}
# time stamps, the per-run backup dir and sizes vary between runs
norm() { sed -E "s/^\[[^]]*\] //; s#$WORK/[a-z0-9-]+\.d/[0-9-]+#OUT#g; s/\([0-9.,]+[KMG]?\)/(SIZE)/g" "$WORK/$1.out"; }
# lines of section 4b and the manifest count, which legitimately differ when sites.d has content
existing() { norm "$1" | grep -vE "sites\.d|site [a-z]|^  [a-z]-(db\.sql\.gz|wordpress\.tgz) OK|manifest.json written|registered-site"; }
rc() { cat "$WORK/$1.rc"; }

B="$BK/backup-ks-aw-01.sh"
run none "$B" "$WORK/no-such-dir"
mkdir -p "$WORK/empty"; run empty "$B" "$WORK/empty"
mkdir -p "$WORK/bad"; printf '{not json' >"$WORK/bad/broken.json"; run bad "$B" "$WORK/bad"
mksites "$WORK/two" a b; run two "$B" "$WORK/two"

if [[ -n "${BASE:-}" ]]; then
  run base "$BASE" "$WORK/no-such-dir"
  check "no sites.d: output line-identical to BASE" diff <(norm base) <(norm none)
  check "no sites.d: same exit code as BASE ($(rc base))" test "$(rc base)" = "$(rc none)"
fi
check "empty sites.d: output line-identical to no sites.d" diff <(norm none) <(norm empty)
check "bad registry: Soulful/Chatwoot lines identical to no sites.d" diff <(existing none) <(existing bad)
check "bad registry: refused by name, reason given" grep -q "registry $WORK/bad/broken.json refused: unreadable" "$WORK/bad.out"
check "bad registry: manifest counts it (errors=1)" grep -q '"errors":1' "$WORK"/bad.d/*/manifest.json
check "two sites: Soulful/Chatwoot lines identical to no sites.d" diff <(existing none) <(existing two)
for s in a b; do
  for f in "$s-db.sql.gz" "$s-wordpress.tgz"; do
    check "two sites: $f listed OK" grep -qx "  $f OK (SIZE)" <(norm two)
    check "two sites: $f written" test -s "$(echo "$WORK"/two.d/*/"$f")"
  done
done
check "two sites: dumped from <slug>-db, database wordpress" grep -q "^exec a-db sh -c .*--single-transaction wordpress" "$WORK/two.argv"
check "two sites: archived the <slug>_wordpress_data volume read-only" grep -q "^run --rm -v b_wordpress_data:/data:ro" "$WORK/two.argv"
check "two sites: manifest errors=0" grep -q '"errors":0' "$WORK"/two.d/*/manifest.json
check "password never expanded on the host (argv, log)" \
  bash -c '! grep -q leak-canary "$1" "$2" && grep -qF "\$MARIADB_ROOT_PASSWORD" "$2"' _ "$WORK/two.out" "$WORK/two.argv"

# a registered site that is down fails the run, but the other stores still reach R2
mksites "$WORK/down" a c
run down "$B" "$WORK/down" R2_API_TOKEN=test-only UPLOAD_TO_R2="$WORK/bin/upload-ok"
check "site down: ERROR names the container" grep -q "site c DB container 'c-db' registered in .* but NOT running" "$WORK/down.out"
check "site down: site a still backed up" grep -q "a-wordpress.tgz OK" "$WORK/down.out"
check "site down: other stores uploaded" grep -q "R2 upload OK" "$WORK/down.out"
check "site down: run exits 1" test "$(rc down)" = 1
run ok "$B" "$WORK/two" R2_API_TOKEN=test-only UPLOAD_TO_R2="$WORK/bin/upload-ok"
check "all good with uploader: exit 0" test "$(rc ok)" = 0

# ── verify ──────────────────────────────────────────────────────────────────────────────────────────────
V="$BK/verify-backup-ks-aw-01.sh"
vrun() {  # <name> <backup dir> <sites dir> [env...]
  env BACKUP_DIR="$2" CLIENT_WP_REGISTRY_DIR="$3" EXPECT_SERVICES= "${@:4}" bash "$V" >"$WORK/$1.out" 2>&1; echo $? >"$WORK/$1.rc"
}
mksites "$WORK/vs" a b
run vsrc "$B" "$WORK/vs" EXPECT_SERVICES= R2_API_TOKEN=test-only UPLOAD_TO_R2="$WORK/bin/upload-ok"
vrun v-ok "$WORK/vsrc.d" "$WORK/vs"
check "verify: both sites PASS" bash -c 'grep -q "PASSED" "$1" && [[ $(grep -c "OK: [ab]-" "$1") == 4 ]]' _ "$WORK/v-ok.out"
rm "$WORK"/vsrc.d/*/a-wordpress.tgz
vrun v-miss "$WORK/vsrc.d" "$WORK/vs"
check "verify: site taken out of the backup is reported" grep -q "FAIL: a-wordpress.tgz missing (site a registered" "$WORK/v-miss.out"
check "verify: and fails" test "$(rc v-miss)" = 1
mksites "$WORK/vnew" a b
rm -rf "$WORK/vsrc.d"; run vsrc "$B" "$WORK/vs" EXPECT_SERVICES= R2_API_TOKEN=test-only UPLOAD_TO_R2="$WORK/bin/upload-ok"
# registered a minute after the run started (within the 300 s clock allowance)
client_wp_render_registry n n.example.org 8150 host-vhost 0 "$(date -u -d '+60 seconds' +%Y-%m-%dT%H:%M:%SZ)" >"$WORK/vnew/n.json"
vrun v-new "$WORK/vsrc.d" "$WORK/vnew"
check "verify: site registered after the backup started is not due yet" \
  bash -c 'grep -q "site n registered .*, after this backup started" "$1" && grep -q PASSED "$1"' _ "$WORK/v-new.out"
client_wp_render_registry n n.example.org 8150 host-vhost 0 2099-01-01T00:00:00Z >"$WORK/vnew/n.json"
vrun v-future "$WORK/vsrc.d" "$WORK/vnew"
check "verify: created_at in the future is a failure, not a permanent exemption" \
  bash -c 'grep -q "site n: created_at .2099-01-01T00:00:00Z. is in the future" "$1" && grep -q FAILED "$1"' _ "$WORK/v-future.out"
if [[ -n "${BASE_VERIFY:-}" ]]; then
  vrun v-base-x "$WORK/vsrc.d" "$WORK/no-such-dir"; mv "$WORK/v-base-x.out" "$WORK/v-cur.out"
  env BACKUP_DIR="$WORK/vsrc.d" EXPECT_SERVICES= bash "$BASE_VERIFY" >"$WORK/v-base.out" 2>&1
  check "verify, no sites.d: output line-identical to BASE_VERIFY" diff <(norm v-base) <(norm v-cur)
fi

# ── SF-E2 #7: a registered site's .env (its DB passwords) goes into the encrypted bundle; never into a log ─────────
mksites "$WORK/e7" a b
mkdir -p "$WORK/sroot/a" "$WORK/sroot/b"
printf 'SITE_DB_PASSWORD=env-canary-91a\nSITE_DB_ROOT_PASSWORD=env-canary-91b\n' >"$WORK/sroot/a/.env"
printf 'SITE_DB_PASSWORD=env-canary-92a\n' >"$WORK/sroot/b/.env"
run e7 "$B" "$WORK/e7" EXPECT_SERVICES= CLIENT_WP_SITES_ROOT="$WORK/sroot" BACKUP_ENC_KEY=test-only-key R2_API_TOKEN=test-only UPLOAD_TO_R2="$WORK/bin/upload-ok"
E7="$(echo "$WORK"/e7.d/*)"; M7="${WORK#/}/sroot"
check "#7 both sites' .env listed in env.tar.gz.enc.members" bash -c 'm=$(sed "s#^/*##" "$2"); grep -qxF "$1/a/.env" <<<"$m" && grep -qxF "$1/b/.env" <<<"$m"' _ "$M7" "$E7/env.tar.gz.enc.members"
check "#7 bundle decrypts to the site's .env" bash -c 'openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:test-only-key -in "$1" | tar xzOf - "$2/a/.env" | grep -q env-canary-91a' _ "$E7/env.tar.gz.enc" "$M7"
check "#7 no password value in the log or the members list" bash -c '! grep -q env-canary "$1" "$2"' _ "$WORK/e7.out" "$E7/env.tar.gz.enc.members"
check "#7 run ok (exit 0, errors=0)" bash -c '[[ $(cat "$1") == 0 ]] && grep -q "\"errors\":0" "$2"' _ "$WORK/e7.rc" "$E7/manifest.json"
vrun v7 "$WORK/e7.d" "$WORK/e7" CLIENT_WP_SITES_ROOT="$WORK/sroot"
check "#7 verify: each site's .env found in the bundle -> PASSED" bash -c 'grep -q "env.tar.gz.enc holds /$2/a/.env" "$1" && grep -q PASSED "$1"' _ "$WORK/v7.out" "$M7"
sed -i "\#/sroot/b/.env#d" "$E7/env.tar.gz.enc.members"
vrun v7b "$WORK/e7.d" "$WORK/e7" CLIENT_WP_SITES_ROOT="$WORK/sroot"
check "#7 verify: a site's .env missing from the bundle -> FAILED" bash -c 'grep -q "does not hold /$2/b/.env" "$1" && grep -q FAILED "$1"' _ "$WORK/v7b.out" "$M7"

# a site's .env that vanishes mid-run is that site's failure: the run fails, the other site's .env and every store still upload
mkdir -p "$WORK/sroot9/a" "$WORK/sroot9/b"
printf 'SITE_DB_PASSWORD=env-canary-93a\n' >"$WORK/sroot9/a/.env"
printf 'SITE_DB_PASSWORD=env-canary-93b\n' >"$WORK/sroot9/b/.env"
run e9 "$B" "$WORK/e7" EXPECT_SERVICES= CLIENT_WP_SITES_ROOT="$WORK/sroot9" SHIM_RM_ON_EXEC="$WORK/sroot9/a/.env" BACKUP_ENC_KEY=test-only-key R2_API_TOKEN=test-only UPLOAD_TO_R2="$WORK/bin/upload-ok"
E9="$(echo "$WORK"/e9.d/*)"
check ".env gone mid-run: ERROR names the site file" grep -q "site .env .*/sroot9/a/.env gone or unreadable" "$WORK/e9.out"
check ".env gone mid-run: the other site's .env is in the bundle" bash -c 'sed "s#^/*##" "$2" | grep -qxF "$1/sroot9/b/.env"' _ "${WORK#/}" "$E9/env.tar.gz.enc.members"
check ".env gone mid-run: other stores uploaded" grep -q "R2 upload OK" "$WORK/e9.out"
check ".env gone mid-run: run exits 1" test "$(rc e9)" = 1

# ── SF-E2 #8: WordPress not installed yet (paused.<slug>-wp) -> 尚未安裝, not below-floor; floors back once removed ─
mksites "$WORK/e8" a
run e8 "$B" "$WORK/e8" EXPECT_SERVICES= R2_API_TOKEN=test-only UPLOAD_TO_R2="$WORK/bin/upload-ok"
E8="$(echo "$WORK"/e8.d/*)"
printf -- '-- MariaDB dump\n-- Dump completed on 2026-11-22\n' | gzip >"$E8/a-db.sql.gz"   # a fresh, empty WordPress DB
mkdir -p "$WORK/e8src" && : >"$WORK/e8src/index.php" && tar czf "$E8/a-wordpress.tgz" -C "$WORK/e8src" .
mkdir -p "$WORK/cron"; : >"$WORK/cron/paused.a-wp"
vrun v8 "$WORK/e8.d" "$WORK/e8" WP_CRON_STATE_DIR="$WORK/cron"
check "#8 paused site: marked 尚未安裝, no floor failure, PASSED" \
  bash -c 'grep -q "site a: 尚未安裝" "$1" && ! grep -q "below" "$1" && grep -q PASSED "$1"' _ "$WORK/v8.out"
rm "$E8/a-db.sql.gz"; vrun v8m "$WORK/e8.d" "$WORK/e8" WP_CRON_STATE_DIR="$WORK/cron"
check "#8 paused site with its dump missing still FAILS" bash -c 'grep -q "a-db.sql.gz missing" "$1" && grep -q FAILED "$1"' _ "$WORK/v8m.out"
printf -- '-- MariaDB dump\n-- Dump completed on 2026-11-22\n' | gzip >"$E8/a-db.sql.gz"; rm "$WORK/cron/paused.a-wp"
vrun v8u "$WORK/e8.d" "$WORK/e8" WP_CRON_STATE_DIR="$WORK/cron"
check "#8 flag removed: the floors apply again -> FAILED below floor" bash -c 'grep -q "below" "$1" && grep -q FAILED "$1"' _ "$WORK/v8u.out"
# the same flag also freezes an installed site (migration runbook): tables in the dump = installed -> floors apply
: >"$WORK/cron/paused.a-wp"
{ printf -- '-- MariaDB dump\n'; for i in $(seq 1 12); do printf 'CREATE TABLE `wp_t%s` (id int);\n' "$i"; done; printf -- '-- Dump completed\n'; } | gzip >"$E8/a-db.sql.gz"
vrun v8i "$WORK/e8.d" "$WORK/e8" WP_CRON_STATE_DIR="$WORK/cron"
check "#8 paused but installed (tables in the dump) -> no exemption, FAILED below floor" \
  bash -c '! grep -q "尚未安裝" "$1" && grep -q "below" "$1" && grep -q FAILED "$1"' _ "$WORK/v8i.out"

echo "== $pass passed, $failed failed =="
[[ $failed -eq 0 ]]
