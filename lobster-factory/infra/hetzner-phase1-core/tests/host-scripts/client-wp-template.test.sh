#!/usr/bin/env bash
# SF-D acceptance: scripts/templates/client-wp (render.sh + compose/vhost templates) and scripts/deprovision-site.sh.
#   compose: rendered with sample values, checked by the local `docker compose config`;
#   vhost:   `nginx -t` in a THROWAWAY nginx:alpine (label aw-cwpt-test=1), self-signed cert generated under $TMPDIR;
#   deprovision-site.sh: in a THROWAWAY python:3.12-slim with docker/nginx/systemctl shims that log every argv.
# From the repo root:
#   MSYS_NO_PATHCONV=1 bash lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/client-wp-template.test.sh
set -uo pipefail
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPTS="$(cd "$HERE/../../scripts" && pwd)"
N=aw-cwpt-nginx; C=aw-cwpt-deprovision
pass=0; failed=0
check() { local d="$1"; shift; if "$@"; then echo "PASS $d"; pass=$((pass + 1)); else echo "FAIL $d"; failed=$((failed + 1)); fi; }
WORK="$(mktemp -d "${TMPDIR:-/tmp}/aw-cwpt.XXXXXX")"
teardown() { docker ps -aq --filter label=aw-cwpt-test=1 | xargs -r docker rm -f >/dev/null 2>&1; rm -rf -- "$WORK"; true; }
[[ "${KEEP:-}" == 1 ]] || trap teardown EXIT
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }

# shellcheck source=../../scripts/templates/client-wp/render.sh
source "$SCRIPTS/templates/client-wp/render.sh"
S=sfdtest; D=sfd-test.example.org; P=8150
rejects() { local out rc; out="$("$@" 2>/dev/null)"; rc=$?; [[ $rc -ne 0 && -z "$out" ]]; }
# Every domain-shaped token in a file, minus the sample domain (file names like cf-only.conf have no such TLD).
other_domains() { grep -oiE '[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|app|dev|tw|co|me|ai|xyz|info|site)\b' "$1" | grep -vxF "$D" | sort -u; }

# ── compose ────────────────────────────────────────────────────────────────────────────────────────────────
for shp in 0 1; do
  mkdir -p "$WORK/c$shp"
  printf 'SITE_DB_PASSWORD=test-only-a\nSITE_DB_ROOT_PASSWORD=test-only-b\n' >"$WORK/c$shp/.env"
  client_wp_render_compose "$S" "$D" "$P" "$shp" >"$WORK/c$shp/docker-compose.yml"
  check "compose same_host_products=$shp renders" test $? = 0
  check "compose same_host_products=$shp: docker compose config passes" \
    docker compose -f "$(hostpath "$WORK/c$shp/docker-compose.yml")" config --quiet
done
mkdir -p "$WORK/n"; cp "$WORK/c0/.env" "$WORK/n/.env"
client_wp_render_compose 123 "$D" "$P" 0 >"$WORK/n/docker-compose.yml"
check "numeric slug 123: docker compose config passes (project name stays a string)" \
  docker compose -f "$(hostpath "$WORK/n/docker-compose.yml")" config --quiet
cfg="$(docker compose -f "$(hostpath "$WORK/c0/docker-compose.yml")" config 2>/dev/null)"
check "rendered compose defines DISABLE_WP_CRON (wp-cron-runner discovery)" grep -qF "define('DISABLE_WP_CRON', true);" <<<"$cfg"
check "rendered compose: WordPress waits for a healthy database" grep -qx '        condition: service_healthy' <<<"$cfg"
check "rendered compose names no domain but the sample" test -z "$(other_domains "$WORK/c0/docker-compose.yml")"
d="$(diff "$WORK/c0/docker-compose.yml" "$WORK/c1/docker-compose.yml" | grep '^[<>]')"
check "same_host_products on/off differ only in the lobster-net network lines" \
  bash -c '[[ -n "$1" ]] && ! grep -q "^<" <<<"$1" && ! grep -vE "lobster-net|external: true" <<<"$1"' _ "$d"
check "compose template holds no secret value (every password is \${...} from .env)" \
  test -z "$(grep -E 'PASSWORD:' "$SCRIPTS/templates/client-wp/docker-compose.yml.tmpl" | grep -vE ': \$\{SITE_DB_(ROOT_)?PASSWORD:\?')"

for bad in Bad -x a_b "" "$(printf 'a%.0s' {1..41})"; do check "slug '$bad' refused" rejects client_wp_render_compose "$bad" "$D" "$P" 0; done
long="$(printf 'a%.0s' {1..62})"; long="$long.$long.$long.$long.com"   # 255 chars, every label legal
for bad in Example.org a..b.org "x.com;" -a.org a.org/x localhost "$long"; do
  check "domain '${bad:0:30}' refused" rejects client_wp_render_compose "$S" "$bad" "$P" 0
done
for bad in 80 8099 8200 "81 0"; do check "port '$bad' refused" rejects client_wp_render_compose "$S" "$D" "$bad" 0; done
check "same_host_products '2' refused" rejects client_wp_render_compose "$S" "$D" "$P" 2
for bad in relative/dir "/etc/x/../y" "/etc/x y" '/etc/x;y'; do check "cert dir '$bad' refused" rejects client_wp_render_vhost "$S" "$D" "$P" "$bad"; done

# ── vhost: nginx -t in nginx:alpine ───────────────────────────────────────────────────────────────────────
mkdir -p "$WORK/v/certs"
openssl req -x509 -nodes -newkey rsa:2048 -days 1 -subj "/CN=$D" \
  -keyout "$(hostpath "$WORK/v/certs/privkey.pem")" -out "$(hostpath "$WORK/v/certs/fullchain.pem")" >/dev/null 2>&1
client_wp_render_vhost "$S" "$D" "$P" /work/certs >"$WORK/v/site.conf"
check "vhost renders" test $? = 0
check "vhost names no domain but the sample" test -z "$(other_domains "$WORK/v/site.conf")"
docker rm -f "$N" >/dev/null 2>&1
docker run -d --label aw-cwpt-test=1 --name "$N" -v "$(hostpath "$WORK/v"):/work:ro" nginx:alpine >/dev/null
nt="$(docker exec "$N" sh -c '
  mkdir -p /etc/nginx/snippets /etc/letsencrypt
  printf "allow 127.0.0.1;\ndeny all;\n" > /etc/nginx/snippets/cf-only.conf
  printf "ssl_protocols TLSv1.2 TLSv1.3;\n" > /etc/letsencrypt/options-ssl-nginx.conf
  rm -f /etc/nginx/conf.d/default.conf && cp /work/site.conf /etc/nginx/conf.d/site.conf && nginx -t 2>&1')"
rc=$?; check "vhost: nginx -t passes in nginx:alpine" test "$rc" = 0; [[ "$rc" == 0 ]] || echo "$nt"

# ── deprovision-site.sh with shims ────────────────────────────────────────────────────────────────────────
docker rm -f "$C" >/dev/null 2>&1
docker run -d --label aw-cwpt-test=1 --name "$C" -v "$(hostpath "$SCRIPTS"):/s:ro" python:3.12-slim sleep 900 >/dev/null
docker exec -i "$C" bash -c 'mkdir -p /shim && cat > /fixture.sh && chmod +x /fixture.sh' <<'EOF'
#!/bin/bash
# /fixture.sh [host-vhost|product-gateway] [vhost_live 0|1]: fresh site -- registry, this site's rendered vhost
# (enabled when live), compose file, .env, "running" containers of project sfdtest, empty call log.
set -e
export CLIENT_WP_SITES_ROOT=/t/sites CLIENT_WP_NGINX_DIR=/t/nginx   # = the paths dep() passes; the registry derives from them
rm -rf /t; mkdir -p /t/sites.d /t/sites/sfdtest /t/nginx/sites-available /t/nginx/sites-enabled
source /s/templates/client-wp/render.sh
ingress="${1:-host-vhost}"; live="${2:-1}"
client_wp_render_registry sfdtest sfd-test.example.org 8150 "$ingress" "$live" 2026-11-22T00:00:00Z > /t/sites.d/sfdtest.json
if [ "$ingress" = host-vhost ] && [ "$live" = 1 ]; then
  client_wp_render_vhost sfdtest sfd-test.example.org 8150 /etc/letsencrypt/live/x > /t/nginx/sites-available/sfd-test.example.org.conf
  ln -s /t/nginx/sites-available/sfd-test.example.org.conf /t/nginx/sites-enabled/sfd-test.example.org.conf
fi
echo 'name: sfdtest' > /t/sites/sfdtest/docker-compose.yml
echo 'SITE_DB_PASSWORD=x' > /t/sites/sfdtest/.env
echo /t/sites/sfdtest > /t/workdir; touch /t/containers.up; : > /t/calls.log
for b in docker nginx systemctl; do printf '#!/bin/sh\necho "%s $*" >> /t/calls.log\n' "$b" > /shim/$b; done
cat >> /shim/docker <<'SH'
case "$1 $2" in
  "ps -aq") [ -f /t/containers.up ] && echo c0ffee; exit 0 ;;
  "inspect -f") cat /t/workdir; exit 0 ;;
  "volume inspect") [ "$3" = -f ] && echo sfdtest; exit 0 ;;
esac
case " $* " in *" down "*) rm -f /t/containers.up ;; esac
exit 0
SH
printf '[ -f /t/nginx.fail ] && exit 1\nexit 0\n' >> /shim/nginx; printf 'exit 0\n' >> /shim/systemctl
chmod +x /shim/*
EOF
dep() {  # <args...> -> $out, $rc
  out="$(docker exec -e PATH=/shim:/usr/local/bin:/usr/bin:/bin -e CLIENT_WP_SITES_ROOT=/t/sites -e CLIENT_WP_REGISTRY_DIR=/t/sites.d \
    -e CLIENT_WP_NGINX_DIR=/t/nginx -e CLIENT_WP_LOCK_DIR=/t/lock -e DEPROVISION_ARCHIVE_DIR=/t/archive \
    "$C" bash /s/deprovision-site.sh "$@" 2>&1)"; rc=$?
}
fixture() { docker exec "$C" /fixture.sh "$@"; }
calls() { docker exec "$C" cat /t/calls.log; }
in_c() { docker exec "$C" sh -c "$1"; }
MUTATING='^docker (compose|rm|stop|kill|volume rm|network rm)|^systemctl|^nginx -s'
no_mutation() { ! calls | grep -qE "$MUTATING"; }
no_nginx() { ! calls | grep -qE '^(nginx|systemctl)'; }
no_volume_rm() { ! calls | grep -q '^docker volume rm'; }
LINK=/t/nginx/sites-enabled/sfd-test.example.org.conf; VH=/t/nginx/sites-available/sfd-test.example.org.conf
untouched() { in_c "test -L $LINK && test -f /t/sites.d/sfdtest.json && test -f /t/sites/sfdtest/docker-compose.yml"; }
purged_both() { [[ "$(calls | grep '^docker volume rm' | sort | tr '\n' ' ')" == "docker volume rm sfdtest_db_data docker volume rm sfdtest_wordpress_data " ]]; }
FULL=(--slug "$S" --apply --confirm "$S"); PURGE=(--purge-volumes --confirm-purge "$S")
export C MUTATING LINK; export -f calls in_c no_mutation no_nginx no_volume_rm untouched purged_both

fixture; dep --slug "$S"
check "dry run exits 0" test "$rc" = 0
check "dry run lists the four layers" bash -c 'for l in "1 vhost" "2 containers" "3 volume" "4 registry"; do grep -qF "$l" <<<"$1" || exit 1; done' _ "$out"
check "dry run calls nothing that changes state" no_mutation
check "dry run leaves link, registry and compose file" untouched

fixture; dep --slug "$S" --apply
check "--apply without --confirm refused (exit 2), nothing changed" bash -c '[[ $1 == 2 ]] && no_mutation && untouched' _ "$rc"
fixture; dep --slug "$S" --apply --confirm other
check "--apply with a wrong --confirm refused (exit 2)" test "$rc" = 2
fixture; dep "${FULL[@]}" --confirm-purge "$S"
check "--confirm-purge without --purge-volumes refused (exit 2)" test "$rc" = 2

fixture; in_c 'rm /t/sites.d/sfdtest.json /t/sites/sfdtest/.env'; dep "${FULL[@]}"
check "no registry, no marker, no .env -> refused (exit 2), nothing called" bash -c '[[ $1 == 2 ]] && no_mutation' _ "$rc"

fixture; in_c "sed -i 's/\"sfdtest-db\"/\"soulful-db\"/' /t/sites.d/sfdtest.json"; dep "${FULL[@]}"
check "registry value differing from the derived one -> refused (exit 2), nothing called" bash -c '[[ $1 == 2 ]] && no_mutation && untouched' _ "$rc"

fixture; dep "${FULL[@]}" --purge-volumes
check "--purge-volumes without --confirm-purge refused (exit 2), no volume command, nothing changed" \
  bash -c '[[ $1 == 2 ]] && no_volume_rm && no_mutation && untouched' _ "$rc"

# C1: the vhost path is recorded but the file there belongs to another site (other slug in its header).
fixture; in_c "sed -i '1s/client WordPress site sfdtest\\./client WordPress site othersite./' $VH"; dep "${FULL[@]}"
check "vhost of another site at the recorded path -> exit 3, link kept, no nginx call, nothing else changed" \
  bash -c '[[ $1 == 3 ]] && no_nginx && no_mutation && untouched' _ "$rc"
# C1: container created, vhost step never ran (domain served by someone else's file) -> registry records no vhost.
fixture host-vhost 0; in_c "echo 'server {}' > $VH && ln -s $VH $LINK"; dep "${FULL[@]}"
check "registry without a vhost: another file serving the domain stays linked, no nginx call" \
  bash -c '[[ $1 == 0 ]] && no_nginx && test "$(in_c "readlink $LINK")" = '"$VH" _ "$rc"
fixture; in_c "rm $LINK && ln -s /t/nginx/sites-available/other.conf $LINK"; dep "${FULL[@]}"
check "sites-enabled link pointing elsewhere -> exit 3, link left as is" \
  bash -c '[[ $1 == 3 ]] && test "$(in_c "readlink $LINK")" = /t/nginx/sites-available/other.conf && no_mutation' _ "$rc"
fixture; in_c 'touch /t/nginx.fail'; dep "${FULL[@]}"
check "nginx -t failing after the link removal -> exit 3, link restored, no reload, no down" \
  bash -c '[[ $1 == 3 ]] && untouched && no_mutation' _ "$rc"
fixture; in_c 'echo /root/elsewhere > /t/workdir'; dep "${FULL[@]}"
check "project container started from another dir -> exit 3, no compose down" \
  bash -c '[[ $1 == 3 ]] && ! calls | grep -q "^docker compose"' _ "$rc"
fixture product-gateway 0; dep "${FULL[@]}"
check "ingress=product-gateway: exit 0 and no nginx/systemctl call" bash -c '[[ $1 == 0 ]] && no_nginx' _ "$rc"

fixture; dep "${FULL[@]}"
log="$(calls)"; down="$(grep -E '^docker compose .*down' <<<"$log")"
check "apply exits 0" test "$rc" = 0 || echo "$out"
check "apply runs compose down" test -n "$down"
check "compose down has no -v/--volumes" bash -c '! grep -qE "(^| )(-v|--volumes)( |$)" <<<"$1"' _ "$down"
check "nginx -t runs before the reload" bash -c 'a=$(grep -n "^nginx -t" <<<"$1" | head -1 | cut -d: -f1); b=$(grep -n "^systemctl reload nginx" <<<"$1" | head -1 | cut -d: -f1); [[ -n $a && -n $b && $a -lt $b ]]' _ "$log"
check "default apply: no volume command" no_volume_rm
check "default apply: link, vhost, registry, compose file gone; .env and marker kept" in_c "
  ! test -e $LINK && ! test -e $VH && ! test -e /t/sites.d/sfdtest.json && ! test -e /t/sites/sfdtest/docker-compose.yml &&
  test -f /t/sites/sfdtest/.env && grep -q '^registry=/t/archive/sfdtest-' /t/sites/sfdtest/DEPROVISIONED"
in_c ': > /t/calls.log'; dep "${FULL[@]}" "${PURGE[@]}"
check "after a default teardown: purge via the archived registry deletes both volumes, .env and marker" \
  bash -c '[[ $1 == 0 ]] && purged_both && in_c "! test -e /t/sites/sfdtest"' _ "$rc"

fixture; dep "${FULL[@]}" "${PURGE[@]}"
check "purge with --confirm-purge deletes exactly the two registered volumes" bash -c '[[ $1 == 0 ]] && purged_both' _ "$rc"

# M1: compose-new failed and was rolled back (no registry, no containers, compose file gone); .env + volumes remain.
fixture; in_c 'rm /t/sites.d/sfdtest.json /t/sites/sfdtest/docker-compose.yml /t/containers.up'; dep "${FULL[@]}"
check "failed-create remnant without --purge-volumes -> refused (exit 2)" test "$rc" = 2
dep "${FULL[@]}" "${PURGE[@]}"
check "failed-create remnant with --purge-volumes: both volumes and .env removed" \
  bash -c '[[ $1 == 0 ]] && purged_both && in_c "! test -e /t/sites/sfdtest/.env"' _ "$rc"

echo "---"
echo "client-wp template + deprovision-site: $pass passed, $failed failed"
[[ "$failed" == 0 ]]
