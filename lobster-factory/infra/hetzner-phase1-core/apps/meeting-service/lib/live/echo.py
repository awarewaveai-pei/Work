"""The echo guard for two channels: the microphone (「我」) also hears the speakers, so what the others
say can come back as a 「我」 line. Such a line's loudness over time follows the 「對方」 channel at the
same moment; the user's own speech does not. `Ring` keeps the recent audio of a channel by recording
position (lib/live/hub.py feeds it); `is_echo` compares the two envelopes."""
from collections import deque

import numpy as np

RATE = 16000
FRAME = RATE // 50                  # 20 ms envelope frames
# Speakers reach the microphone a little late (device and air): the best match within this shift counts.
MAX_SHIFT_FRAMES = 15               # 300 ms
# Correlation of the two envelopes at or above this = echo. Measured 2026-11-27 on a mixed file (her1912.wav
# right, its own copy at 1/10 and 100 ms late on the left as echo, zh_test.wav as the user): echo 1.00, the
# user's speech against the others' 0.06-0.15. A real room (reverb, mic noise) lowers the echo figure:
# not yet measured with a real microphone and speakers.
ECHO_CORR = 0.7
# Below this loudness the 「對方」 channel is silence: nothing to echo.
MIN_LEVEL = 0.003
KEEP_SEC = 60


def envelope(pcm: np.ndarray) -> np.ndarray:
    """RMS of each 20 ms frame, PCM16 in, 0..1 out."""
    n = len(pcm) // FRAME
    if not n:
        return np.zeros(0, dtype=np.float32)
    x = pcm[: n * FRAME].astype(np.float32).reshape(n, FRAME) / 32768.0
    return np.sqrt(np.mean(x * x, axis=1))


def is_echo(mine: np.ndarray, theirs: np.ndarray) -> bool:
    """`mine` and `theirs`: the same stretch of the recording from each channel (PCM16)."""
    a, b = envelope(mine), envelope(theirs)
    n = min(len(a), len(b))
    if n < 2 * MAX_SHIFT_FRAMES or b[:n].max() < MIN_LEVEL:
        return False
    best = -1.0
    for shift in range(MAX_SHIFT_FRAMES + 1):     # mine lags theirs
        x, y = a[shift:n], b[: n - shift]
        if x.std() > 0 and y.std() > 0:
            best = max(best, float(np.corrcoef(x, y)[0, 1]))
    return best >= ECHO_CORR


class Ring:
    """The last KEEP_SEC of one channel, addressed by recording position (samples)."""

    def __init__(self):
        self.chunks = deque()       # (start sample, int16 array)

    def add(self, at: int, pcm: bytes) -> None:
        self.chunks.append((at, np.frombuffer(pcm[: len(pcm) // 2 * 2], dtype="<i2")))
        while self.chunks and self.chunks[0][0] < at - KEEP_SEC * RATE:
            self.chunks.popleft()

    def covers(self, start: int) -> bool:
        """Is the stretch from `start` still kept (not already dropped off the front)?"""
        return bool(self.chunks) and self.chunks[0][0] <= start

    def slice(self, start: int, end: int) -> np.ndarray:
        """Samples start..end; silence where nothing came."""
        out = np.zeros(max(end - start, 0), dtype=np.int16)
        for at, pcm in self.chunks:
            lo, hi = max(at, start), min(at + len(pcm), end)
            if lo < hi:
                out[lo - start: hi - start] = pcm[lo - at: hi - at]
        return out
