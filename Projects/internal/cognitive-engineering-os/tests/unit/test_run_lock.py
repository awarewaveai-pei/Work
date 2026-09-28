"""Run lock (``ai_lego.platform.workflow.run_lock``): one holder per run, released by the kernel on death."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

from ai_lego.platform.workflow.run_lock import acquire_run_lock, lock_path_for, run_lock_state, run_lock_tag
from tests.unit.thread_testkit import HANG_GUARD_S, join_all

COS_ROOT = Path(__file__).resolve().parents[2]
_HOLDER = """
import sys
from pathlib import Path
from ai_lego.platform.workflow.run_lock import acquire_run_lock
lock = acquire_run_lock(Path(sys.argv[1]))
print("locked" if lock else "refused", flush=True)
sys.stdin.readline()  # hold until killed
"""


class RunLockTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.path = Path(self._tmp.name) / "tenant" / "r1.lock"

    def tearDown(self):
        self._tmp.cleanup()

    def test_lock_path_sits_next_to_the_journal(self):
        self.assertEqual(lock_path_for(Path("x") / "abc" / "run-1.journal.json"), Path("x") / "abc" / "run-1.lock")

    def test_a_held_lock_has_exactly_one_holder_even_inside_one_process(self):
        first = acquire_run_lock(self.path)
        self.assertIsNotNone(first)
        self.assertIsNone(acquire_run_lock(self.path), "a second handle in the same process must be refused")
        self.assertEqual(run_lock_state(self.path), "held")
        first.release()
        second = acquire_run_lock(self.path)
        self.assertIsNotNone(second)
        second.release()

    def test_state_tells_never_accepted_from_accepted_and_idle(self):
        self.assertEqual(run_lock_state(self.path), "absent")
        acquire_run_lock(self.path).release()
        self.assertEqual(run_lock_state(self.path), "free")
        self.assertTrue(self.path.exists(), "the lock file is never deleted (unlink would let a second inode be locked)")

    def test_the_holder_tags_whose_run_it_is_and_a_new_holder_replaces_the_tag(self):
        acquire_run_lock(self.path, tag="life-decision-v1").release()
        self.assertEqual(run_lock_tag(self.path), "life-decision-v1")
        held = acquire_run_lock(self.path, tag="r2")
        self.assertEqual(run_lock_tag(self.path), "r2", "readable while held; a shorter tag leaves no tail")
        held.release()
        self.assertEqual(run_lock_tag(Path(self._tmp.name) / "never.lock"), "")

    def test_release_is_idempotent(self):
        lock = acquire_run_lock(self.path)
        lock.release()
        lock.release()
        self.assertEqual(run_lock_state(self.path), "free")

    def test_many_threads_racing_get_exactly_one_holder(self):
        barrier = threading.Barrier(16)
        got: list = []

        def race():
            barrier.wait(HANG_GUARD_S)
            got.append(acquire_run_lock(self.path))

        threads = [threading.Thread(target=race) for _ in range(16)]
        for thread in threads:
            thread.start()
        join_all(self, *threads)
        holders = [lock for lock in got if lock is not None]
        self.assertEqual(len(holders), 1)
        holders[0].release()

    def test_a_holder_in_another_process_blocks_until_that_process_dies(self):
        child = subprocess.Popen([sys.executable, "-c", _HOLDER, str(self.path)], cwd=COS_ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        try:
            self.assertEqual(child.stdout.readline().strip(), "locked")
            self.assertIsNone(acquire_run_lock(self.path))
            self.assertEqual(run_lock_state(self.path), "held")
            child.kill()  # no release, no cleanup: the kernel must free it
            child.wait(HANG_GUARD_S)
            deadline = time.monotonic() + HANG_GUARD_S  # Windows may free a dead process's lock a moment late
            lock = acquire_run_lock(self.path)
            while lock is None and time.monotonic() < deadline:
                time.sleep(0.05)
                lock = acquire_run_lock(self.path)
            self.assertIsNotNone(lock, "a dead holder's lock is released by the OS")
            lock.release()
        finally:
            if child.poll() is None:
                child.kill()
                child.wait(HANG_GUARD_S)
            child.stdin.close()
            child.stdout.close()


if __name__ == "__main__":
    unittest.main()
