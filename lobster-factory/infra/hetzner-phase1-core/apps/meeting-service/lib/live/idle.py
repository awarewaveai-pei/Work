# Ported from OwnVoice Meet src-tauri/src/idle.rs (Apache-2.0, https://github.com/Zaious/ownvoice-meet, 08e3ab3).
"""Idle listening costs money: Gemini Live bills every second it is sent, silence included, and a page
left listening runs all night. After a quiet stretch (no new caption line) the speech service is let
go, so nothing is sent or billed; as soon as someone speaks it is reconnected, with the last two
seconds sent first so the first words are not lost. After a longer quiet stretch listening ends by
itself. `Gate` is the decisions only; lib/live/hub.py does the plumbing."""
from collections import deque
from typing import Optional

import numpy as np

# Audio kept while paused, sent first when the speech service is reconnected.
PREROLL_CHUNKS = 20  # 2 s of 100 ms chunks
# Chunks in a row above the wake level before reconnecting.
WAKE_CHUNKS = 3
# The quietest wake level; above the room's own noise in any case.
WAKE_MIN = 0.008

FORWARD, HOLD, PAUSE, RESUME, END = "forward", "hold", "pause", "resume", "end"


def minutes(m: float) -> Optional[float]:
    """Minutes from the page -> seconds; 0 (or less) = never."""
    return m * 60.0 if m > 0 else None


def minutes_label(m: float) -> str:
    """"3", or "0.5" for a time under a whole minute."""
    return f"{round(m):.0f}" if abs(m - round(m)) < 0.01 else f"{m:.1f}"


def rms(chunk: bytes) -> float:
    samples = np.frombuffer(chunk[: len(chunk) // 2 * 2], dtype="<i2")
    if not len(samples):
        return 0.0
    return float(np.sqrt(np.mean((samples.astype(np.float32) / 32768.0) ** 2)))


class Gate:
    """`on_chunk` / `on_tick` return (step, payload): (FORWARD, chunk) send it; (HOLD, None) paused,
    kept for the preroll only; (PAUSE, None) let the speech service go now; (RESUME, [chunks])
    reconnect, sending these first; (END, None) quiet for too long, stop listening.
    Times are seconds; `quiet` is how long nothing has happened."""

    def __init__(self, pause_after: Optional[float], end_after: Optional[float]):
        self.pause_after = pause_after
        self.end_after = end_after
        # The quiet time at which to pause: `pause_after`, or later right after a reconnect (a full
        # pause time of grace, since the first caption takes a moment). Back to `pause_after` as soon
        # as something happens.
        self.pause_at = pause_after
        self.last_quiet = 0.0
        self.paused = False
        self.preroll = deque(maxlen=PREROLL_CHUNKS)
        self.loud = 0
        self.floor = None

    def on_chunk(self, chunk: bytes, level: float, quiet: float):
        step = self.on_tick(quiet)
        if step[0] == END:
            return step
        if step[0] == PAUSE:
            self.preroll.append(chunk)
            return step
        if not self.paused:
            self._learn(level)
            return (FORWARD, chunk)
        self.preroll.append(chunk)
        # Wake on speech clearly above the room's own level, sustained for a moment.
        wake = WAKE_MIN if self.floor is None else max(self.floor * 2.5, WAKE_MIN)
        if level > wake:
            self.loud += 1
        else:
            self.loud = 0
            self._learn(level)
        if self.loud >= WAKE_CHUNKS:
            self.paused = False
            self.loud = 0
            self.pause_at = None if self.pause_after is None else quiet + self.pause_after
            chunks = list(self.preroll)
            self.preroll.clear()
            return (RESUME, chunks)
        return (HOLD, None)

    def on_tick(self, quiet: float):
        """Time passed, with or without audio."""
        if quiet < self.last_quiet:
            self.pause_at = self.pause_after  # something happened: the grace is over
        self.last_quiet = quiet
        # The end time counts from the last caption, never from a reconnect: noise that keeps waking
        # it in a loud hall cannot keep the session alive.
        if self.end_after is not None and quiet >= self.end_after:
            return (END, None)
        if not self.paused and self.pause_at is not None and quiet >= self.pause_at:
            self.paused = True
            self.preroll.clear()
            self.loud = 0
            return (PAUSE, None)
        return (HOLD, None)

    def _learn(self, level: float) -> None:
        """The room's own level: pulled down quickly by the gaps between words, raised slowly, so it
        settles on the noise rather than the speech."""
        if self.floor is None:
            self.floor = level
        elif level < self.floor:
            self.floor = self.floor * 0.5 + level * 0.5
        else:
            self.floor = self.floor + (level - self.floor) * 0.002
