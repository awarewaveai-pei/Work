# Ported from OwnVoice Meet src-tauri/src/prompts.rs (Apache-2.0, https://github.com/Zaious/ownvoice-meet, 08e3ab3).
# Prompts and context, carried over from the PyQt prototype where they were checked in a live
# meeting: the caption prompt never comments on recognition errors (its output is the subtitle),
# replies are short spoken sentences, and the script reaches both directions as a cached block.

from . import langs


def _name(code: str) -> str:
    """How a model is told the language (the table's prompt name)."""
    return langs.find(code).prompt


def _short(code: str) -> str:
    """The language as an adjective in a sentence ("the Chinese translation")."""
    lang = langs.find(code)
    return "Chinese" if lang.to_taiwan else lang.prompt


def _asked(code: str) -> str:
    """The language named in a request; Chinese also by its own name: with only the system prompt
    saying so, a long line now and then came back in Simplified Chinese."""
    return _name(code) + (" (繁體中文)" if langs.find(code).to_taiwan else "")


# The prompts take langs.py codes; for zh-TW (mine) and en-US (theirs) they are word for word the
# ones checked in a live meeting (tests/test_live_prompts.py holds those texts).
def listen_system(target: str) -> str:
    return f"""You are a live interpreter in an online meeting. Translate the latest utterance into natural {_name(target)}.
The utterance comes from speech recognition: it may contain recognition errors or be a sentence fragment. Translate the most plausible meaning and keep a fragment as a fragment; do not complete it or add anything.
When a word looks misrecognized, silently use the most plausible reading; keep an unknown name as heard. Never comment on the recognition or on your translation.
Your entire output is shown as a subtitle: output only the {_short(target)} translation, with no quotes, labels or notes."""


def reply_system(mine: str, theirs: str) -> str:
    """`mine`: what the user types in; `theirs`: what they will read aloud (langs.mine / langs.theirs)."""
    t = _short(theirs)
    a = "an" if t[0] in "AEIOU" else "a"
    return f"""You help a Taiwanese participant speak in {a} {t}-language meeting. They type what they want to say in {_short(mine)} (it may be casual, incomplete, or mixed with {t}). Write the {t} they will read aloud word for word.
- Spoken style: short sentences of at most about 15 words, plain words that are easy to pronounce, natural meeting register.
- Keep their meaning, stance and tone. Do not add points, greetings, or filler they did not imply.
- Use the conversation context to pick the right terms and refer to what others said.
- If their prepared script is provided and what they type matches a point in it, reuse the script's {t} wording and terms.
Output only the {t} script, with no quotes, labels or notes."""


def summary_system(mine: str, theirs: str) -> str:
    return f"""You keep a running summary of a meeting or talk for a Taiwanese participant who follows it in {_short(theirs)}.
You get the summary so far (it may be empty) and the newest stretch of the transcript, which comes from speech recognition and may contain recognition errors.
Return the whole summary brought up to date, in {_asked(mine)}: at most 8 short bullet points, each starting with "- ", about what was actually said: main points, decisions, numbers and dates, open questions, and who said what when speakers are named.
Keep names and technical terms as they are; merge new points into the existing ones rather than repeating them; drop small talk. Do not invent anything, do not give advice and do not suggest what the participant should say.
Output only the bullet points."""


def summary_user(before: str, transcript: str, theirs: str = langs.THEIRS, mine: str = langs.MINE) -> str:
    """The summary so far and the newest lines, for summary_system."""
    before = before.strip() or "(none yet)"
    return f"Summary so far:\n{before}\n\nNewest transcript lines (time, {_short(theirs)}, then the {_short(mine)} meaning):\n{transcript}"


def parse_glossary(text: str) -> list:
    """`中文 = English` per line; `#` starts a comment."""
    out = []
    for line in text.split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        zh, sep, en = line.partition("=")
        if not sep:
            continue
        zh, en = zh.strip(), en.strip()
        if zh and en:
            out.append((zh, en))
    return out


def system_blocks(instructions: str, glossary: list, script: str) -> list:
    """System blocks: instructions (+ glossary), then the script as a separate cached block."""
    text = instructions
    if glossary:
        text += "\n\nGlossary (always use these renderings):\n"
        for zh, en in glossary:
            text += f"- {zh} = {en}\n"
    blocks = [{"type": "text", "text": text}]
    script = script.strip()
    if script:
        blocks.append({
            "type": "text",
            "text": (
                "The participant's prepared script for today's meeting follows. It is reference material for topic, "
                "terminology, names and what they intend to say; others may refer to it. Never translate or recite it "
                f"unless asked.\n<script>\n{script}\n</script>"
            ),
            # The script is the same on every call: cache the prefix up to here.
            "cache_control": {"type": "ephemeral"},
        })
    return blocks


def listen_user(context: list, utterance: str, unfinished: bool, target: str = langs.MINE) -> str:
    """`unfinished`: the speaker is still in the middle of this sentence (an early translation)."""
    ctx = "\n".join(context) if context else "(none)"
    if unfinished:
        ask = f"The speaker is still talking: this utterance stops mid-sentence. Translate only what is there, as a fragment, into {_asked(target)}, and output only that"
    else:
        ask = f"Translate this utterance into {_asked(target)}"
    return f"Recent conversation, for context only (do not translate):\n{ctx}\n\n{ask}:\n{utterance}"


def reply_user(context: list, text: str, mine: str = langs.MINE) -> str:
    ctx = "\n".join(context) if context else "(none)"
    return f"Recent conversation (speech-recognized, may have errors):\n{ctx}\n\nWhat I want to say ({_short(mine)}):\n{text}"
