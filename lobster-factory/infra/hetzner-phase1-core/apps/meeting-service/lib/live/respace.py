# Ported from OwnVoice Meet src-tauri/src/gemini.rs (Apache-2.0, https://github.com/Zaious/ownvoice-meet, 08e3ab3).
"""Puts back spaces the live hypothesis drops. On long unbroken speech Gemini's interim text glues
words it has already sent apart ("old built servers once every" becomes "oldbuild servers
onceevery"; the final text is spaced correctly). A token is split where the previous hypothesis
of the line had, at the same place, two words that it runs together: the first exactly, the
second starting the same way (it may have been revised, as built became build)."""


class Respace:
    def __init__(self):
        self.prev = []

    def fix(self, text: str) -> str:
        words = []
        for token in (t for t in text.split(" ") if t):
            rest = token
            while True:
                b = self._split(len(words), rest)
                if b is None:
                    break
                words.append(rest[: len(rest) - len(b)])
                rest = b
            words.append(rest)
        self.prev = list(words)
        return " ".join(words)

    def _split(self, at: int, token: str):
        """The second part, if `token` at word position `at` is the previous hypothesis's words at
        `at` and `at + 1` run together."""
        if at + 1 >= len(self.prev):
            return None
        a, b = self.prev[at], self.prev[at + 1]
        if not token.startswith(a):
            return None
        rest = token[len(a):]
        common = 0
        for x, y in zip(rest, b):
            if x != y:
                break
            common += 1
        return rest if common >= 2 else None

    def reset(self) -> None:
        self.prev.clear()
