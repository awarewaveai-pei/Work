import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib import gpu_gate  # noqa: E402


class GpuGateTests(unittest.TestCase):
    def tearDown(self):
        gpu_gate.release_live()
        while gpu_gate.active() == "batch":
            gpu_gate.release_batch()

    def test_live_waits_for_every_batch(self):
        self.assertIsNone(gpu_gate.active())
        self.assertTrue(gpu_gate.acquire_batch())
        self.assertTrue(gpu_gate.acquire_batch())
        self.assertEqual(gpu_gate.active(), "batch")
        self.assertFalse(gpu_gate.acquire_live())
        gpu_gate.release_batch()
        self.assertFalse(gpu_gate.acquire_live())
        gpu_gate.release_batch()
        self.assertTrue(gpu_gate.acquire_live())

    def test_batch_waits_for_live_and_live_is_one_at_a_time(self):
        self.assertTrue(gpu_gate.acquire_live())
        self.assertEqual(gpu_gate.active(), "live")
        self.assertFalse(gpu_gate.acquire_live())
        self.assertFalse(gpu_gate.acquire_batch())
        gpu_gate.release_live()
        self.assertIsNone(gpu_gate.active())
        self.assertTrue(gpu_gate.acquire_batch())


if __name__ == "__main__":
    unittest.main()
