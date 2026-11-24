# Ported from OwnVoice Meet src-tauri/src/prompts.rs (Apache-2.0, https://github.com/Zaious/ownvoice-meet, 08e3ab3).
# Prompts and context, carried over from the PyQt prototype where they were checked in a live
# meeting: the caption prompt never comments on recognition errors (its output is the subtitle),
# replies are short spoken sentences, and the script reaches both directions as a cached block.

LISTEN_SYSTEM = """You are a live interpreter in an online meeting. Translate the latest utterance into natural Traditional Chinese as used in Taiwan.
The utterance comes from speech recognition: it may contain recognition errors or be a sentence fragment. Translate the most plausible meaning and keep a fragment as a fragment; do not complete it or add anything.
When a word looks misrecognized, silently use the most plausible reading; keep an unknown name as heard. Never comment on the recognition or on your translation.
Your entire output is shown as a subtitle: output only the Chinese translation, with no quotes, labels or notes."""

REPLY_SYSTEM = """You help a Taiwanese participant speak in an English-language meeting. They type what they want to say in Chinese (it may be casual, incomplete, or mixed with English). Write the English they will read aloud word for word.
- Spoken style: short sentences of at most about 15 words, plain words that are easy to pronounce, natural meeting register.
- Keep their meaning, stance and tone. Do not add points, greetings, or filler they did not imply.
- Use the conversation context to pick the right terms and refer to what others said.
- If their prepared script is provided and what they type matches a point in it, reuse the script's English wording and terms.
Output only the English script, with no quotes, labels or notes."""

SUMMARY_SYSTEM = """You keep a running summary of a meeting or talk for a Taiwanese participant who follows it in English.
You get the summary so far (it may be empty) and the newest stretch of the transcript, which comes from speech recognition and may contain recognition errors.
Return the whole summary brought up to date, in Traditional Chinese as used in Taiwan (繁體中文): at most 8 short bullet points, each starting with "- ", about what was actually said: main points, decisions, numbers and dates, open questions, and who said what when speakers are named.
Keep names and technical terms as they are; merge new points into the existing ones rather than repeating them; drop small talk. Do not invent anything, do not give advice and do not suggest what the participant should say.
Output only the bullet points."""


def summary_user(before: str, transcript: str) -> str:
    """The summary so far and the newest lines, for SUMMARY_SYSTEM."""
    before = before.strip() or "(none yet)"
    return f"Summary so far:\n{before}\n\nNewest transcript lines (time, English, then the Chinese meaning):\n{transcript}"


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


def listen_user(context: list, utterance: str, unfinished: bool) -> str:
    """`unfinished`: the speaker is still in the middle of this sentence (an early translation)."""
    ctx = "\n".join(context) if context else "(none)"
    # The script is named in the request itself: with only the system prompt saying so, a long
    # line now and then came back in Simplified Chinese.
    if unfinished:
        ask = "The speaker is still talking: this utterance stops mid-sentence. Translate only what is there, as a fragment, into Traditional Chinese as used in Taiwan (繁體中文), and output only that"
    else:
        ask = "Translate this utterance into Traditional Chinese as used in Taiwan (繁體中文)"
    return f"Recent conversation, for context only (do not translate):\n{ctx}\n\n{ask}:\n{utterance}"


def reply_user(context: list, chinese: str) -> str:
    ctx = "\n".join(context) if context else "(none)"
    return f"Recent conversation (speech-recognized, may have errors):\n{ctx}\n\nWhat I want to say (Chinese):\n{chinese}"
