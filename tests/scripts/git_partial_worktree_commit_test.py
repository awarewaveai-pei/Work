#!/usr/bin/env python3
"""Regression tests for scripts/git-partial-worktree-commit.py (temp repos under $TEMP, never the repo).

Run: python tests/scripts/git_partial_worktree_commit_test.py
Invariants:
  1. the private index holds exactly HEAD + my selection (worklog block / hunks) + own files; the worktree and the
     shared index are never written by `stage`
  2. a worklog block lands before the next header that exists in HEAD, foreign uncommitted entries excluded,
     line endings follow HEAD
  3. stage refuses: entry already in HEAD, header missing/duplicated, no hunk of mine, mode change, file already staged
     in that index; drop removes index + marker
"""
import importlib.util
import json
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


def git(cwd, *args, env=None):
    e = dict(os.environ)
    if env:
        e.update(env)
    return subprocess.run(["git", "-c", "user.email=t@t", "-c", "user.name=t", "-c", "core.autocrlf=false", *args],
                          cwd=cwd, capture_output=True, check=True, env=e).stdout.decode("utf-8")


def write(path, text):
    with open(path, "wb") as f:
        f.write(text.encode("utf-8"))


def read(path):
    with open(path, "rb") as f:
        return f.read().decode("utf-8")


HEAD_WORKLOG = "# Worklog\n\n## 2026-09-23（續1）old\n\n- old line\n"
MINE = "## 2026-09-23（續2）mine\n\n- my line\n\n"
FOREIGN = "## 2026-09-23（續3）foreign\n\n- their line\n\n"


class PartialWorktreeCommitTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="gpwc-test-")
        self.repo = os.path.join(self.tmp, "repo")
        os.makedirs(os.path.join(self.repo, "agency-os"))
        git(self.repo, "init", "-q", "-b", "main")
        git(self.repo, "config", "core.autocrlf", "false")
        self.scratch = os.path.join(self.tmp, "scratch")
        os.environ["PARTIAL_COMMIT_SCRATCH"] = self.scratch
        self.mod = load_script()
        self.mod.SCRATCH = self.scratch
        self.base = "".join(f"line {i:03d}\n" for i in range(1, 41))
        write(os.path.join(self.repo, "shared.md"), self.base)
        write(os.path.join(self.repo, "agency-os", "WORKLOG.md"), HEAD_WORKLOG)
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-q", "-m", "base")
        self.cwd = os.getcwd()
        os.chdir(self.repo)

    def tearDown(self):
        os.chdir(self.cwd)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def index_path(self):
        idx = [f for f in os.listdir(self.scratch) if f.endswith(".index")]
        self.assertEqual(len(idx), 1, idx)
        return os.path.join(self.scratch, idx[0]).replace("\\", "/")

    def private(self, rel, idx):
        return git(self.repo, "show", f":{rel}", env={"GIT_INDEX_FILE": idx})

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

    def expect_mine(self):
        return "".join(
            "".join((["MINE thirty a\n", "MINE thirty b\n"] if i == 30 else [l]) + (["MINE after 10 a\n", "MINE after 10 b\n", "MINE after 10 c\n"] if i == 10 else []))
            for i, l in enumerate(self.base.splitlines(keepends=True), 1)
        )

    def test_worklog_block_lands_before_next_head_header_without_foreign(self):
        head = HEAD_WORKLOG.encode()
        expect = ("# Worklog\n\n" + MINE + HEAD_WORKLOG[len("# Worklog\n\n"):]).encode()
        # mine above foreign, and foreign above mine: same result
        for work in ("# Worklog\n\n" + MINE + FOREIGN + HEAD_WORKLOG[len("# Worklog\n\n"):],
                     "# Worklog\n\n" + FOREIGN + MINE + HEAD_WORKLOG[len("# Worklog\n\n"):]):
            self.assertEqual(self.mod.worklog_target(head, work.encode(), "2026-09-23", 2), expect)
        # no committed header after mine (mine appended at the end, foreign after it): after the title
        tail = HEAD_WORKLOG + MINE + FOREIGN
        self.assertEqual(self.mod.worklog_target(head, tail.encode(), "2026-09-23", 2), expect)
        # CRLF HEAD, LF worktree block -> CRLF block
        head_crlf = HEAD_WORKLOG.replace("\n", "\r\n").encode()
        out = self.mod.worklog_target(head_crlf, (HEAD_WORKLOG + MINE).encode(), "2026-09-23", 2)
        self.assertEqual(out, ("# Worklog\n\n" + MINE + HEAD_WORKLOG[len("# Worklog\n\n"):]).replace("\n", "\r\n").encode())
        self.assertNotIn(b"\n\n", out.replace(b"\r\n", b""))

    def test_worklog_target_refusals(self):
        head = HEAD_WORKLOG.encode()
        with self.assertRaises(SystemExit):
            self.mod.worklog_target(head, (HEAD_WORKLOG + MINE).encode(), "2026-09-23", 1)      # already in HEAD
        with self.assertRaises(SystemExit):
            self.mod.worklog_target(head, HEAD_WORKLOG.encode(), "2026-09-23", 2)               # header missing
        with self.assertRaises(SystemExit):
            self.mod.worklog_target(head, (HEAD_WORKLOG + MINE + MINE).encode(), "2026-09-23", 2)  # duplicated

    def test_stage_worklog_entry_and_own_file_into_private_index(self):
        work = "# Worklog\n\n" + MINE + FOREIGN + HEAD_WORKLOG[len("# Worklog\n\n"):]
        write("agency-os/WORKLOG.md", work)
        write("own.txt", "mine\n")
        rc = self.mod.main(["stage", "agency-os/WORKLOG.md", "--worklog-entry", "2", "--date", "2026-09-23", "--", "own.txt"])
        self.assertEqual(rc, 0)
        idx = self.index_path()
        expect = "# Worklog\n\n" + MINE + HEAD_WORKLOG[len("# Worklog\n\n"):]
        self.assertEqual(self.private("agency-os/WORKLOG.md", idx), expect)
        self.assertEqual(self.private("own.txt", idx), "mine\n")
        marker = json.load(open(idx + ".json", encoding="utf-8"))
        self.assertEqual(set(marker["entries"]), {"agency-os/WORKLOG.md"})
        self.assertEqual(marker["own"], ["own.txt"])
        self.assertEqual(marker["head"], git(self.repo, "rev-parse", "HEAD").strip())
        self.assertEqual(marker["base"]["agency-os/WORKLOG.md"], git(self.repo, "rev-parse", "HEAD:agency-os/WORKLOG.md").strip())
        self.assertIsNone(marker["base"]["own.txt"], "untracked own file has no base blob")
        self.assertEqual(marker["entries"]["agency-os/WORKLOG.md"], git(self.repo, "rev-parse", ":agency-os/WORKLOG.md", env={"GIT_INDEX_FILE": idx}).strip())
        self.assertEqual(read("agency-os/WORKLOG.md"), work, "worktree untouched")
        self.assertEqual(git(self.repo, "diff", "--cached", "--name-only"), "", "shared index untouched")
        git(self.repo, "commit", "-q", "-m", "mine", env={"GIT_INDEX_FILE": idx})
        self.assertEqual(git(self.repo, "show", "HEAD:agency-os/WORKLOG.md"), expect)
        self.assertEqual(git(self.repo, "show", "HEAD:own.txt"), "mine\n")
        self.assertEqual(self.mod.main(["stage", "shared.md", "--range", "1", "--index", idx]), 2, "HEAD moved since the index was created -> refuse")
        write("shared.md", self.base + "MINE tail\n")
        self.assertEqual(self.mod.main(["stage", "shared.md", "--keep-re", "^\\+MINE", "--index", idx]), 2, "still refused on the moved HEAD even with a real selection")

    def test_stage_hunks_by_keep_re_and_range(self):
        write("shared.md", self.edited())
        self.assertEqual(self.mod.main(["stage", "shared.md", "--keep-re", "^\\+MINE"]), 0)
        idx = self.index_path()
        self.assertEqual(self.private("shared.md", idx), self.expect_mine())
        self.assertEqual(read("shared.md"), self.edited(), "worktree untouched")
        self.assertEqual(self.mod.main(["drop", "--index", idx]), 0)
        self.assertFalse(os.path.exists(idx) or os.path.exists(idx + ".json"))
        self.assertEqual(self.mod.main(["stage", "shared.md", "--range", "10", "--range", "30-30"]), 0)
        self.assertEqual(self.private("shared.md", self.index_path()), self.expect_mine())

    def test_refusals_and_mode_change(self):
        write("shared.md", self.base + "FOREIGN tail\n")
        self.assertEqual(self.mod.main(["stage", "shared.md", "--keep-re", "^\\+MINE"]), 2, "no hunk of mine")
        self.assertEqual(self.mod.main(["stage", "shared.md"]), 2, "no selection")
        write("shared.md", self.base)
        self.assertEqual(self.mod.main(["stage", "shared.md", "--keep-re", "^\\+MINE"]), 2, "nothing uncommitted")
        diff = b"diff --git a/x.sh b/x.sh\nold mode 100644\nnew mode 100755\nindex 1..2\n--- a/x.sh\n+++ b/x.sh\n@@ -1 +1 @@\n-a\n+b\n"
        self.assertTrue(self.mod.has_mode_change(diff))
        self.assertFalse(self.mod.has_mode_change(b"diff --git a/x b/x\nindex 1..2\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n"))
        self.assertEqual([f for f in os.listdir(self.scratch)] if os.path.exists(self.scratch) else [], [], "a refused first stage leaves no index behind")


if __name__ == "__main__":
    unittest.main(verbosity=1)
