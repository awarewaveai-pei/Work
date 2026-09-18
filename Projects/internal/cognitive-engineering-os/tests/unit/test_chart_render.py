"""``artifact.generate_chart`` -- real matplotlib rendering, real PNG validation.

Per the handoff's own flagged risk: output validation MUST be a genuine image check (magic
bytes + a real Pillow decode), never a base64-length heuristic that a broken renderer could
still pass.
"""

from __future__ import annotations

import base64
import io
import unittest

from PIL import Image

from ai_lego import resolve_spec_root
from ai_lego.apps.recipe_runtime import build_registered_capability_adapters
from ai_lego.errors import InvariantViolation
from ai_lego.modules.representation.chart_render import generate_chart_artifact
from ai_lego.platform.ai_execution.capability_resolver import CapabilityCatalog

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def _decode_and_verify_png(content: str) -> Image.Image:
    raw = base64.b64decode(content)
    assert raw[:8] == PNG_MAGIC, "output is not a real PNG (magic bytes missing)"
    Image.open(io.BytesIO(raw)).verify()  # raises if the pixel data itself is corrupt
    return Image.open(io.BytesIO(raw))  # a verified image object can't be reused -- reopen


class ForestPlotTests(unittest.TestCase):
    def _payload(self, **overrides):
        payload = {
            "chart_type": "forest_plot",
            "title": "Effect of Intervention X",
            "rows": [
                {"label": "Study A", "estimate": 0.5, "ci_low": 0.2, "ci_high": 0.8},
                {"label": "Study B", "estimate": -0.1, "ci_low": -0.4, "ci_high": 0.2},
                {"label": "Pooled", "estimate": 0.25, "ci_low": 0.05, "ci_high": 0.45},
            ],
        }
        payload.update(overrides)
        return payload

    def test_renders_a_real_png(self):
        result = generate_chart_artifact(self._payload(), {})
        artifact = result["artifact"]
        self.assertEqual(artifact["artifact_type"], "image/png")
        self.assertIsInstance(artifact["content"], str)
        image = _decode_and_verify_png(artifact["content"])
        self.assertEqual(image.format, "PNG")
        self.assertGreater(image.size[0], 0)
        self.assertGreater(image.size[1], 0)

    def test_taller_figure_for_more_rows(self):
        few = generate_chart_artifact(self._payload(), {})
        many_rows = [{"label": f"Study {i}", "estimate": 0.1, "ci_low": 0.0, "ci_high": 0.2} for i in range(20)]
        many = generate_chart_artifact(self._payload(rows=many_rows), {})
        few_image = _decode_and_verify_png(few["artifact"]["content"])
        many_image = _decode_and_verify_png(many["artifact"]["content"])
        self.assertGreater(many_image.size[1], few_image.size[1])

    def test_rejects_empty_rows(self):
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(rows=[]), {})

    def test_rejects_missing_rows(self):
        payload = self._payload()
        del payload["rows"]
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(payload, {})

    def test_rejects_estimate_outside_confidence_interval(self):
        bad_row = {"label": "X", "estimate": 5.0, "ci_low": 0.0, "ci_high": 1.0}
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(rows=[bad_row]), {})

    def test_rejects_non_numeric_estimate(self):
        bad_row = {"label": "X", "estimate": "high", "ci_low": 0.0, "ci_high": 1.0}
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(rows=[bad_row]), {})

    def test_rejects_empty_label(self):
        bad_row = {"label": "", "estimate": 0.5, "ci_low": 0.0, "ci_high": 1.0}
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(rows=[bad_row]), {})

    def test_rejects_boolean_as_number(self):
        # bool is a subclass of int in Python -- must not silently pass isinstance(x, (int, float)).
        bad_row = {"label": "X", "estimate": True, "ci_low": 0.0, "ci_high": 1.0}
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(rows=[bad_row]), {})

    def test_rejects_nan_estimate(self):
        # NaN compares False to every relational operator, so a naive ci_low <= estimate <= ci_high
        # check silently accepts it without an explicit finiteness check (critic finding 2026-09-18).
        bad_row = {"label": "X", "estimate": float("nan"), "ci_low": 0.0, "ci_high": 1.0}
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(rows=[bad_row]), {})

    def test_rejects_infinite_confidence_interval(self):
        bad_row = {"label": "X", "estimate": 0.0, "ci_low": float("-inf"), "ci_high": float("inf")}
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(rows=[bad_row]), {})

    def test_rejects_more_rows_than_the_cap(self):
        from ai_lego.modules.representation.chart_render import MAX_ROWS

        too_many = [{"label": f"S{i}", "estimate": 0.0, "ci_low": -1.0, "ci_high": 1.0} for i in range(MAX_ROWS + 1)]
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(rows=too_many), {})

    def test_a_malformed_mathtext_title_is_refused_without_leaking_a_figure(self):
        # critic finding 2026-09-18: a bare "$$" throws inside matplotlib's mathtext parser: proves
        # the module doesn't leave an unclosed Figure behind on any exception after plt.subplots().
        import matplotlib.pyplot as plt

        before = set(plt.get_fignums())
        with self.assertRaises(Exception):
            generate_chart_artifact(self._payload(title="broken $$ title"), {})
        after = set(plt.get_fignums())
        self.assertEqual(before, after, "a figure was left open (leaked) after a rendering exception")


class BubbleChartTests(unittest.TestCase):
    def _payload(self, **overrides):
        payload = {
            "chart_type": "bubble_chart",
            "title": "Market Segments",
            "x_label": "Growth Rate",
            "y_label": "Market Share",
            "points": [
                {"label": "Seg A", "x": 0.1, "y": 0.3, "size": 50},
                {"label": "Seg B", "x": 0.4, "y": 0.6, "size": 200},
                {"label": "Seg C", "x": 0.7, "y": 0.2, "size": 10},
            ],
        }
        payload.update(overrides)
        return payload

    def test_renders_a_real_png(self):
        result = generate_chart_artifact(self._payload(), {})
        artifact = result["artifact"]
        self.assertEqual(artifact["artifact_type"], "image/png")
        image = _decode_and_verify_png(artifact["content"])
        self.assertEqual(image.format, "PNG")

    def test_renders_without_optional_labels(self):
        points = [{"x": 1, "y": 2, "size": 30}, {"x": 3, "y": 4, "size": 60}]
        result = generate_chart_artifact(self._payload(points=points), {})
        _decode_and_verify_png(result["artifact"]["content"])

    def test_rejects_empty_points(self):
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(points=[]), {})

    def test_rejects_zero_size(self):
        bad_point = {"x": 1, "y": 1, "size": 0}
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(points=[bad_point]), {})

    def test_rejects_negative_size(self):
        bad_point = {"x": 1, "y": 1, "size": -5}
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(points=[bad_point]), {})

    def test_rejects_missing_x(self):
        bad_point = {"y": 1, "size": 10}
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(points=[bad_point]), {})

    def test_a_wide_size_range_keeps_the_smallest_bubble_visible(self):
        points = [{"x": 1, "y": 1, "size": 1}, {"x": 2, "y": 2, "size": 100000}]
        result = generate_chart_artifact(self._payload(points=points), {})
        _decode_and_verify_png(result["artifact"]["content"])  # smoke: renders without a zero-area error

    def test_rejects_nan_size(self):
        # NaN fails `size <= 0` (False for every comparison), so it would otherwise silently pass
        # as a valid size and render as a floor-size bubble instead of being refused (critic finding).
        bad_point = {"x": 1, "y": 1, "size": float("nan")}
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(points=[bad_point]), {})

    def test_rejects_more_points_than_the_cap(self):
        from ai_lego.modules.representation.chart_render import MAX_POINTS

        too_many = [{"x": i, "y": i, "size": 10} for i in range(MAX_POINTS + 1)]
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(points=too_many), {})


class QuadrantChartTests(unittest.TestCase):
    """Shared by any 2-axis-4-quadrant method (decision.impact_effort, decision.eisenhower_matrix,
    ...) -- added 2026-09-18 rather than a bespoke renderer duplicated per method."""

    def _payload(self, **overrides):
        payload = {
            "chart_type": "quadrant_chart",
            "title": "Task Priority",
            "x_threshold": 5,
            "y_threshold": 5,
            "quadrant_labels": {"top_right": "Do First", "top_left": "Schedule", "bottom_right": "Delegate", "bottom_left": "Eliminate"},
            "points": [
                {"label": "Task A", "x": 8, "y": 9},
                {"label": "Task B", "x": 2, "y": 8},
            ],
        }
        payload.update(overrides)
        return payload

    def test_renders_a_real_png(self):
        result = generate_chart_artifact(self._payload(), {})
        artifact = result["artifact"]
        self.assertEqual(artifact["artifact_type"], "image/png")
        image = _decode_and_verify_png(artifact["content"])
        self.assertEqual(image.format, "PNG")

    def test_renders_without_optional_quadrant_labels_or_point_labels(self):
        points = [{"x": 1, "y": 2}, {"x": 3, "y": 4}]
        result = generate_chart_artifact(self._payload(points=points, quadrant_labels={}), {})
        _decode_and_verify_png(result["artifact"]["content"])

    def test_rejects_empty_points(self):
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(points=[]), {})

    def test_rejects_missing_x_threshold(self):
        payload = self._payload()
        del payload["x_threshold"]
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(payload, {})

    def test_rejects_nan_threshold(self):
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(x_threshold=float("nan")), {})

    def test_rejects_unknown_quadrant_label_key(self):
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(quadrant_labels={"middle": "?"}), {})

    def test_rejects_empty_quadrant_label_text(self):
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(quadrant_labels={"top_right": ""}), {})

    def test_rejects_more_points_than_the_cap(self):
        from ai_lego.modules.representation.chart_render import MAX_POINTS

        too_many = [{"x": i, "y": i} for i in range(MAX_POINTS + 1)]
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact(self._payload(points=too_many), {})


class ChartTypeTests(unittest.TestCase):
    def test_rejects_unknown_chart_type(self):
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact({"chart_type": "pie_chart"}, {})

    def test_rejects_missing_chart_type(self):
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact({"rows": []}, {})

    def test_rejects_unhashable_chart_type_with_the_documented_error_not_a_raw_typeerror(self):
        # critic finding 2026-09-18: `chart_type not in CHART_TYPES` on a list/dict raised a raw
        # TypeError instead of this module's own documented InvariantViolation.
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact({"chart_type": ["forest_plot"]}, {})
        with self.assertRaises(InvariantViolation):
            generate_chart_artifact({"chart_type": {}}, {})


class CapabilityRegistrationTests(unittest.TestCase):
    """Wiring test: catches drift between the capability contract's `id` and the id this
    module is registered under in recipe_runtime.py (a rename on one side, forgotten on the
    other, would otherwise only surface at first real invocation via a plan)."""

    def test_real_catalog_resolves_and_dispatches_the_capability(self):
        catalog = CapabilityCatalog.from_spec_root(resolve_spec_root())
        self.assertTrue(catalog.is_resolvable("artifact.generate_chart"))
        adapters = build_registered_capability_adapters(catalog, ["artifact.generate_chart"])
        handler = adapters.require_for(["artifact.generate_chart"])["artifact.generate_chart"]
        result = handler({"chart_type": "forest_plot", "rows": [{"label": "A", "estimate": 0, "ci_low": -1, "ci_high": 1}]}, {})
        self.assertEqual(result["artifact"]["artifact_type"], "image/png")
