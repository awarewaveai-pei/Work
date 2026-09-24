#!/usr/bin/env python3
"""
SearchContent architecture pack validator (Gate H — ADR-021 §D10).

Checks the invariants listed in
docs/architecture/search-content/SEARCH_CONTENT_PACK_COMMON.md §5, each one
resolving a finding from agency-os/reports/audit/2026-09-02-search-content-
pack-verification.md. Designed to be called standalone or as check family 5
of tests/run_golden_tests.py (see the wiring at the bottom of that file).

2026-09-02/03 critic round: the first version of this file had several
findings-of-its-own that would have let it silently pass a broken pack on a
future edit (see WORKLOG 2026-09-03 for the full list). This version fixes
the CRITICAL and MAJOR ones directly rather than patching around them:
  - `--write-manifest` used to skip every rule and exit 0 unconditionally --
    the exact "detector silences itself" shape AGENTS.md's patch-criterion
    section calls out as the worst failure mode. Now it runs rules 1-8 first
    and refuses to write if any fail.
  - Contract-provenance checking used to find blocks by regex-matching a
    `key:\n` first line, which silently skipped every block whose first line
    carried an inline value (`status: ACCEPTED`) or had extra trailing
    whitespace after ` ```yaml` -- and its own `block_kind: EXAMPLE` escape
    hatch was dead code as a result (it was never reached; blocks reached
    that branch by accident of the regex not matching at all). Rewritten to
    enumerate every fenced yaml block by actually parsing it, then classify
    the parsed object -- there is no longer a regex standing between "block
    exists" and "block is checked".
  - All YAML loads now use the same UniqueKeyLoader tests/run_golden_tests.py
    already defined for exactly this reason (plain yaml.safe_load lets a
    duplicate key silently overwrite the first value).
  - Baseline hygiene (fence/YAML parsing, /mnt/data and stale-label checks)
    now runs against every markdown file in the pack, including the two
    narrative documents and README, which were previously exempted for no
    principled reason.

No mother document, ADR, or existing spec/policy file's normative content is
modified by this file or by running it.
"""
import glob
import hashlib
import io
import json
import os
import re
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SC = os.path.join(ROOT, "docs", "architecture", "search-content")
ADR = os.path.join(ROOT, "docs", "adr", "ADR-021-search-content-boundary-and-ownership.md")
COMMON = os.path.join(SC, "SEARCH_CONTENT_PACK_COMMON.md")
MASTER = os.path.join(SC, "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md")
CRITICAL_REVIEW = os.path.join(SC, "SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md")
README = os.path.join(SC, "README.md")
REGISTRY_PATH = os.path.join(SC, "SEARCH_CONTENT_REGISTRY_RECORDS.yaml")
GATES_PATH = os.path.join(SC, "SEARCH_CONTENT_GATE_RECORDS.yaml")
OQ_PATH = os.path.join(SC, "SEARCH_CONTENT_OPEN_QUESTIONS.yaml")
MANIFEST = os.path.join(SC, "BUILD_MANIFEST.json")

# Docs required to declare source_of_truth_for/decided_by on every contract block.
SPEC_DOCS = sorted(f for f in glob.glob(os.path.join(SC, "*.md"))
                    if os.path.basename(f) not in ("SEARCH_CONTENT_PACK_COMMON.md", "README.md",
                                                    "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md",
                                                    "SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md"))
# Every markdown file in the pack -- baseline hygiene (rule1, rule7) applies uniformly.
ALL_MD = sorted(set(SPEC_DOCS) | {COMMON, MASTER, CRITICAL_REVIEW, README}) + [ADR]

failures = []
passed = 0


def check(cond, msg):
    global passed
    if cond:
        passed += 1
    else:
        failures.append(msg)


def read(p):
    return io.open(p, encoding="utf-8").read()


class UniqueKeyLoader(yaml.SafeLoader):
    """Same duplicate-key guard as tests/run_golden_tests.py's UniqueKeyLoader
    (PyYAML's safe_load otherwise lets the last of two duplicate keys win with
    no error, silently discarding data)."""


# 2026-09-25: kept identical to tests/run_golden_tests.py's own fix -- both
# files independently defined the same constructor and both had the same
# missing-flatten_mapping bug (a `<<: *anchor` merge key crashes the loader
# with "could not determine a constructor for the tag
# 'tag:yaml.org,2002:merge'"). See that file's comment for the full
# explanation of why the duplicate check runs BEFORE flatten_mapping.
_MERGE_TAG = "tag:yaml.org,2002:merge"


def _construct_mapping(loader, node, deep=False):
    seen = set()
    for key_node, _value_node in node.value:
        if key_node.tag == _MERGE_TAG:
            continue
        key = loader.construct_object(key_node, deep=deep)
        if key in seen:
            raise ValueError(f"Duplicate key {key!r} at line {key_node.start_mark.line + 1}")
        seen.add(key)
    loader.flatten_mapping(node)
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_mapping)


def load_yaml_text(text):
    return yaml.load(text, Loader=UniqueKeyLoader)


def load_yaml(p):
    return load_yaml_text(read(p))


# Tolerant of leading indentation and trailing whitespace after the language tag
# (a bare `^```` for fence-parity counting; a language-specific one for extraction).
FENCE_ANY_RE = re.compile(r"^[ \t]*```", re.M)
FENCE_YAML_RE = re.compile(r"^[ \t]*```[ \t]*yaml[ \t]*\r?\n(.*?)^[ \t]*```[ \t]*\r?\n", re.M | re.S)
FENCE_YAML_OPEN_RE = re.compile(r"^[ \t]*```[ \t]*yaml\b", re.M)


def extract_yaml_blocks(text):
    """Return the list of fenced ```yaml block bodies in `text`, plus a count of
    how many opening ```yaml fences exist -- the two must match, or some block
    failed to find its closing fence (silently dropping it from every check)."""
    bodies = FENCE_YAML_RE.findall(text)
    opens = len(FENCE_YAML_OPEN_RE.findall(text))
    return bodies, opens


# ---------------------------------------------------------------- rule 1: fences + yaml parse
def rule1_fences_and_yaml():
    for p in ALL_MD:
        t = read(p)
        fence_lines = FENCE_ANY_RE.findall(t)
        check(len(fence_lines) % 2 == 0, f"rule1: odd fence count in {os.path.relpath(p, ROOT)}")
        bodies, opens = extract_yaml_blocks(t)
        check(len(bodies) == opens,
              f"rule1: {os.path.relpath(p, ROOT)} has {opens} ```yaml fence(s) but only "
              f"{len(bodies)} closed properly -- at least one block never terminated")
        for b in bodies:
            try:
                load_yaml_text(b)
            except Exception as e:  # noqa: BLE001
                failures.append(f"rule1: unparsable yaml block in {os.path.relpath(p, ROOT)}: {e}")
            else:
                global passed
                passed += 1


# ---------------------------------------------------------------- rule 2: source_of_truth_for / decided_by
def rule2_contract_provenance():
    for p in SPEC_DOCS + [ADR]:
        t = read(p)
        bodies, opens = extract_yaml_blocks(t)
        if len(bodies) != opens:
            # already reported by rule1; don't double-report here, but don't
            # silently skip the count either -- provenance can't be checked
            # for a block that never terminated.
            continue
        for body in bodies:
            try:
                obj = load_yaml_text(body)
            except Exception:  # noqa: BLE001
                continue  # already reported by rule1
            if not isinstance(obj, dict):
                # a bare list/scalar ```yaml block (none expected today, but not
                # this rule's job to police shape -- rule1 already parsed it OK)
                global passed
                passed += 1
                continue
            block_kind = obj.get("block_kind")
            if block_kind in ("EXAMPLE", "ADR_METADATA"):
                passed += 1
                continue
            has_sot = bool(obj.get("source_of_truth_for"))
            has_dec = bool(obj.get("decided_by"))
            first_key = next(iter(obj), "?")
            check(has_sot and has_dec,
                  f"rule2: {os.path.relpath(p, ROOT)} block `{first_key}:` missing "
                  f"source_of_truth_for/decided_by (and no block_kind: EXAMPLE|ADR_METADATA exemption)")


# ---------------------------------------------------------------- rule 3: registry coverage
METHOD_ID_RE = re.compile(r"^([a-z_]+\.[a-z_]+)$")


def rule3_registry_coverage():
    reg = load_yaml(REGISTRY_PATH)
    known_ids = {r["id"] for r in reg["records"]}
    for r in reg["records"]:
        for field in ("owner", "status", "purpose", "evidence_maturity"):
            check(bool(r.get(field)), f"rule3: record {r['id']} missing {field}")
        check(r["status"] in reg["enums"]["status"], f"rule3: record {r['id']} status {r['status']!r} not in enum")
        check(r["evidence_maturity"] in reg["enums"]["evidence_maturity"],
              f"rule3: record {r['id']} evidence_maturity not in enum")
    check(len(known_ids) == len(reg["records"]), "rule3: duplicate ids in registry records")

    # every bare `family.name` line inside a ```text catalog block in the Registry
    # doc must have a record -- no family whitelist (a whitelist here would need
    # updating every time a new family is added, and would silently stop
    # checking anything in a family nobody remembered to add).
    t = read(os.path.join(SC, "SEARCH_CONTENT_METHOD_AND_CAPABILITY_REGISTRY.md"))
    referenced = set()
    for block in re.findall(r"```text\n(.*?)```", t, re.S):
        for line in block.splitlines():
            line = line.split("#", 1)[0].strip()
            m = METHOD_ID_RE.match(line)
            if m:
                referenced.add(m.group(1))
    check(len(referenced) >= 100, f"rule3: expected >=100 catalog ids in the Registry doc, found {len(referenced)} "
                                   f"-- catalog format may have changed and stopped matching")
    missing = sorted(referenced - known_ids)
    check(not missing, f"rule3: ids referenced in catalog text but absent from registry records: {missing}")


# ---------------------------------------------------------------- rule 4: gate coverage
GATE_ID_RE = re.compile(r"\bsearch_content\.[a-z_]+(?:\.[a-z_]+)+\b")


def rule4_gate_coverage():
    gates = load_yaml(GATES_PATH)
    known_gate_ids = {r["gate_id"] for r in gates["records"]}
    check(len(known_gate_ids) >= 55, f"rule4: expected >=55 gate records, found {len(known_gate_ids)}")
    dm = read(os.path.join(SC, "SEARCH_CONTENT_DOMAIN_MODEL.md"))
    m = re.search(r"search_content_artifact_type:\n  values:\n(.*?)\n  wildcard", dm, re.S)
    check(m is not None, "rule4: artifact type catalog not found in Domain Model")
    at_values = set(re.findall(r"-\s+([A-Z_]+)", m.group(1))) if m else set()

    for r in gates["records"]:
        for field in ("display_name", "owner", "severity", "category"):
            check(bool(r.get(field)), f"rule4: gate {r['gate_id']} missing {field}")
        check(r["severity"] in gates["enums"]["severity"], f"rule4: gate {r['gate_id']} bad severity")
        check(r["category"] in gates["enums"]["category"], f"rule4: gate {r['gate_id']} bad category")
        applies = r.get("applies_to_artifact_types") or []
        bad = [a for a in applies if a != "*" and a not in at_values]
        check(not bad, f"rule4: gate {r['gate_id']} applies_to_artifact_types not in catalog: {bad}")

    referenced = set()
    for p in SPEC_DOCS + [ADR, MASTER]:
        referenced |= set(GATE_ID_RE.findall(read(p)))
    missing = sorted(referenced - known_gate_ids)
    retired_aliases = {r.get("retired_alias") for r in gates["records"] if r.get("retired_alias")}
    missing = [g for g in missing if g not in retired_aliases]
    check(not missing, f"rule4: gate ids referenced but absent from gate records: {missing}")


# ---------------------------------------------------------------- rule 5: open questions
def rule5_open_questions():
    oq = load_yaml(OQ_PATH)
    defined = {i["id"] for i in oq["items"]}
    check(len(defined) == len(oq["items"]), "rule5: duplicate OQ-SC ids in register")
    check(len(defined) >= 15, f"rule5: expected >=15 registered open questions, found {len(defined)}")
    for i in oq["items"]:
        for field in ("kind", "title", "owner", "evidence"):
            check(bool(i.get(field)), f"rule5: {i['id']} missing {field}")
        check(i["kind"] in oq["kinds"], f"rule5: {i['id']} kind not in enum")

    referenced = set()
    for p in SPEC_DOCS + [ADR, COMMON]:
        referenced |= set(re.findall(r"OQ-SC-\d+", read(p)))
    check(referenced == defined,
          f"rule5: mismatch — defined-not-referenced={sorted(defined-referenced)} "
          f"referenced-not-defined={sorted(referenced-defined)}")


# ---------------------------------------------------------------- rule 6: EV-* evidence table
EV_DEF_RE = re.compile(r"\| (EV-[A-Z0-9-]+) \| `([^:]+):L(\d+)-L(\d+)`")
EV_REF_RE = re.compile(r"`(EV-[A-Z0-9-]+)`")


def _exact_case_isfile(full):
    """os.path.isfile is case-insensitive on Windows -- a wrong-case citation
    would otherwise silently pass. Confirm the basename's actual case matches
    what's really in the directory listing."""
    d, base = os.path.dirname(full), os.path.basename(full)
    if not os.path.isdir(d):
        return False
    try:
        return base in os.listdir(d)
    except OSError:
        return False


def rule6_evidence_table():
    t = read(COMMON)
    defs = {}
    for m in EV_DEF_RE.finditer(t):
        ev_id, relpath, l1, l2 = m.group(1), m.group(2), int(m.group(3)), int(m.group(4))
        defs[ev_id] = (relpath, l1, l2)
    check(len(defs) >= 30, f"rule6: expected >=30 EV-* definitions in SEARCH_CONTENT_PACK_COMMON.md, found {len(defs)}")

    # COMMON §3's own convention: a path with no directory prefix means a file
    # inside this pack's own directory (docs/architecture/search-content/);
    # anything else is a full path relative to the repo root (D:\Work).
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(ROOT)))  # .../D:/Work
    for ev_id, (relpath, l1, l2) in defs.items():
        full = os.path.join(repo_root, relpath.replace("/", os.sep)) if "/" in relpath else os.path.join(SC, relpath)
        if not os.path.isfile(full) or not _exact_case_isfile(full):
            failures.append(f"rule6: {ev_id} points to a missing (or wrong-case) file {relpath}")
            continue
        with io.open(full, encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()
        nlines = len(lines)
        check(l1 <= l2, f"rule6: {ev_id} has L1 > L2")
        check(l2 <= nlines, f"rule6: {ev_id} end line L{l2} exceeds actual file length ({nlines}) for {relpath}")
        # Weak but real: a citation whose start line is blank in the target file
        # is a strong signal the range no longer points at real content (e.g.
        # lines were inserted above it and the table was never updated). This
        # does NOT catch every drift case -- see OQ-SC-21 for the documented
        # residual (upper-bound-only checking can't detect a shift that still
        # lands inside real content).
        if 1 <= l1 <= nlines:
            check(lines[l1 - 1].strip() != "", f"rule6: {ev_id} start line L{l1} is blank in {relpath} -- citation likely drifted")

    referenced = set()
    for p in SPEC_DOCS + [ADR]:
        referenced |= set(EV_REF_RE.findall(read(p)))
    missing = sorted(referenced - set(defs))
    check(not missing, f"rule6: EV-* ids referenced in pack docs but not defined in COMMON §3: {missing}")


# ---------------------------------------------------------------- rule 7: path hygiene
def rule7_path_hygiene():
    # COMMON is the one authorized place the /mnt/data string may legitimately
    # appear (its §2 history table documents it as a superseded path) -- every
    # other document, including the two narrative ones, must be clean.
    for p in [d for d in ALL_MD if d != COMMON]:
        t = read(p)
        check("/mnt/data" not in t, f"rule7: stale /mnt/data reference in {os.path.relpath(p, ROOT)}")
        check("Proposed repo path" not in t, f"rule7: stale 'Proposed repo path' label in {os.path.relpath(p, ROOT)}")


# ---------------------------------------------------------------- rule 8: event ownership + heading numbering
EVENT_ROW_RE = re.compile(r"^\|\s*`([A-Za-z0-9_]+)`\s*\|([^|]*)\|", re.M)
EVENT_ROW_CANDIDATE_RE = re.compile(r"^\|\s*`", re.M)


def rule8_events_and_headings():
    adr_t = read(ADR)
    m = re.search(r"### D6 — Event Ownership(.*?)### D7", adr_t, re.S)
    check(m is not None, "rule8: ADR-021 §D6 event ownership table not found")
    if m:
        section = m.group(1)
        candidates = EVENT_ROW_CANDIDATE_RE.findall(section)
        rows = EVENT_ROW_RE.findall(section)
        check(len(candidates) == len(rows),
              f"rule8: {len(candidates) - len(rows)} event row(s) in §D6 failed to parse "
              f"(found {len(candidates)} candidate rows, matched {len(rows)})")
        check(len(rows) >= 10, "rule8: fewer than 10 vertical events registered in §D6")
        for event, owner in rows:
            check(owner.strip() not in ("", "—", "-"), f"rule8: event {event} has no aggregate owner")

    master = read(MASTER)
    body = master.split("\n\n---\n\n# Errata")[0]
    h1 = None
    seen = set()
    bad_mismatch = []
    bad_dupe = []
    for line in body.splitlines():
        mh1 = re.match(r"^# (\d+)\.", line)
        if mh1:
            h1 = int(mh1.group(1))
            continue
        if line.startswith("# "):
            h1 = None  # an unnumbered H1 must not let numbered-H2 checks use a stale h1
            continue
        mh2 = re.match(r"^## (\d+)\.(\d+)\s", line)
        if mh2:
            major, minor = int(mh2.group(1)), int(mh2.group(2))
            if h1 is not None and major != h1:
                bad_mismatch.append(line)
            key = (major, minor)
            if key in seen:
                bad_dupe.append(line)
            seen.add(key)
    check(not bad_mismatch, f"rule8: mis-numbered H2 headings remain in master architecture: {bad_mismatch}")
    check(not bad_dupe, f"rule8: duplicate H2 heading numbers in master architecture: {bad_dupe}")


# ---------------------------------------------------------------- rule 9: BUILD_MANIFEST freshness
def _file_stat(path):
    t = read(path)
    return {
        "lines": len(t.split("\n")),
        "chars": len(t),
        "yaml_blocks": len(extract_yaml_blocks(t)[0]),
        "sha1": hashlib.sha1(t.encode("utf-8")).hexdigest(),
    }


def build_manifest():
    """Covers every file the pack's other rules actually read as a source of
    truth: all pack markdown (including the ADR, which lives outside SC/), and
    the three generated YAML record files -- a prior version covered only
    docs/architecture/search-content/*.md, so a change to the ADR or to any
    generated record file was invisible to freshness tracking."""
    manifest = {"docs": {}, "adr": None, "records": {}}
    for p in sorted(glob.glob(os.path.join(SC, "*.md"))):
        manifest["docs"][os.path.basename(p)] = _file_stat(p)
    manifest["adr"] = {"path": "docs/adr/" + os.path.basename(ADR), **_file_stat(ADR)}
    for key, p in (("registry", REGISTRY_PATH), ("gates", GATES_PATH), ("open_questions", OQ_PATH)):
        manifest["records"][key] = _file_stat(p)
    return manifest


def rule9_manifest():
    if not os.path.isfile(MANIFEST):
        failures.append("rule9: BUILD_MANIFEST.json missing (run with --write-manifest)")
        return
    on_disk = json.loads(read(MANIFEST))
    fresh = build_manifest()
    check(on_disk == fresh, "rule9: BUILD_MANIFEST.json is stale — regenerate with --write-manifest")


RULES = [rule1_fences_and_yaml, rule2_contract_provenance, rule3_registry_coverage,
         rule4_gate_coverage, rule5_open_questions, rule6_evidence_table,
         rule7_path_hygiene, rule8_events_and_headings]


def main():
    write_manifest = "--write-manifest" in sys.argv

    for rule in RULES:
        rule()

    if write_manifest:
        if failures:
            print(f"search_content_pack_check: refusing to write manifest -- "
                  f"{len(failures)} rule 1-8 failure(s) exist (fix these first, "
                  f"a manifest write must never be the way a failing check gets silenced):")
            for f in failures:
                print(" -", f)
            sys.exit(1)
        with io.open(MANIFEST, "w", encoding="utf-8", newline="\n") as f:
            json.dump(build_manifest(), f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"search_content_pack_check: rules 1-8 passed ({passed} checks); wrote {MANIFEST}")
        return

    rule9_manifest()

    print(f"search_content_pack_check: PASSED {passed} checks, {len(failures)} failures")
    if failures:
        for f in failures:
            print(" -", f)
        sys.exit(1)


if __name__ == "__main__":
    main()
