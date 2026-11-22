#!/usr/bin/env python3
"""systems-import.py -- git commits -> /ops/systems events (agency-os/handoffs/2026-11-21-systems-control-center,
PLAN §5-§7, briefs/COMMON.md contracts 1-3). Cron: cron.d/systems-import, 04:30 Taipei, and every 5 minutes with
--if-requested (the page's 「立即更新」).

Reads a bare mirror of the repo (never /root/Work, the deploy tree), takes agency-os/systems/registry.json at HEAD,
walks previous_head..HEAD (first run: the last 90 days) and POSTs events to next-admin's ingest route in batches of
<= 500. The state file (last imported HEAD) is written only after every batch got a 2xx: a failed run is redone next
night and the route drops duplicates by event_key. A tracker failure only makes /ops/systems stale -- it never blocks
a commit or a deploy.

  --mirror <dir>   bare mirror (one-time: git clone --mirror <origin url> /root/systems-mirror.git)
  --state <file>   last imported HEAD
  --dry-run        print the request bodies, POST nothing, write no state (runs even when the import is disabled)
  --if-requested   first GET the pending route (契約 3): refresh false -> silent exit 0 (it runs every 5 minutes: no log
                   line), git untouched; true -> import as usual, and send an import_run even when already up to date
                   (that run is what answers the request). Any failure after that (Fatal, a failed POST, the time
                   limit) still sends a run record alone with status=error, best effort, so one request is answered
                   once and not redone every 5 minutes. Its requested_at is written to systems-import.answered
                   next to the state file after every attempt, whatever came of it: the same request is never worked
                   on twice. A failed GET = exit 1, nothing fetched, state untouched.
                   Never waits for the lock.
  --wait-lock N    wait up to N s for the lock, then exit 1 (default: --max-seconds + 120, the longest a requested run
                   holds it); --if-requested never waits

Settings (environment first, else a plain read of SYSTEMS_ENV_FILE -- never sourced, like poke.sh):
  SYSTEMS_IMPORT_ENABLED  anything but "true" -> one line, exit 0 (default OFF)
  SYSTEMS_INGEST_TOKEN    bearer token for the route (sent in a header, never on a command line)
  SYSTEMS_INGEST_URL      default http://127.0.0.1:3002/api/internal/systems/ingest
  SYSTEMS_PENDING_URL     default: SYSTEMS_INGEST_URL with /ingest -> /pending
Exit 0 = imported / up to date / disabled; 1 = history diverged or a POST failed; 2 = could not run.
An error line is printed only when it differs from the previous one (systems-import.last-error next to the state file;
cleared by a run that gets through), so a dead app does not write the same line every 5 minutes.
History diverged (previous_head is not an ancestor of HEAD, e.g. a force push): one orphaned event per commit that
left main plus the import_run event are sent, nothing new is imported, the state is kept, and every run reports it until someone deletes the state file (= re-import the last 90 days;
the route skips events it already has).
Trailers come from %(trailers:only,unfold) in the one `git log` call: the same parser as `git interpret-trailers
--parse`, without one process per commit (a first run walks ~4000 commits within the 300 s limit).
Guards live in here, not as flock/timeout/nice wrappers on the cron line, so install-host-schedules.sh can still check
the `python3 /path` form: one run at a time (a run waits for the lock, --wait-lock; --if-requested skips), 300 s
alarm, nice 19 (which
also puts git's I/O at the lowest best-effort priority).
"""
import argparse
import hashlib
import signal
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

REGISTRY_PATH = "agency-os/systems/registry.json"
PRODUCTS_PATH = "lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts"
SUPERVISOR_RE = re.compile(r"^(agency-os/handoffs/[^/]+)/data\.mjs$")
REVERT_RE = re.compile(r"^This reverts commit ([0-9a-f]{40})\b", re.M)  # git revert's own line, not a quote in prose
LOOSE_TRAILER_RE = re.compile(r"^(System|Phase|Feature|Next|Blocker|Blocker-Cleared|Test):", re.I | re.M)
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)  # = contract.ts UUID
SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")  # = contract.ts SLUG
SYSTEM_TYPES = ("product", "internal", "infrastructure", "governance", "client")
FEATURE_RE = re.compile(r"^([a-z0-9][a-z0-9-]*)\s*=\s*([a-z_]+)$")
# importer statuses (PLAN §9: a commit never claims verified -- an agent claim is at most implemented)
STATUSES = {"todo", "in_progress", "implemented", "blocked", "cancelled"}
TRAILER_KEYS = {"system", "phase", "feature", "next", "blocker", "blocker-cleared", "test"}
BATCH = 500
GAP_CAP = 500
REC, FLD = "\x1e", "\x1f"


class Fatal(Exception):
    pass


def git(mirror, *args, check=True):
    p = subprocess.run(["git", "--git-dir", mirror, "-c", "core.quotePath=false", *args],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if check and p.returncode != 0:
        raise Fatal(f"git {' '.join(args[:3])}: {p.stderr.strip()[:300]}")
    return p


def setting(name, default=""):
    if name in os.environ:
        return os.environ[name]
    path = os.environ.get("SYSTEMS_ENV_FILE", "/root/lobster-phase1/.env")
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            vals = [l.split("=", 1)[1] for l in f.read().splitlines() if l.startswith(name + "=")]
    except OSError:
        return default
    return vals[-1].strip().strip("\r").strip('"') if vals else default


def load_registry(text):
    """The route's rule set (apps/next-admin/lib/systems/contract.ts parseRegistry; COMMON 契約 1): the first broken rule
    is Fatal, named as registry.systems[i].field -- the same place the route would name in its 400. Lengths count UTF-16
    units and "empty" ignores a BOM, as JS does. Stricter than the route on purpose (COMMON): feature slugs are global,
    feature.phase is required, purpose / shared_paths / ignore_paths may not be null."""
    try:
        reg = json.loads(text)
    except ValueError as e:
        raise Fatal(f"{REGISTRY_PATH} is not JSON: {e}")

    def bad(where, what):
        raise Fatal(f"{REGISTRY_PATH}: {where}: {what}")

    def obj(v, where):
        return v if isinstance(v, dict) else bad(where, "not an object")

    def arr(v, where):
        return v if isinstance(v, list) else bad(where, "not an array")

    def text_(v, where, mx=2000, empty_ok=True, null_ok=False):
        if v is None and null_ok:
            return
        if not isinstance(v, str) or len(v.encode("utf-16-le")) // 2 > mx:
            bad(where, f"not a string of at most {mx} characters")
        if not empty_ok and not v.replace("﻿", "").strip():
            bad(where, "empty")

    def strs(v, where):
        for i, x in enumerate(arr(v, where)):
            text_(x, f"{where}[{i}]", 500)

    def uuid(v, where, ids):
        if not isinstance(v, str) or not UUID_RE.fullmatch(v):  # fullmatch: Python's $ also matches before a final \n
            bad(where, "not a uuid")
        if v.lower() in ids:
            bad(where, f"duplicate id {v}")
        ids.add(v.lower())

    def slug(v, where, seen, what):
        if not isinstance(v, str) or len(v) > 100 or not SLUG_RE.fullmatch(v):
            bad(where, "not a kebab slug")
        if v in seen:
            bad(where, f"duplicate {what} slug {v}")
        seen.add(v)

    obj(reg, "registry")
    if type(reg.get("version")) is not int or reg["version"] != 1:  # not True: JSON true is not 1 to the route
        bad("registry.version", "must be 1")
    strs(reg.get("shared_paths", []), "registry.shared_paths")
    strs(reg.get("ignore_paths", []), "registry.ignore_paths")
    ids, systems, features = set(), set(), set()
    for i, s in enumerate(arr(reg.get("systems"), "registry.systems")):
        w = f"registry.systems[{i}]"
        obj(s, w)
        uuid(s.get("id"), f"{w}.id", ids)
        slug(s.get("slug"), f"{w}.slug", systems, "system")
        text_(s.get("name"), f"{w}.name", 200, empty_ok=False)
        if s.get("type") not in SYSTEM_TYPES:
            bad(f"{w}.type", f"not one of {'|'.join(SYSTEM_TYPES)}")
        text_(s.get("purpose", ""), f"{w}.purpose")
        text_(s.get("product_key"), f"{w}.product_key", 100, null_ok=True)
        strs(s.get("aliases", []), f"{w}.aliases")
        strs(s.get("source_paths"), f"{w}.source_paths")
        phases = set()
        for j, p in enumerate(arr(s.get("phases"), f"{w}.phases")):
            pw = f"{w}.phases[{j}]"
            obj(p, pw)
            uuid(p.get("id"), f"{pw}.id", ids)
            slug(p.get("slug"), f"{pw}.slug", phases, "phase")
            text_(p.get("name"), f"{pw}.name", 200, empty_ok=False)
            text_(p.get("legacy_source_path"), f"{pw}.legacy_source_path", 500, null_ok=True)
        for j, f in enumerate(arr(s.get("features"), f"{w}.features")):
            fw = f"{w}.features[{j}]"
            obj(f, fw)
            uuid(f.get("id"), f"{fw}.id", ids)
            # global, not per system: a Feature: <slug>=<status> trailer names no system
            slug(f.get("slug"), f"{fw}.slug", features, "feature")
            text_(f.get("name"), f"{fw}.name", 200, empty_ok=False)
            if "legacy_code" in f:  # supervisor card code as written (ED.1, 批0); only the cutover script reads it
                text_(f["legacy_code"], f"{fw}.legacy_code", 40, empty_ok=False)
            if f.get("phase") is None:
                bad(f"{fw}.phase", "required")
            if not isinstance(f.get("phase"), str) or f.get("phase") not in phases:
                bad(f"{fw}.phase", f"no phase {f.get('phase')} in {s['slug']}")
    return reg


class Index:
    """Path -> owning system by longest prefix (contract 1). A path ending in / is a folder prefix, else one file."""

    def __init__(self, reg):
        self.entries = []  # (prefix, rank, slug): rank breaks a tie on the same string, ignore > shared > system
        for p in reg.get("ignore_paths", []):
            self.entries.append((p, 2, None))
        for p in reg.get("shared_paths", []):
            self.entries.append((p, 1, None))
        self.systems, self.features, self.alias = {}, {}, {}
        for s in sorted(reg["systems"], key=lambda s: s["slug"]):
            self.systems[s["slug"]] = s
            self.alias[s["slug"].lower()] = s["slug"]
            for a in s.get("aliases", []):
                self.alias.setdefault(str(a).lower(), s["slug"])
            for p in s.get("source_paths", []):
                self.entries.append((p, 0, s["slug"]))
            for f in s.get("features", []):
                self.features[f["slug"]] = (s["slug"], f.get("phase"))

    def owner(self, path):
        """('ignore'|'shared'|'system'|'unowned', slug|None)"""
        best = None
        for prefix, rank, slug in self.entries:
            hit = path.startswith(prefix) if prefix.endswith("/") else path == prefix
            if hit and (best is None or (len(prefix), rank) > (len(best[0]), best[1])):
                best = (prefix, rank, slug)
        if best is None:
            return "unowned", None
        return ("system", "shared", "ignore")[best[1]], best[2]

    def phase_of(self, slug, phase):
        return phase if any(p.get("slug") == phase for p in self.systems[slug].get("phases", [])) else None


def commits(mirror, rng):
    fmt = f"{REC}%H{FLD}%cI{FLD}%s{FLD}%B{FLD}%(trailers:only=true,unfold=true){FLD}"
    out = git(mirror, "log", "--reverse", "--no-renames", "--name-only", f"--format={fmt}", *rng).stdout
    for rec in out.split(REC)[1:]:
        sha, date, subject, rest = rec.split(FLD, 3)
        body, trailers, files = rest.rsplit(FLD, 2)
        yield {"sha": sha, "date": date, "subject": subject, "body": body,
               "trailers": parse_trailers(trailers), "files": [f for f in files.splitlines() if f.strip()]}


def parse_trailers(text):
    out = []
    for line in text.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            if k.strip().lower() in TRAILER_KEYS:
                out.append((k.strip().lower(), v.strip()))
    return out


def events_for(c, idx, gaps):
    """One commit -> its events, in a fixed order, so a re-run produces the same event_keys."""
    sha, short = c["sha"], c["sha"][:7]
    evs, used = [], set()

    def emit(event_type, system, payload, phase=None, feature=None):
        # <idx> comes from what the event is about, not its position: a registry change between two runs over the
        # same commit (a failed batch retried, or a deleted state file) must not shift keys onto other events.
        ident = "|".join([event_type, system or "", feature or "", payload.get("unclassified", ""),
                          payload.get("reverted_sha", "")])
        n = int(hashlib.sha1(ident.encode("utf-8")).hexdigest()[:12], 16)
        while n in used:
            n += 1
        used.add(n)
        evs.append({"event_key": f"git:{sha}:{n}", "system_slug": system, "phase_slug": phase,
                    "feature_slug": feature, "event_type": event_type, "source": "agent", "commit_sha": sha,
                    "occurred_at": c["date"], "payload": payload, "evidence": None})

    per_system = {}
    for f in c["files"]:
        kind, slug = idx.owner(f)
        if kind == "system":
            per_system[slug] = per_system.get(slug, 0) + 1
        elif kind == "unowned":
            gaps["unowned_paths"].add(f)

    tr = c["trailers"]
    # %(trailers) reads only the last paragraph: ours written above a separate Co-Authored-By block would vanish
    if len(LOOSE_TRAILER_RE.findall(c["body"])) > len(tr):
        gaps["unclassified_trailers"].add(f"{short} trailer not in the last paragraph (move it next to Co-Authored-By)")

    def vals(k):
        return [v for kk, v in tr if kk == k and v]

    trailer_systems, unknown_systems = [], []
    for v in vals("system"):  # adds to the path owners; never removes one
        slug = idx.alias.get(v.lower())
        if slug:
            trailer_systems.append(slug)
        else:
            unknown_systems.append(v)
            gaps["unclassified_trailers"].add(f"{short} System: {v}")
    targets = sorted(set(per_system) | set(trailer_systems))

    phase = (vals("phase") or [None])[-1]
    handoff = {"subject": c["subject"]}
    if vals("next"):
        handoff["next"] = "\n".join(vals("next"))
    if vals("blocker"):
        handoff["blocker"] = "\n".join(vals("blocker"))
    if any(k == "blocker-cleared" for k, _ in tr):
        handoff["blocker_cleared"] = True

    # one event per reverted sha (`git revert -n A B` + one commit has two lines); a revert of a revert is just another
    # revert event -- the projection toggles them in time order (COMMON 契約 2)
    reverted = list(dict.fromkeys(m.group(1) for m in REVERT_RE.finditer(c["body"])))
    for r in reverted:
        for s in targets or [None]:
            payload = {"reverted_sha": r}
            if s is None:
                payload["unclassified"] = "revert touches no registered system"
            emit("revert", s, payload)
    if not reverted and not tr:
        for s in sorted(per_system):
            emit("activity", s, {"subject": c["subject"], "files": per_system[s]})

    if tr:
        for s in targets:
            ph = idx.phase_of(s, phase) if phase else None
            if phase and not ph:
                gaps["unclassified_trailers"].add(f"{short} Phase: {phase} (not a phase of {s})")
            emit("handoff", s, dict(handoff), phase=ph)
        for v in unknown_systems:
            emit("handoff", None, dict(handoff, unclassified=f"unknown system: {v}"))
        if not targets and not unknown_systems and any(k not in ("feature", "test") for k, _ in tr):
            emit("handoff", None, dict(handoff, unclassified="no system: no registered path and no System trailer"))

    test = "; ".join(vals("test"))
    for v in vals("feature"):
        fm = FEATURE_RE.match(v)
        status = fm.group(2) if fm else None
        status = "implemented" if status == "verified" else status
        if not fm or status not in STATUSES:
            gaps["unclassified_trailers"].add(f"{short} Feature: {v}")
            emit("handoff", None, dict(handoff, unclassified=f"malformed Feature trailer: {v}"))
            continue
        payload = {"status": status}
        if test:
            payload["test"] = test
        owner = idx.features.get(fm.group(1))
        if owner is None:
            gaps["unclassified_trailers"].add(f"{short} Feature: {v}")
            emit("feature_update", None, dict(payload, unclassified=f"unknown feature: {fm.group(1)}"))
        else:
            emit("feature_update", owner[0], payload, phase=owner[1], feature=fm.group(1))
    return evs


def head_gaps(mirror, head, reg):
    """products.ts keys with no registry product_key; supervisor data.mjs folders no phase claims; registry file paths
    (no trailing /) that are not a file at HEAD -- such an entry owns nothing, so its commits fall through silently.
    ignore_paths are not checked: they may name operational files that come and go (DEPLOY_HOLD)."""
    tree = set(git(mirror, "ls-tree", "-r", "--name-only", head).stdout.splitlines())
    listed = reg.get("shared_paths", []) + [
        p for s in reg["systems"] for p in s.get("source_paths", [])]
    dead = sorted({p for p in listed if not p.endswith("/") and p not in tree})
    unregistered = []
    p = git(mirror, "show", f"{head}:{PRODUCTS_PATH}", check=False)
    if p.returncode == 0:
        body = p.stdout.split("PRODUCT_DEFINITIONS = [", 1)[-1].split("] as const", 1)[0]
        have = {s.get("product_key") for s in reg["systems"]}
        unregistered = sorted(k for k in re.findall(r'\{\s*key:\s*"([a-z0-9-]+)"', body) if k not in have)
    claimed = {(ph.get("legacy_source_path") or "").rstrip("/") for s in reg["systems"] for ph in s.get("phases", [])}
    unclaimed = []
    for path in tree:
        m = SUPERVISOR_RE.match(path)
        if m and m.group(1) not in claimed:
            unclaimed.append(m.group(1) + "/")
    return unregistered, sorted(unclaimed), dead


def post(url, token, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, r.read(400).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read(400).decode("utf-8", "replace")
    except (urllib.error.URLError, OSError) as e:
        return 0, str(e)


def get_pending(url, token):
    """-> (refresh, requested_at) from 契約 3, or an error string."""
    req = urllib.request.Request(url, method="GET", headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = json.loads(r.read(1_000_000).decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code} {e.read(300).decode('utf-8', 'replace')}"
    except (urllib.error.URLError, OSError, ValueError) as e:
        return str(e)
    refresh = body.get("refresh") if isinstance(body, dict) else None
    if not isinstance(refresh, bool):
        return f"no boolean refresh in {str(body)[:200]}"
    at = body.get("requested_at")
    return refresh, (at if isinstance(at, str) and at else None)


def write_state(path, head):
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".systems-import.")
    with os.fdopen(fd, "w") as f:
        f.write(head + "\n")
    os.replace(tmp, path)


class Timeout(Exception):
    pass


def now_iso():
    # milliseconds: a refresh request is pending while it is newer than the newest import_run (store.ts pendingFrom)
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


GAP_KEYS = ("unowned_paths", "unclassified_trailers", "unregistered_products", "unclaimed_supervisors", "dead_source_paths")


def run_event(head, prev, status, error, gaps, at):
    return {"event_key": f"run:{head}:{at}", "system_slug": None, "phase_slug": None, "feature_slug": None,
            "event_type": "import_run", "source": "importer", "commit_sha": head, "occurred_at": at,
            "payload": {"head": head, "previous_head": prev, "status": status, "error": error, "gaps": gaps},
            "evidence": None}


def error_body(mirror, ctx, error):
    """A body with only an import_run(status=error), or None when no valid registry is at hand (the route refuses a
    body without one): the one this run loaded, else the one at the last imported HEAD."""
    reg, prev = ctx.get("reg"), ctx.get("prev")
    if reg is None and prev:
        p = git(mirror, "show", f"{prev}:{REGISTRY_PATH}", check=False)
        try:
            reg = load_registry(p.stdout) if p.returncode == 0 else None
        except Fatal:
            reg = None
    if reg is None:
        return None
    head = ctx.get("head") or prev or "unknown"
    return {"registry": reg, "events": [run_event(head, prev, "error", str(error)[:1000], {k: [] for k in GAP_KEYS}, now_iso())]}


def build(mirror, state_path, ref, first_days, run_when_current=False, ctx=None):
    """-> (bodies, head, status); bodies == [] when already up to date, unless run_when_current (then the one body
    carries just the import_run: a refresh request is answered by a run record newer than it). ctx (a dict) gets
    prev / head / reg as they become known, for error_body."""
    ctx = {} if ctx is None else ctx
    prev = None
    if os.path.exists(state_path):
        with open(state_path, encoding="utf-8") as f:
            prev = f.read().strip() or None
    ctx["prev"] = prev
    git(mirror, "fetch", "--prune", "--quiet", "origin")
    head = git(mirror, "rev-parse", "--verify", f"{ref}^{{commit}}").stdout.strip()
    ctx["head"] = head
    if prev == head and not run_when_current:
        return [], head, "ok"
    reg_text = git(mirror, "show", f"{head}:{REGISTRY_PATH}", check=False)
    if reg_text.returncode != 0:
        raise Fatal(f"{REGISTRY_PATH} missing at {head[:12]}")
    reg = load_registry(reg_text.stdout)
    ctx["reg"] = reg
    idx = Index(reg)
    gaps = {"unowned_paths": set(), "unclassified_trailers": set()}
    events, status, error = [], "ok", None
    at = now_iso()

    if prev and git(mirror, "merge-base", "--is-ancestor", prev, head, check=False).returncode != 0:
        # PLAN §7: stop the increment, delete nothing; each commit that left main gets an orphaned event (the projection
        # drops its events), nothing new is imported, and the state stays put
        status = "history_diverged"
        if git(mirror, "cat-file", "-e", f"{prev}^{{commit}}", check=False).returncode == 0:
            gone = git(mirror, "rev-list", f"{head}..{prev}").stdout.split()
            error = (f"previous_head {prev[:12]} is not an ancestor of HEAD; {len(gone)} orphaned commit(s): "
                     + " ".join(g[:12] for g in gone[:50]))
            for g in gone:
                events.append({"event_key": f"orphan:{g}", "system_slug": None, "phase_slug": None, "feature_slug": None,
                               "event_type": "orphaned", "source": "importer", "commit_sha": g, "occurred_at": at,
                               "payload": {"sha": g}, "evidence": None})
        else:
            error = f"previous_head {prev[:12]} is not in the mirror (history rewritten)"
    else:
        rng = [f"{prev}..{head}"] if prev else [f"--since={first_days}.days.ago", head]
        for c in commits(mirror, rng):
            events.extend(events_for(c, idx, gaps))

    unregistered, unclaimed, dead = head_gaps(mirror, head, reg)
    run_gaps = {
        "unowned_paths": sorted(gaps["unowned_paths"])[:GAP_CAP],
        "unclassified_trailers": sorted(gaps["unclassified_trailers"])[:GAP_CAP],
        "unregistered_products": unregistered, "unclaimed_supervisors": unclaimed, "dead_source_paths": dead}
    # last of all, so the route has a run record only once every earlier batch landed; the time in the key gives every
    # run its own record (a rerun at the same HEAD must still update status and gaps)
    events.append(run_event(head, prev, status, error, run_gaps, at))
    bodies = [{"registry": reg, "events": events[i:i + BATCH]} for i in range(0, len(events), BATCH)]
    return bodies, head, status


def take_lock(path, wait_seconds):
    """-> the open lock file, or None when another run holds it (after waiting up to wait_seconds)."""
    import fcntl
    lock = open(path, "w")
    deadline = time.monotonic() + max(wait_seconds, 0)
    while True:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return lock
        except BlockingIOError:
            if time.monotonic() >= deadline:
                lock.close()
                return None
            time.sleep(1)


PENDING_FAILED = "[systems-import] ERROR: pending check failed:"


class StateFiles:
    """Small files next to the state file: the last answered refresh request (requested_at) and the last error line."""

    def __init__(self, state_path):
        self.dir = os.path.dirname(os.path.abspath(state_path))
        self.answered = os.path.join(self.dir, "systems-import.answered")
        self.last_error = os.path.join(self.dir, "systems-import.last-error")

    def read(self, path):
        try:
            with open(path, encoding="utf-8") as f:
                return f.read().strip()
        except OSError:
            return ""

    def write(self, path, text):
        os.makedirs(self.dir, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.dir, prefix=".systems-import.")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text + "\n")
        os.replace(tmp, path)

    def error(self, line):
        """Print an error line only when this failure has not printed it yet (the 5-minute line would repeat it all
        day). The lines of the current failure are kept in last-error until it is over (ok)."""
        line = line.strip()
        seen = [l for l in self.read(self.last_error).splitlines() if l]
        if line not in seen:
            print(line, file=sys.stderr)
            self.write(self.last_error, "\n".join((seen + [line])[-20:]))

    def ok(self, only=None):
        """The failure is over: its lines are news again. only = forget just the lines starting with it."""
        if not os.path.exists(self.last_error):
            return
        keep = [l for l in self.read(self.last_error).splitlines() if l and only is not None and not l.startswith(only)]
        if keep:
            self.write(self.last_error, "\n".join(keep))
        else:
            os.remove(self.last_error)


def main(argv=None):
    ap = argparse.ArgumentParser(description="git commits -> /ops/systems events")
    ap.add_argument("--mirror", default="/root/systems-mirror.git")
    ap.add_argument("--state", default="/var/lib/awarewave/systems-import.head")
    ap.add_argument("--ref", default="refs/heads/main")
    ap.add_argument("--first-days", type=int, default=90)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--if-requested", action="store_true")
    ap.add_argument("--wait-lock", type=int, default=None)
    ap.add_argument("--lock", default="/tmp/systems-import.lock")
    ap.add_argument("--max-seconds", type=int, default=300)
    a = ap.parse_args(argv)
    # Default: long enough for a requested run to finish (its limit, its 60 s error POST) plus a minute of slack.
    wait_lock = a.max_seconds + 60 + 60 if a.wait_lock is None else a.wait_lock
    quiet = a.if_requested  # every 5 minutes: only a run that does something writes to the log
    files = StateFiles(a.state)

    if not a.dry_run and setting("SYSTEMS_IMPORT_ENABLED") != "true":
        if not quiet:
            print("[systems-import] SYSTEMS_IMPORT_ENABLED is not true -- nothing done")
        return 0
    if not a.dry_run and os.name == "posix":  # the host; tests also run on the Windows laptop, which has none of these
        lock = take_lock(a.lock, 0 if a.if_requested else wait_lock)
        if lock is None:
            if wait_lock > 0 and not a.if_requested:
                files.error(f"[systems-import] ERROR: lock still held after {wait_lock} s -- nothing done")
                return 1
            if not quiet:
                print("[systems-import] another run holds the lock -- skipped")
            return 0

        def on_alarm(signum, frame):
            raise Timeout(f"time limit {a.max_seconds} s reached")
        signal.signal(signal.SIGALRM, on_alarm)  # raised into the run; state is only written at the very end
        signal.alarm(a.max_seconds)
        os.nice(19)
    token = setting("SYSTEMS_INGEST_TOKEN")
    url = setting("SYSTEMS_INGEST_URL", "http://127.0.0.1:3002/api/internal/systems/ingest")
    requested_at = None
    if a.if_requested:
        if not token:
            files.error("[systems-import] ERROR: SYSTEMS_INGEST_TOKEN not set -- cannot ask for requests")
            return 2
        pending_url = setting("SYSTEMS_PENDING_URL", re.sub(r"/ingest/?$", "/pending", url))
        pending = get_pending(pending_url, token)
        if isinstance(pending, str):
            files.error(f"{PENDING_FAILED} {pending} -- nothing done")
            return 1
        refresh, requested_at = pending
        # One attempt per request: a request this host already worked on (whatever came of it) is not redone, so an
        # ingest route that refuses every body does not cost a full run every 5 minutes.
        if not refresh or (requested_at and requested_at == files.read(files.answered)):
            files.ok(only=PENDING_FAILED)  # the GET works again; a failed import stays "last error" until one succeeds
            return 0
    try:
        rc = run(a, files, token, url)
    finally:
        if requested_at:
            files.write(files.answered, requested_at)
    if rc == 0:
        files.ok()
    return rc


def run(a, files, token, url):
    ctx = {}

    def answer_failure(error):
        """--if-requested only: a failed run still answers the request with a run record (status=error)."""
        if not a.if_requested or a.dry_run or not token:
            return
        if os.name == "posix":
            signal.signal(signal.SIGALRM, signal.SIG_DFL)
            signal.alarm(60)  # the error POST gets its own short limit; past it the process just ends
        body = error_body(a.mirror, ctx, error)
        if body is None:
            files.error("[systems-import] no valid registry at hand -- no error run record sent")
            return
        code, text = post(url, token, body)
        if not 200 <= code < 300:
            files.error(f"[systems-import] error run record not sent: HTTP {code} {text}")

    try:
        try:
            bodies, head, status = build(a.mirror, a.state, a.ref, a.first_days, run_when_current=a.if_requested, ctx=ctx)
        except Fatal as e:
            files.error(f"[systems-import] ERROR: {e}")
            answer_failure(e)
            return 2
        if not bodies:
            print(f"[systems-import] up to date at {head[:12]}")
            return 0
        if a.dry_run:
            json.dump(bodies, sys.stdout, ensure_ascii=False, indent=1)
            print()
            return 0

        if not token:
            files.error("[systems-import] ERROR: SYSTEMS_INGEST_TOKEN not set -- nothing sent")
            return 2
        for n, body in enumerate(bodies, 1):
            code, text = post(url, token, body)
            if not 200 <= code < 300:
                files.error(f"[systems-import] batch {n}/{len(bodies)} HTTP {code} {text} -- state kept, next run retries")
                answer_failure(f"batch {n}/{len(bodies)} HTTP {code} {text}")
                return 1
    except Timeout as e:
        files.error(f"[systems-import] ERROR: {e} -- state kept")
        answer_failure(e)
        return 1
    if status != "ok":
        files.error(f"[systems-import] {status}: {bodies[-1]['events'][-1]['payload']['error']} -- state kept")
        return 1
    write_state(a.state, head)
    total = sum(len(b["events"]) for b in bodies)
    print(f"[systems-import] imported {total} event(s) in {len(bodies)} batch(es), HEAD {head[:12]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
