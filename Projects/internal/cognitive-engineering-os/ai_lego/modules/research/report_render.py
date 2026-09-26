"""Pure report renderer: synthesis artifact + recipe run results -> a versioned research report.

RESEARCH_LINES_MASTER_PLAN.md §3.4-C6 / §2-I5 (WC-P4-01, early). No endpoint, no PDF, no
``report_state`` promotion here -- those are later P4 work. Every citation collected ANYWHERE in
the synthesis (not just the ones this renderer turns into prose -- see ``_collect_citations``)
must resolve to a manifest entry that itself carries a real 64-hex ``sha256`` (I5: every ``[n]``
resolves to source id + sha256 + url + fetched_at; url/fetched_at may be null per P-a, sha256 may
not), or the ``report_refs_resolvable`` gate FAILs. Unresolved ids are flagged inline
(``[INVALID:<id>]``) rather than softened to ``[?]`` the way NA/lib/dossier/report.ts does
(deliberately stricter, I3). The gate also FAILs if the upstream ``citation_integrity`` gate is
missing/not PASS, or if the synthesis's own ``manifest_ref`` does not match the manifest actually
passed in -- a report is only as trustworthy as the manifest it claims to be bound to.

``run_results`` is the body of ``GET /recipes/{id}/runs/{run_id}/result``
(``main.py:782-802``): its ``status`` is the durable journal status
``RUNNING|FAILED|SUCCEEDED`` (``workflow-journal.schema.yaml``), not a PASS/FAIL verdict. This
renderer derives that verdict itself, the same way ``main.py:760-763`` does for its own synthetic
endpoint, and that derived verdict -- not the raw journal status -- is what ``run_refs[].status``
carries (schema enum ``PASS|GATE_FAILED|FAILED``).
"""

from __future__ import annotations

import re
from typing import Any

from ai_lego.core.support import canonical_json
from ai_lego.errors import InvariantViolation

_SHA256_RE = re.compile(r"^[a-f0-9]{64}$")

_HEADINGS = {
    "zh-TW": {
        "summary": "彙整摘要", "conflicts": "矛盾來源", "gaps": "待補證據", "run": "執行記錄",
        "gates": "閘結果", "appendix": "來源", "problems": "本報表的問題", "none": "無",
    },
    "en": {
        "summary": "Summary", "conflicts": "Conflicting Sources", "gaps": "Open Gaps", "run": "Run Record",
        "gates": "Gate Results", "appendix": "Sources", "problems": "Report Problems", "none": "none",
    },
}

# D14: core P-d fields this renderer already turns into their own prose/section. Every OTHER
# top-level synthesis key that is a non-empty list of dicts is a line-specific structural field
# (related_entities / options / criteria / evidence / studies / ...) and gets the one generic table
# rule in ``_structural_sections`` instead of a hand-written renderer per line.
_CORE_SYNTHESIS_KEYS = {"summary", "sections", "gaps", "conflicts", "uncited_sections", "manifest_ref", "provenance", "usage"}


def _headings(language: str) -> dict[str, str]:
    return _HEADINGS["zh-TW"] if language.startswith("zh") else _HEADINGS["en"]


def _valid_sha256(value: Any) -> bool:
    return isinstance(value, str) and _SHA256_RE.fullmatch(value) is not None


_MARKDOWN_PUNCTUATION_RE = re.compile(r"([!-/:-@\[-`{-~])")


def _literal(value: Any) -> str:
    """Every data value reaches the markdown ONLY through here, and comes out as literal text:
    line breaks collapse to a space (no new heading/list/table line), and every ASCII punctuation
    character -- backslash first, since it is in the class -- is backslash-escaped (CommonMark
    allows escaping any ASCII punctuation; the rendered characters are unchanged). So a collected
    page cannot add a heading, a link, raw HTML, emphasis or a table column (Codex rounds 1-3 hit
    one call site at a time; this is the single rule they were all instances of)."""
    text = "" if value is None else str(value)
    text = text.replace("\r\n", " ").replace("\n", " ").replace("\r", " ")
    return _MARKDOWN_PUNCTUATION_RE.sub(r"\\\1", text)


def _collect_citations(node: Any, order: list[str], seen: set[str], malformed: list[str]) -> None:
    """Walk a synthesis object collecting every citation id, first-appearance order preserved.

    Recurses into every dict/list, not just the fields this renderer turns into prose --
    ``related_entities`` / ``options`` / ``criteria`` / ``evidence`` / ``studies`` and any other
    ``citations``-bearing structural field (P-b: "任一含 citations 鍵的物件") are covered the same
    way as ``summary``/``sections``/``conflicts``, so the resolvability gate below sees all of them.

    Fails open on purpose is what this used to do and no longer does: a non-str element inside a
    ``citations`` list, or a ``citations`` value that is not a list at all, is a type violation, not
    a candidate citation -- stringified into ``malformed`` and ALWAYS treated as unresolvable, even
    on the (coincidental) chance its string form happens to equal a real manifest id.
    """
    if isinstance(node, dict):
        if "citations" in node:
            citations = node["citations"]
            if isinstance(citations, list) and not citations:
                if "[]" not in malformed:  # P-b: a citations key holds a NON-empty list
                    malformed.append("[]")
            elif isinstance(citations, list):
                for cid in citations:
                    if isinstance(cid, str):
                        if cid not in seen:
                            seen.add(cid)
                            order.append(cid)
                    elif str(cid) not in malformed:
                        malformed.append(str(cid))
            elif str(citations) not in malformed:  # null counts: P-b says a citations key holds a non-empty list
                malformed.append(str(citations))
        for value in node.values():
            _collect_citations(value, order, seen, malformed)
    elif isinstance(node, list):
        for item in node:
            _collect_citations(item, order, seen, malformed)


def _citation_marks(citations: Any, resolvable_by_id: dict[str, dict[str, Any]]) -> str:
    """One ``[n]``/``[INVALID:<id>]`` marker per citation. Never iterates a non-list (a bare string
    is iterable character-by-character in Python -- that was the second half of the same bug)."""
    if citations is None:
        return ""
    if not isinstance(citations, list) or not citations:
        # Malformed: the gate already FAILs on it (``_collect_citations``); flag it inline too, so
        # the body never looks clean while the gate says it is not (Codex oracle round 2).
        return f"[INVALID:{_literal(citations)}]"
    marks = []
    for cid in citations:
        key = cid if isinstance(cid, str) else str(cid)
        marks.append(f"[{resolvable_by_id[key]['n']}]" if key in resolvable_by_id else f"[INVALID:{_literal(key)}]")
    return "".join(marks)


def _cite_markdown(text: str, citations: Any, resolvable_by_id: dict[str, dict[str, Any]]) -> str:
    """Flatten ``text`` (no injected headings) and append its citation markers, ``n`` taken from
    the manifest entry itself.

    An id absent from ``resolvable_by_id`` (unknown, or known but missing a real sha256 -- see
    ``_valid_sha256``) is NOT rewritten to a soft ``[?]`` (report.ts's move); it stays visible as
    ``[INVALID:<id>]``. Whether it FAILs the gate is decided once, globally, in
    ``render_research_report`` from every citation ``_collect_citations`` found -- not from which
    text happens to pass through this function.
    """
    flat_text = _literal(text)
    marks = _citation_marks(citations, resolvable_by_id)
    return flat_text if not marks else f"{flat_text} {marks}"


def _table(header: list[str], rows: list[list[Any]], *, marks_column: bool = False) -> list[str]:
    """Every cell through ``_literal``, except a trailing citation-marks column (``marks_column``):
    those ``[n]``/``[INVALID:...]`` marks are this module's own syntax, built with the ids already
    passed through ``_literal`` in ``_citation_marks``."""
    lines = ["| " + " | ".join(_literal(cell) for cell in header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    for row in rows:
        cells = [_literal(cell) for cell in (row[:-1] if marks_column else row)] + ([row[-1]] if marks_column else [])
        lines.append("| " + " | ".join(cells) + " |")
    return lines


def _structural_sections(synthesis: dict[str, Any], resolvable_by_id: dict[str, dict[str, Any]]) -> list[dict[str, str]]:
    """D14: one generic rule, not one renderer per P-d line -- every top-level synthesis key that is
    a non-empty list of dicts and is not a core field (``_CORE_SYNTHESIS_KEYS``) becomes one table,
    columns = the union of that list's own field names (first-appearance order) plus a trailing
    ``citations`` column of resolved ``[n]``/``[INVALID:...]`` marks."""
    result = []
    for key, value in synthesis.items():
        if key in _CORE_SYNTHESIS_KEYS or not isinstance(value, list) or not value or not all(isinstance(item, dict) for item in value):
            continue
        fields: list[str] = []
        for item in value:
            for field in item:
                if field != "citations" and field not in fields:
                    fields.append(field)
        header = fields + ["citations"]
        rows = [[item.get(field) for field in fields] + [_citation_marks(item.get("citations"), resolvable_by_id)] for item in value]
        result.append({"heading": key, "lines": _table(header, rows, marks_column=True)})
    return result


def _run_verdict(run_result: dict[str, Any]) -> str:
    """Derive PASS/GATE_FAILED/FAILED from the durable journal status, exactly like
    ``main.py:760-763`` does for its own synthetic endpoint. ``RUNNING`` is not a verdict this
    renderer can honestly give -- a report over an unfinished run refuses instead of guessing."""
    status = run_result.get("status")
    if status == "RUNNING":
        raise InvariantViolation("REPORT_RUN_NOT_FINISHED")
    if status != "SUCCEEDED":
        return "FAILED"
    workflow = run_result.get("workflow") or {}
    gates_ok = all(
        gate.get("status") in {"PASS", "NOT_APPLICABLE"}
        for step in workflow.get("steps") or []
        for gate in step.get("gates") or []
    ) and all(
        gate.get("status") in {"PASS", "NOT_APPLICABLE"}
        for gate in workflow.get("workflow_gates") or []
    )
    return "PASS" if gates_ok else "GATE_FAILED"


def _run_section(run_result: dict[str, Any], heading: str, verdict: str) -> dict[str, str]:
    """One markdown table per run: every step, including failed ones, keeps its own row and status."""
    workflow = run_result.get("workflow") or {}
    rows = []
    for step in workflow.get("steps") or []:
        output = step.get("output")
        rows.append([step.get("index"), step.get("label", ""), step.get("node_kind", ""), step.get("status", ""), canonical_json(output) if output is not None else ""])
    title = f"{heading}：{run_result.get('recipe_id')} / {run_result.get('run_id')}（{verdict}）"
    return {"heading": title, "lines": _table(["index", "label", "node_kind", "status", "output"], rows)}


def _gate_section(heading: str, synthesis_gate_results: list[dict[str, Any]], run_results: list[dict[str, Any]]) -> dict[str, str]:
    rows = [["synthesis", gate.get("gate_id"), gate.get("status")] for gate in synthesis_gate_results or []]
    for run_result in run_results:
        workflow = run_result.get("workflow") or {}
        run_id = run_result.get("run_id")
        for gate in workflow.get("workflow_gates") or []:
            rows.append([f"run:{run_id}", gate.get("gate_id", gate.get("id")), gate.get("status")])
        for step in workflow.get("steps") or []:
            for gate in step.get("gates") or []:
                rows.append([f"run:{run_id} step:{step.get('index')}", gate.get("gate_id", gate.get("id")), gate.get("status")])
    return {"heading": heading, "lines": _table(["source", "gate_id", "status"], rows)}


def _appendix_line(entry: dict[str, Any], none_label: str) -> str:
    # Title/url/fetched_at come from collected pages: flattened like claim text, or a title such as
    # "x\n\n## Forged" would add a heading to the exported report (Codex oracle 2026-09-26).
    url = _literal(entry["url"]) if entry["url"] else none_label
    fetched_at = _literal(entry["fetched_at"]) if entry["fetched_at"] else none_label
    return f"[{entry['n']}] {_literal(entry['title'])} — {url} — {entry['sha256_12']} — {fetched_at}"


def _appendix_section(heading: str, sources_appendix: list[dict[str, Any]], none_label: str) -> dict[str, str]:
    lines = [_appendix_line(entry, none_label) for entry in sources_appendix]
    return {"heading": heading, "lines": lines or [none_label]}


def _problems_section(heading: str, invalid_refs: list[str], uncited_sections: list[str], none_label: str) -> dict[str, str]:
    lines = []
    if invalid_refs:
        lines.append("- invalid_refs: " + ", ".join(_literal(ref) for ref in invalid_refs))
    if uncited_sections:
        lines.append("- uncited_sections: " + ", ".join(_literal(name) for name in uncited_sections))
    return {"heading": heading, "lines": lines or [none_label]}


def _seal_section(section: dict[str, Any]) -> dict[str, str]:
    """The one sink where a section becomes markdown. Invariant: markdown structure (headings, list
    items, table rows) comes only from this module; no data value may carry a line break into it.
    The heading is flattened here; a body line holding a CR/LF means some builder inserted data
    without ``_literal`` -- refuse rather than emit a forged heading or appendix
    (Codex oracle 2026-09-26 found three such call sites one by one; this closes the class)."""
    heading = _literal(section["heading"])
    lines = section["lines"]
    if any("\n" in line or "\r" in line for line in lines):
        raise InvariantViolation(f"REPORT_LINE_BREAK_FROM_DATA: section {heading!r}")
    return {"heading": heading, "markdown": "\n".join(lines)}


def render_research_report(
    *,
    report_id: str,
    project_id: str,
    synthesis_artifact: dict[str, Any],
    run_results: list[dict[str, Any]],
    language: str = "zh-TW",
    version: int = 1,
) -> dict[str, Any]:
    headings = _headings(language)
    synthesis = synthesis_artifact["synthesis"]
    manifest = synthesis_artifact["manifest"]
    by_id = {entry["id"]: entry for entry in manifest["entries"]}
    resolvable_by_id = {cid: entry for cid, entry in by_id.items() if _valid_sha256(entry.get("sha256"))}

    run_verdicts = [_run_verdict(run_result) for run_result in run_results]

    cited_order: list[str] = []
    malformed_citations: list[str] = []
    _collect_citations(synthesis, cited_order, set(), malformed_citations)
    invalid_refs = [cid for cid in cited_order if cid not in resolvable_by_id] + malformed_citations

    sections: list[dict[str, Any]] = []

    summary = synthesis.get("summary") or {}
    sections.append({"heading": headings["summary"], "lines": [_cite_markdown(summary.get("text", ""), summary.get("citations"), resolvable_by_id)]})

    for section in synthesis.get("sections") or []:
        claim_lines = ["- " + _cite_markdown(claim.get("text", ""), claim.get("citations"), resolvable_by_id) for claim in section.get("claims") or []]
        sections.append({"heading": section.get("heading", ""), "lines": claim_lines})

    conflict_lines = ["- " + _cite_markdown(conflict.get("text", ""), conflict.get("citations"), resolvable_by_id) for conflict in synthesis.get("conflicts") or []]
    if conflict_lines:
        sections.append({"heading": headings["conflicts"], "lines": conflict_lines})

    # P-b: gaps carry no citations; if one does anyway, its marks are shown like any other claim's,
    # so no appendix entry is cited only by something the body never displays (Codex round 5).
    gap_lines = [
        "- " + _cite_markdown(f"{gap.get('text', '')}（{gap.get('needed_evidence', '')}）", gap.get("citations"), resolvable_by_id)
        for gap in synthesis.get("gaps") or []
    ]
    if gap_lines:
        sections.append({"heading": headings["gaps"], "lines": gap_lines})

    sections.extend(_structural_sections(synthesis, resolvable_by_id))

    for run_result, verdict in zip(run_results, run_verdicts):
        sections.append(_run_section(run_result, headings["run"], verdict))

    sections.append(_gate_section(headings["gates"], synthesis_artifact.get("gate_results") or [], run_results))

    cited_entries = {cid: resolvable_by_id[cid] for cid in cited_order if cid in resolvable_by_id}
    sources_appendix = [
        {
            "n": entry["n"],
            "source_id": entry["source_id"],
            "title": entry.get("title"),
            "url": entry.get("url"),
            "sha256_12": entry["sha256"][:12],
            "fetched_at": entry.get("fetched_at"),
        }
        for entry in sorted(cited_entries.values(), key=lambda e: e["n"])
    ]
    uncited_sections = list(synthesis.get("uncited_sections") or [])

    # C6: the exported markdown itself must carry the appendix and the problems section, not just
    # the structured fields -- appended last, in this fixed order (§C6, §12.8 F3).
    sections.append(_appendix_section(headings["appendix"], sources_appendix, headings["none"]))
    sections.append(_problems_section(headings["problems"], invalid_refs, uncited_sections, headings["none"]))

    run_refs = [
        {"recipe_id": run_result["recipe_id"], "run_id": run_result["run_id"], "status": verdict}
        for run_result, verdict in zip(run_results, run_verdicts)
    ]

    sections = [_seal_section(section) for section in sections]
    markdown = "\n\n".join(f"## {section['heading']}\n\n{section['markdown']}" for section in sections)

    manifest_ref = synthesis.get("manifest_ref") or {}
    manifest_bound = (
        _valid_sha256(manifest.get("sha256"))
        and manifest_ref.get("sha256") == manifest["sha256"]
        and manifest_ref.get("count") == len(manifest["entries"])
    )

    upstream_gate_results = synthesis_artifact.get("gate_results") or []
    citation_integrity_upstream_pass = any(
        gate.get("gate_id") == "citation_integrity" and gate.get("status") == "PASS"
        for gate in upstream_gate_results
    )

    report = {
        "report_id": report_id,
        "project_id": project_id,
        "version": version,
        "report_state": "AI_GENERATED",
        "synthesis_ref": {"synthesis_id": synthesis["synthesis_id"], "manifest_sha256": manifest["sha256"]},
        "run_refs": run_refs,
        "sections": sections,
        "sources_appendix": sources_appendix,
        "problems": {"invalid_refs": invalid_refs, "uncited_sections": uncited_sections},
        "markdown": markdown,
        "provenance": {"epistemic_type": "AI_INFERENCE", "authorship_state": "AI_GENERATED", "locked": None},
    }
    gate_ok = not invalid_refs and citation_integrity_upstream_pass and manifest_bound
    gate_results = [{
        "gate_id": "report_refs_resolvable",
        "status": "PASS" if gate_ok else "FAIL",
        "evidence": {
            "invalid_refs": list(invalid_refs),
            "cited_ids": sorted(cited_entries),
            "citation_integrity_upstream_pass": citation_integrity_upstream_pass,
            "manifest_bound": manifest_bound,
        },
    }]
    return {"report": report, "gate_results": gate_results}
