#!/usr/bin/env python3
"""Stage only YOUR hunks of a file shared with another concurrent session (WORKLOG.md / TASKS.md), then
commit, then put the other session's hunks back into the working tree.

Codifies the recipe in memory `reference_shared_worktree_partial_staging` (2026-09-03) so it stops being
re-derived by hand every time (it cost three commits on 2026-09-04):

  1. `git diff -U0 -- <file>` is read as BYTES (text mode on Windows turns CRLF into \\r\\r\\n).
  2. Only hunks whose OLD start line falls inside one of the given ranges are kept -> `git apply --cached --unidiff-zero`.
  3. The remaining worktree diff (the foreign hunks) is saved, the worktree is set equal to the index
     (`git checkout-index -f`), and a real `git add` is run so the commit hook's "never git add-ed" heuristic
     sees an honest add of index-identical content.
  4. Optional `--commit-file <msg>` commits; then the foreign patch is re-applied to the worktree. A failed
     re-apply means the other session changed the file meanwhile -> the patch is left on disk for a manual merge.

Usage:
  python scripts/git-stage-hunks.py <file> <start-end> [<start-end> ...] [--commit-file <path>] [--extra <path> ...]
Example:
  python scripts/git-stage-hunks.py agency-os/TASKS.md 756-770 --commit-file msg.txt --extra agency-os/WORKLOG.md

Ranges are OLD-file line numbers (the `-N` side of `@@ -N,M +X,Y @@`). Exit 0 = staged (and committed if asked).
Exit 2 = nothing of yours in those ranges. Exit 3 = foreign patch could not be re-applied (left at the printed path).
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile

HUNK = re.compile(rb"^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@")


def run(*args, check=True, capture=True):
    result = subprocess.run(args, capture_output=capture)
    if check and result.returncode != 0:
        sys.stderr.write((result.stderr or b"").decode("utf-8", "replace"))
        raise SystemExit(f"command failed: {' '.join(args)}")
    return result


def filter_hunks(diff: bytes, ranges):
    out, keep = [], False
    for line in diff.split(b"\n"):
        if line.startswith((b"diff --git", b"index ", b"--- ", b"+++ ")):
            out.append(line)
            continue
        match = HUNK.match(line)
        if match:
            start = int(match.group(1))
            keep = any(lo <= start <= hi for lo, hi in ranges)
        if keep:
            out.append(line)
    kept = [l for l in out if HUNK.match(l)]
    return (b"\n".join(out) + b"\n") if kept else b"", len(kept)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file")
    parser.add_argument("ranges", nargs="+", help="old-file line ranges like 756-770 (a single number N means N-N)")
    parser.add_argument("--commit-file", help="commit message file; when given, commits after staging")
    parser.add_argument("--extra", action="append", default=[], help="other paths to `git add` whole before committing")
    args = parser.parse_args()

    ranges = []
    for spec in args.ranges:
        lo, _, hi = spec.partition("-")
        ranges.append((int(lo), int(hi or lo)))

    root = run("git", "rev-parse", "--show-toplevel").stdout.decode().strip()
    os.chdir(root)
    diff = run("git", "diff", "-U0", "--", args.file).stdout
    patch, kept = filter_hunks(diff, ranges)
    if not kept:
        print(f"nothing of yours in {args.file} within {ranges}")
        return 2
    tmp = tempfile.NamedTemporaryFile(prefix="stage-hunks-", suffix=".patch", delete=False)
    tmp.write(patch)
    tmp.close()
    run("git", "apply", "--cached", "--unidiff-zero", tmp.name)
    foreign = run("git", "diff", "--", args.file).stdout
    foreign_path = None
    if foreign.strip():
        foreign_path = tmp.name.replace(".patch", ".foreign.patch")
        with open(foreign_path, "wb") as handle:
            handle.write(foreign)
    run("git", "checkout-index", "-f", "--", args.file)
    run("git", "add", args.file)
    for extra in args.extra:
        run("git", "add", extra)
    staged = run("git", "diff", "--cached", "--numstat", "--", args.file).stdout.decode().strip()
    print(f"staged {kept} hunk(s) of {args.file}: {staged or '(index unchanged?)'}")

    if args.commit_file:
        # Pathspec-scoped on purpose: the shared index may hold ANOTHER session's staged files (2026-09-04: two
        # hci30 migrations got swept into a memory commit before this line existed). Only the file whose hunks we
        # staged plus --extra paths go into the commit; everything else stays staged for whoever staged it.
        result = run("git", "commit", "-F", args.commit_file, "--", args.file, *args.extra, check=False)
        sys.stdout.write((result.stdout or b"").decode("utf-8", "replace"))
        if result.returncode != 0:
            sys.stderr.write((result.stderr or b"").decode("utf-8", "replace"))
            if foreign_path:
                print(f"commit failed; foreign hunks kept at {foreign_path} -- worktree currently equals the index")
            return result.returncode

    if foreign_path:
        restore = run("git", "apply", foreign_path, check=False)
        if restore.returncode != 0:
            print(f"could not re-apply the other session's hunks (they changed the file meanwhile?): {foreign_path}")
            return 3
        os.unlink(foreign_path)
        print(f"restored the other session's hunks to the worktree: {run('git', 'diff', '--numstat', '--', args.file).stdout.decode().strip()}")
    os.unlink(tmp.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
