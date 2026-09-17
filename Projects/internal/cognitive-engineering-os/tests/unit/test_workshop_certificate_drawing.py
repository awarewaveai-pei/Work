"""``art_therapy.workshop_certificate_drawing`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_workshop_certificate_drawing_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.workshop_certificate_drawing import generate_workshop_certificate_drawing
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class WorkshopCertificateDrawingTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("WCERT_INVALID_CERTIFICATE", lambda: generate_workshop_certificate_drawing("WCERT-X", "j", [], "b", "2026-09-17", "c", P)),
        ("WCERT_INVALID_CERTIFICATE", lambda: generate_workshop_certificate_drawing("WCERT-X", "j", _ok()[0][2], "b", "2026-13-01", "c", P)),
        ("WCERT_INVALID_CERTIFICATE", lambda: generate_workshop_certificate_drawing("WCERT-X", "j", _ok()[0][2], "", "2026-09-17", "c", P)),
        ("WCERT_INVALID_CERTIFICATE", lambda: generate_workshop_certificate_drawing("WCERT-X", "j", [_ok()[0][2][0], {**_ok()[0][2][1], "id": "M1"}], "b", "2026-09-17", "c", P)),
        ("WCERT_INVALID_ID", lambda: generate_workshop_certificate_drawing("CERT-X", "j", _ok()[0][2], "b", "2026-09-17", "c", P)),
    ]
    TAMPERS = [
        ("workshop_certificate_integrity", lambda r: {**r, "sealed_on": "2026-9-17"}),
        ("workshop_certificate_integrity", lambda r: {**r, "created_by": ""}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
