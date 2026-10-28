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
Clocks that are not on this host's cron but that we set (handoffs/2026-10-25-schedules-off-trigger C5), as entries too:
  - pg_cron jobs in supabase-db (key pg_cron_<job>, name = jobname; last finished run from cron.job_run_details);
  - active n8n workflows with a schedule/cron trigger node (key n8n_<id>, name = workflow name);
  - reports another machine commits to the repo (cloud routines, the laptop's status reports): last = the newest commit
    of that path on /root/Work origin/main (fetched daily by other jobs), stale_after_s = how old it may get;
  - GitHub Actions workflows with a schedule (key gha_<file>; latest scheduled/manual main-branch result).
A collector that cannot read its source adds to external_errors (the page shows that as a failure), never an empty
list; kept apart from errors, which means "this host's own schedules are only partly known".
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
import urllib.request

OUT_FILE = os.environ.get("HOST_SCHEDULES_FILE", "/var/lib/awarewave/host-schedules.json")
JOBS_DIR = os.environ.get("CRON_RUN_JOBS_DIR", "/var/lib/awarewave/jobs")
REPO_CRON_DIR = os.environ.get("REPO_CRON_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "cron.d"))
WORK_REPO = os.environ.get("WORK_REPO_DIR", "/root/Work")
GITHUB_REPO = os.environ.get("GITHUB_REPO", "awarewaveai-pei/Work")
DAY_S = 86400
# (key, repo path, cadence, stale after days) -- the same contract as scripts/routine-output-watchdog.sh.
REPO_REPORTS = [
    ("cloud_phase4_weekly", "agency-os/reports/repair-center/phase4-LATEST.md", "@weekly", 8),
    ("cloud_weekly_review", "agency-os/reports/weekly/weekly-automation-LATEST.md", "@weekly", 9),
    ("cloud_monthly_review", "agency-os/reports/monthly/monthly-review-LATEST.md", "@monthly", 35),
    ("laptop_status_reports", "agency-os/reports/status", "@daily", 3),
]

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


def slug(s):
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def done(ts, ok):
    """A finished run as the page reads it (exit 0 / 1); no finish time = no record."""
    return {"started_at": None, "finished_at": ts, "exit_code": 0 if ok else 1} if ts else None


def pg_cron_entries(tsv):
    """psql -At rows 'jobname<TAB>schedule<TAB>status<TAB>end_time' -> entries (one per active job)."""
    out = []
    for line in tsv.splitlines():
        if not line.strip():
            continue
        name, sched, status, end = (line.split("\t") + ["", "", "", ""])[:4]
        out.append({"source": "pg_cron:supabase-db", "schedule": sched, "key": "pg_cron_" + slug(name), "name": name,
                    "records_result": True, "log": "cron.job_run_details", "last": done(end, status == "succeeded")})
    return out


def n8n_entries(tsv):
    """psql -At rows 'id<TAB>name<TAB>status<TAB>stopped_at' -> entries (active workflows with a time trigger)."""
    out = []
    for line in tsv.splitlines():
        if not line.strip():
            continue
        wid, name, status, stopped = (line.split("\t") + ["", "", "", ""])[:4]
        # The id as is: n8n ids differ by case, a slug would merge two workflows into one row.
        out.append({"source": "n8n:" + wid, "schedule": "@timer", "key": "n8n_" + wid, "name": name,
                    "records_result": True, "log": "n8n execution_entity", "last": done(stopped, status == "success")})
    return out


def repo_report_entry(key, path, cadence, days, commit_epoch):
    return {"source": "repo:" + path, "schedule": cadence, "key": key, "records_result": True, "log": None,
            "stale_after_s": days * DAY_S, "last": done(iso(commit_epoch) if commit_epoch else None, True)}


GHA_NAME = re.compile(r"^name:\s*['\"]?(.+?)['\"]?\s*$", re.M)
GHA_CRON = re.compile(r"^\s*-\s*cron:\s*['\"]([^'\"]+)['\"]", re.M)


def gha_workflow(file, text):
    """A workflow file -> (file, name, first cron) when it runs on a schedule, else None."""
    cron, name = GHA_CRON.search(text), GHA_NAME.search(text)
    return (file, name.group(1) if name else file, cron.group(1)) if cron else None


def gha_decided_runs(runs):
    """Only operational main-branch runs count. Creation order prevents an old rerun replacing a newer execution."""
    return sorted((r for r in runs if r.get("event") in ("schedule", "workflow_dispatch")
                   and r.get("head_branch") == "main" and r.get("status") == "completed"
                   and r.get("conclusion") and r["conclusion"] not in ("cancelled", "skipped")),
                  key=lambda r: (r.get("created_at", ""), r.get("id", 0)), reverse=True)


def gha_entry(file, name, cron, runs_json):
    """Latest operational result; scheduled timestamps remain separate so a manual run cannot repair the clock."""
    runs = gha_decided_runs(runs_json.get("workflow_runs") or [])
    run = runs[0] if runs else None
    scheduled = [r for r in runs if r["event"] == "schedule"]
    return {"source": "github:" + file, "schedule": cron, "key": "gha_" + slug(file.rsplit(".", 1)[0]), "name": name,
            "records_result": True, "log": run.get("html_url") if run else None,
            "last": done(run.get("updated_at"), run.get("conclusion") == "success") if run else None,
            # GitHub starts scheduled runs late and drops some under load: a sub-hourly schedule is late after 2 h.
            # A manual rerun keeps event=schedule but updates updated_at; only creation proves the clock fired.
            **({"stale_after_s": 2 * 3600,
                "latest_scheduled_at": scheduled[0].get("created_at") if scheduled else None,
                "previous_scheduled_at": scheduled[1].get("created_at") if len(scheduled) > 1 else None}
               if cron.split()[1:2] == ["*"] else {})}


def collect_gha_runs(file):
    """Query events separately: unrelated push/PR runs cannot crowd operational results out of the first page."""
    runs = []
    for event, needed in (("schedule", 2), ("workflow_dispatch", 1)):
        found = []
        for page in range(1, 11):  # GitHub caps filtered searches at 1,000 results.
            url = (f"https://api.github.com/repos/{GITHUB_REPO}/actions/workflows/{file}/runs"
                   f"?event={event}&branch=main&status=completed&per_page=100&page={page}")
            req = urllib.request.Request(url, headers={"User-Agent": "awarewave-host-schedules",
                                                       "Accept": "application/vnd.github+json"})
            with urllib.request.urlopen(req, timeout=20) as response:
                batch = json.loads(response.read().decode("utf-8"))["workflow_runs"]
            found.extend(gha_decided_runs(batch))
            if len(found) >= needed or len(batch) < 100:
                break
        else:
            raise ValueError(f"{event}: no decided result within GitHub's 1,000-run search limit")
        runs.extend(found)
    return {"workflow_runs": runs}


def build(lines, run_parts, timers, records, drift, skipped, errors, now, external=(), external_errors=()):
    entries = [entry_for(l, records) for l in lines]
    for path, sched in run_parts:
        key = re.sub(r"[^a-z0-9]+", "_", os.path.basename(path).lower()).strip("_")
        entries.append({"source": path, "schedule": sched, "key": "run_parts_" + key, "records_result": False,
                        "log": None, "last": None})
    entries.extend(timers)
    entries.extend(external)
    return {"generated_at": iso(now), "entries": entries, "cron_files_drift": sorted(drift),
            "skipped_package_files": sorted(skipped), "errors": errors, "external_errors": list(external_errors)}


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


PG_CRON_SQL = (
    "select j.jobname, j.schedule, coalesce(d.status, ''), "
    "coalesce(to_char(d.end_time at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'), '') from cron.job j "
    "left join lateral (select status, end_time from cron.job_run_details where jobid = j.jobid and end_time is not null "
    "order by end_time desc limit 1) d on true where j.active order by j.jobname")
N8N_SQL = (
    "select w.id, w.name, coalesce(e.status, ''), "
    "coalesce(to_char(e.\"stoppedAt\" at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'), '') from workflow_entity w "
    "left join lateral (select status, \"stoppedAt\" from execution_entity where \"workflowId\" = w.id "
    "and mode = 'trigger' and \"stoppedAt\" is not null order by \"stoppedAt\" desc limit 1) e on true "
    "left join workflow_history h on h.\"versionId\" = w.\"activeVersionId\" "
    "where w.active and (coalesce(h.nodes, w.nodes)::text like '%n8n-nodes-base.scheduleTrigger%' "
    "or coalesce(h.nodes, w.nodes)::text like '%n8n-nodes-base.cron%') "
    "order by w.name")


def psql(db, sql):
    return subprocess.run(["docker", "exec", "supabase-db", "psql", "-U", "postgres", "-d", db, "-At", "-F", "\t",
                           "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True, check=True, timeout=30).stdout


def collect_external(errors):
    out = []
    for label, db, sql, parse in (("pg_cron", "postgres", PG_CRON_SQL, pg_cron_entries), ("n8n", "n8n", N8N_SQL, n8n_entries)):
        try:
            out += parse(psql(db, sql))
        except (OSError, subprocess.SubprocessError) as e:
            errors.append(f"{label}: {getattr(e, 'stderr', '') or e}".strip()[:200])
    for key, path, cadence, days in REPO_REPORTS:
        try:
            ts = subprocess.run(["git", "-C", WORK_REPO, "log", "-1", "--format=%ct", "origin/main", "--", path],
                                capture_output=True, text=True, check=True, timeout=30).stdout.strip()
            out.append(repo_report_entry(key, path, cadence, days, int(ts) if ts.isdigit() else None))
        except (OSError, subprocess.SubprocessError) as e:
            errors.append(f"repo {path}: {e}"[:200])
    # Public API: normally two calls per workflow every 10 min (schedule + manual), under 60/h for this inventory.
    try:
        git = lambda *a: subprocess.run(["git", "-C", WORK_REPO, *a], capture_output=True, text=True,  # noqa: E731
                                        check=True, timeout=30).stdout
        files = [f for f in git("ls-tree", "--name-only", "origin/main", ".github/workflows/").split()
                 if f.endswith((".yml", ".yaml"))]
        flows = [w for w in (gha_workflow(os.path.basename(f), git("show", "origin/main:" + f)) for f in files) if w]
    except (OSError, subprocess.SubprocessError) as e:
        errors.append(f"github workflows: {e}"[:200])
        flows = []
    for file, name, cron in flows:
        try:
            out.append(gha_entry(file, name, cron, collect_gha_runs(file)))
        except (OSError, ValueError, KeyError) as e:
            errors.append(f"github {file}: {e}"[:200])
    return out


def main():
    errors, skipped = [], []
    external_errors = []
    doc = build(collect_cron(errors, skipped), collect_run_parts(skipped), collect_timers(errors),
                collect_records(errors), collect_drift(), skipped, errors, time.time(),
                collect_external(external_errors), external_errors)
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
          f"drift={doc['cron_files_drift']}, errors={len(errors)}, external_errors={len(external_errors)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
