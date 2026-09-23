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

HUNK = re.compile(rb"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$")


def rewrite_hunk_header(match, delta_kept: int) -> bytes:
    """Re-anchor a kept hunk's NEW-side start as if only the previously KEPT hunks had been applied.

    Why (2026-09-23, cost one misplaced WORKLOG commit 5f5c3e275): `git diff -U0` numbers every hunk's `+X` on
    the assumption that all earlier hunks were applied. When an earlier FOREIGN hunk is dropped, `git apply
    --unidiff-zero` positions a zero-context pure-insertion hunk (`-N,0`) by that stale `+X`, so a hunk meant
    for old line 13 landed 29 lines further down, inside another session's entry. The old side stays as-is;
    only the new side is recomputed: `old_start + delta_kept` for a replacement hunk, `old_start + 1 +
    delta_kept` for an insertion (`-N,0` means "after old line N").
    """
    old_start = int(match.group(1))
    old_len = int(match.group(2)) if match.group(2) is not None else 1
    new_len = int(match.group(4)) if match.group(4) is not None else 1
    # Unified-diff convention: a zero-length side is written as "the line AFTER which the hunk sits", so
    # `-13,0` really means old position 14 and `+73,0` really means new position 74. Convert to real
    # positions, shift by the kept delta, convert back.
    pos_old = old_start + (1 if old_len == 0 else 0)
    pos_new = pos_old + delta_kept
    new_start = pos_new - (1 if new_len == 0 else 0)
    old_part = f"-{old_start},{old_len}" if match.group(2) is not None else f"-{old_start}"
    new_part = f"+{new_start},{new_len}" if match.group(4) is not None else f"+{new_start}"
    return f"@@ {old_part} {new_part} @@".encode() + match.group(5)


def run(*args, check=True, capture=True):
    result = subprocess.run(args, capture_output=capture)
    if check and result.returncode != 0:
        sys.stderr.write((result.stderr or b"").decode("utf-8", "replace"))
        raise SystemExit(f"command failed: {' '.join(args)}")
    return result


def filter_hunks(diff: bytes, ranges):
    out, keep, delta_kept = [], False, 0
    for line in diff.split(b"\n"):
        if line.startswith((b"diff --git", b"index ", b"--- ", b"+++ ")):
            out.append(line)
            continue
        match = HUNK.match(line)
        if match:
            start = int(match.group(1))
            keep = any(lo <= start <= hi for lo, hi in ranges)
            if keep:
                # Header re-anchored against KEPT hunks only (see rewrite_hunk_header); a dropped foreign
                # hunk must not shift where git apply lands this one.
                out.append(rewrite_hunk_header(match, delta_kept))
                old_len = int(match.group(2)) if match.group(2) is not None else 1
                new_len = int(match.group(4)) if match.group(4) is not None else 1
                delta_kept += new_len - old_len
            continue
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
