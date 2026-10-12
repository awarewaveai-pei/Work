"""``artifact.generate_chart`` capability adapter -- real matplotlib chart rendering.

Three chart types: forest plot (point estimate + confidence interval per row), bubble chart
(x/y/size per point), and quadrant chart (x/y per point, split into 4 labeled regions by an
x/y threshold pair -- shared by any 2-axis-4-quadrant method, e.g. decision.impact_effort and
decision.eisenhower_matrix, added 2026-09-18 rather than duplicated per method). Every pixel
comes from the caller's own numbers -- this is NOT an AI-generated image and makes no AI/network
call. Fail-closed: malformed input raises InvariantViolation before matplotlib is ever touched,
same discipline as the other artifact adapters in this package (see
ai_lego/modules/strategy/proposal_artifact.py).

Agg is a non-interactive, headless rendering backend -- required because this runs inside a
server process with no display, and must be selected via matplotlib.use() before pyplot is
imported (matplotlib picks and locks a backend on first pyplot import).
"""

from __future__ import annotations

import base64
import io
import math
import threading
from typing import Any

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt  # noqa: E402 -- must follow matplotlib.use("Agg")

from ai_lego.errors import InvariantViolation

# matplotlib's pyplot module keeps a single process-global figure registry (Gcf) that is NOT
# thread-safe (matplotlib's own FAQ documents known race conditions and explicitly calls out a
# threaded web-server dispatch as the risk scenario). FastAPI/Starlette runs a plain `def` path
# operation (this one, via artifact.generate_chart) in a worker thread pool, not the event loop,
# and each of the Dockerfile's uvicorn worker processes runs many threads -- so two concurrent chart
# requests in one process really can interleave plt.subplots()/plt.close() calls against the same
# global registry (the registry is per process, so this per-process lock is all it needs). Serializing the whole render+encode+close lifecycle behind one lock
# is the smallest fix that doesn't require rewriting all 3 renderers off the pyplot global API
# (critic finding 2026-09-18 -- pre-existing since forest_plot/bubble_chart, newly load-bearing
# now that a chart renders on every decision.impact_effort/decision.eisenhower_matrix run, not
# just inside a recipe).
_RENDER_LOCK = threading.Lock()

# matplotlib's own default font (DejaVu Sans) has zero CJK glyphs -- any Chinese title/label
# (this product is bilingual EN/ZH throughout) renders as a "missing glyph" tofu box, silently,
# with only a UserWarning on stderr (2026-09-18, caught by actually opening a rendered chart with
# a Chinese label, not just checking the PNG magic bytes). Listing several candidate family names
# lets matplotlib pick whichever is actually installed -- Noto Sans CJK on the Linux container
# (see Dockerfile), a Microsoft/Apple system font on local dev -- falling back to DejaVu Sans (no
# CJK, but still renders EN-only charts fine) if literally none of them are present.
matplotlib.rcParams["font.sans-serif"] = [
    "Noto Sans CJK TC", "Noto Sans CJK SC", "Microsoft JhengHei", "Microsoft YaHei",
    "PingFang TC", "PingFang SC", "SimHei", "Arial Unicode MS", "DejaVu Sans",
]
# A CJK fallback font commonly lacks the typographic Unicode minus (U+2212) matplotlib defaults
# to for negative axis ticks -- same "tofu" failure mode, just on numbers instead of labels.
# Plain ASCII hyphen-minus renders in every font, CJK or not.
matplotlib.rcParams["axes.unicode_minus"] = False

CHART_TYPES = frozenset({"forest_plot", "bubble_chart", "quadrant_chart"})
_QUADRANT_CORNERS = {
    "top_right": {"pos": (0.97, 0.95), "ha": "right", "va": "top"},
    "top_left": {"pos": (0.03, 0.95), "ha": "left", "va": "top"},
    "bottom_right": {"pos": (0.97, 0.05), "ha": "right", "va": "bottom"},
    "bottom_left": {"pos": (0.03, 0.05), "ha": "left", "va": "bottom"},
}
_ACCENT = "#2b4c7e"
_ACCENT_DARK = "#1d3a63"
_MIN_BUBBLE_AREA = 80.0  # points^2 -- floor so the smallest bubble in a wide-range set is still visible
# Caps below a request-driven figure size from ever reaching a resource-exhausting allocation
# (critic finding 2026-09-18: uncapped `rows`/`points` length feeds directly into figsize/canvas
# sizing -- e.g. 100k rows -> tens of GB for one Agg framebuffer). Same convention this codebase
# already uses elsewhere for a caller-supplied collection size (decision_tree.py MAX_TREE_DEPTH,
# focus_group.py MAX_PARTICIPANTS, morphological_analysis.py MAX_RAW_COMBINATION_SPACE). Both
# values are generous relative to what a readable chart of either type can actually show.
MAX_ROWS = 200
MAX_POINTS = 500


def _require_number(value: Any, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise InvariantViolation(f"CHART_FIELD_INVALID: {field} must be a number")
    result = float(value)
    if not math.isfinite(result):
        # critic finding 2026-09-18: NaN compares False to every relational operator, so a
        # "must be > 0" / "must be within [ci_low, ci_high]" check silently passes NaN/Infinity
        # unless finiteness is checked once here, at the one shared numeric entry point.
        raise InvariantViolation(f"CHART_FIELD_INVALID: {field} must be a finite number")
    return result


def _require_nonempty_list(value: Any, field: str, *, maximum: int) -> list[Any]:
    if not isinstance(value, list) or not value:
        raise InvariantViolation(f"CHART_FIELD_INVALID: {field} must be a non-empty list")
    if len(value) > maximum:
        raise InvariantViolation(f"CHART_FIELD_INVALID: {field} must have at most {maximum} entries")
    return value


def _optional_str(payload: dict[str, Any], key: str, default: str) -> str:
    value = payload.get(key)
    return value if isinstance(value, str) and value.strip() else default


def _render_forest_plot(payload: dict[str, Any]) -> "plt.Figure":
    rows = _require_nonempty_list(payload.get("rows"), "rows", maximum=MAX_ROWS)
    labels: list[str] = []
    estimates: list[float] = []
    err_low: list[float] = []
    err_high: list[float] = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise InvariantViolation(f"CHART_FIELD_INVALID: rows[{index}] must be an object")
        label = row.get("label")
        if not isinstance(label, str) or not label.strip():
            raise InvariantViolation(f"CHART_FIELD_INVALID: rows[{index}].label must be a non-empty string")
        estimate = _require_number(row.get("estimate"), f"rows[{index}].estimate")
        ci_low = _require_number(row.get("ci_low"), f"rows[{index}].ci_low")
        ci_high = _require_number(row.get("ci_high"), f"rows[{index}].ci_high")
        if not (ci_low <= estimate <= ci_high):
            raise InvariantViolation(f"CHART_FIELD_INVALID: rows[{index}] must satisfy ci_low <= estimate <= ci_high")
        labels.append(label)
        estimates.append(estimate)
        err_low.append(estimate - ci_low)
        err_high.append(ci_high - estimate)

    fig, ax = plt.subplots(figsize=(8, max(2.0, 0.5 * len(rows) + 1)))
    try:
        y_positions = list(range(len(rows)))
        ax.errorbar(estimates, y_positions, xerr=[err_low, err_high], fmt="o", color=_ACCENT, ecolor=_ACCENT, capsize=4, markersize=6)
        ax.axvline(0, color="#999999", linewidth=0.8, linestyle="--")
        ax.set_yticks(y_positions)
        ax.set_yticklabels(labels)
        ax.invert_yaxis()
        ax.set_title(_optional_str(payload, "title", "Forest Plot"))
        ax.set_xlabel(_optional_str(payload, "x_label", "Estimate (with confidence interval)"))
        fig.tight_layout()
    except Exception:
        # critic finding 2026-09-18: a title/label containing e.g. a bare "$$" throws inside
        # matplotlib's mathtext parser -- without this, the already-created fig is never closed
        # and leaks permanently in this process's global figure registry (Gcf), since the
        # caller-side try/finally around savefig() never runs (fig is never assigned there).
        plt.close(fig)
        raise
    return fig


def _render_bubble_chart(payload: dict[str, Any]) -> "plt.Figure":
    points = _require_nonempty_list(payload.get("points"), "points", maximum=MAX_POINTS)
    xs: list[float] = []
    ys: list[float] = []
    sizes: list[float] = []
    labels: list[str | None] = []
    for index, point in enumerate(points):
        if not isinstance(point, dict):
            raise InvariantViolation(f"CHART_FIELD_INVALID: points[{index}] must be an object")
        x = _require_number(point.get("x"), f"points[{index}].x")
        y = _require_number(point.get("y"), f"points[{index}].y")
        size = _require_number(point.get("size"), f"points[{index}].size")
        if size <= 0:
            raise InvariantViolation(f"CHART_FIELD_INVALID: points[{index}].size must be > 0")
        xs.append(x)
        ys.append(y)
        sizes.append(size)
        label = point.get("label")
        labels.append(label if isinstance(label, str) and label.strip() else None)

    max_size = max(sizes)
    scaled = [max(_MIN_BUBBLE_AREA, 3000.0 * (size / max_size)) for size in sizes]

    fig, ax = plt.subplots(figsize=(8, 6))
    try:
        ax.scatter(xs, ys, s=scaled, alpha=0.6, color=_ACCENT, edgecolors=_ACCENT_DARK, linewidths=1)
        for x, y, label in zip(xs, ys, labels):
            if label:
                ax.annotate(label, (x, y), fontsize=8, ha="center", va="center")
        ax.set_title(_optional_str(payload, "title", "Bubble Chart"))
        ax.set_xlabel(_optional_str(payload, "x_label", "X"))
        ax.set_ylabel(_optional_str(payload, "y_label", "Y"))
        fig.tight_layout()
    except Exception:
        plt.close(fig)  # same leak-on-exception guard as _render_forest_plot -- see its comment
        raise
    return fig


def _render_quadrant_chart(payload: dict[str, Any]) -> "plt.Figure":
    points = _require_nonempty_list(payload.get("points"), "points", maximum=MAX_POINTS)
    x_threshold = _require_number(payload.get("x_threshold"), "x_threshold")
    y_threshold = _require_number(payload.get("y_threshold"), "y_threshold")
    quadrant_labels = payload.get("quadrant_labels", {})
    if not isinstance(quadrant_labels, dict):
        raise InvariantViolation("CHART_FIELD_INVALID: quadrant_labels must be an object")
    for corner, text in quadrant_labels.items():
        if corner not in _QUADRANT_CORNERS:
            raise InvariantViolation(f"CHART_FIELD_INVALID: quadrant_labels key must be one of {sorted(_QUADRANT_CORNERS)}, got {corner!r}")
        if not isinstance(text, str) or not text.strip():
            raise InvariantViolation(f"CHART_FIELD_INVALID: quadrant_labels[{corner!r}] must be a non-empty string")

    xs: list[float] = []
    ys: list[float] = []
    labels: list[str | None] = []
    for index, point in enumerate(points):
        if not isinstance(point, dict):
            raise InvariantViolation(f"CHART_FIELD_INVALID: points[{index}] must be an object")
        xs.append(_require_number(point.get("x"), f"points[{index}].x"))
        ys.append(_require_number(point.get("y"), f"points[{index}].y"))
        label = point.get("label")
        labels.append(label if isinstance(label, str) and label.strip() else None)

    fig, ax = plt.subplots(figsize=(8, 6))
    try:
        ax.scatter(xs, ys, s=90, alpha=0.75, color=_ACCENT, edgecolors=_ACCENT_DARK, linewidths=1, zorder=3)
        for x, y, label in zip(xs, ys, labels):
            if label:
                ax.annotate(label, (x, y), fontsize=8, xytext=(5, 5), textcoords="offset points")
        ax.axvline(x_threshold, color="#999999", linewidth=1, linestyle="--", zorder=1)
        ax.axhline(y_threshold, color="#999999", linewidth=1, linestyle="--", zorder=1)
        for corner, text in quadrant_labels.items():
            spec = _QUADRANT_CORNERS[corner]
            ax.text(*spec["pos"], text, transform=ax.transAxes, ha=spec["ha"], va=spec["va"], fontsize=10, fontweight="bold", color=_ACCENT_DARK, alpha=0.8, zorder=2)
        ax.set_title(_optional_str(payload, "title", "Quadrant Chart"))
        ax.set_xlabel(_optional_str(payload, "x_label", "X"))
        ax.set_ylabel(_optional_str(payload, "y_label", "Y"))
        fig.tight_layout()
    except Exception:
        plt.close(fig)  # same leak-on-exception guard as _render_forest_plot -- see its comment
        raise
    return fig


_RENDERERS = {"forest_plot": _render_forest_plot, "bubble_chart": _render_bubble_chart, "quadrant_chart": _render_quadrant_chart}


def generate_chart_artifact(payload: dict[str, Any], _node: dict[str, Any]) -> dict[str, Any]:
    chart_type = payload.get("chart_type")
    if not isinstance(chart_type, str) or chart_type not in CHART_TYPES:
        # isinstance guard first: a bare `in` test on an unhashable value (list/dict) raises
        # TypeError instead of this function's own documented InvariantViolation (critic finding
        # 2026-09-18) -- every other check in this module isinstance-guards before a type-specific
        # operation; this is the one that didn't.
        raise InvariantViolation(f"CHART_TYPE_INVALID: chart_type must be one of {sorted(CHART_TYPES)}, got {chart_type!r}")
    with _RENDER_LOCK:
        fig = _RENDERERS[chart_type](payload)
        try:
            buffer = io.BytesIO()
            fig.savefig(buffer, format="png", dpi=150)
        finally:
            plt.close(fig)
    return {"artifact": {"artifact_type": "image/png", "content": base64.b64encode(buffer.getvalue()).decode("ascii")}}
