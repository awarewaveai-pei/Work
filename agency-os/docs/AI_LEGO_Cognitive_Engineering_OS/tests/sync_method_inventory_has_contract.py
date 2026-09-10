#!/usr/bin/env python3
"""Reconciles method-inventory.yaml's has_contract/contract_status fields
against contract-backlog.yaml's tier_0/tier_1 method_id registrations.

Root cause: contract-backlog.yaml is the SSOT for "this method_id now has a
real methods/contracts/*.contract.yaml file" (tier_0/tier_1,
contract_status: complete). method-inventory.yaml is a SEPARATE, per-citation
Phase-0-migrated catalog (see its own OQ-BACKLOG-1 in contract-backlog.yaml)
that was never mechanically kept in sync with it -- most rows still read
has_contract:false even after their method's contract shipped.
tests/run_golden_tests.py's own run_registry_invariants only checks INTERNAL
has_contract<->contract_status consistency inside method-inventory.yaml; it
never cross-checks against contract-backlog.yaml, so this drift was invisible
to the golden suite (confirmed by reading that function in full before
writing this script). Also confirmed: nothing under ai_lego/ reads
method-inventory.yaml at runtime (method_resolver.py's MethodCatalog resolves
directly against methods/contracts/*.contract.yaml with status: ACTIVE) --
this drift is documentation-only, not a functional bug.

This is a TARGETED TEXT EDIT, not a YAML parse+dump roundtrip:
method-inventory.yaml carries load-bearing prose comments (e.g. the
phase_3_additions block header) that PyYAML's dumper would silently delete on
a round-trip. Every row's has_contract/contract_status pair is located by
line number (via a line-tracking YAML loader) and edited in place with a
regex substitution on that exact line, leaving every other byte of the file
untouched.

Matching strategy per contract-backlog.yaml method_id, tried in order,
short-circuiting at the first non-empty tier (this order matters -- see
strategy.swot below):
  A/B. machine_id field equals method_id, OR name field literally equals
       method_id verbatim (catches Master-Plan "example-only" citation rows
       whose own `name` IS the dotted id, e.g. name: "root_cause.fishbone").
  C.   normalized name (lowercase, strip all non-alphanumeric) exactly
       equals the method_id's short name (part after the family prefix).
  D.   substring containment either direction, filtered to rows whose
       category plausibly matches the method_id's family (avoids
       cross-family false positives from a bare substring test).
  E.   MANUAL_OVERRIDES (hand-verified, commented below).
A/B is tried first and, if non-empty, WINS without ever trying C -- this is
load-bearing: strategy.swot's own contract-backlog.yaml note explicitly says
the Atlas F08 "SWOT" row (machine_id: "method.swot", the pre-ADR-005 form)
must NOT be touched, out of scope. Tier C's bare "swot"=="swot" normalized
match WOULD hit that row too -- but tier B already resolves strategy.swot via
the Master-Plan row (name literally "strategy.swot"), so C is never reached
for that method_id and the F08 row is correctly left alone.

A method_id can legitimately match MORE THAN ONE row (the same method cited
in multiple by_document sections, e.g. root_cause.fishbone at both its Atlas
F05 row and its Master-Plan example-only row) -- every match is flipped, not
just the first. This resolves contract-backlog.yaml's own open question
OQ-BACKLOG-1 in the "full reconciliation" direction.

Usage:
  python sync_method_inventory_has_contract.py            # dry run, report only
  python sync_method_inventory_has_contract.py --apply     # write the edits
"""
import re
import sys
from pathlib import Path

import yaml

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")

ROOT = Path(__file__).resolve().parent.parent
CONTRACT_BACKLOG = ROOT / "methods" / "registry" / "contract-backlog.yaml"
METHOD_INVENTORY = ROOT / "methods" / "registry" / "method-inventory.yaml"

# ---------------------------------------------------------------------------
# Hand-verified exceptions to the automated matcher. Every entry here was
# checked by reading both files in full, not guessed by a fuzzy heuristic.
# ---------------------------------------------------------------------------
MANUAL_OVERRIDES = {
    # devops_sre.runbook_execution: Atlas F19's own table-row title for this
    # concept is the noun "Runbook / Playbook", not the verb
    # "...execution" contract-backlog.yaml's own method_id uses -- zero
    # normalized-substring overlap either direction ("runbookexecution" vs
    # "runbookplaybook"). Verified unambiguous: this is the only unclaimed
    # F19 devops-sre row once every other devops_sre.* method_id is matched,
    # and contract-backlog.yaml's own thirty-first_concrete_entry narrates
    # this exact row (F19 L861) as devops_sre.runbook_execution's citation.
    "devops_sre.runbook_execution": ["Runbook / Playbook"],
}

FAMILY_CATEGORY_HINTS = {
    "root_cause": "root_cause",
    "decision": "decision",
    "architecture": "architecture",
    "security": "security",
    "database_data": "database-data",
    "learning": "learning",
    "challenge": "challenge",
    "causal": "causal",
    "computation": "computation",
    "framing": "framing",
    "strategy": "strategy",
    "devops_sre": "devops-sre",
    "stakeholder": "lens",
    "research": "research",
}


class MarkedLoader(yaml.SafeLoader):
    """SafeLoader that stamps every mapping with its own 0-indexed line span
    (__start_line__/__end_line__), so a matched row can be edited by exact
    line number instead of round-tripping the whole document through
    yaml.dump (which would silently drop every comment in this file)."""


def _construct_mapping(loader, node, deep=False):
    mapping = loader.construct_mapping(node, deep=deep)
    mapping["__start_line__"] = node.start_mark.line
    mapping["__end_line__"] = node.end_mark.line
    return mapping


MarkedLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_mapping)


def normalize(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def short_name(method_id):
    return method_id.split(".", 1)[1]


def family_of(method_id):
    return method_id.split(".", 1)[0]


def load_complete_method_ids():
    with open(CONTRACT_BACKLOG, encoding="utf-8") as f:
        cb = yaml.safe_load(f)
    entries = []  # (method_id, source_label)
    malformed = []  # method_ids with no "." -- short_name()/family_of() would crash on these
    for e in cb.get("tier_0") or []:
        if isinstance(e, dict) and e.get("method_id"):
            entries.append((e["method_id"], "tier_0", e.get("contract_status")))
    for key, e in (cb.get("tier_1") or {}).items():
        if isinstance(e, dict) and e.get("method_id"):
            entries.append((e["method_id"], f"tier_1.{key}", e.get("contract_status")))
    for mid, src, _status in entries:
        if "." not in mid:
            malformed.append((mid, src))
    entries = [(mid, src, status) for mid, src, status in entries if "." in mid]
    complete = [(mid, src) for mid, src, status in entries if status == "complete"]
    return complete, len(entries), malformed


def load_inventory_rows():
    # newline="" on BOTH read and write (critic finding, 2026-09-10): the
    # write side already used newline="" for verbatim passthrough, but the
    # read side used Python's default universal-newline translation, which
    # would have silently rewritten every CRLF in the file to LF on the
    # very first --apply -- currently inert only because .gitattributes
    # forces LF on this path, an external guarantee this script shouldn't
    # depend on for its own "leave every other byte untouched" claim.
    with open(METHOD_INVENTORY, encoding="utf-8", newline="") as f:
        text = f.read()
    lines = text.splitlines(keepends=True)
    mi = yaml.load(text, Loader=MarkedLoader)

    rows = []  # list of dicts: doc, row dict
    for doc_name, doc_val in mi.get("by_document", {}).items():
        if doc_name.startswith("__"):
            continue  # synthetic __start_line__/__end_line__ keys added by MarkedLoader
        for row in doc_val.get("methods", []):
            rows.append({"doc": doc_name, "row": row})
    for row in mi.get("phase_3_additions", []):
        rows.append({"doc": "phase_3_additions", "row": row})

    return mi, lines, rows


def find_matches(method_id, rows):
    short = short_name(method_id)
    norm_short = normalize(short)

    a_b = [
        r for r in rows
        if r["row"].get("machine_id") == method_id or r["row"].get("name") == method_id
    ]
    if a_b:
        return a_b, "machine_id_or_literal_name"

    family = family_of(method_id)
    hint = FAMILY_CATEGORY_HINTS.get(family, family).replace("_", "-")

    def category_ok(r):
        return hint in (r["row"].get("category") or "").lower().replace("_", "-")

    # Critic finding (2026-09-10): an earlier version had no cross-family
    # guard here, unlike tier D below -- a coincidental normalized-name
    # collision across two unrelated families (none exist in the current
    # 290 rows, verified, but nothing stopped one from silently mis-flipping
    # both) would have been auto-accepted whenever every matched row shared
    # the same literal name. Filter to category-plausible rows FIRST; fall
    # back to the unfiltered set only when exactly one candidate exists
    # there too (so a genuine single match with an unrecognized/odd category
    # string still resolves, but multi-candidate ambiguity never does).
    c_all = [r for r in rows if normalize(r["row"].get("name")) == norm_short]
    c = [r for r in c_all if category_ok(r)] or (c_all if len(c_all) == 1 else [])
    if len(c) == 1:
        return c, "normalized_exact"
    if len(c) > 1:
        names = {r["row"].get("name") for r in c}
        if len(names) == 1:
            return c, "normalized_exact_multi_citation"
        return [], f"AMBIGUOUS_normalized_exact:{sorted(names)}"

    d_all = [
        r for r in rows
        if norm_short and (
            norm_short in normalize(r["row"].get("name"))
            or normalize(r["row"].get("name")) in norm_short
        )
    ]
    d_cat = [r for r in d_all if category_ok(r)]
    if len(d_cat) == 1:
        return d_cat, "substring_category_filtered"
    if len(d_all) == 1:
        return d_all, "substring_unique"

    if method_id in MANUAL_OVERRIDES:
        names = set(MANUAL_OVERRIDES[method_id])
        e = [r for r in rows if r["row"].get("name") in names]
        if e:
            return e, "manual_override"

    return [], "UNMATCHED"


def main(argv):
    apply_changes = "--apply" in argv

    complete_ids, total_registrations, malformed_ids = load_complete_method_ids()
    mi, lines, rows = load_inventory_rows()

    print(f"contract-backlog.yaml: {total_registrations} tier_0+tier_1 registrations, {len(complete_ids)} contract_status:complete")
    if malformed_ids:
        print(f"WARNING: {len(malformed_ids)} method_id(s) have no '.' family separator, skipped: {malformed_ids}")
    print(f"method-inventory.yaml: {len(rows)} rows scanned (by_document + phase_3_additions)\n")

    flips = []          # (method_id, source, row_ref, matched_via)
    already_correct = []
    unmatched = []
    ambiguous = []

    for method_id, source in complete_ids:
        matches, via = find_matches(method_id, rows)
        if not matches:
            if via.startswith("AMBIGUOUS"):
                ambiguous.append((method_id, source, via))
            else:
                unmatched.append((method_id, source))
            continue
        for m in matches:
            row = m["row"]
            hc = row.get("has_contract")
            cs = row.get("contract_status")
            if hc is True and cs == "complete":
                already_correct.append((method_id, source, m["doc"], row.get("name"), via))
            elif hc is False and cs == "pending":
                flips.append((method_id, source, m, via))
            else:
                ambiguous.append((method_id, source, f"unexpected pre-state has_contract={hc!r} contract_status={cs!r} on {m['doc']}::{row.get('name')!r}"))

    print(f"=== FLIPS ({len(flips)} rows: has_contract false->true, contract_status pending->complete) ===")
    for method_id, source, m, via in flips:
        print(f"  {method_id} ({source}) -> [{m['doc']}] {m['row'].get('name')!r}  (matched via {via})")

    print(f"\n=== ALREADY CORRECT ({len(already_correct)} rows, no-op) ===")
    for method_id, source, doc, name, via in already_correct:
        print(f"  {method_id} ({source}) -> [{doc}] {name!r}  (matched via {via})")

    print(f"\n=== UNMATCHED ({len(unmatched)} method_ids -- no candidate row found) ===")
    for method_id, source in unmatched:
        print(f"  {method_id} ({source})")

    print(f"\n=== AMBIGUOUS / NEEDS REVIEW ({len(ambiguous)}) ===")
    for item in ambiguous:
        print(f"  {item}")

    new_true_total = len(already_correct) + len(flips)
    print(f"\nSUMMARY: {len(flips)} rows to flip, {len(already_correct)} already correct, "
          f"{len(unmatched)} unmatched, {len(ambiguous)} ambiguous.")
    print(f"New total has_contract:true row count (post-apply): {new_true_total}")

    if not apply_changes:
        print("\nDRY RUN -- pass --apply to write changes.")
        # Exit 1 = dry run found issues, nothing written. Distinct from exit
        # 4 below (issues remain AFTER a real --apply write) so a caller can
        # tell "nothing changed" from "file was modified" from exit code
        # alone, without scraping stdout (critic finding, 2026-09-10).
        return 1 if (unmatched or ambiguous or malformed_ids) else 0

    changed_lines = 0
    for method_id, source, m, via in flips:
        row = m["row"]
        start = row["__start_line__"]
        # Critic finding (2026-09-10): the original window (next sibling's
        # start, or end_mark+2 for a list's last row) was CONFIRMED to
        # overshoot into the next by_document section's own header/first
        # row for both of this file's "last row in its list" cases -- saved
        # only by has_contract/contract_status happening to appear before
        # any sibling-section content in every row today, an accident, not
        # a structural guarantee. Every row in this file is single-line-per-
        # field (verified: no field wraps, no blank line inside a row), so
        # the row's own real key count IS its exact line count -- an exact
        # bound with no reliance on PyYAML's end_mark or sibling-position
        # guessing, and no way to overshoot into another row's content.
        num_fields = len([k for k in row if not k.startswith("__")])
        end = start + num_fields - 1
        found_hc = found_cs = False
        for i in range(start, min(end + 1, len(lines))):
            line = lines[i]
            new_line = re.sub(r"^(\s*has_contract:\s*)false\b", r"\1true", line)
            if new_line != line and not found_hc:
                lines[i] = new_line
                found_hc = True
                changed_lines += 1
                continue
            new_line2 = re.sub(r"^(\s*contract_status:\s*)pending\b", r"\1complete", line)
            if new_line2 != line and not found_cs:
                lines[i] = new_line2
                found_cs = True
                changed_lines += 1
        if not (found_hc and found_cs):
            print(f"ERROR: could not locate has_contract/contract_status lines for "
                  f"{method_id} -> [{m['doc']}] {row.get('name')!r} within lines {start}-{end}")
            return 2

    with open(METHOD_INVENTORY, "w", encoding="utf-8", newline="") as f:
        f.writelines(lines)

    print(f"\nWROTE {METHOD_INVENTORY} -- {changed_lines} lines changed across {len(flips)} rows.")
    # Exit 4 (not 1) = the file WAS written, but issues remain -- distinct
    # from exit 1 above (dry run, nothing written).
    return 4 if (unmatched or ambiguous or malformed_ids) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
