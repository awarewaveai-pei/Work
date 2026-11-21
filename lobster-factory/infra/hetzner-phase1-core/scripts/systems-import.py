#!/usr/bin/env python3
"""systems-import.py -- git commits -> /ops/systems events (agency-os/handoffs/2026-11-21-systems-control-center,
PLAN §5-§7, briefs/COMMON.md contracts 1 and 2). Cron: cron.d/systems-import, 04:30 Taipei.

Reads a bare mirror of the repo (never /root/Work, the deploy tree), takes agency-os/systems/registry.json at HEAD,
walks previous_head..HEAD (first run: the last 90 days) and POSTs events to next-admin's ingest route in batches of
<= 500. The state file (last imported HEAD) is written only after every batch got a 2xx: a failed run is redone next
night and the route drops duplicates by event_key. A tracker failure only makes /ops/systems stale -- it never blocks
a commit or a deploy.

  --mirror <dir>   bare mirror (one-time: git clone --mirror <origin url> /root/systems-mirror.git)
  --state <file>   last imported HEAD
  --dry-run        print the request bodies, POST nothing, write no state (runs even when the import is disabled)

Settings (environment first, else a plain read of SYSTEMS_ENV_FILE -- never sourced, like poke.sh):
  SYSTEMS_IMPORT_ENABLED  anything but "true" -> one line, exit 0 (default OFF)
  SYSTEMS_INGEST_TOKEN    bearer token for the route (sent in a header, never on a command line)
  SYSTEMS_INGEST_URL      default http://127.0.0.1:3002/api/internal/systems/ingest
Exit 0 = imported / up to date / disabled; 1 = history diverged or a POST failed; 2 = could not run.
History diverged (previous_head is not an ancestor of HEAD, e.g. a force push): one orphaned event per commit that
left main plus the import_run event are sent, nothing new is imported, the state is kept, and every run reports it until someone deletes the state file (= re-import the last 90 days;
the route skips events it already has).
Trailers come from %(trailers:only,unfold) in the one `git log` call: the same parser as `git interpret-trailers
--parse`, without one process per commit (a first run walks ~4000 commits within the 300 s limit).
Guards live in here, not as flock/timeout/nice wrappers on the cron line, so install-host-schedules.sh can still check
the `python3 /path` form: one run at a time (non-blocking lock; a second run exits 0), 300 s alarm, nice 19 (which
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


def write_state(path, head):
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".systems-import.")
    with os.fdopen(fd, "w") as f:
        f.write(head + "\n")
    os.replace(tmp, path)


def build(mirror, state_path, ref, first_days):
    """-> (bodies, head, status); bodies == [] when already up to date."""
    git(mirror, "fetch", "--prune", "--quiet", "origin")
    head = git(mirror, "rev-parse", "--verify", f"{ref}^{{commit}}").stdout.strip()
    prev = None
    if os.path.exists(state_path):
        with open(state_path, encoding="utf-8") as f:
            prev = f.read().strip() or None
    if prev == head:
        return [], head, "ok"
    reg_text = git(mirror, "show", f"{head}:{REGISTRY_PATH}", check=False)
    if reg_text.returncode != 0:
        raise Fatal(f"{REGISTRY_PATH} missing at {head[:12]}")
    reg = load_registry(reg_text.stdout)
    idx = Index(reg)
    gaps = {"unowned_paths": set(), "unclassified_trailers": set()}
    events, status, error = [], "ok", None
    at = datetime.now(timezone.utc).isoformat(timespec="seconds")

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
    import_run = {"head": head, "previous_head": prev, "status": status, "error": error, "gaps": {
        "unowned_paths": sorted(gaps["unowned_paths"])[:GAP_CAP],
        "unclassified_trailers": sorted(gaps["unclassified_trailers"])[:GAP_CAP],
        "unregistered_products": unregistered, "unclaimed_supervisors": unclaimed, "dead_source_paths": dead}}
    # last of all, so the route has a run record only once every earlier batch landed; the time in the key gives every
    # run its own record (a rerun at the same HEAD must still update status and gaps)
    events.append({"event_key": f"run:{head}:{at}", "system_slug": None, "phase_slug": None, "feature_slug": None,
                   "event_type": "import_run", "source": "importer", "commit_sha": head,
                   "occurred_at": at, "payload": import_run, "evidence": None})
    bodies = [{"registry": reg, "events": events[i:i + BATCH]} for i in range(0, len(events), BATCH)]
    return bodies, head, status


def main(argv=None):
    ap = argparse.ArgumentParser(description="git commits -> /ops/systems events")
    ap.add_argument("--mirror", default="/root/systems-mirror.git")
    ap.add_argument("--state", default="/var/lib/awarewave/systems-import.head")
    ap.add_argument("--ref", default="refs/heads/main")
    ap.add_argument("--first-days", type=int, default=90)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--lock", default="/tmp/systems-import.lock")
    ap.add_argument("--max-seconds", type=int, default=300)
    a = ap.parse_args(argv)

    if not a.dry_run and setting("SYSTEMS_IMPORT_ENABLED") != "true":
        print("[systems-import] SYSTEMS_IMPORT_ENABLED is not true -- nothing done")
        return 0
    if not a.dry_run and os.name == "posix":  # the host; tests also run on the Windows laptop, which has none of these
        import fcntl
        lock = open(a.lock, "w")
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("[systems-import] another run holds the lock -- skipped")
            return 0
        signal.alarm(a.max_seconds)  # SIGALRM ends the process; state is only written at the very end
        os.nice(19)
    try:
        bodies, head, status = build(a.mirror, a.state, a.ref, a.first_days)
    except Fatal as e:
        print(f"[systems-import] ERROR: {e}", file=sys.stderr)
        return 2
    if not bodies:
        print(f"[systems-import] up to date at {head[:12]}")
        return 0
    if a.dry_run:
        json.dump(bodies, sys.stdout, ensure_ascii=False, indent=1)
        print()
        return 0

    token = setting("SYSTEMS_INGEST_TOKEN")
    if not token:
        print("[systems-import] ERROR: SYSTEMS_INGEST_TOKEN not set -- nothing sent", file=sys.stderr)
        return 2
    url = setting("SYSTEMS_INGEST_URL", "http://127.0.0.1:3002/api/internal/systems/ingest")
    for n, body in enumerate(bodies, 1):
        code, text = post(url, token, body)
        if not 200 <= code < 300:
            print(f"[systems-import] batch {n}/{len(bodies)} HTTP {code} {text} -- state kept, next run retries",
                  file=sys.stderr)
            return 1
    if status != "ok":
        print(f"[systems-import] {status}: {bodies[-1]['events'][-1]['payload']['error']} -- state kept", file=sys.stderr)
        return 1
    write_state(a.state, head)
    total = sum(len(b["events"]) for b in bodies)
    print(f"[systems-import] imported {total} event(s) in {len(bodies)} batch(es), HEAD {head[:12]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
