"""Mutation-style tests for ``database_data.normalization`` (forty-first Method Atlas slice, seventh member
of the `database_data` family). Atlas's own formula (1NF->2NF->3NF/BCNF) is GENUINE COMPUTE -- proven at BOTH
independent layers: the builder's own public interface does not even accept achieved_normal_form/violation
lists as parameters (the same "no parameter even lets a caller attempt to fake it" discipline
devops_sre.capacity_model's own builder established), and the gate independently RECOMPUTES the classification
fresh from the record's own raw key/non-key/FD fields rather than trusting stored values. The compute layer
itself (ai_lego/compute/normalization/closure.py) was independently verified against five textbook
normalization examples before this test file was written -- see that module's own docstring."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.database_data.normalization import (
    METHOD_ID,
    all_gates_pass,
    evaluate_genuine_compute_gate,
    evaluate_normalization_gates,
    evaluate_normalization_integrity_gate,
    evaluate_provenance_required_gate,
    generate_normalization_record,
)
from ai_lego.modules.research.gates import evaluate_statistical_gate
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/normalization-record.schema.yaml"
TS = "2026-09-06T00:00:00Z"


def _prov():
    return make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _fd(determinant, dependent):
    return {"determinant": determinant, "dependent": dependent}


def _build(
    record_id="NORM-T-001",
    entity_name="order_items",
    primary_key=None,
    non_key=None,
    fds=None,
    schema_ref=None,
    denormalization_decision=None,
):
    return generate_normalization_record(
        record_id,
        entity_name,
        ["order_id", "product_id"] if primary_key is None else primary_key,
        ["quantity", "product_name", "product_price"] if non_key is None else non_key,
        [_fd(["product_id"], "product_name"), _fd(["product_id"], "product_price")] if fds is None else fds,
        _prov(),
        schema_ref=schema_ref,
        denormalization_decision=denormalization_decision,
    )


def _valid_record():
    return _build()


def _bcnf_record():
    return _build(record_id="NORM-T-002", entity_name="customers", primary_key=["customer_id"], non_key=["email", "signup_date"], fds=[])


def _third_nf_not_bcnf_record():
    return _build(
        record_id="NORM-T-003",
        entity_name="enrollments",
        primary_key=["student_id", "course_id"],
        non_key=["teacher_id"],
        fds=[_fd(["student_id", "course_id"], "teacher_id"), _fd(["teacher_id"], "course_id")],
    )


def _second_nf_not_third_nf_record():
    """Single-attribute key (so 2NF trivially holds) with a genuine transitive dependency: dept_id -> dept_name."""
    return _build(
        record_id="NORM-T-004",
        entity_name="employees",
        primary_key=["emp_id"],
        non_key=["dept_id", "dept_name"],
        fds=[_fd(["dept_id"], "dept_name")],
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_first_nf_record_validates_against_the_real_schema(self):
        record = _valid_record()
        self.contracts.validate(RECORD_SCHEMA, record, "FIRST_NF normalization record")
        self.assertEqual(record["achieved_normal_form"], "FIRST_NF")

    def test_bcnf_record_validates(self):
        record = _bcnf_record()
        self.contracts.validate(RECORD_SCHEMA, record, "BCNF normalization record")
        self.assertEqual(record["achieved_normal_form"], "BCNF")

    def test_third_nf_not_bcnf_record_validates(self):
        """The classic student/course/teacher example: 3NF holds (the non-superkey determinant's dependent is
        itself a key attribute) but BCNF fails."""
        record = _third_nf_not_bcnf_record()
        self.contracts.validate(RECORD_SCHEMA, record, "THIRD_NF normalization record")
        self.assertEqual(record["achieved_normal_form"], "THIRD_NF")
        self.assertTrue(record["bcnf_violations"])
        self.assertEqual(record["transitive_dependency_violations"], [])

    def test_second_nf_not_third_nf_record_validates(self):
        """Single-attribute key: 2NF holds trivially, but a real transitive dependency violates 3NF."""
        record = _second_nf_not_third_nf_record()
        self.contracts.validate(RECORD_SCHEMA, record, "SECOND_NF normalization record")
        self.assertEqual(record["achieved_normal_form"], "SECOND_NF")
        self.assertEqual(record["partial_dependency_violations"], [])
        self.assertTrue(record["transitive_dependency_violations"])

    # --- version (checked at both layers -- a critic-caught Major: the first draft's own docstring claimed
    # it had applied database_data.data_contract's own id/version lesson in full, but only covered id) ---
    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_VERSION"):
            generate_normalization_record("NORM-T-VERSION", "e", ["id"], [], [], _prov(), version=123)

    def test_none_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_VERSION"):
            generate_normalization_record("NORM-T-VERSION2", "e", ["id"], [], [], _prov(), version=None)

    # --- primary key minimality (the critic-caught Critical: a non-minimal declared key over-reports the
    # achieved normal form, since "prime attribute" is only meaningful relative to a MINIMAL key) ---
    def test_non_minimal_primary_key_is_refused_at_construction(self):
        """Critic's own counterexample: PK=[A,B] with A->B and C->B is NOT minimal -- {A} alone (via A->B
        plus the key's own defining closure) already reaches every attribute. The first-draft code silently
        classified this THIRD_NF; the textbook-correct answer (relative to the true minimal key {A}) is
        SECOND_NF -- an over-report, not a theoretical risk."""
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_PRIMARY_KEY_NOT_MINIMAL"):
            _build(primary_key=["A", "B"], non_key=["C"], fds=[_fd(["A"], "B"), _fd(["C"], "B")])

    def test_non_minimal_three_attribute_primary_key_is_refused(self):
        """Critic's second counterexample: PK=[A,B,C] (3 attributes) with A->B and C->B is not minimal --
        the true candidate key is {A,C}. First-draft code silently classified this THIRD_NF; the
        textbook-correct answer is FIRST_NF (a genuine partial dependency once the key is correctly {A,C})."""
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_PRIMARY_KEY_NOT_MINIMAL"):
            _build(primary_key=["A", "B", "C"], non_key=["D"], fds=[_fd(["A"], "B"), _fd(["C"], "B")])

    def test_minimal_composite_key_is_accepted(self):
        """order_items's own PK=[order_id,product_id] IS minimal (neither attribute alone reaches the
        other) -- confirms the minimality check does not reject legitimate composite keys."""
        record = _valid_record()
        self.assertEqual(record["primary_key_attributes"], ["order_id", "product_id"])

    # --- duplicate functional dependencies (critic-caught: two entries describing the same dependency with
    # a differently-ordered determinant would tie under classify_normal_form's own internal sort key) ---
    def test_duplicate_functional_dependency_same_order_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_DUPLICATE_FUNCTIONAL_DEPENDENCY"):
            _build(primary_key=["a", "b"], non_key=["c"], fds=[_fd(["a"], "c"), _fd(["a"], "c")])

    def test_duplicate_functional_dependency_reordered_determinant_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_DUPLICATE_FUNCTIONAL_DEPENDENCY"):
            _build(primary_key=["a", "b"], non_key=["c"], fds=[_fd(["a", "b"], "c"), _fd(["b", "a"], "c")])

    # --- violation-entry aliasing (critic-caught Major: dict(fd) shallow-copy left every violation entry's
    # own determinant list ALIASED to the same list object stored in functional_dependencies) ---
    def test_violation_entries_do_not_alias_functional_dependencies_own_list_objects(self):
        record = _valid_record()
        fd_determinant = record["functional_dependencies"][0]["determinant"]
        violation_determinant = record["partial_dependency_violations"][0]["determinant"]
        self.assertIsNot(fd_determinant, violation_determinant)
        fd_determinant.append("mutated")
        self.assertNotIn("mutated", record["partial_dependency_violations"][0]["determinant"])

    # --- algorithm correctness regressions killing mutants a mutation-testing pass found surviving ---
    def test_implicit_key_axiom_chaining_is_required_for_correct_classification(self):
        """Only correctly classified BCNF if the implicit 'primary key determines everything' axiom is
        genuinely injected and CHAINED with the explicit FD (a->k alone reaches {a,k}; only WITH the axiom
        {k}->a and {k}->b does closure({a}) reach every attribute). A mutant that drops the axiom injection
        would wrongly classify this THIRD_NF."""
        record = _build(primary_key=["k"], non_key=["a", "b"], fds=[_fd(["a"], "k")])
        self.assertEqual(record["achieved_normal_form"], "BCNF")

    def test_two_hop_fixed_point_convergence_is_required_for_correct_classification(self):
        """closure({c}) only reaches every attribute after TWO rounds (c->a via the explicit FD, then
        a->b via the implicit key axiom). A mutant that runs only a single closure pass (not a real
        fixed-point loop) would wrongly classify this as violating BCNF."""
        record = _build(primary_key=["a"], non_key=["b", "c"], fds=[_fd(["c"], "a"), _fd(["b"], "c")])
        self.assertEqual(record["achieved_normal_form"], "BCNF")
        self.assertEqual(record["bcnf_violations"], [])

    def test_functional_dependency_order_independence_with_three_entries(self):
        """classify_normal_form's own claimed order-independence, pinned with 3 distinct FDs in two
        different insertion orders producing IDENTICAL violation lists (not just identical length)."""
        from ai_lego.compute.normalization.closure import classify_normal_form

        pk, nk = frozenset({"a"}), frozenset({"b", "c", "d"})
        fds_forward = [_fd(["b"], "c"), _fd(["c"], "d"), _fd(["d"], "b")]
        fds_reverse = list(reversed(fds_forward))
        forward = classify_normal_form(pk, nk, fds_forward)
        reverse = classify_normal_form(pk, nk, fds_reverse)
        self.assertEqual(forward["achieved_normal_form"], reverse["achieved_normal_form"])
        self.assertEqual(forward["bcnf_violations"], reverse["bcnf_violations"])

    def test_partial_dependency_check_excludes_prime_dependent_at_the_compute_layer(self):
        """2NF's own partial-dependency rule only concerns NON-key dependents -- a determinant that is a
        proper subset of the key whose OWN dependent is itself prime (a key attribute) must not be flagged.
        This exact combination is mathematically IMPOSSIBLE to reach through the builder once primary-key
        minimality is enforced (a proper-subset determinant that determines another key attribute always
        implies a smaller superkey exists, i.e. the declared key was never minimal -- proved directly: if
        X subsetof K and X->A with A in K, then K-{A} is itself a superkey via X's own closure, so K was not
        irreducible). Tested at the compute layer directly, as a defense-in-depth check independent of
        whichever caller-side invariant currently makes the scenario unreachable in practice."""
        from ai_lego.compute.normalization.closure import classify_normal_form

        pk, nk = frozenset({"a", "b", "c"}), frozenset({"d"})
        result = classify_normal_form(pk, nk, [_fd(["a", "b"], "c")])
        self.assertEqual(result["partial_dependency_violations"], [])

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_normalization_record("NORM-T-005", "e", ["id"], [], [], _prov(), version="2.3.4", generated_by_method="database_data.normalization@test")
        self.assertEqual(record["generated_by_method"], "database_data.normalization@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    # --- achieved_normal_form / violations are NOT parameters ---
    def test_generate_normalization_record_has_no_achieved_normal_form_parameter(self):
        """Pins the core design claim: the builder's own public interface does not even let a caller ATTEMPT
        to fake the classification, the same discipline devops_sre.capacity_model's own builder established."""
        import inspect

        params = set(inspect.signature(generate_normalization_record).parameters)
        self.assertNotIn("achieved_normal_form", params)
        self.assertNotIn("partial_dependency_violations", params)
        self.assertNotIn("transitive_dependency_violations", params)
        self.assertNotIn("bcnf_violations", params)

    # --- id prefix (checked at both layers from the first draft, per data_contract's own critic lesson) ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_norm_prefix_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_RECORD_ID"):
            _build(record_id="ERD-1")

    # --- entity_name ---
    def test_whitespace_only_entity_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_EMPTY_RECORD_FIELD"):
            _build(entity_name="   ")

    # --- primary_key_attributes ---
    def test_zero_primary_key_attributes_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_PRIMARY_KEY"):
            _build(primary_key=[], non_key=["a"], fds=[])

    def test_duplicate_primary_key_attributes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_PRIMARY_KEY"):
            _build(primary_key=["id", "id"], non_key=[], fds=[])

    def test_non_string_primary_key_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_PRIMARY_KEY"):
            _build(primary_key=["id", 123], non_key=[], fds=[])

    # --- non_key_attributes ---
    def test_duplicate_non_key_attributes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_NON_KEY_ATTRIBUTES"):
            _build(primary_key=["id"], non_key=["a", "a"], fds=[])

    def test_empty_non_key_attributes_is_legal(self):
        record = _build(primary_key=["id"], non_key=[], fds=[])
        self.assertEqual(record["non_key_attributes"], [])

    # --- disjointness ---
    def test_attribute_in_both_key_and_nonkey_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_KEY_NONKEY_OVERLAP"):
            _build(primary_key=["id"], non_key=["id", "name"], fds=[])

    # --- functional_dependencies: shape ---
    def test_fd_with_extra_key_is_refused_at_construction(self):
        entities_fd = dict(_fd(["product_id"], "product_name"), note="x")
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_FUNCTIONAL_DEPENDENCIES"):
            _build(fds=[entities_fd])

    def test_fd_missing_a_required_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_FUNCTIONAL_DEPENDENCIES"):
            _build(fds=[{"determinant": ["product_id"]}])

    def test_fd_empty_determinant_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_FUNCTIONAL_DEPENDENCIES"):
            _build(fds=[_fd([], "product_name")])

    def test_fd_duplicate_determinant_entries_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_FUNCTIONAL_DEPENDENCIES"):
            _build(primary_key=["a", "b"], non_key=["c"], fds=[_fd(["a", "a"], "c")])

    def test_fd_non_string_dependent_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_FUNCTIONAL_DEPENDENCIES"):
            _build(fds=[{"determinant": ["product_id"], "dependent": 123}])

    def test_non_list_fds_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_FUNCTIONAL_DEPENDENCIES"):
            _build(fds="not a list")

    # --- functional_dependencies: referential integrity ---
    def test_fd_determinant_referencing_unknown_attribute_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_FUNCTIONAL_DEPENDENCIES"):
            _build(fds=[_fd(["nonexistent_attribute"], "product_name")])

    def test_fd_dependent_referencing_unknown_attribute_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_FUNCTIONAL_DEPENDENCIES"):
            _build(fds=[_fd(["product_id"], "nonexistent_attribute")])

    # --- functional_dependencies: no trivial FDs ---
    def test_trivial_fd_dependent_inside_own_determinant_is_refused(self):
        """A trivial FD (e.g. {A,B} -> A) is always vacuously true and would silently pollute the
        classification's own evidence -- refused, not silently accepted."""
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_FUNCTIONAL_DEPENDENCIES"):
            _build(primary_key=["a", "b"], non_key=["c"], fds=[_fd(["a", "b"], "a")])

    def test_single_attribute_trivial_fd_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_FUNCTIONAL_DEPENDENCIES"):
            _build(primary_key=["a"], non_key=["b"], fds=[_fd(["a"], "a")])

    # --- schema_ref ---
    def test_schema_ref_none_is_legal_and_omitted_from_the_record(self):
        self.assertNotIn("schema_ref", _valid_record())

    def test_schema_ref_with_erd_prefix_is_accepted(self):
        record = _build(schema_ref="ERD-2026-09-05-002")
        self.assertEqual(record["schema_ref"], "ERD-2026-09-05-002")

    def test_schema_ref_with_wrong_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_SOFT_REF"):
            _build(schema_ref="NORM-2026-09-06-001")

    # --- denormalization_decision ---
    def test_denormalization_decision_none_is_legal_and_omitted(self):
        self.assertNotIn("denormalization_decision", _valid_record())

    def test_denormalization_decision_keep_normalized_is_accepted(self):
        record = _build(denormalization_decision={"decision": "keep_normalized", "reasoning": "no operational need to denormalize yet"})
        self.assertEqual(record["denormalization_decision"]["decision"], "keep_normalized")

    def test_denormalization_decision_illegal_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_DENORMALIZATION_DECISION"):
            _build(denormalization_decision={"decision": "maybe_later", "reasoning": "unsure"})

    def test_denormalization_decision_empty_reasoning_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_DENORMALIZATION_DECISION"):
            _build(denormalization_decision={"decision": "denormalize", "reasoning": ""})

    def test_denormalization_decision_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORMALIZATION_INVALID_DENORMALIZATION_DECISION"):
            _build(denormalization_decision={"decision": "denormalize", "reasoning": "x", "approved_by": "dba-team"})

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_norm_prefix(self):
        record = _valid_record()
        record["id"] = "ERD-1"
        with self.assertRaisesRegex(Exception, "NORM-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_a_schema_ref_without_the_erd_prefix(self):
        record = _valid_record()
        record["schema_ref"] = "NORM-999"
        with self.assertRaisesRegex(Exception, "ERD-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema schema_ref prefix")

    def test_schema_layer_rejects_an_illegal_achieved_normal_form_value(self):
        record = _valid_record()
        record["achieved_normal_form"] = "FOURTH_NF"
        with self.assertRaisesRegex(Exception, "FOURTH_NF"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema achieved_normal_form enum")

    def test_schema_layer_rejects_wrong_engine_value(self):
        record = _valid_record()
        record["engine"] = "gpt-4"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema engine const")

    def test_schema_layer_rejects_extra_key_on_a_functional_dependency(self):
        record = _valid_record()
        record["functional_dependencies"][0]["note"] = "x"
        with self.assertRaisesRegex(Exception, "note"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema fd additionalProperties")

    def test_schema_layer_rejects_zero_primary_key_attributes(self):
        record = _valid_record()
        record["primary_key_attributes"] = []
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema minItems on primary_key_attributes")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        record = _valid_record()
        del record["achieved_normal_form"]
        with self.assertRaisesRegex(Exception, "achieved_normal_form"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    def test_schema_layer_rejects_extra_key_on_denormalization_decision(self):
        record = _build(denormalization_decision={"decision": "keep_normalized", "reasoning": "x"})
        record["denormalization_decision"]["approved_by"] = "dba-team"
        with self.assertRaisesRegex(Exception, "approved_by"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema denormalization_decision additionalProperties")

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        primary_key = ["order_id", "product_id"]
        non_key = ["quantity", "product_name", "product_price"]
        fds = [_fd(["product_id"], "product_name")]
        record = generate_normalization_record("NORM-T-010", "e", primary_key, non_key, fds, _prov())
        primary_key.append("extra")
        non_key.append("extra")
        fds[0]["determinant"].append("extra")
        self.assertEqual(record["primary_key_attributes"], ["order_id", "product_id"])
        self.assertEqual(record["non_key_attributes"], ["quantity", "product_name", "product_price"])
        self.assertEqual(record["functional_dependencies"][0]["determinant"], ["product_id"])

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_normalization_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        """Closes a critic-identified repo-wide gap (no test anywhere validates a typed-object schema's own
        `examples` block against the schema AND its real gates): a critic review's own probe found this
        schema's example #1 would have FAILED the real integrity gate before the M1 compute fix, because the
        example's own transitive_dependency_violations:[] disagreed with what the (then-buggy) code
        recomputed. Both examples are now checked directly against the live schema and the live gates, not
        just eyeballed."""
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "normalization-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "normalization-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_normalization_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_normalization_integrity_gate(record, "test", TS)

    def test_valid_first_nf_record_passes_all_three_gates(self):
        results = evaluate_normalization_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "genuine_compute", "normalization_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_valid_bcnf_record_passes_all_three_gates(self):
        self.assertTrue(all_gates_pass(evaluate_normalization_gates(_bcnf_record(), "test", TS)))

    def test_valid_third_nf_not_bcnf_record_passes_all_three_gates(self):
        self.assertTrue(all_gates_pass(evaluate_normalization_gates(_third_nf_not_bcnf_record(), "test", TS)))

    def test_valid_second_nf_not_third_nf_record_passes_all_three_gates(self):
        self.assertTrue(all_gates_pass(evaluate_normalization_gates(_second_nf_not_third_nf_record(), "test", TS)))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_normalization_gates(record, "test", TS)))

    # --- genuine_compute gate (shared function, reused unchanged) ---
    def test_genuine_compute_gate_is_the_real_evaluate_statistical_gate_function_reused_unchanged(self):
        """Proves the reuse is real function identity -- seventh reuse this session, after root_cause.pareto/
        decision.ahp/decision.mcda/devops_sre.error_budget/database_data.data_lineage/database_data
        .reconciliation."""
        from ai_lego.modules.database_data import normalization as normalization_module

        self.assertIs(normalization_module.evaluate_statistical_gate, evaluate_statistical_gate)

    def test_hand_tampered_wrong_epistemic_type_fails_the_genuine_compute_gate(self):
        record = _valid_record()
        record["provenance"] = make_provenance("AI_INFERENCE", "AI_GENERATED")
        gate = evaluate_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_non_string_version_fails_the_gate(self):
        record = _valid_record()
        record["version"] = 123
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "version missing or not a string")

    def test_hand_tampered_missing_version_key_fails_the_gate(self):
        record = _valid_record()
        del record["version"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "version missing or not a string")

    def test_hand_tampered_non_minimal_primary_key_fails_the_gate(self):
        """Gate-layer companion to the builder's own minimality regression: a record built with a genuinely
        minimal key (no FDs beyond the key itself) is then hand-tampered to ADD a functional dependency that
        makes a proper subset of the declared key also a superkey -- the gate must catch this fresh, not
        just at construction time (the builder would have refused this FD set outright)."""
        record = _build(primary_key=["A", "B"], non_key=["C"], fds=[])
        self.assertEqual(record["primary_key_attributes"], ["A", "B"])
        record["functional_dependencies"] = [_fd(["A"], "B")]  # hand-tamper: now {A} alone is a superkey
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "primary_key_attributes is not minimal (irreducible) -- at least one attribute can be removed while remaining a superkey")

    def test_hand_tampered_duplicate_functional_dependency_fails_the_gate(self):
        record = _valid_record()
        record["functional_dependencies"].append(dict(record["functional_dependencies"][0]))
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "functional_dependencies contains two or more entries describing the same dependency (identical determinant set + dependent)")

    def test_hand_tampered_wrong_engine_fails_the_genuine_compute_gate(self):
        record = _valid_record()
        record["engine"] = "gpt-4"
        gate = evaluate_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_the_genuine_compute_gate_not_a_crash(self):
        self.assertEqual(evaluate_genuine_compute_gate(None, "test", TS)["status"], "FAIL")

    # --- normalization_integrity gate: structural re-derivation ---
    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'NORM-'")

    def test_hand_tampered_id_without_norm_prefix_fails_the_gate(self):
        record = _valid_record()
        record["id"] = "ERD-1"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'NORM-'")

    def test_hand_tampered_empty_entity_name_fails_the_gate(self):
        record = _valid_record()
        record["entity_name"] = " "
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "entity_name missing or empty")

    def test_hand_tampered_empty_primary_key_fails_the_gate(self):
        record = _valid_record()
        record["primary_key_attributes"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "primary_key_attributes invalid (empty, malformed, non-string entry, or duplicate)")

    def test_hand_tampered_duplicate_non_key_fails_the_gate(self):
        record = _valid_record()
        record["non_key_attributes"] = [record["non_key_attributes"][0], record["non_key_attributes"][0]]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "non_key_attributes invalid (malformed, non-string entry, or duplicate)")

    def test_hand_tampered_key_nonkey_overlap_fails_the_gate(self):
        record = _valid_record()
        record["non_key_attributes"] = record["non_key_attributes"] + [record["primary_key_attributes"][0]]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "primary_key_attributes and non_key_attributes are not disjoint")

    def test_hand_tampered_fd_referencing_unknown_attribute_fails_the_gate(self):
        record = _valid_record()
        record["functional_dependencies"].append(_fd(["ghost_attribute"], "quantity"))
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "functional_dependencies invalid (malformed entry, unknown keys, non-real attribute reference, or a trivial FD)")

    def test_hand_tampered_trivial_fd_fails_the_gate(self):
        record = _valid_record()
        record["functional_dependencies"].append(_fd(["product_id"], "product_id"))
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "functional_dependencies invalid (malformed entry, unknown keys, non-real attribute reference, or a trivial FD)")

    def test_hand_tampered_schema_ref_prefix_broken_fails_the_gate(self):
        record = _build(schema_ref="ERD-2026-09-05-002")
        record["schema_ref"] = "NORM-not-an-erd"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "schema_ref present but malformed (missing 'ERD-' prefix or empty)")

    def test_hand_tampered_missing_schema_ref_key_still_passes(self):
        record = _valid_record()
        self.assertNotIn("schema_ref", record)
        self.assertTrue(all_gates_pass(evaluate_normalization_gates(record, "test", TS)))

    def test_hand_tampered_denormalization_decision_illegal_value_fails_the_gate(self):
        record = _build(denormalization_decision={"decision": "keep_normalized", "reasoning": "x"})
        record["denormalization_decision"]["decision"] = "maybe_later"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "denormalization_decision present but malformed (unknown keys, illegal decision value, or empty reasoning)")

    # --- the load-bearing invariant: stored classification must match recomputation ---
    def test_hand_tampered_falsely_upgraded_achieved_normal_form_fails_the_gate(self):
        """The core genuine-compute invariant: a record genuinely at FIRST_NF cannot be hand-tampered to claim
        BCNF -- the gate recomputes fresh from the record's own raw key/non-key/FD fields."""
        record = _valid_record()
        self.assertEqual(record["achieved_normal_form"], "FIRST_NF")
        record["achieved_normal_form"] = "BCNF"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "stored achieved_normal_form disagrees with recomputation")
        self.assertEqual(gate["evidence"][0]["recomputed"], "FIRST_NF")

    def test_hand_tampered_falsely_emptied_partial_dependency_violations_fails_the_gate(self):
        """Regression class: upgrading achieved_normal_form's OWN label is not the only way to lie -- clearing
        the violation list while raw inputs are unchanged must also be caught."""
        record = _valid_record()
        record["partial_dependency_violations"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "stored partial_dependency_violations disagrees with recomputation")

    def test_hand_tampered_falsely_added_bcnf_violation_fails_the_gate(self):
        """The mismatch check must fire in BOTH directions -- adding a phantom violation that recomputation
        does not produce, not just removing a real one."""
        record = _bcnf_record()
        self.assertEqual(record["bcnf_violations"], [])
        record["bcnf_violations"] = [_fd(["email"], "signup_date")]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "stored bcnf_violations disagrees with recomputation")

    def test_gate_evidence_reports_accurate_counts_on_a_valid_record(self):
        gate = self._gate(_bcnf_record())
        self.assertEqual(gate["evidence"][0], {"attribute_count": 3, "functional_dependency_count": 0, "achieved_normal_form": "BCNF"})

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _third_nf_not_bcnf_record()
        before = copy.deepcopy(record)
        self._gate(record)
        self.assertEqual(record, before)

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                self.assertEqual(self._gate(bad_record)["status"], "FAIL")
                self.assertEqual(evaluate_provenance_required_gate(bad_record, "test", TS)["status"], "FAIL")

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", TS)["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
