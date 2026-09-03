"""AI-LEGO Cognitive Engineering OS -- runtime package (Phase 5 Research Mode slice).

Where things live (two roots, one product):

* ``Projects/internal/cognitive-engineering-os/`` -- THIS product root. Runtime
  code, its tests and its local runner scripts. The location follows the
  repo-wide product-root convention recorded in
  ``agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/17_REPOSITORY_LAYOUT_AND_PATHS.md``
  (L16, L128, L148: "Runtime implementation belongs under
  ``Projects\\internal\\cognitive-engineering-os\\`` when that product has
  runtime code"), the same convention ``Projects/internal/hci30/`` already
  follows.
* ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/`` -- the SPEC ROOT. The
  three mother documents, the Architecture Constitution, every machine-readable
  ``specs/``/``policies/``/``methods/``/``recipes/``/``capabilities/`` contract,
  the ADRs and the golden-test harness. This package READS from it and never
  writes into it.

Sub-packages mirror the top-level roots approved in
``docs/architecture/REPOSITORY_ARCHITECTURE.md`` (ACCEPTED 2026-08-30) --
``core``, ``modules``, ``platform``, ``compute``, ``data``, ``security``,
``apps`` -- as sub-packages of ONE importable package instead of as top-level
directories. Reason: a top-level ``platform/`` package would shadow the Python
standard-library module of the same name for every consumer that puts the
product root on ``sys.path``. ``docs/adr/ADR-022-phase-5-runtime-landing.md``
records this decision together with the product-root choice.
"""

from __future__ import annotations

import os
from pathlib import Path

from ai_lego.errors import SpecRootNotFound

__version__ = "0.4.0"

PRODUCT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PRODUCT_ROOT.parents[2]
DEFAULT_SPEC_ROOT = REPO_ROOT / "agency-os" / "docs" / "AI_LEGO_Cognitive_Engineering_OS"
SPEC_ROOT_ENV = "AI_LEGO_SPEC_ROOT"


def resolve_spec_root(explicit: Path | str | None = None) -> Path:
    """Locate the read-only spec root: explicit argument > env var > repo default.

    Fails closed: a spec root without a ``specs/`` directory is rejected rather
    than silently producing an empty schema registry (which would make every
    ``validate`` call vacuously succeed).
    """
    if explicit:
        candidate = Path(explicit)
    elif os.environ.get(SPEC_ROOT_ENV):
        candidate = Path(os.environ[SPEC_ROOT_ENV])
    else:
        candidate = DEFAULT_SPEC_ROOT
    candidate = candidate.resolve()
    if not candidate.joinpath("specs").is_dir():
        raise SpecRootNotFound(f"SPEC_ROOT_NOT_FOUND: {candidate} has no specs/ directory")
    return candidate
