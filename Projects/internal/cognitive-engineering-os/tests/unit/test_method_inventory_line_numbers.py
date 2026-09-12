"""Mechanical guard for ``methods/registry/method-inventory.yaml``'s Atlas line numbers.

Why this exists: on 2026-09-12 an audit found 230 of the registry's 284 Atlas-sourced rows cited stale
line numbers, drifting in era-shaped bands (+1 for the primitives/F01-F08/F10 block, +3 for
F11/F13-F21, -9 for F22-F24, -18/-32 for the recipe sections) because the registry was migrated from a
Phase 0 snapshot of an older Atlas revision and never re-synced. Each family batch had been
rediscovering its own slice of the drift and correcting only its own rows -- F12 found its 10 rows off
by 3, F09 found its 8 off by 1 -- which never closed the class. The registry's own header claimed
``tests/run_golden_tests.py`` independently re-checked it; that file has never existed, so nothing
mechanically verified these numbers at all.

The invariant: a cited line number must actually land on the line that DEFINES the named entry --
its method-table row, its primitive in the `````text`` primitive block, or its ``## `` section
header. Anything else is a citation that silently points a future reader at unrelated content.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

from ai_lego import resolve_spec_root

ATLAS_DOC_KEY = "AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md"

# Entries whose defining line is a section header or a non-table definition rather than a
# "| Name | ... |" catalog row. Each is still verified -- just against its own real shape.
SECTION_ENTRIES = {
    "Monte Carlo Simulation",
    "stakeholder.regulator lens",
    "validation.experiment",
    "Simple Brainstorm Recipe",
    "Professional Brainstorm Recipe",
    "Research-grade Ideation Recipe",
    "Board-grade Strategy Recipe",
    "New Product / Startup Recipe",
    "Global Market Entry Recipe",
    "Public Policy Recipe",
    "Production Incident Recipe",
    "High-risk Architecture Change Recipe",
    "Database Migration Recipe",
    "Security Review Recipe",
    "Decision Under Deep Uncertainty Recipe",
}

# The F22 row is spelled "| RACI |"; the registry disambiguates it from F07's RACI by name.
NAME_ALIASES = {"RACI (delivery)": "RACI"}


def _normalize(value: str) -> str:
    return value.replace("–", "-").replace("—", "-").strip().casefold()


def _atlas_path(spec_root: Path) -> Path:
    return spec_root / ATLAS_DOC_KEY


def _registry_path(spec_root: Path) -> Path:
    return spec_root / "methods" / "registry" / "method-inventory.yaml"


def _atlas_sourced_rows(registry_text: str) -> list[tuple[str, int]]:
    """(name, cited_line) for every entry under the Atlas document key only.

    Parsed with a line scanner rather than a YAML load so a citation's own physical position stays
    recoverable, and so a malformed registry surfaces here instead of silently yielding zero rows.
    """
    lines = registry_text.splitlines()
    start = next(i for i, line in enumerate(lines) if line.strip() == f'"{ATLAS_DOC_KEY}":')
    end = len(lines)
    for i in range(start + 1, len(lines)):
        if re.match(r'^  "[^"]+\.md":\s*$', lines[i]) or lines[i].startswith("phase_3_additions"):
            end = i
            break

    rows: list[tuple[str, int]] = []
    pending: str | None = None
    for i in range(start, end):
        name_match = re.match(r'\s*- name: "(.+)"\s*$', lines[i])
        if name_match:
            pending = name_match.group(1)
        line_match = re.match(r"\s*line: (\d+)\s*$", lines[i])
        if line_match and pending is not None:
            rows.append((pending, int(line_match.group(1))))
            pending = None
    return rows


def _defines(atlas_lines: list[str], cited: int, name: str) -> bool:
    if not 1 <= cited <= len(atlas_lines):
        return False
    target = _normalize(NAME_ALIASES.get(name, name))
    line = atlas_lines[cited - 1]
    if line.startswith("|"):
        cells = [cell.strip() for cell in line.split("|")]
        return len(cells) > 1 and _normalize(cells[1]) == target
    if name in SECTION_ENTRIES:
        # "## 11.29 蒙地卡羅模擬（Monte Carlo Simulation）", "## 13.1 Simple Brainstorm Recipe",
        # or a bare "  id: stakeholder.regulator" / "  - validation.experiment" definition line.
        return target.split(" lens")[0] in _normalize(line)
    return _normalize(line) == target


class MethodInventoryLineNumberTests(unittest.TestCase):
    """Every Atlas citation in the registry must land on the line that defines it."""

    @classmethod
    def setUpClass(cls):
        spec_root = resolve_spec_root()
        cls.atlas_lines = _atlas_path(spec_root).read_text(encoding="utf-8").splitlines()
        cls.rows = _atlas_sourced_rows(_registry_path(spec_root).read_text(encoding="utf-8"))

    def test_registry_actually_has_atlas_rows_to_check(self):
        """Guards the guard: a parser that silently matched nothing would make every other test here
        vacuously pass, which is exactly the shape of failure this file was written to end."""
        self.assertGreater(len(self.rows), 250, "Atlas block parsed as suspiciously few rows")

    def test_every_cited_line_lands_on_the_entry_it_names(self):
        stale = [
            (name, cited, self.atlas_lines[cited - 1][:60] if 1 <= cited <= len(self.atlas_lines) else "<out of range>")
            for name, cited in self.rows
            if not _defines(self.atlas_lines, cited, name)
        ]
        self.assertEqual(
            stale,
            [],
            "method-inventory.yaml cites Atlas lines that do not define the named entry. "
            "Re-sync the registry against the current Atlas rather than correcting only the rows "
            f"your current family touches ({len(stale)} stale):\n"
            + "\n".join(f"  {name!r} cites L{cited} -> {found!r}" for name, cited, found in stale),
        )


if __name__ == "__main__":
    unittest.main()
