#!/usr/bin/env python3
"""Fast-forward a shared checkout whose ff-only git refused, carrying the local edits forward.

git refuses `merge --ff-only` when a file it would update is modified (or untracked) locally -- even when the
local bytes already equal the target. In D:\\Work some session nearly always has uncommitted hunks in a file that
origin also changes (agency-os/WORKLOG.md, TASKS.md), so the checkout never caught up and every commit made in it
was refused on push (2026-10-22: one commit = 22 model calls).

Per blocking file: 3-way merge (base = HEAD, ours = worktree, theirs = target). Any conflict, add/delete on one
side, or a differing untracked file -> nothing is touched. Otherwise: index entries of those paths -> HEAD, files
-> HEAD bytes, ff-only, files -> merged bytes. No stash, no reset of other paths, no push.

Invariant (2026-11-12: a cross-drive os.replace failed AFTER ten files were rewritten to HEAD, and the merged bytes
lived only in memory): before the first file changes, every local byte this run will change is saved in a backup
directory inside the repo's .git (same drive, so moves are renames) with a manifest; any failure restores all of it;
a killed process leaves that directory, whose path every failure message prints. The run touches no worktree path
but the files it merges: new bytes are written in that directory and renamed into place.

  python scripts/git-parity-merge.py --root <repo> --target origin/main     prints one JSON line, exit 0 = caught up
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--target", required=True)
    a = ap.parse_args()

    def git(*args, check=True):
        r = subprocess.run(["git", "-C", a.root, "-c", "core.quotepath=false", *args], capture_output=True)
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
    up = names("diff", "--name-only", "-z", "HEAD", a.target)
    tracked = names("diff", "--name-only", "-z", "HEAD") | names("diff", "--name-only", "-z", "--cached", "HEAD")
    untracked = names("ls-files", "-z", "--others", "--exclude-standard")

    def oid(*args):
        r = git(*args, check=False)
        return r.stdout.decode().split()[1] if args[0] == "ls-files" and r.stdout else r.stdout.decode().strip()

    plan, moved, staged = [], [], []
    for p in sorted(up & tracked):
        path = os.path.join(a.root, p)
        # The merge reads the worktree only: staged bytes that differ from it would be lost by the index reset.
        idx, head = oid("ls-files", "-s", "--", p), oid("rev-parse", f"HEAD:{p}")
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
        if r.returncode:
            return done(False, f"{p}: local edits conflict with {a.target}")
        merged = r.stdout.replace(b"\n", b"\r\n") if b"\r\n" in ours else r.stdout
        plan.append((p, path, base, merged, ours))
    for p in sorted(up & untracked):
        path = os.path.join(a.root, p)
        theirs = blob(a.target, p)
        if theirs is None or lf(open(path, "rb").read()) != lf(theirs):
            return done(False, f"{p}: untracked local file differs from {a.target}")
        moved.append((p, path))
    if not plan and not moved:
        return done(False, "nothing local blocks the fast-forward")

    # Backup first, on the repo's own drive: nothing below may change a file whose bytes are not already saved here.
    git_dir = os.path.join(a.root, git("rev-parse", "--git-common-dir").stdout.decode().strip())
    side = tempfile.mkdtemp(prefix="parity-merge-", dir=os.path.abspath(git_dir))
    try:
        for i, (p, path, *_, ours) in enumerate(plan):
            with open(os.path.join(side, f"ours-{i}"), "wb") as b:
                b.write(ours)
        with open(os.path.join(side, "manifest.json"), "w", encoding="utf-8") as m:
            json.dump({"plan": {f"ours-{i}": p for i, (p, *_) in enumerate(plan)},
                       "moved": {f"moved-{i}": p for i, (p, _) in enumerate(moved)}}, m, ensure_ascii=False)
    except Exception as e:
        shutil.rmtree(side, ignore_errors=True)
        return done(False, f"backup failed, nothing touched: {e}")
    gone = []                                       # untracked files already moved into `side`

    def restore():
        for i, path in gone:
            shutil.move(os.path.join(side, f"moved-{i}"), path)
        for p, path, *_, ours in plan:
            open(path, "wb").write(ours)
        if staged:
            git("add", "--", *staged)          # staged == worktree bytes (checked above), so this restores the index

    try:
        if plan:
            git("reset", "-q", "--", *[p for p, *_ in plan])
        for p, path, base, *_ in plan:
            open(path, "wb").write(base)
        for i, (p, path) in enumerate(moved):
            shutil.move(path, os.path.join(side, f"moved-{i}"))
            gone.append((i, path))
        ff = git("merge", "--ff-only", a.target, check=False)
        if ff.returncode:
            restore()
            shutil.rmtree(side, ignore_errors=True)
            return done(False, "ff-only still refused: " + ff.stderr.decode("utf-8", "replace").strip())
    except Exception as e:
        try:
            restore()
            shutil.rmtree(side, ignore_errors=True)
            return done(False, f"failed before the fast-forward, local files restored: {e}")
        except Exception as e2:
            return done(False, f"failed ({e}); restore failed too ({e2})", backup=side)
    written = []
    try:
        for i, (p, path, _, merged, _) in enumerate(plan):
            # Written in the backup directory, then renamed: a failed write never truncates a worktree file.
            with open(os.path.join(side, f"merged-{i}"), "wb") as t:
                t.write(merged)
            os.replace(os.path.join(side, f"merged-{i}"), path)
            written.append(p)
    except Exception as e:
        return done(False, f"fast-forwarded; local edits carried into {written or 'no file'}, then writing failed ({e})",
                    backup=side, forwarded=True)
    shutil.rmtree(side, ignore_errors=True)         # untracked copies equal the target's files, now tracked
    return done(True, f"fast-forwarded; local edits carried forward in {len(plan)} file(s), {len(moved)} identical untracked file(s) now tracked",
                [p for p, *_ in plan] + [p for p, _ in moved])


if __name__ == "__main__":
    sys.exit(main())
