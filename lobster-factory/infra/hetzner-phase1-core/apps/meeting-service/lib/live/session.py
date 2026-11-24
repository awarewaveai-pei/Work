# Ported from OwnVoice Meet src-tauri/src/session.rs and captions.rs (Apache-2.0, https://github.com/Zaious/ownvoice-meet, 08e3ab3).
"""The one copy of a meeting's state: captions in order, and the translation of each. Speech-to-text
calls open / interim / finish / drop / fail; the Chinese streams in through `translate`. Everything a
window needs goes out through `emit(event)`:
  {"type":"caption","id":int,"en":str,"zh":str,"final":bool}  {"type":"caption-remove","id":int}
  {"type":"status","text":str}                                  {"type":"clear"}
Must be used from the running asyncio loop (translations are tasks)."""
import asyncio
import time
from dataclasses import dataclass
from typing import Callable, Optional

from .captions import _SEQ_MAX, Line, reads_as_subtitle
from .prompts import LISTEN_SYSTEM, listen_user, parse_glossary, system_blocks
from .translate import TranslateError

# Captions kept in memory; older ones scroll away.
MAX_SEGMENTS = 500
# Same default as OwnVoice Meet settings.rs (context_lines).
CONTEXT_LINES = 12


@dataclass
class Segment:
    id: int
    en: str
    zh: str
    final: bool


class Session:
    def __init__(self, translate, emit: Callable[[dict], None], clock: Callable[[], float] = time.monotonic, context_lines: int = CONTEXT_LINES):
        self.translate = translate
        self.emit = emit
        self.clock = clock
        self.context_lines = context_lines
        self.segments: list = []
        # English the user read aloud, placed after the caption that was last when they sent it.
        self.my_lines: list = []
        self.script = ""
        self.glossary = ""
        self.status_text = ""
        # Called synchronously: on_final(id, en) when a line's English is final,
        # on_translated(id, zh) when its final Chinese is on screen.
        self.on_final: list = []
        self.on_translated: list = []
        self._seg_seq = 0
        self._lines: dict = {}
        self._tasks: set = set()

    # ---- state (session.rs) ----

    def _find(self, id: int) -> Optional[Segment]:
        return next((s for s in reversed(self.segments) if s.id == id), None)

    def _send(self, seg: Segment) -> None:
        self.emit({"type": "caption", "id": seg.id, "en": seg.en, "zh": seg.zh, "final": seg.final})

    def _upsert(self, seg: Segment) -> None:
        cur = self._find(seg.id)
        if cur is not None:
            self.segments[self.segments.index(cur)] = seg
        else:
            self.segments.append(seg)
            if len(self.segments) > MAX_SEGMENTS:
                del self.segments[0]
        self._send(seg)

    def _set_en(self, id: int, en: str, final: bool) -> None:
        """A caption's English, keeping the Chinese it has (an early translation stays under a line
        that is still growing)."""
        cur = self._find(id)
        self._upsert(Segment(id, en, cur.zh if cur else "", final))

    def _set_zh(self, id: int, zh: str) -> None:
        seg = self._find(id)
        if seg is not None:
            seg.zh = zh
            self._send(seg)

    def context(self, before_id: Optional[int] = None, n: Optional[int] = None) -> list:
        """The last `n` (default context_lines) lines of the meeting before caption `before_id` (all of
        it when None), in order: what others said and what the user read aloud."""
        n = self.context_lines if n is None else n

        def keep(i: int) -> bool:
            return before_id is None or i < before_id

        lines = [(s.id, 0, f"Them: {s.en}") for s in self.segments if s.final and s.en and keep(s.id)]
        # A reply sent after caption k comes before caption k+1, so it counts when k < before.
        lines += [(i, 1, f"Me: {en}") for i, en in self.my_lines if keep(i)]
        lines.sort(key=lambda t: (t[0], t[1]))
        return [t[2] for t in lines[max(len(lines) - n, 0):]]

    def status(self, text: str) -> None:
        self.status_text = text
        self.emit({"type": "status", "text": text})

    def clear(self) -> None:
        self.segments.clear()
        self.my_lines.clear()
        self.emit({"type": "clear"})

    # ---- caption bookkeeping (captions.rs) ----

    def open(self) -> int:
        self._seg_seq = max(self._seg_seq, self.segments[-1].id if self.segments else 0) + 1
        id = self._seg_seq
        self._upsert(Segment(id, "…", "", False))
        self._lines[id] = Line(self.clock())
        return id

    def interim(self, id: int, text: str) -> None:
        """The sentence so far (gray). Translated early when it keeps growing."""
        self._set_en(id, text, False)
        now = self.clock()
        line = self._lines.setdefault(id, Line(now))
        if line.wants_early(text, now):
            seq, stop = line.start(text, True, now)
            self._spawn(id, text, seq, stop, True)

    def finish(self, id: int, text: str) -> None:
        """Final text for a line; empty text drops the line. Non-empty text is translated."""
        text = text.strip()
        if not text:
            return self.drop(id)
        self._set_en(id, text, True)
        for cb in self.on_final:
            cb(id, text)
        now = self.clock()
        seq, stop = self._lines.setdefault(id, Line(now)).start(text, False, now)
        self._spawn(id, text, seq, stop, False)

    def drop(self, id: int) -> None:
        """Drop a caption that came to nothing (a hypothesis with no final text)."""
        self.segments[:] = [s for s in self.segments if s.id != id]
        self.emit({"type": "caption-remove", "id": id})
        self._forget(id)

    def fail(self, id: int, msg: str) -> None:
        """Show an error in place of a line's text, without translating it."""
        self._upsert(Segment(id, f"〔{msg}〕", "", True))
        self._forget(id)

    def _forget(self, id: int) -> None:
        line = self._lines.pop(id, None)
        if line is not None:
            line.cancel_below(_SEQ_MAX)

    async def drain(self) -> None:
        """Wait for every translation still running."""
        while self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

    def _spawn(self, id: int, en: str, seq: int, stop, early: bool) -> None:
        task = asyncio.create_task(self._translate(id, en, seq, stop, early))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _translate(self, id: int, en: str, seq: int, stop, early: bool) -> None:
        system = system_blocks(LISTEN_SYSTEM, parse_glossary(self.glossary), self.script)
        user = listen_user(self.context(id), en, early)
        try:
            try:
                zh = await self.translate(system, user, lambda part: self._show(id, seq, stop, part, early, False), stop, early)
            except TranslateError as e:
                # An early failure is ignored: the final translation will come.
                if not early:
                    self._show(id, seq, stop, f"〔{e}〕", False, True)
            else:
                self._show(id, seq, stop, zh, early, True)
        finally:
            line = self._lines.get(id)
            if line is not None and line.done(seq):
                del self._lines[id]

    def _show(self, id: int, seq: int, stop, zh: str, early: bool, complete: bool) -> bool:
        """Put request `seq`'s Chinese under the line if it should be there; True if it was."""
        if stop.is_set() or (early and not reads_as_subtitle(zh)):
            return False
        line = self._lines.get(id)
        if line is None or not line.accept(seq, len(zh), complete):
            return False
        self._set_zh(id, zh)
        if complete and not early:
            for cb in self.on_translated:
                cb(id, zh)
        return True
