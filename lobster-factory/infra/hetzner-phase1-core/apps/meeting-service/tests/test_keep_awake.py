"""Two overlapping jobs share one WSL keep-awake helper: the first to finish must not let the machine sleep under the
second (Codex 2026-10-16). Simulated WSL with a fake helper process; no powershell is started."""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib import keep_awake  # noqa: E402


class FakeHelper:
    def __init__(self, *_a, **_k):
        self.terminated = False

    def poll(self):
        return 0 if self.terminated else None

    def terminate(self):
        self.terminated = True

    def wait(self, timeout=None):
        return 0


class OverlappingJobs(unittest.TestCase):
    def setUp(self):
        keep_awake._wsl_helper = None
        keep_awake._wsl_holders = 0
        self.patches = [mock.patch.object(keep_awake.sys, "platform", "linux"),
                        mock.patch.object(keep_awake, "_is_wsl", return_value=True),
                        mock.patch.object(keep_awake.subprocess, "Popen", side_effect=FakeHelper)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def test_the_helper_stays_until_the_last_job_leaves(self):
        keep_awake.prevent_sleep()
        keep_awake.prevent_sleep()
        helper = keep_awake._wsl_helper
        self.assertIsNotNone(helper)
        keep_awake.allow_sleep()
        self.assertFalse(helper.terminated, "first job finished: the second still needs the machine awake")
        keep_awake.allow_sleep()
        self.assertTrue(helper.terminated)
        self.assertIsNone(keep_awake._wsl_helper)


if __name__ == "__main__":
    unittest.main()
