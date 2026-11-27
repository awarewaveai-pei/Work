# Ported from OwnVoice Meet src-tauri/src/session.rs and captions.rs (Apache-2.0, https://github.com/Zaious/ownvoice-meet, 08e3ab3).
"""The one copy of a meeting's state: captions in order, and the translation of each. Speech-to-text
calls open / interim / finish / drop / fail; the Chinese streams in through `translate`. Everything a
window needs goes out through `emit(event)`:
  {"type":"caption", ...Segment fields}                         {"type":"caption-remove","id":int}
  {"type":"status","text":str}                                  {"type":"clear"}
  {"type":"reply","id":int,"zh":str,"en":str,"done":bool}      (compose_reply; only the newest reply emits)
Must be used from the running asyncio loop (translations are tasks)."""
import asyncio
import time
from dataclasses import asdict, dataclass, replace
from typing import Callable, Optional

from .captions import _SEQ_MAX, Line, reads_as_subtitle
from . import langs
from .prompts import listen_system, listen_user, parse_glossary, reply_system, reply_user, system_blocks
from .translate import TranslateError

# Captions kept in memory; older ones scroll away.
MAX_SEGMENTS = 500
# Same default as OwnVoice Meet settings.rs (context_lines).
CONTEXT_LINES = 12
# The speaker name of every line from the user's own channel (C17, lib/live/hub.py).
ME = "我"


@dataclass
class Segment:
    """One line of the meeting, in the one format the caption events, the snapshot and the saved
    session.json share. start / end: seconds into the recording (its sample position, not a clock);
    seg: the recording segment it was spoken in; who: "me" | "them"; lang: a lib/live/langs.py code
    or "" (not known); text: what was said; tr: its translation ("" = none yet); guess: the speaker was
    not heard but taken from the line before (a line too short to tell, lib/live/speakers.py)."""
    id: int
    start: float = 0.0
    end: float = 0.0
    seg: int = 0
    who: str = "them"
    speaker: Optional[str] = None
    lang: str = ""
    text: str = ""
    tr: str = ""
    final: bool = False
    guess: bool = False


class Session:
    def __init__(self, translate, emit: Callable[[dict], None], clock: Callable[[], float] = time.monotonic, context_lines: int = CONTEXT_LINES, compose=None):
        self.translate = translate
        # `await compose(system, user, on_delta) -> str`: the English of a reply, untouched by the Chinese conversion.
        self.compose = compose
        self.emit = emit
        self.clock = clock
        self.context_lines = context_lines
        self.segments: list = []
        # What the user read aloud (who="me"); id = the caption that was last when they sent it.
        self.my_lines: list = []
        # The recording segment new lines belong to (the hub moves it on).
        self.seg = 0
        self.script = ""
        self.glossary = ""
        # What is listened to and what it is translated into (lib/live/langs.py codes; the hub sets them at start).
        self.listen = langs.THEIRS
        self.target = langs.MINE
        self.reply: Optional[dict] = None
        self._reply_seq = 0
        self._reply_task: Optional[asyncio.Task] = None
        self.status_text = ""
        # Called synchronously: on_final(segment) when a line's text is final, on_translated(id, tr, failed)
        # when its final translation (or, failed=True, the error shown in its place) is on screen.
        self.on_final: list = []
        self.on_translated: list = []
        # on_drop(id) when a line came to nothing, on_clear() when the captions were cleared.
        self.on_drop: list = []
        # on_label(id, speaker, guess) when a line's speaker was decided (or changed by a regroup or a rename).
        self.on_label: list = []
        self.on_clear: list = []
        # on_lost(seconds) for audio the speech service never got (it fell behind, or the line was down).
        self.on_lost: list = []
        # echo(start, end) -> True when a 「我」 line there is the others' voice heard by the microphone
        # (lib/live/echo.py; set by the hub only while two channels listen). Such a line is dropped.
        self.echo: Optional[Callable[[float, float], bool]] = None
        self._seg_seq = 0
        self._lines: dict = {}
        self._tasks: set = set()

    # ---- state (session.rs) ----

    def _find(self, id: int) -> Optional[Segment]:
        return next((s for s in reversed(self.segments) if s.id == id), None)

    def _send(self, seg: Segment) -> None:
        self.emit({"type": "caption", **asdict(seg)})

    def _upsert(self, seg: Segment) -> None:
        cur = self._find(seg.id)
        if cur is not None:
            self.segments[self.segments.index(cur)] = seg
        else:
            self.segments.append(seg)
            if len(self.segments) > MAX_SEGMENTS:
                del self.segments[0]
        self._send(seg)

    def _set_text(self, id: int, text: str, final: bool, end: Optional[float] = None, lang: str = "") -> Segment:
        """A caption's text in its language, keeping the translation it has (an early translation stays
        under a line that is still growing)."""
        cur = self._find(id) or Segment(id, seg=self.seg)
        seg = replace(cur, text=text, final=final, end=cur.end if end is None else end, lang=lang)
        self._upsert(seg)
        return seg

    def _set_tr(self, id: int, tr: str) -> None:
        seg = self._find(id)
        if seg is not None:
            seg.tr = tr
            self._send(seg)

    def context(self, before_id: Optional[int] = None, n: Optional[int] = None) -> list:
        """The last `n` (default context_lines) lines of the meeting before caption `before_id` (all of
        it when None), in order: what others said and what the user read aloud."""
        n = self.context_lines if n is None else n

        def keep(i: int) -> bool:
            return before_id is None or i < before_id

        lines = [s for s in self.segments if s.final and s.text and keep(s.id)]
        # A reply sent after caption k comes before caption k+1, so it counts when k < before.
        lines += [m for m in self.my_lines if keep(m.id)]
        lines.sort(key=lambda s: (s.id, s.who == "me"))
        return [("Me: " if s.who == "me" else "Them: ") + s.text for s in lines[max(len(lines) - n, 0):]]

    def label(self, id: int, speaker: str, guess: bool) -> None:
        """A line's speaker (lib/live/speakers.py); also for lines already scrolled out of memory."""
        seg = self._find(id)
        if seg is not None and (seg.speaker, seg.guess) != (speaker, guess):
            seg.speaker, seg.guess = speaker, guess
            self._send(seg)
        for cb in self.on_label:
            cb(id, speaker, guess)

    def lost(self, seconds: float) -> None:
        for cb in self.on_lost:
            cb(seconds)

    def status(self, text: str) -> None:
        self.status_text = text
        self.emit({"type": "status", "text": text})

    def clear(self) -> None:
        self.segments.clear()
        self.my_lines.clear()
        self.emit({"type": "clear"})
        for cb in self.on_clear:
            cb()

    # ---- replies (llm.rs spawn_reply) ----

    def compose_reply(self, zh: str) -> int:
        """Turn typed Chinese into English to read aloud. A newer reply replaces this one: the older
        one is cancelled (no more cost, no events, not remembered). Returns the new reply's id; the
        work runs as a task."""
        if self._reply_task is not None and not self._reply_task.done():
            self._reply_task.cancel()
        self._reply_seq += 1
        id = self._reply_seq
        self.reply = {"id": id, "zh": zh, "en": "", "done": False}
        self.emit({"type": "reply", **self.reply})
        task = self._reply_task = asyncio.create_task(self._reply(id, zh))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return id

    def _show_reply(self, id: int, en: str, done: bool) -> None:
        if self.reply is None or self.reply["id"] != id:
            return
        self.reply = {"id": id, "zh": self.reply["zh"], "en": en, "done": done}
        self.emit({"type": "reply", **self.reply})

    async def _reply(self, id: int, zh: str) -> None:
        mine, theirs = langs.mine(self.target), langs.theirs(self.listen)
        system = system_blocks(reply_system(mine, theirs), parse_glossary(self.glossary), self.script)
        user = reply_user(self.context(None), zh, mine)
        try:
            en = langs.taiwan((await self.compose(system, user, lambda part: self._show_reply(id, langs.taiwan(part, theirs), False))).strip(), theirs)
        except TranslateError as e:
            return self._show_reply(id, f"[Failed: {e}]", True)
        except Exception as e:
            return self._show_reply(id, f"[Failed: {type(e).__name__}]", True)
        self._show_reply(id, en, True)
        self.my_lines.append(Segment(self.segments[-1].id if self.segments else 0, who="me", text=en, final=True))

    # ---- caption bookkeeping (captions.rs) ----

    def open(self, start: float, who: str = "them") -> int:
        """Speech began `start` seconds into the recording on channel `who`: a new gray line.
        The user's own lines carry the speaker name ME."""
        self._seg_seq = max(self._seg_seq, self.segments[-1].id if self.segments else 0) + 1
        id = self._seg_seq
        self._upsert(Segment(id, start=start, end=start, seg=self.seg, who=who, speaker=ME if who == "me" else None, text="…"))
        self._lines[id] = Line(self.clock())
        return id

    def _language(self, id: int, text: str, detected: Optional[str]) -> tuple:
        """(text in Traditional Chinese where it is Chinese, its language). The user's own channel is
        recognized in whatever language they speak (their language, or the others' when reading a reply)."""
        cur = self._find(id)
        listen = "auto" if cur is not None and cur.who == "me" else self.listen
        lang = langs.line_lang(listen, text, detected)
        return langs.taiwan(text, lang), lang

    def _translates(self, id: int, lang: str) -> bool:
        """The user's own lines are never translated; the others' as langs.translates says."""
        cur = self._find(id)
        return (cur is None or cur.who != "me") and langs.translates(lang, self.target)

    def interim(self, id: int, text: str) -> None:
        """The sentence so far (gray). Translated early when it keeps growing."""
        text, lang = self._language(id, text, None)
        self._set_text(id, text, False, lang=lang)
        now = self.clock()
        line = self._lines.setdefault(id, Line(now))
        if self._translates(id, lang) and line.wants_early(text, now):
            seq, stop = line.start(text, True, now)
            self._spawn(id, text, seq, stop, True)

    def finish(self, id: int, text: str, end: float, lang: Optional[str] = None) -> None:
        """Final text for a line whose speech ended `end` seconds into the recording; empty text drops
        the line. `lang`: the language the recogniser detected (None = it does not say). Non-empty
        text is translated unless langs.translates says no; then tr stays "" and no model is called."""
        text = text.strip()
        if not text:
            return self.drop(id)
        cur = self._find(id)
        if cur is not None and cur.who == "me" and self.echo is not None and self.echo(cur.start, end):
            return self.drop(id)
        text, lang = self._language(id, text, lang)
        seg = self._set_text(id, text, True, end, lang)
        for cb in self.on_final:
            cb(seg)
        if not self._translates(id, lang):
            self._forget(id)
            if seg.tr:
                self._set_tr(id, "")
            return
        now = self.clock()
        seq, stop = self._lines.setdefault(id, Line(now)).start(text, False, now)
        self._spawn(id, text, seq, stop, False)

    def drop(self, id: int) -> None:
        """Drop a caption that came to nothing (a hypothesis with no final text)."""
        self.segments[:] = [s for s in self.segments if s.id != id]
        self.emit({"type": "caption-remove", "id": id})
        self._forget(id)
        for cb in self.on_drop:
            cb(id)

    def fail(self, id: int, msg: str) -> None:
        """Show an error in place of a line's text, without translating it."""
        cur = self._find(id) or Segment(id, seg=self.seg)
        self._upsert(replace(cur, text=f"〔{msg}〕", tr="", final=True))
        self._forget(id)

    def _forget(self, id: int) -> None:
        line = self._lines.pop(id, None)
        if line is not None:
            line.cancel_below(_SEQ_MAX)

    async def drain(self) -> None:
        """Wait for every translation still running."""
        while self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

    def _spawn(self, id: int, text: str, seq: int, stop, early: bool) -> None:
        task = asyncio.create_task(self._translate(id, text, seq, stop, early))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _translate(self, id: int, text: str, seq: int, stop, early: bool) -> None:
        system = system_blocks(listen_system(self.target), parse_glossary(self.glossary), self.script)
        user = listen_user(self.context(id), text, early, self.target)
        try:
            try:
                tr = await self.translate(system, user, lambda part: self._show(id, seq, stop, part, early, False), stop, early)
            except TranslateError as e:
                # An early failure is ignored: the final translation will come.
                if not early:
                    self._show(id, seq, stop, f"〔{e}〕", False, True, failed=True)
            else:
                self._show(id, seq, stop, tr, early, True)
        finally:
            line = self._lines.get(id)
            if line is not None and line.done(seq):
                del self._lines[id]

    def _show(self, id: int, seq: int, stop, tr: str, early: bool, complete: bool, failed: bool = False) -> bool:
        """Put request `seq`'s translation under the line if it should be there; True if it was."""
        if stop.is_set() or (early and not reads_as_subtitle(tr, self.target)):
            return False
        line = self._lines.get(id)
        if line is None or not line.accept(seq, len(tr), complete):
            return False
        self._set_tr(id, tr)
        if complete and not early:
            for cb in self.on_translated:
                cb(id, tr, failed)
        return True
