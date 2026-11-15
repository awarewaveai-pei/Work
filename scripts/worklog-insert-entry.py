#!/usr/bin/env python3
"""Insert a new dated WORKLOG entry at the top with the next free (續N) number.

  python scripts/worklog-insert-entry.py <entry.md> [--date YYYY-MM-DD]

The entry file uses the placeholder `續NNN` (any number of times); it is replaced by the first
unused number after the highest `（續N）` already present for that date in agency-os/WORKLOG.md, so
concurrent sessions cannot hand-pick the same number (2026-09-23: 續107/108/109/110/112/114/115/118
were each claimed twice by sessions that chose their number before writing). Prints the number used.
Line endings follow the file. Exit 2 when the placeholder is missing.
"""
import argparse
import datetime
import os
import re
import subprocess
import sys


def other_copies(rel):
    """origin/main's blob and the file in every other worktree of this repository (read-only; a failure skips that copy)."""
    out = []
    r = subprocess.run(["git", "show", f"origin/main:{rel}"], capture_output=True)
    if r.returncode == 0:
        out.append(r.stdout.decode("utf-8", "replace"))
    here = os.path.normcase(os.path.abspath(rel))
    for line in subprocess.run(["git", "worktree", "list", "--porcelain"], capture_output=True).stdout.decode("utf-8", "replace").splitlines():
        if not line.startswith("worktree "):
            continue
        p = os.path.join(line[len("worktree "):], rel)
        if os.path.normcase(os.path.abspath(p)) == here or not os.path.exists(p):
            continue
        try:
            with open(p, "rb") as f:
                out.append(f.read().decode("utf-8", "replace"))
        except OSError:
            pass
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("entry")
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    ap.add_argument("--worklog", default="agency-os/WORKLOG.md")
    a = ap.parse_args()
    root = os.popen("git rev-parse --show-toplevel").read().strip()
    os.chdir(root)
    entry = open(a.entry, "rb").read().decode("utf-8")
    if "續NNN" not in entry:
        print("entry has no 續NNN placeholder"); return 2
    b = open(a.worklog, "rb").read()
    # The header line decides: another session's uncommitted hunk can leave stray CRLF lines in an LF file.
    nl = b"\r\n" if b.split(b"\n", 1)[0].endswith(b"\r") else b"\n"
    text = b.decode("utf-8")
    numbers = lambda t: [int(m) for m in re.findall(r"^## " + re.escape(a.date) + r"（續(\d+)）", t, re.M)]
    # 2026-11-15: two worktree sessions were each handed 續7 -- each saw only its own file. The number is taken
    # above every copy this checkout can see: this file, origin/main's (as last fetched), every linked worktree's.
    used = numbers(text)
    for other in other_copies(os.path.relpath(os.path.abspath(a.worklog), root).replace(os.sep, "/")):   # repo-relative, whatever --worklog was
        used += numbers(other)
    n = (max(used) + 1) if used else 1
    entry = entry.replace("續NNN", f"續{n}")
    if not entry.endswith("\n"):
        entry += "\n"
    head = "# Worklog" + nl.decode()
    i = text.index(head) + len(head)
    out = text[:i] + entry.replace("\r\n", "\n").replace("\n", nl.decode()) + text[i:]
    open(a.worklog, "wb").write(out.encode("utf-8"))
    print(n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
