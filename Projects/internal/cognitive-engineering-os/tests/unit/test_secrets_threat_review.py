"""Mutation-style tests for ``security.secrets_threat_review`` (fiftieth Method Atlas slice,
provisional ordinal, SIXTH member of the `security` family, F20 -- the SECOND F20 member, after
`security.dpia_pia`, that is NOT one of Execution Contract Section 32's own four named Threat Review
methods). Three real invariant classes proven at BOTH the construction and the independent gate layer:
(1) the six-stage ORDER invariant (same class security.pasta/security.dpia_pia already establish), (2)
cross-stage SECRET TRACEABILITY (storage/access/rotation/revocation must each cover EXACTLY the secret
set inventory declares; exposure is a sparse findings-only list), and (3) two EC Section 33-grounded
invariants: CRYPTO-KEY-DEFERS-TO-VAULT (a crypto_key secret's storage entry must carry a non-null
key_vault_ref; every other secret_type must not) and EXPOSURE-TRIGGERS-MANDATORY-RESPONSE-FLOW, ONE
-DIRECTIONAL (a secret with an exposure finding must show a triggered, non-NOT_TRIGGERED response_flow;
a secret with none carries no such requirement in either direction -- it may still be legitimately,
proactively revoked for other real reasons, so response_flow's OWN internal consistency -- triggered
agrees with flow_stage_reached -- is checked independently of exposure status)."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.security.secrets_threat_review import (
    METHOD_ID,
    STAGE_ORDER,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_secrets_threat_review_gates,
    evaluate_secrets_threat_review_integrity_gate,
    generate_secrets_threat_review_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/secrets-threat-review-record.schema.yaml"
TS = "2026-09-06T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _secret(secret_id="SECRET-001", secret_type="api_key", owner="o", system_or_component="s"):
    return {"secret_id": secret_id, "secret_type": secret_type, "owner": owner, "system_or_component": system_or_component}


def _storage_entry(secret_id="SECRET-001", storage_mechanism="SECRET_MANAGER", exception_justification=None, key_vault_ref=None):
    return {"secret_id": secret_id, "storage_mechanism": storage_mechanism, "exception_justification": exception_justification, "key_vault_ref": key_vault_ref}


def _access_entry(secret_id="SECRET-001", authorized_identities=None, last_access_review_at="2026-09-06"):
    return {"secret_id": secret_id, "authorized_identities": ["role"] if authorized_identities is None else authorized_identities, "last_access_review_at": last_access_review_at}


def _rotation_entry(secret_id="SECRET-001", rotation_interval="P90D", last_rotated_at="2026-06-01", rotation_overdue=False):
    return {"secret_id": secret_id, "rotation_interval": rotation_interval, "last_rotated_at": last_rotated_at, "rotation_overdue": rotation_overdue}


def _finding(secret_id="SECRET-001", location="LOGS", detected_at="2026-09-05", detected_by="scanner"):
    return {"secret_id": secret_id, "location": location, "detected_at": detected_at, "detected_by": detected_by}


def _flow(triggered=False, flow_stage_reached="NOT_TRIGGERED"):
    return {"triggered": triggered, "flow_stage_reached": flow_stage_reached}


def _revocation_entry(secret_id="SECRET-001", response_flow=None):
    return {"secret_id": secret_id, "response_flow": _flow() if response_flow is None else response_flow}


def _inventory_stage(*secrets):
    return {"stage_id": "inventory", "secrets": list(secrets) if secrets else [_secret()]}


def _storage_stage(*entries):
    return {"stage_id": "storage", "entries": list(entries) if entries else [_storage_entry()]}


def _access_stage(*entries):
    return {"stage_id": "access", "entries": list(entries) if entries else [_access_entry()]}


def _rotation_stage(*entries):
    return {"stage_id": "rotation", "entries": list(entries) if entries else [_rotation_entry()]}


def _exposure_stage(*findings):
    return {"stage_id": "exposure", "findings": list(findings)}


def _revocation_stage(*entries):
    return {"stage_id": "revocation", "entries": list(entries) if entries else [_revocation_entry()]}


def _valid_stages():
    return [
        _inventory_stage(),
        _storage_stage(),
        _access_stage(),
        _rotation_stage(),
        _exposure_stage(),
        _revocation_stage(),
    ]


def _build(record_id="SECR-T-001", system_or_component="a system", stages=None):
    return generate_secrets_threat_review_record(record_id, system_or_component, _valid_stages() if stages is None else stages, _prov())


def _valid_record():
    return _build()


def _cleanup_stages():
    """Illustrative reconstruction of CLAUDE.md:17's real, closed former-employer desktop credential
    cleanup: one crypto_key (defers to Key Vault) and one ssh_key (no Vault involvement), both revoked,
    no exposure found."""
    return [
        _inventory_stage(
            _secret("SECRET-001", "crypto_key", "operator", "local SSH client key material"),
            _secret("SECRET-002", "ssh_key", "operator", "git remote deploy key"),
        ),
        _storage_stage(
            _storage_entry("SECRET-001", "OS_KEYCHAIN", None, "kek:former-employer-desktop"),
            _storage_entry("SECRET-002", "OS_KEYCHAIN", None, None),
        ),
        _access_stage(
            _access_entry("SECRET-001", ["operator"], "2026-08-15"),
            _access_entry("SECRET-002", ["operator"], "2026-08-15"),
        ),
        _rotation_stage(
            _rotation_entry("SECRET-001", "NOT_APPLICABLE_SUPERSEDED_BY_REVOCATION", None, False),
            _rotation_entry("SECRET-002", "NOT_APPLICABLE_SUPERSEDED_BY_REVOCATION", None, False),
        ),
        _exposure_stage(),
        _revocation_stage(
            _revocation_entry("SECRET-001", _flow(True, "RESUMED")),
            _revocation_entry("SECRET-002", _flow(True, "RESUMED")),
        ),
    ]


def _cleanup_record():
    return _build(record_id="SECR-T-002", system_or_component="former-employer desktop cleanup", stages=_cleanup_stages())


def _exposed_stages():
    """One api_key secret with a real exposure finding, properly revoked."""
    return [
        _inventory_stage(_secret("SECRET-001", "api_key", "operator", "third-party analytics API key")),
        _storage_stage(_storage_entry("SECRET-001", "SECRET_MANAGER", None, None)),
        _access_stage(_access_entry("SECRET-001", ["deploy service account"], "2026-09-06")),
        _rotation_stage(_rotation_entry("SECRET-001", "P90D", "2026-06-01", True)),
        _exposure_stage(_finding("SECRET-001", "LOGS", "2026-09-05", "log-scrubbing scanner")),
        _revocation_stage(_revocation_entry("SECRET-001", _flow(True, "INVESTIGATED"))),
    ]


def _exposed_record():
    return _build(record_id="SECR-T-003", system_or_component="third-party analytics integration", stages=_exposed_stages())


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "minimal secrets threat review record")

    def test_cleanup_record_validates_in_atlas_own_order(self):
        record = _cleanup_record()
        self.contracts.validate(RECORD_SCHEMA, record, "former-employer desktop cleanup record")
        self.assertEqual([s["stage_id"] for s in record["stages"]], list(STAGE_ORDER))

    def test_exposed_record_validates(self):
        record = _exposed_record()
        self.contracts.validate(RECORD_SCHEMA, record, "exposed api_key record")

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_secrets_threat_review_record("SECR-T-005", "s", _valid_stages(), _prov(), version="2.3.4", generated_by_method="security.secrets_threat_review@test")
        self.assertEqual(record["generated_by_method"], "security.secrets_threat_review@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_stage_order_constant_matches_atlas_own_six_word_chain(self):
        self.assertEqual(STAGE_ORDER, ("inventory", "storage", "access", "rotation", "exposure", "revocation"))

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "secrets-threat-review-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "secrets-threat-review-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_secrets_threat_review_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    # --- id / version ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_secr_prefix_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_RECORD_ID"):
            _build(record_id="DPIA-1")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_VERSION"):
            generate_secrets_threat_review_record("SECR-T-V1", "s", _valid_stages(), _prov(), version=123)

    def test_empty_system_or_component_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SECR_EMPTY_RECORD_FIELD"):
            _build(system_or_component="")

    # --- stages: shape and order ---
    def test_two_adjacent_stages_swapped_is_refused_even_though_the_set_is_unchanged(self):
        stages = _valid_stages()
        stages[0], stages[1] = stages[1], stages[0]
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_revocation_stage_moved_to_the_front_is_refused(self):
        stages = _valid_stages()
        stages.insert(0, stages.pop())
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_missing_a_stage_is_refused(self):
        stages = _valid_stages()[:-1]  # only five
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_duplicate_stage_is_refused(self):
        stages = _valid_stages()[:-1]  # drop revocation
        stages.append(_inventory_stage())  # duplicate inventory instead of revocation
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_extra_seventh_stage_is_refused(self):
        """Regression guard, same class security.pasta/security.dpia_pia's own critic-caught test already
        establishes: the extra element must itself be shape-valid, or this would pass 'by accident' via
        the shape check at position -1 rather than genuinely exercising the length guard."""
        stages = _valid_stages() + [_revocation_stage()]
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_non_list_stages_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages="not a list")

    def test_non_dict_stage_entry_is_refused_not_crashed(self):
        stages = _valid_stages()
        stages[0] = "not a dict"
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_wrong_stage_id_at_a_position_is_refused(self):
        stages = _valid_stages()
        stages[2]["stage_id"] = "not_a_real_stage"
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    # --- inventory stage ---
    def test_empty_secrets_list_is_refused(self):
        stages = _valid_stages()
        stages[0]["secrets"] = []
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_secret_entry_without_secret_prefix_is_refused(self):
        stages = _valid_stages()
        stages[0]["secrets"][0]["secret_id"] = "S-001"
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_secret_entry_illegal_secret_type_is_refused(self):
        stages = _valid_stages()
        stages[0]["secrets"][0]["secret_type"] = "not_a_real_type"
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_secret_entry_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[0]["secrets"][0]["extra"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_secret_entry_empty_owner_is_refused(self):
        stages = _valid_stages()
        stages[0]["secrets"][0]["owner"] = " "
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_duplicate_secret_id_within_inventory_is_refused(self):
        stages = _valid_stages()
        stages[0]["secrets"].append(_secret())  # same "SECRET-001" twice
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    # --- cross-stage traceability: storage/access/rotation/revocation must EXACTLY cover inventory ---
    def test_storage_entry_for_nonexistent_secret_id_is_refused(self):
        stages = _valid_stages()
        stages[1]["entries"][0]["secret_id"] = "SECRET-999"
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_a_secret_missing_from_storage_is_refused(self):
        stages = _valid_stages()
        stages[0]["secrets"].append(_secret("SECRET-002"))
        # storage/access/rotation/revocation still only cover SECRET-001
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_duplicate_storage_entry_for_same_secret_is_refused(self):
        stages = _valid_stages()
        stages[1]["entries"].append(_storage_entry())  # same "SECRET-001" twice
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_access_entry_for_nonexistent_secret_id_is_refused(self):
        stages = _valid_stages()
        stages[2]["entries"][0]["secret_id"] = "SECRET-999"
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_access_entry_empty_authorized_identities_is_refused(self):
        stages = _valid_stages()
        stages[2]["entries"][0]["authorized_identities"] = []
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_rotation_entry_for_nonexistent_secret_id_is_refused(self):
        stages = _valid_stages()
        stages[3]["entries"][0]["secret_id"] = "SECRET-999"
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_rotation_entry_non_bool_overdue_is_refused(self):
        stages = _valid_stages()
        stages[3]["entries"][0]["rotation_overdue"] = "yes"
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_revocation_entry_for_nonexistent_secret_id_is_refused(self):
        stages = _valid_stages()
        stages[5]["entries"][0]["secret_id"] = "SECRET-999"
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_two_secrets_each_fully_traced_validates(self):
        record = _cleanup_record()
        self.assertEqual(len(record["stages"][0]["secrets"]), 2)

    # --- exposure stage: sparse, may be empty, but references must be real ---
    def test_empty_exposure_findings_is_legal(self):
        record = _valid_record()
        self.assertEqual(record["stages"][4]["findings"], [])

    def test_exposure_finding_for_nonexistent_secret_id_is_refused(self):
        stages = _exposed_stages()
        stages[4]["findings"][0]["secret_id"] = "SECRET-999"
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_exposure_finding_illegal_location_is_refused(self):
        stages = _exposed_stages()
        stages[4]["findings"][0]["location"] = "SOMEWHERE_ELSE"
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_exposure_finding_empty_detected_by_is_refused(self):
        stages = _exposed_stages()
        stages[4]["findings"][0]["detected_by"] = " "
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_all_ten_forbidden_locations_are_individually_legal(self):
        for location in ("GIT", "PROMPT", "CHAT_TRANSCRIPT", "CLI_ARGV", "LOGS", "CRASH_DUMP", "ARTIFACT", "TEST_FIXTURE", "MARKDOWN", "SCREENSHOT"):
            with self.subTest(location=location):
                stages = _exposed_stages()
                stages[4]["findings"][0]["location"] = location
                record = _build(stages=stages)
                self.assertEqual(record["stages"][4]["findings"][0]["location"], location)

    # --- storage stage: storage_mechanism enum + exception_justification conditional ---
    def test_storage_mechanism_illegal_value_is_refused(self):
        stages = _valid_stages()
        stages[1]["entries"][0]["storage_mechanism"] = "UNDER_THE_MATTRESS"
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_other_storage_mechanism_without_justification_is_refused(self):
        stages = _valid_stages()
        stages[1]["entries"][0]["storage_mechanism"] = "OTHER"
        stages[1]["entries"][0]["exception_justification"] = None
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_other_storage_mechanism_with_empty_justification_is_refused(self):
        stages = _valid_stages()
        stages[1]["entries"][0]["storage_mechanism"] = "OTHER"
        stages[1]["entries"][0]["exception_justification"] = "  "
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_other_storage_mechanism_with_justification_is_legal(self):
        stages = _valid_stages()
        stages[1]["entries"][0]["storage_mechanism"] = "OTHER"
        stages[1]["entries"][0]["exception_justification"] = "legacy vendor tool, migration tracked as TASK-123"
        record = _build(stages=stages)
        self.assertEqual(record["stages"][1]["entries"][0]["storage_mechanism"], "OTHER")

    def test_preferred_storage_mechanism_with_justification_present_is_refused(self):
        """A conforming (preferred) storage mechanism must NOT carry a justification -- there is nothing
        to disclose/justify when the mechanism is already on EC Section 33's own preferred list."""
        stages = _valid_stages()
        stages[1]["entries"][0]["exception_justification"] = "not needed here"
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_all_four_preferred_storage_mechanisms_are_individually_legal(self):
        for mechanism in ("SECRET_MANAGER", "OS_KEYCHAIN", "SHORT_LIVED_CREDENTIAL", "WORKLOAD_IDENTITY"):
            with self.subTest(mechanism=mechanism):
                stages = _valid_stages()
                stages[1]["entries"][0]["storage_mechanism"] = mechanism
                record = _build(stages=stages)
                self.assertEqual(record["stages"][1]["entries"][0]["storage_mechanism"], mechanism)

    # --- crypto-key-defers-to-vault invariant ---
    def test_crypto_key_secret_without_key_vault_ref_is_refused(self):
        stages = _valid_stages()
        stages[0]["secrets"][0]["secret_type"] = "crypto_key"
        # storage entry's key_vault_ref stays None (default) -- must be refused
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_crypto_key_secret_with_key_vault_ref_is_legal(self):
        stages = _valid_stages()
        stages[0]["secrets"][0]["secret_type"] = "crypto_key"
        stages[1]["entries"][0]["key_vault_ref"] = "kek:tenant-a"
        record = _build(stages=stages)
        self.assertEqual(record["stages"][1]["entries"][0]["key_vault_ref"], "kek:tenant-a")

    def test_crypto_key_secret_with_empty_key_vault_ref_is_refused(self):
        stages = _valid_stages()
        stages[0]["secrets"][0]["secret_type"] = "crypto_key"
        stages[1]["entries"][0]["key_vault_ref"] = "  "
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_non_crypto_key_secret_with_key_vault_ref_is_refused(self):
        """The reverse direction: an api_key (default secret_type in the fixture) must NOT carry a
        key_vault_ref -- only crypto_key secrets defer to the Vault."""
        stages = _valid_stages()
        stages[1]["entries"][0]["key_vault_ref"] = "dek:should-not-be-here"
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_every_non_crypto_key_secret_type_is_individually_legal_without_a_vault_ref(self):
        for secret_type in ("api_key", "db_credential", "oauth_token", "webhook_secret", "tls_certificate", "ssh_key", "other"):
            with self.subTest(secret_type=secret_type):
                stages = _valid_stages()
                stages[0]["secrets"][0]["secret_type"] = secret_type
                record = _build(stages=stages)
                self.assertEqual(record["stages"][0]["secrets"][0]["secret_type"], secret_type)
                self.assertIsNone(record["stages"][1]["entries"][0]["key_vault_ref"])

    # --- exposure-triggers-mandatory-response-flow invariant ---
    def test_exposed_secret_with_not_triggered_flow_is_refused(self):
        stages = _exposed_stages()
        stages[5]["entries"][0]["response_flow"] = _flow(False, "NOT_TRIGGERED")
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_exposed_secret_with_triggered_but_not_triggered_stage_mismatch_is_refused(self):
        """triggered=True but flow_stage_reached left at NOT_TRIGGERED is an internally inconsistent
        state -- must also be refused for an exposed secret."""
        stages = _exposed_stages()
        stages[5]["entries"][0]["response_flow"] = _flow(True, "NOT_TRIGGERED")
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_exposed_secret_with_stopped_flow_is_legal(self):
        stages = _exposed_stages()
        stages[5]["entries"][0]["response_flow"] = _flow(True, "STOPPED")
        record = _build(stages=stages)
        self.assertEqual(record["stages"][5]["entries"][0]["response_flow"]["flow_stage_reached"], "STOPPED")

    def test_exposed_secret_with_revoked_or_rotated_flow_is_legal(self):
        stages = _exposed_stages()
        stages[5]["entries"][0]["response_flow"] = _flow(True, "REVOKED_OR_ROTATED")
        record = _build(stages=stages)
        self.assertEqual(record["stages"][5]["entries"][0]["response_flow"]["flow_stage_reached"], "REVOKED_OR_ROTATED")

    def test_exposed_secret_with_resumed_flow_is_legal(self):
        stages = _exposed_stages()
        stages[5]["entries"][0]["response_flow"] = _flow(True, "RESUMED")
        record = _build(stages=stages)
        self.assertEqual(record["stages"][5]["entries"][0]["response_flow"]["flow_stage_reached"], "RESUMED")

    def test_unexposed_secret_with_triggered_flow_is_legal(self):
        """NOT a reverse-direction requirement: EC Section 33's own flow is a MINIMUM for exposed
        secrets, not an exclusive trigger for revocation. A secret with no exposure finding may still be
        legitimately, proactively revoked for other real reasons (departure, scheduled decommission) --
        the cleanup_record's own two secrets already prove this (see test_cleanup_record_validates_in
        _atlas_own_order). Confirmed here directly against a minimal single-secret fixture."""
        stages = _valid_stages()
        stages[5]["entries"][0]["response_flow"] = _flow(True, "RESUMED")
        record = _build(stages=stages)
        self.assertEqual(record["stages"][5]["entries"][0]["response_flow"], _flow(True, "RESUMED"))

    def test_unexposed_secret_with_not_triggered_false_flow_is_legal(self):
        record = _valid_record()
        self.assertEqual(record["stages"][5]["entries"][0]["response_flow"], _flow(False, "NOT_TRIGGERED"))

    def test_response_flow_illegal_stage_value_is_refused(self):
        stages = _valid_stages()
        stages[5]["entries"][0]["response_flow"]["flow_stage_reached"] = "PANIC"
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_response_flow_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[5]["entries"][0]["response_flow"]["extra"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    # --- response_flow internal consistency (triggered must agree with flow_stage_reached), independent
    # of exposure status ---
    def test_triggered_true_with_not_triggered_stage_is_refused_even_when_unexposed(self):
        stages = _valid_stages()
        stages[5]["entries"][0]["response_flow"] = _flow(True, "NOT_TRIGGERED")
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_triggered_false_with_stopped_stage_is_refused_even_when_unexposed(self):
        stages = _valid_stages()
        stages[5]["entries"][0]["response_flow"] = _flow(False, "STOPPED")
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    def test_two_secrets_one_exposed_one_not_each_correctly_dispositioned_validates(self):
        """Multi-secret case: one secret exposed (flow triggered), the other not (flow untouched) --
        confirms the rule is per-secret, not a single global toggle."""
        stages = [
            _inventory_stage(_secret("SECRET-001"), _secret("SECRET-002")),
            _storage_stage(_storage_entry("SECRET-001"), _storage_entry("SECRET-002")),
            _access_stage(_access_entry("SECRET-001"), _access_entry("SECRET-002")),
            _rotation_stage(_rotation_entry("SECRET-001"), _rotation_entry("SECRET-002")),
            _exposure_stage(_finding("SECRET-001")),
            _revocation_stage(
                _revocation_entry("SECRET-001", _flow(True, "RESUMED")),
                _revocation_entry("SECRET-002", _flow(False, "NOT_TRIGGERED")),
            ),
        ]
        record = _build(stages=stages)
        self.assertEqual(len(record["stages"][0]["secrets"]), 2)

    def test_two_secrets_exposure_response_swapped_is_refused(self):
        """Same two-secret setup as above, but the response dispositions are SWAPPED (the unexposed
        secret gets the triggered flow, the exposed one gets NOT_TRIGGERED) -- must be refused."""
        stages = [
            _inventory_stage(_secret("SECRET-001"), _secret("SECRET-002")),
            _storage_stage(_storage_entry("SECRET-001"), _storage_entry("SECRET-002")),
            _access_stage(_access_entry("SECRET-001"), _access_entry("SECRET-002")),
            _rotation_stage(_rotation_entry("SECRET-001"), _rotation_entry("SECRET-002")),
            _exposure_stage(_finding("SECRET-001")),
            _revocation_stage(
                _revocation_entry("SECRET-001", _flow(False, "NOT_TRIGGERED")),
                _revocation_entry("SECRET-002", _flow(True, "RESUMED")),
            ),
        ]
        with self.assertRaisesRegex(InvariantViolation, "SECR_INVALID_STAGES"):
            _build(stages=stages)

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_secr_prefix(self):
        record = _valid_record()
        record["id"] = "DPIA-1"
        with self.assertRaisesRegex(Exception, "SECR-"):
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

    def test_schema_layer_rejects_a_secret_entry_with_extra_key(self):
        record = _valid_record()
        record["stages"][0]["secrets"][0]["extra"] = "x"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema secret_entry additionalProperties")

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        stages = _cleanup_stages()
        record = generate_secrets_threat_review_record("SECR-T-010", "s", stages, _prov())
        stages[0]["secrets"][0]["owner"] = "mutated"
        stages[1]["entries"][0]["storage_mechanism"] = "OTHER"
        stages[2]["entries"][0]["authorized_identities"].append("mutated")
        stages[3]["entries"][0]["rotation_interval"] = "mutated"
        stages[5]["entries"][0]["response_flow"]["flow_stage_reached"] = "STOPPED"
        self.assertEqual(record["stages"][0]["secrets"][0]["owner"], "operator")
        self.assertEqual(record["stages"][1]["entries"][0]["storage_mechanism"], "OS_KEYCHAIN")
        self.assertEqual(record["stages"][2]["entries"][0]["authorized_identities"], ["operator"])
        self.assertEqual(record["stages"][3]["entries"][0]["rotation_interval"], "NOT_APPLICABLE_SUPERSEDED_BY_REVOCATION")
        self.assertEqual(record["stages"][5]["entries"][0]["response_flow"]["flow_stage_reached"], "RESUMED")

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_secrets_threat_review_record("SECR-T-011", "s", _valid_stages(), provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_secrets_threat_review_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_secrets_threat_review_integrity_gate(record, "test", TS)

    def test_valid_record_passes_both_gates(self):
        results = evaluate_secrets_threat_review_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "secrets_threat_review_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_cleanup_record_passes_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_secrets_threat_review_gates(_cleanup_record(), "test", TS)))

    def test_exposed_record_passes_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_secrets_threat_review_gates(_exposed_record(), "test", TS)))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_secrets_threat_review_gates(record, "test", TS)))

    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'SECR-'")

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
        """The core re-derived-not-trusted invariant: reordering two adjacent stages (same set, wrong
        order) after construction must be caught by the gate's own fresh re-validation."""
        record = _cleanup_record()
        record["stages"][0], record["stages"][1] = record["stages"][1], record["stages"][0]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_stage_dropped_fails_the_gate(self):
        record = _valid_record()
        del record["stages"][2]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_secret_removed_from_storage_fails_the_gate(self):
        """The core re-derived-not-trusted traceability invariant, at the gate layer: a copy's own
        storage stage silently missing a secret inventory declares must be caught."""
        record = _cleanup_record()
        record["stages"][1]["entries"].pop()
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_crypto_key_vault_ref_nulled_fails_the_gate(self):
        """The core re-derived-not-trusted CRYPTO-KEY-DEFERS-TO-VAULT invariant, at the gate layer: a
        copy's own key_vault_ref for a crypto_key secret silently nulled out must be caught."""
        record = _cleanup_record()
        record["stages"][1]["entries"][0]["key_vault_ref"] = None
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_exposure_response_reverted_fails_the_gate(self):
        """The core re-derived-not-trusted EXPOSURE-TRIGGERS-MANDATORY-RESPONSE-FLOW invariant, at the
        gate layer: a copy's own response_flow silently reverted to NOT_TRIGGERED over a real exposure
        finding must be caught."""
        record = _exposed_record()
        record["stages"][5]["entries"][0]["response_flow"] = _flow(False, "NOT_TRIGGERED")
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_unexposed_secret_triggered_flow_still_passes_the_gate(self):
        """NOT a violation: a copy's own response_flow silently set to a triggered, resumed disposition
        over a secret with NO exposure finding remains LEGAL -- EC Section 33's own flow is a minimum for
        exposed secrets, not an exclusive trigger for revocation (see the module's own real-world cleanup
        precedent, where both secrets are proactively revoked with zero exposure findings)."""
        record = _cleanup_record()
        record["stages"][5]["entries"][0]["response_flow"] = _flow(True, "STOPPED")
        gate = self._gate(record)
        self.assertEqual(gate["status"], "PASS")

    def test_hand_tampered_internally_inconsistent_response_flow_fails_the_gate(self):
        """The core re-derived-not-trusted INTERNAL CONSISTENCY invariant, at the gate layer: a copy's
        own response_flow silently set to triggered=True with flow_stage_reached=NOT_TRIGGERED (a
        self-contradictory state) must be caught, independent of exposure status."""
        record = _cleanup_record()
        record["stages"][5]["entries"][0]["response_flow"] = _flow(True, "NOT_TRIGGERED")
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_gate_evidence_reports_accurate_counts_on_a_valid_record(self):
        gate = self._gate(_exposed_record())
        self.assertEqual(gate["evidence"][0], {"stage_count": 6, "secret_count": 1, "exposure_finding_count": 1})

    def test_gate_evidence_reports_zero_exposure_findings_on_a_clean_record(self):
        gate = self._gate(_cleanup_record())
        self.assertEqual(gate["evidence"][0]["exposure_finding_count"], 0)

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _cleanup_record()
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
