# Ported from OwnVoice Meet src-tauri/src/vad.rs (Apache-2.0, https://github.com/Zaious/ownvoice-meet, 08e3ab3).
"""Energy-based speech segmentation: 30 ms frames, speech above an RMS threshold, 300 ms kept from
before the onset, an utterance ends after 700 ms of silence or 12 s of speech. Changed from the Rust
source: the threshold follows the room (Level), never stricter than the original fixed one.

Events let two kinds of provider share it: upload-per-sentence providers take `END.audio`;
streaming providers send `START` preroll and `AUDIO` as they come and commit on `END`."""
import bisect
import struct
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

RMS_THRESHOLD = 0.008      # the original fixed threshold: now the ceiling of the adaptive one
# The threshold sits halfway (geometric mean) between the room's quiet level and its speech level over the
# last LEVEL_WINDOW_MS. A quiet recording (operator 2026-11-29: speech 0.004, background 0.002) had only
# 54% of its speech detected with 0.008, 88% with this; clean recordings cut exactly as before.
# Known limit: a quiet sentence at the very start, before any quieter moment, has nothing to compare with.
LEVEL_WINDOW_MS = 10_000
QUIET_PCT, SPEECH_PCT = 20, 90
RMS_FLOOR = 0.003          # never lower than this (breaths, fans)
LEVEL_EVERY = 10           # frames between recomputing it
FRAME_MS = 30
PREROLL_MS = 300
END_SILENCE_MS = 700
MAX_UTTERANCE_MS = 12_000
MIN_VOICED_MS = 300

START = "start"      # speech began; audio = the audio just before it plus the first frame
AUDIO = "audio"      # more audio of the current utterance
END = "end"          # utterance ended; audio = all of it (preroll included)
DISCARD = "discard"  # too short to be speech (a click, a cough)


@dataclass(frozen=True)
class VadEvent:
    kind: str
    audio: Optional[np.ndarray] = field(default=None, compare=False)
    # START / END: where the speech itself began and (END) ended, as sample indexes into everything
    # pushed so far; the preroll and the trailing silence in `audio` lie outside.
    start: int = 0
    end: int = 0


_DISCARD = VadEvent(DISCARD)


def _as_int16(chunk) -> np.ndarray:
    if isinstance(chunk, (bytes, bytearray, memoryview)):
        raw = bytes(chunk)
        return np.frombuffer(raw[: len(raw) - len(raw) % 2], dtype="<i2").astype(np.int16)
    return np.asarray(chunk, dtype=np.int16)


class Level:
    """The speech threshold for the next frame, from the loudness of the frames before it."""

    def __init__(self):
        self.recent = deque(maxlen=LEVEL_WINDOW_MS // FRAME_MS)
        self.threshold = RMS_THRESHOLD
        self.since = 0

    def push(self, rms: float) -> float:
        self.recent.append(rms)
        self.since += 1
        # The fixed threshold until a second of history; then halfway between quiet and speech.
        if self.since >= LEVEL_EVERY and len(self.recent) >= 1000 // FRAME_MS:
            self.since = 0
            quiet, loud = np.percentile(self.recent, [QUIET_PCT, SPEECH_PCT])
            # At least twice the quiet level: a steady hum (quiet == loud) is never taken for speech.
            self.threshold = min(RMS_THRESHOLD, max(RMS_FLOOR, 2 * quiet, float(np.sqrt(max(quiet, 1e-6) * loud))))
        return self.threshold


class Segmenter:
    def __init__(self, rate: int):
        self.frame = rate * FRAME_MS // 1000
        self.pending = np.zeros(0, dtype=np.int16)
        self.preroll = deque()
        self.preroll_frames = PREROLL_MS // FRAME_MS
        self.utterance = np.zeros(0, dtype=np.int16)
        self._in_speech = False
        self.silent_frames = 0
        self.voiced_frames = 0
        self.total_frames = 0
        self.pushed = 0      # samples pushed so far
        self.done = 0        # samples cut into frames so far
        self.onset = self.voiced_end = 0
        self.level = Level()

    def in_speech(self) -> bool:
        return self._in_speech

    def push(self, chunk) -> list:
        samples = _as_int16(chunk)
        self.pushed += len(samples)
        self.pending = np.concatenate([self.pending, samples])
        events = []
        audio = []
        pos = 0
        while len(self.pending) - pos >= self.frame:
            frame = self.pending[pos: pos + self.frame]
            pos += self.frame
            at = self.done
            self.done += self.frame
            norm = frame.astype(np.float32) / 32768.0
            rms = float(np.sqrt(np.sum(norm * norm, dtype=np.float32) / len(frame)))
            voiced = rms > self.level.threshold
            self.level.push(rms)
            if not self._in_speech:
                if voiced:
                    self._in_speech = True
                    pre = list(self.preroll)
                    self.preroll.clear()
                    start = np.concatenate(pre + [frame])
                    self.utterance = start.copy()
                    self.silent_frames = 0
                    self.voiced_frames = 1
                    self.total_frames = 1
                    self.onset, self.voiced_end = at, at + self.frame
                    events.append(VadEvent(START, start, self.onset, self.voiced_end))
                else:
                    self.preroll.append(frame)
                    if len(self.preroll) > self.preroll_frames:
                        self.preroll.popleft()
                continue
            self.utterance = np.concatenate([self.utterance, frame])
            audio.append(frame)
            self.total_frames += 1
            if voiced:
                self.voiced_frames += 1
                self.silent_frames = 0
                self.voiced_end = at + self.frame
            else:
                self.silent_frames += 1
            ended = self.silent_frames * FRAME_MS >= END_SILENCE_MS or self.total_frames * FRAME_MS >= MAX_UTTERANCE_MS
            if ended:
                if audio:
                    events.append(VadEvent(AUDIO, np.concatenate(audio)))
                    audio = []
                self._in_speech = False
                utt = self.utterance
                self.utterance = np.zeros(0, dtype=np.int16)
                if self.voiced_frames * FRAME_MS >= MIN_VOICED_MS:
                    events.append(VadEvent(END, utt, self.onset, self.voiced_end))
                else:
                    events.append(_DISCARD)
        self.pending = self.pending[pos:].copy()
        if audio:
            events.append(VadEvent(AUDIO, np.concatenate(audio)))
        return events


def speech_regions(samples, rate: int) -> list:
    """Where there is speech in a recording, as (start, end) seconds, cut only at real pauses: the
    segmenter's 12 s cuts in the middle of speech are joined back."""
    seg = Segmenter(rate)
    pcm = _as_int16(samples)
    step = rate // 10
    tail = np.zeros(rate * (END_SILENCE_MS + FRAME_MS) // 1000, dtype=np.int16)   # closes the last utterance
    found = []
    for chunk in [pcm[i:i + step] for i in range(0, len(pcm), step)] + [tail]:
        for ev in seg.push(chunk):
            if ev.kind == END:
                found.append([ev.start / rate, ev.end / rate])
    regions = []
    for s, e in found:
        if regions and s - regions[-1][1] < END_SILENCE_MS / 1000:
            regions[-1][1] = e
        else:
            regions.append([s, e])
    return [tuple(r) for r in regions]


# reanchor: the largest delay looked for, the step, and how far an edge may move to meet a pause.
MAX_LAG, LAG_STEP, SNAP = 8.0, 0.05, 1.0
# The Gemini delay measured on her1912.wav (3.9-4.9 s): breaks ties when the speech has no pauses to align on.
PRIOR_LAG = 4.4


def reanchor(spans: list, regions: list) -> list:
    """Lines timed by when their text arrived (Gemini Live: 3.9-4.9 s late on her1912.wav, a different
    delay for each line) -> where their speech is. One delay for the whole recording first (the shift that
    puts the most line time on speech and the least on silence), then each edge moves to the nearest
    pause edge within SNAP, never overlapping the line before. `spans` and the result are (start, end)."""
    if not spans or not regions:
        return [tuple(s) for s in spans]
    starts = [r[0] for r in regions]
    ends = [r[1] for r in regions]
    before = [0.0]
    for s, e in regions:
        before.append(before[-1] + e - s)

    def voiced_until(t):
        i = bisect.bisect_right(starts, t)
        return before[i - 1] + min(t, ends[i - 1]) - starts[i - 1] if i else 0.0

    def score(lag):
        # speech the shifted lines cover, minus silence they cover
        return sum(2 * (voiced_until(e - lag) - voiced_until(s - lag)) - (e - s) for s, e in spans)

    lag = max((k * LAG_STEP for k in range(int(MAX_LAG / LAG_STEP) + 1)),
              key=lambda lag: (round(score(lag), 2), -abs(lag - PRIOR_LAG)))

    def nearest(t, edges, floor):
        near = [x for x in edges if abs(x - t) <= SNAP and x >= floor]
        return min(near, key=lambda x: abs(x - t)) if near else t

    out, last = [], 0.0
    for i, (s, e) in enumerate(spans):
        start = nearest(max(s - lag, last), starts, last)
        end = nearest(max(e - lag, start), ends, start)
        if i + 1 < len(spans) and end > spans[i + 1][0] - lag >= e - lag:
            end = max(e - lag, start)   # snapping would swallow the start of the next line
        out.append((round(start, 3), round(max(end, start), 3)))
        last = out[-1][1]
    return out


def wav(samples, rate: int) -> bytes:
    """16-bit mono PCM as a WAV file, for upload-per-sentence providers."""
    pcm = _as_int16(samples).astype("<i2").tobytes()
    data_len = len(pcm)
    header = (
        b"RIFF" + struct.pack("<I", 36 + data_len) + b"WAVEfmt "
        + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
        + b"data" + struct.pack("<I", data_len)
    )
    return header + pcm
