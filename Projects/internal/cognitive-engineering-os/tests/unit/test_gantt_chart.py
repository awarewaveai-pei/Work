"""``delivery.gantt_chart`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_gantt_chart_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.delivery.gantt_chart import generate_gantt_chart, project_span
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class GanttChartTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("must start AFTER dependency", lambda: generate_gantt_chart("GANTT-X", "p", [_ok()[0][2][0], {**_ok()[0][2][1], "start": "2026-09-21"}], P)),
        ("must start AFTER dependency", lambda: generate_gantt_chart("GANTT-X", "p", [{"id": "A", "name": "a", "start": "2026-01-01", "end": "2026-01-01", "depends_on": ["B"]}, {"id": "B", "name": "b", "start": "2026-01-01", "end": "2026-01-01", "depends_on": ["A"]}], P)),
        ("lists a dependency twice", lambda: generate_gantt_chart("GANTT-X", "p", [_ok()[0][2][0], {**_ok()[0][2][1], "depends_on": ["T1", "T1"]}], P)),
        ("GANTT_INVALID_SCHEDULE", lambda: generate_gantt_chart("GANTT-X", "p", [], P)),
        ("GANTT_INVALID_SCHEDULE", lambda: generate_gantt_chart("GANTT-X", "p", [{**_ok()[0][2][0], "end": "2026-09-10"}], P)),
        ("GANTT_INVALID_SCHEDULE", lambda: generate_gantt_chart("GANTT-X", "p", [_ok()[0][2][0], {**_ok()[0][2][1], "start": "2026-09-20"}], P)),
        ("GANTT_INVALID_SCHEDULE", lambda: generate_gantt_chart("GANTT-X", "p", [{**_ok()[0][2][0], "depends_on": ["T1"]}], P)),
        ("GANTT_INVALID_SCHEDULE", lambda: generate_gantt_chart("GANTT-X", "p", [{**_ok()[0][2][0], "depends_on": ["T9"]}], P)),
        ("GANTT_INVALID_SCHEDULE", lambda: generate_gantt_chart("GANTT-X", "p", [{**_ok()[0][2][0], "start": "18/09/2026"}], P)),
    ]
    TAMPERS = [
        ("gantt_chart_integrity", lambda r: {**r, "tasks": [{**r["tasks"][1], "start": "2026-09-01"} if t["id"] == "T2" else t for t in r["tasks"]]}),
        ("gantt_chart_integrity", lambda r: {**r, "tasks": [r["tasks"][0], {**r["tasks"][1], "id": "T1"}]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]
    def test_project_span_is_derived(self):
        args, kwargs = fixture_args()
        self.assertEqual(project_span(generate_gantt_chart(*args, **kwargs)), {"start": "2026-09-18", "end": "2026-10-20", "days": 33})


if __name__ == "__main__":
    unittest.main()
