"""Same criteria, real adapters: Windows SAPI speech + cached offline faster-whisper.

Skipped -- VISIBLY, with the reason -- when the machine lacks SAPI, faster_whisper
or the cached model. A skip here means the speech-to-text path was NOT
exercised on this machine; it must never be read as a pass.
"""

import shutil
import tempfile
import unittest
from pathlib import Path

from ai_lego.apps.cli.run_research_slice import SliceConfig, run_research_slice
from ai_lego.modules.knowledge.ingest.audio_fixtures import WindowsSapiSpeechAudioFactory
from ai_lego.modules.knowledge.ingest.transcription import offline_stt_availability
from tests.acceptance.criteria import SliceCriteriaMixin

_SAPI_OK, _SAPI_REASON = WindowsSapiSpeechAudioFactory.availability()
_STT_OK, _STT_REASON = offline_stt_availability()
AVAILABLE = _SAPI_OK and _STT_OK
SKIP_REASON = f"offline-stt path NOT exercised: sapi={_SAPI_REASON}; stt={_STT_REASON}"


@unittest.skipUnless(AVAILABLE, SKIP_REASON)
class OfflineSttAcceptanceTests(SliceCriteriaMixin, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runtime = Path(tempfile.mkdtemp(prefix="ai-lego-slice-stt-"))
        cls.result = run_research_slice(SliceConfig(runtime_dir=cls.runtime, transcription="offline-stt", review="fixture"))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.runtime, ignore_errors=True)

    def test_adapters_are_the_real_local_ones(self):
        self.assertEqual(self.result["adapters"]["audio_mode"], "WINDOWS_SAPI_SPEECH_WAV")
        self.assertEqual(self.result["adapters"]["transcription_mode"], "OFFLINE_FASTER_WHISPER_MEDIUM_CPU_INT8")

    def test_recognised_text_is_what_was_encrypted_not_the_declared_script(self):
        for row in self.result["transcriptions"]:
            if row["subject_id"] == "P2":
                continue  # scrubbed after erasure
            self.assertTrue(row["text"])
            self.assertGreater(row["language_probability"], 0.5)
            self.assertEqual(row["language"], "en")


if __name__ == "__main__":
    unittest.main()
