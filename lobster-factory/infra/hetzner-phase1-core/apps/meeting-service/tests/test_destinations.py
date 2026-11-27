"""C16：路徑正規化、錄音資料夾不可在雲端同步資料夾底下、換錄音資料夾後舊場次仍列出、
多個輸出目的地（一個失敗另一個照寫）、舊環境變數只轉一次、只有 sync_drive 的舊工作照樣同步。
設定檔是 conftest 給的暫存檔；所有資料夾都在暫存資料夾。"""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pipeline  # noqa: E402
from lib import ownvoice, paths, settings  # noqa: E402

MINUTES = {"title": "週會"}


class PathTests(unittest.TestCase):
    def test_windows_form_wsl_form_and_an_unmounted_drive(self):
        self.assertEqual(paths.windows("d:/會議//記錄/"), "D:\\會議\\記錄")
        self.assertEqual(paths.windows("/mnt/h/我的雲端硬碟/ECT"), "H:\\我的雲端硬碟\\ECT", "the old WSL env var form")
        with self.assertRaises(paths.PathError):
            paths.windows("會議\\記錄")
        self.assertEqual(paths.local("D:\\會議\\記錄", wsl=False), "D:\\會議\\記錄")
        with mock.patch("os.path.isdir", lambda p: p == "/mnt/d"):
            self.assertEqual(paths.local("D:\\會議\\記錄", wsl=True), "/mnt/d/會議/記錄")
            with self.assertRaises(paths.PathError) as e:
                paths.local("H:\\我的雲端硬碟", wsl=True)
        self.assertIn("sudo mount -t drvfs H: /mnt/h", str(e.exception))


class _Folders(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = tmp.name

    def folder(self, *parts) -> str:
        path = os.path.join(self.tmp, *parts)
        os.makedirs(path, exist_ok=True)
        return path


class RecordingFolderTests(_Folders):
    def test_a_recording_folder_inside_a_synced_folder_is_refused(self):
        for synced in ("C:\\Users\\me\\OneDrive\\會議錄音", "H:\\我的雲端硬碟\\錄音", "D:\\Dropbox\\rec"):
            with self.subTest(synced=synced), self.assertRaises(ValueError):
                settings.update({"recording_dir": synced})
        self.assertEqual(settings.pref("recording_dir"), "", "nothing was saved")
        self.assertFalse(paths.check(self.folder("OneDrive", "rec"), recording=True)["ok"])
        self.assertTrue(paths.check(self.folder("OneDrive", "rec"), recording=False)["ok"], "outputs may go to the cloud")

    def test_a_link_into_a_synced_folder_is_refused(self):
        # Codex 2026-11-27: C:\\Recordings as a junction into OneDrive passed the name check.
        plain = self.folder("Recordings")
        into_cloud = self.folder("OneDrive", "rec")
        with mock.patch.object(paths.os.path, "realpath", lambda p: into_cloud if p == plain else p):
            self.assertEqual(paths.cloud(plain), "OneDrive")

    def test_ownvoices_default_folder_inside_onedrive_is_not_recorded_into(self):
        # 「文件」被 OneDrive 轉向時，OwnVoice 的預設資料夾就在雲端裡（critic C16 Major）。
        synced = self.folder("OneDrive", "Documents", "OwnVoice Meet")
        with mock.patch.dict(os.environ, {"OWNVOICE_SESSIONS_DIR": synced}):
            with self.assertRaises(paths.PathError):
                ownvoice.recording_dir()
            with self.assertRaises(ValueError):
                settings.update({"recording_dir": ""})

    def test_older_sessions_stay_listed_after_the_folder_changes(self):
        app_dir, first, second = self.folder("app"), self.folder("first"), self.folder("second")
        for root, name in ((app_dir, "2026-11-20 0900"), (first, "2026-11-21 0900"), (second, "2026-11-22 0900")):
            self.folder(root, name)
        with mock.patch.dict(os.environ, {"OWNVOICE_SESSIONS_DIR": app_dir}):
            settings.update({"recording_dir": first})
            settings.update({"recording_dir": second})
            found = ownvoice.sessions()
            self.assertEqual([(s["id"], s["root"]) for s in found],
                             [("2026-11-22 0900", second), ("2026-11-21 0900", first), ("2026-11-20 0900", app_dir)])
            self.assertEqual(ownvoice.session_dir("2026-11-21 0900"), os.path.join(first, "2026-11-21 0900"))
            self.assertEqual(ownvoice.recording_dir(), second)


class SyncTests(_Folders):
    def job(self, status: dict) -> str:
        job_dir = self.folder("jobs", "j1")
        for name in ("meeting_record.docx", "slides.pptx", "merged.txt"):
            with open(os.path.join(job_dir, name), "w", encoding="utf-8") as f:
                f.write(name)
        with open(os.path.join(job_dir, "status.json"), "w", encoding="utf-8") as f:
            json.dump(status, f)
        return job_dir

    def results(self, job_dir: str) -> list:
        with open(os.path.join(job_dir, "status.json"), encoding="utf-8") as f:
            return json.load(f)["sync_results"]

    def test_one_destination_failing_does_not_stop_the_other(self):
        good = self.folder("good")
        missing = os.path.join(self.tmp, "not-there")
        job_dir = self.job({"destinations": [{"name": "壞的", "dir": missing}, {"name": "好的", "dir": good}]})
        pipeline._sync(job_dir, MINUTES, lambda *_: None)
        bad, ok = self.results(job_dir)
        self.assertFalse(bad["ok"])
        self.assertTrue(ok["ok"])
        (day,) = os.listdir(good)
        self.assertEqual(sorted(os.listdir(os.path.join(good, day))), ["週會_會議記錄.docx", "週會_會議記錄.pptx", "週會_逐字稿.txt"])

    def test_an_old_job_with_only_sync_drive_still_syncs_to_the_old_env_folder(self):
        old_drive = self.folder("drive")
        with mock.patch.dict(os.environ, {"MEETING_DRIVE_BASE": old_drive}):
            job_dir = self.job({"sync_drive": True})
            pipeline._sync(job_dir, MINUTES, lambda *_: None)
        (result,) = self.results(job_dir)
        self.assertTrue(result["ok"], result)
        self.assertEqual(len(result["files"]), 3)

    def test_the_env_var_becomes_one_destination_once(self):
        old_drive = self.folder("drive")
        with mock.patch.dict(os.environ, {"MEETING_DRIVE_BASE": old_drive}):
            first = settings.destinations()
            settings.destinations()
            self.assertEqual(first, [{"name": "Google Drive", "dir": paths.windows(old_drive), "sync": False}])
            self.assertEqual(settings.destinations(), first, "not added twice")
            settings.update({"destinations": []})
            self.assertEqual(settings.destinations(), [], "a deleted one does not come back")


if __name__ == "__main__":
    unittest.main()
