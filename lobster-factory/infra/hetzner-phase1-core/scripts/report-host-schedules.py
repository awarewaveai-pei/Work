#!/usr/bin/env python3
"""Inventory of every schedule on this host, for /ops/schedules (cron: scripts/cron.d/awarewave-schedules).

Reads what is actually scheduled, not what the repo says should be:
  - every user crontab (/var/spool/cron/crontabs/*), /etc/crontab and /etc/cron.d/* lines;
  - files in /etc/cron.{hourly,daily,weekly,monthly}/ (run-parts: no line, no outcome);
  - systemd timers whose unit file is in /etc/systemd/system (admin-installed; /usr/lib = vendor).
A cron file or run-parts script owned by a dpkg package is the OS's own housekeeping and is skipped (listed in
skipped_package_files); so are /etc/crontab's run-parts lines.
A cron line run through `cron-run.sh <key> '<cmd>'` gets that key and the outcome cron-run.sh recorded in
JOBS_DIR/<key>.json. Any other line is reported with key null and its command (secrets redacted): the page shows it
as unregistered, so a schedule added by hand on the host is never invisible.
cron_files_drift = /etc/cron.d files whose repo copy (scripts/cron.d/, installed by install-host-schedules.sh) differs.
Writes OUT_FILE by rename (next-admin reads it at /host-status/host-schedules.json). Exit 0 written, 2 could not write.
"""
import glob
import json
import os
import re
import subprocess
import sys
import tempfile
import time

OUT_FILE = os.environ.get("HOST_SCHEDULES_FILE", "/var/lib/awarewave/host-schedules.json")
JOBS_DIR = os.environ.get("CRON_RUN_JOBS_DIR", "/var/lib/awarewave/jobs")
REPO_CRON_DIR = os.environ.get("REPO_CRON_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "cron.d"))

ENV_LINE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*\s*=")
WRAPPED = re.compile(r"(?:^|\s)\S*cron-run\.sh\s+([a-z0-9_]+)\s+'([^']*)'\s*$")
LOG = re.compile(r">>\s*(\S+)")
SECRET = re.compile(r"\b(\w*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_KEY)\w*)=([^\s&'\"]+)", re.I)
# Other places a cron line carries a secret: auth headers, curl -u / --user, user:pass@ in a URL, --password <x>,
# and secret-named query parameters. Anything matched is replaced; the page only needs to recognise the job.
SECRET_ARGS = [
    (re.compile(r"(?i)((?:authorization|x-[\w-]*(?:key|token|secret))\s*:\s*)(?:bearer\s+|basic\s+)?[^'\"\s]+"), r"\1***"),
    (re.compile(r"(\s(?:-u|--user)\s+)\S+"), r"\1***"),
    (re.compile(r"(://)[^/\s:@]+:[^/\s@]+@"), r"\1***@"),
    (re.compile(r"(?i)(--?\w*(?:password|passwd|token|secret|api-?key)\w*[ =])\S+"), r"\1***"),
    (re.compile(r"(?i)([?&]\w*(?:token|secret|key|password|sig)\w*=)[^&\s'\"]+"), r"\1***"),
]
# run-parts runs only names made of [A-Za-z0-9_-] (no dots): anything else in cron.{daily,...} never runs.
RUN_PARTS_NAME = re.compile(r"^[A-Za-z0-9_-]+$")
RUN_PARTS = {"hourly": "@hourly", "daily": "@daily", "weekly": "@weekly", "monthly": "@monthly"}


def iso(epoch):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch))


def redact(cmd):
    # NAME_FILE=<path> names where a secret lives, not the secret: kept.
    cmd = SECRET.sub(lambda m: m.group(0) if m.group(1).upper().endswith("_FILE") else m.group(1) + "=***", cmd)
    for pat, repl in SECRET_ARGS:
        cmd = pat.sub(repl, cmd)
    return cmd


def parse_cron(text, source, has_user):
    """Lines of one crontab-format file -> [{source, schedule, user, command}]. Comments and VAR= lines dropped."""
    out = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or ENV_LINE.match(line):
            continue
        parts = line.split()
        if parts[0].startswith("@"):
            sched, rest = parts[0], parts[1:]
        else:
            if len(parts) < 6:
                continue
            sched, rest = " ".join(parts[:5]), parts[5:]
        user = None
        if has_user:
            if not rest:
                continue
            user, rest = rest[0], rest[1:]
        if not rest:
            continue
        # Keep the command's own spacing: cut the leading fields off the raw line.
        cmd = line
        for tok in (sched.split() + ([user] if user else [])):
            cmd = cmd[cmd.index(tok) + len(tok):]
        out.append({"source": source, "schedule": sched, "user": user, "command": cmd.strip()})
    return out


def entry_for(line, records):
    """One cron line -> the published entry. Wrapped lines carry their key and last outcome; the rest their command."""
    m = WRAPPED.search(line["command"])
    inner = m.group(2) if m else line["command"]
    log = LOG.search(inner)
    e = {"source": line["source"], "schedule": line["schedule"], "key": m.group(1) if m else None,
         "records_result": bool(m), "log": log.group(1) if log else None, "last": None}
    if m:
        e["last"] = records.get(m.group(1))
    else:
        e["command"] = redact(inner)[:300]
    return e


def build(lines, run_parts, timers, records, drift, skipped, errors, now):
    entries = [entry_for(l, records) for l in lines]
    for path, sched in run_parts:
        key = re.sub(r"[^a-z0-9]+", "_", os.path.basename(path).lower()).strip("_")
        entries.append({"source": path, "schedule": sched, "key": "run_parts_" + key, "records_result": False,
                        "log": None, "last": None})
    entries.extend(timers)
    return {"generated_at": iso(now), "entries": entries, "cron_files_drift": sorted(drift),
            "skipped_package_files": sorted(skipped), "errors": errors}


# ---- host I/O (not unit-tested; the test drives build() / parse_cron() / entry_for()) ----

def package_owned(path):
    return subprocess.run(["dpkg", "-S", path], capture_output=True).returncode == 0


def read(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


def collect_cron(errors, skipped):
    lines = []
    for path in sorted(glob.glob("/var/spool/cron/crontabs/*")):
        try:
            lines += parse_cron(read(path), "crontab:" + os.path.basename(path), False)
        except OSError as e:
            errors.append(f"{path}: {e}")
    try:
        lines += [l for l in parse_cron(read("/etc/crontab"), "/etc/crontab", True) if "run-parts" not in l["command"]]
    except OSError as e:
        errors.append(f"/etc/crontab: {e}")
    for path in sorted(glob.glob("/etc/cron.d/*")):
        name = os.path.basename(path)
        if name.startswith(".") or "." in name or name.endswith("~") or name == "placeholder":
            continue  # cron ignores these names
        if package_owned(path):
            skipped.append(path)
            continue
        try:
            lines += parse_cron(read(path), path, True)
        except OSError as e:
            errors.append(f"{path}: {e}")
    return lines


def collect_run_parts(skipped):
    found = []
    for kind, sched in RUN_PARTS.items():
        for path in sorted(glob.glob(f"/etc/cron.{kind}/*")):
            name = os.path.basename(path)
            if not RUN_PARTS_NAME.match(name) or not os.access(path, os.X_OK):
                continue
            if package_owned(path):
                skipped.append(path)
            else:
                found.append((path, sched))
    return found


def collect_timers(errors):
    try:
        listed = json.loads(subprocess.run(["systemctl", "list-timers", "--all", "-o", "json"],
                                           capture_output=True, text=True, check=True).stdout)
    except (OSError, subprocess.CalledProcessError, ValueError) as e:
        errors.append(f"systemctl list-timers: {e}")
        return []
    out = []
    for t in listed:
        unit = t.get("unit", "")
        show = lambda u, props: dict(  # noqa: E731
            l.split("=", 1) for l in subprocess.run(["systemctl", "show", "--timestamp=unix", u, "-p", ",".join(props)],
                                                    capture_output=True, text=True).stdout.splitlines() if "=" in l)
        frag = show(unit, ["FragmentPath"]).get("FragmentPath", "")
        if not frag.startswith("/etc/systemd/system/") or package_owned(frag):
            continue
        svc = show(t.get("activates", ""), ["ExecMainStartTimestamp", "ExecMainExitTimestamp", "ExecMainStatus", "Result"])
        stamp = lambda v: iso(int(v.lstrip("@"))) if v.startswith("@") and v.lstrip("@").isdigit() else None  # noqa: E731
        last, nxt = t.get("last") or 0, t.get("next") or 0
        finished = stamp(svc.get("ExecMainExitTimestamp", ""))
        out.append({
            # No next run = the timer is stopped or disabled: published as @inactive, never as a job that is fine.
            "source": "systemd:" + frag,
            "schedule": "@inactive" if not nxt else "@every %ds" % ((nxt - last) // 1_000_000) if last and nxt > last else "@timer",
            "key": re.sub(r"[^a-z0-9]+", "_", unit.removesuffix(".timer").lower()).strip("_"),
            "records_result": True, "log": "journalctl -u " + t.get("activates", ""),
            "last": None if not finished else {
                "started_at": stamp(svc.get("ExecMainStartTimestamp", "")), "finished_at": finished,
                "exit_code": 0 if svc.get("Result") == "success" else int(svc.get("ExecMainStatus") or 1) or 1},
        })
    return out


def collect_records(errors):
    recs = {}
    for path in glob.glob(os.path.join(JOBS_DIR, "*.json")):
        try:
            r = json.loads(read(path))
            recs[r["key"]] = {k: r.get(k) for k in ("started_at", "finished_at", "exit_code")}
        except (OSError, ValueError, KeyError, TypeError) as e:
            errors.append(f"{path}: {e}")
    return recs


def collect_drift():
    drift = []
    for repo in glob.glob(os.path.join(REPO_CRON_DIR, "*")):
        live = "/etc/cron.d/" + os.path.basename(repo)
        try:
            if read(repo) != read(live):
                drift.append(os.path.basename(repo))
        except OSError:
            drift.append(os.path.basename(repo))
    return drift


def main():
    errors, skipped = [], []
    doc = build(collect_cron(errors, skipped), collect_run_parts(skipped), collect_timers(errors),
                collect_records(errors), collect_drift(), skipped, errors, time.time())
    try:
        os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(OUT_FILE), prefix=".host-schedules.")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False)
        os.chmod(tmp, 0o644)
        os.replace(tmp, OUT_FILE)
    except OSError as e:
        print(f"[{iso(time.time())}] cannot write {OUT_FILE}: {e}", file=sys.stderr)
        return 2
    unreg = sum(1 for e in doc["entries"] if e["key"] is None)
    print(f"[{doc['generated_at']}] {len(doc['entries'])} entries, {unreg} unregistered, "
          f"drift={doc['cron_files_drift']}, errors={len(errors)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
