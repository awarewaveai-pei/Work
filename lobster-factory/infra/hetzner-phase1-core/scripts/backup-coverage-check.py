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
    (cognitive/ must disappear within 7 days: erasure).
Writes STATUS_FILE (read by scripts/check-backup-health.ps1 and /ops/backup) and one verdict line. On PASS it touches
OK_STAMP, otherwise sets its mtime to 0, so endpoint-alert.sh (fresh.d registration below) alerts within minutes.
Exit 0 = all PASS, 1 = a FAIL, 2 = the check itself could not run. Cron: backup-coverage.cron.
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


def evaluate(inv, mounts, snapshots, r2_keys, lifecycle, locks, now):
    """Pure: inventory + observed state -> result rows.

    mounts: {"container:destination": source} for running containers' writable mounts (volume name or bind path).
    snapshots: {pipeline: None | {"stamp": dir name, "files": {name: (size, mtime)}, "members": {file: [lines]}}}.
    r2_keys: {pipeline: None (listing failed) | {key: (size, last_modified epoch)} under <prefix>/<dir>/}.
    lifecycle: None (read failed) | {prefix: maxAge seconds}.  locks: None (read failed) | [lock prefix, ...].
    """
    rows = []

    def row(rid, problems, ok_detail, plan=None):
        r = {"id": rid, "status": "FAIL" if problems else "PASS", "detail": "; ".join(problems) or ok_detail}
        if plan and problems:
            r["plan"] = plan
        rows.append(r)

    listed = [p for s in inv["stores"] for p in s["mounts"]] + [p for n in inv["not_backed_up"] for p in n["mounts"]]
    problems = [] if mounts else ["no writable mounts seen: docker returned nothing"]
    problems += [f"not in backup-inventory.json: {m}" for m in sorted(mounts) if not any(mount_matches(m, p) for p in listed)]
    for s in inv["stores"]:
        for key, want in s.get("sources", {}).items():
            if key in mounts and mounts[key] != want:
                problems.append(f"{key} now mounts {mounts[key]}, inventory and its backup script say {want}")
    row("inventory", problems, f"{len(mounts)} writable mounts, all listed")

    for s in inv["stores"]:
        pipe = inv["pipelines"][s["pipeline"]]
        snap = snapshots.get(s["pipeline"])
        problems = []
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
        row(s["id"], problems, f"{snap and snap['stamp']}: {len(s['artifacts'])} artifact(s) local and in R2", s.get("plan"))

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


def read_env(path):
    env = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            m = re.match(r"^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$", line)
            if m:
                env[m.group(1)] = m.group(2).strip().strip("'\"")
    return env


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


def main():
    with open(INVENTORY, encoding="utf-8") as fh:
        inv = json.load(fh)
    env = read_env(inv["r2"]["credentials_file"])
    token = env["R2_API_TOKEN"]
    base = (f"https://api.cloudflare.com/client/v4/accounts/{env.get('R2_ACCOUNT_ID') or 'aea1a836e6f8b8d7f18206dc8e848bd6'}"
            f"/r2/buckets/{inv['r2']['bucket']}")
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
    rows = evaluate(inv, running_mounts(), snapshots, r2_keys, lifecycle, locks, time.time())
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
