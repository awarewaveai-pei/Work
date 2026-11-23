#!/usr/bin/env bash
# SF-E acceptance: the site-* verbs of scripts/aw-hosting-gate.sh, in a THROWAWAY alpine container (label
# aw-gsite-test=1) with the real gate, render.sh, flock, openssl and python3 (behind an argv-logging wrapper), and shims
# for docker, systemd-run, curl, logger and safe-infra-patch.sh (its own behaviour: safe-infra-patch-create.test.sh). Every shim logs its argv to
# /t/calls.log; the docker shim keeps container/volume/WordPress state under /t/state and copies any stdin it is given
# to /t/state/stdin.last (that is how the test sees the admin password arrive on stdin, never on an argv).
# From the repo root:
#   MSYS_NO_PATHCONV=1 bash lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/hosting-gate-site.test.sh
# GATE=<file> runs a mutated copy of the gate.
set -uo pipefail
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPTS="$(cd "$HERE/../../scripts" && pwd)"
GATE="${GATE:-$SCRIPTS/aw-hosting-gate.sh}"
C=aw-gsite-runner
pass=0; failed=0
check() { local d="$1"; shift; if "$@"; then echo "PASS $d"; pass=$((pass + 1)); else echo "FAIL $d"; failed=$((failed + 1)); fi; }
not() { ! "$@"; }
has() { [[ "$1" == *"$2"* ]]; }
teardown() { docker ps -aq --filter label=aw-gsite-test=1 | xargs -r docker rm -f >/dev/null 2>&1; true; }
teardown; [[ "${KEEP:-}" == 1 ]] || trap teardown EXIT

docker build -q -t aw-gsite-test-runner - >/dev/null <<'EOF' || { echo "runner build failed"; exit 2; }
FROM alpine:3.22
RUN apk add --no-cache bash coreutils util-linux grep sed python3 openssl findutils procps
EOF
docker run -d --label aw-gsite-test=1 --name "$C" aw-gsite-test-runner sleep 1800 >/dev/null
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
docker exec "$C" mkdir -p /g
docker cp "$(hostpath "$SCRIPTS/templates")" "$C:/g/templates" >/dev/null || { echo "copy failed"; exit 2; }
docker cp "$(hostpath "$GATE")" "$C:/g/aw-hosting-gate.sh" >/dev/null || { echo "copy failed"; exit 2; }
docker exec -i "$C" bash -c 'cat > /setup.sh && chmod +x /setup.sh' <<'SETUP'
#!/bin/bash
# /setup.sh: fresh host state (no site, switch on, a live cert for the test domains), empty logs, shims installed.
set -e
rm -rf /t /root/sites /etc/awarewave /var/lib/awarewave /var/lib/wp-cron-runner /run/lock/awarewave-sites /run/awarewave /etc/nginx /etc/letsencrypt
mkdir -p /t/state /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/default
: > /t/calls.log; : > /t/syslog
printf '# test drop-in\nAW_SITE_VERBS=on\n' > /etc/default/aw-hosting-gate.local; chmod 600 /etc/default/aw-hosting-gate.local
for d in one.example.org; do
  mkdir -p /etc/letsencrypt/live/$d
  openssl req -x509 -nodes -newkey rsa:2048 -days 30 -subj "/CN=$d" -addext "subjectAltName=DNS:$d,DNS:*.multi.example.org" \
    -keyout /etc/letsencrypt/live/$d/privkey.pem -out /etc/letsencrypt/live/$d/fullchain.pem 2>/dev/null
done
mkdir -p /etc/letsencrypt/live/expired.example.org
openssl req -x509 -nodes -newkey rsa:2048 -days 1 -subj "/CN=x" -addext "subjectAltName=DNS:expired.example.org" \
  -not_before 20190101000000Z -not_after 20200101000000Z -keyout /dev/null -out /etc/letsencrypt/live/expired.example.org/fullchain.pem 2>/dev/null

cat > /usr/local/bin/python3 <<'SH'
#!/bin/bash
if [ "$1" = -c ]; then echo "python3 -c <script> ${*:3}" >> /t/calls.log; else echo "python3 $*" >> /t/calls.log; fi
exec /usr/bin/python3 "$@"
SH
cat > /usr/local/bin/logger <<'SH'
#!/bin/bash
echo "logger $*" >> /t/syslog
SH
cat > /usr/local/bin/curl <<'SH'
#!/bin/bash
echo "curl $*" >> /t/calls.log
cat /t/state/http 2>/dev/null || printf 302
SH
# nginx -T: the live config as nginx prints it -- every file it loads after a "# configuration file <path>:" line.
cat > /usr/local/bin/nginx <<'SH'
#!/bin/bash
echo "nginx $*" >> /t/calls.log
[ "$1" = -T ] || exit 0
[ -f /t/state/fail.nginxT ] && { echo "nginx: [emerg] simulated" >&2; exit 1; }
for f in /etc/nginx/conf.d/*.conf /etc/nginx/sites-enabled/*; do [ -e "$f" ] && { echo "# configuration file $f:"; cat "$f"; echo; }; done
exit 0
SH
cat > /usr/local/bin/systemd-run <<'SH'
#!/bin/bash
echo "systemd-run $*" >> /t/calls.log
while [[ $# -gt 0 && "$1" != -- ]]; do shift; done; shift
setsid "$@" </dev/null >/dev/null 2>&1 &
SH
cat > /usr/local/bin/docker <<'SH'
#!/bin/bash
S=/t/state
echo "docker $*" >> /t/calls.log
case "$1" in
  image)  [ -f $S/image ]; exit ;;
  build)  touch $S/image; exit 0 ;;
  volume) v="${@: -1}"; [ -f "$S/vol.$v" ] || exit 1; cat "$S/vol.$v"; exit 0 ;;
  inspect)
    c="${@: -1}"; [ -f "$S/ct.$c" ] || exit 1
    case "$*" in *State.Running*) [ "$(cut -d'|' -f1 "$S/ct.$c")" = running ] && echo true || echo false ;; *) cat "$S/ct.$c" ;; esac
    exit 0 ;;
  exec) ;;
  *) exit 0 ;;
esac
shift; in=0
while [[ "$1" == -* ]]; do case "$1" in -i) in=1; shift ;; -u|-e|-w) shift 2 ;; *) shift ;; esac; done
c="$1"; shift
[ -f "$S/ct.$c" ] || { echo "Error: No such container: $c" >&2; exit 1; }
if [ "$1" = sh ]; then
  case "$3" in   # <slug>-db: the pre-plugins export / its restore (SF-E2 #5)
    *mariadb-dump*) [ -f $S/fail.dump ] && exit 1; printf -- '-- MariaDB dump
CREATE TABLE t (id int);
-- Dump completed on 2026-11-22
'; exit 0 ;;
    *"exec mariadb -uroot"*) cat > "$S/restored.$c"; exit 0 ;;
  esac
  [ $in = 1 ] && cat > $S/stdin.uc; exit 0   # mu-plugin write
fi
[ $in = 1 ] && cat > $S/stdin.last                 # wp-cli stdin = a secret the gate made
while [[ $# -gt 0 && "$1" != --path=* ]]; do shift; done; shift   # php -d ... /usr/local/bin/wp --path=...
w="$*"
[ -f "$S/fail.wp" ] && [[ "$w" == "$(cat $S/fail.wp)"* ]] && { echo "wp: simulated failure: $w" >&2; exit 1; }
case "$w" in
  "core is-installed") [ -f "$S/wp.$c.installed" ] ;;
  "core install "*)    touch "$S/wp.$c.installed"; for a; do case "$a" in --admin_user=*) echo "${a#*=}" > "$S/wp.$c.admin";; esac; done ;;
  # array options (aworacle_settings): JSON in $S/json.<container>.<option>; patch/pluck as wp-cli does them
  "option get "*)      [ -f "$S/json.$c.$3" ] && cat "$S/json.$c.$3" ;;
  "option add "*)      [ -f "$S/json.$c.$3" ] && exit 1; [ "$4" = '{}' ] || exit 1; echo '{}' > "$S/json.$c.$3" ;;
  "option pluck "*)    [ -f "$S/json.$c.$3" ] && /usr/bin/python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); sys.exit(1) if sys.argv[2] not in d else print(d[sys.argv[2]])' "$S/json.$c.$3" "$4" ;;
  "option patch "*)    [ -f "$S/json.$c.$4" ] && /usr/bin/python3 -c '
import json,sys
f,op,k,v=sys.argv[1:5]; d=json.load(open(f))
if (op=="update") != (k in d): sys.exit(1)
d[k]=v; json.dump(d,open(f,"w"))' "$S/json.$c.$4" "$3" "$5" "$6" ;;
  "option update "*)   echo "$4" > "$S/opt.$c.$3" ;;
  "language core is-installed"*|"theme is-installed"*) exit 1 ;;
  "user list"*)        echo 1 ;;
  "user get"*)         cat "$S/wp.$c.admin" ;;
  "plugin is-installed "*|"plugin is-active "*) [ -f "$S/plugin.$c.$3" ] ;;   # shim: installed = active
  "plugin get "*)      cat "$S/plugin.$c.$3" ;;
  "plugin install "*)  p="$3"; case "$p" in https://*) r="${p#https://github.com/*/}"; p="${r%%/*}" ;; esac   # release URL -> repo = slug
                       v="${3%/*}"; v="${v##*/}"; echo "${v#v}" > "$S/plugin.$c.$p" ;;   # file = installed version
  "eval"*)             echo created ;;
  *) exit 0 ;;
esac
SH
cat > /g/safe-infra-patch.sh <<'SH'
#!/bin/bash
S=/t/state
echo "safe-infra-patch $* REUSE=${SAFE_PATCH_REUSE_VOLUMES:-}" >> /t/calls.log
content="$(cat)"
[ -f $S/slow ] && sleep "$(cat $S/slow)"
case "$1" in
  compose-new)
    slug="$(basename "$(dirname "$2")")"
    [ -f "/var/lib/wp-cron-runner/paused.$slug-wp" ] && echo "PAUSED_AT_COMPOSE $slug" >> /t/calls.log
    [ -f $S/fail.compose ] && { echo "SAFE-PATCH FAILED (shim)" >&2; exit 1; }
    if [ -f "$S/vol.${slug}_db_data" ] && [ "${SAFE_PATCH_REUSE_VOLUMES:-}" != 1 ]; then echo "volumes exist" >&2; exit 1; fi
    [ -e "$2" ] && exit 1
    printf '%s\n' "$content" > "$2"
    echo "$slug" > "$S/vol.${slug}_wordpress_data"; echo "$slug" > "$S/vol.${slug}_db_data"
    echo 'running|healthy' > "$S/ct.$slug-wp"; echo 'running|healthy' > "$S/ct.$slug-db"
    echo "safe-infra-patch OK. Created: $2"; exit 0 ;;
  host-nginx-new)
    [ -f $S/fail.nginx ] && { echo "SAFE-PATCH FAILED (shim)" >&2; exit 1; }
    [ -e "$2" ] && exit 1
    printf '%s\n' "$content" > "$2"; ln -s "$2" "/etc/nginx/sites-enabled/$(basename "$2")"; exit 0 ;;
esac
exit 1
SH
chmod +x /usr/local/bin/* /g/safe-infra-patch.sh
SETUP

setup() { docker exec "$C" /setup.sh; }
in_c() { docker exec "$C" bash -c "$1"; }
# gate '<command>' [stdin text] -> $out (stdout), $err, $rc
gate() {
  local f; f="$(mktemp)"
  if [[ $# -ge 2 ]]; then
    out="$(printf '%s' "$2" | docker exec -i -e SSH_CLIENT="gsite 0 0" -e SSH_ORIGINAL_COMMAND="$1" "$C" bash /g/aw-hosting-gate.sh 2>"$f")"; rc=$?
  else
    out="$(docker exec -i -e SSH_CLIENT="gsite 0 0" -e SSH_ORIGINAL_COMMAND="$1" "$C" bash /g/aw-hosting-gate.sh </dev/null 2>"$f")"; rc=$?
  fi
  err="$(cat "$f")"; rm -f "$f"
}
jget() { python3 -c 'import json,sys; v=json.loads(sys.argv[1].strip().splitlines()[-1]); print(v.get(sys.argv[2], "") if not isinstance(v.get(sys.argv[2]), (dict, list)) else json.dumps(v[sys.argv[2]]))' "$1" "$2" 2>/dev/null; }
wait_job() {  # <job id> -> final state on stdout
  local s
  for _ in $(seq 60); do
    gate "site-job $1"; s="$(jget "$out" state)"
    [[ "$s" != running ]] && { echo "$s"; return; }
    sleep 0.5
  done
  echo timeout
}
calls() { in_c 'cat /t/calls.log'; }
reg() { in_c "cat /etc/awarewave/sites.d/$1.json"; }
no_docker_exec() { ! calls | grep -q '^docker exec'; }
D=one.example.org
REG=/etc/awarewave/sites.d

# ── switch (I6) and grammar in forced mode ───────────────────────────────────────────────────────────────────
setup; in_c 'rm /etc/default/aw-hosting-gate.local'
for c in "site-preflight s1 $D" "site-create s1 $D" "site-vhost s1" "site-job sj-20261122000000-0a1b2c3d" "site-wp s1 open"; do
  gate "$c"; check "switch file missing: '$c' -> 126" test "$rc" = 126
done
check "switch file missing: nothing ran (no docker, no systemd-run)" test -z "$(calls)"
gate "staging-wp s1" "echo hi"
check "switch file missing: staging-wp is not gated by it (reaches docker, exit 3, not 126)" test "$rc" = 3
setup; in_c "echo 'AW_SITE_VERBS=off' > /etc/default/aw-hosting-gate.local"; gate "site-preflight s1 $D"
check "switch AW_SITE_VERBS=off -> 126" test "$rc" = 126
setup; in_c "printf 'AW_SITE_VERBS=on\nAW_SITE_VERBS=off\n' > /etc/default/aw-hosting-gate.local"; gate "site-preflight s1 $D"
check "switch: a later AW_SITE_VERBS=off wins -> 126" test "$rc" = 126
setup; in_c 'chmod 666 /etc/default/aw-hosting-gate.local'; gate "site-preflight s1 $D"
check "switch file writable by others -> 126" test "$rc" = 126
setup; in_c "printf 'AW_SITE_VERBS=on; touch /tmp/sourced\n' > /etc/default/aw-hosting-gate.local"; gate "site-preflight s1 $D"
check "switch file is read, never sourced (a line with code -> 126, code not run)" bash -c "[[ $rc == 126 ]] && docker exec $C test ! -e /tmp/sourced"

setup
for c in "site-wp s1 bogus" "site-wp s1 eval" "site-wp s1 install" "site-wp s1 open now" "site-create s1 One.example.org" \
         "site-create s1 $D extra" "site-create s1  $D" "$(printf 'site-vhost\ts1')" "site-vhost ../x" "site-create s1 a..b.org" \
         "site-job sj-1" "site-wp s1 install $(printf 'a%.0s' {1..50})@example.org" "site-wp s1 plugins https://github.com/evil/x/releases/download/v1/x.zip" \
         "site-wp s1 plugins https://github.com/awarewaveai-pei/x/releases/download/../../x.zip"; do
  gate "$c"; check "DENY in forced mode: '$c'" test "$rc" = 126
done
check "denied commands ran nothing" test -z "$(calls)"
gate "site-wp s1 open" "touch /tmp/pwned"
check "site-wp with a stdin script -> 126" test "$rc" = 126
gate "site-preflight s1 $D" "x"
check "any site verb with stdin -> 126" test "$rc" = 126
check "stdin denials ran nothing" bash -c "[[ -z \"\$(docker exec $C cat /t/calls.log)\" ]] && docker exec $C test ! -e /tmp/pwned"

# ── preflight ───────────────────────────────────────────────────────────────────────────────────────────────
setup; gate "site-preflight s1 $D"
check "preflight exits 0 with JSON" test "$rc" = 0
check "preflight: fresh slug -> create_plan new" test "$(jget "$out" create_plan)" = new
check "preflight: live cert covering the domain listed" has "$(jget "$out" certs)" "/etc/letsencrypt/live/$D"
gate "site-preflight s1 a.multi.example.org"
check "preflight: wildcard SAN covers one label" has "$(jget "$out" certs)" "/etc/letsencrypt/live/$D"
gate "site-preflight s1 a.b.multi.example.org"
check "preflight: wildcard SAN does not cover two labels" test "$(jget "$out" certs)" = "[]"
gate "site-preflight s1 expired.example.org"
check "preflight: expired cert (SAN matches) not listed" bash -c "docker exec $C test -s /etc/letsencrypt/live/expired.example.org/fullchain.pem && [[ '$(jget "$out" certs)' == '[]' ]]"
in_c "printf 'server {\n  server_name www.x.org $D; # owner\n}\n' > /etc/nginx/sites-available/other.conf && ln -s /etc/nginx/sites-available/other.conf /etc/nginx/sites-enabled/other.conf"
gate "site-preflight s1 $D"
check "preflight: another enabled vhost serving the domain is reported" has "$(jget "$out" vhost_occupants)" "sites-enabled/other.conf"
check "preflight ran nothing that changes state" bash -c "! docker exec $C grep -qE '^(safe-infra-patch|systemd-run|docker (build|exec))' /t/calls.log"

# ── site-create: new ───────────────────────────────────────────────────────────────────────────────────────
setup; gate "site-create s1 $D"
JOB="$(jget "$out" job)"
check "site-create answers a job id at once" bash -c "[[ $rc == 0 && '$JOB' =~ ^sj-[0-9]{14}-[0-9a-f]{8}\$ ]]"
check "site-create job succeeds" test "$(wait_job "$JOB")" = succeeded
gate "site-job $JOB"; check "site-job JSON has state + detail" has "$out" '"detail"'
r="$(reg s1)"
check "registry written: port 8100, ingress host-vhost, vhost_file null" \
  bash -c 'grep -q "\"port\": 8100," <<<"$1" && grep -q "\"ingress\": \"host-vhost\"" <<<"$1" && grep -q "\"vhost_file\": null" <<<"$1"' _ "$r"
check "registry round-trips through render.sh's validator" in_c 'source /g/templates/client-wp/render.sh && client_wp_read_registry s1 >/dev/null'
check "compose-new got the rendered compose for s1-wp, no volume reuse" bash -c "docker exec $C grep -qx 'safe-infra-patch compose-new /root/sites/s1/docker-compose.yml s1-wp REUSE=' /t/calls.log"
check "image built before compose-new (contract 2)" bash -c "l=\$(docker exec $C cat /t/calls.log); b=\$(grep -n '^docker build' <<<\"\$l\" | cut -d: -f1); c=\$(grep -n '^safe-infra-patch compose-new' <<<\"\$l\" | cut -d: -f1); [[ -n \$b && \$b -lt \$c ]]"
check ".env created 0600 with hex passwords (contract 3)" in_c 'test "$(stat -c %a /root/sites/s1/.env)" = 600 && grep -qE "^SITE_DB_PASSWORD=[0-9a-f]{48}$" /root/sites/s1/.env'
check "wp-cron-runner paused before compose-new (contract 3b)" bash -c "docker exec $C grep -qx 'PAUSED_AT_COMPOSE s1' /t/calls.log"
check "...and still paused after create (only install removes it)" in_c 'test -f /var/lib/wp-cron-runner/paused.s1-wp'
check "the job ran under systemd-run (not in the SSH session)" bash -c "docker exec $C grep -q '^systemd-run --unit=aw-site-$JOB' /t/calls.log"
envhex="$(in_c 'sed -n "s/^SITE_DB_PASSWORD=//p" /root/sites/s1/.env')"
check "DB password absent from job files, syslog and registry" \
  bash -c "! docker exec $C grep -rqF '$envhex' /var/lib/awarewave/site-jobs /t/syslog $REG"
gate "site-job sj-20261122000000-0a1b2c3d"
check "site-job on an unknown job -> exit 3" test "$rc" = 3
in_c ': > /t/calls.log'; gate "site-create s1 $D"
check "site-create again -> reused, no second compose-new" \
  bash -c "[[ \$(echo '$(wait_job "$(jget "$out" job)")') == succeeded ]] && ! docker exec $C grep -q '^safe-infra-patch' /t/calls.log"
gate "site-preflight s1 $D"
check "preflight on a created site -> create_plan reused, registry shown" \
  bash -c "[[ '$(jget "$out" create_plan)' == reused ]] && grep -q 8100 <<<'$(jget "$out" registry)'"
gate "site-create s2 $D"
check "a domain already registered by another slug -> job fails, nothing created" \
  bash -c "[[ '$(wait_job "$(jget "$out" job)")' == failed ]] && docker exec $C test ! -e $REG/s2.json"

setup; in_c "echo AW_SITE_MAX=1 >> /etc/default/aw-hosting-gate.local"; gate "site-create s1 $D"; wait_job "$(jget "$out" job)" >/dev/null
in_c ': > /t/calls.log'; gate "site-create s2 two.example.org"
check "AW_SITE_MAX=1 with one site registered -> next site-create refused (3), no job started" \
  bash -c "[[ $rc == 3 ]] && grep -q 'site limit' <<<'$err' && ! docker exec $C grep -q '^systemd-run' /t/calls.log"
gate "site-create s1 $D"
check "...while re-running the registered site is still allowed" test "$(wait_job "$(jget "$out" job)")" = succeeded

# ── volumes: the four cases of contract 4 ───────────────────────────────────────────────────────────────────
setup; in_c 'touch /t/state/fail.compose'; gate "site-create s3 $D"
check "compose-new failing -> job failed" test "$(wait_job "$(jget "$out" job)")" = failed
check "failed create: no registry, .env kept, wp-cron-runner still paused" \
  in_c "test ! -e $REG/s3.json && test -f /root/sites/s3/.env && test -f /var/lib/wp-cron-runner/paused.s3-wp"
gate "site-job $(jget "$out" job)"; check "failed job detail says how to retry" has "$(jget "$out" detail)" "site-create again"
in_c 'rm /t/state/fail.compose; echo s3 > /t/state/vol.s3_wordpress_data; echo s3 > /t/state/vol.s3_db_data; : > /t/calls.log'
gate "site-create s3 $D"
check "failed-create remnant (labelled volumes + .env) -> retry succeeds" test "$(wait_job "$(jget "$out" job)")" = succeeded
check "...with SAFE_PATCH_REUSE_VOLUMES=1" bash -c "docker exec $C grep -q '^safe-infra-patch compose-new .* REUSE=1$' /t/calls.log"
setup; in_c 'mkdir -p /root/sites/s4 && echo SITE_DB_PASSWORD=x > /root/sites/s4/.env && printf "registry=/x\n" > /root/sites/s4/DEPROVISIONED && echo s4 > /t/state/vol.s4_wordpress_data && echo s4 > /t/state/vol.s4_db_data'
gate "site-create s4 $D"; j="$(jget "$out" job)"
check "DEPROVISIONED marker -> job failed, no compose-new" \
  bash -c "[[ '$(wait_job "$j")' == failed ]] && ! docker exec $C grep -q '^safe-infra-patch' /t/calls.log"
gate "site-job $j"
check "...detail names both ways out (purge, or delete the marker)" \
  bash -c 'grep -q -- "--purge-volumes" <<<"$1" && grep -q "delete /root/sites/s4/DEPROVISIONED" <<<"$1"' _ "$(jget "$out" detail)"
setup; in_c 'mkdir -p /root/sites/s5 && echo SITE_DB_PASSWORD=x > /root/sites/s5/.env && echo other > /t/state/vol.s5_wordpress_data && echo other > /t/state/vol.s5_db_data'
gate "site-create s5 $D"
check "volumes labelled for another project -> failed, no compose-new" \
  bash -c "[[ '$(wait_job "$(jget "$out" job)")' == failed ]] && ! docker exec $C grep -q '^safe-infra-patch' /t/calls.log"
setup; in_c 'echo s6 > /t/state/vol.s6_wordpress_data && echo s6 > /t/state/vol.s6_db_data'
gate "site-create s6 $D"
check "labelled volumes but no .env -> failed (not ours), no compose-new, no .env made" \
  bash -c "[[ '$(wait_job "$(jget "$out" job)")' == failed ]] && ! docker exec $C grep -q '^safe-infra-patch' /t/calls.log && docker exec $C test ! -e /root/sites/s6/.env"

# ── locks: two site-create on one slug ──────────────────────────────────────────────────────────────────────
setup; in_c 'echo 4 > /t/state/slow'
gate "site-create s7 $D"; j1="$(jget "$out" job)"
for _ in $(seq 40); do in_c 'grep -q "^safe-infra-patch compose-new" /t/calls.log' && break; sleep 0.25; done
gate "site-create s7 $D"
check "second site-create while the first holds the slug lock -> refused at once (3)" bash -c "[[ $rc == 3 ]] && grep -q 'another create' <<<'$err'"
check "first job still succeeds" test "$(wait_job "$j1")" = succeeded
# The launcher's check races a job that has not taken the lock yet; the job-level lock closes that window.
setup; in_c 'echo 3 > /t/state/slow; mkdir -p -m 700 /var/lib/awarewave/site-jobs
  for j in sj-20261122000000-00000001 sj-20261122000000-00000002; do
    printf "{\"job\":\"%s\",\"verb\":\"site-create\",\"slug\":\"s8\",\"domain\":\"one.example.org\",\"ingress\":\"host-vhost\",\"state\":\"queued\"}" $j > /var/lib/awarewave/site-jobs/$j.json
  done
  bash /g/aw-hosting-gate.sh --job-run sj-20261122000000-00000001 & bash /g/aw-hosting-gate.sh --job-run sj-20261122000000-00000002; wait'
s1="$(in_c 'python3 -c "import json;print(json.load(open(\"/var/lib/awarewave/site-jobs/sj-20261122000000-00000001.json\"))[\"state\"])"')"
s2="$(in_c 'python3 -c "import json;print(json.load(open(\"/var/lib/awarewave/site-jobs/sj-20261122000000-00000002.json\"))[\"state\"])"')"
check "two create jobs for one slug at once: exactly one succeeds, one compose-new" \
  bash -c "[[ '$s1 $s2' == 'succeeded failed' || '$s1 $s2' == 'failed succeeded' ]] && [[ \$(docker exec $C grep -c '^safe-infra-patch compose-new' /t/calls.log) == 1 ]]"
in_c 'printf "{\"job\":\"sj-20261122000000-00000009\",\"verb\":\"site-create\",\"state\":\"running\",\"step\":\"compose-new\",\"pid\":\"999999\"}" > /var/lib/awarewave/site-jobs/sj-20261122000000-00000009.json'
gate "site-job sj-20261122000000-00000009"
check "job whose process is gone -> reported failed (not running forever)" test "$(jget "$out" state)" = failed

# ── site-vhost ─────────────────────────────────────────────────────────────────────────────────────────────
setup; gate "site-create s1 $D"; wait_job "$(jget "$out" job)" >/dev/null
in_c ': > /t/calls.log'; gate "site-vhost s1"
check "site-vhost before site-wp install -> blocked (3), no vhost created (install.php must never be public)" \
  bash -c "[[ $rc == 3 ]] && grep -q 'not installed' <<<'$err' && ! docker exec $C grep -q '^safe-infra-patch' /t/calls.log"
in_c 'touch /t/state/wp.s1-wp.installed'
in_c 'touch /t/state/fail.nginx'; gate "site-vhost s1"
check "host-nginx-new failing -> exit 3" test "$rc" = 3
check "...registry keeps vhost_file null (SF-D C1)" bash -c "grep -q '\"vhost_file\": null' <<<'$(reg s1)'"
in_c 'rm /t/state/fail.nginx; : > /t/calls.log'; gate "site-vhost s1"
check "site-vhost succeeds" bash -c "[[ $rc == 0 && '$(jget "$out" state)' == created ]]"
check "registry now records this site's vhost file" bash -c "grep -q '\"vhost_file\": \"/etc/nginx/sites-available/$D.conf\"' <<<'$(reg s1)'"
check "host-nginx-new probed the REST index (the under-construction page is 503)" \
  bash -c "docker exec $C grep -qx 'safe-infra-patch host-nginx-new /etc/nginx/sites-available/$D.conf $D/wp-json/ REUSE=' /t/calls.log"
check "vhost uses the live cert covering the domain and sets the visitor address itself" \
  in_c "grep -q 'ssl_certificate     /etc/letsencrypt/live/$D/fullchain.pem;' /etc/nginx/sites-available/$D.conf && grep -c 'real_ip_header    CF-Connecting-IP;' /etc/nginx/sites-available/$D.conf | grep -qx 2"
gate "site-vhost s1"; check "site-vhost again -> reused" test "$(jget "$out" state)" = reused
setup; gate "site-create s1 $D"; wait_job "$(jget "$out" job)" >/dev/null; in_c 'touch /t/state/wp.s1-wp.installed'
in_c "printf 'server { server_name $D; }\n' > /etc/nginx/sites-available/other.conf && ln -s /etc/nginx/sites-available/other.conf /etc/nginx/sites-enabled/other.conf; : > /t/calls.log"
gate "site-vhost s1"
check "domain served by another enabled file -> blocked (3), no safe-infra-patch" \
  bash -c "[[ $rc == 3 ]] && grep -q 'other.conf' <<<'$err' && ! docker exec $C grep -q '^safe-infra-patch' /t/calls.log"
setup; gate "site-create s9 nocert.example.org"; wait_job "$(jget "$out" job)" >/dev/null; in_c 'touch /t/state/wp.s9-wp.installed'; gate "site-vhost s9"
check "no live cert covering the domain -> blocked (3)" bash -c "[[ $rc == 3 ]] && grep -q 'no unexpired certificate' <<<'$err'"
setup; in_c "echo 'AW_SITE_GATEWAY_SLUGS=s10' >> /etc/default/aw-hosting-gate.local"   # SF-E2 #2: host allow-list
gate "site-create s10 $D product-gateway"; wait_job "$(jget "$out" job)" >/dev/null
check "ingress=product-gateway: compose joins lobster-net" in_c 'grep -q "lobster-net" /root/sites/s10/docker-compose.yml'
gate "site-vhost s10"; check "ingress=product-gateway: site-vhost refused (3)" test "$rc" = 3

# ── site-wp ────────────────────────────────────────────────────────────────────────────────────────────────
setup; gate "site-create s1 $D"; wait_job "$(jget "$out" job)" >/dev/null
in_c 'echo "theme install" > /t/state/fail.wp'; gate "site-wp s1 install owner@example.org"
check "install failing after core install -> exit 3, wp-cron-runner still paused" \
  bash -c "[[ $rc == 3 ]] && docker exec $C test -f /var/lib/wp-cron-runner/paused.s1-wp"
setup; gate "site-create s1 $D"; wait_job "$(jget "$out" job)" >/dev/null; in_c ': > /t/calls.log'
gate "site-wp s1 install owner@example.org zh_TW"
PW="$(jget "$out" admin_password)"
check "install -> installed, admin = operator email, password returned once" \
  bash -c "[[ $rc == 0 && '$(jget "$out" state)' == installed && '$(jget "$out" admin_user)' == owner@example.org && ${#PW} -ge 20 ]]"
check "password reached wp-cli on stdin" test "$(in_c 'head -1 /t/state/stdin.last')" = "$PW"
check "password on no argv, in no syslog line, job file or registry" \
  bash -c "! docker exec $C grep -rqF -- '$PW' /t/calls.log /t/syslog /var/lib/awarewave /etc/awarewave"
check "fresh install starts under construction (blog_public 0)" in_c 'test "$(cat /t/state/opt.s1-wp.aw_under_construction)" = 1 && test "$(cat /t/state/opt.s1-wp.blog_public)" = 0'
check "install removed the wp-cron-runner pause (contract 3b)" in_c 'test ! -e /var/lib/wp-cron-runner/paused.s1-wp'
check "container came from the registry: every wp call went to s1-wp" bash -c "! docker exec $C grep '^docker exec' /t/calls.log | grep -v ' s1-wp ' | grep -q ."
gate "site-wp s1 install owner@example.org"
check "install again -> reused, no password" bash -c "[[ '$(jget "$out" state)' == reused && -z '$(jget "$out" admin_password)' ]]"
gate "site-wp s1 open"; check "open -> blog_public 1, construction off" in_c 'test "$(cat /t/state/opt.s1-wp.blog_public)" = 1 && test "$(cat /t/state/opt.s1-wp.aw_under_construction)" = 0'
gate "site-wp s1 plugins mainwp-child https://github.com/awarewaveai-pei/aware-wave-wp-bridge/releases/download/v0.20.0/aware-wave-wp-bridge.zip"
check "plugins: WordPress.org slug + own release URL installed" bash -c "[[ $rc == 0 ]] && docker exec $C test -f /t/state/plugin.s1-wp.mainwp-child && docker exec $C test -f /t/state/plugin.s1-wp.aware-wave-wp-bridge"
gate "site-wp s1 set-mainwp-id 0123456789abcdef0123456789abcdef"; check "set-mainwp-id ok" test "$rc" = 0
# set-oracle-engine-url (SF-H item 5): one key of aworacle_settings, through option patch; the plugin must be active
OJ=/t/state/json.s1-wp.aworacle_settings
in_c ': > /t/calls.log'; gate "site-wp s1 set-oracle-engine-url http://oracle-web:3000"
check "oracle-engine-url without the oracle plugin -> 3, said so, option untouched" \
  bash -c "[[ $rc == 3 ]] && grep -q 'aware-wave-oracle is not active' <<<'$err' && ! docker exec $C test -e $OJ"
in_c "touch /t/state/plugin.s1-wp.aware-wave-oracle; echo '{\"embed\": \"same-origin\", \"key_id\": \"k1\"}' > $OJ"
gate "site-wp s1 set-oracle-engine-url http://oracle-web:3000"
check "oracle-engine-url writes server_engine_url, keeps every other key, answers the value read back" \
  bash -c "[[ $rc == 0 && '$(jget "$out" server_engine_url)' == http://oracle-web:3000 ]] && docker exec $C python3 -c 'import json; d=json.load(open(\"$OJ\")); assert d == {\"embed\": \"same-origin\", \"key_id\": \"k1\", \"server_engine_url\": \"http://oracle-web:3000\"}, d'"
gate "site-wp s1 set-oracle-engine-url https://engine.example.com:8443"
check "oracle-engine-url again replaces the one key" \
  bash -c "[[ $rc == 0 ]] && docker exec $C python3 -c 'import json; d=json.load(open(\"$OJ\")); assert d[\"server_engine_url\"] == \"https://engine.example.com:8443\" and d[\"key_id\"] == \"k1\" and len(d) == 3, d'"
in_c "rm $OJ"; gate "site-wp s1 set-oracle-engine-url http://oracle-web:3000"
check "oracle-engine-url on a site whose plugin never saved settings creates the option with that one key" \
  bash -c "[[ $rc == 0 ]] && docker exec $C python3 -c 'import json; assert json.load(open(\"$OJ\")) == {\"server_engine_url\": \"http://oracle-web:3000\"}'"
for v in "http://oracle-web:3000/" "http://x/path" "http://Oracle:3000" "http://u:p@oracle" "http://oracle?x=1" "ftp://oracle" "http://a b"; do
  in_c ': > /t/calls.log'; gate "site-wp s1 set-oracle-engine-url $v"
  check "oracle-engine-url '$v' -> DENY 126, nothing exec'd" bash -c "[[ $rc == 126 ]]" && check "...no docker exec ('$v')" no_docker_exec
done
in_c 'mv /etc/default/aw-hosting-gate.local /t/switch.bak'; gate "site-wp s1 set-oracle-engine-url http://oracle-web:3000"
check "oracle-engine-url with the host switch file missing -> 126" test "$rc" = 126
in_c 'mv /t/switch.bak /etc/default/aw-hosting-gate.local'
gate "site-wp s1 put-bridge-pubkey aw-next-admin-1 $(printf 'A%.0s' {1..43})= write"
check "put-bridge-pubkey ok" bash -c "[[ $rc == 0 && '$(jget "$out" state)' == created ]]"
in_c ': > /t/calls.log'; gate "site-wp s1 reset-admin-password"; PW2="$(jget "$out" admin_password)"
check "reset-admin-password returns a new password once, via stdin only" \
  bash -c "[[ $rc == 0 && ${#PW2} -ge 20 && '$PW2' != '$PW' ]] && [[ \"\$(docker exec $C head -1 /t/state/stdin.last)\" == '$PW2' ]] && ! docker exec $C grep -rqF -- '$PW2' /t/calls.log /t/syslog /var/lib/awarewave /etc/awarewave"
in_c ': > /t/calls.log'; gate "site-wp nosite open"
check "site-wp without a registry -> 3, no docker exec" bash -c "[[ $rc == 3 ]]" && check "...no docker exec" no_docker_exec
in_c "sed -i 's/\"s1-wp\"/\"soulful-wp\"/' $REG/s1.json; : > /t/calls.log"; gate "site-wp s1 open"
check "registry naming another container -> 3, nothing exec'd in it" bash -c "[[ $rc == 3 ]] && ! docker exec $C grep -q soulful-wp /t/calls.log"

# ── SF-E2 host hardening (one block per invariant of briefs/WP-SF-E2-host-hardening.md) ──────────────────────
LD=/run/awarewave/site-locks
created() { setup; gate "site-create s1 $D"; wait_job "$(jget "$out" job)" >/dev/null; }

# #1 lock dir: root-owned, not group/world-writable; otherwise refused, never reused.
created
check "#1 lock dir created root-only (0700, uid 0) under /run, not /run/lock" in_c "test \"\$(stat -c '%u %a' $LD)\" = '0 700'"
in_c "chmod 777 $LD; : > /t/calls.log"; gate "site-wp s1 open"
check "#1 lock dir world-writable -> site-wp refused (3), nothing exec'd" bash -c "[[ $rc == 3 ]] && grep -q 'root-owned' <<<'$err'" && check "#1 ...no docker exec" no_docker_exec
gate "site-create s2 two.example.org"
check "#1 lock dir world-writable -> site-create refused at once (3), no job" \
  bash -c "[[ $rc == 3 ]] && ! docker exec $C grep -q '^systemd-run' /t/calls.log"
in_c "chmod 700 $LD && chown 65534 $LD"; gate "site-vhost s1"
check "#1 lock dir owned by another user -> site-vhost refused (3)" bash -c "[[ $rc == 3 ]] && grep -q 'uid 65534' <<<'$err'"
in_c "rm -rf $LD && ln -s /tmp $LD"; gate "site-wp s1 open"
check "#1 lock dir replaced by a symlink -> refused (3)" bash -c "[[ $rc == 3 ]] && grep -q 'not a plain directory' <<<'$err'"
in_c "rm -f $LD && mkdir -m 700 $LD"; gate "site-wp s1 open"
check "#1 compliant lock dir again -> site-wp works" test "$rc" = 0

# #2 product-gateway (container on lobster-net) only for slugs the host lists.
setup; gate "site-create s10 $D product-gateway"
check "#2 product-gateway for a slug not in AW_SITE_GATEWAY_SLUGS -> 126, no job" \
  bash -c "[[ $rc == 126 ]] && ! docker exec $C grep -q '^systemd-run' /t/calls.log"
in_c "echo 'AW_SITE_GATEWAY_SLUGS=other s10' >> /etc/default/aw-hosting-gate.local"; gate "site-create s10 $D product-gateway"
check "#2 listed slug -> created on lobster-net" \
  bash -c "[[ '$(wait_job "$(jget "$out" job)")' == succeeded ]] && docker exec $C grep -q lobster-net /root/sites/s10/docker-compose.yml"
in_c "printf 'AW_SITE_VERBS=on\nAW_SITE_GATEWAY_SLUGS=s10\nAW_SITE_GATEWAY_SLUGS=\n' > /etc/default/aw-hosting-gate.local"; gate "site-create s11 $D product-gateway"
check "#2 a later empty AW_SITE_GATEWAY_SLUGS= wins -> 126" test "$rc" = 126
in_c "printf 'AW_SITE_VERBS=on\nAW_SITE_GATEWAY_SLUGS=s10 # soulful later\n' > /etc/default/aw-hosting-gate.local"; gate "site-create soulful $D product-gateway"
check "#2 a non-slug token in the list (comment) voids the whole list -> 126, even for listed-looking words" test "$rc" = 126
setup; in_c 'mkdir -p -m 700 /var/lib/awarewave/site-jobs
  printf "{\"job\":\"sj-20261122000000-0000000a\",\"verb\":\"site-create\",\"slug\":\"s12\",\"domain\":\"one.example.org\",\"ingress\":\"product-gateway\",\"state\":\"queued\"}" > /var/lib/awarewave/site-jobs/sj-20261122000000-0000000a.json
  bash /g/aw-hosting-gate.sh --job-run sj-20261122000000-0000000a'
check "#2 job file asking product-gateway for an unlisted slug -> job failed, no compose-new" \
  bash -c "docker exec $C grep -q '\"state\": \"failed\"' /var/lib/awarewave/site-jobs/sj-20261122000000-0000000a.json && ! docker exec $C grep -q '^safe-infra-patch' /t/calls.log"

# #3 domain occupancy = server_name of the config nginx actually loads (nginx -T), not only sites-enabled.
setup; in_c "mkdir -p /etc/nginx/conf.d && printf 'server {\n  server_name $D;\n}\n' > /etc/nginx/conf.d/legacy.conf"
gate "site-preflight s1 $D"
check "#3 preflight: a server_name in conf.d (outside sites-enabled) is reported" has "$(jget "$out" vhost_occupants)" "/etc/nginx/conf.d/legacy.conf"
gate "site-create s1 $D"; wait_job "$(jget "$out" job)" >/dev/null; in_c 'touch /t/state/wp.s1-wp.installed; : > /t/calls.log'
gate "site-vhost s1"
check "#3 site-vhost blocked (3) by the conf.d server, no safe-infra-patch" \
  bash -c "[[ $rc == 3 ]] && grep -q 'legacy.conf' <<<'$err' && ! docker exec $C grep -q '^safe-infra-patch' /t/calls.log"
in_c 'rm /etc/nginx/conf.d/legacy.conf; touch /t/state/fail.nginxT'; gate "site-preflight s1 $D"
check "#3 nginx -T failing: preflight says unknown (null + error), never 'free'" \
  bash -c '[[ $1 == 0 && $(tail -1 <<<"$2") == *"\"vhost_occupants\": null,"* && -n $3 ]]' _ "$rc" "$out" "$(jget "$out" vhost_occupants_error)"
gate "site-vhost s1"
check "#3 nginx -T failing: site-vhost blocked (3), no safe-infra-patch" \
  bash -c "[[ $rc == 3 ]] && grep -q 'cannot read the live nginx config' <<<'$err' && ! docker exec $C grep -q '^safe-infra-patch' /t/calls.log"

# #4 own plugin release: never replaced by the same or an older version; a newer one upgrades.
REL=https://github.com/awarewaveai-pei/aware-wave-wp-bridge/releases/download
pver() { in_c 'cat /t/state/plugin.s1-wp.aware-wave-wp-bridge'; }
installs() { in_c 'grep -c " plugin install " /t/calls.log' 2>/dev/null; }
created; gate "site-wp s1 plugins $REL/v0.20.0/aware-wave-wp-bridge-v0.20.0.zip"
check "#4 first install: no --force" bash -c "[[ $rc == 0 && '$(pver)' == 0.20.0 ]] && ! docker exec $C grep -q 'plugin install .*--force' /t/calls.log"
in_c ': > /t/calls.log'; gate "site-wp s1 plugins $REL/v0.19.0/aware-wave-wp-bridge-v0.19.0.zip"
check "#4 older release -> no-op (no install), 0.20.0 kept and reported" \
  bash -c "[[ $rc == 0 && '$(pver)' == 0.20.0 && '$(installs)' == 0 ]] && grep -q 'aware-wave-wp-bridge@0.20.0' <<<'$(jget "$out" kept)'"
gate "site-wp s1 plugins $REL/v0.20.0/aware-wave-wp-bridge-v0.20.0.zip"
check "#4 same release again -> no-op" bash -c "[[ $rc == 0 && '$(installs)' == 0 ]]"
gate "site-wp s1 plugins $REL/v0.21.0/aware-wave-wp-bridge-v0.21.0.zip"
check "#4 newer release -> upgraded" bash -c "[[ $rc == 0 && '$(pver)' == 0.21.0 && '$(installs)' == 1 ]]"
in_c ': > /t/calls.log'; gate "site-wp s1 plugins $REL/latest/aware-wave-wp-bridge-latest.zip"
check "#4 tag that is not v<version> -> refused by the grammar (126), no export, nothing installed"   bash -c "[[ $rc == 126 && -z \"\$(docker exec $C cat /t/calls.log)\" && '$(pver)' == 0.21.0 ]]"
in_c 'echo 0.22.0-beta > /t/state/plugin.s1-wp.aware-wave-wp-bridge; : > /t/calls.log'; gate "site-wp s1 plugins $REL/v0.22.0/aware-wave-wp-bridge-v0.22.0.zip"
check "#4 installed pre-release is not compared -> refused (3), not replaced, DB untouched"   bash -c "[[ $rc == 3 && '$(installs)' == 0 ]] && grep -q 'not plain numbers' <<<'$err' && grep -q 'database not touched' <<<'$err'"

# #5 plugins: DB export first (site dir, 0600, latest only); a failed step restores it.
EXP=/root/sites/s1/pre-plugins.sql.gz
created; gate "site-wp s1 plugins mainwp-child"
check "#5 export written before the install: site dir, 0600, a complete dump from s1-db" \
  bash -c "[[ $rc == 0 ]] && docker exec $C sh -c 'test \"\$(stat -c %a $EXP)\" = 600 && zcat $EXP | grep -q \"Dump completed\"' \
    && l=\$(docker exec $C cat /t/calls.log) && d=\$(grep -n '^docker exec s1-db sh -c MYSQL_PWD=.* mariadb-dump' <<<\"\$l\" | head -1 | cut -d: -f1) \
    && i=\$(grep -n ' plugin install mainwp-child' <<<\"\$l\" | head -1 | cut -d: -f1) && [[ -n \$d && -n \$i && \$d -lt \$i ]]"
gate "site-wp s1 plugins mainwp-child"
check "#5 only the latest export is kept" test "$(in_c 'ls /root/sites/s1 | grep -c pre-plugins')" = 1
check "#5 root password stays in the DB container (MYSQL_PWD from its env; no -p on any mariadb argv)" \
  bash -c "docker exec $C grep -qF 'MYSQL_PWD=\"\$MARIADB_ROOT_PASSWORD\" exec mariadb-dump -uroot' /t/calls.log && ! docker exec $C grep -q 'mariadb.* -p' /t/calls.log"
in_c 'echo "plugin install" > /t/state/fail.wp; rm -f /t/state/restored.s1-db'; gate "site-wp s1 plugins newplugin"
check "#5 plugin failing -> exit 3, export restored into s1-db, said so" \
  bash -c "[[ $rc == 3 ]] && grep -q 'database restored' <<<'$err' && docker exec $C sh -c 'zcat $EXP | cmp - /t/state/restored.s1-db'"
in_c 'rm /t/state/fail.wp; touch /t/state/fail.dump; : > /t/calls.log'; gate "site-wp s1 plugins newplugin"
check "#5 export failing -> exit 3, nothing installed, previous export kept" \
  bash -c "[[ $rc == 3 ]] && grep -q 'nothing installed' <<<'$err' && [[ '$(installs)' == 0 ]] && docker exec $C sh -c 'zcat $EXP | grep -q \"Dump completed\"'"

# #6 one slug: every changing verb is exclusive; read-only verbs take no lock.
created; in_c 'touch /t/state/wp.s1-wp.installed'
docker exec -d "$C" flock $LD/s1.lock sleep 20
for _ in $(seq 40); do in_c "! flock -n $LD/s1.lock true" && break; sleep 0.1; done
in_c ': > /t/calls.log'
for c in "site-wp s1 open" "site-wp s1 plugins mainwp-child" "site-wp s1 install owner@example.org" "site-wp s1 reset-admin-password" "site-wp s1 set-oracle-engine-url http://oracle-web:3000" "site-vhost s1"; do
  gate "$c"; check "#6 '$c' while another run holds the s1 lock -> refused (3)" bash -c "[[ $rc == 3 ]] && grep -q 'another create' <<<'$err'"
done
check "#6 ...and none of them exec'd anything" no_docker_exec
gate "site-preflight s1 $D"; check "#6 site-preflight is not blocked by the lock" test "$rc" = 0
gate "site-create s1 $D"; check "#6 site-create on the locked slug refused at once (3)" test "$rc" = 3

echo "---"
echo "hosting-gate site verbs: $pass passed, $failed failed"
[[ "$failed" == 0 ]]
