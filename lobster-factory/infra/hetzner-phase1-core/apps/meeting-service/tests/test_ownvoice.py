"""lib/ownvoice.py：資料夾格式的讀取與錄音接合。跑法：python -m pytest tests/test_ownvoice.py"""
import os
import sys
import time
import wave

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib import ownvoice


def _wav(path, seconds, rate=16000):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x00\x00" * int(rate * seconds))
    os.utime(path, (time.time() - 60,) * 2)     # 一分鐘前就錄完了


@pytest.fixture
def base(tmp_path, monkeypatch):
    monkeypatch.setenv("OWNVOICE_SESSIONS_DIR", str(tmp_path))
    old = tmp_path / "2026-11-21 0900"
    new = tmp_path / "2026-11-22 1630-2"
    for d in (old, new, tmp_path / "not a session"):
        d.mkdir()
    _wav(new / "01-Keynote.wav", 1.0)
    _wav(new / "02-Panel.wav", 0.5)
    (new / "transcript.md").write_text("# 逐字稿\n", encoding="utf-8")
    return tmp_path


def test_sessions_are_newest_first_and_only_ownvoice_folders(base):
    found = ownvoice.sessions()
    assert [s["id"] for s in found] == ["2026-11-22 1630-2", "2026-11-21 0900"]
    assert found[0] == {"id": "2026-11-22 1630-2", "wavs": 2, "transcript": True, "summary": False}
    assert found[1]["wavs"] == 0


def test_latest_and_missing_text(base):
    assert ownvoice.read_text("latest", "transcript.md") == "# 逐字稿\n"
    assert ownvoice.read_text("latest", "summary.md") == ""


def test_a_session_without_session_json_is_an_old_one(base):
    assert ownvoice.session_lines("latest") is None


@pytest.mark.parametrize("bad", ["..", "not a session", "2026-11-22 1630-2/..", "2026-01-01 0000"])
def test_only_existing_session_names_resolve(base, bad):
    with pytest.raises(KeyError):
        ownvoice.session_dir(bad)


def test_join_wavs_keeps_order_and_length(base, tmp_path):
    out = tmp_path / "joined.wav"
    assert ownvoice.join_wavs("latest", str(out)) == pytest.approx(1.5)
    with wave.open(str(out), "rb") as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()) == (1, 2, 16000, 24000)


def test_join_wavs_refuses_no_audio_and_mixed_formats(base, tmp_path):
    with pytest.raises(ValueError):
        ownvoice.join_wavs("2026-11-21 0900", str(tmp_path / "x.wav"))
    _wav(base / "2026-11-22 1630-2" / "03-Other.wav", 0.5, rate=48000)
    with pytest.raises(ValueError):
        ownvoice.join_wavs("latest", str(tmp_path / "y.wav"))


def test_join_wavs_refuses_a_session_still_recording(base, tmp_path):
    live = base / "2026-11-22 1630-2" / "02-Panel.wav"
    os.utime(live)                                  # 剛剛才被寫過
    with pytest.raises(ValueError, match="還在錄音"):
        ownvoice.join_wavs("latest", str(tmp_path / "a.wav"))
    with open(live, "ab") as f:                     # 檔頭還沒回填：資料比宣告的多，而且剛剛才寫過
        f.write(bytes(32000))
    with pytest.raises(ValueError, match="還在錄音"):
        ownvoice.join_wavs("latest", str(tmp_path / "b.wav"))


def test_join_wavs_reads_an_unfinished_file_by_its_size_once_it_is_quiet(base, tmp_path):
    live = base / "2026-11-22 1630-2" / "02-Panel.wav"
    with open(live, "ab") as f:                     # 程式被殺：檔頭沒回填，另有半個取樣的尾巴
        f.write(bytes(32000) + b"\x01")
    os.utime(live, (time.time() - 60,) * 2)
    out = tmp_path / "c.wav"
    assert ownvoice.join_wavs("latest", str(out)) == pytest.approx(2.5)
    with wave.open(str(out), "rb") as w:
        assert w.getnframes() == 16000 + 8000 + 16000
    assert os.path.getsize(live) == 44 + 16000 + 32000 + 1   # 原檔沒被改寫


def test_live_transcript_only_when_recently_written(base):
    path = base / "2026-11-22 1630-2" / "transcript.md"
    assert ownvoice.live_transcript() == "# 逐字稿\n"
    os.utime(path, (time.time() - 7200,) * 2)       # 兩小時前的另一場會議
    assert ownvoice.live_transcript() == ""
