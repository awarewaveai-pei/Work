"""P-f's eight fixed metrics for one already-produced synthesis artifact (P-c) against one case's expected.yaml.

Offline (C8, P-K6): never calls a model, never fetches a network resource. Every check re-derives its answer
from the artifact's own structure (manifest ids, citations, gap/conflict text) and the case's own
``sources/*.txt`` snapshot -- never from a self-reported field a producer could fake (e.g. the artifact's own
``gate_results`` is not trusted here; citation validity is recomputed from ``manifest.entries`` directly).
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ai_lego.modules.research.gates import claim_citations, evaluate_citation_integrity, iter_claims  # noqa: E402
from ai_lego.platform.catalog.display_catalog import _yaml  # noqa: E402
from ai_lego.platform.text.terms import terms_of  # noqa: E402

METRIC_NAMES = (
    "citation_precision_auto",
    "citation_coverage",
    "hallucination_rate",
    "contradiction_detection",
    "gap_honesty",
    "trap_rejection",
    "cost_tokens",
    "latency_ms",
)

# Kinds a well-behaved synthesis must never cite at all. contradicting_sources is deliberately excluded:
# a contradicting source SHOULD be cited (as part of a conflicts[] entry) -- its trap is measured by
# contradiction_detection, not trap_rejection.
_REJECTABLE_TRAP_KINDS = {"homonym", "shopping_page", "injection_sentence"}

# §3.7: each line's expected findings fall into three categories, and each category is scored (coverage_by_category).
CATEGORIES = {
    "L1": ("fact", "controversy", "related_party"),
    "L2": ("option", "criterion", "evidence"),
    "L3": ("claim", "method", "limitation"),
}

# Every string a citation-bearing node says (P-d names; related_entities.relation, studies.method/limitations).
_CONTENT_TEXT_KEYS = ("text", "claim", "name", "relation", "method")


def _content_text(node: dict[str, Any]) -> str:
    parts = [node[key] for key in _CONTENT_TEXT_KEYS if isinstance(node.get(key), str)]
    parts += [item for item in node.get("limitations") or [] if isinstance(item, str)]
    return " ".join(parts)


def _cited(node: dict[str, Any]) -> list[str]:
    """A claim's citation ids; a malformed citations value or item counts as citing nothing."""
    return [citation for citation in claim_citations(node) if isinstance(citation, str)]


def term_present(term: str, text: str) -> bool:
    """A fact-bearing term is in the text when every P-i word of it (``terms_of``) is a word of the text: a proper
    noun's bigrams, a whole number (``12`` is not ``120``). A term with no P-i word (``2.5``: single digits are not
    words) cannot be scored and is refused by ``_load_expected``."""
    words = terms_of(term)
    return bool(words) and set(words) <= set(terms_of(text))


def _hits(item: dict[str, Any], text: str) -> bool:
    terms = item["terms"]
    return sum(term_present(term, text) for term in terms) >= item.get("min_hits", len(terms))


def case_common_terms(sources: dict[str, str]) -> set[str]:
    """terms_of words in more than half of the case's sources -- the subject's own name and shared vocabulary. They
    say nothing about which source supports a sentence, so no expected term may consist only of them and citation
    precision does not count them (one definition, used by both)."""
    counts: dict[str, int] = {}
    for text in sources.values():
        for term in set(terms_of(text)):
            counts[term] = counts.get(term, 0) + 1
    return {term for term, count in counts.items() if count * 2 > len(sources)}


def _load_expected(case_dir: Path) -> dict[str, list[dict[str, Any]]]:
    raw = _yaml(case_dir / "expected.yaml") or {}
    if not isinstance(raw, dict):
        raise ValueError(f"{case_dir}/expected.yaml: top level must be a mapping, got {type(raw).__name__}")
    for key in ("findings", "conflicts", "gaps", "traps"):
        value = raw.get(key, [])
        if not isinstance(value, list):
            raise ValueError(f"{case_dir}/expected.yaml: '{key}' must be a list, got {type(value).__name__}")
    expected = {key: raw.get(key) or [] for key in ("findings", "conflicts", "gaps", "traps")}
    line = case_dir.parent.name
    if line not in CATEGORIES:
        raise ValueError(f"{case_dir}: a case lives under cases/<line>/ with line in {sorted(CATEGORIES)}, got {line!r}")
    for key in ("findings", "conflicts", "gaps"):
        for item in expected[key]:
            terms = item.get("terms") if isinstance(item, dict) else None
            if not isinstance(terms, list) or not terms or not all(isinstance(t, str) and terms_of(t) for t in terms):
                raise ValueError(f"{case_dir}/expected.yaml: {key} {item.get('id') if isinstance(item, dict) else item!r} needs terms: a non-empty list of fact-bearing words, each with >=1 terms_of word (P-i)")
            min_hits = item.get("min_hits", len(terms))
            if isinstance(min_hits, bool) or not isinstance(min_hits, int) or not 1 <= min_hits <= len(terms):
                raise ValueError(f"{case_dir}/expected.yaml: {key} {item.get('id')!r} min_hits must be 1..{len(terms)}, got {min_hits!r}")
    for finding in expected["findings"]:
        if finding.get("category") not in CATEGORIES[line]:
            raise ValueError(f"{case_dir}/expected.yaml: finding {finding.get('id')!r} category must be one of {CATEGORIES[line]} ({line}), got {finding.get('category')!r}")
    for trap in expected["traps"]:
        forbidden = trap.get("forbidden_terms", [])
        if not isinstance(forbidden, list) or not all(isinstance(t, str) and terms_of(t) for t in forbidden):
            raise ValueError(f"{case_dir}/expected.yaml: trap {trap.get('source')!r} forbidden_terms must be a list of non-empty strings")
    return expected


def _load_sources(case_dir: Path) -> dict[str, str]:
    """Map manifest id ("source:src:<stem>") -> file text, for every file still present under sources/."""
    sources_dir = case_dir / "sources"
    out: dict[str, str] = {}
    if sources_dir.is_dir():
        for path in sorted(sources_dir.glob("*.txt")):
            out[f"source:src:{path.stem}"] = path.read_text(encoding="utf-8")
    return out


def _fragment(source_id: str, sources: dict[str, str], bounds: dict[str, tuple[int, int]]) -> str:
    """What the model was shown of a cited source: its manifest [start, end) slice (P-a), never the whole file."""
    text = sources.get(source_id) or ""
    start, end = bounds.get(source_id, (0, len(text)))
    return text[start:end]


def _citation_precision_auto(nodes: list[dict[str, Any]], sources: dict[str, str], bounds: dict[str, tuple[int, int]]) -> float:
    """Fraction of (claim, cited source) links where the cited fragment carries one of the claim's distinctive words:
    words that occur in some case source but not in more than half of them (case_common_terms). A claim with no such
    word (an option or criterion name) is supported by any shared word. Citing the homonym's page for the right
    person's facts, or a source for facts it does not state, does not count."""
    common = case_common_terms(sources)
    source_terms = {term for text in sources.values() for term in terms_of(text)}
    total = matched = 0
    for node in nodes:
        claim_terms = set(terms_of(_content_text(node)))
        distinctive = (claim_terms & source_terms) - common
        wanted = distinctive or claim_terms
        for source_id in _cited(node):
            total += 1
            if wanted & set(terms_of(_fragment(source_id, sources, bounds))):
                matched += 1
    return matched / total if total else 1.0


def _covered(findings: list[dict[str, Any]], nodes: list[dict[str, Any]], sources: dict[str, str]) -> list[bool]:
    """Per expected finding: some node cites one of its still-existing expected sources AND states >= min_hits of its
    fact-bearing terms (default: all of them -- one right word next to a wrong number is not the finding)."""
    out = []
    for finding in findings:
        expected_sources = set(finding.get("sources", []))
        out.append(any(
            any(sources.get(sid) for sid in set(_cited(node)) & expected_sources) and _hits(finding, _content_text(node))
            for node in nodes
        ))
    return out


def _citation_coverage(findings: list[dict[str, Any]], nodes: list[dict[str, Any]], sources: dict[str, str]) -> float:
    """Fraction of expected findings actually delivered (``_covered``)."""
    covered = _covered(findings, nodes, sources)
    return sum(covered) / len(covered) if covered else 1.0


def _hallucination_rate(synthesis: dict[str, Any], manifest_ids: set[str]) -> float:
    """Fraction of claims the citation_integrity gate finds out-of-manifest or unsourced (§3.7; the gate's own P-b)."""
    evidence = evaluate_citation_integrity(synthesis, manifest_ids)["evidence"]
    if not evidence["claims_total"]:
        return 0.0
    return (len(evidence["out_of_manifest"]) + len(evidence["zero_citation"])) / evidence["claims_total"]


def _contradiction_detection(expected_conflicts: list[dict[str, Any]], declared_conflicts: list[dict[str, Any]]) -> float:
    """Fraction of expected conflicts actually reported: a declared conflict cites >=2 of its expected sources and
    states >= min_hits of its terms (the two disagreeing facts, not just "sources disagree")."""
    if not expected_conflicts:
        return 1.0
    detected = 0
    for conflict in expected_conflicts:
        expected_sources = set(conflict.get("sources", []))
        if any(isinstance(declared, dict) and len(set(_cited(declared)) & expected_sources) >= 2 and _hits(conflict, _content_text(declared))
               for declared in declared_conflicts):
            detected += 1
    return detected / len(expected_conflicts)


def _gap_honesty(expected_gaps: list[dict[str, Any]], declared_gaps: list[dict[str, Any]]) -> float:
    """Fraction of expected gaps actually disclosed: a declared gap names >= min_hits of what is missing ("data is
    limited" names nothing)."""
    if not expected_gaps:
        return 1.0
    disclosed = 0
    for gap in expected_gaps:
        if any(isinstance(declared, dict) and _hits(gap, " ".join(v for v in (declared.get("text"), declared.get("needed_evidence")) if isinstance(v, str)))
               for declared in declared_gaps):
            disclosed += 1
    return disclosed / len(expected_gaps)


def _trap_rejection(expected_traps: list[dict[str, Any]], nodes: list[dict[str, Any]]) -> float:
    """Fraction of should-never-be-cited traps the synthesis kept out: never cited, and none of its forbidden_terms
    (what the homonym, shopping page or injected sentence would make it say) in any claim -- a synthesis that writes
    what the injection asked for, citing something else, did not reject it."""
    rejectable = [t for t in expected_traps if t.get("kind") in _REJECTABLE_TRAP_KINDS]
    if not rejectable:
        return 1.0
    cited_ids = {c for node in nodes for c in _cited(node)}
    said = " ".join(_content_text(node) for node in nodes)
    rejected = sum(1 for trap in rejectable if trap.get("source") not in cited_ids and not any(term_present(term, said) for term in trap.get("forbidden_terms", [])))
    return rejected / len(rejectable)


def _cost_tokens(synthesis: dict[str, Any]) -> float:
    """Total tokens spent producing this artifact (input + output), from the synthesis usage record."""
    usage = synthesis.get("usage") or {}
    return float(usage.get("input_tokens", 0) + usage.get("output_tokens", 0))


def _latency_ms(artifact: dict[str, Any]) -> float:
    """Wall-clock milliseconds to produce this artifact; 0 for offline/golden fixtures that never called a model."""
    return float(artifact.get("latency_ms", 0))


def _manifest_bounds(artifact: dict[str, Any]) -> dict[str, tuple[int, int]]:
    bounds = {}
    for entry in (artifact.get("manifest") or {}).get("entries", []):
        if isinstance(entry.get("start"), int) and isinstance(entry.get("end"), int):
            bounds[entry.get("id")] = (entry["start"], entry["end"])
    return bounds


def coverage_by_category(case_dir: str | Path, artifact: dict[str, Any]) -> dict[str, float | None]:
    """Per §3.7 category of the case's line: fraction of that category's expected findings delivered; None when the
    case has none of it (reported, never thresholded -- P-f stays eight names)."""
    case_dir = Path(case_dir)
    expected = _load_expected(case_dir)
    nodes = [claim for _, claim, _ in iter_claims(artifact.get("synthesis") or {})]
    covered = _covered(expected["findings"], nodes, _load_sources(case_dir))
    out: dict[str, float | None] = {}
    for category in CATEGORIES[case_dir.parent.name]:
        hits = [hit for finding, hit in zip(expected["findings"], covered) if finding["category"] == category]
        out[category] = sum(hits) / len(hits) if hits else None
    return out


def score(case_dir: str | Path, artifact: dict[str, Any]) -> dict[str, float]:
    """Score one synthesis artifact (P-c) against one case directory's expected.yaml and sources/. Returns all of METRIC_NAMES."""
    case_dir = Path(case_dir)
    expected = _load_expected(case_dir)
    sources = _load_sources(case_dir)
    synthesis = artifact.get("synthesis") or {}
    manifest_ids = {entry.get("id") for entry in (artifact.get("manifest") or {}).get("entries", [])}
    nodes = [claim for _, claim, _ in iter_claims(synthesis)]
    return {
        "citation_precision_auto": _citation_precision_auto(nodes, sources, _manifest_bounds(artifact)),
        "citation_coverage": _citation_coverage(expected["findings"], nodes, sources),
        "hallucination_rate": _hallucination_rate(synthesis, manifest_ids),
        "contradiction_detection": _contradiction_detection(expected["conflicts"], synthesis.get("conflicts") or []),
        "gap_honesty": _gap_honesty(expected["gaps"], synthesis.get("gaps") or []),
        "trap_rejection": _trap_rejection(expected["traps"], nodes),
        "cost_tokens": _cost_tokens(synthesis),
        "latency_ms": _latency_ms(artifact),
    }
