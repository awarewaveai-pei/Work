#!/usr/bin/env python3
"""Regression tests for scripts/git-partial-worktree-commit.py (temp repos under $TEMP, never the repo).

Run: python tests/scripts/git_partial_worktree_commit_test.py
Invariants:
  1. after prep the worktree file is exactly HEAD + my hunks; after commit + restore it is exactly the
     original worktree content (other sessions' hunks are back in the right place even when my
     insertions shifted every later line -- codex 2026-09-23 finding on the first version)
  2. prep refuses a file with staged changes and a file whose previous prep was not restored
  3. two files with the same basename never share scratch patches
"""
import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPT = os.path.join(ROOT, "scripts", "git-partial-worktree-commit.py")


def load_script():
    spec = importlib.util.spec_from_file_location("gpwc", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def git(cwd, *args):
    return subprocess.run(["git", "-c", "user.email=t@t", "-c", "user.name=t", "-c", "core.autocrlf=false", *args],
                          cwd=cwd, capture_output=True, check=True).stdout.decode()


def write(path, text):
    with open(path, "wb") as f:
        f.write(text.encode("utf-8"))


def read(path):
    with open(path, "rb") as f:
        return f.read().decode("utf-8")


class PartialWorktreeCommitTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="gpwc-test-")
        self.repo = os.path.join(self.tmp, "repo")
        os.makedirs(self.repo)
        git(self.repo, "init", "-q", "-b", "main")
        git(self.repo, "config", "core.autocrlf", "false")   # the script's own git calls use the repo config
        self.scratch = os.path.join(self.tmp, "scratch")
        os.environ["PARTIAL_COMMIT_SCRATCH"] = self.scratch
        self.mod = load_script()
        self.mod.SCRATCH = self.scratch
        self.base = "".join(f"line {i:03d}\n" for i in range(1, 41))
        write(os.path.join(self.repo, "shared.md"), self.base)
        os.makedirs(os.path.join(self.repo, "sub"))
        write(os.path.join(self.repo, "sub", "shared.md"), self.base)
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-q", "-m", "base")
        self.cwd = os.getcwd()
        os.chdir(self.repo)

    def tearDown(self):
        os.chdir(self.cwd)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def edited(self):
        """foreign insertion after line 3 (+2), mine insertion after line 10 (+3), foreign replacement of
        line 20, mine replacement of line 30 (1 -> 2 lines), foreign insertion after line 35 (+1)."""
        lines = self.base.splitlines(keepends=True)
        out = []
        for i, l in enumerate(lines, 1):
            if i == 20:
                out.append("FOREIGN twenty\n"); continue
            if i == 30:
                out.append("MINE thirty a\n"); out.append("MINE thirty b\n"); continue
            out.append(l)
            if i == 3:
                out += ["FOREIGN after 3 x\n", "FOREIGN after 3 y\n"]
            if i == 10:
                out += ["MINE after 10 a\n", "MINE after 10 b\n", "MINE after 10 c\n"]
            if i == 35:
                out += ["FOREIGN after 35\n"]
        return "".join(out)

    def test_prep_commit_restore_round_trip(self):
        full = self.edited()
        write("shared.md", full)
        rc = self.mod.main(["prep", "shared.md", "--keep-re", "^\\+MINE"])
        self.assertEqual(rc, 0)
        expect_mine = "".join(
            "".join((["MINE thirty a\n", "MINE thirty b\n"] if i == 30 else [l]) + (["MINE after 10 a\n", "MINE after 10 b\n", "MINE after 10 c\n"] if i == 10 else []))
            for i, l in enumerate(self.base.splitlines(keepends=True), 1)
        )
        self.assertEqual(read("shared.md"), expect_mine, "worktree must be HEAD + my hunks only")
        git(self.repo, "commit", "-q", "-m", "mine", "--", "shared.md")
        self.assertEqual(git(self.repo, "show", "HEAD:shared.md"), expect_mine)
        rc = self.mod.main(["restore", "shared.md"])
        self.assertEqual(rc, 0)
        self.assertEqual(read("shared.md"), full, "other sessions' hunks must land where they were, after my insertions shifted the file")
        self.assertFalse(os.path.exists(self.mod.names("shared.md")["foreign"]), "parked patch is consumed on restore")

    def test_mutation_without_reanchoring_would_misplace(self):
        # Proves the round-trip test is live: rendering the foreign patch against an EMPTY applied
        # list (the first version's behaviour) makes git apply reject or misplace it.
        full = self.edited()
        write("shared.md", full)
        self.assertEqual(self.mod.main(["prep", "shared.md", "--keep-re", "^\\+MINE"]), 0)
        git(self.repo, "commit", "-q", "-m", "mine", "--", "shared.md")
        p = self.mod.names("shared.md")
        header, hunks = self.mod.parse(open(p["all"], "rb").read())
        foreign = [h for h in hunks if not any(l.startswith(b"+MINE") for l in h["body"])]
        with open(p["foreign"], "wb") as f:
            f.write(self.mod.render(header, foreign, []))   # mutation: no re-anchoring
        rc = self.mod.main(["restore", "shared.md"])
        self.assertTrue(rc == 3 or read("shared.md") != full, "un-anchored foreign patch must not silently reproduce the original file")

    def test_refuses_staged_and_unrestored(self):
        write("shared.md", self.base + "STAGED\n")
        git(self.repo, "add", "shared.md")
        write("shared.md", self.base + "STAGED\nMINE tail\n")
        self.assertEqual(self.mod.main(["prep", "shared.md", "--keep-re", "^\\+MINE"]), 2, "staged changes must refuse")
        git(self.repo, "reset", "-q", "--", "shared.md")
        self.assertEqual(self.mod.main(["prep", "shared.md", "--keep-re", "^\\+MINE"]), 0)
        self.assertEqual(self.mod.main(["prep", "shared.md", "--keep-re", "^\\+MINE"]), 2, "second prep before restore must refuse")
        self.assertEqual(self.mod.main(["restore", "shared.md"]), 0)
        self.assertEqual(read("shared.md"), self.base + "STAGED\nMINE tail\n")

    def test_same_basename_gets_separate_scratch(self):
        a = self.mod.names("shared.md")
        b = self.mod.names("sub/shared.md")
        self.assertNotEqual(a["foreign"], b["foreign"])
        self.assertNotEqual(a["all"], b["all"])
        # spelling of the same path never changes its identity (codex r2)
        self.assertEqual(self.mod.names("./sub/shared.md")["all"], b["all"])
        self.assertEqual(self.mod.names("sub\\shared.md")["all"], b["all"])

    def test_mode_change_is_refused(self):
        diff = b"diff --git a/x.sh b/x.sh\nold mode 100644\nnew mode 100755\nindex 1..2\n--- a/x.sh\n+++ b/x.sh\n@@ -1 +1 @@\n-a\n+b\n"
        self.assertTrue(self.mod.has_mode_change(diff))
        self.assertFalse(self.mod.has_mode_change(b"diff --git a/x b/x\nindex 1..2\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n"))

    def test_no_hunk_of_mine_is_a_noop(self):
        write("shared.md", self.base + "FOREIGN tail\n")
        self.assertEqual(self.mod.main(["prep", "shared.md", "--keep-re", "^\\+MINE"]), 2)
        self.assertEqual(read("shared.md"), self.base + "FOREIGN tail\n", "a refused prep must not touch the worktree")


if __name__ == "__main__":
    unittest.main(verbosity=1)
