import unittest

from ai_lego.errors import InvariantViolation
from ai_lego.platform.workflow.deletion_policy import POLICY_DECISION_KEYS, evaluate_deletion_policy
from ai_lego.platform.workflow.journal_deletion import delete_journal_object


TS = "2026-09-14T00:00:00Z"


def _decision(**overrides):
    value = {key: True for key in POLICY_DECISION_KEYS}
    value.update({"decision_ref": "POLICY-2026-001", "evaluated_at": TS})
    value.update(overrides)
    return value


class DeletionPolicyTests(unittest.TestCase):
    def test_valid_decision_is_explicit_and_normalized(self):
        result = evaluate_deletion_policy(_decision())
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["blocked_steps"], [])
        self.assertEqual(result["steps"]["retention"]["status"], "PASS")

    def test_false_decision_blocks_only_the_named_step(self):
        result = evaluate_deletion_policy(_decision(retention=False, legal_hold=False))
        self.assertEqual(result["status"], "BLOCKED")
        self.assertEqual(result["blocked_steps"], ["legal_hold", "retention"])

    def test_missing_decision_is_not_silently_treated_as_clear(self):
        with self.assertRaisesRegex(InvariantViolation, "DELETION_POLICY_DECISION_MISSING.*approval"):
            evaluate_deletion_policy({"decision_ref": "POLICY-1", "evaluated_at": TS})

    def test_boolean_values_are_not_coerced(self):
        with self.assertRaisesRegex(InvariantViolation, "DELETION_POLICY_DECISION_BOOLEAN_REQUIRED.*retention"):
            evaluate_deletion_policy(_decision(retention=1))

    def test_timestamp_and_reference_are_required(self):
        for field, value, code in (
            ("decision_ref", "", "DELETION_POLICY_DECISION_REF_INVALID"),
            ("evaluated_at", "not-a-time", "DELETION_POLICY_DECISION_TIMESTAMP_INVALID"),
        ):
            with self.subTest(field=field):
                with self.assertRaisesRegex(InvariantViolation, code):
                    evaluate_deletion_policy(_decision(**{field: value}))

    def test_policy_adapter_is_compatible_with_journal_deletion(self):
        class Protector:
            def __init__(self):
                self.deleted = False

            def delete(self, _reference):
                self.deleted = True

            def restore(self, _reference):
                raise InvariantViolation("JOURNAL_CONTEXT_NOT_FOUND")

        protector = Protector()
        record = delete_journal_object(
            protector,
            {"cas_path": {"hash": "a" * 64}},
            "DEL-POLICY-1",
            "run-1",
            TS,
            now=lambda: TS,
            policy_decision=_decision(),
        )
        self.assertTrue(protector.deleted)
        self.assertEqual(record["deletion_type"], "production_row")
        self.assertTrue(all(step["evidence_ref"].startswith("policy-decision://POLICY-2026-001/") for step in record["steps"][:7]))

    def test_blocked_policy_decision_stops_before_delete(self):
        class Protector:
            def __init__(self):
                self.deleted = False

            def delete(self, _reference):
                self.deleted = True

        protector = Protector()
        with self.assertRaisesRegex(InvariantViolation, "JOURNAL_DELETION_POLICY_BLOCKED: Retention Check"):
            delete_journal_object(
                protector,
                {"cas_path": {"hash": "b" * 64}},
                "DEL-POLICY-3",
                "run-1",
                TS,
                now=lambda: TS,
                policy_decision=_decision(retention=False),
            )
        self.assertFalse(protector.deleted)

    def test_policy_and_legacy_callbacks_cannot_both_be_supplied(self):
        with self.assertRaisesRegex(InvariantViolation, "JOURNAL_DELETION_POLICY_INPUTS_AMBIGUOUS"):
            delete_journal_object(object(), {}, "DEL-POLICY-2", "run-1", TS, {}, policy_decision=_decision())


if __name__ == "__main__":
    unittest.main()
