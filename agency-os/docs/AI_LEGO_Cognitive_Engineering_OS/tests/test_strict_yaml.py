#!/usr/bin/env python3
"""
Golden tests for tests/strict_yaml.py's UniqueKeyLoader / load_strict.

No pytest/unittest runner exists for this suite (see tests/README.md); this
follows the same check()/passed/failures self-contained-function convention
as tests/run_golden_tests.py (see that file's check family 0,
run_unique_key_loader_merge_key_semantics, for the precedent this extends).

Run standalone:
    python3 tests/test_strict_yaml.py
"""
import os
import sys

import yaml

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

from strict_yaml import UniqueKeyLoader  # noqa: E402 -- needs sys.path set up above

failures = []
passed = 0


def check(cond, msg):
    global passed
    if cond:
        passed += 1
    else:
        failures.append(msg)


def load(text):
    return yaml.load(text, Loader=UniqueKeyLoader)


def expect_ok(text, msg_prefix):
    try:
        return load(text)
    except Exception as e:  # noqa: BLE001
        check(False, f"{msg_prefix}: expected clean load, raised {type(e).__name__}: {e}")
        return None


def expect_value_error(text, msg_prefix, needle=None):
    try:
        load(text)
    except ValueError as e:
        if needle is not None:
            check(needle in str(e), f"{msg_prefix}: expected {needle!r} in error, got {e!r}")
        else:
            check(True, msg_prefix)
    except Exception as e:  # noqa: BLE001
        check(False, f"{msg_prefix}: expected ValueError, got {type(e).__name__}: {e}")
    else:
        check(False, f"{msg_prefix}: expected ValueError, load succeeded")


def run_merge_override_wins():
    data = expect_ok(
        """
base: &base
  a: 1
  b: 2
child:
  <<: *base
  b: 3
""",
        "explicit key overriding a merge-supplied value",
    )
    if data is not None:
        check(data.get("child") == {"a": 1, "b": 3}, f"explicit override should win (b: 3), got {data.get('child')!r}")


def run_explicit_duplicate_rejected():
    expect_value_error("a: 1\na: 2\n", "two literal duplicate explicit keys", needle="Duplicate key")


def run_sequence_merge_first_listed_wins():
    data = expect_ok(
        """
a: &a
  x: 1
b: &b
  x: 2
  y: 3
child:
  <<: [*a, *b]
""",
        "<<: [*a, *b] sequence merge",
    )
    if data is not None:
        check(
            data.get("child") == {"x": 1, "y": 3},
            f"first-listed (*a) should win for overlapping key x, got {data.get('child')!r}",
        )


def run_nested_merge_chain_not_a_false_positive():
    # Regression: a merge source reached and flatten_mapping-mutated via one
    # path (x's normal `inner: &a` traversal), then re-checked via another
    # path (y's `<<: *a`), must not have its own already-flattened
    # merge-plus-override pairs mistaken for a literal duplicate.
    data = expect_ok(
        """
z: &z
  w: 1
x:
  inner: &a
    <<: *z
    v: 2
y:
  <<: *a
""",
        "nested merge chain (x: {inner: &a {<<: *z, v: 2}}, y: {<<: *a})",
    )
    if data is not None:
        check(data.get("y") == {"w": 1, "v": 2}, f"y should resolve the full chain, got {data.get('y')!r}")
        check(data.get("x", {}).get("inner") == {"w": 1, "v": 2}, f"x.inner should resolve the chain too, got {data.get('x')!r}")


def run_inline_merge_value_duplicate_rejected():
    expect_value_error(
        """
child:
  <<: {k: 1, k: 2}
""",
        "duplicate key inside an inline (non-anchored) merge value",
        needle="Duplicate key",
    )


def run_repeated_merge_key_rejected():
    expect_value_error(
        """
base: &base
  a: 1
other: &other
  b: 1
child:
  <<: *base
  <<: *other
  c: 3
""",
        "two `<<` merge keys in the same mapping",
        needle="Duplicate merge key",
    )


if __name__ == "__main__":
    run_merge_override_wins()
    run_explicit_duplicate_rejected()
    run_sequence_merge_first_listed_wins()
    run_nested_merge_chain_not_a_false_positive()
    run_inline_merge_value_duplicate_rejected()
    run_repeated_merge_key_rejected()

    print(f"PASSED: {passed}")
    if failures:
        print(f"FAILED: {len(failures)}")
        for f in failures:
            print(" -", f)
        sys.exit(1)
    print("ALL STRICT_YAML TESTS PASSED")
