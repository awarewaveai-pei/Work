# Ported from OwnVoice Meet src-tauri/src/usage.rs and catalog.rs (Apache-2.0, https://github.com/Zaious/ownvoice-meet, 08e3ab3).
"""Usage per model and local day: audio seconds sent to speech-to-text, tokens to and from language
models (early translations counted apart). Costs are estimates from list prices (catalog.rs, checked
2026-10-17); each provider's own billing page is the authority. Only the models this service uses."""
import json
import logging
import os
import threading
import time
from dataclasses import dataclass, fields
from datetime import datetime

log = logging.getLogger(__name__)

HERE = os.path.dirname(os.path.abspath(__file__))
USAGE_PATH = os.path.join(os.path.dirname(os.path.dirname(HERE)), ".live-usage.json")

USD_TO_TWD = 32
# Audio arrives every 100 ms; write at most every 10 s (and on flush).
SAVE_EVERY = 10.0


@dataclass(frozen=True)
class Model:
    id: str
    label: str
    # ("per_minute", usd) | ("per_mtok", input, cached, output) | ("free",)
    price: tuple


MODELS = {
    m.id: m
    for m in (
        Model("gemini-live", "Gemini 3.5 Transcribe Live", ("per_minute", 0.009)),
        Model("local-whisper", "本機 Whisper（OpenAI 相容伺服器）", ("free",)),
        Model("claude-haiku-5-5", "Claude Haiku 5.5", ("per_mtok", 0.10, 0.01, 0.50)),
        Model("gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite", ("per_mtok", 0.30, 0.03, 2.50)),
    )
}


def cost_usd(model_id: str, audio_secs: float, input: int, cached: int, output: int) -> float:
    """Estimated USD for a usage record; 0 for a model not in MODELS."""
    m = MODELS.get(model_id)
    if m is None:
        return 0.0
    kind = m.price[0]
    if kind == "per_minute":
        return m.price[1] * audio_secs / 60.0
    if kind == "per_mtok":
        _, pi, pc, po = m.price
        return (input * pi + cached * pc + output * po) / 1_000_000.0
    return 0.0


@dataclass
class Tally:
    audio_secs: float = 0.0
    requests: int = 0
    # Of `requests`, translations of a sentence still being spoken.
    early: int = 0
    input: int = 0
    cached: int = 0
    cache_write: int = 0
    output: int = 0

    def add(self, o: "Tally") -> None:
        for f in fields(self):
            setattr(self, f.name, getattr(self, f.name) + getattr(o, f.name))

    def to_dict(self) -> dict:
        return {f.name: getattr(self, f.name) for f in fields(self)}

    @classmethod
    def from_dict(cls, d: dict) -> "Tally":
        t = cls()
        for f in fields(cls):
            if f.name in d:
                setattr(t, f.name, type(getattr(t, f.name))(d[f.name]))
        return t


def _local_date() -> str:
    return datetime.now().strftime("%Y-%m-%d")


class Usage:
    def __init__(self, path: str = USAGE_PATH, today_fn=_local_date, clock=time.monotonic):
        self._path = path
        self._today_fn = today_fn
        self._clock = clock
        self._lock = threading.Lock()
        self._days = None  # {date: {model: Tally}}, loaded on first use
        self._last_save = clock()

    def _ensure_loaded(self) -> None:
        if self._days is not None:
            return
        self._days = {}
        try:
            with open(self._path, encoding="utf-8-sig") as f:
                raw = json.load(f)
            self._days = {d: {m: Tally.from_dict(t) for m, t in models.items()} for d, models in raw.items()}
        except FileNotFoundError:
            pass
        except (OSError, ValueError, TypeError, AttributeError):
            log.warning("usage file unreadable, starting empty: %s", self._path)
            self._days = {}

    def _save(self) -> None:
        self._last_save = self._clock()
        data = {d: {m: t.to_dict() for m, t in models.items()} for d, models in self._days.items()}
        # tmp + os.replace: same atomic write as lib/settings.py _save.
        tmp_path = f"{self._path}.tmp{os.getpid()}"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            os.replace(tmp_path, self._path)
        except OSError:
            log.warning("usage file not written: %s", self._path)

    def _record(self, model: str, t: Tally) -> None:
        with self._lock:
            self._ensure_loaded()
            self._days.setdefault(self._today_fn(), {}).setdefault(model, Tally()).add(t)
            if self._clock() - self._last_save >= SAVE_EVERY:
                self._save()

    def add_audio(self, model: str, secs: float) -> None:
        self._record(model, Tally(audio_secs=secs))

    def add_tokens(self, model: str, t: Tally) -> None:
        self._record(model, Tally(**{**t.to_dict(), "requests": 1}))

    def flush(self) -> None:
        with self._lock:
            if self._days is not None:
                self._save()

    def today(self) -> dict:
        """Today's usage per model (most expensive first) and the total in NT$ (1 decimal)."""
        with self._lock:
            self._ensure_loaded()
            day = self._today_fn()
            rows = []
            for model, t in self._days.get(day, {}).items():
                m = MODELS.get(model)
                # Cache writes are billed near the input price; count them as input.
                usd = cost_usd(model, t.audio_secs, t.input + t.cache_write, t.cached, t.output)
                rows.append({"id": model, "label": m.label if m else model, **t.to_dict(), "usd": usd, "twd": round(usd * USD_TO_TWD, 1)})
        rows.sort(key=lambda r: r["usd"], reverse=True)
        return {"date": day, "models": rows, "total_twd": round(sum(r["usd"] for r in rows) * USD_TO_TWD, 1)}
