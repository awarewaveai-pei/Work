"""The platform's block routes. Each module here that defines ``router`` is mounted by ``mount(app)`` (called once at
the end of main.py), so a new block adds its own file and never edits a shared list. Modules import what they need
from main (sessions, the case repository, the owner check) -- main is fully defined by the time mount runs."""

from __future__ import annotations

import importlib
import pkgutil

from fastapi import FastAPI


def mount(app: FastAPI) -> list[str]:
    mounted = []
    for info in sorted(pkgutil.iter_modules(__path__), key=lambda found: found.name):
        module = importlib.import_module(f"{__name__}.{info.name}")
        router = getattr(module, "router", None)
        if router is not None:
            app.include_router(router)
            mounted.append(info.name)
    return mounted
