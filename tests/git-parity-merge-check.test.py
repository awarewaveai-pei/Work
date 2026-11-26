"""git-parity-merge.py --check: lists EVERY file that blocks the fast-forward and changes nothing.
Why: a refused ff used to show only as one yellow AO-RESUME line, so D:\\Work stayed 139 commits behind for a day
(2026-11-26); smoke now puts this list in blockers[]. Run: python tests/git-parity-merge-check.test.py
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "git-parity-merge.py")


def git(cwd, *args):
    return subprocess.run(["git", "-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", *args],
                          capture_output=True, check=True).stdout.decode()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def snapshot(root):
    out = {}
    for d, _, fs in os.walk(root):
        if ".git" in d.split(os.sep):
            continue
        for f in fs:
            p = os.path.join(d, f)
            out[os.path.relpath(p, root)] = hashlib.sha1(open(p, "rb").read()).hexdigest()
    return out


def main():
    tmp = tempfile.mkdtemp(prefix="parity-check-")
    origin, up, local = (os.path.join(tmp, n) for n in ("origin.git", "up", "local"))
    subprocess.run(["git", "init", "-q", "--bare", "-b", "main", origin], check=True)
    subprocess.run(["git", "clone", "-q", origin, up], check=True, capture_output=True)
    write(os.path.join(up, "conflict.md"), "a\nb\nc\n")
    write(os.path.join(up, "mergeable.md"), "1\n2\n3\n4\n5\n6\n")
    git(up, "add", "-A"); git(up, "commit", "-qm", "base"); git(up, "push", "-q", "origin", "HEAD:main")
    subprocess.run(["git", "clone", "-q", origin, local], check=True, capture_output=True)

    # upstream moves on: edits line b, edits line 6, adds new.md
    write(os.path.join(up, "conflict.md"), "a\nB-upstream\nc\n")
    write(os.path.join(up, "mergeable.md"), "1\n2\n3\n4\n5\n6-upstream\n")
    write(os.path.join(up, "new.md"), "upstream\n")
    git(up, "add", "-A"); git(up, "commit", "-qm", "upstream"); git(up, "push", "-q", "origin", "HEAD:main")

    # local, uncommitted: same line b (conflict), line 1 (mergeable), a differing untracked new.md
    write(os.path.join(local, "conflict.md"), "a\nB-local\nc\n")
    write(os.path.join(local, "mergeable.md"), "1-local\n2\n3\n4\n5\n6\n")
    write(os.path.join(local, "new.md"), "local draft\n")
    git(local, "fetch", "-q", "origin")

    before = snapshot(local)
    head = git(local, "rev-parse", "HEAD")
    r = subprocess.run([sys.executable, SCRIPT, "--root", local, "--target", "origin/main", "--check"], capture_output=True)
    res = json.loads(r.stdout.decode())
    fails = []
    if r.returncode != 1: fails.append(f"exit {r.returncode}, want 1")
    if res.get("behind") != 1: fails.append(f"behind {res.get('behind')}, want 1")
    blocking = " | ".join(res.get("blocking", []))
    if "conflict.md: local edits conflict" not in blocking: fails.append("conflict.md not listed")
    if "new.md: untracked local file differs" not in blocking: fails.append("new.md not listed")
    if "mergeable.md" in blocking: fails.append("mergeable.md listed although it merges cleanly")
    if snapshot(local) != before: fails.append("--check changed the worktree")
    if git(local, "rev-parse", "HEAD") != head: fails.append("--check moved HEAD")

    # clean case: nothing local -> ok, exit 0
    os.remove(os.path.join(local, "new.md"))
    git(local, "checkout", "-q", "--", "conflict.md", "mergeable.md")
    r2 = subprocess.run([sys.executable, SCRIPT, "--root", local, "--target", "origin/main", "--check"], capture_output=True)
    res2 = json.loads(r2.stdout.decode())
    if r2.returncode != 0 or res2.get("blocking") != [] or res2.get("behind") != 1:
        fails.append(f"clean case: exit {r2.returncode}, {res2}")

    # diverged: a local commit no file blocks -> still blocked (no ff possible)
    write(os.path.join(local, "only-local.md"), "x" + chr(10))
    git(local, "add", "only-local.md"); git(local, "commit", "-qm", "local only")
    r3 = subprocess.run([sys.executable, SCRIPT, "--root", local, "--target", "origin/main", "--check"], capture_output=True)
    res3 = json.loads(r3.stdout.decode())
    if r3.returncode != 1 or res3.get("ahead") != 1 or "diverged" not in " ".join(res3.get("blocking", [])):
        fails.append(f"diverged case: exit {r3.returncode}, {res3}")

    print("FAIL: " + "; ".join(fails) if fails else "PASS: 10 checks")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
