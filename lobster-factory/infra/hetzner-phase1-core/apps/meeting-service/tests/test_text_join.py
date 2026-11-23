"""接字規則只有一個答案：lib/transcribe.py joined_text。
lib/diarize.py 會被別的專案以檔案路徑單獨載入，只能自帶一份 _join；這裡保證兩份不走樣。
跑法：python -m pytest tests/test_text_join.py"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib import diarize, merge_segments
from lib.transcribe import joined_text

PAIRS = [("我們決定", "改到三月", "我們決定改到三月"),
         ("to March,", "because the test", "to March, because the test"),
         ("改用", "Rosenberger", "改用 Rosenberger"),
         ("Rosenberger", "的連接器", "Rosenberger 的連接器"),
         (" weeks. ", " The supplier", "weeks. The supplier"),
         ("", "only", "only")]


@pytest.mark.parametrize("a,b,want", PAIRS)
def test_every_joiner_gives_the_same_text(a, b, want):
    assert joined_text((a, b)) == want
    assert diarize._join(a, b) == want


def test_merge_segments_uses_the_shared_rule():
    segs = [{"id": 1, "start": 0.0, "end": 1.0, "text": "to March,", "avg_logprob": -0.1},
            {"id": 2, "start": 1.1, "end": 2.0, "text": "because the test", "avg_logprob": -0.1}]
    assert merge_segments.merge(segs)[0]["text"] == "to March, because the test"
