# Ported from OwnVoice Meet src-tauri/src/stt_chunk.rs (Apache-2.0, https://github.com/Zaious/ownvoice-meet, 08e3ab3).
"""Speech-to-text by sentence on this machine: the energy segmenter cuts utterances out of the audio
and a resident faster-whisper model transcribes them one at a time (keeps captions in order).
A gray "…" line shows while someone talks; the text arrives when the sentence ends. A line's start and
end are where the segmenter heard the speech begin and end, as positions in the recording.

`audio` carries (start in the recording in samples, bytes of 16 kHz mono PCM16 little-endian) or None (= stop)."""
import asyncio
import gc
import threading
import time

import numpy as np

from lib import transcribe
from lib.live import langs
from lib.live.vad import END, DISCARD, START, Segmenter

RATE = 16_000
SILENCE_AFTER = 0.25
TICK = 0.1
CHUNK_SAMPLES = RATE // 10
MODEL_NAME = "large-v3"

_model = None
_model_lock = threading.Lock()
# Held for the length of one recognition, so stopping can wait for it before the GPU is handed back.
_infer_lock = threading.Lock()


def default_model():
    """The resident model, loaded on first use through transcribe.pick_device."""
    global _model
    with _model_lock:
        if _model is None:
            _model, _ = transcribe.pick_device(MODEL_NAME, lambda *_: None)
        return _model


def _recognize(model_provider, utterance, language) -> tuple:
    """(text, the langs.py code whisper detected, "" when not in the table; None when `language` was given)."""
    with _infer_lock:
        model = model_provider()
        samples = utterance.astype(np.float32) / 32768.0
        segments, info = model.transcribe(
            samples,
            beam_size=1,
            condition_on_previous_text=False,
            vad_filter=False,
            language=language,
            # Without it Whisper writes Simplified Chinese (same prompt as the batch pipeline).
            initial_prompt=transcribe.ZH_PROMPT if language == "zh" else None,
        )
        text = transcribe.joined_text(s.text for s in segments)
        if language:
            return text, None
        found = langs.from_whisper(getattr(info, "language", "") or "")
        return text, found.code if found else ""


def _unload() -> None:
    """Wait for a load or a recognition still running in its thread (neither can be cancelled), then
    drop the resident model: while the gate is free, no live model sits on the GPU."""
    global _model
    with _model_lock:
        with _infer_lock:
            _model = None
            gc.collect()


class _Positions:
    """Segmenter sample index -> seconds into the recording. The two stop running in step where audio
    was dropped on the way here (and through the silence fed in below, where no speech is ever found)."""

    def __init__(self):
        self.marks = [(0, 0)]   # (segmenter index, recording position) where a stretch in step begins

    def mark(self, index: int, at: int) -> None:
        i, p = self.marks[-1]
        if p + index - i != at:
            self.marks.append((index, at))

    def seconds(self, index: int) -> float:
        i, p = next(m for m in reversed(self.marks) if m[0] <= index)
        return (p + index - i) / RATE

    def forget_before(self, index: int) -> None:
        while len(self.marks) > 1 and self.marks[1][0] <= index:
            del self.marks[0]


class Recognizer:
    """The one resident model and its recognition worker, shared by every local channel of a listening
    (two local channels = one model, one worker; lib/live/hub.py holds the GPU claim for it). The model
    loads in the background while the channels already cut utterances: those wait in the job queue, so
    nothing said during the 13-24 s load is lost."""

    def __init__(self, session, usage, model_provider=None):
        self.session, self.usage = session, usage
        self.provider = model_provider or default_model
        self.failed = False
        self.jobs = asyncio.Queue()
        self.task = asyncio.ensure_future(self._work())

    def put(self, line: int, utterance, end: float, language) -> None:
        self.jobs.put_nowait((line, utterance, end, language))

    async def _work(self) -> None:
        self.session.status("正在載入本機辨識模型（第一次要等一下）…")
        try:
            await asyncio.to_thread(self.provider)
        except Exception as e:
            self.failed = True
            self.session.status(f"本機辨識模型載入失敗：{type(e).__name__}: {e}")
        else:
            self.session.status("聆聽中（本機辨識）")
        while True:
            job = await self.jobs.get()
            if job is None:
                return
            line, utterance, end, language = job
            if self.failed:
                self.session.drop(line)
                continue
            try:
                text, detected = await asyncio.to_thread(_recognize, self.provider, utterance, language)
            except asyncio.CancelledError:
                self.session.drop(line)
                raise
            except Exception as e:
                msg = f"辨識失敗：{type(e).__name__}: {e}"
                self.session.fail(line, msg)
                self.session.status(msg)
            else:
                self.usage.add_audio("local-whisper", len(utterance) / RATE)
                self.session.finish(line, text, end, detected)

    async def close(self) -> None:
        """No more utterances: recognize the queued ones, then drop the resident model (while the GPU
        claim is free, no live model sits on the GPU)."""
        try:
            self.jobs.put_nowait(None)
            await self.task
        finally:
            if not self.task.done():
                self.task.cancel()
            # Sentences cut but not recognized: take their "…" lines off the screen.
            while not self.jobs.empty():
                job = self.jobs.get_nowait()
                if job is not None:
                    self.session.drop(job[0])
            await asyncio.shield(asyncio.to_thread(_unload))


async def run(session, recognizer: Recognizer, language: str, audio: asyncio.Queue, who: str = "them"):
    """One channel: cut its audio into utterances from the first chunk on and hand them to the shared
    recognizer. Ends at None, or when the model could not be loaded."""
    lang = (langs.find(language).whisper if langs.find(language) else "") or None
    seg = Segmenter(RATE)
    where = _Positions()
    current = None
    last_audio = time.monotonic()
    silence = bytes(CHUNK_SAMPLES * 2)
    while not recognizer.failed:
        try:
            item = await asyncio.wait_for(audio.get(), TICK)
        except asyncio.TimeoutError:
            # Loopback delivers nothing while nothing plays: feed silence so a sentence can end.
            if time.monotonic() - last_audio > SILENCE_AFTER and seg.in_speech():
                events = seg.push(silence)
            else:
                continue
        else:
            if item is None:
                break
            at, pcm = item
            last_audio = time.monotonic()
            where.mark(seg.pushed, at)
            events = seg.push(pcm)
        for ev in events:
            if ev.kind == START:
                current = session.open(where.seconds(ev.start), who)
            elif ev.kind == END:
                if current is not None:
                    recognizer.put(current, ev.audio, where.seconds(ev.end), lang)
                    current = None
            elif ev.kind == DISCARD:
                if current is not None:
                    session.drop(current)
                    current = None
        where.forget_before(seg.onset if seg.in_speech() else seg.done)
    if current is not None:
        session.drop(current)
