"""One synthesis runner for all three lines (P2 WC-P2-05, P-h).

``run_synthesis`` turns a project's Source manifest into a schema-valid
``dossier_brief`` / ``decision_evidence`` / ``literature_matrix`` typed object
(P-d), gated by the same ``citation_integrity`` gate every AI claim in this
system goes through (``gates.evaluate_citation_integrity``, P2 WC-01).

Prompt text is version-controlled data, never a literal in this module
(P-K4): the system prompt, per-kind ``output_schema_id`` and (dossier only)
``section_headings`` all come from ``evolution.registry.load_champion(spec_root,
"synthesis-prompts")`` -- promoting or rolling back a prompt is an offline CLI
operation (P-K5), this module only ever reads the current champion.

Two-attempt repair, exactly the ``run_interpretation`` shape (``interpret_
method_record.py``): a rejected first answer (schema failure or a failed
``citation_integrity`` gate) gets one retry with the failure reason appended
to the same user prompt; token usage accumulates across every model call,
including a rejected first attempt, and is returned even when both attempts
fail.

More than one manifest batch (>40 active Sources, ``source_manifest.
DEFAULT_BATCH_SIZE``) runs a map/reduce: one call per batch (same system
prompt, that batch's ``<<<SOURCE n BEGIN>>>`` blocks only) whose raw text
answers become data blocks for a single reduce call that also sees the full
manifest listing so it can cite by any batch's id, not only its own. Only the
reduce call goes through the two-attempt repair loop -- a map call's answer is
never schema-validated on its own, it is only ever reduce's input. Total calls
in the no-repair path: ``len(batches) + 1``.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Mapping

from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_citation_integrity, synthesis_reference_errors
from ai_lego.modules.research.source_manifest import (
    build_source_manifest,
    manifest_errors,
    new_fence_nonce,
    render_source_block,
    resolve_citation_numbers,
)
from ai_lego.platform.ai_gateway.draft import extract_json_object
from ai_lego.platform.ai_gateway.provider import MAX_OUTPUT_TOKENS
from ai_lego.platform.evolution.registry import load_champion

EVOLUTION_KIND = "synthesis-prompts"


def _flatten_sources(sources: list[Mapping[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """``{"row": <repo.list_sources row>, "text": <full text>}`` -> the flat dict
    ``build_source_manifest`` wants, plus a ``source_id -> text`` map for rendering
    blocks. ``build_source_manifest`` already falls back ``content_sha256``/
    ``sha256`` and ``url``/``canonical_url`` -- the real repo row's own column
    names (``content_sha256``, ``canonical_url``) pass through unchanged."""
    flattened: list[dict[str, Any]] = []
    text_by_id: dict[str, str] = {}
    for item in sources:
        text = item.get("text") or ""
        row = item["row"]
        flattened.append({**row, "text": text})
        text_by_id[row["source_id"]] = text
    return flattened, text_by_id


SUBJECT_KINDS = {"person", "company", "event"}


def _server_subject(subject: Mapping[str, Any]) -> dict[str, Any]:
    """The dossier subject is the caller's, never the model's -- a renamed subject would be a different
    dossier. Validated here, before any paid call, so a bad subject cannot burn two repair attempts."""
    name = subject.get("name") if isinstance(subject, Mapping) else None
    subject_kind = subject.get("kind") if isinstance(subject, Mapping) else None
    anchors = subject.get("anchors") if isinstance(subject, Mapping) else None
    anchors_ok = anchors is None or (isinstance(anchors, list) and all(isinstance(a, str) and a.strip() for a in anchors))
    if not isinstance(name, str) or not name.strip() or subject_kind not in SUBJECT_KINDS or not anchors_ok:
        raise InvariantViolation(f"SYNTHESIS_SUBJECT_INVALID: dossier_brief needs subject{{name, kind in {sorted(SUBJECT_KINDS)}, anchors: list of non-empty strings}}, got {subject!r}")
    return {"name": name, "kind": subject_kind, "anchors": list(anchors or [])}


def _kind_headings(kind: str, subject: Mapping[str, Any], prompt: Mapping[str, Any]) -> list[str]:
    if kind != "dossier_brief":
        return []
    headings = prompt.get("section_headings")
    subject_kind = subject.get("kind") if isinstance(subject, Mapping) else None
    kind_headings = headings.get(subject_kind) if isinstance(headings, Mapping) else None
    return list(kind_headings or [])


def _subject_lines(kind: str, subject: Mapping[str, Any], prompt: Mapping[str, Any], language: str, *, source_count: int) -> list[str]:
    """The user message opens with the champion's ``user_intro`` (P-j; P-K4: prompt prose, kind labels and the
    two anchors_line variants are all data) formatted with the run's facts, then the structured lines the runner
    owns. ``subject_name`` = dossier ``name``, decision/literature ``question``."""
    anchors = subject.get("anchors") or []
    kind_labels = prompt.get("kind_labels") if isinstance(prompt.get("kind_labels"), Mapping) else {}
    anchors_variants = prompt.get("anchors_line") if isinstance(prompt.get("anchors_line"), Mapping) else {}
    anchors_template = anchors_variants.get("present" if anchors else "absent")
    fields = {
        "subject_name": str(subject.get("name") or subject.get("question") or ""),
        "subject_kind_label": str(kind_labels.get(subject.get("kind"), subject.get("kind") or "")),
        "anchors_line": anchors_template.format_map(_SafeFields({"anchors": "、".join(str(a) for a in anchors)})) if isinstance(anchors_template, str) else "",
        "section_headings": "、".join(_kind_headings(kind, subject, prompt)),
        "source_count": source_count,
        "language": language,
    }
    lines: list[str] = []
    intro = prompt.get("user_intro")
    if isinstance(intro, str) and intro.strip():
        lines.append(intro.format_map(_SafeFields(fields)))
    lines.append("SUBJECT: " + json.dumps(dict(subject), ensure_ascii=False, sort_keys=True))
    lines.append(f"LANGUAGE: {language}")
    if kind == "dossier_brief":
        lines.append("SECTION_HEADINGS: " + json.dumps(_kind_headings(kind, subject, prompt), ensure_ascii=False))
    return lines


class _SafeFields(dict):
    """format_map helper: an unknown placeholder in the champion text stays visible instead of raising."""

    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def _manifest_listing(entries: list[dict[str, Any]]) -> str:
    return "\n".join(f"[{entry['n']}] {entry['id']} {entry.get('title') or ''}".rstrip() for entry in entries)


def _derive_study_source_ids(synthesis: dict[str, Any]) -> None:
    """literature_matrix: ``studies[].source_id`` is the raw id of the study's single citation -- derived here,
    whatever the model wrote (the model never sees ids, P-K2); ``synthesis_reference_errors`` then checks the
    pair. A study with zero or several citations is left for that check to report."""
    for study in synthesis.get("studies") or []:
        if not isinstance(study, dict):
            continue
        citations = study.get("citations")
        if isinstance(citations, list) and len(citations) == 1 and isinstance(citations[0], str) and citations[0].startswith("source:"):
            study["source_id"] = citations[0].removeprefix("source:")


def run_synthesis(
    *,
    kind: str,
    project_id: str,
    subject: Mapping[str, Any],
    sources: list[Mapping[str, Any]],
    provider: Any,
    spec_root: Path,
    schema_contracts: SchemaContracts,
    synthesis_id: str,
    language: str = "zh-TW",
) -> dict[str, Any]:
    flattened, text_by_id = _flatten_sources(sources)
    manifest = build_source_manifest(flattened)
    problems = manifest_errors(manifest)
    if problems:
        raise InvariantViolation("SYNTHESIS_MANIFEST_INVALID: " + "; ".join(problems))
    entries = manifest["entries"]
    entries_by_n = {entry["n"]: entry for entry in entries}
    manifest_ids = {entry["id"] for entry in entries}
    raw_batches = manifest["batches"]
    if not entries:
        # Fail closed before any model call: with no active Source nothing can be cited, so every answer
        # would fail the gate -- two paid attempts would only prove that (WC-P2-06: 零 Sources 不呼叫模型).
        return {"artifact": None, "error": "SYNTHESIS_NO_SOURCES: the project has no active Source to synthesize from", "model": provider.model, "input_tokens": 0, "output_tokens": 0}
    call_batches = raw_batches
    server_subject = _server_subject(subject) if kind == "dossier_brief" else None

    version, champion_doc = load_champion(spec_root, EVOLUTION_KIND)
    prompts = champion_doc.get("prompts") if isinstance(champion_doc, Mapping) else None
    prompt = prompts.get(kind) if isinstance(prompts, Mapping) else None
    if not isinstance(prompt, Mapping):
        raise InvariantViolation(f"SYNTHESIS_UNKNOWN_KIND: {kind!r} is not in the synthesis-prompts champion ({version})")
    system = prompt.get("system")
    schema_id = prompt.get("output_schema_id")
    if not isinstance(system, str) or not system.strip() or not isinstance(schema_id, str) or not schema_id.strip():
        raise InvariantViolation(f"SYNTHESIS_PROMPT_MALFORMED: {kind!r} champion entry has no system/output_schema_id")

    subject_lines = _subject_lines(kind, server_subject if server_subject is not None else subject, prompt, language, source_count=len(entries))
    started = time.monotonic()

    def fenced_prompt(batch_ns: list[int], *, prefix: list[str]) -> str:
        """One fence code per prompt (v1.yaml rule 5): the model is told the code, every SOURCE block carries it,
        and a fetched page cannot know it in advance."""
        nonce = new_fence_nonce()
        blocks = [render_source_block(entries_by_n[n], text_by_id.get(entries_by_n[n]["source_id"], ""), nonce=nonce) for n in batch_ns]
        return "\n\n".join(subject_lines + prefix + [f"FENCE CODE: {nonce}"] + blocks)

    total_input = 0
    total_output = 0

    if len(call_batches) > 1:
        map_outputs: list[str] = []
        for batch in call_batches:
            user = fenced_prompt(batch, prefix=[])
            try:
                completion = provider.complete(system, user, max_tokens=MAX_OUTPUT_TOKENS)
            except InvariantViolation as error:
                return {"artifact": None, "error": str(error), "model": provider.model, "input_tokens": total_input, "output_tokens": total_output}
            total_input += completion.input_tokens
            total_output += completion.output_tokens
            map_outputs.append(completion.text)
        # A map answer was written from fetched pages, so it gets the same per-prompt fence code as a SOURCE block.
        reduce_nonce = new_fence_nonce()
        map_blocks = [f"<<<MAP {index} BEGIN {reduce_nonce}>>>\n{text}\n<<<MAP {index} END {reduce_nonce}>>>" for index, text in enumerate(map_outputs, start=1)]
        reduce_intro = prompt.get("reduce_intro")
        reduce_lines = [reduce_intro.format_map(_SafeFields({"map_count": len(map_outputs)}))] if isinstance(reduce_intro, str) and reduce_intro.strip() else []
        base_user = "\n\n".join(subject_lines + reduce_lines + ["FULL MANIFEST:\n" + _manifest_listing(entries), f"FENCE CODE: {reduce_nonce}"] + map_blocks)
    else:
        base_user = fenced_prompt(call_batches[0], prefix=[])

    previous_error = ""
    for _attempt in range(2):
        user = base_user if not previous_error else base_user + "\n\nPrevious response was refused. Correct exactly this failure: " + previous_error
        try:
            completion = provider.complete(system, user, max_tokens=MAX_OUTPUT_TOKENS)
        except InvariantViolation as error:
            return {"artifact": None, "error": str(error), "model": provider.model, "input_tokens": total_input, "output_tokens": total_output}
        total_input += completion.input_tokens
        total_output += completion.output_tokens
        try:
            synthesis = resolve_citation_numbers(extract_json_object(completion.text), entries)
            synthesis.update({
                "synthesis_id": synthesis_id,
                "project_id": project_id,
                "kind": kind,
                "language": language,
                "manifest_ref": {"sha256": manifest["sha256"], "count": len(entries), "batches": len(raw_batches)},
                "provenance": {"epistemic_type": "AI_INFERENCE", "authorship_state": "AI_GENERATED", "locked": None},
                "model": completion.model,
                "usage": {"input_tokens": total_input, "output_tokens": total_output},
            })
            if server_subject is not None:
                synthesis["subject"] = dict(server_subject)
            if kind == "literature_matrix":
                _derive_study_source_ids(synthesis)
            gate = evaluate_citation_integrity(synthesis, manifest_ids)
            synthesis["uncited_sections"] = list(gate["evidence"]["uncited_sections"])  # the gate's one definition (P-K3)
            schema_contracts.validate(schema_id, synthesis, f"Synthesis:{kind}")
            if gate["status"] != "PASS":
                raise InvariantViolation("SYNTHESIS_GATE_FAILED: " + json.dumps(gate["evidence"], ensure_ascii=False))
            reference_errors = synthesis_reference_errors(synthesis)
            if reference_errors:
                raise InvariantViolation("SYNTHESIS_REFERENCE_ERRORS: " + "; ".join(reference_errors))
            return {
                "artifact": {"synthesis": synthesis, "manifest": manifest, "gate_results": [gate], "prompt_version": version, "latency_ms": round((time.monotonic() - started) * 1000.0, 3)},
                "error": None,
                "model": completion.model,
                "input_tokens": total_input,
                "output_tokens": total_output,
            }
        except (InvariantViolation, KeyError, TypeError) as error:
            previous_error = str(error)
    return {"artifact": None, "error": f"SYNTHESIS_REJECTED_AFTER_REPAIR: {previous_error}", "model": provider.model, "input_tokens": total_input, "output_tokens": total_output}
