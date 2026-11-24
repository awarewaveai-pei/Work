"""script_store: round trip, one field at a time, size limit. Uses a temp path, never the real file."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live import script_store  # noqa: E402


class ScriptStoreTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.old = script_store.PATH
        script_store.PATH = os.path.join(self.dir.name, "script.json")
        self.addCleanup(setattr, script_store, "PATH", self.old)

    def test_round_trip_and_empty_default(self):
        self.assertEqual(script_store.load(), {"script": "", "glossary": ""})
        script_store.save("# 開場\nHello.\n", "上線 = go live")
        self.assertEqual(script_store.load(), {"script": "# 開場\nHello.\n", "glossary": "上線 = go live"})

    def test_saving_one_field_leaves_the_other(self):
        script_store.save("講稿", "詞彙")
        script_store.save(glossary="新詞彙")
        self.assertEqual(script_store.load(), {"script": "講稿", "glossary": "新詞彙"})
        script_store.save(script="新講稿")
        self.assertEqual(script_store.load(), {"script": "新講稿", "glossary": "新詞彙"})

    def test_a_damaged_file_is_set_aside_not_overwritten(self):
        with open(script_store.PATH, "w", encoding="utf-8") as f:
            f.write("{broken")
        self.assertEqual(script_store.load(), {"script": "", "glossary": ""})
        script_store.save("新的")
        self.assertEqual(script_store.load(), {"script": "新的", "glossary": ""})
        kept = [n for n in os.listdir(self.dir.name) if ".corrupt-" in n]
        self.assertEqual(len(kept), 1)
        with open(os.path.join(self.dir.name, kept[0]), encoding="utf-8") as f:
            self.assertEqual(f.read(), "{broken")

    def test_over_the_limit_is_refused_and_nothing_changes(self):
        script_store.save("keep", "keep")
        with self.assertRaises(ValueError):
            script_store.save("x" * (script_store.MAX_BYTES + 1), "changed")
        self.assertEqual(script_store.load(), {"script": "keep", "glossary": "keep"})
        script_store.save("x" * script_store.MAX_BYTES)


if __name__ == "__main__":
    unittest.main()
