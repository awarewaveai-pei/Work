import os
import tempfile
import unittest
from unittest import mock

from lib import workspace


class WorkspaceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, ".workspace.json")
        patcher = mock.patch.object(workspace, "WORKSPACE_PATH", self.path)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.tmp.cleanup)

    def test_roundtrip(self):
        layout = {"grid": {"width": 800, "height": 600}, "panels": {"captions": {"title": "字幕"}}}
        workspace.save(layout)
        self.assertEqual(workspace.load(), layout)

    def test_missing_file_is_none(self):
        self.assertIsNone(workspace.load())

    def test_over_64kb_rejected(self):
        with self.assertRaises(ValueError):
            workspace.save({"x": "a" * (64 * 1024)})
        self.assertFalse(os.path.exists(self.path))

    def test_non_object_rejected(self):
        for bad in ([1, 2], "text", 3, None):
            with self.assertRaises(ValueError):
                workspace.save(bad)

    def test_corrupt_file_is_none(self):
        with open(self.path, "w", encoding="utf-8") as f:
            f.write("{not json")
        self.assertIsNone(workspace.load())


if __name__ == "__main__":
    unittest.main()
