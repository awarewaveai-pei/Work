"""``systems.flowchart`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_flowchart_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.systems.flowchart import generate_flowchart
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class FlowchartTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("self-loop", lambda: generate_flowchart("FLOW-X", "t", _ok()[0][2], _ok()[0][3] + [{"from_ref": "N2", "to_ref": "N2"}], P)),
        ("duplicate edge", lambda: generate_flowchart("FLOW-X", "t", _ok()[0][2], _ok()[0][3] + [{"from_ref": "N1", "to_ref": "N2", "condition": "累"}], P)),
        ("same condition", lambda: generate_flowchart("FLOW-X", "t", _ok()[0][2], [{**e, "condition": "累"} if "condition" in e else e for e in _ok()[0][3]], P)),
        ("carries a condition but", lambda: generate_flowchart("FLOW-X", "t", _ok()[0][2], [{**_ok()[0][3][0], "condition": "why"}] + _ok()[0][3][1:], P)),
        ("unreachable from START", lambda: generate_flowchart("FLOW-X", "t", _ok()[0][2] + [{"id": "X", "kind": "PROCESS", "label": "x"}, {"id": "Y", "kind": "PROCESS", "label": "y"}], _ok()[0][3] + [{"from_ref": "X", "to_ref": "Y"}, {"from_ref": "Y", "to_ref": "X"}, {"from_ref": "Y", "to_ref": "N4"}], P)),
        ("FLOW_INVALID_GRAPH", lambda: generate_flowchart("FLOW-X", "t", _ok()[0][2] + [{"id": "N9", "kind": "START", "label": "x"}], _ok()[0][3], P)),
        ("FLOW_INVALID_GRAPH", lambda: generate_flowchart("FLOW-X", "t", [n for n in _ok()[0][2] if n["kind"] != "END"], [e for e in _ok()[0][3] if e["to_ref"] != "N4"], P)),
        ("FLOW_INVALID_GRAPH", lambda: generate_flowchart("FLOW-X", "t", _ok()[0][2], _ok()[0][3] + [{"from_ref": "N2", "to_ref": "N8"}], P)),
        ("FLOW_INVALID_GRAPH", lambda: generate_flowchart("FLOW-X", "t", _ok()[0][2], [{**e, "condition": None} if "condition" in e else e for e in _ok()[0][3]], P)),
        ("FLOW_INVALID_GRAPH", lambda: generate_flowchart("FLOW-X", "t", _ok()[0][2] + [{"id": "N7", "kind": "PROCESS", "label": "orphan"}], _ok()[0][3], P)),
        ("FLOW_INVALID_GRAPH", lambda: generate_flowchart("FLOW-X", "t", _ok()[0][2], _ok()[0][3][1:], P)),
    ]
    TAMPERS = [
        ("flowchart_integrity", lambda r: {**r, "edges": [e for e in r["edges"] if e["to_ref"] != "N3"]}),
        ("flowchart_integrity", lambda r: {**r, "nodes": [{**n, "kind": "PROCESS"} if n["kind"] == "START" else n for n in r["nodes"]]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
