"""Shared duplicate-key-safe YAML loader for the SPEC test suite.

Why: PyYAML's default loader silently lets the second of two duplicate
mapping keys overwrite the first with no error, so a corpus typo loses data
with no signal -- UniqueKeyLoader raises instead. Previously duplicated
verbatim in tests/run_golden_tests.py and tests/architecture/
search_content_pack_check.py; both call sites now import this module.
"""
import os
import sys

import yaml

# Own directory first on sys.path so `import strict_yaml` resolves for a
# sibling module regardless of cwd or how it was loaded (direct script run,
# `import`, or importlib.util.spec_from_file_location -- none of which is
# guaranteed to put this directory on sys.path automatically).
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

_MERGE_TAG = "tag:yaml.org,2002:merge"


class UniqueKeyLoader(yaml.SafeLoader):
    """Duplicate-key guard shared by every SPEC test file that loads YAML."""


def _check_no_duplicate_keys(loader, node, validated, deep):
    """Validate `node`'s own explicit keys, and recursively validate every
    `<<` merge source it pulls in, BEFORE anything flattens/mutates them.

    Memoized by node identity via `validated` (a set persisted on the loader
    instance for one whole parse -- see `_construct_mapping`), so a mapping
    reachable both directly (e.g. `base: &b {...}`) and via a later
    `<<: *b` merge is validated exactly once, at its first (pristine,
    pre-flatten) encounter. Without this, a node validated via one path and
    then flatten_mapping-mutated by construction of the OTHER path would, on
    a naive second raw re-scan, show the merge-supplied pairs and the
    child's own explicit-override pair side by side and look like a literal
    duplicate -- even though an explicit key overriding a merged value is
    legal YAML merge-key precedence, not a duplicate (this is the false
    positive a nested merge chain like `x: {inner: &a {<<: *z, v: 2}}` /
    `y: {<<: *a}` would otherwise trigger, depending on which of x/y gets
    constructed first).
    """
    if id(node) in validated:
        return
    validated.add(id(node))
    seen_merge = False
    seen = set()
    for key_node, value_node in node.value:
        if key_node.tag == _MERGE_TAG:
            if seen_merge:
                raise ValueError(f"Duplicate merge key '<<' at line {key_node.start_mark.line + 1}")
            seen_merge = True
            _check_merge_source(loader, value_node, validated, deep)
            continue
        key = loader.construct_object(key_node, deep=deep)
        if key in seen:
            raise ValueError(f"Duplicate key {key!r} at line {key_node.start_mark.line + 1}")
        seen.add(key)


def _check_merge_source(loader, node, validated, deep):
    if isinstance(node, yaml.MappingNode):
        _check_no_duplicate_keys(loader, node, validated, deep)
    elif isinstance(node, yaml.SequenceNode):
        for item in node.value:
            _check_merge_source(loader, item, validated, deep)
    # Any other node type is a malformed merge value (`<<: "oops"`); leave
    # raising the right error to PyYAML's own flatten_mapping below.


def _construct_mapping(loader, node, deep=False):
    validated = getattr(loader, "_strict_yaml_validated_nodes", None)
    if validated is None:
        validated = set()
        loader._strict_yaml_validated_nodes = validated
    _check_no_duplicate_keys(loader, node, validated, deep)
    loader.flatten_mapping(node)
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_mapping)


def load_strict(path_or_stream):
    """Parse YAML with UniqueKeyLoader. Accepts a filesystem path (str) or an
    already-open text stream."""
    if hasattr(path_or_stream, "read"):
        return yaml.load(path_or_stream, Loader=UniqueKeyLoader)
    with open(path_or_stream, encoding="utf-8") as f:
        return yaml.load(f, Loader=UniqueKeyLoader)
