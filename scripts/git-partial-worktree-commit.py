#!/usr/bin/env python3
"""Commit only YOUR hunks of a file shared with concurrent sessions (agency-os/WORKLOG.md, TASKS.md), through the gates.

Mechanism: a PRIVATE index (GIT_INDEX_FILE) built from HEAD + exactly what you select. The shared index is never
read, so another session's `git add`/`git reset` between staging and commit cannot change what you commit, and the
worktree is never written (the 2026-09-08 data loss came from rebuilding a shared file's worktree from HEAD).
Hooks: `git-shared-file-guard.js` blocks every other way of committing a shared file (a pathspec commit takes the
WORKTREE bytes of the path = every session's hunks; a bare commit takes the shared index); `git-commit-scope-guard.js`
accepts a private-index commit only while the index equals this script's marker (<index>.json) and, after the commit,
syncs the shared index entries of the committed paths to HEAD (`git reset -q -- <paths>`, worktree untouched) and
deletes index + marker.

  python scripts/git-partial-worktree-commit.py stage <shared-file> (--worklog-entry N [--date D] | --range A-B ... | --keep-re REGEX)
                                                     [--index PATH] [-- <own files>...]
      first call creates <scratch>/<roottag>-<rand>.index (+ .json marker); later calls pass --index to add to it.
      <own files> are added whole from the worktree (git add under the private index; untracked is fine).
  python scripts/git-partial-worktree-commit.py show --index PATH      what the private index would commit
  python scripts/git-partial-worktree-commit.py drop --index PATH      discard index + marker (nothing committed)
  then, exactly as printed:  GIT_INDEX_FILE=<path> git commit -F <msg>

Selection: --worklog-entry N = the block `## <date>（續N）` .. next `## ` header, taken from the worktree and inserted
into HEAD before the next header that also exists in HEAD (after `# Worklog` when none); --range = OLD-side start
lines of hunks (git diff -U0); --keep-re = regex on hunk-body lines (bytes, e.g. ^\\+MINE). A file with a mode change
is refused. Line endings follow HEAD's copy of the file. Scratch dir: $PARTIAL_COMMIT_SCRATCH or
$TEMP/git-partial-worktree-commit (the hooks read the same variable).
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys

SCRATCH = os.environ.get("PARTIAL_COMMIT_SCRATCH") or os.path.join(os.environ.get("TEMP", "/tmp"), "git-partial-worktree-commit")
HUNK = re.compile(rb"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$")


def run(*args, check=True, env=None):
    r = subprocess.run(args, capture_output=True, env=env)
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


def render(header, write):
    """Rewrite the headers of `write` for application against HEAD (new side = old side + earlier deltas)."""
    out = list(header)
    written_delta = 0
    for h in write:
        old_start = h["old_start"]
        pos_old = old_start + (1 if h["old_len"] == 0 else 0)
        pos_new = pos_old + written_delta
        new_start = pos_new - (1 if h["new_len"] == 0 else 0)
        out.append(b"@@ -%d,%d +%d,%d @@%s" % (old_start, h["old_len"], new_start, h["new_len"], h["tail"]))
        out.extend(h["body"])
        written_delta += delta(h)
    return (b"\n".join(out) + b"\n") if write else b""


def has_mode_change(diff: bytes):
    return b"\nold mode " in diff or diff.startswith(b"old mode ")


def toplevel():
    return run("git", "rev-parse", "--show-toplevel").stdout.decode().strip()


def rel_of(path, root):
    return os.path.normpath(os.path.relpath(os.path.abspath(path), root)).replace("\\", "/")


def root_tag(root):
    return hashlib.sha1(os.path.normcase(root).encode("utf-8")).hexdigest()[:8]


def index_env(index_path):
    env = dict(os.environ)
    env["GIT_INDEX_FILE"] = index_path
    return env


def marker_path(index_path):
    return index_path + ".json"


def load_marker(index_path):
    with open(marker_path(index_path), "r", encoding="utf-8") as f:
        return json.load(f)


def save_marker(index_path, marker):
    with open(marker_path(index_path), "w", encoding="utf-8") as f:
        json.dump(marker, f, ensure_ascii=False, indent=2)


def head_sha():
    return run("git", "rev-parse", "HEAD").stdout.decode().strip()


def head_blob(rel):
    r = run("git", "rev-parse", "--verify", "-q", f"HEAD:{rel}", check=False)
    return r.stdout.decode().strip() if r.returncode == 0 else None


def new_index(root):
    os.makedirs(SCRATCH, exist_ok=True)
    index_path = os.path.join(SCRATCH, f"{root_tag(root)}-{secrets.token_hex(4)}.index").replace("\\", "/")
    run("git", "read-tree", "HEAD", env=index_env(index_path))
    # head: the tree this index was read from -- a commit on a moved HEAD would silently revert whatever landed in
    # between (git does not check), so the guard refuses when HEAD != head. base: per path, HEAD's blob at stage
    # time -- after the commit the guard resets a shared-index entry only if it still equals base (nobody staged
    # anything new there meanwhile) or the committed blob.
    save_marker(index_path, {"root": root, "index": index_path, "head": head_sha(), "created": datetime.datetime.now(datetime.timezone.utc).isoformat(), "entries": {}, "own": [], "base": {}})
    return index_path


def head_bytes(rel):
    r = run("git", "show", f"HEAD:{rel}", check=False)
    return r.stdout if r.returncode == 0 else None


def worklog_target(head: bytes, work: bytes, date: str, n: int):
    """HEAD + my `## <date>（續n）` block, placed before the next header that exists in HEAD."""
    hnl = b"\r\n" if b"\r\n" in head else b"\n"
    key = f"## {date}（續{n}）".encode("utf-8")
    hlines = head.splitlines(keepends=True)
    wlines = work.splitlines(keepends=True)
    if any(l.startswith(key) for l in hlines):
        raise SystemExit(f"{key.decode()} is already in HEAD -- nothing to stage")
    starts = [i for i, l in enumerate(wlines) if l.startswith(key)]
    if len(starts) != 1:
        raise SystemExit(f"expected exactly one {key.decode()} header in the worktree, found {len(starts)}")
    i = starts[0]
    j = next((k for k in range(i + 1, len(wlines)) if wlines[k].startswith(b"## ")), len(wlines))
    block = [l.rstrip(b"\r\n") + hnl for l in wlines[i:j]]
    head_keys = {l.rstrip(b"\r\n"): k for k, l in enumerate(hlines) if l.startswith(b"## ")}
    anchor = None
    for k in range(j, len(wlines)):
        if wlines[k].startswith(b"## ") and wlines[k].rstrip(b"\r\n") in head_keys:
            anchor = head_keys[wlines[k].rstrip(b"\r\n")]
            break
    if anchor is None:
        title = next((k for k, l in enumerate(hlines) if l.rstrip(b"\r\n") == b"# Worklog"), None)
        anchor = (title + 1) if title is not None else len(hlines)
        if anchor < len(hlines) and hlines[anchor].strip() == b"" and block and block[0].strip() != b"":
            anchor += 1  # keep the blank line under the title where the entry insert helper leaves it
    return b"".join(hlines[:anchor] + block + hlines[anchor:])


def stage(args):
    root = toplevel()
    os.chdir(root)
    rel = rel_of(args.file, root)
    marker = load_marker(args.index) if args.index else None
    if marker is not None:
        if os.path.normcase(marker["root"]) != os.path.normcase(root):
            print(f"index {args.index} belongs to {marker['root']}, not {root}"); return 2
        if marker.get("head") != head_sha():
            print(f"HEAD moved since {args.index} was created ({marker.get('head', '?')[:12]} -> {head_sha()[:12]}); drop --index {args.index} and stage again"); return 2
        if rel in marker["entries"]:
            print(f"{rel} is already in {args.index}; drop and start over to change it"); return 2
    diff = run("git", "diff", "-U0", "--", rel).stdout
    if not diff.strip():
        print(f"nothing uncommitted in {rel}"); return 2
    if has_mode_change(diff):
        print(f"{rel} has a file-mode change; this tool only splits content hunks -- commit the mode change first"); return 2
    if args.worklog_entry is None and not args.range and not args.keep_re:
        print("stage needs --worklog-entry, --range or --keep-re"); return 2

    # selection first, index second: a refused stage leaves nothing behind in the scratch dir
    target = mine = hunks = header = None
    if args.worklog_entry is not None:
        head = head_bytes(rel)
        if head is None:
            print(f"{rel} is not in HEAD; a brand-new shared file needs no splitting -- add it as an own file"); return 2
        with open(rel, "rb") as f:
            work = f.read()
        target = worklog_target(head, work, args.date, args.worklog_entry)
    else:
        ranges = []
        for spec in args.range or []:
            lo, _, hi = spec.partition("-")
            ranges.append((int(lo), int(hi or lo)))
        keep_re = re.compile(args.keep_re.encode("utf-8")) if args.keep_re else None
        header, hunks = parse(diff)
        mine = [h for h in hunks if any(lo <= h["old_start"] <= hi for lo, hi in ranges) or (keep_re is not None and any(keep_re.search(l) for l in h["body"]))]
        if not mine:
            print(f"no hunk of yours in {rel} (ranges={ranges}, keep-re={args.keep_re!r})"); return 2

    index_path = args.index or new_index(root)
    marker = marker or load_marker(index_path)
    env = index_env(index_path)

    if target is not None:
        r = subprocess.run(["git", "hash-object", "-w", "--stdin", f"--path={rel}"], input=target, capture_output=True)
        if r.returncode != 0:
            sys.stderr.write(r.stderr.decode("utf-8", "replace")); return 2
        blob = r.stdout.decode().strip()
        run("git", "update-index", "--cacheinfo", f"100644,{blob},{rel}", env=env)
        added = target.count(b"\n") - head.count(b"\n")
        what = f"HEAD + 續{args.worklog_entry} block ({added} lines)"
    else:
        patch = render(header, mine)
        r = subprocess.run(["git", "apply", "--cached", "--unidiff-zero", "-"], input=patch, capture_output=True, env=env)
        if r.returncode != 0:
            sys.stderr.write(r.stderr.decode("utf-8", "replace")); print("git apply --cached rejected my hunks against HEAD"); return 2
        blob = run("git", "rev-parse", f":{rel}", env=env).stdout.decode().strip()
        what = f"HEAD + {len(mine)} of {len(hunks)} hunk(s)"
    marker["entries"][rel] = blob
    marker.setdefault("base", {})[rel] = head_blob(rel)

    own = [rel_of(p, root) for p in (args.own or [])]
    if own:
        run("git", "add", "--", *own, env=env)
        for p in own:
            if p not in marker["own"]:
                marker["own"].append(p)
                marker["base"][p] = head_blob(p)
    save_marker(index_path, marker)
    print(f"staged {rel}: {what} -> blob {blob[:12]}; own files: {len(own)}")
    print(f"private index: {index_path}")
    print(f"next: GIT_INDEX_FILE={index_path} git commit -F <msg>")
    print(f"more: python scripts/git-partial-worktree-commit.py stage <file> ... --index {index_path} [-- <own files>]")
    return 0


def show(args):
    os.chdir(toplevel())
    marker = load_marker(args.index)
    print(json.dumps(marker, ensure_ascii=False, indent=2))
    sys.stdout.write(run("git", "diff", "--cached", "--stat", env=index_env(args.index)).stdout.decode("utf-8", "replace"))
    return 0


def drop(args):
    for p in (args.index, marker_path(args.index)):
        if os.path.exists(p):
            os.unlink(p)
    print(f"dropped {args.index} (+ marker); nothing was committed")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("stage")
    s.add_argument("file")
    s.add_argument("--worklog-entry", type=int)
    s.add_argument("--date", default=datetime.date.today().isoformat())
    s.add_argument("--range", action="append")
    s.add_argument("--keep-re")
    s.add_argument("--index")
    s.add_argument("own", nargs="*")
    w = sub.add_parser("show"); w.add_argument("--index", required=True)
    d = sub.add_parser("drop"); d.add_argument("--index", required=True)
    args = ap.parse_args(argv)
    return {"stage": stage, "show": show, "drop": drop}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
