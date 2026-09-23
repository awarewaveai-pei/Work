#!/usr/bin/env python3
"""Commit only YOUR hunks of a file shared with concurrent sessions, through the gates.

Companion to git-stage-hunks.py (same hunk filter, opposite mechanism). That script stages hunks into
the INDEX and commits with `git commit -- <file>`; but a pathspec commit takes the WORKING TREE version
of the path, so it had to swap the worktree to the index first and the commit ran inside python, where
the PreToolUse gates (git-commit-scope-guard, verify-gate-commit, doc-link-commit-check) never see it.
This script only prepares and restores the worktree; the operator runs the literal
`git add -- ... && git commit -F <msg> -- <file> ...` in between, so every gate fires on a real,
pathspec-scoped commit (the scope guard exempts a git-verified pathspec tail).

  python scripts/git-partial-worktree-commit.py prep <file> [--range A-B ...] [--keep-re REGEX]
      saves <scratch>/<name>.all.patch (everything uncommitted, the safety copy),
      writes <name>.mine.patch / <name>.foreign.patch, sets the worktree file to HEAD + mine.
  python scripts/git-partial-worktree-commit.py restore <file>
      re-applies <name>.foreign.patch to the worktree (run right after the commit).

A hunk is "mine" when its OLD-side start line falls in a --range, or its body matches --keep-re
(the regex is matched per line, on bytes, so anchor with ^ and end with \\r?$ for CRLF files).
Hunk headers are re-anchored for the file they will be applied to: mine.patch against HEAD,
foreign.patch against HEAD + mine (my insertions shift every later line -- codex 2026-09-23).
Refuses when the file has STAGED changes (they would ride along in a pathspec commit and are not
in the safety copy) or when a previous prep of the same file has not been restored yet.
The window between prep and restore is the only moment another session's hunks are absent from the
file, so keep it to one commit. If restore cannot re-apply (someone edited meanwhile), the patches stay
in <scratch> and the script exits 3: merge by hand from <name>.foreign.patch.
"""
import argparse
import hashlib
import os
import re
import subprocess
import sys

SCRATCH = os.environ.get("PARTIAL_COMMIT_SCRATCH") or os.path.join(os.environ.get("TEMP", "/tmp"), "git-partial-worktree-commit")
HUNK = re.compile(rb"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$")


def run(*args, check=True):
    r = subprocess.run(args, capture_output=True)
    if check and r.returncode != 0:
        sys.stderr.write((r.stderr or b"").decode("utf-8", "replace"))
        raise SystemExit(f"command failed: {' '.join(args)}")
    return r


def parse(diff: bytes):
    """-> (header_lines, hunks) where a hunk is {old_start, old_len, new_len, tail, body}."""
    header, hunks, cur = [], [], None
    for line in diff.split(b"\n"):
        if line.startswith((b"diff --git", b"index ", b"--- ", b"+++ ")):
            header.append(line)
            continue
        m = HUNK.match(line)
        if m:
            cur = {
                "old_start": int(m.group(1)),
                "old_len": int(m.group(2)) if m.group(2) is not None else 1,
                "new_len": int(m.group(4)) if m.group(4) is not None else 1,
                "tail": m.group(5),
                "body": [],
            }
            hunks.append(cur)
        elif cur is not None and line != b"":
            cur["body"].append(line)
    return header, hunks


def delta(h):
    return h["new_len"] - h["old_len"]


def first_touched(h):
    # a replacement starts AT old_start; an insertion (old_len 0) sits AFTER old_start
    return h["old_start"] if h["old_len"] else h["old_start"] + 1


def render(header, write, applied):
    """Rewrite the headers of `write` for a file that already contains the `applied` hunks.

    old side: shifted by every applied hunk that lies entirely before this hunk's first line
              (an applied hunk shifts the lines at or after old_start + max(old_len, 1)).
    new side: the shifted old position plus the deltas of the `write` hunks rendered before it,
              the same convention as git-stage-hunks.rewrite_hunk_header.
    """
    out = list(header)
    written_delta = 0
    for h in write:
        shift_old = sum(delta(a) for a in applied if first_touched(h) >= a["old_start"] + max(a["old_len"], 1))
        old_start = h["old_start"] + shift_old
        pos_old = old_start + (1 if h["old_len"] == 0 else 0)
        pos_new = pos_old + written_delta
        new_start = pos_new - (1 if h["new_len"] == 0 else 0)
        out.append(b"@@ -%d,%d +%d,%d @@%s" % (old_start, h["old_len"], new_start, h["new_len"], h["tail"]))
        out.extend(h["body"])
        written_delta += delta(h)
    return (b"\n".join(out) + b"\n") if write else b""


def has_mode_change(diff: bytes):
    """`old mode`/`new mode` headers: a mode change would be dropped by the hunk rewrite and reset by
    `git checkout --`, so prep refuses instead of silently losing the executable bit (codex r2)."""
    return b"\nold mode " in diff or diff.startswith(b"old mode ")


def names(path):
    # Identity = repo root + path relative to it, normalised, so `./a/b.md`, `a\\b.md` and `a/b.md`
    # (and the same relative path in two different clones) never share or steal scratch files.
    root = run("git", "rev-parse", "--show-toplevel").stdout.decode().strip()
    rel = os.path.normpath(os.path.relpath(os.path.abspath(path), root)).replace("\\", "/")
    tag = hashlib.sha1(f"{os.path.normcase(root)}::{rel}".encode("utf-8")).hexdigest()[:8]
    os.makedirs(SCRATCH, exist_ok=True)
    out = {k: os.path.join(SCRATCH, f"{os.path.basename(rel)}-{tag}.{k}.patch") for k in ("all", "mine", "foreign")}
    out["prepped"] = os.path.join(SCRATCH, f"{os.path.basename(rel)}-{tag}.prepped")   # exists between prep and restore
    return out


def prep(args):
    ranges = []
    for spec in args.range or []:
        lo, _, hi = spec.partition("-")
        ranges.append((int(lo), int(hi or lo)))
    keep_re = re.compile(args.keep_re.encode("utf-8")) if args.keep_re else None
    p = names(args.file)
    if os.path.exists(p["prepped"]):
        print(f"a previous prep of {args.file} has not been restored (marker {p['prepped']}); run restore first")
        return 2
    if run("git", "diff", "--cached", "--quiet", "--", args.file, check=False).returncode != 0:
        print(f"{args.file} has STAGED changes; a pathspec commit would carry them and they are not in the safety copy -- unstage (git restore --staged) or commit them first")
        return 2
    diff = run("git", "diff", "-U0", "--", args.file).stdout
    if not diff.strip():
        print(f"nothing uncommitted in {args.file}")
        return 2
    if has_mode_change(diff):
        print(f"{args.file} has a file-mode change; this tool only splits content hunks -- commit the mode change first")
        return 2
    header, hunks = parse(diff)
    mine, foreign = [], []
    for h in hunks:
        is_mine = any(lo <= h["old_start"] <= hi for lo, hi in ranges) or (keep_re is not None and any(keep_re.search(l) for l in h["body"]))
        (mine if is_mine else foreign).append(h)
    if not mine:
        print(f"no hunk of yours in {args.file} (ranges={ranges}, keep-re={args.keep_re!r})")
        return 2
    with open(p["all"], "wb") as f:
        f.write(diff)
    with open(p["mine"], "wb") as f:
        f.write(render(header, mine, []))
    with open(p["foreign"], "wb") as f:
        f.write(render(header, foreign, mine))
    with open(p["prepped"], "w") as f:
        f.write(args.file + "\n")
    run("git", "checkout", "--", args.file)
    run("git", "apply", "--unidiff-zero", p["mine"])
    print(f"worktree {args.file} = HEAD + {len(mine)} hunk(s) of yours; {len(foreign)} foreign hunk(s) parked in {p['foreign']}")
    print("now: git add -- <files> && git commit -F <msg> -- " + args.file + " <files>; then: restore " + args.file)
    return 0


def restore(args):
    p = names(args.file)
    if not os.path.exists(p["prepped"]) and not os.path.exists(p["foreign"]):
        print(f"no parked prep for {args.file}")
        return 2
    if not os.path.exists(p["foreign"]) or os.path.getsize(p["foreign"]) == 0:
        for k in ("foreign", "prepped"):
            if os.path.exists(p[k]): os.unlink(p[k])
        print("no foreign hunks were parked; nothing to restore")
        return 0
    r = run("git", "apply", "--unidiff-zero", p["foreign"], check=False)
    if r.returncode != 0:
        sys.stderr.write((r.stderr or b"").decode("utf-8", "replace"))
        print(f"could not re-apply the other sessions' hunks; merge by hand from {p['foreign']} (full pre-commit diff: {p['all']})")
        return 3
    os.unlink(p["foreign"])
    if os.path.exists(p["prepped"]): os.unlink(p["prepped"])
    print(f"restored the other sessions' hunks: {run('git', 'diff', '--numstat', '--', args.file).stdout.decode().strip()}")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("prep"); a.add_argument("file"); a.add_argument("--range", action="append"); a.add_argument("--keep-re")
    b = sub.add_parser("restore"); b.add_argument("file")
    args = ap.parse_args(argv)
    root = run("git", "rev-parse", "--show-toplevel").stdout.decode().strip()
    os.chdir(root)
    return prep(args) if args.cmd == "prep" else restore(args)


if __name__ == "__main__":
    sys.exit(main())
