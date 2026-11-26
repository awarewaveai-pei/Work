#!/bin/bash
# aw-hosting-gate.sh -- SSH forced command for next-admin's hosting-bridge key (root on this host).
#
# root authorized_keys, one line:
#   restrict,from="172.16.0.0/12",command="/usr/bin/env -u BASH_ENV -u ENV /root/lobster-phase1/scripts/aw-hosting-gate.sh" ssh-ed25519 AAAA... aw-hosting@next-admin
# Installed by sync-host-scripts.sh (sg-deploy step 1.8). Callers: apps/next-admin/app/api/internal/hosting/provision-staging/route.ts
# (staging-*), apps/next-admin/lib/site-flow/gate-client.ts (site-*).
# Contract test: apps/next-admin/lib/hosting/__tests__/hosting-gate-contract.test.ts. Behaviour: tests/host-scripts/hosting-gate.test.sh
# (staging-*), tests/host-scripts/hosting-gate-site.test.sh (site-*).
# BASH_ENV/ENV exposure: same analysis and wrapper as aw-autorepair-gate.sh (header there).
#
# Verbs (SSH_ORIGINAL_COMMAND, single spaces, nothing else; anything else exits 126):
#   staging-prepare <slug> <db>   dir + DB + DB account named <db> + wp core + wp-config. Idempotent.
#                                 Existing site on the main WP account -> migrated to its own account.
#   staging-wp <slug>             stdin (<= 1 MiB) = bash script, run as www-data in lobster-wordpress.
#   --- client sites (SITE-FLOW-COMPLETION-PLAN.md §1-3); refused with 126 unless the host switch is on ---
#   site-preflight <slug> <domain>               read-only JSON: vhosts serving the domain, live certs covering it,
#                                                containers, volumes, registry, what site-create would do
#   site-create <slug> <domain> [host-vhost|product-gateway]   background job (systemd-run) -> {"job":"sj-..."}
#   site-job <job>                               {"state":"running|succeeded|failed","detail":...}
#   site-vhost <slug>                            nginx vhost for the registered domain (host-nginx-new)
#   site-wp <slug> <sub-verb> [args]             fixed WordPress actions, see WP_SUBVERBS below; no script, no stdin
# Authority the site-* verbs add: create one client site (containers, .env, registry) and its vhost through
# safe-infra-patch.sh, and run the fixed wp actions coded here in that site's container. Never: a caller-chosen
# container, path, port or file; caller text as code; tear-down (deprovision-site.sh is host-only, SITE-FLOW I5).
# Names, ports, volumes and paths come from templates/client-wp/render.sh (derived from the slug) or the registry it
# validates. Its "caller contract" 1-5 is implemented here (look for "contract N").
#
# Host switch (SITE-FLOW I6): /etc/default/aw-hosting-gate.local, root-owned, not group/world-writable, containing the
# line AW_SITE_VERBS=on. Missing/other -> every site-* verb exits 126. This script reaches the host on every merge to
# main (sync-host-scripts.sh), so the switch is what keeps a merged-but-unapproved verb off. The file is read, never sourced.
# Same file: AW_SITE_MAX=<n> (site cap) and AW_SITE_GATEWAY_SLUGS=<slug> <slug> (the only slugs site-create may give
# ingress=product-gateway, i.e. a container on the shared lobster-net; missing = none).
#
# Output contract (gate-client.ts): exit 0 = done, 126 = not allowed, other = failed (reason on stderr); stdout's last
# line is one JSON object. Secrets (admin passwords) appear only on that one stdout line: never on an argv, in syslog,
# in a job file, or in the registry.
#
# Invariant: one staging site <-> one DB <-> one DB account (deprovision-staging.sh drops both).
#
# Modes: (no args) forced command | --check  grammar only, ALLOW/DENY, exit 0/126, never executes
#        --list  print the grammar | --job-run <job>  the background half of site-create (systemd-run starts it)
set -u
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

WP_CT=lobster-wordpress
DB_CT=lobster-wordpress-db
ROOT=/var/www/html/staging
SLUG_RE='^[a-z0-9][a-z0-9-]{0,39}$'
DB_RE='^wp_[a-z0-9_]{1,60}$'
MAX_SCRIPT=1048576

# client sites
SELF="$(realpath "$0")"; HERE="$(dirname "$SELF")"
SITE_SWITCH=/etc/default/aw-hosting-gate.local
JOB_DIR=/var/lib/awarewave/site-jobs
CRON_STATE=/var/lib/wp-cron-runner          # = wp-cron-runner.sh STATE_DIR
LE_LIVE=/etc/letsencrypt/live
DOMAIN_RE='^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'   # = render.sh CLIENT_WP_DOMAIN_RE (+ length <= 253)
JOB_RE='^sj-[0-9]{14}-[0-9a-f]{8}$'
EMAIL_RE='^[a-z0-9._%+-]{1,64}@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
LOCALE_RE='^[a-z]{2,3}(_[A-Z]{2})?$'
PLUGIN_SLUG_RE='^[a-z0-9][a-z0-9-]{0,62}$'
# Own plugins: release assets of the company's GitHub org only (SITE-FLOW §1-3); next-admin narrows it to catalog repos.
RELEASE_RE='^https://github\.com/awarewaveai-pei/[A-Za-z0-9][A-Za-z0-9._-]{0,99}/releases/download/[A-Za-z0-9][A-Za-z0-9._+-]{0,99}/[A-Za-z0-9][A-Za-z0-9._+-]{0,99}\.zip$'
RELEASE_TAG_RE='/releases/download/v[0-9]+(\.[0-9]+){0,3}/'   # tag = v<plugin version>: the no-downgrade compare needs it
# Own plugins whose release repo is private cannot be downloaded from here (GitHub answers 404 without a token, and
# this host holds none). The host keeps the release files itself: <RELEASE_MIRROR>/<repo>/<tag>/<asset>.zip, root-only,
# put there by scripts/release-wp-bridge.sh. A release URL whose file is in the mirror is installed from that file;
# one that is not is downloaded as before (public repos).
RELEASE_MIRROR=/var/lib/awarewave/plugin-releases
MAINWP_RE='^[0-9a-f]{32,128}$'
KEYID_RE='^[A-Za-z0-9][A-Za-z0-9_-]{0,190}$'   # wp-bridge AdminPage.php generateKey, minus a leading -
PUBKEY_RE='^[A-Za-z0-9+/]{43}=$'               # base64 of a 32-byte Ed25519 public key
# aware-wave-oracle "Engine URL (server)": scheme + lowercase host + optional port; no path, query, user or trailing /.
ENGINE_URL_RE='^https?://[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:[0-9]{2,5})?$'
ORACLE_PLUGIN=aware-wave-oracle                # its settings option: aworacle_settings (plugin Settings/Options.php)
WP_SUBVERBS="install plugins open close set-mainwp-id put-bridge-pubkey reset-admin-password set-oracle-engine-url"
MAX_SITE_CMD=4096
WP_PATH=/var/www/html                          # inside <slug>-wp (official image)

log() {
  local msg="${2//[^[:print:]]/?}"
  command -v logger >/dev/null 2>&1 && logger -t aw-hosting-gate -p "auth.$1" -- "${msg:0:240}"
  return 0
}
die() { echo "aw-hosting-gate: $2" >&2; log warning "FAIL $2"; exit "$1"; }

cmd="${SSH_ORIGINAL_COMMAND-}"
read -r -a argv <<<"$cmd"
domain_ok() { [[ ${#1} -le 253 && "$1" =~ $DOMAIN_RE ]]; }
# site-wp <slug> <sub> [args]: the sub-verb list and each sub-verb's argument shapes are the whole surface.
wp_args_ok() {
  local sub="${argv[2]-}" a
  local rest=("${argv[@]:3}")
  case "$sub" in
    install)
      [[ ${#rest[@]} -ge 1 && ${#rest[@]} -le 2 && "${rest[0]}" =~ $EMAIL_RE && ${#rest[0]} -le 60 ]] || return 1   # 60 = WordPress user_login
      [[ ${#rest[@]} -eq 1 || "${rest[1]}" =~ $LOCALE_RE ]] ;;
    plugins)
      [[ ${#rest[@]} -ge 1 && ${#rest[@]} -le 20 ]] || return 1
      for a in "${rest[@]}"; do
        [[ "$a" =~ $PLUGIN_SLUG_RE || ( "$a" =~ $RELEASE_RE && "$a" != *..* && "$a" =~ $RELEASE_TAG_RE ) ]] || return 1
      done ;;
    open|close|reset-admin-password) [[ ${#rest[@]} -eq 0 ]] ;;
    set-mainwp-id) [[ ${#rest[@]} -eq 1 && "${rest[0]}" =~ $MAINWP_RE ]] ;;
    set-oracle-engine-url) [[ ${#rest[@]} -eq 1 && "${rest[0]}" =~ $ENGINE_URL_RE ]] ;;
    put-bridge-pubkey)
      [[ ${#rest[@]} -ge 2 && ${#rest[@]} -le 3 && "${rest[0]}" =~ $KEYID_RE && "${rest[1]}" =~ $PUBKEY_RE ]] || return 1
      [[ ${#rest[@]} -eq 2 || "${rest[2]}" == read || "${rest[2]}" == write ]] ;;
    *) return 1 ;;
  esac
}
parse() {
  [[ "${argv[*]-}" == "$cmd" ]] || return 1   # rejects tabs, double/trailing spaces, newlines
  case "${argv[0]-}" in
    staging-prepare) [[ ${#argv[@]} -eq 3 && "${argv[1]}" =~ $SLUG_RE && "${argv[2]}" =~ $DB_RE ]] ;;
    staging-wp)      [[ ${#argv[@]} -eq 2 && "${argv[1]}" =~ $SLUG_RE ]] ;;
    site-*)          [[ ${#cmd} -le $MAX_SITE_CMD ]] && parse_site ;;
    *) return 1 ;;
  esac
}
parse_site() {
  case "${argv[0]}" in
    site-preflight) [[ ${#argv[@]} -eq 3 && "${argv[1]}" =~ $SLUG_RE ]] && domain_ok "${argv[2]}" ;;
    site-create)    [[ (${#argv[@]} -eq 3 || ${#argv[@]} -eq 4) && "${argv[1]}" =~ $SLUG_RE ]] && domain_ok "${argv[2]}" \
                      && [[ ${#argv[@]} -eq 3 || "${argv[3]}" == host-vhost || "${argv[3]}" == product-gateway ]] ;;
    site-vhost)     [[ ${#argv[@]} -eq 2 && "${argv[1]}" =~ $SLUG_RE ]] ;;
    site-job)       [[ ${#argv[@]} -eq 2 && "${argv[1]}" =~ $JOB_RE ]] ;;
    site-wp)        [[ ${#argv[@]} -ge 3 && "${argv[1]}" =~ $SLUG_RE ]] && wp_args_ok ;;
    *) return 1 ;;
  esac
}

# The site-* verbs never take caller overrides of the paths render.sh derives (its CLIENT_WP_* knobs are for its own
# throwaway tests); sshd passes no environment to a forced command, and this keeps it so if that ever changes.
load_render() {
  unset CLIENT_WP_SITES_ROOT CLIENT_WP_REGISTRY_DIR CLIENT_WP_NGINX_DIR CLIENT_WP_LOCK_DIR CLIENT_WP_TEST_PATHS
  # shellcheck source=templates/client-wp/render.sh
  source "$HERE/templates/client-wp/render.sh" || die 3 "templates/client-wp/render.sh missing next to the gate"
  [[ "$CLIENT_WP_DOMAIN_RE" == "$DOMAIN_RE" && "$CLIENT_WP_SLUG_RE" == "$SLUG_RE" ]] \
    || die 3 "render.sh slug/domain grammar differs from the gate's -- refusing"
}

case "${1-}" in
  --check) if parse; then echo "ALLOW ${argv[0]}"; exit 0; fi; echo "DENY"; exit 126 ;;
  --list)  printf '%s\n' "staging-prepare $SLUG_RE $DB_RE" "staging-wp $SLUG_RE" \
             "site-preflight $SLUG_RE <domain>" "site-create $SLUG_RE <domain> [host-vhost|product-gateway]" \
             "site-job $JOB_RE" "site-vhost $SLUG_RE" "site-wp $SLUG_RE <$WP_SUBVERBS> [args]"; exit 0 ;;
  --job-run) ;;
  "") ;;
  *) echo "aw-hosting-gate: unknown argument" >&2; exit 2 ;;
esac

# ════════════════════════════════════ client sites (site-*) ════════════════════════════════════

# Read, never sourced: a stray line in the drop-in must not execute, and only root may have written it.
switch_trusted() {
  local st
  [[ -f "$SITE_SWITCH" && ! -L "$SITE_SWITCH" ]] || return 1
  st="$(stat -c '%u %a' "$SITE_SWITCH" 2>/dev/null)" || return 1
  [[ "${st%% *}" == 0 ]] && (( (8#${st#* } & 8#022) == 0 ))
}
switch_value() {  # <KEY>: the LAST `KEY=` line wins (a later `=off` must switch it off, as it would in a shell)
  switch_trusted && sed -n "s/^$1=//p" "$SITE_SWITCH" | tail -n 1
}
site_switch_on() { [[ "$(switch_value AW_SITE_VERBS)" == on ]]; }
# ingress=product-gateway puts the site's container on the shared lobster-net, next to every product (SF-E2 #2): only a
# slug the host lists in AW_SITE_GATEWAY_SLUGS (same drop-in, space-separated) may ask for it; the caller cannot.
gateway_allowed() {
  local s
  local list=() hit=1
  read -r -a list <<<"$(switch_value AW_SITE_GATEWAY_SLUGS)"   # no pathname expansion of a `*` in the file
  for s in ${list[@]+"${list[@]}"}; do
    [[ "$s" =~ $SLUG_RE ]] || return 1   # any other token (a `# comment`, a typo) voids the whole list: fail closed
    [[ "$s" == "$1" ]] && hit=0
  done
  return "$hit"
}
# Capacity (critic M3): one host carries every service, so a leaked key or a caller loop must not be able to start sites
# until it falls over. AW_SITE_MAX (same drop-in) caps registered + in-flight sites; each create also needs the memory
# its compose limits can claim (db 1G + wp 2G) plus a 1G reserve, free when its compose-new starts.
SITE_MAX_DEFAULT=10
SITE_MEM_NEED_KB=$(( (3 * 1024 + 1024) * 1024 ))
site_max() { local v; v="$(switch_value AW_SITE_MAX)"; [[ "$v" =~ ^[0-9]{1,3}$ ]] && echo "$((10#$v))" || echo "$SITE_MAX_DEFAULT"; }
sites_registered_except() {  # <slug>: number of registry files of other sites
  local f n=0
  for f in "$CLIENT_WP_REGISTRY_DIR"/*.json; do [[ -f "$f" && "$f" != "$(client_wp_registry_file "$1")" ]] && n=$((n + 1)); done
  echo "$n"
}
mem_available_kb() { sed -n 's/^MemAvailable: *\([0-9]*\) kB$/\1/p' /proc/meminfo; }

# JSON helpers. obj: k=v (string) and k:=<json> pairs -> one object line. occupants/certs: see their comments.
PY_HELP='
import json, os, re, ssl, subprocess, sys, time
cmd = sys.argv[1]
def names_in_text(txt):
    txt = "\n".join(l.split("#", 1)[0] for l in txt.splitlines())
    out = []
    for m in re.finditer(r"(?:^|[\s;{}])server_name\s+([^;]*);", txt):
        out += m.group(1).split()
    return out
def name_matches(n, d):
    n = n.lower()
    if n.startswith("~"):
        return True                        # a regex: cannot prove it does not match
    if n.startswith("*."):
        return d.endswith(n[1:])
    if n.startswith("."):
        return d == n[1:] or d.endswith(n)
    if n.endswith(".*"):
        return d.startswith(n[:-1])
    return n == d
def san_covers(san, d):
    if san == d:
        return True
    return san.startswith("*.") and d.endswith(san[1:]) and "." not in d[: -len(san) + 1]
if cmd == "obj":
    o = {}
    for a in sys.argv[2:]:
        if ":=" in a.split("=", 1)[0] + "=":
            k, v = a.split(":=", 1); o[k] = json.loads(v)
        else:
            k, v = a.split("=", 1); o[k] = v
    print(json.dumps(o, ensure_ascii=False))
elif cmd == "occupants":                    # <domain>: every file of the LIVE nginx config whose server_name matches
    # `nginx -T` = the config nginx actually loads (every include: conf.d, snippets, sites-enabled), each file after a
    # "# configuration file <path>:" line (SF-E2 #3). Cannot read it -> exit 1: nobody can prove the name is free.
    d = sys.argv[2]
    try:
        r = subprocess.run(["nginx", "-T"], capture_output=True, text=True, errors="replace", timeout=60)
    except (OSError, subprocess.TimeoutExpired) as e:
        sys.exit(f"nginx -T did not run: {e}")
    if r.returncode != 0:
        sys.exit("nginx -T failed: " + " ".join(r.stderr.split())[-300:])
    res, seen = [], set()
    parts = re.split(r"^# configuration file (.+):$", r.stdout, flags=re.M)
    for path, body in zip(parts[1::2], parts[2::2]):
        hit = [n for n in names_in_text(body) if name_matches(n, d)]
        if hit and path not in seen:
            seen.add(path)
            res.append({"file": path, "target": os.path.realpath(path), "server_names": hit})
    print(json.dumps(res))
elif cmd == "certs":                        # <domain> <live dir>: unexpired certs whose SAN covers it, latest expiry first
    d, live = sys.argv[2:4]
    res = []
    for f in (sorted(os.listdir(live)) if os.path.isdir(live) else []):
        c = os.path.join(live, f, "fullchain.pem")
        if not os.path.isfile(c):
            continue
        r = subprocess.run(["openssl", "x509", "-noout", "-enddate", "-ext", "subjectAltName", "-in", c],
                           capture_output=True, text=True)
        if r.returncode != 0:
            continue
        m = re.search(r"notAfter=(.+)", r.stdout)
        try:
            end = ssl.cert_time_to_seconds(m.group(1).strip()) if m else 0
        except ValueError:
            end = 0
        sans = [s.strip()[4:].lower() for s in re.findall(r"DNS:[^,\n]+", r.stdout)]
        if end > time.time() and any(san_covers(s, d) for s in sans):
            res.append({"dir": os.path.join(live, f), "not_after": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(end))})
    res.sort(key=lambda x: x["not_after"], reverse=True)
    print(json.dumps(res))
elif cmd == "jobset":                       # <file> [--if=s1,s2] k=v...: merge into the job file, atomically
    import fcntl
    path = sys.argv[2]; kvs = sys.argv[3:]; only = None
    if kvs and kvs[0].startswith("--if="):
        only = set(kvs[0][5:].split(",")); kvs = kvs[1:]
    lk = open(os.path.join(os.path.dirname(path), ".jobs.lock"), "a")
    fcntl.flock(lk, fcntl.LOCK_EX)              # read-modify-write: a reader marking "gone" cannot clobber a final state
    try:
        with open(path) as f:
            j = json.load(f)
    except (OSError, ValueError):
        j = {}
    if only is not None and j.get("state") not in only:
        sys.exit(0)
    for kv in kvs:
        k, v = kv.split("=", 1); j[k] = v
    j["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    tmp = f"{path}.{os.getpid()}.tmp"
    with open(tmp, "w") as f:
        json.dump(j, f)
    os.replace(tmp, path)
elif cmd == "jobget":                       # <file> <key>...: one value per line
    with open(sys.argv[2]) as f:
        j = json.load(f)
    print("\n".join(str(j.get(k, "")).replace("\n", " ") for k in sys.argv[3:]))
elif cmd == "first":                        # <json list> <key>
    l = json.loads(sys.argv[2]); print(l[0][sys.argv[3]] if l else "")
elif cmd == "files":                        # <json list>: the "file" of each, space-joined
    print(" ".join(x["file"] for x in json.loads(sys.argv[2])))
'
py() { python3 -c "$PY_HELP" "$@"; }
obj() { py obj "$@"; }
clean() { local s="${1//[^[:print:]]/ }"; printf '%s' "${s:0:400}"; }
# <json object line> <key> <secret>: appends the secret with the builtin printf. A secret on python's argv would be
# readable in /proc/<pid>/cmdline and ps while it runs (critic M1). Secrets made here are [A-Za-z0-9] only.
with_secret() {
  [[ "$3" =~ ^[A-Za-z0-9]+$ && "$1" == "{"*"}" ]] || die 3 "internal: secret not JSON-safe"
  printf '%s, "%s": "%s"}\n' "${1%\}}" "$2" "$3"
}
newhex() { tr -dc 'a-f0-9' </dev/urandom | head -c 48; }    # .env: hex only (compose interpolates `$`)
newpass() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24; }

# contract 1: the slug lock (same file as deprovision-site.sh) and the port lock, both in a root-only dir (SF-E2 #1).
# Every verb that changes a site holds the slug lock to its end; site-preflight and site-job only read and take none.
# slug_lock: 0 = held on fd 9 (inherited by every docker exec it starts); else LOCK_WHY says why.
slug_lock() {
  LOCK_WHY="$(client_wp_lock_dir_ready 2>&1)" || return 1
  LOCK_WHY="cannot open lock $(client_wp_lock_file "$SLUG")"
  exec 9>"$(client_wp_lock_file "$SLUG")" || return 1
  LOCK_WHY="another create/vhost/wp/teardown of $SLUG is running"
  flock -n 9
}
slug_busy() { ( exec 9>"$(client_wp_lock_file "$SLUG")" && ! flock -n 9 ); }   # after client_wp_lock_dir_ready

ct_state() {  # <container> -> absent | <status>|<health>
  # Decided by the exit status, never by appending to the output: docker 29 prints an empty line on stdout when the
  # object does not exist, so "inspect ... || echo absent" gave an empty line plus absent, and no == absent matched.
  local s
  if s="$(docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$1" 2>/dev/null)"; then
    echo "$s"
  else
    echo absent
  fi
}
vol_label() { docker volume inspect -f '{{index .Labels "com.docker.compose.project"}}' "$1" 2>/dev/null; }
internal_code() {  # <port> <domain>: HTTP code of the site on its loopback port with its own Host header
  curl -s -o /dev/null -w '%{http_code}' -m 20 -H "Host: $2" "http://127.0.0.1:$1/" 2>/dev/null || true
}
read_registry() {  # sets R_DOMAIN R_INGRESS R_PORT R_VHOST R_CREATED; 1 + reason on stderr when invalid/missing
  local f; f="$(client_wp_read_registry "$SLUG")" || return 1
  R_DOMAIN="$(sed -n 's/^domain=//p' <<<"$f")"; R_INGRESS="$(sed -n 's/^ingress=//p' <<<"$f")"
  R_PORT="$(sed -n 's/^port=//p' <<<"$f")"; R_VHOST="$(sed -n 's/^vhost_file=//p' <<<"$f")"
  R_CREATED="$(sed -n 's/^created_at=//p' <<<"$f")"
}
domain_taken_by() {  # another site's registry naming $DOMAIN -> that file
  local f
  for f in "$CLIENT_WP_REGISTRY_DIR"/*.json; do
    [[ -f "$f" && "$f" != "$(client_wp_registry_file "$SLUG")" ]] || continue
    grep -qE "^  \"domain\": \"${DOMAIN//./\\.}\",\$" "$f" && { echo "$f"; return 0; }
  done
  return 1
}
pick_port() {  # lowest 81xx in no registry and not listening (caller holds the port lock)
  local used p
  used=" $(cat "$CLIENT_WP_REGISTRY_DIR"/*.json 2>/dev/null | sed -n 's/^  "port": \([0-9]*\),$/\1/p' | tr '\n' ' ') "
  if command -v ss >/dev/null 2>&1; then used+=" $(ss -Hltn 2>/dev/null | awk '{print $4}' | sed 's/.*://' | tr '\n' ' ') "; fi
  for (( p = CLIENT_WP_PORT_MIN; p <= CLIENT_WP_PORT_MAX; p++ )); do
    [[ "$used" == *" $p "* ]] || { echo "$p"; return 0; }
  done
  return 1
}

# What site-create would do for $SLUG/$DOMAIN/$INGRESS (contract 4), without side effects. Sets PLAN to
# reused | new | retry, or refuse with PLAN_WHY. Shared by site-preflight (report) and the create job (act).
create_plan() {
  local reg marker env v lab n_exist=0 n_ours=0 other c
  reg="$(client_wp_registry_file "$SLUG")"; marker="$(client_wp_retired_marker "$SLUG")"; env="$(client_wp_env_file "$SLUG")"
  PLAN=refuse; PLAN_WHY=""
  if [[ -e "$reg" ]]; then
    if ! read_registry 2>/dev/null; then PLAN_WHY="registry $reg is invalid -- not touched"; return; fi
    [[ "$R_DOMAIN" == "$DOMAIN" ]] || { PLAN_WHY="$SLUG is registered for $R_DOMAIN, not $DOMAIN"; return; }
    [[ "$R_INGRESS" == "$INGRESS" ]] || { PLAN_WHY="$SLUG is registered with ingress=$R_INGRESS"; return; }
    PLAN=reused; return
  fi
  if [[ -e "$marker" ]]; then
    PLAN_WHY="volumes kept by deprovision-site.sh ($marker). Either delete them: deprovision-site.sh --slug $SLUG --apply --confirm $SLUG --purge-volumes --confirm-purge $SLUG; or bring the old data back: delete $marker by hand, then site-create reuses them"
    return
  fi
  if other="$(domain_taken_by)"; then PLAN_WHY="$DOMAIN is already registered by $other"; return; fi
  for c in "$(client_wp_container "$SLUG")" "$(client_wp_db_container "$SLUG")"; do
    [[ "$(ct_state "$c")" == absent ]] || { PLAN_WHY="a container named $c already exists without a registry -- not ours"; return; }
  done
  for v in $(client_wp_volumes "$SLUG"); do
    if lab="$(vol_label "$v")"; then n_exist=$((n_exist + 1)); [[ "$lab" == "$SLUG" ]] && n_ours=$((n_ours + 1)); fi
  done
  if (( n_exist == 0 )); then PLAN=new
  elif (( n_exist == 2 && n_ours == 2 )) && [[ -f "$env" ]]; then PLAN=retry   # an earlier failed create of this site
  else PLAN_WHY="volumes $(client_wp_volumes "$SLUG") exist but are not an earlier failed create of this site (need both, labelled com.docker.compose.project=$SLUG, and $env) -- not ours"
  fi
}

# Takes no lock. `busy` = a verb that changes this site holds the slug lock right now: create_plan then describes that
# verb's half-done work (containers up, registry not written yet reads as "refuse ... not ours"), not a foreign site.
site_preflight() {
  SLUG="${argv[1]}"; DOMAIN="${argv[2]}"; INGRESS=host-vhost
  local reg_json=null reg_err="" occ occ_err="" certs vols v lab
  if [[ -e "$(client_wp_registry_file "$SLUG")" ]]; then
    if read_registry 2>/dev/null; then reg_json="$(obj domain="$R_DOMAIN" ingress="$R_INGRESS" port:="$R_PORT" vhost_file="$R_VHOST" created_at="$R_CREATED")"
    else reg_err="$(client_wp_read_registry "$SLUG" 2>&1 >/dev/null)"; fi
    [[ -n "${R_INGRESS-}" ]] && INGRESS="$R_INGRESS"
  fi
  create_plan
  # null + vhost_occupants_error = the live config could not be read: unknown, never "free".
  occ="$(py occupants "$DOMAIN" 2>/dev/null)" || { occ_err="$(py occupants "$DOMAIN" 2>&1 >/dev/null)"; occ=null; }
  certs="$(py certs "$DOMAIN" "$LE_LIVE")"
  local vargs=()   # volume -> its compose project label, "unlabelled", or "absent"
  for v in $(client_wp_volumes "$SLUG"); do
    if lab="$(vol_label "$v")"; then vargs+=("$v=${lab:-unlabelled}"); else vargs+=("$v=absent"); fi
  done
  vols="$(obj "${vargs[@]}")"
  obj slug="$SLUG" domain="$DOMAIN" registry:="$reg_json" registry_error="$(clean "$reg_err")" \
    vhost_occupants:="$occ" vhost_occupants_error="$(clean "$occ_err")" certs:="$certs" volumes:="$vols" \
    wp_container="$(ct_state "$(client_wp_container "$SLUG")")" db_container="$(ct_state "$(client_wp_db_container "$SLUG")")" \
    retired:="$([[ -e "$(client_wp_retired_marker "$SLUG")" ]] && echo true || echo false)" \
    env_file:="$([[ -f "$(client_wp_env_file "$SLUG")" ]] && echo true || echo false)" \
    busy:="$(client_wp_lock_dir_ready >/dev/null 2>&1 && slug_busy && echo true || echo false)" \
    create_plan="$PLAN" create_refusal="$(clean "$PLAN_WHY")"
}

# ── site-create: the SSH call only queues; the work runs in its own systemd unit (Cloudflare cuts requests at ~100 s).
site_create() {
  SLUG="${argv[1]}"; DOMAIN="${argv[2]}"; INGRESS="${argv[3]:-host-vhost}"
  local job jf why
  [[ "$INGRESS" != product-gateway ]] || gateway_allowed "$SLUG" \
    || die 126 "ingress=product-gateway for $SLUG is not allowed on this host (AW_SITE_GATEWAY_SLUGS in $SITE_SWITCH)"
  why="$(client_wp_lock_dir_ready 2>&1)" || die 3 "$why"
  slug_busy && die 3 "another create/vhost/wp/teardown of $SLUG is running"
  mkdir -p -m 0700 "$JOB_DIR" || die 3 "cannot create $JOB_DIR"
  find "$JOB_DIR" -maxdepth 1 -type f -name 'sj-*' -mtime +30 -delete 2>/dev/null
  if [[ ! -f "$(client_wp_registry_file "$SLUG")" ]]; then   # fail fast; the job re-checks under the port lock
    local inflight
    inflight="$(grep -lE '"state": "(queued|running)"' "$JOB_DIR"/sj-*.json 2>/dev/null | xargs -r grep -LF "\"slug\": \"$SLUG\"" | wc -l)"
    (( $(sites_registered_except "$SLUG") + inflight < $(site_max) )) \
      || die 3 "site limit reached: $(sites_registered_except "$SLUG") registered + $inflight in progress >= AW_SITE_MAX=$(site_max)"
  fi
  job="sj-$(date -u +%Y%m%d%H%M%S)-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
  jf="$JOB_DIR/$job.json"
  py jobset "$jf" job="$job" verb=site-create slug="$SLUG" domain="$DOMAIN" ingress="$INGRESS" state=queued \
    step=queued detail="queued" created_epoch="$(date +%s)" || die 3 "cannot write $jf"
  if ! systemd-run --unit="aw-site-$job" --collect --quiet -- "$SELF" --job-run "$job" >/dev/null 2>&1; then
    py jobset "$jf" state=failed detail="systemd-run failed to start the job"
    die 3 "systemd-run failed"
  fi
  log info "site-create $SLUG $DOMAIN $INGRESS queued $job"
  obj job="$job" state=running
}

# Runs as root in its own unit; stdout/stderr -> <job>.log. Nothing written to the job files carries a secret: the
# only secrets created here are the .env passwords, which go straight into the 0600 file.
run_create_job() {
  JOB="$1"; JF="$JOB_DIR/$JOB.json"
  local verb fields reuse port compose cname env tmp code shp=0 paused other mem
  exec </dev/null >>"$JOB_DIR/$JOB.log" 2>&1
  fields="$(py jobget "$JF" verb slug domain ingress)" || exit 2
  { read -r verb; read -r SLUG; read -r DOMAIN; read -r INGRESS; } <<<"$fields"
  [[ "$verb" == site-create && "$SLUG" =~ $SLUG_RE && ( "$INGRESS" == host-vhost || "$INGRESS" == product-gateway ) ]] && domain_ok "$DOMAIN" \
    || { py jobset "$JF" state=failed detail="job file invalid"; exit 2; }
  STEP=start
  step() { STEP="$1"; echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1"; py jobset "$JF" step="$1"; }
  fail_job() { echo "FAILED at $STEP: $1"; py jobset "$JF" state=failed detail="$(clean "$1")"; log warning "site-create $SLUG $JOB failed at $STEP"; exit 3; }
  trap '[[ "$(py jobget "$JF" state)" == running ]] && py jobset "$JF" state=failed detail="unexpected exit at step $STEP (see $JOB.log)"' EXIT
  py jobset "$JF" state=running pid="$BASHPID"

  step lock
  slug_lock || fail_job "$LOCK_WHY"
  # Re-checked here: the list may have changed between the SSH call and this job (or the job file was written by hand).
  [[ "$INGRESS" != product-gateway ]] || gateway_allowed "$SLUG" \
    || fail_job "ingress=product-gateway for $SLUG is not allowed on this host (AW_SITE_GATEWAY_SLUGS in $SITE_SWITCH)"
  step plan
  create_plan
  cname="$(client_wp_container "$SLUG")"; paused="$CRON_STATE/paused.$cname"
  case "$PLAN" in
    reused)
      [[ "$(ct_state "$cname")" == "running|healthy" ]] \
        || fail_job "registered, but $cname is $(ct_state "$cname") -- not touched (tear down with deprovision-site.sh, then create again)"
      code="$(internal_code "$R_PORT" "$DOMAIN")"
      [[ "$code" =~ ^(200|301|302)$ ]] || fail_job "registered and healthy, but 127.0.0.1:$R_PORT answered ${code:-000}"
      py jobset "$JF" state=succeeded result=reused detail="already created: $cname on 127.0.0.1:$R_PORT"
      exit 0 ;;
    new) reuse=0 ;;
    retry) reuse=1 ;;
    *) fail_job "$PLAN_WHY" ;;
  esac

  # contract 3: .env only when absent; a retry keeps the one the kept volumes were initialised with.
  step env
  env="$(client_wp_env_file "$SLUG")"
  mkdir -p -m 0700 "$(client_wp_site_dir "$SLUG")" || fail_job "cannot create $(client_wp_site_dir "$SLUG")"
  if [[ ! -f "$env" ]]; then
    tmp="$(mktemp "$env.XXXXXX")" || fail_job "cannot create a temp file next to $env"
    printf 'SITE_DB_PASSWORD=%s\nSITE_DB_ROOT_PASSWORD=%s\n' "$(newhex)" "$(newhex)" >"$tmp" && mv "$tmp" "$env" \
      || { rm -f "$tmp"; fail_job "cannot write $env"; }
  fi

  # contract 2: compose-new runs `up --no-build`.
  step image
  docker image inspect "$CLIENT_WP_IMAGE" >/dev/null 2>&1 || docker build -t "$CLIENT_WP_IMAGE" "$CLIENT_WP_TEMPLATE_DIR" \
    || fail_job "docker build $CLIENT_WP_IMAGE failed"

  # contract 3b: until `site-wp install` succeeds the runner's probe fails on this container and would withhold the
  # host-wide heartbeat. The flag stays on every failure path; `site-wp install` is the only thing that removes it.
  step pause-cron
  mkdir -p "$CRON_STATE" && touch "$paused" || fail_job "cannot write $paused"

  step port
  exec 8>"$CLIENT_WP_PORT_LOCK" && flock -w 600 8 || fail_job "port lock $CLIENT_WP_PORT_LOCK not acquired"
  # Re-checked under the port lock, which every create holds from here to its registry write, so these cannot race:
  # one domain under two slugs (critic m1), the site cap and free memory (critic M3).
  other="$(domain_taken_by)" && fail_job "$DOMAIN was registered by $other while this job waited"
  (( $(sites_registered_except "$SLUG") < $(site_max) )) || fail_job "site limit reached (AW_SITE_MAX=$(site_max) in $SITE_SWITCH)"
  mem="$(mem_available_kb)"
  [[ "$mem" =~ ^[0-9]+$ ]] && (( mem >= SITE_MEM_NEED_KB )) \
    || fail_job "not enough free memory for a new site: MemAvailable ${mem:-?} kB < $SITE_MEM_NEED_KB kB (db 1G + wp 2G + 1G reserve)"
  port="$(pick_port)" || fail_job "no free port in $CLIENT_WP_PORT_MIN-$CLIENT_WP_PORT_MAX"
  [[ "$INGRESS" == product-gateway ]] && shp=1
  compose="$(client_wp_render_compose "$SLUG" "$DOMAIN" "$port" "$shp")" || fail_job "render failed"

  step compose-new
  # contract 4: only a failed create of this very site gets its volumes back (create_plan decided which).
  if (( reuse )); then export SAFE_PATCH_REUSE_VOLUMES=1; else unset SAFE_PATCH_REUSE_VOLUMES; fi
  if ! printf '%s\n' "$compose" | "$HERE/safe-infra-patch.sh" compose-new "$(client_wp_compose_file "$SLUG")" "$cname"; then
    fail_job "compose-new failed and rolled back (containers down, compose file removed; volumes and .env kept: site-create again retries with them). wp-cron-runner stays paused for $cname."
  fi

  # contract 5: registry right after compose-new, vhost_file null (written by site-vhost only).
  step registry
  client_wp_write_registry "$SLUG" "$DOMAIN" "$port" "$INGRESS" 0 \
    || fail_job "containers are up but the registry was not written -- $SLUG is not registered (tear down: docker compose -f $(client_wp_compose_file "$SLUG") down)"
  exec 8>&-

  step verify
  code="$(internal_code "$port" "$DOMAIN")"
  [[ "$code" =~ ^(200|301|302)$ ]] || fail_job "healthy, but 127.0.0.1:$port answered ${code:-000}"
  py jobset "$JF" state=succeeded result="$([[ $reuse == 1 ]] && echo retried || echo created)" \
    detail="$cname up on 127.0.0.1:$port; next: site-wp $SLUG install"
  log info "site-create $SLUG $JOB succeeded port=$port"
}

site_job() {
  local job="${argv[1]}" jf state detail step pid epoch alive=0
  jf="$JOB_DIR/$job.json"
  [[ -f "$jf" ]] || die 3 "no such job: $job"
  { read -r state; read -r detail; read -r step; read -r pid; read -r epoch; } <<<"$(py jobget "$jf" state detail step pid created_epoch)"
  if [[ "$state" == queued || "$state" == running ]]; then
    if [[ "$pid" =~ ^[0-9]+$ && -r "/proc/$pid/cmdline" ]] && tr '\0' ' ' <"/proc/$pid/cmdline" | grep -qF -- "--job-run $job"; then alive=1
    elif [[ "$state" == queued && "$epoch" =~ ^[0-9]+$ ]] && (( $(date +%s) - epoch < 120 )); then alive=1; fi
    if (( ! alive )); then
      detail="job process gone during step $step (host restart or killed); site-create again is safe"
      py jobset "$jf" --if=queued,running state=failed detail="$detail"
      state="$(py jobget "$jf" state)"; detail="$(py jobget "$jf" detail)"
    else state=running; fi
  fi
  obj job="$job" state="$state" step="$step" detail="$detail"
}

site_vhost() {
  SLUG="${argv[1]}"
  local vf link occ others cert content
  slug_lock || die 3 "$LOCK_WHY"
  read_registry || die 3 "no valid registry for $SLUG (site-create first)"
  [[ "$R_INGRESS" == host-vhost ]] || die 3 "$SLUG has ingress=$R_INGRESS: its URL is routed by the product gateway, no vhost on this host"
  DOMAIN="$R_DOMAIN"; vf="$(client_wp_vhost_file "$DOMAIN")"; link="$CLIENT_WP_NGINX_DIR/sites-enabled/$(basename "$vf")"
  owned_live() { client_wp_vhost_owned "$vf" "$SLUG" "$DOMAIN" "$R_PORT" && [[ -L "$link" && "$(readlink "$link")" == "$vf" ]]; }
  if [[ -n "$R_VHOST" ]]; then
    owned_live || die 3 "registry records $vf but the file or its sites-enabled link is not what render.sh wrote -- not touched"
    obj state=reused vhost_file="$vf"; return
  fi
  if [[ -e "$vf" || -L "$vf" ]]; then
    # host-nginx-new succeeded on an earlier run whose registry rewrite did not: the file proves it is ours.
    owned_live || die 3 "$vf exists and is not this site's live vhost -- not touched"
    client_wp_write_registry "$SLUG" "$DOMAIN" "$R_PORT" host-vhost 1 "$R_CREATED" || die 3 "registry not updated"
    obj state=adopted vhost_file="$vf"; return
  fi
  # Never put an uninstalled WordPress on a public URL: the first visitor would run install.php and own the site (critic
  # M2). `site-wp install` leaves it under construction (503 for visitors) until `site-wp open`.
  local C; C="$(client_wp_container "$SLUG")"
  docker exec -u www-data "$C" php -d memory_limit=256M /usr/local/bin/wp --path="$WP_PATH" core is-installed </dev/null >/dev/null 2>&1 \
    || die 3 "blocked: WordPress in $C is not installed (site-wp $SLUG install first)"
  occ="$(py occupants "$DOMAIN" 2>/dev/null)"     || die 3 "blocked: cannot read the live nginx config, so $DOMAIN cannot be proven free ($(clean "$(py occupants "$DOMAIN" 2>&1 >/dev/null)"))"
  others="$(py files "$occ")" || die 3 "blocked: nginx -T occupancy for $DOMAIN unreadable -- cannot prove it free"
  [[ -z "$others" ]] || die 3 "blocked: $DOMAIN is already served by $others"
  cert="$(py first "$(py certs "$DOMAIN" "$LE_LIVE")" dir)"
  [[ -n "$cert" ]] || die 3 "blocked: no unexpired certificate under $LE_LIVE covers $DOMAIN"
  content="$(client_wp_render_vhost "$SLUG" "$DOMAIN" "$R_PORT" "$cert")" || die 3 "vhost render failed"
  # Probe /wp-json/: the under-construction page answers 503 on /, the REST index does not.
  printf '%s\n' "$content" | "$HERE/safe-infra-patch.sh" host-nginx-new "$vf" "$DOMAIN/wp-json/" >&2 \
    || die 3 "host-nginx-new failed and rolled back; the registry keeps vhost_file null"
  # contract 5: vhost_file only now, after this site's host-nginx-new exited 0.
  client_wp_write_registry "$SLUG" "$DOMAIN" "$R_PORT" host-vhost 1 "$R_CREATED" \
    || die 3 "the vhost is live but the registry was not updated -- run site-vhost again (it adopts the vhost)"
  log info "site-vhost $SLUG $DOMAIN cert=$cert"
  obj state=created vhost_file="$vf" cert_dir="$cert"
}

# ── site-wp: fixed actions. Container = the registry's (validated against render.sh's derivation), never an argument.
UC_PLUGIN='<?php
// aw-under-construction (aw-hosting-gate.sh site-wp): while option aw_under_construction = 1, visitors who are not
// logged in get a 503 "coming soon" page. REST, wp-admin and wp-login stay reachable. Toggled by site-wp open/close.
add_action("template_redirect", function () {
    if (!get_option("aw_under_construction") || is_user_logged_in()) return;
    status_header(503);
    header("Retry-After: 3600");
    nocache_headers();
    echo "<!doctype html><meta charset=\"utf-8\"><title>Coming soon</title><p style=\"font:16px sans-serif;text-align:center;margin-top:20vh\">網站建置中 · Coming soon</p>";
    exit;
}, 0);
'
site_wp() {
  SLUG="${argv[1]}"; local sub="${argv[2]}" rest=("${argv[@]:3}") C pw admin out a ok_list=() kept=()
  slug_lock || die 3 "$LOCK_WHY"
  read_registry || die 3 "no valid registry for $SLUG"
  DOMAIN="$R_DOMAIN"; C="$(client_wp_container "$SLUG")"
  [[ "$(docker inspect -f '{{.State.Running}}' "$C" 2>/dev/null)" == true ]] || die 3 "$C is not running"
  wpc() { docker exec -u www-data "$C" php -d memory_limit=256M /usr/local/bin/wp --path="$WP_PATH" "$@" </dev/null; }
  wpin() { docker exec -i -u www-data "$C" php -d memory_limit=256M /usr/local/bin/wp --path="$WP_PATH" "$@"; }   # stdin: a secret made here
  first_admin() { wpc user list --role=administrator --field=ID --orderby=ID --order=ASC --number=1 2>/dev/null | head -1; }
  ensure_uc() {
    printf '%s' "$UC_PLUGIN" | docker exec -i -u www-data "$C" sh -c \
      'mkdir -p "$1" && cat >"$1/.aw-uc.tmp" && mv -f "$1/.aw-uc.tmp" "$1/aw-under-construction.php"' _ "$WP_PATH/wp-content/mu-plugins"
  }
  case "$sub" in
    install)
      local email="${rest[0]}" locale="${rest[1]:-zh_TW}" state=reused
      if ! wpc core is-installed >/dev/null 2>&1; then
        pw="$(newpass)"
        printf '%s\n' "$pw" | wpin core install --url="https://$DOMAIN" --title="$DOMAIN" --admin_user="$email" \
          --admin_email="$email" --skip-email --prompt=admin_password >/dev/null || die 3 "wp core install failed"
        state=installed
        # 建置中 until `open`: only on a fresh install, so a re-run never closes a site that was opened.
        { ensure_uc && wpc option update aw_under_construction 1 >/dev/null && wpc option update blog_public 0 >/dev/null; } \
          || die 3 "installed, but under-construction mode failed; re-run install, then reset-admin-password to log in"
      fi
      ensure_uc || die 3 "under-construction plugin write failed"
      if [[ "$locale" != en_US ]]; then
        wpc language core is-installed "$locale" >/dev/null 2>&1 || wpc language core install "$locale" --activate >/dev/null \
          || die 3 "language $locale failed (WordPress is installed: re-run install; reset-admin-password to log in)"
      fi
      wpc theme is-installed kadence >/dev/null 2>&1 || wpc theme install kadence >/dev/null \
        || die 3 "theme kadence failed (WordPress is installed: re-run install; reset-admin-password to log in)"
      wpc theme activate kadence >/dev/null || die 3 "theme activate failed"
      # A fresh WordPress has no permalink structure, and then /wp-json/ is not the REST API: it falls through to the
      # under-construction 503. The vhost probe, MainWP and wp-bridge all call /wp-json/. Set once, only while empty.
      if [[ -z "$(wpc option get permalink_structure 2>/dev/null)" ]]; then
        wpc rewrite structure '/%postname%/' >/dev/null \
          || die 3 "permalink structure failed (WordPress is installed: re-run install; reset-admin-password to log in)"
      fi
      rm -f "$CRON_STATE/paused.$C"   # contract 3b: WordPress answers wp-cli now; the runner may schedule it
      admin="$(wpc user get "$(first_admin)" --field=user_login 2>/dev/null)"
      log info "site-wp $SLUG install state=$state"
      if [[ "$state" == installed ]]; then with_secret "$(obj state=installed url="https://$DOMAIN" admin_user="$admin")" admin_password "$pw"
      else obj state=reused url="https://$DOMAIN" admin_user="$admin"; fi
      ;;
    plugins)
      # SF-E2 #5 (SITE-FLOW §1-3): database export first; a failed plugin step restores it. Export = the site's own DB
      # container (the WordPress image has no dump client), root password from that container's env, never an argv.
      local exp tmp ver cur pslug
      exp="$(client_wp_db_export_file "$SLUG")"
      tmp="$(mktemp "$exp.XXXXXX")" || die 3 "cannot create a temp file next to $exp (nothing installed)"
      if ! docker exec "$(client_wp_db_container "$SLUG")" sh -c \
           'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb-dump -uroot --single-transaction --add-drop-database --databases wordpress' \
           </dev/null 2>/dev/null | gzip >"$tmp" \
         || ! gzip -t "$tmp" 2>/dev/null || ! zcat "$tmp" | tail -n 5 | grep -q 'Dump completed'; then
        rm -f "$tmp"; die 3 "database export before the plugin step failed -- nothing installed"
      fi
      chmod 0600 "$tmp" && mv -f "$tmp" "$exp" || { rm -f "$tmp"; die 3 "cannot write $exp (nothing installed)"; }
      local changed=0
      wpm() { changed=1; wpc "$@"; }   # a wp call that may change the database
      plugin_failed() {  # <plugin> <why>: restore the export if anything was attempted, then fail saying what happened
        (( changed )) || die 3 "plugin $1 failed ($2); nothing was changed, database not touched (installed: none)"
        zcat "$exp" | docker exec -i "$(client_wp_db_container "$SLUG")" sh -c \
          'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb -uroot' >/dev/null 2>&1
        if [[ "${PIPESTATUS[*]}" == "0 0" ]]; then   # both: a zcat cut short would leave a half-restored DB behind exit 0
          die 3 "plugin $1 failed ($2); database restored from the export taken before this step (installed or upgraded before the failure: ${ok_list[*]:-none}; their files stay at the new version)"
        fi
        die 3 "plugin $1 failed ($2) AND the database restore failed -- export kept at $exp"
      }
      local src mfile mbase
      release_src() {  # <release url> -> sets src: the mirror's file copied into the container, else the URL itself
        mfile="$RELEASE_MIRROR/${1#https://github.com/awarewaveai-pei/}"; mfile="${mfile/\/releases\/download\//\/}"; mbase="${1##*/}"
        src="$1"
        [[ -f "$mfile" && ! -L "$mfile" && -O "$mfile" ]] || return 0
        docker exec -i -u www-data "$C" sh -c 'cat >"/tmp/$1"' _ "$mbase" <"$mfile" || return 1
        src="/tmp/$mbase"
      }
      release_src_done() { [[ "$src" != /tmp/* ]] || docker exec -u www-data "$C" rm -f "$src" </dev/null >/dev/null 2>&1 || true; }
      for a in "${rest[@]}"; do
        if [[ "$a" =~ $PLUGIN_SLUG_RE ]]; then
          if wpc plugin is-installed "$a" >/dev/null 2>&1; then wpm plugin activate "$a" >/dev/null 2>&1 || wpc plugin is-active "$a" >/dev/null 2>&1
          else wpm plugin install "$a" --activate >/dev/null; fi || plugin_failed "$a" "wp-cli"
        else
          # Own release zip (SF-E2 #4): never replace a version that is the same or newer -- a re-run or an old URL is a
          # no-op. Version = the release tag (scripts/release-wp-bridge.sh tags v<plugin version>).
          # slug = the repo (release-wp-bridge.sh: REPO=awarewaveai-pei/<slug>, asset <slug>-v<ver>.zip); the tag
          # format is already checked by wp_args_ok, before the export.
          ver="${a%/*}"; ver="${ver##*/}"; ver="${ver#v}"; pslug="${a#https://github.com/awarewaveai-pei/}"; pslug="${pslug%%/*}"
          if wpc plugin is-installed "$pslug" >/dev/null 2>&1; then
            cur="$(wpc plugin get "$pslug" --field=version 2>/dev/null)"
            # Plain dotted numbers only: sort -V ranks 0.21.0-beta above 0.21.0, so a pre-release is not compared.
            [[ "$cur" =~ ^[0-9]+(\.[0-9]+){0,3}$ ]] || plugin_failed "$a" "installed $pslug version '$cur' is not plain numbers -- not compared, not replaced"
            if [[ "$(printf '%s\n%s\n' "$cur" "$ver" | sort -V | tail -n 1)" == "$cur" ]]; then
              wpm plugin activate "$pslug" >/dev/null 2>&1 || wpc plugin is-active "$pslug" >/dev/null 2>&1 || plugin_failed "$a" "activate"
              kept+=("$pslug@$cur"); ok_list+=("$a"); continue
            fi
            release_src "$a" || plugin_failed "$a" "could not copy $mfile into the container"
            wpm plugin install "$src" --force --activate >/dev/null || { release_src_done; plugin_failed "$a" "wp-cli upgrade $cur -> $ver"; }
          else
            release_src "$a" || plugin_failed "$a" "could not copy $mfile into the container"
            wpm plugin install "$src" --activate >/dev/null || { release_src_done; plugin_failed "$a" "wp-cli"; }
          fi
          release_src_done
        fi
        ok_list+=("$a")
      done
      # Rank Math prints nothing in <head> (no description, no og/twitter) until its "connect an account" step is
      # answered; this option is its own "skip" answer (includes/admin/class-registration.php). Set once, never unset.
      if [[ " ${ok_list[*]} " == *" seo-by-rank-math "* && -z "$(wpc option get rank_math_registration_skip 2>/dev/null)" ]]; then
        wpm option update rank_math_registration_skip 1 >/dev/null || plugin_failed seo-by-rank-math "first-run setting"
      fi
      log info "site-wp $SLUG plugins ${#ok_list[@]} kept=${#kept[@]}"
      obj state=ok plugins="${ok_list[*]}" kept="${kept[*]}" db_export="$exp" ;;
    open|close)
      local on=0 pub=1; [[ "$sub" == close ]] && { on=1; pub=0; }
      ensure_uc && wpc option update aw_under_construction "$on" >/dev/null && wpc option update blog_public "$pub" >/dev/null \
        || die 3 "$sub failed"
      log info "site-wp $SLUG $sub"
      obj state="$([[ $sub == open ]] && echo open || echo under_construction)" ;;
    set-mainwp-id)
      admin="$(first_admin)"; [[ "$admin" =~ ^[0-9]+$ ]] || die 3 "no administrator (install first)"
      wpc option update mainwp_child_uniqueId "${rest[0]}" >/dev/null \
        && wpc user meta update "$admin" mainwp_child_user_enable_passwd_auth_connect 0 >/dev/null || die 3 "set-mainwp-id failed"
      obj state=ok ;;
    put-bridge-pubkey)
      out="$(docker exec -u www-data -e AW_KEY_ID="${rest[0]}" -e AW_PUB="${rest[1]}" -e AW_SCOPE="${rest[2]:-write}" "$C" \
        php -d memory_limit=256M /usr/local/bin/wp --path="$WP_PATH" eval '
global $wpdb; $t = $wpdb->prefix . "awbridge_keys";
if ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $t)) !== $t) { fwrite(STDERR, "awbridge_keys table missing (wp-bridge not active)"); exit(3); }
$k = getenv("AW_KEY_ID"); $p = getenv("AW_PUB"); $s = getenv("AW_SCOPE");
$row = $wpdb->get_row($wpdb->prepare("SELECT public_key, status FROM $t WHERE key_id = %s", $k));
if ($row) { if ($row->public_key === $p && $row->status === "active") { echo "reused"; exit(0); } fwrite(STDERR, "key_id exists with another key or is revoked"); exit(3); }
$ok = $wpdb->insert($t, array("key_id" => $k, "public_key" => $p, "scope" => $s, "status" => "active", "ip_allowlist" => null, "created_at" => time()), array("%s", "%s", "%s", "%s", "%s", "%d"));
echo $ok ? "created" : "failed"; exit($ok ? 0 : 3);' </dev/null)" || die 3 "put-bridge-pubkey failed: $(clean "$out")"
      obj state="$out" key_id="${rest[0]}" ;;
    set-oracle-engine-url)
      # One key of the plugin's settings array, through wp-cli option patch (value = an argument, never code); every
      # other key stays as it is. Read back before answering, so the caller sees what WordPress now holds.
      wpc plugin is-active "$ORACLE_PLUGIN" >/dev/null 2>&1 || die 3 "$ORACLE_PLUGIN is not active on $SLUG -- install it first (nothing changed)"
      if ! wpc option get aworacle_settings >/dev/null 2>&1; then
        wpc option add aworacle_settings '{}' --format=json >/dev/null || die 3 "cannot create option aworacle_settings"
      fi
      if wpc option pluck aworacle_settings server_engine_url >/dev/null 2>&1; then
        wpc option patch update aworacle_settings server_engine_url "${rest[0]}" >/dev/null || die 3 "option patch update failed"
      else
        wpc option patch insert aworacle_settings server_engine_url "${rest[0]}" >/dev/null || die 3 "option patch insert failed"
      fi
      out="$(wpc option pluck aworacle_settings server_engine_url 2>/dev/null)"
      [[ "$out" == "${rest[0]}" ]] || die 3 "server_engine_url reads back as '$(clean "$out")', not the value set"
      log info "site-wp $SLUG set-oracle-engine-url"
      obj state=ok server_engine_url="$out" ;;
    reset-admin-password)
      admin="$(first_admin)"; [[ "$admin" =~ ^[0-9]+$ ]] || die 3 "no administrator (install first)"
      pw="$(newpass)"
      printf '%s\n' "$pw" | wpin user update "$admin" --prompt=user_pass >/dev/null || die 3 "password reset failed"
      log info "site-wp $SLUG reset-admin-password"
      with_secret "$(obj state=ok admin_user="$(wpc user get "$admin" --field=user_login 2>/dev/null)")" admin_password "$pw" ;;
    *) die 126 "unknown site-wp sub-verb" ;;   # unreachable: parse() already refused it
  esac
}

if [[ "${1-}" == --job-run ]]; then   # root on the host only (systemd-run); never reachable from SSH (forced mode has no args)
  [[ "${2-}" =~ $JOB_RE && -f "$JOB_DIR/${2}.json" ]] || exit 2
  load_render
  run_create_job "$2"
  exit 0
fi

# ════════════════════════════════════ forced command ════════════════════════════════════
src="${SSH_CLIENT:-local}"; src="${src%% *}"
if ! parse; then
  log warning "DENY from $src: $cmd"
  echo "aw-hosting-gate: command not allowed" >&2
  exit 126
fi
if [[ "${argv[0]}" == site-* ]]; then
  if ! site_switch_on; then
    log warning "DENY (site verbs off) from $src: $cmd"
    echo "aw-hosting-gate: site verbs are off on this host ($SITE_SWITCH has no AW_SITE_VERBS=on)" >&2
    exit 126
  fi
  # No site verb takes stdin. Data already waiting = a caller sending a script: refused. Either way stdin is closed
  # before anything runs, so nothing that arrives later is read.
  if IFS= read -r -t 0.2 -N 1 _; then
    log warning "DENY (stdin) from $src: $cmd"
    echo "aw-hosting-gate: site verbs take no stdin" >&2
    exit 126
  fi
  exec </dev/null
  # A verb that changes a site runs to its end under the slug lock even when the caller gives up (next-admin's timeout
  # closes the SSH channel): dying half-way would free the lock while a docker exec it started still runs (SF-E2 #6).
  trap '' HUP
  load_render
fi
log info "ALLOW from $src: $cmd"

wpc() { docker exec -u www-data "$WP_CT" php -d memory_limit=256M /usr/local/bin/wp --path="$DIR/" "$@"; }
# SQL on stdin; root password from the DB container's own env, never on an argv.
sql() { docker exec -i "$DB_CT" sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mariadb -uroot --batch --skip-column-names'; }
newpw() { tr -dc 'a-f0-9' </dev/urandom | head -c 48; }
# Makes the DB and the account named $DB exist with password $1 (ALTER keeps a retry consistent).
ensure_account() {
  printf "CREATE DATABASE IF NOT EXISTS \`%s\`;\nCREATE USER IF NOT EXISTS '%s'@'%%' IDENTIFIED BY '%s';\nALTER USER '%s'@'%%' IDENTIFIED BY '%s';\nGRANT ALL PRIVILEGES ON \`%s\`.* TO '%s'@'%%';\n" \
    "$DB" "$DB" "$1" "$DB" "$1" "$DB" "$DB" | sql
}
# Connects with the given credentials (stdin), exit 0 = login works on $DB.
can_login() {
  printf '%s\n%s\n%s\n' "$1" "$2" "$DB" | docker exec -i "$WP_CT" php -r \
    '$l=explode("\n",stream_get_contents(STDIN)); mysqli_report(MYSQLI_REPORT_OFF); exit(@mysqli_connect("lobster-wordpress-db",$l[0],$l[1],$l[2]) ? 0 : 1);'
}
# Sets wp-config constant $1 to $2 with the value on stdin (`wp config set` has no stdin form; wp-cli 2.11
# rejects --prompt=value). The file path is explicit AND re-checked in PHP: on 2026-09-24 a test of this
# transformer without a path resolved getcwd() = /var/www/html and rewrote the MAIN site's DB_PASSWORD
# (80 s outage, WORKLOG 2026-09-24). Never let a wp-config write depend on the working directory.
config_set() {
  [[ "$1" =~ ^DB_(USER|PASSWORD)$ ]] || die 3 "config_set: constant not allowed: $1"
  printf '%s\n' "$2" | docker exec -i -u www-data -w "$DIR" "$WP_CT" php -d memory_limit=256M /usr/local/bin/wp --skip-wordpress eval "
    \$f = realpath('$DIR/wp-config.php');
    if (\$f === false || strpos(\$f, '$ROOT/') !== 0 || dirname(\$f) !== '$DIR') { fwrite(STDERR, 'config_set: refusing path'); exit(3); }
    \$v = rtrim(fgets(STDIN), \"\\n\");
    exit((new WPConfigTransformer(\$f))->update('constant', '$1', \$v) ? 0 : 3);" >/dev/null
}

# Staging sites sit behind the https proxy like the main site, but `wp config create` does not write the
# X-Forwarded-Proto block the main site's docker wp-config has: is_ssl() stays false and WordPress disables
# application passwords, so the token wired into wp_sites never authenticates (2026-10-23). Idempotent (marker);
# runs in every prepare state, so re-running staging-prepare repairs an existing site. Same path check as config_set.
ensure_proxy_https() {
  docker exec -i -u www-data "$WP_CT" php -- "$DIR" "$ROOT" <<'PHP' >/dev/null
<?php
[, $dir, $root] = $argv;
$f = realpath("$dir/wp-config.php");
if ($f === false || strpos($f, "$root/") !== 0 || dirname($f) !== $dir) { fwrite(STDERR, 'ensure_proxy_https: refusing path'); exit(3); }
$c = file_get_contents($f);
if (strpos($c, 'AW_PROXY_HTTPS') !== false) exit(0);
$stop = "/* That's all, stop editing!";
$p = strpos($c, $stop);
if ($p === false) { fwrite(STDERR, 'ensure_proxy_https: no stop-editing line'); exit(3); }
$block = "// AW_PROXY_HTTPS (aw-hosting-gate.sh): behind the https proxy\n"
  . "if (isset(\$_SERVER['HTTP_X_FORWARDED_PROTO']) && strpos(\$_SERVER['HTTP_X_FORWARDED_PROTO'], 'https') !== false) {\n"
  . "\t\$_SERVER['HTTPS'] = 'on';\n}\n\n";
exit(file_put_contents($f, substr($c, 0, $p) . $block . substr($c, $p)) === false ? 3 : 0);
PHP
}

prepare() {
  SLUG="${argv[1]}"; DB="${argv[2]}"; DIR="$ROOT/$SLUG"
  local main_db main_user state pw cfg_db cfg_user old_pw others
  main_db="$(docker exec "$WP_CT" printenv WORDPRESS_DB_NAME)" || true
  main_user="$(docker exec "$WP_CT" printenv WORDPRESS_DB_USER)" || true
  [[ -n "$main_db" && -n "$main_user" ]] || die 3 "cannot read the main site's DB name/user -- refusing (cannot prove the target is not prod)"
  [[ "$DB" != "$main_db" && "$DB" != "$main_user" ]] || die 3 "target is the main site's DB/account"

  docker exec "$WP_CT" bash -c 'mkdir -p "$1" && chown www-data:www-data "$1"' _ "$DIR" || die 3 "mkdir failed"
  others="$(docker exec "$WP_CT" bash -c 'grep -lF -- "$1" '"$ROOT"'/*/wp-config.php 2>/dev/null | grep -vxF -- "$2/wp-config.php"' \
            _ "'DB_NAME', '$DB'" "$DIR")" || true
  [[ -z "$others" ]] || die 3 "DB $DB already belongs to another site: $others"

  if docker exec "$WP_CT" test -f "$DIR/wp-config.php"; then
    cfg_db="$(wpc config get DB_NAME 2>/dev/null)"; cfg_user="$(wpc config get DB_USER 2>/dev/null)"
    [[ "$cfg_db" == "$DB" ]] || die 3 "wp-config DB_NAME is '$cfg_db', not $DB"
    if [[ "$cfg_user" == "$DB" ]]; then
      pw="$(wpc config get DB_PASSWORD 2>/dev/null)"; [[ -n "$pw" ]] || die 3 "wp-config has no DB_PASSWORD"
      ensure_account "$pw" || die 3 "DB account repair failed"
      state=reused
    elif [[ "$cfg_user" == "$main_user" ]]; then
      old_pw="$(wpc config get DB_PASSWORD 2>/dev/null)"
      pw="$(newpw)"
      ensure_account "$pw" || die 3 "DB account create failed (site untouched)"
      can_login "$DB" "$pw" || die 3 "new account cannot log in (site untouched)"
      # Verified by reading wp-config back and logging in with it (not `core is-installed`: a site whose
      # install step never ran must still migrate).
      if config_set DB_PASSWORD "$pw" && config_set DB_USER "$DB" \
         && [[ "$(wpc config get DB_USER 2>/dev/null)" == "$DB" ]] \
         && can_login "$DB" "$(wpc config get DB_PASSWORD 2>/dev/null)"; then
        state=migrated
      else
        config_set DB_USER "$main_user"; config_set DB_PASSWORD "$old_pw"
        die 3 "migration failed; wp-config restored to the main account"
      fi
    else
      die 3 "wp-config DB_USER '$cfg_user' is neither $DB nor the main account -- not touching it"
    fi
  else
    if ! docker exec "$WP_CT" test -f "$DIR/wp-includes/version.php"; then
      wpc core download --quiet >/dev/null 2>&1 || die 3 "wp core download failed"
    fi
    pw="$(newpw)"
    ensure_account "$pw" || die 3 "DB account create failed"
    printf '%s\n' "$pw" | docker exec -i -u www-data "$WP_CT" php -d memory_limit=256M /usr/local/bin/wp --path="$DIR/" \
      config create --dbname="$DB" --dbuser="$DB" --dbhost=lobster-wordpress-db --prompt=dbpass --quiet >/dev/null \
      || die 3 "wp config create failed"
    state=created
  fi
  ensure_proxy_https || die 3 "wp-config proxy https block failed"
  echo "AW_PREPARE_OK state=$state"
  log info "prepare $SLUG $DB state=$state"
}

run_wp() {
  SLUG="${argv[1]}"; DIR="$ROOT/$SLUG"
  docker exec "$WP_CT" test -d "$DIR" || die 3 "no such staging site: $SLUG"
  # Script -> temp file inside the container, then run with stdin=/dev/null so a command in it
  # that reads stdin cannot swallow the rest of the script.
  head -c $((MAX_SCRIPT + 1)) | docker exec -i -u www-data -w "$DIR" "$WP_CT" bash -c '
    f=$(mktemp) || exit 1
    cat >"$f"
    if [ "$(wc -c <"$f")" -gt "$1" ]; then rm -f "$f"; echo "aw-hosting-gate: script over $1 bytes" >&2; exit 125; fi
    bash "$f" </dev/null; rc=$?; rm -f "$f"; exit $rc' _ "$MAX_SCRIPT"
}

case "${argv[0]}" in
  staging-prepare) prepare ;;
  staging-wp)      run_wp ;;
  site-preflight)  site_preflight ;;
  site-create)     site_create ;;
  site-job)        site_job ;;
  site-vhost)      site_vhost ;;
  site-wp)         site_wp ;;
esac
