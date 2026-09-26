"""Waits in threaded tests. HANG_GUARD_S only turns a deadlock into a failure; it never asserts speed.
A threaded test proves ordering with events, never with "it happened within N seconds": the Windows full
run is about twice as slow as Linux, and a 5 s bound that was really a speed assumption failed there
(test_ai_gateway budget-lock test, 2026-09-26 PI-a 14R). The bound is wide on purpose: a cold run of that
test under 3x CPU oversubscription took 74 s end to end; a real deadlock just fails a few minutes later."""

from __future__ import annotations

import threading
import unittest

HANG_GUARD_S = 300.0


def join_all(case: unittest.TestCase, *threads: threading.Thread) -> None:
    """Join every started thread (a thread left running outlives tearDown and writes into its deleted temp
    dirs) and fail if one is still alive after the hang guard."""
    for thread in threads:
        if thread.ident is not None:
            thread.join(HANG_GUARD_S)
    alive = [thread.name for thread in threads if thread.is_alive()]
    case.assertEqual(alive, [], "threads still running after the hang guard")
