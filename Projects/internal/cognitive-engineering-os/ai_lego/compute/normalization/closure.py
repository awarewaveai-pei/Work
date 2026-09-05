"""Relational-algebra attribute closure and normal-form classification -- deterministic compute, backing
``database_data.normalization``.

Atlas's own F21 table formula (L900: "1NF→2NF→3NF/BCNF") is standard
relational normalization theory, not this session's own invention:
given an entity's declared primary key, its non-key attributes, and a
caller-supplied set of functional dependencies (X -> A, "X determines
A"), the highest normal form the entity actually satisfies is a
DERIVED, computable fact -- not a caller assertion. This module
implements the textbook attribute-closure algorithm (Armstrong's
axioms' standard fixed-point computation) to test whether a given
attribute set is a SUPERKEY (its closure covers every attribute in the
entity), which is the load-bearing primitive both 3NF and BCNF are
defined in terms of.

Deterministic / order-independent by construction, the same discipline
``compute/lineage/traversal.py``'s own forward-reachability rewrite
established for this package: closure computation is a MONOTONIC fixed
point over set union (each round can only ADD attributes, never remove
or reorder them), so the result cannot depend on the order functional
dependencies are supplied in, nor on how many rounds it takes to
converge.

SCOPE: this module tests normal forms relative to the SINGLE declared
primary key, not the full candidate-key closure of the FD set (computing
every candidate key from an FD set is a harder, combinatorially
different problem -- see the method contract's own compilation_decisions
for why that is out of scope). The primary key is treated as an axiom
(a validly-declared key ALWAYS determines every other attribute in its
own entity, by definition of "key" in relational theory) -- this axiom
is injected as an implicit functional dependency before running the
closure algorithm, so a caller does not have to spell out one FD per
non-key attribute just to establish what a "key" already means.

CRITICAL, caught by a critic review of this slice's own first draft:
the "single declared key" axiom is only sound if the declared key is
actually MINIMAL (irreducible) -- a NON-minimal declared key (e.g.
``{A, B}`` when the explicit FDs already show ``A`` alone plus the
key's own defining closure reach everything) silently OVER-REPORTS the
achieved normal form, because "prime attribute" (the 3NF exception)
is defined relative to attributes that are members of the declared
key -- an attribute that is only "prime" because the declared key was
needlessly large is not really prime under real relational theory,
where primeness is defined relative to a MINIMAL candidate key.
``primary_key_is_minimal`` below tests this directly (removing any
SINGLE attribute from the declared key and checking whether the
remainder is STILL a superkey, under the explicit FDs alone -- by the
standard monotonicity argument, this single-attribute-removal test is
provably SUFFICIENT to detect non-minimality of any size: if some
proper subset were a superkey, removing any one attribute not in that
subset would already reveal it). The method layer (``ai_lego/modules
/database_data/normalization.py``) REJECTS a non-minimal declared key
at both the builder and the gate rather than silently producing a
wrong classification.

ASSUMES every functional dependency's own determinant/dependent already
names a real attribute of the entity, and no FD is trivial (dependent
inside its own determinant) -- both are validated by the CALLER (the
shared predicates in ``ai_lego/modules/database_data/normalization.py``,
checked by BOTH the builder and the gate BEFORE this function is ever
called), the same "compute layer assumes well-formed input, method
layer validates it" separation every prior compute module in this
package already follows.
"""

from __future__ import annotations

from typing import Any


def _implicit_key_fds(primary_key: frozenset[str], all_attributes: frozenset[str]) -> list[dict[str, Any]]:
    """A validly-declared primary key determines every OTHER attribute in its own entity, by definition of
    'key' -- injected as implicit functional dependencies so callers need not spell one out per non-key
    attribute."""
    return [{"determinant": sorted(primary_key), "dependent": attribute} for attribute in sorted(all_attributes - primary_key)]


def attribute_closure(determinant: frozenset[str], functional_dependencies: list[dict[str, Any]]) -> frozenset[str]:
    """Standard relational-algebra attribute closure: starting from ``determinant``, repeatedly union in every
    functional dependency's own ``dependent`` whose own ``determinant`` is already a subset of the
    closure-so-far, until a fixed point (no round adds anything new). Deterministic / order-independent: a
    monotonic fixed point over set union, the same guarantee ``compute/lineage/traversal.py``'s own forward
    reachability already establishes for this package."""
    closure = set(determinant)
    changed = True
    while changed:
        changed = False
        for fd in functional_dependencies:
            fd_determinant = set(fd["determinant"])
            if fd_determinant <= closure and fd["dependent"] not in closure:
                closure.add(fd["dependent"])
                changed = True
    return frozenset(closure)


def is_superkey(candidate: frozenset[str], functional_dependencies: list[dict[str, Any]], primary_key: frozenset[str], all_attributes: frozenset[str]) -> bool:
    """A candidate attribute set is a superkey of this entity iff its closure -- under the caller-supplied
    functional dependencies PLUS the implicit primary-key-determines-everything axiom (grounded in the
    DECLARED ``primary_key`` argument, not the ``candidate`` under test -- non-circular: this asks whether a
    smaller set can reach the closure already known to hold for the declared key, not whether the candidate
    is itself a key) -- covers every attribute in the entity."""
    augmented_fds = list(functional_dependencies) + _implicit_key_fds(primary_key, all_attributes)
    return attribute_closure(candidate, augmented_fds) >= all_attributes


def primary_key_is_minimal(primary_key: frozenset[str], functional_dependencies: list[dict[str, Any]], all_attributes: frozenset[str]) -> bool:
    """A declared primary key is minimal (irreducible) iff removing ANY single attribute from it no longer
    yields a superkey. Sufficient by the standard monotonicity argument: attribute closure only grows as the
    starting set grows, so if some proper subset S of primary_key were a superkey, then for any attribute A
    in primary_key but not in S, S is also a subset of (primary_key - {A}), and closure monotonicity would
    make (primary_key - {A}) a superkey too -- so if EVERY single-attribute removal fails to be a superkey,
    NO proper subset (of any size) can be either. A single-attribute primary key is trivially minimal (no
    non-empty proper subset exists to test)."""
    if len(primary_key) <= 1:
        return True
    return all(not is_superkey(primary_key - {attribute}, functional_dependencies, primary_key, all_attributes) for attribute in primary_key)


def classify_normal_form(primary_key: frozenset[str], non_key_attributes: frozenset[str], functional_dependencies: list[dict[str, Any]]) -> dict[str, Any]:
    """Determines the highest normal form this entity satisfies, per Atlas's own '1NF→2NF→3NF/BCNF' formula.
    1NF is assumed satisfied by construction (the caller's own attribute list is already flat/atomic --
    ``database_data.normalization``'s own record shape has no repeating-group representation). Returns
    ``{achieved_normal_form, partial_dependency_violations, transitive_dependency_violations,
    bcnf_violations}`` -- every violation list is a SORTED list of the offending functional dependency dicts,
    for deterministic evidence (never depends on functional_dependencies' own input order).

    - 2NF violation ("partial dependency"): an FD whose determinant is a PROPER, non-empty subset of the
      (possibly composite) primary key, and whose dependent is a non-key attribute. Impossible by
      construction when the primary key has exactly one attribute (a proper non-empty subset of a
      one-element set does not exist) -- the standard textbook rule that a single-attribute key always
      satisfies 2NF falls out of this definition directly, no special case needed.
    - 3NF violation ("transitive dependency"): an FD whose dependent is a non-key attribute, whose
      determinant is NOT a superkey, AND whose determinant is NOT already a partial-dependency violation
      above -- CORRECTED post-critic-review: a first-draft version counted every 2NF-violating FD a SECOND
      time here too (formally accurate under 3NF's bare definition, since a partial dependency's determinant
      is indeed non-superkey, but this made ``transitive_dependency_violations`` a misleading NAME -- a
      partial dependency on a proper subset of a composite key is not a TRANSITIVE dependency in the
      textbook sense (a chain through an intermediate non-key attribute), and the achieved_normal_form
      classification's own FIRST_NF branch already short-circuits before this list is even consulted, so
      excluding partial entries here changes NOTHING about the classification, only makes the two evidence
      lists mutually exclusive and honestly named).
    - BCNF violation: an FD whose determinant is NOT a superkey, regardless of whether its dependent is a
      key or non-key attribute (BCNF drops 3NF's "dependent is prime" exception).
    """
    all_attributes = primary_key | non_key_attributes

    def _sort_key(fd: dict[str, Any]) -> tuple[Any, ...]:
        return (tuple(sorted(fd["determinant"])), fd["dependent"])

    partial_dependency_violations = sorted(
        (
            fd
            for fd in functional_dependencies
            if set(fd["determinant"]) < primary_key and set(fd["determinant"]) and fd["dependent"] in non_key_attributes
        ),
        key=_sort_key,
    )
    partial_dependency_keys = {(frozenset(fd["determinant"]), fd["dependent"]) for fd in partial_dependency_violations}
    transitive_dependency_violations = sorted(
        (
            fd
            for fd in functional_dependencies
            if fd["dependent"] in non_key_attributes
            and (frozenset(fd["determinant"]), fd["dependent"]) not in partial_dependency_keys
            and not is_superkey(frozenset(fd["determinant"]), functional_dependencies, primary_key, all_attributes)
        ),
        key=_sort_key,
    )
    bcnf_violations = sorted(
        (fd for fd in functional_dependencies if not is_superkey(frozenset(fd["determinant"]), functional_dependencies, primary_key, all_attributes)),
        key=_sort_key,
    )

    if partial_dependency_violations:
        achieved = "FIRST_NF"
    elif transitive_dependency_violations:
        achieved = "SECOND_NF"
    elif bcnf_violations:
        achieved = "THIRD_NF"
    else:
        achieved = "BCNF"

    return {
        "achieved_normal_form": achieved,
        "partial_dependency_violations": partial_dependency_violations,
        "transitive_dependency_violations": transitive_dependency_violations,
        "bcnf_violations": bcnf_violations,
    }
