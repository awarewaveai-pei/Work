# Ported from OwnVoice Meet src-tauri/src/captions.rs (Apache-2.0, https://github.com/Zaious/ownvoice-meet, 08e3ab3).
"""Per-line translation bookkeeping: early translation of long sentences, numbered requests, a finished
request cancels older ones, an older request never overwrites a newer one. Time (`now`, seconds) comes
from the caller."""
import re
import threading

# A sentence still growing after this long is translated before it ends.
EARLY_AFTER = 4.0
# At most one early translation of a line this often.
EARLY_EVERY = 2.0
# Shorter interim text is not worth an early translation.
EARLY_MIN_CHARS = 20

_SEQ_MAX = 2**64 - 1


class Line:
    def __init__(self, now: float):
        self.opened = now
        self.early_at = None
        self.early_text = ""
        # The last request number given out.
        self.seq = 0
        # The request whose Chinese is on screen, and its length in characters.
        self.shown_seq = 0
        self.shown_len = 0
        self.running = []  # [(seq, threading.Event)]
        self.finished = False

    def wants_early(self, text: str, now: float) -> bool:
        return (
            not self.finished
            and now - self.opened >= EARLY_AFTER
            and (self.early_at is None or now - self.early_at >= EARLY_EVERY)
            and text != self.early_text
            and len(text) >= EARLY_MIN_CHARS
        )

    def start(self, text: str, early: bool, now: float):
        """Number a new request. The final one cancels every early one."""
        if early:
            self.early_at = now
            self.early_text = text
        else:
            self.finished = True
            self.cancel_below(_SEQ_MAX)
        self.seq += 1
        stop = threading.Event()
        self.running.append((self.seq, stop))
        return self.seq, stop

    def cancel_below(self, seq: int) -> None:
        kept = []
        for s, stop in self.running:
            if s < seq:
                stop.set()
            else:
                kept.append((s, stop))
        self.running = kept

    def accept(self, seq: int, length: int, complete: bool) -> bool:
        """Whether request `seq`'s Chinese (`length` characters, complete or still streaming) goes on
        screen. A request still streaming waits until it is as long as the text it would replace."""
        if seq < self.shown_seq or (not complete and seq != self.shown_seq and length < self.shown_len):
            return False
        self.shown_seq = seq
        self.shown_len = length
        if complete:
            self.cancel_below(seq)
        return True

    def done(self, seq: int) -> bool:
        """Request `seq` ended; true when nothing more will happen to the line."""
        self.running = [(s, stop) for s, stop in self.running if s != seq]
        return self.finished and not self.running


def reads_as_subtitle(zh: str) -> bool:
    """An early translation is a guess at half a sentence; one that came back as notes or English
    (more English words than Chinese characters, or several lines) is not shown, and the final one
    will come."""
    han = sum(1 for c in zh if "一" <= c <= "鿿")
    words = len(re.findall(r"[A-Za-z]+", zh))
    return "\n" not in zh.strip() and han > 0 and han >= words
