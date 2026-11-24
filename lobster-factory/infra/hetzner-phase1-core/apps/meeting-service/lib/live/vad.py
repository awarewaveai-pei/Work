# Ported from OwnVoice Meet src-tauri/src/vad.rs (Apache-2.0, https://github.com/Zaious/ownvoice-meet, 08e3ab3).
"""Energy-based speech segmentation: 30 ms frames, speech above an RMS threshold, 300 ms kept from
before the onset, an utterance ends after 700 ms of silence or 12 s of speech.

Events let two kinds of provider share it: upload-per-sentence providers take `END.audio`;
streaming providers send `START` preroll and `AUDIO` as they come and commit on `END`."""
import struct
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

RMS_THRESHOLD = 0.008
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


_DISCARD = VadEvent(DISCARD)


def _as_int16(chunk) -> np.ndarray:
    if isinstance(chunk, (bytes, bytearray, memoryview)):
        raw = bytes(chunk)
        return np.frombuffer(raw[: len(raw) - len(raw) % 2], dtype="<i2").astype(np.int16)
    return np.asarray(chunk, dtype=np.int16)


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

    def in_speech(self) -> bool:
        return self._in_speech

    def push(self, chunk) -> list:
        self.pending = np.concatenate([self.pending, _as_int16(chunk)])
        events = []
        audio = []
        pos = 0
        while len(self.pending) - pos >= self.frame:
            frame = self.pending[pos: pos + self.frame]
            pos += self.frame
            norm = frame.astype(np.float32) / 32768.0
            rms = float(np.sqrt(np.sum(norm * norm, dtype=np.float32) / len(frame)))
            voiced = rms > RMS_THRESHOLD
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
                    events.append(VadEvent(START, start))
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
                    events.append(VadEvent(END, utt))
                else:
                    events.append(_DISCARD)
        self.pending = self.pending[pos:].copy()
        if audio:
            events.append(VadEvent(AUDIO, np.concatenate(audio)))
        return events


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
