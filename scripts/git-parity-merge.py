#!/usr/bin/env python3
"""Fast-forward a shared checkout whose ff-only git refused, carrying the local edits forward.

git refuses `merge --ff-only` when a file it would update is modified (or untracked) locally -- even when the
local bytes already equal the target. In D:\\Work some session nearly always has uncommitted hunks in a file that
origin also changes (agency-os/WORKLOG.md, TASKS.md), so the checkout never caught up and every commit made in it
was refused on push (2026-10-22: one commit = 22 model calls).

Per blocking file: 3-way merge (base = HEAD, ours = worktree, theirs = target); a conflicting file whose bytes equal a
version upstream committed after HEAD is an old snapshot and takes the target's -- its local bytes stay in the backup
directory, which is then kept and named in the message (equal bytes cannot tell a snapshot from a deliberate return to
that version, Codex 2026-11-16). Any other conflict, add/delete on one
side, or a differing untracked file -> nothing is touched. Otherwise: index entries of those paths -> HEAD, files
-> HEAD bytes, ff-only, files -> merged bytes. No stash, no reset of other paths, no push.

Invariant (2026-11-12: a cross-drive os.replace failed AFTER ten files were rewritten to HEAD, and the merged bytes
lived only in memory): before the first file changes, every local byte this run will change is saved in a backup
directory inside the repo's .git (same drive, so moves are renames) with a manifest; any failure restores all of it;
a killed process leaves that directory, whose path every failure message prints. The run touches no worktree path
but the files it merges: new bytes are written in that directory and renamed into place. Every file is re-read right
before its own write and must still equal the bytes saved in the backup, else the run stops and restores; the shared
checkout has no file locks, so an edit landing inside that read-to-write instant, or between a write and a later
failure's restore, is the one window left (critic + Codex 2026-11-15).

  python scripts/git-parity-merge.py --root <repo> --target origin/main     prints one JSON line, exit 0 = caught up
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--target", required=True)
    a = ap.parse_args()

    def git(*args, check=True, inp=None):
        r = subprocess.run(["git", "-C", a.root, "-c", "core.quotepath=false", *args], capture_output=True, input=inp)
        if check and r.returncode:
            raise RuntimeError(f"git {' '.join(args)}: {r.stderr.decode('utf-8', 'replace').strip()}")
        return r

    def blob(rev, p):
        r = git("show", f"{rev}:{p}", check=False)
        return r.stdout if r.returncode == 0 else None

    def names(*args):
        return {x for x in git(*args).stdout.decode("utf-8").split("\0") if x}

    def done(ok, msg, files=(), backup=None, forwarded=False):
        # backup = set only when local edits are NOT in the files any more, just in that directory (manifest.json);
        # forwarded = HEAD already moved to the target.
        extra = {"backup": backup, "fastForwarded": forwarded} if backup else {}
        print(json.dumps({"ok": ok, "message": msg, "files": list(files), **extra}))   # ASCII: safe on a CP950 console
        return 0 if ok else 1

    lf = lambda b: b.replace(b"\r\n", b"\n")

    def upstream_had(p, ours):
        # True when the local bytes are exactly a version of p that upstream committed between HEAD and the target:
        # a snapshot of work that was committed from another checkout, not a local edit. 2026-11-16: three such files
        # in D:\Work (edited there, committed from a worktree) blocked the ff once upstream changed the same line again.
        return any(lf(blob(c, p) or b"") == ours
                   for c in git("log", "--format=%H", f"HEAD..{a.target}", "--", p).stdout.decode().split())

    def place(tmp, path):
        # Rename into place; a target on another volume (D:\Work\.claude is a junction into C:) cannot be renamed to,
        # so it is copied instead (not shutil.copyfile: its CopyFile2 fast path answers EINVAL on that junction path).
        # A file git has just checked out can be refused for a moment on Windows (EINVAL, 2026-11-15 18:12: the WORKLOG
        # write right after the ff), so both forms are retried briefly before the failure is reported.
        last = None
        for attempt in range(6):
            try:
                os.replace(tmp, path)
                return
            except OSError as e:
                last = e
            try:
                with open(tmp, "rb") as src, open(path, "wb") as dst:
                    dst.write(src.read())
                os.remove(tmp)
                return
            except OSError as e:
                last = e
            time.sleep(0.2 * (attempt + 1))
        raise last
    up = names("diff", "--name-only", "-z", "HEAD", a.target)
    tracked = names("diff", "--name-only", "-z", "HEAD") | names("diff", "--name-only", "-z", "--cached", "HEAD")
    untracked = names("ls-files", "-z", "--others", "--exclude-standard")

    def oid(*args):
        r = git(*args, check=False)
        return r.stdout.decode().split()[1] if args[0] == "ls-files" and r.stdout else r.stdout.decode().strip()

    plan, moved, staged, idx_seen, stale = [], [], [], {}, []
    for p in sorted(up & tracked):
        path = os.path.join(a.root, p)
        # The merge reads the worktree only: staged bytes that differ from it would be lost by the index reset.
        idx, head = oid("ls-files", "-s", "--", p), oid("rev-parse", f"HEAD:{p}")
        idx_seen[p] = idx
        if idx != head:
            if not os.path.exists(path) or idx != oid("hash-object", "--", path):
                return done(False, f"{p}: staged content differs from the file")
            staged.append(p)
        base, theirs = blob("HEAD", p), blob(a.target, p)
        ours = open(path, "rb").read() if os.path.exists(path) else None
        if base is None or theirs is None or ours is None:
            return done(False, f"{p}: added or deleted on one side")
        with tempfile.TemporaryDirectory() as d:
            fs = []
            for n, data in (("ours", ours), ("base", base), ("theirs", theirs)):
                fs.append(os.path.join(d, n))
                open(fs[-1], "wb").write(lf(data))
            # An append-only log (.gitattributes merge=union, e.g. WORKLOG.md: every session inserts at the top)
            # keeps both sides; every other file must merge without overlap.
            union = git("check-attr", "merge", "--", p).stdout.decode().strip().endswith(": union")
            r = subprocess.run(["git", "merge-file", "-p", *(["--union"] if union else []), *fs], capture_output=True)
        out = r.stdout
        if r.returncode:
            if not upstream_had(p, lf(ours)):
                return done(False, f"{p}: local edits conflict with {a.target}")
            out = lf(theirs)                         # nothing local in it: the target's version replaces the old one
            stale.append(p)
        merged = out.replace(b"\n", b"\r\n") if b"\r\n" in ours else out
        plan.append((p, path, base, merged, ours))
    for p in sorted(up & untracked):
        path = os.path.join(a.root, p)
        theirs, ours = blob(a.target, p), open(path, "rb").read()
        if theirs is None or lf(ours) != lf(theirs):
            return done(False, f"{p}: untracked local file differs from {a.target}")
        moved.append((p, path, ours))                   # ours: the exact bytes, re-checked before the move
    # eol phantom: `git status` calls a file modified on SIZE alone (worktree CRLF, eol=lf blob) although its normalized
    # content equals the index, and ff-only then refuses it as "not uptodate" -- nothing local is in it. 2026-11-15:
    # D:\Work had 168 such files; one in every upstream change set kept the checkout 123 commits behind for days.
    # Rewritten from the index (git's canonical bytes) before the ff; the bytes go into the backup like every other.
    status_m, skip = set(), False
    for x in git("status", "--porcelain=v1", "-z").stdout.decode("utf-8").split("\0"):
        if skip:                                     # a rename/copy record is followed by its source path, no XY prefix
            skip = False; continue
        if x[:2] == " M":                            # staged entries are already in `tracked` (plan), never phantoms
            status_m.add(x[3:])
        skip = x[:1] in ("R", "C")
    renorm = []
    for p in sorted((up & status_m) - tracked):
        path = os.path.join(a.root, p)
        # "normalized hash == index" proves nothing local only when the clean path is eol-only: a clean filter, ident
        # or a working-tree encoding could hide local output behind an equal hash (critic 2026-11-15)
        if git("check-attr", "filter", "ident", "working-tree-encoding", "--", p).stdout.decode().count(": unspecified") != 3:
            continue
        idx = git("ls-files", "-s", "--", p).stdout.decode().split()
        if len(idx) >= 2 and idx[1] == git("hash-object", f"--path={p}", "--", path).stdout.decode().strip():
            renorm.append((p, path, open(path, "rb").read()))
    if not plan and not moved and not renorm:
        return done(False, "nothing local blocks the fast-forward")

    # Backup first, on the repo's own drive: nothing below may change a file whose bytes are not already saved here.
    git_dir = os.path.join(a.root, git("rev-parse", "--git-common-dir").stdout.decode().strip())
    side = tempfile.mkdtemp(prefix="parity-merge-", dir=os.path.abspath(git_dir))
    try:
        for i, (p, path, *_, ours) in enumerate(plan):
            with open(os.path.join(side, f"ours-{i}"), "wb") as b:
                b.write(ours)
        for i, (p, path, ours) in enumerate(renorm):
            open(os.path.join(side, f"renorm-{i}"), "wb").write(ours)
        with open(os.path.join(side, "manifest.json"), "w", encoding="utf-8") as m:
            json.dump({"plan": {f"ours-{i}": p for i, (p, *_) in enumerate(plan)},
                       "moved": {f"moved-{i}": p for i, (p, *_) in enumerate(moved)},
                       "renorm": {f"renorm-{i}": p for i, (p, *_) in enumerate(renorm)}}, m, ensure_ascii=False)
    except Exception as e:
        shutil.rmtree(side, ignore_errors=True)
        return done(False, f"backup failed, nothing touched: {e}")
    gone = []                                       # untracked files already moved into `side`
    wrote = {}                                      # path -> the bytes this run put there (plan: HEAD's; renorm: the index's)

    def restore():
        # A file is put back only while it still holds what this run wrote (or was never written): another writer's
        # newer bytes are left in place and named, and the backup directory stays for the pre-run bytes.
        kept = []
        for i, path in gone:
            if os.path.exists(path):
                kept.append(os.path.relpath(path, a.root).replace(os.sep, "/")); continue
            shutil.move(os.path.join(side, f"moved-{i}"), path)
        for p, path, *_, ours in list(plan) + list(renorm):
            cur = open(path, "rb").read()
            if cur != ours and cur != wrote.get(path, ours):   # neither untouched nor this run's bytes: someone else's
                kept.append(p); continue
            if cur != ours:
                open(path, "wb").write(ours)
        back = [p for p in staged if p not in kept]
        if back:
            git("add", "--", *back)            # staged == worktree bytes (checked above), so this restores the index;
        return kept                            # a kept file is never re-staged: that would stage the other writer's bytes

    def fail(msg):
        try:
            kept = restore()
        except Exception as e2:
            return done(False, f"{msg}; restore failed too ({e2})", backup=side)
        if kept:
            return done(False, f"{msg}; {len(kept)} file(s) another writer changed meanwhile were left as they are, "
                               f"their pre-run bytes stay in the backup: {', '.join(kept)}", backup=side)
        shutil.rmtree(side, ignore_errors=True)
        return done(False, msg)

    try:
        # A save by another session or an editor after the planning read would be overwritten with the backup holding
        # stale bytes: each file is re-read in the instant before its own write; a difference raises, and the except
        # below restores everything written so far.
        def still_ours(p, path, ours):
            if open(path, "rb").read() != ours:
                raise RuntimeError(f"{p} changed while this run was writing")
        for p, *_ in plan:                           # a stage by another session since planning would be dropped by the reset
            if oid("ls-files", "-s", "--", p) != idx_seen[p]:
                raise RuntimeError(f"{p}: the shared index changed while this run was planning")
        if plan:
            git("reset", "-q", "--", *[p for p, *_ in plan])
        for i, (p, path, base, _, ours) in enumerate(plan):
            still_ours(p, path, ours)
            with open(os.path.join(side, f"base-{i}"), "wb") as t:   # rename into place: a failed write never truncates
                t.write(base)
            wrote[path] = base
            place(os.path.join(side, f"base-{i}"), path)
        if renorm:                                   # paths on stdin: 168 of them would overrun a Windows command line
            for p, path, ours in renorm:
                still_ours(p, path, ours)
            git("checkout-index", "-f", "-z", "--stdin", inp=b"\0".join(p.encode("utf-8") for p, *_ in renorm) + b"\0")
            for p, path, _ in renorm:
                wrote[path] = open(path, "rb").read()
        for i, (p, path, ours) in enumerate(moved):
            still_ours(p, path, ours)
            shutil.move(path, os.path.join(side, f"moved-{i}"))
            gone.append((i, path))
        ff = git("merge", "--ff-only", a.target, check=False)
        if ff.returncode:
            return fail("ff-only still refused: " + ff.stderr.decode("utf-8", "replace").strip())
    except Exception as e:
        return fail(f"failed before the fast-forward, local files restored: {e}")
    written = []
    try:
        for i, (p, path, _, merged, _) in enumerate(plan):
            # Written in the backup directory, then renamed: a failed write never truncates a worktree file.
            with open(os.path.join(side, f"merged-{i}"), "wb") as t:
                t.write(merged)
            place(os.path.join(side, f"merged-{i}"), path)
            written.append(p)
    except Exception as e:
        return done(False, f"fast-forwarded; local edits carried into {written or 'no file'}, then writing failed ({e})",
                    backup=side, forwarded=True)
    kept = f" (local bytes kept in {side}: {', '.join(stale)})" if stale else ""
    if not stale:
        shutil.rmtree(side, ignore_errors=True)     # untracked copies equal the target's files, now tracked
    return done(True, f"fast-forwarded; local edits carried forward in {len(plan) - len(stale)} file(s), {len(stale)} old upstream snapshot(s) "
                      f"replaced{kept}, {len(moved)} identical untracked file(s) now tracked, {len(renorm)} eol-only file(s) renormalized",
                [p for p, *_ in plan] + [p for p, *_ in moved] + [p for p, *_ in renorm])


if __name__ == "__main__":
    sys.exit(main())
