"""Create deterministic draft lessons from the existing tool pages.

Usage::

    python -m ai_lego.apps.cli.generate_lessons systems.iceberg_model framing.problem_statement learning.after_action_review

The command has no model dependency.  It reads the same catalog summary and
one-click example that the tool page and run form already use, then refuses to
replace an existing content file.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Any

import yaml

from ai_lego import resolve_spec_root
from ai_lego.apps.api.method_form import load_examples
from ai_lego.errors import InvariantViolation
from ai_lego.platform.catalog.display_catalog import load_catalog
from ai_lego.platform.lessons import validate_lesson


_CJK = re.compile(r"[\u3400-\u9fff]")


def tool_page_content(tool_id: str, spec_root: Path | str | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    """Read the existing tool-page summary and its example without duplicating either registry."""
    root = resolve_spec_root(spec_root)
    catalog = load_catalog(root)
    method = catalog.methods.get(tool_id)
    if not isinstance(method, dict):
        raise ValueError(f"BLOCKED: {tool_id} — tool is not in the page catalog")
    example = load_examples(root).get(tool_id)
    if not isinstance(example, dict) or not isinstance(example.get("scenario"), str) or not example["scenario"].strip():
        raise ValueError(f"BLOCKED: {tool_id} — page has no usable example")
    if not isinstance(method.get("name_zh"), str) or not method["name_zh"].strip() or not isinstance(method.get("blurb_zh"), str) or not method["blurb_zh"].strip():
        raise ValueError(f"BLOCKED: {tool_id} — page text is not usable")
    return method, example


def _example_values(value: Any, found: list[str]) -> None:
    if isinstance(value, str):
        clean = value.strip()
        if clean and _CJK.search(clean) and clean not in found:
            found.append(clean)
    elif isinstance(value, dict):
        for child in value.values():
            _example_values(child, found)
    elif isinstance(value, list):
        for child in value:
            _example_values(child, found)


def _sentence(text: str) -> str:
    clean = " ".join(text.strip().split())
    return clean if clean.endswith(("。", "！", "？")) else clean + "。"


def draft_for_tool(tool_id: str, spec_root: Path | str | None = None) -> dict[str, Any]:
    method, example = tool_page_content(tool_id, spec_root)
    values: list[str] = []
    _example_values(example.get("input"), values)
    example_lines = [_sentence(example["scenario"])]
    for value in values[:3]:
        if value != example["scenario"].strip():
            example_lines.append(_sentence(value))
    document = {
        "id": tool_id,
        "subject": tool_id,
        "version": 1,
        "state": "draft",
        "minutes": 5,
        "title": f"{method['name_zh']}：開始前 5 分鐘",
        "text": _sentence(f"{method['name_zh']}是用來整理問題的工具。{method['blurb_zh']}"),
        "example": "示範案例：" + "".join(example_lines),
        "teaches": [method["name_zh"]],
    }
    validate_lesson(document, f"generated:{tool_id}")
    return document


def _write_yaml(path: Path, document: dict[str, Any]) -> None:
    payload = yaml.safe_dump(document, allow_unicode=True, sort_keys=False, default_flow_style=False, width=120)
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(payload)


def generate_lessons(tool_ids: list[str], output_dir: Path | str | None = None, spec_root: Path | str | None = None) -> list[str]:
    target = Path(output_dir) if output_dir is not None else Path(__file__).resolve().parents[2] / "platform" / "lessons" / "lessons"
    target.mkdir(parents=True, exist_ok=True)
    report: list[str] = []
    for tool_id in sorted(dict.fromkeys(tool_ids)):
        path = target / f"{tool_id}.yaml"
        if path.exists():
            report.append(f"SKIP {tool_id}: already exists")
            continue
        try:
            document = draft_for_tool(tool_id, spec_root)
            _write_yaml(path, document)
        except ValueError as exc:
            report.append(str(exc))
            continue
        except InvariantViolation as exc:
            report.append(f"BLOCKED: {tool_id} — {exc}")
            continue
        report.append(f"CREATED {path.name}: draft")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="從工具頁產生不覆寫的中文課程草稿")
    parser.add_argument("tools", nargs="+", help="工具 id")
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--spec-root", type=Path)
    args = parser.parse_args(argv)
    for line in generate_lessons(args.tools, args.output_dir, args.spec_root):
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
