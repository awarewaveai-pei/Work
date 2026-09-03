import shutil
import tempfile
import unittest
from pathlib import Path

from ai_lego.core.domain.tenant import CASCADIA, NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation


class EventLedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="ai-lego-ledger-"))
        self.ledger = EventLedger(self.tmp / "ledger.jsonl", "RUN-TEST", DEFAULT_CLOCK)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_sequences_are_per_aggregate_and_causation_never_crosses_tenants(self):
        a1 = self.ledger.append(NORDBROOK.tenant_id, "A:proj", "DocumentUploaded", {"n": 1}, 1)
        b1 = self.ledger.append(CASCADIA.tenant_id, "B:proj", "DocumentUploaded", {"n": 1}, 2)
        a2 = self.ledger.append(NORDBROOK.tenant_id, "A:proj", "DocumentUploaded", {"n": 2}, 3)
        self.assertEqual([a1["sequence"], a2["sequence"], b1["sequence"]], [1, 2, 1])
        self.assertIsNone(a1["causation_id"])
        self.assertEqual(a2["causation_id"], a1["event_id"])
        self.assertIsNone(b1["causation_id"])
        self.assertEqual(len({a1["event_id"], a2["event_id"], b1["event_id"]}), 3)

    def test_replay_by_index_and_by_time_and_on_disk_readback_agree(self):
        for offset in range(1, 4):
            self.ledger.append(NORDBROOK.tenant_id, "A:proj", "DocumentUploaded", {"n": offset}, offset * 10)
        self.assertEqual(len(self.ledger.through(2)), 2)
        self.assertEqual(len(self.ledger.through_timestamp(DEFAULT_CLOCK.at(20))), 2)
        self.assertEqual(self.ledger.through_timestamp(DEFAULT_CLOCK.at(0)), [])
        on_disk = EventLedger.read_events(self.tmp / "ledger.jsonl")
        self.assertEqual([event["event_id"] for event in on_disk], [event["event_id"] for event in self.ledger.events])
        self.ledger.through(1)[0]["payload"]["n"] = 999
        self.assertEqual(self.ledger.events[0]["payload"]["n"], 1, "replays are copies; the ledger is immutable")

    def test_closed_aggregate_refuses_further_appends(self):
        self.ledger.append(NORDBROOK.tenant_id, "A:proj", "DocumentUploaded", {"n": 1}, 1)
        self.ledger.close_aggregate("A:proj")
        with self.assertRaisesRegex(InvariantViolation, "TERMINAL_STATE_EMIT_REFUSED"):
            self.ledger.append(NORDBROOK.tenant_id, "A:proj", "DocumentUploaded", {"n": 2}, 2)
        self.assertEqual(len(self.ledger.events), 1)
        # a different aggregate is unaffected
        self.ledger.append(NORDBROOK.tenant_id, "B:proj", "DocumentUploaded", {"n": 1}, 3)
        self.assertEqual(len(self.ledger.events), 2)

    def test_refuses_to_open_on_a_non_empty_ledger_file(self):
        self.ledger.append(NORDBROOK.tenant_id, "A:proj", "DocumentUploaded", {"n": 1}, 1)
        with self.assertRaisesRegex(InvariantViolation, "LEDGER_NOT_EMPTY"):
            EventLedger(self.tmp / "ledger.jsonl", "RUN-TEST-2", DEFAULT_CLOCK)

    def test_validator_runs_before_the_line_is_written(self):
        calls = []

        def failing_validator(reference, instance, label):
            calls.append(label)
            raise InvariantViolation("SCHEMA_VALIDATION_FAILED: forced for test")

        ledger = EventLedger(self.tmp / "validated.jsonl", "RUN-VALIDATE", DEFAULT_CLOCK, validator=failing_validator)
        with self.assertRaises(InvariantViolation):
            ledger.append(NORDBROOK.tenant_id, "A:proj", "DocumentUploaded", {"n": 1}, 1)
        self.assertTrue(calls)
        self.assertFalse((self.tmp / "validated.jsonl").exists() and (self.tmp / "validated.jsonl").stat().st_size > 0, "an invalid event must never reach disk")

    def test_payload_guard_runs_before_validation_and_before_the_write(self):
        def guard(event_type, payload):
            if "secret" in str(payload):
                raise InvariantViolation("LEDGER_PII_GUARD_TRIPPED: forced for test")

        ledger = EventLedger(self.tmp / "guarded.jsonl", "RUN-GUARD", DEFAULT_CLOCK, payload_guard=guard)
        with self.assertRaisesRegex(InvariantViolation, "LEDGER_PII_GUARD_TRIPPED"):
            ledger.append(NORDBROOK.tenant_id, "A:proj", "DocumentUploaded", {"n": "secret"}, 1)
        self.assertEqual(ledger.events, [])

    def test_find_matches_on_payload_fields(self):
        self.ledger.append(NORDBROOK.tenant_id, "A:proj", "TranscriptGenerated", {"subject_id": "P1"}, 1)
        self.ledger.append(NORDBROOK.tenant_id, "A:proj", "TranscriptGenerated", {"subject_id": "P2"}, 2)
        self.assertEqual([event["payload"]["subject_id"] for event in self.ledger.find("TranscriptGenerated", subject_id="P2")], ["P2"])


if __name__ == "__main__":
    unittest.main()
