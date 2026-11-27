# Ported from OwnVoice Meet src-tauri/src/sentences.rs (Apache-2.0, https://github.com/Zaious/ownvoice-meet, 08e3ab3),
# which itself ports parts of LiveCaptions-Translator (Apache-2.0, see NOTICE.md).
"""Turns a rolling block of recognized text into caption lines: a gray line for what is being said,
and a finished (translated) line for each sentence once it has settled.

Gemini Live only finishes a line when the speaker pauses; speech without pauses (a read-out script, a
video) grows one hypothesis for minutes. Its interim text is the whole turn so far, revised as
recognition firms up, the same shape as Windows Live Captions' text, which this tracker was written
for. The place reached is found by words (ignoring case and punctuation), and a sentence end only
counts once it has stayed put. Changes from the Rust source: `skip()` is not ported (nothing runs
before listening here); byte lengths are UTF-8 lengths of str; `update(..., final=True)` finishes
every word now (Gemini ended the turn, or listening stopped); `clean` also drops spaces between two
Chinese or Japanese characters (`_cj_spaces`)."""
from dataclasses import dataclass

EOS = ".?!。？！"
# A sentence shorter than this many UTF-8 bytes ("OK.", "Yes.") joins the next one.
SHORT_BYTES = 10
# A line piece at least this long ends a sentence where the text breaks the line.
MEDIUM_BYTES = 40
# A sentence end followed by more words counts once it has stayed this long (seconds).
SETTLE = 1.5
# Nothing new for this long and the last sentence has its end: it is finished.
STABLE = 1.5
# Nothing new for this long without a sentence end: finished anyway.
QUIET = 3.0
# Finished words remembered to find the place again in the next update.
ANCHOR_WORDS = 8

INTERIM, FINAL, DROP = "interim", "final", "drop"
_DIGITS = "0123456789"


def _blen(s: str) -> int:
    return len(s.encode("utf-8"))


def is_cj(ch: str) -> bool:
    o = ord(ch)
    return (0x4E00 <= o <= 0x9FFF or 0x3400 <= o <= 0x4DBF or 0x3000 <= o <= 0x303F or 0x3040 <= o <= 0x309F
            or 0x30A0 <= o <= 0x30FF or 0x31F0 <= o <= 0x31FF or 0x3200 <= o <= 0x32FF or 0x3300 <= o <= 0x33FF)


@dataclass
class Word:
    start: int
    end: int      # after the word and the sentence-end punctuation right after it
    norm: str     # lowercase
    eos: bool


def words(text: str) -> list:
    """The words of a cleaned text. A Chinese or Japanese character counts as a word."""
    n = len(text)
    out = []
    i = 0
    while i < n:
        c = text[i]
        if not c.isalnum():
            i += 1
            continue
        j = i + 1
        if not is_cj(c):
            # Letters and digits, an apostrophe between letters ("don't"), a point or comma between digits.
            while j < n:
                d = text[j]
                nxt = text[j + 1] if j + 1 < n else ""
                prev = text[j - 1]
                joins = (d in "'’" and nxt.isalpha() and prev.isalpha()) or \
                        (d in ".," and nxt != "" and nxt in _DIGITS and prev in _DIGITS)
                if (d.isalnum() and not is_cj(d)) or joins:
                    j += 1
                else:
                    break
        norm = text[i:j].lower()
        end, eos = j, False
        while j < n and text[j] in EOS:
            eos = True
            j += 1
            end = j
        out.append(Word(i, end, norm, eos))
        i = j
    return out


def clean(raw: str) -> str:
    """Join acronyms, one space after Latin punctuation and none around CJK punctuation, none between
    two Chinese or Japanese characters, line breaks into sentence ends or dashes."""
    t = _acronyms(raw, False)
    t = _acronyms(t, True)
    t = _punctuation_spaces(t)
    t = _cj_spaces(t)
    return _replace_newlines(t, MEDIUM_BYTES).strip()


def _cj_spaces(s: str) -> str:
    """Gemini's interim Chinese has spaces where its chunks meet ("今天我 們討 論新"); the final text has none."""
    out = []
    for i, ch in enumerate(s):
        if ch == " " and out and is_cj(out[-1]):
            j = i
            while j < len(s) and s[j] == " ":
                j += 1
            if j < len(s) and is_cj(s[j]):
                continue
        out.append(ch)
    return "".join(out)


def _acronyms(s: str, before_word: bool) -> str:
    """"U.S" -> "US" (and "J.Smith" -> "J Smith" with before_word); only after a single letter, so a
    sentence ending in "OK." or "AWS." keeps its period."""
    c = s
    n = len(c)

    def skip_space(i):
        while i < n and c[i].isspace():
            i += 1
        return i

    out = []
    i = 0
    while i < n:
        if "A" <= c[i] <= "Z" and (i == 0 or not c[i - 1].isalpha()):
            dot = skip_space(i + 1)
            if dot < n and c[dot] == ".":
                k = skip_space(dot + 1)
                if k < n and "A" <= c[k] <= "Z" and (k + 1 < n and c[k + 1].isascii() and c[k + 1].isalpha()) == before_word:
                    out.append(c[i])
                    if before_word:
                        out.append(" ")
                    out.append(c[k])
                    i = k + 1
                    continue
        out.append(c[i])
        i += 1
    return "".join(out)


def _punctuation_spaces(s: str) -> str:
    n = len(s)
    out = []
    i = 0
    while i < n:
        ch = s[i]
        latin = ch in ".!?,"
        cjk = ch in "。！？，、"
        in_number = ch in ".," and i > 0 and s[i - 1] in _DIGITS and i + 1 < n and s[i + 1] in _DIGITS
        if (latin or cjk) and not in_number:
            while out and out[-1].isspace():
                out.pop()
            out.append(ch)
            if latin:
                out.append(" ")
            i += 1
            while i < n and s[i].isspace():
                i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def _replace_newlines(text: str, threshold: int) -> str:
    parts = [p.strip() for p in text.split("\n")]
    out = []
    for i, p in enumerate(parts):
        out.append(p)
        if i + 1 == len(parts):
            break
        if not p:
            continue
        long, cj = _blen(p) >= threshold, is_cj(p[-1])
        out.append("。" if long and cj else ". " if long else "——" if cj else "—")
    return "".join(out)


class Tracker:
    """Follows the text from one update to the next. `update(raw, now)` returns events:
    (INTERIM, text) the gray line; (FINAL, text) a finished sentence; (DROP, None) the gray line came to nothing."""

    def __init__(self):
        self.anchor = []     # the last finished words (lowercase)
        self.pending = []    # the unfinished words at the last update: (norm, eos)
        self.since = []      # since when everything up to each pending word has stayed the same
        self.open = ""       # the gray line's text

    def update(self, raw: str, now: float, final: bool = False) -> list:
        text = clean(raw)
        ws = words(text)
        out = []
        if not ws:
            return out
        start = self._resume_at(ws)
        cur = [(w.norm, w.eos) for w in ws[start:]]
        same = 0
        for a, b in zip(self.pending, cur):
            if a != b:
                break
            same += 1
        self.since = self.since[:same] + [now] * (len(cur) - same)
        self.pending = cur

        # How many of the unfinished words are finished now.
        n = len(self.pending)
        quiet_for = now - self.since[-1] if self.since else 0.0
        ends = bool(self.pending) and self.pending[-1][1]
        if n > 0 and (final or (ends and quiet_for >= STABLE) or quiet_for >= QUIET):
            done = n
        else:
            # The last settled sentence end with more words after it.
            done = next((j + 1 for j in range(n - 2, -1, -1)
                         if self.pending[j][1] and now - self.since[j] >= SETTLE), 0)

        def piece(a, b):
            return text[ws[start + a].start:ws[start + b].end].strip()

        # Cut the finished words into sentences; a short one joins the next.
        sentences = []
        frm = 0
        for j in range(done):
            if not self.pending[j][1] and j + 1 < done:
                continue
            if _blen(piece(frm, j)) < SHORT_BYTES and j + 1 < done:
                continue
            sentences.append((frm, j))
            frm = j + 1
        if sentences:
            a, b = sentences[-1]
            if _blen(piece(a, b)) < SHORT_BYTES and done < n:
                # A short last sentence waits for the next one ("OK." before "So we...").
                sentences.pop()
                done = a
            elif len(sentences) > 1 and _blen(piece(a, b)) < SHORT_BYTES:
                # Finished with a short one ("...today. OK."): it joins the one before.
                sentences.pop()
                sentences[-1] = (sentences[-1][0], b)
        for a, b in sentences:
            out.append((FINAL, piece(a, b)))
        if done > 0:
            self._remember(w[0] for w in self.pending[:done])
            del self.pending[:done]
            del self.since[:done]

        finished_now = bool(out)
        open_ = text[ws[start + done].start:].strip() if self.pending else ""
        if not open_:
            if self.open and not finished_now:
                out.append((DROP, None))
            self.open = ""
        elif open_ != self.open or finished_now:
            self.open = open_
            out.append((INTERIM, open_))
        return out

    def _remember(self, norms) -> None:
        self.anchor.extend(norms)
        del self.anchor[:max(0, len(self.anchor) - ANCHOR_WORDS)]

    def follows(self, raw: str) -> bool:
        """Whether the place reached is found in this text (always, before anything finished)."""
        return not self.anchor or self._find(words(clean(raw))) is not None

    def _find(self, ws: list):
        """Index after the finished words in `ws`, None if they are not there."""
        if not self.anchor:
            return 0
        # The end of the finished words, looked for from the end; fewer of them if the text was revised.
        for k in (len(self.anchor), 5, 3):
            if k > len(self.anchor) or k == 0 or len(ws) < k:
                continue
            tail = self.anchor[-k:]
            for i in range(len(ws) - k, -1, -1):
                if [w.norm for w in ws[i:i + k]] == tail:
                    return i + k
        return None

    def _resume_at(self, ws: list) -> int:
        """Index of the first unfinished word in this update."""
        found = self._find(ws)
        if found is not None:
            return found
        # Lost the place (the text started over, or was rewritten): go on from the start of its last
        # sentence, and remember the words before it as finished.
        last_end = next((j + 1 for j in range(len(ws) - 2, -1, -1) if ws[j].eos), 0)
        self.anchor = []
        self._remember(w.norm for w in ws[:last_end])
        self.pending = []
        self.since = []
        return last_end
