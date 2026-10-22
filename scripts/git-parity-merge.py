#!/usr/bin/env python3
"""Fast-forward a shared checkout whose ff-only git refused, carrying the local edits forward.

git refuses `merge --ff-only` when a file it would update is modified (or untracked) locally -- even when the
local bytes already equal the target. In D:\\Work some session nearly always has uncommitted hunks in a file that
origin also changes (agency-os/WORKLOG.md, TASKS.md), so the checkout never caught up and every commit made in it
was refused on push (2026-10-22: one commit = 22 model calls).

Per blocking file: 3-way merge (base = HEAD, ours = worktree, theirs = target). Any conflict, add/delete on one
side, or a differing untracked file -> nothing is touched. Otherwise: index entries of those paths -> HEAD, files
-> HEAD bytes, ff-only, files -> merged bytes. No stash, no reset of other paths, no push.

  python scripts/git-parity-merge.py --root <repo> --target origin/main     prints one JSON line, exit 0 = caught up
"""
import argparse
import json
import os
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

    def done(ok, msg, files=()):
        print(json.dumps({"ok": ok, "message": msg, "files": list(files)}))   # ASCII: safe on a CP950 console
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

    if plan:
        git("reset", "-q", "--", *[p for p, *_ in plan])
    for p, path, base, *_ in plan:
        open(path, "wb").write(base)
    side = tempfile.mkdtemp()
    for i, (p, path) in enumerate(moved):
        os.replace(path, os.path.join(side, str(i)))
    ff = git("merge", "--ff-only", a.target, check=False)
    if ff.returncode:
        for i, (p, path) in enumerate(moved):
            os.replace(os.path.join(side, str(i)), path)
        for p, path, *_, ours in plan:
            open(path, "wb").write(ours)
        if staged:
            git("add", "--", *staged)          # staged == worktree bytes (checked above), so this restores the index
        return done(False, "ff-only still refused: " + ff.stderr.decode("utf-8", "replace").strip())
    for p, path, _, merged, _ in plan:
        open(path, "wb").write(merged)
    return done(True, f"fast-forwarded; local edits carried forward in {len(plan)} file(s), {len(moved)} identical untracked file(s) now tracked",
                [p for p, *_ in plan] + [p for p, _ in moved])


if __name__ == "__main__":
    sys.exit(main())
