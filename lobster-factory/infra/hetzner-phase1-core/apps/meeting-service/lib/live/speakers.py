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
import contextlib
import gc
import json
import os
import threading
import uuid

import numpy as np

from lib import paths
from lib.diarize import no_telemetry

from . import vad
from .echo import RATE

MODEL = "pyannote/wespeaker-voxceleb-resnet34-LM"
# Cosine similarity at or above this = the same person. Measured 2026-11-27 on three Windows Chinese voices
# (Hanhan, Yating, Zhiwei; sentences over 1 s): same voice 0.88-0.93, different voices 0.23-0.65 (the two
# women, Hanhan and Yating, 0.52-0.65; at 0.5 they became one speaker). Synthetic voices are more uniform
# than people: real voices in a real room are not measured yet.
THRESHOLD = 0.75
SHORT_SEC = 1.0
DIM = 256                                  # the model's vector length; a saved vector of another length is skipped
HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))   # meeting-service/


def _unit(v) -> np.ndarray:
    v = np.asarray(v, dtype=np.float32)
    n = float(np.linalg.norm(v))
    return v / n if n else v


class Clusters:
    """Speakers of one listening. Keys are internal; names are what the page shows and the user can change.
    Each speaker keeps the running sum of its line vectors, so its centre costs nothing to read."""

    def __init__(self, voices: list = (), threshold: float = THRESHOLD):
        self.voices = [{"id": v["id"], "name": v["name"], "vector": _unit(v["vector"])} for v in voices]
        self.threshold = threshold
        self.lines = {}          # line id -> {"vec", "sec", "key", "guess"}, in the order they came
        self.speakers = {}       # key -> {"name", "voice" (saved voice id or None), "named" (by the user or a voice)}
        self.sums = {}           # key -> sum of its (non-guess) line vectors
        self._made = 0

    def _free_name(self) -> str:
        """The lowest 「講者 N」 no speaker has (a name the user typed is never handed out again)."""
        taken = {sp["name"] for sp in self.speakers.values()}
        n = 1
        while f"講者 {n}" in taken:
            n += 1
        return f"講者 {n}"

    def _new(self, name=None, voice=None, named=False) -> str:
        self._made += 1
        key = f"s{self._made}"
        self.speakers[key] = {"name": name or self._free_name(), "voice": voice, "named": named}
        self.sums[key] = np.zeros(DIM, dtype=np.float32)
        return key

    def _centre(self, key: str):
        total = self.sums.get(key)
        return None if total is None or not total.any() else _unit(total)

    def _match(self, vec):
        """(key, or None with a saved voice) of the closest speaker or unused saved voice at or above threshold."""
        best, found = self.threshold, None
        for key in self.speakers:
            c = self._centre(key)
            if c is not None and float(c @ vec) >= best:
                best, found = float(c @ vec), (key, None)
        used = {sp["voice"] for sp in self.speakers.values()}
        for v in self.voices:
            if v["id"] not in used and float(v["vector"] @ vec) >= best:
                best, found = float(v["vector"] @ vec), (None, v)
        return found

    def add(self, line: int, vec, seconds: float) -> tuple:
        """Label a line: (name, guess). No vector (too short, or its audio is gone) = the line before's speaker."""
        last = next(reversed(self.lines.values()))["key"] if self.lines else None
        if vec is None or seconds < SHORT_SEC:
            vec = None
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
            self.sums[key] = self.sums[key] + vec
        self.lines[line] = {"vec": vec, "sec": seconds, "key": key, "guess": guess}
        return self.speakers[key]["name"], guess

    def labels(self) -> dict:
        return {line: (self.speakers[l["key"]]["name"], l["guess"]) for line, l in self.lines.items()}

    def rename(self, old: str, new: str) -> bool:
        """Rename a speaker. A name another speaker already has = the user says they are one person: the
        two become one speaker (and stay one at the regroup)."""
        keys = [k for k, sp in self.speakers.items() if sp["name"] == old]
        if not keys:
            return False
        into = next((k for k, sp in self.speakers.items() if sp["name"] == new and k not in keys), None)
        if into is None:
            into = keys.pop(0)
            self.speakers[into].update(name=new, named=True)
        else:
            self.speakers[into]["named"] = True
        for k in keys:
            self.sums[into] = self.sums[into] + self.sums.pop(k)
            del self.speakers[k]
            for l in self.lines.values():
                if l["key"] == k:
                    l["key"] = into
        return True

    def centre_of(self, name: str):
        key = next((k for k, sp in self.speakers.items() if sp["name"] == name), None)
        return None if key is None else self._centre(key)

    def remember(self, name: str, item: dict) -> None:
        """A speaker's voice was just saved: it is that saved voice from now on (not matched a second time)."""
        self.voices.append({"id": item["id"], "name": item["name"], "vector": _unit(item["vector"])})
        for sp in self.speakers.values():
            if sp["name"] == name:
                sp["voice"], sp["named"] = item["id"], True

    def forget_voice(self, voice_id: str) -> None:
        """Never match this saved voice again, and stop calling anyone by its name: the speakers it named
        go back to 「講者 N」 (also after the regroup)."""
        self.voices = [v for v in self.voices if v["id"] != voice_id]
        for sp in self.speakers.values():
            if sp["voice"] == voice_id:
                sp["voice"], sp["named"], sp["name"] = None, False, ""
        for sp in self.speakers.values():
            if not sp["name"]:
                sp["name"] = self._free_name()

    def regroup(self) -> dict:
        """Group all lines again from their vectors (centroid linkage: the two closest groups merge while
        their centres are within threshold; each step updates one row, so 1,200 lines take about a second),
        groups the user joined by a rename stay joined, number the groups by speaking time, keep names the
        user gave (by majority of each group's lines). Runs off the event loop (Tracker.finish)."""
        ids = [i for i, l in self.lines.items() if l["vec"] is not None and not l["guess"]]
        groups = _merge_close([self.lines[i]["vec"] for i in ids], self.threshold)
        groups = [[ids[j] for j in g] for g in groups]
        majority = []
        for g in groups:
            votes = {}
            for i in g:
                votes[self.lines[i]["key"]] = votes.get(self.lines[i]["key"], 0) + 1
            majority.append(max(votes, key=votes.get))
        joined = {}
        for g, key in zip(groups, majority):
            named = self.speakers.get(key, {}).get("named")
            joined.setdefault(key if named else id(g), (key, []))[1].extend(g)
        groups = sorted(joined.values(), key=lambda kg: -sum(self.lines[i]["sec"] for i in kg[1]))
        old = self.speakers
        self.speakers, self.sums = {}, {}
        placed = []
        for key, g in groups:          # names the user gave first, so a number never takes one of them
            prev = old.get(key, {})
            kept = prev.get("named") and prev["name"] not in {sp["name"] for sp in self.speakers.values()}
            placed.append((self._new(prev["name"], prev["voice"], True) if kept else None, g))
        for new, g in placed:          # then 「講者 N」 in order of speaking time
            new = new or self._new()
            for i in g:
                self.lines[i]["key"] = new
                self.sums[new] = self.sums[new] + self.lines[i]["vec"]
        last = None
        for l in self.lines.values():
            if l["guess"] or l["vec"] is None:
                l["key"] = last if last is not None else self._new()
            last = l["key"]
        return self.labels()


def _merge_close(vectors: list, threshold: float) -> list:
    """Indexes of `vectors` in groups: repeatedly merge the two groups whose centres are most alike, while
    at or above threshold. Each group's best partner is kept per row, so a merge rescans only the rows that
    pointed at the two merged groups."""
    n = len(vectors)
    if n < 2:
        return [[i] for i in range(n)]
    sums = np.stack([np.asarray(v, dtype=np.float32) for v in vectors])
    unit = sums / np.maximum(np.linalg.norm(sums, axis=1, keepdims=True), 1e-12)
    sim = unit @ unit.T
    np.fill_diagonal(sim, -np.inf)
    best, arg = sim.max(axis=1), sim.argmax(axis=1)
    members = [[i] for i in range(n)]
    alive = np.ones(n, dtype=bool)
    while True:
        a = int(np.argmax(np.where(alive, best, -np.inf)))
        if not alive[a] or best[a] < threshold:
            break
        b = int(arg[a])
        members[a] += members[b]
        members[b] = []
        alive[b] = False
        sums[a] += sums[b]
        unit[a] = sums[a] / max(float(np.linalg.norm(sums[a])), 1e-12)
        row = unit @ unit[a]
        row[~alive] = -np.inf
        row[a] = -np.inf
        sim[a, :] = row
        sim[:, a] = row
        sim[b, :] = -np.inf
        sim[:, b] = -np.inf
        best[b] = -np.inf
        best[a], arg[a] = row.max(), row.argmax()
        stale = alive & ((arg == a) | (arg == b))
        stale[a] = False
        for i in np.nonzero(stale)[0]:
            best[i], arg[i] = sim[i].max(), sim[i].argmax()
        better = alive & (row > best)
        best[better], arg[better] = row[better], a
    return [m for m in members if m]


def voices_location():
    """The voices file in Windows form, from %LOCALAPPDATA% in either form: the Windows server sees
    C:\\Users\\x\\AppData\\Local, the WSL2 one /mnt/c/Users/x/AppData/Local (start_server.ps1 passes it with
    WSLENV LOCALAPPDATA/p): both are the same file. None when there is no LOCALAPPDATA (not Windows)."""
    base = os.environ.get("LOCALAPPDATA", "").strip()
    return paths.windows(base.rstrip("\\/") + "\\meeting-service\\voices.json") if base else None


def voices_path() -> str:
    found = voices_location()
    return paths.local(found) if found else os.path.join(os.path.expanduser("~"), ".local", "share", "meeting-service", "voices.json")


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


class VoicesUnreadable(Exception):
    """The voices file is there but cannot be read: never treated as empty (the next save would wipe it)."""
    sentence = True


class Voices:
    """The saved voices: [{"id", "name", "vector"}]. Written by a read-modify-write under an OS file lock
    (two servers, Windows and WSL2, may share the file) through a temp file of its own."""
    _lock = threading.Lock()

    def __init__(self, path: str = None):
        self.path = path or voices_path()
        check_location(self.path)

    def load(self) -> list:
        """The saved voices; [] only when there is no file. A vector of the wrong length is left out."""
        try:
            with open(self.path, encoding="utf-8") as f:
                data = json.load(f)
        except FileNotFoundError:
            return []
        except (OSError, ValueError) as e:
            raise VoicesUnreadable(f"讀不懂聲音檔 {self.path}（{type(e).__name__}），沒有動它；請檢查或移走這個檔案") from None
        if not isinstance(data, list):
            raise VoicesUnreadable(f"聲音檔 {self.path} 的內容不是清單，沒有動它；請檢查或移走這個檔案")
        return [v for v in data if isinstance(v, dict) and {"id", "name", "vector"} <= v.keys()
                and isinstance(v["vector"], list) and len(v["vector"]) == DIM]

    @contextlib.contextmanager
    def _locked(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with self._lock, open(self.path + ".lock", "a+b") as f:
            if os.name == "nt":
                import msvcrt
                f.seek(0)
                msvcrt.locking(f.fileno(), msvcrt.LK_LOCK, 1)
            else:
                import fcntl
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                if os.name == "nt":
                    f.seek(0)
                    msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)

    def _write(self, items: list) -> None:
        tmp = f"{self.path}.{uuid.uuid4().hex}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False)
        os.replace(tmp, self.path)

    def save(self, name: str, vector) -> dict:
        with self._locked():
            items = self.load()
            item = {"id": uuid.uuid4().hex[:12], "name": name, "vector": [round(float(x), 5) for x in _unit(vector)]}
            self._write(items + [item])
            return item

    def delete(self, voice_id: str) -> None:
        with self._locked():
            self._write([v for v in self.load() if v["id"] != voice_id])


def delete_voice(voices: Voices, clusters, voice_id: str) -> None:
    """The one way to forget a voice: out of the file, and out of this listening's matching and names."""
    voices.delete(voice_id)
    if clusters is not None:
        clusters.forget_voice(voice_id)


class Embedder:
    """The pyannote embedding model on this machine (8.9 s to load, 33-68 ms per sentence on the RTX 5060).
    One lock around load, embed and unload: unloading waits for a load still running in its thread."""

    def __init__(self, token: str):
        self.token, self.inference = token, None
        self._lock = threading.Lock()

    def load(self) -> None:
        with self._lock:
            no_telemetry()
            import torch
            from pyannote.audio import Inference, Model
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            model = Model.from_pretrained(MODEL, token=self.token)
            self.inference = Inference(model, window="whole")
            self.inference.to(device)
            self._embed(np.zeros(RATE, dtype=np.int16))     # the first call takes ~4 s: not on a meeting line

    def embed(self, pcm: np.ndarray) -> np.ndarray:
        with self._lock:
            return self._embed(pcm)

    def _embed(self, pcm: np.ndarray) -> np.ndarray:
        import torch
        x = torch.from_numpy(pcm.astype(np.float32) / 32768.0).unsqueeze(0)
        return _unit(np.asarray(self.inference({"waveform": x, "sample_rate": RATE})))

    def unload(self) -> None:
        with self._lock:
            self.inference = None
            gc.collect()
            try:
                import torch
                torch.cuda.empty_cache()
            except Exception:
                pass


class Tracker:
    """One listening's speaker labels for the 「對方」 channel. `ring`: that channel's recent audio
    (lib/live/echo.Ring). `arrival`: Gemini recognises it, so line times are when the text arrived (~4.4 s
    late): the window is moved onto the speech with vad.reanchor (local lines are already where the voice
    is: the segmenter's sample positions, C12). `voices`: the saved voices to recognise.
    `on_change()`: the speakers changed (one call per line, one after the regroup)."""

    def __init__(self, session, ring, arrival: bool, voices: list, embedder, on_change=lambda: None):
        self.session, self.ring, self.arrival = session, ring, arrival
        self.embedder, self.on_change = embedder, on_change
        self.clusters = Clusters(voices)
        self.failed = False
        self.regrouping = False
        self.jobs = asyncio.Queue()
        self.task = asyncio.ensure_future(self._work())

    def line_final(self, seg) -> None:
        if seg.who == "them":
            self.jobs.put_nowait((seg.id, seg.start, seg.end))

    def _window(self, start: float, end: float):
        """(audio of the line's own speech, its length); audio None when the ring no longer holds it
        (the model took longer to load than the ring keeps): no vector, never silence taken for a voice."""
        if self.arrival:
            base = max(start - vad.MAX_LAG, 0.0)
            pcm = self.ring.slice(int(base * RATE), int(end * RATE))
            regions = [(a + base, b + base) for a, b in vad.speech_regions(pcm, RATE)]
            start, end = vad.reanchor([(start, end)], regions)[0]
        if not self.ring.covers(int(start * RATE)):
            return None, end - start
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
            try:
                pcm, seconds = self._window(start, end)
                vec = await asyncio.to_thread(self.embedder.embed, pcm) if pcm is not None and seconds >= SHORT_SEC else None
                name, guess = self.clusters.add(line, vec, seconds)
            except Exception as e:
                self.session.status(f"有一句分不出講者：{type(e).__name__}: {e}")
                continue
            self.session.label(line, name, guess)
            self.on_change()

    async def finish(self) -> None:
        """Every line labelled, then grouped once more from all vectors (in a thread: a long meeting must not
        stop the event loop); the model leaves the GPU, after a load still running has ended."""
        try:
            self.jobs.put_nowait(None)
            await self.task
            if not self.failed:
                self.regrouping = True
                try:
                    labels = await asyncio.to_thread(self.clusters.regroup)
                finally:
                    self.regrouping = False
                for line, (name, guess) in labels.items():
                    self.session.label(line, name, guess)
                self.on_change()
        finally:
            await asyncio.to_thread(self.embedder.unload)
