"""Every test gets its own empty settings file and no MEETING_DRIVE_BASE: the suite also runs in the
checkout the real service uses, whose .settings.json names real folders (and the env var would be
imported into it, lib/settings.py _import_drive_env). Tests that need settings write them here."""
import os

import pytest

from lib import settings


@pytest.fixture(autouse=True)
def _own_settings(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "SETTINGS_PATH", os.path.join(str(tmp_path), ".settings.json"))
    monkeypatch.delenv("MEETING_DRIVE_BASE", raising=False)
