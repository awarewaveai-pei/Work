"""``art_therapy.full_stop_method`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_full_stop_method_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.full_stop_method import generate_full_stop_method, flagged_segments
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class FullStopMethodTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("FSTOP_INVALID_SEGMENTS", lambda: generate_full_stop_method("FSTOP-X", "s", [], P)),
        ("FSTOP_INVALID_SEGMENTS", lambda: generate_full_stop_method("FSTOP-X", "s", [{"id": "S1", "sentence": "x", "pattern": "LABELING"}], P)),
        ("FSTOP_INVALID_SEGMENTS", lambda: generate_full_stop_method("FSTOP-X", "s", [{"id": "S1", "sentence": "x", "pattern": "LABELING", "revision": "X "}], P)),
        ("FSTOP_INVALID_SEGMENTS", lambda: generate_full_stop_method("FSTOP-X", "s", [{"id": "S1", "sentence": "x", "pattern": "NONE", "revision": "y"}], P)),
        ("FSTOP_INVALID_SEGMENTS", lambda: generate_full_stop_method("FSTOP-X", "s", [{"id": "S1", "sentence": "x", "pattern": "SARCASM"}], P)),
        ("FSTOP_INVALID_SEGMENTS", lambda: generate_full_stop_method("FSTOP-X", "s", [{"id": "S1", "sentence": "x", "pattern": "NONE"}, {"id": "S1", "sentence": "y", "pattern": "NONE"}], P)),
    ]
    TAMPERS = [
        ("full_stop_integrity", lambda r: {**r, "segments": [{**r["segments"][1], "revision": r["segments"][1]["sentence"]}]}),
        ("full_stop_integrity", lambda r: {**r, "segments": [{**r["segments"][0], "pattern": "BOGUS"}]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]
    def test_flagged_segments_excludes_none(self):
        args, kwargs = fixture_args()
        record = generate_full_stop_method(*args, **kwargs)
        self.assertEqual([s["id"] for s in flagged_segments(record)], ["S2", "S3"])


if __name__ == "__main__":
    unittest.main()
