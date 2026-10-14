#!/usr/bin/env python3
"""Monthly restore drill (lobster-factory/docs/operations/BACKUP_COVERAGE_PLAN.md B7).

For every store in backup-inventory.json with a "drill" entry: download its newest regular snapshot from R2 (a split
file is reassembled and checked against its parts.json sha256), restore it into a throwaway container of the exact
image the running container uses (--network none, capped, labelled volumes), and FAIL the store unless
  - the snapshot is fresh, a plain dump ends with its dumper's trailer (a cut at a statement boundary loads cleanly),
    and the dump holds table data, including every table in the store's drill "expect" list;
  - postgres: the load stops on no error and every COPY block's rows equal the restored table's count;
  - mysql: the load exits 0 (the client stops at the first error) and every table the dump inserts into has rows;
  - every database the prod container holds came back (a database added to prod but not to the backup);
  - supabase: DR runbook §4 steps 3-4 exactly (bare cluster, the backed-up key and .env password,
    supabase-restore-fixup.sql). Only errors this cluster's restore cannot avoid are tolerated; their outcome is
    checked instead: event triggers as defined in the dump, database owners/grants/settings as in prod (read-only),
    every vault secret decrypts, every COPY count matches.
Writes restore_drill.status_file (RUNNING while it works); backup-coverage-check.py fails its restore-drill row when
that is missing, RUNNING for hours, older than max_age_days, not PASS, lacks a store, or labelled leftovers remain.
Store ids as arguments: drill only those, write nothing. Exit 0 = PASS, 1 = a FAIL, 2 = the drill could not run.
After adding a "drill" entry, run the full drill once (the coverage row fails until a run covers the new store).
"""
import collections
import fnmatch
import gzip
import hashlib
import importlib.util
import json
import os
import re
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("backup_coverage_check", os.path.join(HERE, "backup-coverage-check.py"))
cov = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cov)
with open(cov.INVENTORY, encoding="utf-8") as _fh:
    DRILL = json.load(_fh)["restore_drill"]

STATUS_FILE = os.environ.get("RESTORE_DRILL_STATUS", DRILL["status_file"])
WORK_ROOT = DRILL["work_root"]  # outside every backup source; emptied at start and end (backups hold client data)
LABEL = DRILL["label"]
LOCK = "/run/lock/awarewave-restore-drill.lock"
MIN_FREE_BYTES = 50 << 30
CAPS = ["--network", "none", "--memory", "4g", "--cpus", "2", "--pids-limit", "512",
        "--security-opt", "no-new-privileges", "--label", LABEL]
TRAILER = {"pg_dumpall": "PostgreSQL database cluster dump complete", "pg_dump": "PostgreSQL database dump complete",
           "mysqldump": "-- Dump completed"}
# A pg_dumpall restore into this cluster cannot avoid these; drill_supabase checks their outcome instead.
TOLERATED = [re.compile(p) for p in (
    r'^role "supabase_admin" already exists$',  # initdb's bootstrap superuser
    r"^Superuser owned event trigger must execute a superuser owned function$",  # supabase-restore-fixup.sql
    r'^event trigger "[^"]+" does not exist$',  # the dump's ALTER of a trigger it could not create
)]
COPY = re.compile(r"^COPY (.+?) +(?:\(.*\) )?FROM stdin;$")  # also quoted names with spaces and zero-column tables
EVENT_TRIGGER = re.compile(r"^CREATE EVENT TRIGGER (\S+) ON (\S+)(?:\s+WHEN TAG IN \(([^)]*)\))?\s+EXECUTE (?:FUNCTION|PROCEDURE) ([^(\s]+)\(\);$")
ERROR = re.compile(r"(?i)\b(?:error|fatal):\s+(.*)$")
MY_CREATE = re.compile(r"^CREATE TABLE `([^`]+)`")
MY_INSERT = re.compile(r"^INSERT INTO `([^`]+)`")
MY_USE = re.compile(r"^USE `([^`]+)`;")
LAYOUT = {"date": re.compile(r"^\d{4}-\d{2}-\d{2}$"), "stamp": cov.STAMP}
MYSQL_SYSTEM_DBS = {"information_schema", "mysql", "performance_schema", "sys"}


class DrillError(Exception):
    pass


# ---- pure ----------------------------------------------------------------------------------------------------

def trigger_definition(statement):
    """CREATE EVENT TRIGGER text -> (name, "event|sorted tags|schema.function"); unparsed text never compares equal."""
    m = EVENT_TRIGGER.match(statement)
    if not m:
        return statement.split()[3], f"unparsed: {statement}"
    tags = ",".join(sorted(t.strip().strip("'") for t in (m.group(3) or "").split(",") if t.strip()))
    return m.group(1), f"{m.group(2)}|{tags}|{m.group(4)}"


def scan_pg(lines, db):
    """Plain pg_dump/pg_dumpall text -> rows per (db, table) COPY block, databases, event triggers, last 10 lines."""
    rows, dbs, triggers, tail, cur, n, trig = {}, {db}, {}, collections.deque(maxlen=10), None, 0, None
    for line in lines:
        line = line.rstrip("\n")
        tail.append(line)
        if cur is not None:
            if line == "\\.":
                rows[(db, cur)], cur = n, None
            else:
                n += 1
            continue
        if trig is not None:
            if line and not line.startswith("\\"):
                trig.append(line.strip())
                if line.endswith(";"):
                    name, definition = trigger_definition(" ".join(trig))
                    triggers[name], trig = definition, None
                continue
            name, definition = trigger_definition(" ".join(trig))  # ended without ";": recorded, never equal
            triggers[name], trig = definition, None
        if line.startswith("\\connect"):
            m = re.search(r"dbname='([^']+)'", line)
            db = m.group(1) if m else line.split()[-1].strip('"')
            dbs.add(db)
        elif line.startswith("COPY "):
            m = COPY.match(line)
            if m:
                cur, n = m.group(1), 0
        elif line.startswith("CREATE EVENT TRIGGER "):
            trig = [line.strip()]
            if line.endswith(";"):
                name, definition = trigger_definition(line.strip())
                triggers[name], trig = definition, None
    if trig is not None:
        name, definition = trigger_definition(" ".join(trig))
        triggers[name] = definition
    return {"rows": rows, "dbs": dbs, "event_triggers": triggers, "tail": list(tail)}


def scan_mysql(lines, db):
    """mysqldump text -> (db, table) created and inserted into, databases, last 10 lines. `USE` switches the database
    (a --databases dump); a single-database dump has none, so its tables belong to `db`."""
    created, inserted, dbs, tail = set(), set(), {db}, collections.deque(maxlen=10)
    for line in lines:
        tail.append(line.rstrip("\n"))
        m = MY_USE.match(line)
        if m:
            db = m.group(1)
            dbs.add(db)
            continue
        m = MY_CREATE.match(line) or MY_INSERT.match(line)
        if m:
            (created if line.startswith("CREATE") else inserted).add((db, m.group(1)))
    return {"created": created, "inserted": inserted, "dbs": dbs, "tail": list(tail)}


def scan_gz(path, scan, *args):
    """A truncated or corrupt gzip is this store's FAIL with a readable reason (gzip raises EOFError, not OSError)."""
    try:
        with gzip.open(path, "rt", encoding="utf-8", errors="replace") as fh:
            return scan(fh, *args)
    except (EOFError, OSError, zlib.error) as exc:
        raise DrillError(f"{os.path.basename(path)}: unreadable gzip ({exc})") from exc


def has_trailer(tail, dumper):
    return any(TRAILER[dumper] in line for line in tail)


def scrub(text):
    """Database errors can quote row values (client data); keep the error, drop the values."""
    return re.sub(r"=\([^)]*\)", "=(...)", re.sub(r"'[^']*'", "'...'", text))


def unexpected_errors(stderr):
    msgs = [m.group(1).strip() for m in (ERROR.search(line) for line in stderr.splitlines()) if m]
    msgs += [line.strip() for line in stderr.splitlines() if "not connected to a database" in line]
    return [scrub(m) for m in msgs if not any(t.match(m) for t in TOLERATED)]


def first_error(text):
    return scrub(next((line.strip() for line in text.splitlines() if ERROR.search(line)), text.strip()[:200]))


def count_problems(want, got):
    """want/got: {(db, table): rows}. A table the restore lacks or holds a different count of is a problem."""
    return [f"{db} {t}: dump {n}, restored {got.get((db, t), 'none')}" for (db, t), n in sorted(want.items())
            if got.get((db, t)) != n]


def completeness_problems(want, expect):
    """The compared set must never shrink unnoticed: no data at all, or an expected table missing or empty."""
    if not want:
        return ["no table data in the dump"]
    return [f"expected table {db} {t} missing or empty in the dump" for db, t in expect if want.get((db, t), 0) < 1]


def trigger_problems(dump, restored_lines):
    """dump: {name: "event|sorted tags|schema.function"}; restored_lines: "name|event|tags|schema.function"."""
    have = {}
    for line in restored_lines:
        name, event, tags, func = line.split("|")
        have[name] = f"{event}|{','.join(sorted(t for t in tags.split(',') if t))}|{func}"
    return [f"event trigger {n}: {'missing' if n not in have else 'defined differently'} after the fixup"
            for n, d in sorted(dump.items()) if have.get(n) != d]


def pick_snapshot(listing, pipe, max_age_hours, now):
    """Newest regular snapshot dir (a manual eu/<name>/ sorts after dates) and only if fresh."""
    layout = pipe["r2_dir"]
    dirs = sorted({k.split("/")[1] for k in listing if k.count("/") >= 2 and LAYOUT[layout].match(k.split("/")[1])})
    if not dirs:
        raise DrillError(f"no {layout} snapshot in R2 under {pipe['r2_prefix']}/")
    d = dirs[-1]
    if layout == "date":  # a date dir stands for the whole day: count its age from the day's end
        taken = datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
    else:
        taken = datetime.strptime(d, "%Y%m%d-%H%M%S").replace(tzinfo=timezone.utc)
    age_h = (now - taken).total_seconds() / 3600
    if age_h > max_age_hours:
        raise DrillError(f"newest R2 snapshot {pipe['r2_prefix']}/{d} is {age_h:.0f}h old")
    return f"{pipe['r2_prefix']}/{d}"


def expand(names, listing, snap):
    """A name with * matches every artifact of the snapshot (a split file by its parts.json): new databases included."""
    present = {k[len(snap) + 1:].removesuffix(".parts.json") for k in listing if k.startswith(f"{snap}/") and ".part-" not in k}
    return [m for n in names for m in (sorted(fnmatch.filter(present, n)) if "*" in n else [n])]


def capped(problems, n=5):
    return problems[:n] + ([f"(+{len(problems) - n} more)"] if len(problems) > n else [])


# ---- docker --------------------------------------------------------------------------------------------------

def docker(*args, env=None, stdin=None, input=None, timeout=600):
    return subprocess.run(["docker", *args], capture_output=True, text=True, stdin=stdin, input=input, timeout=timeout,
                          env={**os.environ, **(env or {})})


def prod(container):
    """The running container's exact image (by id, not tag), env, command and declared VOLUME paths. Read-only."""
    r = docker("inspect", container)
    if r.returncode:
        raise DrillError(f"prod container {container} not found: no image to restore into")
    info = json.loads(r.stdout)[0]
    cfg = info["Config"]
    return {"container": container, "image": info["Image"], "tag": cfg["Image"], "cmd": cfg.get("Cmd") or [],
            "env": dict(e.split("=", 1) for e in cfg.get("Env") or []), "volumes": sorted(cfg.get("Volumes") or {})}


def data_volumes(name, paths, taken=()):
    """Labelled named volumes on the image's VOLUME paths: an anonymous one would carry no label and outlive a crash."""
    args = []
    for i, path in enumerate(p for p in paths if p not in taken):
        vol = f"{name}-v{i}"
        if docker("volume", "create", "--label", LABEL, vol).returncode:
            raise DrillError(f"could not create volume {vol}")
        args += ["-v", f"{vol}:{path}"]
    return args


def start(name, image, env, args=(), cmd=()):
    """Secrets go by name (-e KEY) with the value in docker's own environment: never on a command line."""
    r = docker("run", "-d", "--name", name, *CAPS, *[a for k in env for a in ("-e", k)], *args, image, *cmd, env=env)
    if r.returncode:
        raise DrillError(f"could not start {image[:19]}: {first_error(r.stderr)}")


def wait(name, probe, env=None, seconds=300):
    deadline = time.time() + seconds
    while time.time() < deadline:
        if docker("exec", *[a for k in env or {} for a in ("-e", k)], name, *probe, env=env).returncode == 0:
            return
        if docker("inspect", "-f", "{{.State.Running}}", name).stdout.strip() != "true":
            raise DrillError(f"{name} exited: {scrub(docker('logs', '--tail', '5', name).stderr.strip()[-300:])}")
        time.sleep(2)
    raise DrillError(f"{name} not ready after {seconds}s")


def pipe_gz(path, argv, env=None, timeout=3600):
    """gunzip -c path | docker <argv>; returns (rc of the load, its stderr). A truncated gzip fails the load too."""
    gz = subprocess.Popen(["gunzip", "-c", path], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    r = docker(*argv, env=env, stdin=gz.stdout, timeout=timeout)
    gz.stdout.close()
    gz_err = gz.stderr.read().decode("utf-8", "replace")
    return (r.returncode or gz.wait()), (r.stderr + gz_err)


def remove_leftovers():
    """Only what this drill labelled, never a prod container or volume. Returns what could not be removed."""
    errors = []
    for kind, ls, rm in (("container", ["ps", "-aq"], ["rm", "-f", "-v"]), ("volume", ["volume", "ls", "-q"], ["volume", "rm"])):
        ids = docker(*ls, "--filter", f"label={LABEL}").stdout.split()
        if ids:
            r = docker(*rm, *ids)
            if r.returncode:
                errors.append(f"could not remove drill {kind}s: {first_error(r.stderr)}")
    if os.path.isdir(WORK_ROOT):
        for d in os.listdir(WORK_ROOT):
            try:
                shutil.rmtree(os.path.join(WORK_ROOT, d))
            except OSError as exc:
                errors.append(f"could not remove {WORK_ROOT}/{d}: {exc.strerror}")
    return errors


def pg_counts(name, user, db, tables, env=None):
    """ONLY: a dump's COPY carries a table's own rows, never its inheritance children's."""
    sql = "".join(f"SELECT $n${t}$n$, count(*) FROM ONLY {t};\n" for t in tables)
    r = docker("exec", "-i", *[a for k in env or {} for a in ("-e", k)], name, "psql", "-U", user, "-d", db, "-At",
               "-v", "ON_ERROR_STOP=0", "-f", "-", input=sql, timeout=1800, env=env)
    return {(db, line.rsplit("|", 1)[0]): int(line.rsplit("|", 1)[1]) for line in r.stdout.splitlines() if "|" in line}


def pg_query(name, user, sql, db="postgres"):
    r = docker("exec", name, "psql", "-U", user, "-d", db, "-At", "-c", sql)
    if r.returncode:
        raise DrillError(f"{name}: query failed: {first_error(r.stderr)}")
    return [line for line in r.stdout.splitlines() if line]


def missing_databases(p, restored, engine):
    """A database the prod container holds but the restore lacks: added to prod, never to the backup. Read-only."""
    if engine == "mysql":
        r = docker("exec", p["container"], "sh", "-c", 'MYSQL_PWD="${MARIADB_ROOT_PASSWORD:-$MYSQL_ROOT_PASSWORD}" '
                   '"$(command -v mariadb || command -v mysql)" -uroot -N -B -e "SHOW DATABASES"')
        if r.returncode:
            return [f"could not list prod databases: {first_error(r.stderr)}"]
        have = set(r.stdout.split()) - MYSQL_SYSTEM_DBS
    else:
        have = set(pg_query(p["container"], p["env"].get("POSTGRES_USER", "postgres"),
                            "SELECT datname FROM pg_database WHERE NOT datistemplate")) - {"postgres"}
    return [f"prod has database {d}, the backup lacks it" for d in sorted(have - set(restored))]


# ---- R2 ------------------------------------------------------------------------------------------------------

def r2_get(base, token, key, dest):
    url = f"{base}/objects/{urllib.parse.quote(key, safe='/')}"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(req, timeout=120) as resp, open(dest, "wb") as fh:
                shutil.copyfileobj(resp, fh, 1 << 20)
            return
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500:
                raise DrillError(f"R2 GET {key}: HTTP {e.code}") from e
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            pass
        time.sleep(10 * (attempt + 1))
    raise DrillError(f"R2 GET {key}: unreachable after 3 tries")


def fetch(base, token, keys, key, dest):
    """One artifact into dest. A split file: parts in order, then size and sha256 against its parts.json."""
    if key in keys:
        r2_get(base, token, key, dest)
        if os.path.getsize(dest) != keys[key][0]:
            raise DrillError(f"{key}: downloaded {os.path.getsize(dest)} bytes, R2 lists {keys[key][0]}")
        return
    if f"{key}.parts.json" not in keys:
        raise DrillError(f"not in R2: {key}")
    r2_get(base, token, f"{key}.parts.json", f"{dest}.parts.json")
    with open(f"{dest}.parts.json", encoding="utf-8") as fh:
        manifest = json.load(fh)
    digest = hashlib.sha256()
    with open(dest, "wb") as out:
        for part in sorted(k for k in keys if k.startswith(f"{key}.part-")):
            r2_get(base, token, part, f"{dest}.part")
            with open(f"{dest}.part", "rb") as fh:
                for chunk in iter(lambda: fh.read(1 << 20), b""):
                    digest.update(chunk)
                    out.write(chunk)
            os.remove(f"{dest}.part")
    if os.path.getsize(dest) != manifest["bytes"] or digest.hexdigest() != manifest["sha256"]:
        raise DrillError(f"{key}: reassembled parts do not match {key}.parts.json")


def decrypt(path, enc_key, tar_args):
    """openssl | tar <tar_args>; the key goes by env, never argv."""
    dec = subprocess.Popen(["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-pass", "env:BACKUP_ENC_KEY", "-in", path],
                           stdout=subprocess.PIPE, env={**os.environ, "BACKUP_ENC_KEY": enc_key})
    tar = subprocess.run(["tar", *tar_args], stdin=dec.stdout, capture_output=True)
    dec.stdout.close()
    if dec.wait() or tar.returncode:
        raise DrillError(f"{os.path.basename(path)}: could not decrypt or lacks a member")
    return tar.stdout.decode("utf-8", "replace")


# ---- engines: each returns (problems, ok detail, prod info) ---------------------------------------------------

def drill_pg(store_id, spec, files, work):
    p = prod(spec["container"])
    user = p["env"].get("POSTGRES_USER", "postgres")
    db = p["env"].get("POSTGRES_DB") or user
    name = f"restore-drill-{store_id}"
    start(name, p["image"], {"POSTGRES_USER": user, "POSTGRES_DB": db, "POSTGRES_PASSWORD": secrets.token_hex(16)},
          ["-v", f"{work}:/drill:ro", *data_volumes(name, p["volumes"])])
    wait(name, ["pg_isready", "-U", user, "-h", "localhost"])  # TCP: the entrypoint's init server has none
    want, problems, restored = {}, [], {db}
    if spec.get("roles"):  # pg_dumpall --roles-only; its CREATE ROLE of the bootstrap user cannot succeed
        roles = files.pop(spec["roles"])
        if not has_trailer(scan_gz(roles, scan_pg, "postgres")["tail"], "pg_dumpall"):
            problems.append(f"{spec['roles']}: no '{TRAILER['pg_dumpall']}' trailer")
        rc, err = pipe_gz(roles, ["exec", "-i", name, "psql", "-U", user, "-d", "postgres", "-q"])
        problems += [f"{spec['roles']}: {e}" for e in unexpected_errors(err) if e != f'role "{user}" already exists']
        problems += [f"{spec['roles']}: load rc={rc}"] if rc else []
    for art in files:
        if art.endswith(".dump"):  # pg_dump -Fc, one database per file, named after it
            target = art[:-len(".dump")]
            restored.add(target)
            if target not in (db, "postgres"):
                docker("exec", name, "createdb", "-U", user, target)
            r = docker("exec", name, "pg_restore", "-U", user, "-d", target, "--exit-on-error", f"/drill/{art}", timeout=3600)
            if r.returncode:
                problems.append(f"{art}: {first_error(r.stderr)}")
                continue
            out = docker("exec", name, "pg_restore", "-f", "-", "--data-only", f"/drill/{art}", timeout=3600)
            if out.returncode:
                problems.append(f"{art}: listing its data failed: {first_error(out.stderr)}")
                continue
            want.update(scan_pg(out.stdout.splitlines(), target)["rows"])
        else:
            scan = scan_gz(files[art], scan_pg, db)
            if not has_trailer(scan["tail"], "pg_dump"):
                problems.append(f"{art}: no '{TRAILER['pg_dump']}' trailer")
            rc, err = pipe_gz(files[art], ["exec", "-i", name, "psql", "-U", user, "-d", db, "-q", "-v", "ON_ERROR_STOP=1"])
            if rc:
                problems.append(f"{art}: load stopped: {first_error(err)}")
            want.update(scan["rows"])
    problems += completeness_problems(want, [tuple(e) for e in spec.get("expect", [])])
    got = {}
    for target in sorted({d for d, _ in want}):
        got.update(pg_counts(name, user, target, [t for d, t in want if d == target]))
    problems += capped(count_problems(want, got)) + missing_databases(p, restored, "postgres")
    return problems, f"{len(want)} tables, {sum(want.values())} rows match", p


def drill_mysql(store_id, spec, files, work):
    p = prod(spec["container"])
    db = p["env"].get("MARIADB_DATABASE") or p["env"].get("MYSQL_DATABASE")
    pw = {"MYSQL_PWD": secrets.token_hex(16)}
    name = f"restore-drill-{store_id}"
    start(name, p["image"], {"MARIADB_ROOT_PASSWORD": pw["MYSQL_PWD"], "MYSQL_ROOT_PASSWORD": pw["MYSQL_PWD"],
                             "MARIADB_DATABASE": db, "MYSQL_DATABASE": db}, data_volumes(name, p["volumes"]))
    client = "mariadb" if docker("exec", name, "sh", "-c", "command -v mariadb").returncode == 0 else "mysql"
    my = ["-e", "MYSQL_PWD", name, client, "-h127.0.0.1", "-uroot"]  # TCP: as in drill_pg
    wait(name, [client, "-h127.0.0.1", "-uroot", "-e", "SELECT 1"], env=pw)
    (art, path), = files.items()
    scan = scan_gz(path, scan_mysql, db)
    problems = [] if has_trailer(scan["tail"], "mysqldump") else [f"{art}: no '{TRAILER['mysqldump']}' trailer"]
    problems += ["no tables in the dump"] if not scan["created"] else []
    problems += [f"expected table {d} {t} has no rows in the dump" for d, t in spec.get("expect", []) if (d, t) not in scan["inserted"]]
    rc, err = pipe_gz(path, ["exec", "-i", *my, db], env=pw)
    if rc:
        return problems + [f"{art}: load stopped: {first_error(err)}"], "", p
    tables = set()
    for d in sorted(scan["dbs"]):
        tables |= {(d, t) for t in docker("exec", *my, "-N", "-B", "-e", f"SHOW TABLES FROM `{d}`", env=pw).stdout.split()}
    problems += capped([f"table {d} {t} missing after the load" for d, t in sorted(scan["created"] - tables)])
    query = "".join(f"SELECT '{d}', '{t}', COUNT(*) FROM `{d}`.`{t}`;" for d, t in sorted(scan["inserted"]))
    out = docker("exec", *my, "-N", "-B", "--force", "-e", query, env=pw).stdout
    counts = {(c[0], c[1]): int(c[2]) for c in (line.split("\t") for line in out.splitlines()) if len(c) == 3}
    problems += capped([f"{d} {t}: dump inserts rows, restored {counts.get((d, t), 'none')}" for d, t in sorted(scan["inserted"])
                        if not counts.get((d, t))])
    problems += missing_databases(p, scan["dbs"], "mysql")
    return problems, (f"{len(scan['dbs'])} database(s), {len(scan['created'])} tables, {len(scan['inserted'])} with rows, "
                      "all present"), p


# Database owners, grants and settings, in prod and in the restore; settings hashed so no value is ever printed.
CATALOG = ("SELECT 'db|' || d.datname || '|' || pg_get_userbyid(d.datdba) || '|' || coalesce(d.datacl::text, '') "
           "FROM pg_database d WHERE d.datname <> 'template0' UNION ALL "
           "SELECT 'set|' || coalesce(d.datname, '*') || '|' || coalesce(r.rolname, '*') || '|' || md5(array_to_string(s.setconfig, ',')) "
           "FROM pg_db_role_setting s LEFT JOIN pg_database d ON d.oid = s.setdatabase LEFT JOIN pg_roles r ON r.oid = s.setrole")
EVENT_TRIGGERS = ("SELECT e.evtname || '|' || e.evtevent || '|' || coalesce(array_to_string(e.evttags, ','), '') || '|' || "
                  "n.nspname || '.' || p.proname FROM pg_event_trigger e JOIN pg_proc p ON p.oid = e.evtfoid "
                  "JOIN pg_namespace n ON n.oid = p.pronamespace")


def drill_supabase(store_id, spec, files, work, enc_key):
    p = prod(spec["container"])
    sec = spec["secrets"]
    key_dir = os.path.join(work, "secrets")
    os.mkdir(key_dir, 0o700)
    decrypt(files[sec["artifact"]], enc_key, ["xzf", "-", "-C", key_dir, sec["key"]])
    dotenv = cov.parse_env(decrypt(files[sec["artifact"]], enc_key, ["xzf", "-", "-O", sec["env"]]))  # never on disk
    pw = {"POSTGRES_PASSWORD": dotenv["POSTGRES_PASSWORD"], "PGPASSWORD": dotenv["POSTGRES_PASSWORD"]}
    name, vol = f"restore-drill-{store_id}", f"restore-drill-{store_id}-config"
    if docker("volume", "create", "--label", LABEL, vol).returncode:
        raise DrillError(f"could not create volume {vol}")
    # DR runbook §4 step 3: the image fills the empty volume (its postgresql.conf includes those files), then the key.
    r = docker("run", "--rm", *CAPS, "-v", f"{vol}:/etc/postgresql-custom", "-v",
               f"{os.path.join(key_dir, os.path.dirname(sec['key']))}:/s:ro", "--entrypoint", "sh", p["image"], "-c",
               f"install -o postgres -g postgres -m 600 /s/{os.path.basename(sec['key'])} /etc/postgresql-custom/")
    if r.returncode:
        raise DrillError(f"could not install the key: {first_error(r.stderr)}")
    empty = os.path.join(work, "initdb")
    os.mkdir(empty)
    # Bare cluster: the image's init SQL would build auth/storage/cron at its baseline and the dump's rows into prod's
    # newer tables would fail (auth.users and 5 more tables came back empty that way, 2026-10-14). pg_cron stays off:
    # prod's jobs would otherwise run against the restore.
    mounts = ["-v", f"{vol}:/etc/postgresql-custom", "-v", f"{empty}:/docker-entrypoint-initdb.d:ro"]
    start(name, p["image"], pw, mounts + data_volumes(name, p["volumes"], {"/etc/postgresql-custom", "/docker-entrypoint-initdb.d"}),
          [*p["cmd"], "-c", "cron.launch_active_jobs=off"])
    wait(name, ["pg_isready", "-U", "postgres", "-h", "localhost"])
    (art, path), = [(a, f) for a, f in files.items() if a != sec["artifact"]]
    scan = scan_gz(path, scan_pg, "postgres")
    problems = [] if has_trailer(scan["tail"], "pg_dumpall") else [f"{art}: no '{TRAILER['pg_dumpall']}' trailer"]
    problems += completeness_problems(scan["rows"], [tuple(e) for e in spec.get("expect", [])])
    rc, err = pipe_gz(path, ["exec", "-i", name, "psql", "-U", "supabase_admin", "-d", "postgres", "-q"])
    problems += capped([f"restore error: {e}" for e in unexpected_errors(err)])
    with open(os.path.join(HERE, "supabase-restore-fixup.sql"), encoding="utf-8") as fh:
        fix = docker("exec", "-i", name, "psql", "-U", "supabase_admin", "-d", "postgres", "-q", "-v", "ON_ERROR_STOP=1", stdin=fh)
    if rc or fix.returncode:
        problems.append(f"load rc={rc}, fixup: {first_error(fix.stderr) if fix.returncode else 'ok'}")
    problems += trigger_problems(scan["event_triggers"], pg_query(name, "supabase_admin", EVENT_TRIGGERS))
    prod_cat = set(pg_query(p["container"], p["env"].get("POSTGRES_USER", "supabase_admin"), CATALOG))
    restored_cat = set(pg_query(name, "supabase_admin", CATALOG))
    problems += sorted({f"database {line.split('|')[1]}: {'owner or grants' if line.startswith('db|') else 'settings'} differ from prod"
                        for line in prod_cat ^ restored_cat})
    problems += missing_databases(p, scan["dbs"], "postgres")
    total, plain = (pg_query(name, "supabase_admin", "SELECT count(*) || ' ' || count(decrypted_secret) FROM vault.decrypted_secrets")
                    + ["0 0"])[0].split()
    if total != plain or total == "0":
        problems.append(f"vault: {plain} of {total} secrets decrypt with the backed-up key")
    got = {}
    for target in sorted({d for d, _ in scan["rows"]}):
        got.update(pg_counts(name, "supabase_admin", target, [t for d, t in scan["rows"] if d == target]))
    problems += capped(count_problems(scan["rows"], got))
    return problems, (f"{len(scan['rows'])} tables, {sum(scan['rows'].values())} rows match; vault {plain}/{total} "
                      f"decrypt; {len(scan['event_triggers'])} event triggers; database owners, grants, settings as prod"), p


# ---- main ----------------------------------------------------------------------------------------------------

def drill_store(store, inv, base, token, listing, enc_key, now):
    pipe, spec = inv["pipelines"][store["pipeline"]], store["drill"]
    started, snap, info = time.time(), None, None
    try:
        snap = pick_snapshot(listing, pipe, inv["max_age_hours"], now)
        names = spec.get("artifacts") or [a if isinstance(a, str) else a["name"] for a in store["artifacts"]]
        names = expand(names, listing, snap)
        names = names + [n for n in (spec.get("roles"), spec.get("secrets", {}).get("artifact")) if n and n not in names]
        work = tempfile.mkdtemp(dir=WORK_ROOT)
        files = {}
        for n in names:
            files[n] = os.path.join(work, n)
            fetch(base, token, listing, f"{snap}/{n}", files[n])
        if spec["engine"] == "supabase":
            problems, ok, info = drill_supabase(store["id"], spec, files, work, enc_key)
        else:
            problems, ok, info = {"postgres": drill_pg, "mysql": drill_mysql}[spec["engine"]](store["id"], spec, files, work)
    except Exception as exc:  # noqa: BLE001 -- PASS only through the success path; one store never stops the rest
        problems, ok = [scrub(str(exc)) if isinstance(exc, DrillError) else f"{type(exc).__name__}: {scrub(str(exc))}"], ""
    problems += remove_leftovers()  # restored client data must not outlive the run
    row = {"id": store["id"], "status": "FAIL" if problems else "PASS", "snapshot": snap,
           "seconds": round(time.time() - started), "detail": "; ".join(problems) or f"{snap}: {ok}"}
    if info:
        row["image"] = f"{info['tag']} ({info['image'][:19]})"
    return row


def check_work_root():
    os.makedirs(WORK_ROOT, mode=0o700, exist_ok=True)
    st = os.lstat(WORK_ROOT)
    if stat.S_ISLNK(st.st_mode) or not stat.S_ISDIR(st.st_mode) or st.st_uid != os.geteuid():
        raise DrillError(f"{WORK_ROOT} is not a directory owned by this user")
    os.chmod(WORK_ROOT, 0o700)
    free = shutil.disk_usage(WORK_ROOT).free
    if free < MIN_FREE_BYTES:
        raise DrillError(f"only {free >> 30} GiB free under {WORK_ROOT}; the drill needs {MIN_FREE_BYTES >> 30}")


def main(argv):
    import fcntl  # host only; the pure functions above are tested anywhere
    with open(cov.INVENTORY, encoding="utf-8") as fh:
        inv = json.load(fh)
    full = len(argv) < 2
    stores = [s for s in inv["stores"] if "drill" in s and (full or s["id"] in argv[1:])]
    unknown = sorted(set(argv[1:]) - {s["id"] for s in stores})
    if unknown:
        raise DrillError(f"no drill entry for {', '.join(unknown)}")
    env = cov.read_env(inv["r2"]["credentials_file"])
    base = cov.r2_base(inv, env)
    check_work_root()
    with open(LOCK, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)  # BlockingIOError: another drill runs; its status stands
        stamp = f"{datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ}"
        if full:  # a killed run leaves RUNNING, which the coverage check fails after hours, not last month's PASS
            cov.write_atomic(STATUS_FILE, json.dumps({"generated_at": stamp, "overall": "RUNNING", "rows": []}))
        leftovers = remove_leftovers()
        if leftovers:
            raise DrillError("; ".join(leftovers))
        listings, rows = {}, []
        for s in stores:
            prefix = inv["pipelines"][s["pipeline"]]["r2_prefix"]
            if prefix not in listings:
                listings[prefix] = cov.r2_list(base, env["R2_API_TOKEN"], f"{prefix}/")
            rows.append(drill_store(s, inv, base, env["R2_API_TOKEN"], listings[prefix], env["BACKUP_ENC_KEY"],
                                    datetime.now(timezone.utc)))
            print(f"[{datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ}] {rows[-1]['status']} {s['id']} "
                  f"({rows[-1].get('seconds', 0)}s): {rows[-1]['detail']}", flush=True)
    fails = [r for r in rows if r["status"] == "FAIL"]
    stamp = f"{datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ}"
    if full:
        cov.write_atomic(STATUS_FILE, json.dumps({"generated_at": stamp, "overall": "FAIL" if fails else "PASS",
                                                  "rows": rows}, ensure_ascii=False, indent=1))
    print(f"[{stamp}] === restore-drill {'FAILED: ' + str(len(fails)) if fails else 'PASSED'} ===")
    return 1 if fails else 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except BlockingIOError:
        print(f"[{datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ}] === restore-drill: another run holds {LOCK} ===")
        sys.exit(2)
    except Exception as exc:  # noqa: BLE001 -- say it did not run; never leave an old PASS behind
        now = f"{datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ}"
        if len(sys.argv) < 2:
            try:
                cov.write_atomic(STATUS_FILE, json.dumps({"generated_at": now, "overall": "ERROR", "error": scrub(str(exc)),
                                                          "rows": []}))
            except OSError:
                pass
        print(f"[{now}] === restore-drill ERROR: {exc} ===")
        sys.exit(2)
