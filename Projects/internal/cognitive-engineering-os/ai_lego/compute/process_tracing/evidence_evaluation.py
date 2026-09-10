"""Process-tracing evidence-implication derivation -- deterministic compute, backing ``causal.process_tracing``.

Atlas F11 table row (L620) usage column "mechanism→hoop/smoking-gun evidence" names, by its own literal English
vocabulary, Van Evera's asymmetric hoop-test/smoking-gun-test typology -- the STRUCTURAL POINT of this method,
per Atlas's own citation, is that these two test types carry DIFFERENT logical implications when evidence is
PRESENT vs ABSENT, not a single generic "evidence found/not found" fact. Same Trusted Compute discipline
``compute/five_w1h/gap_detection.py`` already establishes for a categorical (non-arithmetic) but still
LLM-must-not-assert derivation (Atlas §29 rule 6: "數學與統計必須由 Trusted Compute 執行" -- applied here to a
lookup-table derivation over ``(test_type, result)`` rather than arithmetic).

HOOP test (necessary, not sufficient): failing it (``ABSENT``) ELIMINATES the hypothesis; passing it
(``PRESENT``) only means the hypothesis is NOT (yet) eliminated -- it does not confirm anything.
SMOKING_GUN test (sufficient, not necessary): finding it (``PRESENT``) CONFIRMS the hypothesis; its absence
(``ABSENT``) is inconclusive -- it does not rule the hypothesis out.

Called twice for every record's own lifecycle: once at construction
(``ai_lego.modules.causal.process_tracing.generate_process_tracing_record`` computes every evidence entry's own
``implication`` plus the record-level ``hypothesis_status``) and once, independently, inside the integrity gate
(to re-derive and compare against whatever is actually stored) -- the gate never trusts that the constructor
ran, or ran correctly, on a hand-tampered record.

SCOPE: deliberately restricted to the TWO test types Atlas's own row literally names (HOOP, SMOKING_GUN), not
Van Evera's full four-type typology (straw-in-the-wind, doubly-decisive omitted) -- see
``causal.process_tracing.contract.yaml``'s own ``OQ-PROCESSTRACING-2``.
"""

from __future__ import annotations

VALID_TEST_TYPES = frozenset({"HOOP", "SMOKING_GUN"})
VALID_RESULTS = frozenset({"PRESENT", "ABSENT"})

_IMPLICATION_TABLE = {
    ("HOOP", "PRESENT"): "HYPOTHESIS_NOT_ELIMINATED",
    ("HOOP", "ABSENT"): "HYPOTHESIS_ELIMINATED",
    ("SMOKING_GUN", "PRESENT"): "HYPOTHESIS_CONFIRMED",
    ("SMOKING_GUN", "ABSENT"): "HYPOTHESIS_NOT_CONFIRMED",
}


def derive_implication(test_type: str, result: str) -> str:
    """Given an already shape-validated ``(test_type, result)`` pair (caller's own responsibility, not
    re-checked here -- same validate-then-derive split ``compute/morphological_analysis
    /combination_generation.py``'s own SCOPE note already establishes), returns the one Van Evera-correct
    implication string. Pure lookup, no hidden state, deterministic by construction."""
    return _IMPLICATION_TABLE[(test_type, result)]


def derive_hypothesis_status(implications: list[str]) -> str:
    """Given an already shape-validated list of per-evidence ``implication`` strings, returns the record-level
    ``hypothesis_status``:

    * ``ELIMINATED`` if ANY entry is ``HYPOTHESIS_ELIMINATED`` -- a failed HOOP test is dispositive: a
      necessary-condition failure logically forecloses the hypothesis regardless of any other, merely
      sufficient confirming evidence, so this takes precedence over ``CONFIRMED`` when both appear in the same
      evidence set.
    * else ``CONFIRMED`` if ANY entry is ``HYPOTHESIS_CONFIRMED``.
    * else ``SURVIVING`` -- neither eliminated nor confirmed: the hypothesis has not failed any
      necessary-condition test but has not yet cleared a sufficient-condition one either.

    Pure and stateless -- does not itself validate shape (callers run shape validation first, same split
    ``compute/morphological_analysis/combination_generation.py``'s own module already establishes between
    validation and derivation). Never mutates ``implications``.
    """
    if "HYPOTHESIS_ELIMINATED" in implications:
        return "ELIMINATED"
    if "HYPOTHESIS_CONFIRMED" in implications:
        return "CONFIRMED"
    return "SURVIVING"
