"""filter_hunks must re-anchor kept hunks against KEPT hunks only.

Regression for 2026-09-23: a foreign 29-line insertion at the top of WORKLOG.md was (correctly) dropped, but the
kept hunk's header still said `+42,2`, and `git apply --unidiff-zero` positions a pure insertion by that new-side
number -- the two lines landed inside another entry (commit 5f5c3e275).

Run: python -m unittest tests/scripts/test_git_stage_hunks.py
"""
import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[2] / "scripts" / "git-stage-hunks.py"
spec = importlib.util.spec_from_file_location("git_stage_hunks", SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

HEADER = b"diff --git a/f b/f\nindex 1111111..2222222 100644\n--- a/f\n+++ b/f\n"


def hunk_headers(patch: bytes):
    return [line for line in patch.split(b"\n") if line.startswith(b"@@")]


class FilterHunksOffsets(unittest.TestCase):
    def test_dropped_leading_insertion_does_not_shift_kept_insertion(self):
        diff = HEADER + b"@@ -1,0 +2,29 @@\n" + b"+x\n" * 29 + b"@@ -13,0 +42,2 @@\n+mine1\n+mine2\n"
        patch, kept = mod.filter_hunks(diff, [(13, 13)])
        self.assertEqual(kept, 1)
        self.assertEqual(hunk_headers(patch), [b"@@ -13,0 +14,2 @@"])
        self.assertNotIn(b"+x\n", patch)

    def test_kept_hunks_accumulate_their_own_delta(self):
        diff = (HEADER
                + b"@@ -1,0 +2,29 @@\n" + b"+x\n" * 29
                + b"@@ -13,0 +42,2 @@\n+mine1\n+mine2\n"
                + b"@@ -43,2 +73,0 @@\n-old1\n-old2\n")
        patch, kept = mod.filter_hunks(diff, [(13, 13), (43, 44)])
        self.assertEqual(kept, 2)
        # insertion: after old 13 -> new position 14; deletion: old 43 shifted by +2 -> new position 45,
        # written git-style as "the line after which" = +44,0
        self.assertEqual(hunk_headers(patch), [b"@@ -13,0 +14,2 @@", b"@@ -43,2 +44,0 @@"])

    def test_replacement_hunk_and_function_context_are_preserved(self):
        diff = HEADER + b"@@ -5,0 +6,3 @@\n+a\n+b\n+c\n" + b"@@ -20,2 +24,2 @@ ## heading\n-p\n-q\n+P\n+Q\n"
        patch, kept = mod.filter_hunks(diff, [(20, 20)])
        self.assertEqual(kept, 1)
        self.assertEqual(hunk_headers(patch), [b"@@ -20,2 +20,2 @@ ## heading"])

    def test_single_number_headers_keep_git_shorthand(self):
        diff = HEADER + b"@@ -1,0 +2,3 @@\n+x\n+x\n+x\n" + b"@@ -9 +12 @@\n-old\n+new\n"
        patch, kept = mod.filter_hunks(diff, [(9, 9)])
        self.assertEqual(hunk_headers(patch), [b"@@ -9 +9 @@"])

    def test_nothing_kept_returns_empty(self):
        diff = HEADER + b"@@ -1,0 +2,1 @@\n+x\n"
        patch, kept = mod.filter_hunks(diff, [(50, 60)])
        self.assertEqual((patch, kept), (b"", 0))


if __name__ == "__main__":
    unittest.main()
