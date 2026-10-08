"""Full-suite guard for pytest (the unittest side and the reasons: tests/__init__.py). A directory among pytest's
arguments -- `pytest tests`, `pytest tests/unit -k x`, bare `pytest` from the product root -- walks the tree; files and
node ids (`pytest tests/unit/test_x.py::Case`) do not. With no arguments pytest puts its invocation directory into
config.args, so a bare run is a directory run (tests/unit/test_00_full_suite_guard.py runs both). Checked after collection because a bare `pytest` from the product
root loads this file only while collecting tests/, after session start; --ignore cannot skip it the way it can skip a
sentinel test file."""

from __future__ import annotations

import os

import pytest

import tests


def pytest_collection_modifyitems(session, config, items) -> None:
    if os.environ.get("COS_FULL_SUITE") == "1":
        return
    root = str(config.invocation_params.dir)
    if any(os.path.isdir(os.path.join(root, str(arg).split("::")[0])) for arg in config.args):
        pytest.exit(tests.MESSAGE, returncode=2)
