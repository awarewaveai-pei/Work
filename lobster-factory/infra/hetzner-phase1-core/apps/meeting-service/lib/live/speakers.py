"""Telling the others apart while listening (C18). Every final 「對方」 line becomes a voice vector
(pyannote speaker embedding, on this machine's GPU); a vector close to a speaker's centre joins that
speaker, otherwise it is a new 「講者 N」. Lines under SHORT_SEC have too little voice and take the
previous line's speaker, marked as a guess. At stop everything is grouped once more from all the vectors
(no audio is run again), speakers are numbered by how long they spoke, and names the user gave survive.

Saved voices (「記住這個聲音」) live in VOICES_FILE outside this folder and outside any synced folder:
vectors and names only, never audio. A deleted voice is gone from the file and from matching.
  Clusters  the grouping, pure (tests use made-up vectors)
  Voices    the saved voices file
  Embedder  the model
  Tracker   one listening: queue of lines -> labels on the Session"""
import asyncio
import gc
import json
import os
import threading
import uuid

import numpy as np

from . import vad
from .echo import RATE

MODEL = "pyannote/wespeaker-voxceleb-resnet34-LM"
# Cosine similarity at or above this = the same person. Measured 2026-11-27 on three Windows Chinese voices
# (Hanhan, Yating, Zhiwei; sentences over 1 s): same voice 0.88-0.93, different voices 0.23-0.65 (the two
# women, Hanhan and Yating, 0.52-0.65; at 0.5 they became one speaker). Synthetic voices are more uniform
# than people: real voices in a real room are not measured yet.
THRESHOLD = 0.75
SHORT_SEC = 1.0
HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))   # meeting-service/


def _unit(v) -> np.ndarray:
    v = np.asarray(v, dtype=np.float32)
    n = float(np.linalg.norm(v))
    return v / n if n else v


class Clusters:
    """Speakers of one listening. Keys are internal; names are what the page shows and the user can change."""

    def __init__(self, voices: list = (), threshold: float = THRESHOLD):
        self.voices = [{"id": v["id"], "name": v["name"], "vector": _unit(v["vector"])} for v in voices]
        self.threshold = threshold
        self.lines = {}          # line id -> {"vec", "sec", "key", "guess"}, in the order they came
        self.speakers = {}       # key -> {"name", "voice" (saved voice id or None), "named" (by the user)}
        self._made = 0

    def _new(self, name=None, voice=None, named=False) -> str:
        self._made += 1
        key = f"s{self._made}"
        self.speakers[key] = {"name": name or f"講者 {self._made}", "voice": voice, "named": named}
        return key

    def _centre(self, key: str):
        vecs = [l["vec"] for l in self.lines.values() if l["key"] == key and l["vec"] is not None and not l["guess"]]
        return _unit(np.mean(vecs, axis=0)) if vecs else None

    def _match(self, vec):
        """(key, or None with a saved voice) of the closest speaker or unused saved voice at or above threshold."""
        best, found = self.threshold, None
        for key in self.speakers:
            c = self._centre(key)
            if c is not None and float(c @ vec) >= best:
                best, found = float(c @ vec), (key, None)
        used = {s["voice"] for s in self.speakers.values()}
        for v in self.voices:
            if v["id"] not in used and float(v["vector"] @ vec) >= best:
                best, found = float(v["vector"] @ vec), (None, v)
        return found

    def add(self, line: int, vec, seconds: float) -> tuple:
        """Label a line: (name, guess)."""
        last = next(reversed(self.lines.values()))["key"] if self.lines else None
        if vec is None or seconds < SHORT_SEC:
            key, guess = last or self._new(), True
        else:
            vec = _unit(vec)
            found = self._match(vec)
            if found is None:
                key = self._new()
            elif found[0] is not None:
                key = found[0]
            else:
                key = self._new(found[1]["name"], found[1]["id"], True)
            guess = False
        self.lines[line] = {"vec": None if vec is None else _unit(vec), "sec": seconds, "key": key, "guess": guess}
        return self.speakers[key]["name"], guess

    def labels(self) -> dict:
        return {line: (self.speakers[l["key"]]["name"], l["guess"]) for line, l in self.lines.items()}

    def rename(self, old: str, new: str) -> bool:
        hit = False
        for s in self.speakers.values():
            if s["name"] == old:
                s["name"], s["named"], hit = new, True, True
        return hit

    def centre_of(self, name: str):
        key = next((k for k, s in self.speakers.items() if s["name"] == name), None)
        return None if key is None else self._centre(key)

    def remember(self, name: str, item: dict) -> None:
        """A speaker's voice was just saved: it is that saved voice from now on (not matched a second time)."""
        self.voices.append({"id": item["id"], "name": item["name"], "vector": _unit(item["vector"])})
        for s in self.speakers.values():
            if s["name"] == name:
                s["voice"], s["named"] = item["id"], True

    def forget_voice(self, voice_id: str) -> None:
        """Never match this saved voice again (the speakers it named keep their name for this session)."""
        self.voices = [v for v in self.voices if v["id"] != voice_id]
        for s in self.speakers.values():
            if s["voice"] == voice_id:
                s["voice"] = None

    def regroup(self) -> dict:
        """Group all lines again from their vectors (average of each group, merged while close enough),
        number the groups by speaking time, keep names the user gave (by majority of each group's lines)."""
        ids = [i for i, l in self.lines.items() if l["vec"] is not None and not l["guess"]]
        groups = [[i] for i in ids]
        while len(groups) > 1:
            centres = np.stack([_unit(np.mean([self.lines[i]["vec"] for i in g], axis=0)) for g in groups])
            sim = centres @ centres.T
            np.fill_diagonal(sim, -1.0)
            a, b = np.unravel_index(int(np.argmax(sim)), sim.shape)
            if sim[a, b] < self.threshold:
                break
            groups[a] += groups[b]
            del groups[b]
        groups.sort(key=lambda g: -sum(self.lines[i]["sec"] for i in g))
        old, taken, made = self.speakers, set(), 0
        self.speakers, self._made = {}, 0
        for g in groups:
            votes = {}
            for i in g:
                votes[self.lines[i]["key"]] = votes.get(self.lines[i]["key"], 0) + 1
            prev = old.get(max(votes, key=votes.get), {})
            if prev.get("named") and prev["name"] not in taken:
                key = self._new(prev["name"], prev["voice"], True)
            else:
                made += 1
                key = self._new(f"講者 {made}")
            taken.add(self.speakers[key]["name"])
            for i in g:
                self.lines[i]["key"] = key
        last = None
        for l in self.lines.values():
            if l["guess"] or l["vec"] is None:
                l["key"] = last or l["key"]
                if l["key"] not in self.speakers:
                    l["key"] = self._new()
            last = l["key"]
        return self.labels()


def voices_path() -> str:
    base = os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), ".local", "share")
    return os.path.join(base, "meeting-service", "voices.json")


def check_location(path: str) -> None:
    """Voices are biometric: never inside this folder (a git repository, public), a cloud-synced folder
    (lib/paths.cloud, the one rule recordings use) or an output destination (they are synced)."""
    from lib import paths, settings
    p = os.path.normcase(os.path.abspath(path))
    roots = [HERE]
    for d in settings.destinations():
        try:
            roots.append(paths.local(d["dir"]))
        except paths.PathError:
            pass                        # a destination this process cannot reach cannot hold the file either
    for root in roots:
        r = os.path.normcase(os.path.abspath(root))
        if p == r or p.startswith(r.rstrip("\\/") + os.sep):
            raise ValueError(f"聲音檔不能放在 {root} 底下")
    name = paths.cloud(os.path.dirname(path))
    if name:
        raise ValueError(f"聲音檔不能放在 {name} 同步的資料夾裡")


class Voices:
    """The saved voices: [{"id", "name", "vector"}]."""
    _lock = threading.Lock()

    def __init__(self, path: str = None):
        self.path = path or voices_path()
        check_location(self.path)

    def load(self) -> list:
        try:
            with open(self.path, encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError):
            return []
        return [v for v in data if isinstance(v, dict) and {"id", "name", "vector"} <= v.keys()] if isinstance(data, list) else []

    def _write(self, items: list) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False)
        os.replace(tmp, self.path)

    def save(self, name: str, vector) -> dict:
        with self._lock:
            items = self.load()
            item = {"id": uuid.uuid4().hex[:12], "name": name, "vector": [round(float(x), 5) for x in _unit(vector)]}
            self._write(items + [item])
            return item

    def delete(self, voice_id: str) -> None:
        with self._lock:
            self._write([v for v in self.load() if v["id"] != voice_id])


def delete_voice(voices: Voices, clusters, voice_id: str) -> None:
    """The one way to forget a voice: out of the file, and out of this listening's matching."""
    voices.delete(voice_id)
    if clusters is not None:
        clusters.forget_voice(voice_id)


class Embedder:
    """The pyannote embedding model on this machine (8.9 s to load, 33-68 ms per sentence on the RTX 5060)."""

    def __init__(self, token: str):
        self.token, self.inference = token, None

    def load(self) -> None:
        import torch
        from pyannote.audio import Inference, Model
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = Model.from_pretrained(MODEL, token=self.token)
        self.inference = Inference(model, window="whole")
        self.inference.to(device)
        self.embed(np.zeros(RATE, dtype=np.int16))     # the first call takes ~4 s: not on a meeting line

    def embed(self, pcm: np.ndarray) -> np.ndarray:
        import torch
        x = torch.from_numpy(pcm.astype(np.float32) / 32768.0).unsqueeze(0)
        return _unit(np.asarray(self.inference({"waveform": x, "sample_rate": RATE})))

    def unload(self) -> None:
        self.inference = None
        gc.collect()


class Tracker:
    """One listening's speaker labels for the 「對方」 channel. `ring`: that channel's recent audio
    (lib/live/echo.Ring). `arrival`: Gemini recognises it, so line times are when the text arrived (~4.4 s
    late): the window is moved onto the speech with vad.reanchor (local lines are already where the voice
    is: the segmenter's sample positions, C12)."""

    def __init__(self, session, ring, arrival: bool, voices: Voices, embedder):
        self.session, self.ring, self.arrival = session, ring, arrival
        self.voices, self.embedder = voices, embedder
        self.clusters = Clusters(voices.load())
        self.failed = False
        self.jobs = asyncio.Queue()
        self.task = asyncio.ensure_future(self._work())

    def line_final(self, seg) -> None:
        if seg.who == "them":
            self.jobs.put_nowait((seg.id, seg.start, seg.end))

    def _window(self, start: float, end: float):
        if self.arrival:
            base = max(start - vad.MAX_LAG, 0.0)
            pcm = self.ring.slice(int(base * RATE), int(end * RATE))
            regions = [(a + base, b + base) for a, b in vad.speech_regions(pcm, RATE)]
            start, end = vad.reanchor([(start, end)], regions)[0]
        return self.ring.slice(int(start * RATE), int(end * RATE)), end - start

    async def _work(self) -> None:
        try:
            await asyncio.to_thread(self.embedder.load)
        except Exception as e:
            self.failed = True
            self.session.status(f"即時分講者的模型載入失敗：{type(e).__name__}: {e}（字幕照常）")
        while True:
            job = await self.jobs.get()
            if job is None:
                return
            if self.failed:
                continue
            line, start, end = job
            pcm, seconds = self._window(start, end)
            vec = await asyncio.to_thread(self.embedder.embed, pcm) if seconds >= SHORT_SEC else None
            name, guess = self.clusters.add(line, vec, seconds)
            self.session.label(line, name, guess)

    async def finish(self) -> None:
        """Every line labelled, then grouped once more from all vectors; the model leaves the GPU."""
        try:
            self.jobs.put_nowait(None)
            await self.task
            if not self.failed:
                for line, (name, guess) in self.clusters.regroup().items():
                    self.session.label(line, name, guess)
        finally:
            await asyncio.shield(asyncio.to_thread(self.embedder.unload))
