# Ported from OwnVoice Meet src-tauri/src/gloss.rs (Apache-2.0, https://github.com/Zaious/ownvoice-meet, 08e3ab3).
"""補對照: fill in the missing half of a bilingual script. A line to read in English with no meaning
under it gets its Chinese meaning; a line written in Chinese becomes English to read aloud, with the
Chinese kept as its meaning. Only the lines that need it go to the model, as a numbered JSON list; the
answer is merged back here, so headings, cues, copy blocks and lines that already have a meaning are
never touched. Script format: see the parser in templates/workspace.html."""
import json
from dataclasses import dataclass

from .prompts import system_blocks
from .translate import TranslateError
from .zh import to_taiwan

BATCH = 40

SYSTEM = """You prepare a bilingual script for a Taiwanese participant in an English-language meeting or talk.
You get a JSON list of items. Each has "to": "zh" or "en", and "text".
- to = zh: give the meaning in natural Traditional Chinese as used in Taiwan, as a reading aid. Keep names and technical terms in English where Taiwanese speakers would.
- to = en: write the English the participant will read aloud: short spoken sentences, plain words, their meaning and tone, nothing added.
Answer with only a JSON array of strings, one per item, in the same order. No other text."""


@dataclass
class Need:
    """A line that needs its other half: its index in the script, the prefix to keep ("" or "Q: "),
    the text, and which way to translate (`to_zh`: English line gets Chinese, else Chinese becomes English)."""
    line: int
    prefix: str
    text: str
    to_zh: bool


def is_chinese(s: str) -> bool:
    cjk = sum(1 for c in s if "一" <= c <= "鿿" or "㐀" <= c <= "䶿")
    latin = sum(1 for c in s if c.isascii() and c.isalpha())
    return cjk > 0 and cjk * 2 >= latin


def _lines(script: str) -> list:
    """Rust's str::lines(): split on \\n, drop a trailing \\r on each line and the empty tail."""
    lines = script.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    return [l[:-1] if l.endswith("\r") else l for l in lines]


def plan(script: str) -> list:
    """Lines to fill, in the same terms as the script parser."""
    lines = _lines(script)
    needs = []
    in_block = False
    for i, raw in enumerate(lines):
        line = raw.rstrip()
        if in_block:
            if line.strip() == "```":
                in_block = False
            continue
        if line.startswith("```copy:"):
            in_block = True
            continue
        if not line.strip() or line.startswith(("# ", "## ", "! ", "> ")):
            continue
        prefix, text = ("Q: ", line[3:]) if line.startswith("Q: ") else ("", line)
        # Already has a meaning: the next non-empty line is a "> " line.
        nxt = next((l.rstrip() for l in lines[i + 1:] if l.strip()), None)
        if nxt is not None and nxt.startswith("> "):
            continue
        needs.append(Need(i, prefix, text.strip(), not is_chinese(text)))
    return needs


def merge(script: str, needs: list, answers: list) -> str:
    """Put the answers back: English lines get "> Chinese" under them; Chinese lines become the
    English to read, with "> the Chinese" under it."""
    out = []
    k = 0
    for i, raw in enumerate(_lines(script)):
        if k < len(needs) and needs[k].line == i:
            n = needs[k]
            a = answers[k].strip()
            if n.to_zh:
                out += [raw, f"> {to_taiwan(a)}"]
            else:
                out += [f"{n.prefix}{a}", f"> {n.text}"]
            k += 1
        else:
            out.append(raw)
    text = "\n".join(out)
    return text + "\n" if script.endswith("\n") else text


def _strip_all(t: str, fence: str, end: bool) -> str:
    while (t.endswith(fence) if end else t.startswith(fence)):
        t = t[:-len(fence)] if end else t[len(fence):]
    return t


SYNTAX = ("# ", "## ", "! ", "> ", "Q: ", "```")


def parse_answers(text: str, expect: int, to_zh: list = None) -> list:
    """The model's answer as a list of one-line strings, tolerating a code fence around it.
    `to_zh[i]` False = item i is English to read aloud (checked for script syntax at its start)."""
    t = _strip_all(_strip_all(_strip_all(text.strip(), "```json", False), "```", False), "```", True).strip()
    try:
        v = json.loads(t)
    except ValueError:
        raise TranslateError("模型沒有回傳可讀的清單，請再試一次") from None
    if not isinstance(v, list):
        raise TranslateError("模型沒有回傳清單")
    # One line per answer: a line break inside one would turn the rest into script lines of its own.
    items = [" ".join(x.split()) if isinstance(x, str) else "" for x in v]
    if len(items) != expect or any(not s for s in items):
        raise TranslateError(f"模型回了 {len(items)} 項、需要 {expect} 項，請再試一次")
    # English to read aloud that starts like script syntax would change what its line means.
    if to_zh is not None and any(not z and s.startswith(SYNTAX) for s, z in zip(items, to_zh)):
        raise TranslateError("模型回的英文開頭帶了講稿的標記符號，請再試一次")
    return items


async def fill(complete, glossary: list, script: str) -> tuple:
    """`complete(system, user)` is the model call. Returns (new script, how many lines were filled)."""
    needs = plan(script)
    if not needs:
        return script, 0
    answers = []
    for start in range(0, len(needs), BATCH):
        chunk = needs[start:start + BATCH]
        items = [{"to": "zh" if n.to_zh else "en", "text": n.text} for n in chunk]
        text = await complete(system_blocks(SYSTEM, glossary, ""), json.dumps(items, ensure_ascii=False))
        answers += parse_answers(text, len(chunk), [n.to_zh for n in chunk])
    return merge(script, needs, answers), len(needs)
