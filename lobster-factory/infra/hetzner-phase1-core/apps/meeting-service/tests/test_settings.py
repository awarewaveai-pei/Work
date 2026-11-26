"""設定檔欄位驗證、金鑰優先序、舊設定檔相容，與跨站寫入守衛。金鑰全是假值，設定檔寫在暫存資料夾。"""
import json
import os
import sys
import tempfile
import threading
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402
from lib import settings  # noqa: E402

FAKE = "fake-key-0123456789abcdef"


class _TempSettings(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.path = os.path.join(tmp.name, ".settings.json")
        patcher = mock.patch.object(settings, "SETTINGS_PATH", self.path)
        patcher.start()
        self.addCleanup(patcher.stop)
        env = mock.patch.dict(os.environ, {"GEMINI_API_KEY": "", "HF_TOKEN": "", "SERPER_API_KEY": ""})
        env.start()
        self.addCleanup(env.stop)

    def stored(self) -> dict:
        with open(self.path, encoding="utf-8") as f:
            return json.load(f)


class ValidationTests(_TempSettings):
    def test_bad_type_unknown_field_and_too_long_are_rejected_and_nothing_is_written(self):
        for patch in ({"save": "yes"}, {"pause_min": "3"}, {"caption_size": 18.5}, {"stt": "cloud"},
                      {"gemini_api_key": 123}, {"no_such_field": 1},
                      {"gemini_api_key": "x" * (settings.KEY_MAX + 1)}, {"listen": "en-" + "A" * 20},
                      {"save": False, "unknown": 1}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                settings.update(patch)
        self.assertFalse(os.path.exists(self.path))

    def test_partial_update_keeps_other_fields_and_returns_only_masks(self):
        settings.update({"gemini_api_key": FAKE})
        out = settings.update({"pause_min": 5})
        self.assertEqual(out["pause_min"], 5)
        self.assertEqual(out["gemini_api_key"], {"set": True, "masked": "fake-key...cdef", "source": "settings"})
        self.assertNotIn(FAKE, json.dumps(out))
        self.assertEqual(self.stored()["gemini_api_key"], FAKE)


class PrecedenceTests(_TempSettings):
    def test_settings_value_wins_over_environment(self):
        with mock.patch.dict(os.environ, {"SERPER_API_KEY": "env-value"}):
            settings.update({"serper_api_key": FAKE})
            self.assertEqual(settings.key("serper_api_key"), FAKE)
            self.assertEqual(settings.public()["serper_api_key"]["source"], "settings")

    def test_environment_is_the_fallback_and_clearing_returns_to_it(self):
        with mock.patch.dict(os.environ, {"HF_TOKEN": "env-value"}):
            self.assertEqual(settings.key("hf_token"), "env-value")
            settings.update({"hf_token": FAKE})
            settings.update({"hf_token": ""})
            self.assertEqual(settings.key("hf_token"), "env-value")
            self.assertEqual(settings.public()["hf_token"]["source"], "env")


class OldFileTests(_TempSettings):
    def test_file_with_only_the_anthropic_key_still_loads(self):
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump({"anthropic_api_key": FAKE}, f)
        self.assertEqual(settings.get_api_key(), FAKE)
        out = settings.public()
        self.assertTrue(out["anthropic_api_key"]["set"])
        self.assertEqual(out["stt"], "gemini")
        self.assertEqual(out["save"], True)
        settings.update({"save": False})
        self.assertEqual(self.stored(), {"anthropic_api_key": FAKE, "save": False})


class ConcurrentWriteTests(_TempSettings):
    def test_simultaneous_updates_keep_the_key_and_every_field(self):
        """第一次載入時三個面板同時 PUT：不能互相蓋掉，也不能把金鑰清掉。"""
        settings.update({"gemini_api_key": FAKE})
        fields = [("pause_min", 4), ("caption_size", 20), ("summary_min", 7)]
        errors = []

        def write(name, value):
            try:
                for _ in range(30):
                    settings.update({name: value})
            except Exception as e:      # noqa: BLE001 -- collected and asserted below
                errors.append(e)

        threads = [threading.Thread(target=write, args=f) for f in fields]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(errors, [])
        self.assertEqual(self.stored(), {"gemini_api_key": FAKE, "pause_min": 4, "caption_size": 20, "summary_min": 7})
        self.assertEqual([n for n in os.listdir(os.path.dirname(self.path)) if n != ".settings.json"], [])


class CrossSiteWriteTests(_TempSettings):
    def setUp(self):
        super().setUp()
        self.client = TestClient(app_module.app, base_url="http://127.0.0.1:8420")

    def test_foreign_origin_cannot_write(self):
        for method in ("post", "put"):
            for headers in ({"origin": "https://evil.example"}, {"origin": "http://127.0.0.1:9999"},
                            {"sec-fetch-site": "cross-site"}, {"sec-fetch-site": "same-site"}):
                with self.subTest(method=method, headers=headers):
                    r = getattr(self.client, method)("/api/settings", json={"save": False}, headers=headers)
                    self.assertEqual(r.status_code, 403)
        self.assertFalse(os.path.exists(self.path))

    def test_same_origin_and_headerless_requests_pass(self):
        same = {"origin": "http://127.0.0.1:8420", "sec-fetch-site": "same-origin"}
        self.assertEqual(self.client.put("/api/settings", json={"save": False}, headers=same).status_code, 200)
        self.assertEqual(self.client.post("/api/settings", json={"pause_min": 7}, headers=same).status_code, 200)
        self.assertEqual(self.client.put("/api/settings", json={"end_min": 9}).status_code, 200)
        self.assertEqual(self.stored(), {"save": False, "pause_min": 7, "end_min": 9})
        self.assertEqual(self.client.put("/api/settings", json={"nope": 1}, headers=same).status_code, 400)


if __name__ == "__main__":
    unittest.main()
