"""Mutation-style tests for ``security.zero_trust_review`` (forty-ninth Method Atlas slice, SIXTH member of
the `security` family, F20 -- the SECOND F20 member, after `security.dpia_pia`, that is NOT one of Execution
Contract §32's own four named Threat Review methods). Two real invariant classes proven at BOTH the
construction and the independent gate layer: (1) the STAGE-1 REQUIRED SET invariant (identity_context must
carry all three of subject/workload/resource), and (2) the FORBIDDEN-CREDENTIAL-TYPE denylist (Master Plan
§62's own explicit "禁止" list: shared_password/long_lived_api_key/hardcoded_secret)."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.security.zero_trust_review import (
    FORBIDDEN_CREDENTIAL_TYPES,
    METHOD_ID,
    STAGE_ORDER,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_zero_trust_review_gates,
    evaluate_zero_trust_review_integrity_gate,
    generate_zero_trust_review_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/zero-trust-review-record.schema.yaml"
TS = "2026-09-06T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _subject(subject_id="SUBJ-1", description="a subject", idp_ref=None):
    return {"subject_id": subject_id, "description": description, "idp_ref": idp_ref}


def _workload(workload_id="WL-1", description="a workload", workload_identity_strategy_ref=None):
    return {"workload_id": workload_id, "description": description, "workload_identity_strategy_ref": workload_identity_strategy_ref}


def _resource(resource_id="RES-1", description="a resource", sensitivity_classification="Internal"):
    return {"resource_id": resource_id, "description": description, "sensitivity_classification": sensitivity_classification}


def _identity_context(subject=None, workload=None, resource=None):
    return {
        "stage_id": "identity_context",
        "subject": _subject() if subject is None else subject,
        "workload": _workload() if workload is None else workload,
        "resource": _resource() if resource is None else resource,
    }


def _access_decision(**overrides):
    base = {
        "stage_id": "access_decision",
        "authn_method": "password+OTP",
        "authn_verified": True,
        "authz_decision": "permit",
        "least_privilege_confirmed": True,
        "pdp_engine_ref": None,
    }
    base.update(overrides)
    return base


def _credential_issuance(**overrides):
    base = {
        "stage_id": "credential_issuance",
        "credential_type": "mtls_short_lived_cert",
        "ttl_seconds": 3600,
        "issued_at": "2026-09-06T00:00:00Z",
        "mutual_authentication_confirmed": True,
    }
    base.update(overrides)
    return base


def _audit_trail(**overrides):
    base = {
        "stage_id": "audit_trail",
        "audit_log_ref": "ledger://audit/1",
        "continuous_monitoring_confirmed": True,
        "resource_access_granted": True,
    }
    base.update(overrides)
    return base


def _valid_stages():
    return [_identity_context(), _access_decision(), _credential_issuance(), _audit_trail()]


def _build(record_id="ZTR-T-001", system_or_component="a system", stages=None):
    return generate_zero_trust_review_record(record_id, system_or_component, _valid_stages() if stages is None else stages, _prov())


def _valid_record():
    return _build()


def _compliant_stages():
    """ADR-016's own real ratified values (Zitadel / cloud-native mTLS strategy / Cedar), illustrative --
    not a claim a real deployed access path was reviewed (see method contract's own description)."""
    return [
        _identity_context(
            subject=_subject("agent:cognitive-os-runtime-001", "AI agent executing a method invocation.", idp_ref="Zitadel"),
            workload=_workload("workload:ai-lego-method-executor", "The method-execution workload process.", workload_identity_strategy_ref="cloud-native workload identity + short-lived-credential mTLS"),
            resource=_resource("resource:event-ledger-nordbrook", "The tenant's append-only Event Ledger.", sensitivity_classification="Confidential"),
        ),
        _access_decision(authn_method="mTLS client certificate", authz_decision="permit", pdp_engine_ref="Cedar"),
        _credential_issuance(),
        _audit_trail(),
    ]


def _compliant_record():
    return _build(record_id="ZTR-T-002", system_or_component="Event Ledger access under ADR-016", stages=_compliant_stages())


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "minimal Zero Trust Review record")

    def test_compliant_record_validates_in_atlas_own_order(self):
        record = _compliant_record()
        self.contracts.validate(RECORD_SCHEMA, record, "ADR-016-illustrative Zero Trust Review record")
        self.assertEqual([s["stage_id"] for s in record["stages"]], list(STAGE_ORDER))

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_zero_trust_review_record("ZTR-T-005", "s", _valid_stages(), _prov(), version="2.3.4", generated_by_method="security.zero_trust_review@test")
        self.assertEqual(record["generated_by_method"], "security.zero_trust_review@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_stage_order_constant_matches_atlas_own_four_word_chain(self):
        self.assertEqual(STAGE_ORDER, ("identity_context", "access_decision", "credential_issuance", "audit_trail"))

    def test_forbidden_credential_types_constant_matches_master_plan_own_denylist(self):
        self.assertEqual(FORBIDDEN_CREDENTIAL_TYPES, frozenset({"shared_password", "long_lived_api_key", "hardcoded_secret"}))

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "zero-trust-review-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "zero-trust-review-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_zero_trust_review_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    # --- id / version ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_ztr_prefix_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_RECORD_ID"):
            _build(record_id="DPIA-1")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_VERSION"):
            generate_zero_trust_review_record("ZTR-T-V1", "s", _valid_stages(), _prov(), version=123)

    def test_empty_system_or_component_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ZTR_EMPTY_RECORD_FIELD"):
            _build(system_or_component="")

    # --- stages: shape and order ---
    def test_two_adjacent_stages_swapped_is_refused_even_though_the_set_is_unchanged(self):
        stages = _valid_stages()
        stages[0], stages[1] = stages[1], stages[0]
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_audit_trail_moved_to_the_front_is_refused(self):
        stages = _valid_stages()
        stages.insert(0, stages.pop())
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_missing_a_stage_is_refused(self):
        stages = _valid_stages()[:-1]  # only three
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_duplicate_stage_is_refused(self):
        stages = _valid_stages()[:-1]  # drop audit_trail
        stages.append(_identity_context())  # duplicate identity_context instead of audit_trail
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_extra_fifth_stage_is_refused(self):
        """Regression guard, same class security.pasta's/security.dpia_pia's own critic-caught test already
        establishes: the extra element must itself be SHAPE-VALID (a real audit_trail stage), or this would
        pass 'by accident' via the shape check at position -1 rather than genuinely exercising the length
        guard."""
        stages = _valid_stages() + [_audit_trail()]
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_stage_with_wrong_stage_id_value_in_right_position_is_refused(self):
        stages = _valid_stages()
        stages[0]["stage_id"] = "access_decision"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_non_list_stages_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages="not a list")

    def test_non_dict_stage_entry_is_refused_not_crashed(self):
        stages = _valid_stages()
        stages[0] = "not a dict"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    # --- identity_context: the STAGE-1 REQUIRED SET invariant ---
    def test_identity_context_missing_subject_is_refused(self):
        stages = _valid_stages()
        del stages[0]["subject"]
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_identity_context_missing_workload_is_refused(self):
        stages = _valid_stages()
        del stages[0]["workload"]
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_identity_context_missing_resource_is_refused(self):
        """The core STAGE-1 REQUIRED SET invariant: dropping just ONE of the three parallel sub-entities,
        with the other two untouched and well-shaped, must still be refused."""
        stages = _valid_stages()
        del stages[0]["resource"]
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_identity_context_with_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[0]["extra"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_subject_missing_subject_id_is_refused(self):
        stages = _valid_stages()
        del stages[0]["subject"]["subject_id"]
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_subject_empty_subject_id_is_refused(self):
        stages = _valid_stages()
        stages[0]["subject"]["subject_id"] = "  "
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_subject_empty_description_is_refused(self):
        stages = _valid_stages()
        stages[0]["subject"]["description"] = ""
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_subject_with_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[0]["subject"]["extra"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_subject_idp_ref_null_is_legal(self):
        record = _build()
        self.assertIsNone(record["stages"][0]["subject"]["idp_ref"])

    def test_subject_idp_ref_zitadel_round_trips(self):
        stages = _valid_stages()
        stages[0]["subject"]["idp_ref"] = "Zitadel"
        record = _build(stages=stages)
        self.assertEqual(record["stages"][0]["subject"]["idp_ref"], "Zitadel")

    def test_subject_idp_ref_non_compliant_value_is_still_legal(self):
        """A soft reference is NOT a compliance const -- a non-Zitadel value must be representable (a real,
        disclosed non-compliance finding), not schema/construction-blocked."""
        stages = _valid_stages()
        stages[0]["subject"]["idp_ref"] = "some-legacy-idp"
        record = _build(stages=stages)
        self.assertEqual(record["stages"][0]["subject"]["idp_ref"], "some-legacy-idp")

    def test_subject_idp_ref_non_string_non_null_is_refused(self):
        stages = _valid_stages()
        stages[0]["subject"]["idp_ref"] = 42
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_workload_missing_workload_id_is_refused(self):
        stages = _valid_stages()
        del stages[0]["workload"]["workload_id"]
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_workload_with_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[0]["workload"]["extra"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_workload_identity_strategy_ref_null_is_legal(self):
        record = _build()
        self.assertIsNone(record["stages"][0]["workload"]["workload_identity_strategy_ref"])

    def test_workload_identity_strategy_ref_ratified_value_round_trips(self):
        stages = _valid_stages()
        stages[0]["workload"]["workload_identity_strategy_ref"] = "cloud-native workload identity + short-lived-credential mTLS"
        record = _build(stages=stages)
        self.assertEqual(record["stages"][0]["workload"]["workload_identity_strategy_ref"], "cloud-native workload identity + short-lived-credential mTLS")

    def test_resource_missing_resource_id_is_refused(self):
        stages = _valid_stages()
        del stages[0]["resource"]["resource_id"]
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_resource_illegal_sensitivity_classification_is_refused(self):
        stages = _valid_stages()
        stages[0]["resource"]["sensitivity_classification"] = "TopSecret"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_resource_sensitivity_classification_each_legal_ec61_value_validates(self):
        for level in ("Public", "Internal", "Confidential", "Restricted"):
            with self.subTest(level=level):
                stages = _valid_stages()
                stages[0]["resource"]["sensitivity_classification"] = level
                record = _build(stages=stages)
                self.assertEqual(record["stages"][0]["resource"]["sensitivity_classification"], level)

    def test_resource_with_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[0]["resource"]["extra"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    # --- access_decision ---
    def test_access_decision_illegal_authz_decision_is_refused(self):
        stages = _valid_stages()
        stages[1]["authz_decision"] = "maybe"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_access_decision_authz_deny_is_legal(self):
        stages = _valid_stages()
        stages[1]["authz_decision"] = "deny"
        record = _build(stages=stages)
        self.assertEqual(record["stages"][1]["authz_decision"], "deny")

    def test_access_decision_non_boolean_authn_verified_is_refused(self):
        stages = _valid_stages()
        stages[1]["authn_verified"] = "yes"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_access_decision_non_boolean_least_privilege_confirmed_is_refused(self):
        stages = _valid_stages()
        stages[1]["least_privilege_confirmed"] = "true"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_access_decision_empty_authn_method_is_refused(self):
        stages = _valid_stages()
        stages[1]["authn_method"] = " "
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_access_decision_pdp_engine_ref_null_is_legal(self):
        record = _build()
        self.assertIsNone(record["stages"][1]["pdp_engine_ref"])

    def test_access_decision_pdp_engine_ref_cedar_round_trips(self):
        stages = _valid_stages()
        stages[1]["pdp_engine_ref"] = "Cedar"
        record = _build(stages=stages)
        self.assertEqual(record["stages"][1]["pdp_engine_ref"], "Cedar")

    def test_access_decision_pdp_engine_ref_non_compliant_value_is_still_legal(self):
        stages = _valid_stages()
        stages[1]["pdp_engine_ref"] = "custom-homegrown-acl"
        record = _build(stages=stages)
        self.assertEqual(record["stages"][1]["pdp_engine_ref"], "custom-homegrown-acl")

    def test_access_decision_with_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[1]["extra"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_access_decision_missing_pdp_engine_ref_key_is_refused(self):
        stages = _valid_stages()
        del stages[1]["pdp_engine_ref"]
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    # --- credential_issuance: the FORBIDDEN-CREDENTIAL-TYPE denylist invariant ---
    def test_credential_type_shared_password_is_refused(self):
        stages = _valid_stages()
        stages[2]["credential_type"] = "shared_password"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_credential_type_long_lived_api_key_is_refused(self):
        stages = _valid_stages()
        stages[2]["credential_type"] = "long_lived_api_key"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_credential_type_hardcoded_secret_is_refused(self):
        stages = _valid_stages()
        stages[2]["credential_type"] = "hardcoded_secret"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_credential_type_non_forbidden_values_validate(self):
        for value in ("mtls_short_lived_cert", "oauth_token", "spiffe_svid", "workload_identity_token"):
            with self.subTest(value=value):
                stages = _valid_stages()
                stages[2]["credential_type"] = value
                record = _build(stages=stages)
                self.assertEqual(record["stages"][2]["credential_type"], value)

    def test_credential_type_uppercase_variant_of_forbidden_value_is_still_refused(self):
        """The denylist must not be trivially bypassable by casing -- the schema/runtime slug pattern forces
        lowercase, so an uppercase variant fails the SHAPE check rather than slipping past the denylist."""
        stages = _valid_stages()
        stages[2]["credential_type"] = "Shared_Password"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_credential_type_with_whitespace_is_refused(self):
        stages = _valid_stages()
        stages[2]["credential_type"] = "shared password"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_credential_type_with_hyphen_is_refused(self):
        stages = _valid_stages()
        stages[2]["credential_type"] = "mtls-short-lived-cert"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_credential_type_starting_with_digit_is_refused(self):
        stages = _valid_stages()
        stages[2]["credential_type"] = "1password"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_credential_type_empty_is_refused(self):
        stages = _valid_stages()
        stages[2]["credential_type"] = ""
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_ttl_seconds_zero_is_refused(self):
        stages = _valid_stages()
        stages[2]["ttl_seconds"] = 0
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_ttl_seconds_negative_is_refused(self):
        stages = _valid_stages()
        stages[2]["ttl_seconds"] = -1
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_ttl_seconds_non_integer_is_refused(self):
        stages = _valid_stages()
        stages[2]["ttl_seconds"] = "3600"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_ttl_seconds_boolean_is_refused(self):
        """Python's bool is an int subclass -- must be explicitly excluded, not accidentally accepted."""
        stages = _valid_stages()
        stages[2]["ttl_seconds"] = True
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_ttl_seconds_large_value_is_legal_no_invented_ceiling(self):
        stages = _valid_stages()
        stages[2]["ttl_seconds"] = 86400
        record = _build(stages=stages)
        self.assertEqual(record["stages"][2]["ttl_seconds"], 86400)

    def test_credential_issuance_empty_issued_at_is_refused(self):
        stages = _valid_stages()
        stages[2]["issued_at"] = " "
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_credential_issuance_non_boolean_mutual_authentication_confirmed_is_refused(self):
        stages = _valid_stages()
        stages[2]["mutual_authentication_confirmed"] = "yes"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_credential_issuance_with_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[2]["extra"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_credential_issuance_missing_ttl_seconds_key_is_refused(self):
        stages = _valid_stages()
        del stages[2]["ttl_seconds"]
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    # --- audit_trail ---
    def test_audit_trail_empty_audit_log_ref_is_refused(self):
        stages = _valid_stages()
        stages[3]["audit_log_ref"] = " "
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_audit_trail_non_boolean_continuous_monitoring_confirmed_is_refused(self):
        stages = _valid_stages()
        stages[3]["continuous_monitoring_confirmed"] = "yes"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_audit_trail_non_boolean_resource_access_granted_is_refused(self):
        stages = _valid_stages()
        stages[3]["resource_access_granted"] = "yes"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_audit_trail_resource_access_denied_is_representable(self):
        """A review may find that access was NOT actually granted -- this is a real, representable
        observation, not schema/construction-blocked."""
        stages = _valid_stages()
        stages[3]["resource_access_granted"] = False
        record = _build(stages=stages)
        self.assertFalse(record["stages"][3]["resource_access_granted"])

    def test_audit_trail_with_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[3]["extra"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    def test_audit_trail_missing_audit_log_ref_key_is_refused(self):
        stages = _valid_stages()
        del stages[3]["audit_log_ref"]
        with self.assertRaisesRegex(InvariantViolation, "ZTR_INVALID_STAGES"):
            _build(stages=stages)

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_ztr_prefix(self):
        record = _valid_record()
        record["id"] = "DPIA-1"
        with self.assertRaisesRegex(Exception, "ZTR-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        record = _valid_record()
        del record["stages"]
        with self.assertRaisesRegex(Exception, "stages"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    def test_schema_layer_rejects_swapped_stage_order(self):
        record = _valid_record()
        record["stages"][0], record["stages"][1] = record["stages"][1], record["stages"][0]
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema prefixItems order")

    def test_schema_layer_rejects_identity_context_with_extra_key(self):
        record = _valid_record()
        record["stages"][0]["extra"] = "x"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema identity_context additionalProperties")

    def test_schema_layer_rejects_forbidden_credential_type(self):
        """The denylist is ALSO enforced at the schema layer (not: {enum: [...]}) -- defense in depth, unlike
        DPIA/PIA's own cross-array invariants which could only be expressed at runtime."""
        record = _valid_record()
        record["stages"][2]["credential_type"] = "hardcoded_secret"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema credential_type denylist")

    def test_schema_layer_rejects_credential_type_with_uppercase(self):
        record = _valid_record()
        record["stages"][2]["credential_type"] = "MtlsCert"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema credential_type pattern")

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        stages = _valid_stages()
        record = generate_zero_trust_review_record("ZTR-T-010", "s", stages, _prov())
        stages[0]["subject"]["description"] = "mutated"
        stages[0]["workload"]["description"] = "mutated"
        stages[0]["resource"]["description"] = "mutated"
        stages[1]["authn_method"] = "mutated"
        stages[2]["credential_type"] = "oauth_token_mutated"
        stages[3]["audit_log_ref"] = "mutated"
        self.assertEqual(record["stages"][0]["subject"]["description"], "a subject")
        self.assertEqual(record["stages"][0]["workload"]["description"], "a workload")
        self.assertEqual(record["stages"][0]["resource"]["description"], "a resource")
        self.assertEqual(record["stages"][1]["authn_method"], "password+OTP")
        self.assertEqual(record["stages"][2]["credential_type"], "mtls_short_lived_cert")
        self.assertEqual(record["stages"][3]["audit_log_ref"], "ledger://audit/1")

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_zero_trust_review_record("ZTR-T-011", "s", _valid_stages(), provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_zero_trust_review_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_zero_trust_review_integrity_gate(record, "test", TS)

    def test_valid_record_passes_both_gates(self):
        results = evaluate_zero_trust_review_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "zero_trust_review_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_compliant_record_passes_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_zero_trust_review_gates(_compliant_record(), "test", TS)))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_zero_trust_review_gates(record, "test", TS)))

    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'ZTR-'")

    def test_hand_tampered_non_string_version_fails_the_gate(self):
        record = _valid_record()
        record["version"] = 123
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "version missing or not a string")

    def test_hand_tampered_empty_system_or_component_fails_the_gate(self):
        record = _valid_record()
        record["system_or_component"] = " "
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "system_or_component missing or empty")

    def test_hand_tampered_stage_reorder_fails_the_gate(self):
        """The core re-derived-not-trusted invariant: reordering two adjacent stages (same set, wrong order)
        after construction must be caught by the gate's own fresh re-validation."""
        record = _compliant_record()
        record["stages"][0], record["stages"][1] = record["stages"][1], record["stages"][0]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_stage_dropped_fails_the_gate(self):
        record = _valid_record()
        del record["stages"][3]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_extra_shape_valid_stage_appended_fails_the_gate(self):
        record = _valid_record()
        record["stages"].append(_audit_trail())
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_resource_removed_from_identity_context_fails_the_gate(self):
        """The core re-derived-not-trusted STAGE-1 REQUIRED SET invariant, at the gate layer: a copy's own
        identity_context silently missing its own resource sub-entity must be caught."""
        record = _compliant_record()
        del record["stages"][0]["resource"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_credential_type_to_forbidden_value_fails_the_gate(self):
        """The core re-derived-not-trusted FORBIDDEN-CREDENTIAL-TYPE invariant, at the gate layer: a copy's
        own credential_type silently retargeted to a Master Plan §62-forbidden value must be caught."""
        record = _compliant_record()
        record["stages"][2]["credential_type"] = "long_lived_api_key"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_gate_evidence_reports_accurate_counts_on_a_valid_record(self):
        gate = self._gate(_compliant_record())
        self.assertEqual(gate["evidence"][0], {"stage_count": 4, "credential_type": "mtls_short_lived_cert"})

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _compliant_record()
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
