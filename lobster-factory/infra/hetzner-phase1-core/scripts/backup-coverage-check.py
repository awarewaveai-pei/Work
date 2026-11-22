#!/usr/bin/env python3
"""Daily backup coverage check (lobster-factory/docs/operations/BACKUP_COVERAGE_PLAN.md B2, B5).

Reads backup-inventory.json next to this file and fails when:
  - there are no writable mounts at all, or one is in neither a store nor not_backed_up;
  - a mount's volume or bind source differs from the inventory's `sources` (the archive would read a different place);
  - a store's newest snapshot lacks the pipeline's completion marker or an artifact, or the artifact is older than
    max_age_hours;
  - the artifact is not in R2 with the same size, uploaded after it was written (a file above split_threshold_bytes:
    its <name>.parts.json plus parts that add up to its size, see eu-backup/upload-to-r2.sh);
  - an encrypted bundle's members list lacks a required member;
  - an R2 lifecycle rule differs from the inventory, or a bucket lock covers an unlocked prefix
    (cognitive/ must disappear within 7 days: erasure);
  - the monthly restore drill (backup-restore-drill.py, B7) is missing, RUNNING for hours, older than
    restore_drill.max_age_days, not PASS, did not cover every store with a "drill" entry, or left labelled
    containers/volumes or files behind;
  - an id this platform stores for another product's object is gone from that product (B8: next-admin's
    /api/internal/reconcile, one row per inventory reconcile check), or the check could not run;
  - a client site in the registry SITES_DIR (templates/client-wp/render.sh) is unreadable, or lacks its
    <slug>-db.sql.gz / <slug>-wordpress.tgz in the ks-aw-01 pipeline (backup-ks-aw-01.sh section 4b). Each registered
    site is a store "site:<slug>" built here, so its running containers' mounts count as listed. A site whose
    <site dir>/.env exists must also be a member of env.tar.gz.enc (section 5). A site with
    <WP_CRON_STATE_DIR>/paused.<slug>-wp (WordPress not installed yet) is marked 尚未安裝 in its row.
Volumes kept by deprovision-site.sh (<site dir>/DEPROVISIONED) are no longer backed up daily; they are reported in a
"retained-volumes" PASS row as a reminder, not a failure: teardown chose to keep them, and the last snapshots
holding them stay in R2 until the ks-aw-01/ lifecycle expires them.
Writes STATUS_FILE (read by scripts/check-backup-health.ps1 and /ops/backup) and one verdict line. On PASS it touches
OK_STAMP, otherwise sets its mtime to 0, so endpoint-alert.sh (fresh.d registration below) alerts within minutes.
Exit 0 = all PASS, 1 = a FAIL, 2 = the check itself could not run. Cron: cron.d/backup-coverage.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
INVENTORY = os.environ.get("BACKUP_INVENTORY", os.path.join(HERE, "backup-inventory.json"))
STATUS_FILE = os.environ.get("BACKUP_COVERAGE_STATUS", "/var/lib/awarewave/backup-coverage.json")
OK_STAMP = os.environ.get("BACKUP_COVERAGE_OK_STAMP", "/var/lib/awarewave/backup-coverage.ok")
FRESH_REGISTRATION = os.environ.get("BACKUP_COVERAGE_FRESH", "/etc/awarewave-alert/fresh.d/backup-coverage")
STAMP = re.compile(r"^\d{8}-\d{6}$")
CLOCK_SKEW = 300  # R2 last_modified vs. this host's clock
# Client site registry and site dirs: same defaults and override names as templates/client-wp/render.sh.
SITES_DIR = os.environ.get("CLIENT_WP_REGISTRY_DIR", "/etc/awarewave/sites.d")
SITES_ROOT = os.environ.get("CLIENT_WP_SITES_ROOT", "/root/sites")
CRON_STATE = os.environ.get("WP_CRON_STATE_DIR", "/var/lib/wp-cron-runner")  # = wp-cron-runner.sh STATE_DIR
SITE_PIPELINE = "ks-aw-01"  # backup-ks-aw-01.sh backs registered sites up (section 4b)
SITE_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
SITE_KEYS = {"slug", "domain", "ingress", "container", "db_container", "volumes", "port", "compose_file", "vhost_file",
             "created_at"}


def mount_matches(key, pattern):
    return key.startswith(pattern[:-1]) if pattern.endswith("*") else key == pattern


def r2_dir(pipeline, stamp):
    return stamp if pipeline["r2_dir"] == "stamp" else f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}"


def r2_problems(keys, base, size, mtime, threshold):
    """keys: {key: (size, last_modified)} under the snapshot's R2 dir. Returns [] when the artifact is complete."""
    if size <= threshold:
        got = keys.get(base)
        if got is None:
            return [f"not in R2: {base}"]
        if got[0] != size:
            return [f"R2 {base} is {got[0]} bytes, local {size}"]
        return [f"R2 {base} predates the local file"] if got[1] < mtime - CLOCK_SKEW else []
    if f"{base}.parts.json" not in keys:
        return [f"not in R2: {base}.parts.json"]
    parts = {k: v for k, v in keys.items() if k.startswith(f"{base}.part-")}
    if sum(v[0] for v in parts.values()) != size:
        return [f"R2 parts of {base} add up to {sum(v[0] for v in parts.values())} bytes, local {size}"]
    old = sorted(k for k, v in parts.items() if v[1] < mtime - CLOCK_SKEW)
    return [f"R2 {k} predates the local file" for k in old]


def site_store(site):
    """A registered client site as an inventory store (names = render.sh's, already checked by read_sites)."""
    slug = site["slug"]
    arts = [f"{slug}-db.sql.gz", f"{slug}-wordpress.tgz"]
    if site.get("env"):  # its DB passwords: backup-ks-aw-01.sh section 5 encrypts <site dir>/.env with the others
        arts.append({"name": "env.tar.gz.enc", "members_file": "env.tar.gz.enc.members", "members": [site["env"]]})
    return {"id": f"site:{slug}", "pipeline": SITE_PIPELINE, "created": site.get("created"),
            "not_installed": bool(site.get("not_installed")),
            "mounts": [f"{slug}-wp:/var/www/html", f"{slug}-db:/var/lib/mysql"],
            "artifacts": arts,
            "sources": {f"{slug}-wp:/var/www/html": f"{slug}_wordpress_data"}}


def evaluate(inv, mounts, snapshots, r2_keys, lifecycle, locks, now, drill=None, leftovers=(), reconcile=None,
             sites=(), retained=()):
    """Pure: inventory + observed state -> result rows.

    mounts: {"container:destination": source} for running containers' writable mounts (volume name or bind path).
    snapshots: {pipeline: None | {"stamp": dir name, "files": {name: (size, mtime)}, "members": {file: [lines]}}}.
    r2_keys: {pipeline: None (listing failed) | {key: (size, last_modified epoch)} under <prefix>/<dir>/}.
    lifecycle: None (read failed) | {prefix: maxAge seconds}.  locks: None (read failed) | [lock prefix, ...].
    drill: None (no status file) | {"unreadable": why} | backup-restore-drill.py's status JSON.
    leftovers: what the drill left (labelled containers/volumes, files under its work root).
    reconcile: None | {"error": why} | /api/internal/reconcile's answer (B8, one row per inventory check).
    sites: read_sites() -- [{"slug", "created": epoch | None, "env"?: member path, "not_installed"?: bool}
           | {"file", "error"}].
    retained: [(slug, [volume, ...])] -- volumes deprovision-site.sh kept that still exist.
    """
    rows = []
    stores = list(inv["stores"])
    if sites:
        bad = [f"{s['file']}: {s['error']}" for s in sites if "error" in s]
        if SITE_PIPELINE not in inv["pipelines"]:
            bad.append(f"pipeline {SITE_PIPELINE} missing from the inventory: registered sites cannot be checked")
        else:
            stores += [site_store(s) for s in sites if "error" not in s]
        good = sum("error" not in s for s in sites)
        rows.append({"id": "site-registry", "status": "FAIL" if bad else "PASS",
                     "detail": "; ".join(bad) + " -- not backed up" if bad else f"{good} registered site(s) read"})

    def row(rid, problems, ok_detail, plan=None):
        r = {"id": rid, "status": "FAIL" if problems else "PASS", "detail": "; ".join(problems) or ok_detail}
        if plan and problems:
            r["plan"] = plan
        rows.append(r)

    listed = [p for s in stores for p in s["mounts"]] + [p for n in inv["not_backed_up"] for p in n["mounts"]]
    problems = [] if mounts else ["no writable mounts seen: docker returned nothing"]
    problems += [f"not in backup-inventory.json: {m}" for m in sorted(mounts) if not any(mount_matches(m, p) for p in listed)]
    for s in stores:
        for key, want in s.get("sources", {}).items():
            if key in mounts and mounts[key] != want:
                problems.append(f"{key} now mounts {mounts[key]}, inventory and its backup script say {want}")
    row("inventory", problems, f"{len(mounts)} writable mounts, all listed")

    for s in stores:
        pipe = inv["pipelines"][s["pipeline"]]
        snap = snapshots.get(s["pipeline"])
        problems = []
        if s.get("created") and s["created"] > now + CLOCK_SKEW:
            row(s["id"], ["created_at is in the future: registry wrong, the site would never be due"], "")
            continue
        # Cutoff = the snapshot's STAMP (host local time, set before backup-ks-aw-01.sh 4b reads sites.d).
        started = snap and time.mktime(time.strptime(snap["stamp"], "%Y%m%d-%H%M%S"))
        if s.get("created") and (snap is None or s["created"] > started):
            rows.append({"id": s["id"], "status": "PASS",
                         "detail": "registered after the newest snapshot: first due in the next one"})
            continue
        if snap is None:
            problems.append(f"no snapshot directory under {pipe['local_root']}")
        elif pipe.get("complete_marker") and pipe["complete_marker"] not in snap["files"]:
            problems.append(f"{snap['stamp']} has no {pipe['complete_marker']}: the run did not finish")
        else:
            keys = r2_keys.get(s["pipeline"])
            for art in s["artifacts"]:
                spec = art if isinstance(art, dict) else {"name": art}
                name = spec["name"]
                found = snap["files"].get(name)
                if not found or found[0] == 0:
                    problems.append(f"{name} missing or empty in {snap['stamp']}")
                    continue
                size, mtime = found
                age_h = (now - mtime) / 3600
                if age_h > inv["max_age_hours"]:
                    problems.append(f"{name} is {age_h:.0f}h old")
                if "members" in spec:
                    have = snap["members"].get(spec["members_file"])
                    if have is None:
                        problems.append(f"{spec['members_file']} missing")
                    else:
                        problems += [f"{name} lacks {m}" for m in spec["members"] if m not in have]
                base = f"{pipe['r2_prefix']}/{r2_dir(pipe, snap['stamp'])}/{name}"
                if keys is None:
                    problems.append("R2 listing failed")
                else:
                    problems += r2_problems(keys, base, size, mtime, inv["split_threshold_bytes"])
        ok_detail = f"{snap and snap['stamp']}: {len(s['artifacts'])} artifact(s) local and in R2"
        if s.get("not_installed"):  # same checks; the row says why the content is a bare WordPress (SF-E2 #8)
            ok_detail = "尚未安裝 (WordPress not installed yet): " + ok_detail
            problems = [f"尚未安裝; {p}" for p in problems]
        row(s["id"], problems, ok_detail, s.get("plan"))

    expected = inv["r2"]["lifecycle_max_age_seconds"]
    if lifecycle is None:
        problems = ["R2 lifecycle could not be read"]
    else:
        problems = [f"lifecycle {p}: expected {v}s, R2 has {lifecycle.get(p)}" for p, v in expected.items() if lifecycle.get(p) != v]
    if locks is None:
        problems.append("R2 bucket locks could not be read")
    else:
        problems += [f"bucket lock on '{lp}' keeps {p} longer than its lifecycle"
                     for p in inv["r2"]["unlocked_prefixes"] for lp in locks if p.startswith(lp)]
    row("r2-retention", problems, f"{len(expected)} lifecycle rules match, no lock on {', '.join(inv['r2']['unlocked_prefixes'])}")

    if "restore_drill" in inv:
        spec = inv["restore_drill"]
        want = sorted(s["id"] for s in inv["stores"] if "drill" in s)
        ok = f"{drill and drill.get('generated_at', '')[:10]}: {len(want)} databases restored from R2 and checked"
        running = bool(drill) and drill.get("overall") == "RUNNING"
        if drill is None:
            problems = [f"no {spec['status_file']}: the restore drill never ran"]
        elif "unreadable" in drill:
            problems = [f"{spec['status_file']} unreadable: {drill['unreadable']}"]
        else:
            when = datetime.strptime(drill["generated_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
            if running:  # a drill takes minutes; one RUNNING for hours was killed
                problems = [f"drill started {drill['generated_at']} and never finished"] if now - when > 6 * 3600 else []
                ok = f"drill running since {drill['generated_at']}"
            else:
                age_d = (now - when) / 86400
                problems = [f"last drill {drill['generated_at'][:10]} is {age_d:.0f} days old"] if age_d > spec["max_age_days"] else []
                if drill["overall"] == "ERROR":
                    problems.append(f"the drill did not run: {drill.get('error')}")
                problems += [f"{r['id']}: {r['detail']}" for r in drill["rows"] if r["status"] != "PASS"]
                missed = sorted(set(want) - {r["id"] for r in drill["rows"]})
                problems += [f"drill skipped {', '.join(missed)}"] if missed and drill["overall"] != "ERROR" else []
        if not running:
            problems += [f"the drill left {x} behind: restored client data on this host" for x in leftovers]
        row("restore-drill", problems, ok)

    for cid, owner in inv.get("reconcile", {}).get("checks", {}).items():
        got = next((c for c in (reconcile or {}).get("checks", []) if c.get("id") == cid), None)
        if reconcile is None or "error" in reconcile:
            problems = [f"/api/internal/reconcile: {(reconcile or {}).get('error', 'not called')}"]
        elif got is None:
            problems = ["not reported by /api/internal/reconcile"]
        elif got.get("error"):
            problems = [got["error"]]
        else:
            problems = [f"{len(got['dangling'])} id(s) {owner} does not have: "
                        + ", ".join(f"{p['where']} -> {p['id']}" for p in got["dangling"][:3])] if got["dangling"] else []
        row(f"ids:{cid}", problems, f"{got and got.get('checked')} stored ids all exist in {owner}", "B8")

    if retained:
        rows.append({"id": "retained-volumes", "status": "PASS",
                     "detail": "kept after teardown, NOT in the daily backup: "
                               + "; ".join(f"{slug} ({', '.join(v)})" for slug, v in retained)})
    return rows


# ---- host IO -------------------------------------------------------------------------------------------------

def running_mounts():
    names = subprocess.run(["docker", "ps", "--format", "{{.Names}}"], check=True, capture_output=True, text=True).stdout.split()
    if not names:
        return {}
    info = json.loads(subprocess.run(["docker", "inspect", *names], check=True, capture_output=True, text=True).stdout)
    return {f"{c['Name'].lstrip('/')}:{m['Destination']}": (m.get("Name") or m.get("Source"))
            for c in info for m in c.get("Mounts", []) if m.get("RW") and m.get("Type") in ("volume", "bind")}


def newest_snapshot(root):
    try:
        stamps = sorted(d for d in os.listdir(root) if STAMP.match(d) and os.path.isdir(os.path.join(root, d)))
    except FileNotFoundError:
        return None
    if not stamps:
        return None
    d = os.path.join(root, stamps[-1])
    files, members = {}, {}
    for name in os.listdir(d):
        path = os.path.join(d, name)
        if os.path.isfile(path):
            st = os.stat(path)
            files[name] = (st.st_size, st.st_mtime)
            if name.endswith(".members"):
                with open(path, encoding="utf-8") as fh:
                    members[name] = [line.strip().lstrip("./") for line in fh if line.strip()]
    return {"stamp": stamps[-1], "files": files, "members": members}


def read_sites(d=None, root=None, cron_state=None):
    """sites.d -> [{"slug", "created": epoch | None, "env"?, "not_installed"?} | {"file", "error"}]. Same refusal rule
    as backup-ks-aw-01.sh 4b. env = the tar member name of <root>/<slug>/.env when that file exists."""
    d, root, cron_state = d or SITES_DIR, root or SITES_ROOT, cron_state or CRON_STATE
    try:
        names = sorted(n for n in os.listdir(d) if n.endswith(".json") and not n.startswith("."))
    except FileNotFoundError:
        return []
    out = []
    for name in names:
        slug = name[:-5]
        try:
            with open(os.path.join(d, name), encoding="utf-8") as fh:
                r = json.load(fh)
        except (OSError, ValueError) as e:
            out.append({"file": name, "error": f"unreadable ({type(e).__name__})"})
            continue
        if not SITE_SLUG.match(slug):
            out.append({"file": name, "error": "file name is not a site slug"})
        elif not isinstance(r, dict) or set(r) != SITE_KEYS:
            out.append({"file": name, "error": "keys differ from the template"})
        elif (r["slug"], r["container"], r["db_container"], r["volumes"]) != (
                slug, f"{slug}-wp", f"{slug}-db", [f"{slug}_wordpress_data", f"{slug}_db_data"]):
            out.append({"file": name, "error": "slug/container/db_container/volumes differ from what render.sh derives"})
        else:
            try:
                created = datetime.strptime(r["created_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
            except (TypeError, ValueError):
                created = None  # unknown age: due now
            site = {"slug": slug, "created": created}
            if os.path.isfile(os.path.join(root, slug, ".env")):
                site["env"] = f"{root.strip('/')}/{slug}/.env"
            if os.path.exists(os.path.join(cron_state, f"paused.{slug}-wp")):
                site["not_installed"] = True
            out.append(site)
    return out


def retained_volumes(root=None):
    """[(slug, [volume, ...])] for <site dir>/DEPROVISIONED markers whose volumes still exist (a purge removes both)."""
    root = root or SITES_ROOT
    try:
        dirs = sorted(os.listdir(root))
    except FileNotFoundError:
        return []
    marked = []
    for slug in dirs:
        try:
            with open(os.path.join(root, slug, "DEPROVISIONED"), encoding="utf-8") as fh:
                vols = next((ln.split("=", 1)[1].split() for ln in fh if ln.startswith("volumes=")), [])
        except OSError:
            continue
        marked.append((slug, vols))
    if not marked:
        return []
    have = set(subprocess.run(["docker", "volume", "ls", "-q"], check=True, capture_output=True, text=True).stdout.split())
    return [(slug, [v for v in vols if v in have]) for slug, vols in marked if any(v in have for v in vols)]


def parse_env(text):
    env = {}
    for line in text.splitlines():
        m = re.match(r"^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$", line)
        if m:
            env[m.group(1)] = m.group(2).strip().strip("'\"")
    return env


def read_env(path):
    with open(path, encoding="utf-8") as fh:
        return parse_env(fh.read())


def cf_get(url, token):
    """GET with 3 tries on a transient answer (connection error, 429, 5xx)."""
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500:
                raise
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"Cloudflare API unreachable after 3 tries: {url.split('?')[0]}")


def r2_list(base, token, prefix):
    keys, cursor = {}, None
    while True:
        q = {"prefix": prefix, "per_page": "1000", **({"cursor": cursor} if cursor else {})}
        body = cf_get(f"{base}/objects?{urllib.parse.urlencode(q)}", token)
        for o in body.get("result", []):
            when = datetime.strptime(o["last_modified"][:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp()
            keys[o["key"]] = (int(o["size"]), when)
        info = body.get("result_info") or {}
        cursor = info.get("cursor")
        if not info.get("is_truncated") or not cursor:
            return keys


def r2_lifecycle(base, token):
    out = {}
    for r in cf_get(f"{base}/lifecycle", token).get("result", {}).get("rules", []):
        prefix = (r.get("conditions") or {}).get("prefix")
        cond = (r.get("deleteObjectsTransition") or {}).get("condition") or {}
        if r.get("enabled") and prefix and cond.get("type") == "Age":
            out[prefix] = cond.get("maxAge")
    return out


def r2_locks(base, token):
    return [r.get("prefix") or "" for r in cf_get(f"{base}/lock", token).get("result", {}).get("rules", []) if r.get("enabled")]


def write_atomic(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(f"{path}.tmp", "w", encoding="utf-8") as fh:
        fh.write(text)
    os.replace(f"{path}.tmp", path)


def signal(ok):
    """Dead-man stamp for endpoint-alert.sh: fresh only after a PASS, epoch 0 otherwise (alerts now, not in 26h)."""
    write_atomic(FRESH_REGISTRATION, f"{OK_STAMP} 93600 backup-coverage\n")
    if not os.path.exists(OK_STAMP):
        write_atomic(OK_STAMP, "")
    os.utime(OK_STAMP, None if ok else (0, 0))


def r2_base(inv, env):
    return (f"https://api.cloudflare.com/client/v4/accounts/{env.get('R2_ACCOUNT_ID') or 'aea1a836e6f8b8d7f18206dc8e848bd6'}"
            f"/r2/buckets/{inv['r2']['bucket']}")


def read_drill(inv):
    """A broken status file fails the restore-drill row only, never the whole check."""
    path = inv.get("restore_drill", {}).get("status_file")
    if not path or not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as fh:
            drill = json.load(fh)
        datetime.strptime(drill["generated_at"], "%Y-%m-%dT%H:%M:%SZ")
        if drill["overall"] not in ("PASS", "FAIL", "ERROR", "RUNNING") or not isinstance(drill["rows"], list):
            raise ValueError(f"overall={drill['overall']!r}")
        return drill
    except (OSError, ValueError, KeyError, TypeError) as exc:
        return {"unreadable": f"{type(exc).__name__}: {exc}"}


def drill_leftovers(inv):
    spec = inv.get("restore_drill")
    if not spec:
        return []
    out = []
    for kind, ls in (("container", ["ps", "-aq"]), ("volume", ["volume", "ls", "-q"])):
        ids = subprocess.run(["docker", *ls, "--filter", f"label={spec['label']}"], check=True, capture_output=True, text=True).stdout.split()
        out += [f"{len(ids)} {kind}(s) labelled {spec['label']}"] if ids else []
    if os.path.isdir(spec["work_root"]) and os.listdir(spec["work_root"]):
        out.append(f"{len(os.listdir(spec['work_root']))} item(s) in {spec['work_root']}")
    return out


def read_reconcile(inv):
    """GET next-admin's /api/internal/reconcile (B8). Three tries: the 03:00 auto-deploy may still be restarting it."""
    spec = inv.get("reconcile")
    if not spec:
        return None
    try:
        token = read_env(spec["token_file"])["RECONCILE_TOKEN"]
    except (OSError, KeyError) as exc:
        return {"error": f"no RECONCILE_TOKEN in {spec['token_file']} ({type(exc).__name__})"}
    last = "unknown"
    for attempt in range(3):
        try:
            req = urllib.request.Request(spec["url"], headers={"Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
            if e.code < 500:
                break
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            last = f"{type(e).__name__}: {e}"
        time.sleep(30 * (attempt + 1))
    return {"error": last}


def main():
    with open(INVENTORY, encoding="utf-8") as fh:
        inv = json.load(fh)
    env = read_env(inv["r2"]["credentials_file"])
    token = env["R2_API_TOKEN"]
    base = r2_base(inv, env)
    snapshots, r2_keys = {}, {}
    for pid, pipe in inv["pipelines"].items():
        snapshots[pid] = snap = newest_snapshot(pipe["local_root"])
        try:
            r2_keys[pid] = r2_list(base, token, f"{pipe['r2_prefix']}/{r2_dir(pipe, snap['stamp'])}/") if snap else {}
        except Exception:  # noqa: BLE001 -- reported per store as "R2 listing failed"
            r2_keys[pid] = None
    lifecycle = locks = None
    try:
        lifecycle = r2_lifecycle(base, token)
        locks = r2_locks(base, token)
    except Exception:  # noqa: BLE001 -- reported in the r2-retention row
        pass
    rows = evaluate(inv, running_mounts(), snapshots, r2_keys, lifecycle, locks, time.time(), read_drill(inv),
                    drill_leftovers(inv), read_reconcile(inv), read_sites(), retained_volumes())
    fails = [r for r in rows if r["status"] == "FAIL"]
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    write_atomic(STATUS_FILE, json.dumps({"generated_at": stamp, "overall": "FAIL" if fails else "PASS", "rows": rows},
                                         ensure_ascii=False, indent=1))
    signal(not fails)
    for r in fails:
        print(f"[{stamp}] FAIL {r['id']}: {r['detail']}" + (f" (plan {r['plan']})" if r.get("plan") else ""))
    print(f"[{stamp}] === backup-coverage {'FAILED: ' + str(len(fails)) if fails else 'PASSED'} ===")
    return 1 if fails else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 -- the check must say it did not run, never leave an old PASS behind
        now = f"{datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ}"
        try:
            write_atomic(STATUS_FILE, json.dumps({"generated_at": now, "overall": "ERROR", "error": str(exc), "rows": []}))
            signal(False)
        except OSError:
            pass
        print(f"[{now}] === backup-coverage ERROR: {exc} ===")
        sys.exit(2)
