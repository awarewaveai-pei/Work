"""lib/live/archive.py：archive.rs／recorder.rs 的測試，加上「寫出的資料夾能被 lib/ownvoice.py 讀回」與存檔開關。"""
import asyncio
import os
import struct
import sys
import tempfile
import time
import unittest
import wave
from datetime import datetime
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib import ownvoice  # noqa: E402
from lib.live import archive as arc  # noqa: E402
from lib.live import hub as hub_mod  # noqa: E402
from lib.live.usage import Usage  # noqa: E402


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def u32(b: bytes, at: int) -> int:
    return struct.unpack_from("<I", b, at)[0]


def samples(path) -> list:
    with open(path, "rb") as f:
        b = f.read()
    return list(struct.unpack(f"<{(len(b) - 44) // 2}h", b[44:]))


META = {"listen": "en-US", "target": "zh-TW", "stt": "local", "channels": 1}


def chunk(value: int, n: int = 1600) -> bytes:
    return struct.pack("<h", value) * n


class TempDir(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.dir = self._tmp.name
        env = mock.patch.dict(os.environ, {"OWNVOICE_SESSIONS_DIR": os.path.join(self.dir, "sessions")})
        env.start()
        self.addCleanup(env.stop)
        # 測試機的剩餘空間不是被測的東西。
        free = mock.patch.object(arc, "MIN_FREE_BYTES", 0)
        free.start()
        self.addCleanup(free.stop)
        self.base = ownvoice.base_dir()


class ArchiveRsPorts(TempDir):
    def test_segment_names_come_from_the_agenda_then_count_on(self):
        agenda = arc.parse_agenda("Keynote\n\n  Session 3A: Digital Libraries \n")
        self.assertEqual(agenda, ["Keynote", "Session 3A: Digital Libraries"])
        self.assertEqual(arc.segment_name(agenda, 0), "Keynote")
        self.assertEqual(arc.segment_name(agenda, 1), "Session 3A: Digital Libraries")
        self.assertEqual(arc.segment_name(agenda, 2), "段落 3")

    def test_file_names_are_safe_on_windows(self):
        self.assertEqual(arc.stem(3, "Session 3A: Digital Libraries"), "03-Session 3A Digital Libraries")
        self.assertEqual(arc.stem(1, 'a/b\\c*?"<>|'), "01-a b c")
        self.assertEqual(arc.stem(12, "  ...  "), "12")
        self.assertEqual(arc.stem(2, "段落 2."), "02-段落 2")
        self.assertEqual(len(arc.stem(1, "x" * 100)), 3 + 60)

    def test_transcript_is_grouped_by_segment_with_times(self):
        wall = datetime(2026, 11, 24, 10, 3)
        segments = [arc.Segment("Keynote", 0, wall), arc.Segment("Q&A", 65, wall)]
        lines = [
            arc.Line(1, start=12, seg=0, text="Welcome to the conference.", tr="歡迎來到研討會。"),
            arc.Line(2, start=30, seg=0, text="  "),
            arc.Line(3, start=3725, seg=1, text="Any questions?", speaker="講者 2"),
        ]
        everything = arc.render("- 開始：x\n", segments, lines)
        self.assertTrue(everything.startswith("# 逐字稿\n\n- 開始：x\n"))
        self.assertIn("## 01 · Keynote（", everything)
        self.assertIn("[00:00:12] Welcome to the conference.\n　歡迎來到研討會。\n", everything)
        self.assertIn("## 02 · Q&A（", everything)
        self.assertIn("00:01:05）", everything)
        self.assertIn("[01:02:05] 講者 2：Any questions?\n\n", everything, "a line still waiting for its translation is kept, with its speaker")
        self.assertEqual(everything.count("["), 2, "an empty line is left out")
        second = arc.render("- 開始：x\n", segments, lines, 1)
        self.assertTrue(second.startswith("# 02 · Q&A"))
        self.assertNotIn("Welcome", second, "a segment's own file holds only its lines")

    def test_a_second_session_in_the_same_minute_gets_its_own_folder(self):
        os.makedirs(os.path.join(self.base, "2026-11-21 1003"))
        self.assertEqual(arc.unique_dir(self.base, "2026-11-21 1003"), os.path.join(self.base, "2026-11-21 1003-2"))


class RecorderRsPorts(TempDir):
    def test_writes_a_playable_wav_and_splits_exactly_between_chunks(self):
        clock = Clock()
        first = os.path.join(self.dir, "01-part.wav")
        w = arc.Wav(first, 16000, clock)
        for _ in range(10):
            clock.t += 0.1
            w.fill_gap(1600)
            w.write(chunk(1000))
        named = os.path.join(self.dir, "01-第一段.wav")
        w.finish(named)  # a split: the first file closes under its segment's name
        second = os.path.join(self.dir, "02-part.wav")
        w = arc.Wav(second, 16000, clock)
        for _ in range(5):
            clock.t += 0.1
            w.fill_gap(1600)
            w.write(chunk(-1000))
        w.finish(second)

        self.assertFalse(os.path.exists(first), "first file renamed to its segment name")
        with open(named, "rb") as f:
            b = f.read()
        self.assertEqual(b[0:4], b"RIFF")
        self.assertEqual(b[8:16], b"WAVEfmt ")
        self.assertEqual(u32(b, 24), 16000)
        self.assertEqual(u32(b, 40), 32000, "1 s of 16-bit mono at 16 kHz, nothing from after the split")
        self.assertEqual(u32(b, 4), 36 + 32000)
        self.assertEqual(len(b), 44 + 32000)
        self.assertTrue(all(s == 1000 for s in samples(named)))
        self.assertEqual(os.path.getsize(second), 44 + 16000, "0.5 s in the second file")
        self.assertTrue(all(s == -1000 for s in samples(second)))

    def test_a_real_break_becomes_silence_but_browser_jitter_does_not(self):
        # Differs from recorder.rs (0.3 s slack): browser audio over a WebSocket jitters, so only a lag
        # of more than 2 s is a break to fill (a page reconnect), and then the whole lag is filled.
        clock = Clock()
        path = os.path.join(self.dir, "gap.wav")
        w = arc.Wav(path, 16000, clock)
        w.fill_gap(1600)
        w.write(chunk(500))  # 0.1 s right away
        clock.t = 1.6        # a second and a half late: jitter, nothing added
        w.fill_gap(1600)
        w.write(chunk(500))
        self.assertEqual(w.data_bytes, 6400)
        clock.t = 3.1        # nothing for a long while: a real break
        w.fill_gap(1600)
        w.write(chunk(500))
        w.fill_gap(0)
        w.finish(path)
        with open(path, "rb") as f:
            b = f.read()
        secs = u32(b, 40) / 2 / 16000
        self.assertTrue(3.0 <= secs < 3.4, f"about 3.1 s of real time, got {secs:.2f} s")
        self.assertEqual(samples(path)[-1], 500, "the audio after the gap comes after the silence")

    def test_a_recording_that_reaches_the_size_limit_continues_in_the_next_segment(self):
        clock, started = Clock(), []
        a = arc.Archive(self.base, [], META, clock=clock, now=lambda: datetime(2026, 11, 24, 10, 3), on_segment=started.append)
        self.addCleanup(a.end)
        with mock.patch.object(arc, "WAV_MAX_BYTES", 6400):
            for _ in range(3):
                clock.t += 0.1
                a.feed(chunk(7))
        self.assertEqual([(s["index"], s["name"]) for s in started], [(2, "段落 2")])
        a.end()
        self.assertEqual(os.path.getsize(os.path.join(a.dir, "01-段落 1.wav")), 44 + 6400)
        self.assertEqual(os.path.getsize(os.path.join(a.dir, "02-段落 2.wav")), 44 + 3200)

    def test_header_sizes_are_kept_up_to_date_while_recording(self):
        path = os.path.join(self.dir, "live.wav")
        w = arc.Wav(path, 16000, Clock())
        w.write(bytes(32000))
        w.sync_header()  # what happens every few seconds
        with open(path, "rb") as f:
            mid = f.read()
        self.assertEqual(u32(mid, 40), 32000, "a file read mid-recording already has its size")
        w.finish(path)


class FolderCompatibility(TempDir):
    def meeting(self, clock: Clock) -> arc.Archive:
        return arc.Archive(self.base, ["收音：測試"], META, clock=clock, now=lambda: datetime(2026, 11, 24, 10, 3))

    @staticmethod
    def speak(a: arc.Archive, clock: Clock, seconds: int) -> None:
        for _ in range(seconds * 10):
            clock.t += 0.1
            a.feed(chunk(300))

    def test_ownvoice_reads_back_a_two_segment_meeting(self):
        clock = Clock()
        a = self.meeting(clock)
        self.speak(a, clock, 2)
        a.line_final(arc.Line(1, text="Hello everyone.", final=True))
        a.line_translated(1, "大家好。", False)
        a.line_final(arc.Line(2, text="Never meant to be kept.", final=True))
        a.drop_line(2)
        a.drop_line(9)
        a.next_segment("Q&A")
        self.speak(a, clock, 1)
        a.line_final(arc.Line(3, seg=1, text="Any questions?", final=True))
        a.end()

        self.assertEqual(ownvoice.sessions(), [{"id": "2026-11-24 1003", "wavs": 2, "transcript": True, "summary": False}])
        text = ownvoice.read_text("latest", "transcript.md")
        self.assertIn("Hello everyone.", text)
        self.assertIn("大家好。", text)
        self.assertIn("Any questions?", text)
        self.assertNotIn("Never meant to be kept.", text)
        self.assertIn("## 02 · Q&A（", text)
        self.assertEqual(sorted(f for f in os.listdir(a.dir) if f.endswith(".wav")), ["01-段落 1.wav", "02-Q&A.wav"])
        self.assertTrue(os.path.exists(os.path.join(a.dir, "02-Q&A.md")))

        for f in os.listdir(a.dir):
            if f.endswith(".wav"):  # join_wavs refuses files written in the last 10 s
                os.utime(os.path.join(a.dir, f), (time.time() - 60,) * 2)
        out = os.path.join(self.dir, "joined.wav")
        self.assertAlmostEqual(ownvoice.join_wavs("latest", out), 3.0)
        with wave.open(out, "rb") as w:
            self.assertEqual((w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()), (1, 2, 16000, 48000))

    def test_a_session_that_never_ended_still_plays(self):
        clock = Clock()
        a = self.meeting(clock)
        self.addCleanup(a.end)
        self.speak(a, clock, 6)
        a.tick()  # the 5 s header write: 6 s of audio declared
        self.speak(a, clock, 1)  # then the process dies, with no end()
        wav = os.path.join(a.dir, "01-段落 1.wav")
        with wave.open(wav, "rb") as w:
            self.assertEqual(w.getnframes(), 6 * 16000)
            self.assertEqual(len(w.readframes(w.getnframes())), 6 * 16000 * 2)

    def test_renaming_a_segment_renames_its_files(self):
        clock = Clock()
        a = self.meeting(clock)
        self.speak(a, clock, 1)
        a.line_final(arc.Line(1, text="Hi.", final=True))
        a.rename_segment("開場\n致詞")
        self.assertEqual(a.info()["name"], "開場 致詞")
        a.end()
        self.assertEqual(sorted(f for f in os.listdir(a.dir) if f not in ("transcript.md", "session.json")),
                         ["01-開場 致詞.md", "01-開場 致詞.wav"])

    def test_session_json_is_written_with_the_transcript_and_read_back(self):
        clock = Clock()
        a = self.meeting(clock)
        self.speak(a, clock, 2)
        a.line_final(arc.Line(1, start=0.25, end=1.5, text="Hello everyone.", tr="早期譯文", final=True))
        a.line_translated(1, "大家好。", False)
        a.line_final(arc.Line(2, start=1.6, end=1.9, text="Gone.", final=True))
        a.drop_line(2)
        a.line_final(arc.Line(3, start=1.7, end=1.95, text="Thanks.", final=True))
        a.line_translated(3, "〔翻譯失敗：逾時〕", True)
        a.dropped_sec = 0.4
        a.end()
        line = {"start": 0.0, "end": 0.0, "seg": 0, "who": "them", "speaker": None, "lang": "", "final": True}
        self.assertEqual(ownvoice.session_lines("latest"), {
            "version": 1, **META,
            "lines": [{**line, "id": 1, "start": 0.25, "end": 1.5, "text": "Hello everyone.", "tr": "大家好。"},
                      {**line, "id": 3, "start": 1.7, "end": 1.95, "text": "Thanks.", "tr": ""}],
            "dropped_sec": 0.4,
            "failed_lines": [{"id": 3, "error": "〔翻譯失敗：逾時〕"}],
        })
        self.assertIn("Thanks.\n　〔翻譯失敗：逾時〕\n", ownvoice.read_text("latest", "transcript.md"), "transcript.md shows the error as before")


class SaveSwitch(unittest.IsolatedAsyncioTestCase):
    """The page asks for saving per listening (`save`); without it nothing is written anywhere."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.base = os.path.join(self._tmp.name, "sessions")
        for p in (mock.patch.dict(os.environ, {"OWNVOICE_SESSIONS_DIR": self.base}),
                  mock.patch.object(arc, "MIN_FREE_BYTES", 0),
                  mock.patch.object(hub_mod.script_store, "load", lambda: {"script": "", "glossary": ""}),
                  mock.patch.object(hub_mod.settings, "get_api_key", lambda: ""),
                  mock.patch.object(hub_mod.stt_local, "run", self.idle_stt),
                  mock.patch.object(hub_mod.stt_local, "Recognizer", self.NoModel)):
            p.start()
            self.addCleanup(p.stop)
        self.hub = hub_mod.Hub(Usage(os.path.join(self._tmp.name, "usage.json")))
        self.hub.translator = self.Translator()

    class Translator:
        def set_keys(self, anthropic_key, gemini_key):
            pass

        async def __call__(self, system, user, on_delta, stop, early, target="zh-TW"):
            return "譯文"

    class NoModel:
        """The shared local recognizer without a model (the fake run never hands it an utterance)."""
        failed = False

        def __init__(self, session, usage):
            pass

        async def close(self):
            pass

    @staticmethod
    async def idle_stt(session, recognizer, language, audio, who="them"):
        while await audio.get() is not None:
            pass

    async def meeting(self, **flags) -> None:
        hub, owner = self.hub, object()
        await hub.start(owner, "local", "en-US", **flags)
        for _ in range(10):
            hub.feed(owner, chunk(200))
        s = hub.session
        for text in ("one two three.", "four five six."):
            s.finish(s.open(0.0), text, 0.0)
        await s.drain()
        await hub.stop()
        if hub.finalizing is not None:
            await hub.finalizing

    async def test_nothing_is_written_unless_save_was_asked(self):
        await self.meeting()
        self.assertFalse(os.path.exists(self.base) and os.listdir(self.base))
        self.assertIsNone(self.hub.archive)

    async def test_saved_meeting_is_listed_with_its_translations(self):
        await self.meeting(save=True)
        self.assertIsNone(self.hub.archive)
        self.assertEqual(self.hub.snapshot()["segment"]["index"], 0)
        found = ownvoice.sessions()
        self.assertEqual([(s["wavs"], s["transcript"]) for s in found], [(1, True)])
        text = ownvoice.read_text("latest", "transcript.md")
        self.assertIn("one two three.\n　譯文\n", text)
        self.assertIn("four five six.", text)


if __name__ == "__main__":
    unittest.main()
