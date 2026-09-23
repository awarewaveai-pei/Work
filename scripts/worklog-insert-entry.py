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
import sys


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
    nl = b"\r\n" if b"\r\n" in b else b"\n"
    text = b.decode("utf-8")
    used = [int(m) for m in re.findall(r"^## " + re.escape(a.date) + r"（續(\d+)）", text, re.M)]
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
