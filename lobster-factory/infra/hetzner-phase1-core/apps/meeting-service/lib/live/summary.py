# Ported from OwnVoice Meet src-tauri/src/batch.rs and summary.rs (Apache-2.0, https://github.com/Zaious/ownvoice-meet, 08e3ab3).
"""The live summary: a short list of the main points so far, in Traditional Chinese, brought up to date
every few minutes from the finished caption lines since the last time and the summary before it.
It costs money on every update, so it exists only when the page asked for it (`begin`): a Summary
that is not enabled never holds a line, so it can never call the model. It sums up what others
said; it never answers for the user. Event, also in the hub's snapshot:
  {"type":"summary","text":str,"updated":"HH:MM","lines":int,"working":bool,"error":str,"enabled":bool}
Must be used from the running asyncio loop (an update is a task)."""
import asyncio
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Awaitable, Callable, Optional

from . import idle
from .prompts import summary_user
from .translate import TranslateError

# Fewer new lines than this are not worth a batch (a quiet room, a short pause).
MIN_LINES = 3
DEFAULT_EVERY_MIN = 5.0


@dataclass
class FinishedLine:
    id: int
    at: datetime
    en: str
    # The final translation; empty while it is still on its way.
    zh: str = ""


def due(pending: int, since_last: float, every: Optional[float]) -> bool:
    """Is a batch due: enough new lines, and the interval (seconds; None = never) since the last one has passed?"""
    return every is not None and since_last >= every and pending >= MIN_LINES


def transcript(lines: list) -> str:
    """The batch as the model reads it: time, English, then the Chinese."""
    rows = []
    for l in lines:
        if not l.en.strip():
            continue
        rows.append(f"[{l.at.strftime('%H:%M')}] {l.en.strip()}" + (f"\n  （{l.zh.strip()}）" if l.zh.strip() else ""))
    return "\n".join(rows)


class Summary:
    def __init__(self, complete: Callable[[list, str], Awaitable[str]], system: Callable[[], list], emit: Callable[[dict], None],
                 clock: Callable[[], float] = time.monotonic, now: Callable[[], datetime] = datetime.now):
        """`await complete(system_blocks, user) -> text`; `system()` gives the system blocks at call time."""
        self.complete, self.system, self.emit, self.clock, self.now = complete, system, emit, clock, now
        # Called with (text, updated) after every successful update; set per listening by the hub.
        self.on_update: Optional[Callable[[str, str], None]] = None
        self.enabled = False
        self.every_min = DEFAULT_EVERY_MIN
        self.pending: list = []
        self.last = clock()
        self.text = ""
        self.updated = ""
        self.lines = 0
        self.error = ""
        self.task: Optional[asyncio.Task] = None
        self._generation = 0

    # ---- state ----

    def view(self) -> dict:
        return {"type": "summary", "text": self.text, "updated": self.updated, "lines": self.lines,
                "working": self.task is not None and not self.task.done(), "error": self.error,
                "enabled": self.enabled}

    def begin(self, every_min: float) -> None:
        """A new listening with the summary on: nothing of the previous one carries over (an update
        still running for it is discarded when it returns)."""
        self._generation += 1
        self.pending.clear()
        self.text, self.updated, self.lines, self.error = "", "", 0, ""
        self.enabled = True
        self.every_min = every_min
        self.last = self.clock()
        self.emit(self.view())

    def clear(self) -> None:
        """The captions were cleared: start over (an update still running is discarded when it returns)."""
        self._generation += 1
        self.pending.clear()
        self.last = self.clock()
        self.text, self.updated, self.lines, self.error = "", "", 0, ""
        self.emit(self.view())

    # ---- lines (batch.rs) ----

    def line_finished(self, id: int, en: str) -> None:
        if not self.enabled:
            return
        for l in self.pending:
            if l.id == id:
                l.en = en
                return
        self.pending.append(FinishedLine(id, self.now(), en))

    def line_translated(self, id: int, zh: str) -> None:
        for l in self.pending:
            if l.id == id:
                l.zh = zh
                return

    def requeue(self, lines: list) -> None:
        """Lines a batch could not take this time (it was busy): back to the front of the next one."""
        self.pending[:0] = lines

    def flush(self, min_lines: int = MIN_LINES) -> bool:
        """Hand over what is waiting now, if at least `min_lines`."""
        if len(self.pending) < min_lines:
            return False
        lines, self.pending = self.pending, []
        self.last = self.clock()
        self._on_batch(lines)
        return True

    def tick(self) -> None:
        """Every few seconds: is a batch due?"""
        if due(len(self.pending), self.clock() - self.last, idle.minutes(self.every_min)):
            self.flush(MIN_LINES)

    async def finish(self) -> None:
        """Listening stopped: what is left gets one last update (any number of lines but 0), then no more lines are taken."""
        if not self.enabled:
            return
        self.enabled = False
        generation = self._generation
        self.emit(self.view())
        await self._wait()
        # A new listening began while the last update was still running: its lines are not ours to send.
        if generation == self._generation and self.flush(1):
            await self._wait()

    async def _wait(self) -> None:
        if self.task is not None and not self.task.done():
            await asyncio.shield(self.task)

    # ---- the update (summary.rs) ----

    def _on_batch(self, lines: list) -> None:
        if self.task is not None and not self.task.done():
            # Still writing the last one: these lines go into the next.
            return self.requeue(lines)
        self.task = asyncio.ensure_future(self._run(lines, self._generation, self.on_update))
        self.emit(self.view())

    async def _run(self, lines: list, generation: int, on_update) -> None:
        text, error = "", ""
        try:
            text = (await self.complete(self.system(), summary_user(self.text, transcript(lines)))).strip()
            if not text:
                error = "摘要失敗：模型沒有回傳內容"
        except TranslateError as e:
            error = f"摘要失敗：{e}"
        except Exception as e:
            error = f"摘要失敗：{type(e).__name__}"
        if generation == self._generation:
            if error:
                self.error = error
                self.requeue(lines)
            else:
                self.text, self.updated, self.error = text, self.now().strftime("%H:%M"), ""
                self.lines += len(lines)
                if on_update is not None:
                    on_update(self.text, self.updated)
        # `working` reads the task, which is still this one until it returns: report it done.
        self.emit({**self.view(), "working": False})
