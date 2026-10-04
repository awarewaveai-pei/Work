"""The engine's side of collect lookups v1 (specs/wire/lookup.v1.json): the one place the platform learns anything from
outside. It never raises; whatever collect answers out of shape becomes 無法檢查 with why (R7, R8)."""

from __future__ import annotations

import json
import unittest

from ai_lego import PRODUCT_ROOT
from ai_lego.core.domain.evidence_words import cell as words_cell
from ai_lego.errors import InvariantViolation
from ai_lego.platform.net import collect_lookups as lookups
from ai_lego.platform.net.collection_service import CollectionServiceClient

CONTRACT = json.loads((PRODUCT_ROOT / "specs" / "wire" / "lookup.v1.json").read_text(encoding="utf-8"))
EXAMPLES = CONTRACT["examples"]


class Fake:
    def __init__(self, answer=None, error=None):
        self.answer, self.error, self.calls, self.dbs = answer, error, [], []

    def lookup(self, project_id, kind, items, timeout, **asked):
        self.calls.append((kind, items, timeout))
        self.dbs.append(asked.get("dbs"))
        if self.error:
            raise self.error
        return self.answer(items) if callable(self.answer) else self.answer


def answered(items, **cells):
    plain = {"state": "查不到", "why": "w"}
    return {"kind": "describe", "items": [{"url": item["url"], "site": "x", **{key: cells.get(key, plain) for key in lookups.DESCRIBE_CELLS}} for item in items]}


class DescribeTests(unittest.TestCase):
    urls = [item["url"] for item in EXAMPLES["describe"]["request"]["items"]]

    def test_the_spec_example_is_read_as_it_is(self):
        got = lookups.describe("p-1", self.urls, client=Fake(EXAMPLES["describe"]["answer"]))
        self.assertEqual(got[self.urls[0]]["registered"], EXAMPLES["describe"]["answer"]["items"][0]["registered"])
        self.assertEqual((got[self.urls[0]]["site"], got[self.urls[1]]["first_archived"]["state"]), ("example.com.tw", "查不到"))

    def test_collect_down_or_not_set_up_is_uncheckable_never_an_error(self):
        for client in (Fake(error=InvariantViolation("COLLECT_LOOKUP_UNAVAILABLE: HTTP 503")), None):
            got = lookups.describe("p-1", self.urls, client=client)
            self.assertTrue(all(got[url][key] == EXAMPLES["collect_down"]["engine_describe_cell"] for url in self.urls for key in lookups.DESCRIBE_CELLS))
        out_of_shape = lookups.describe("p-1", self.urls, client=Fake({"kind": "describe", "items": []}))
        self.assertTrue(all(out_of_shape[url]["registered"]["why"] == lookups.MALFORMED for url in self.urls))   # collect answered, wrongly

    def test_a_malformed_cell_or_a_wrong_echo_is_uncheckable_alone(self):
        bad = json.loads(json.dumps(EXAMPLES["describe"]["answer"]))
        bad["items"][0]["country"] = {"state": "查到"}             # 查到 without a value
        bad["items"][1]["url"] = "https://elsewhere.example/"
        got = lookups.describe("p-1", self.urls, client=Fake(bad))
        self.assertEqual((got[self.urls[0]]["country"]["why"], got[self.urls[0]]["registered"]["state"]), (lookups.MALFORMED, "查到"))
        self.assertTrue(all(got[self.urls[1]][key]["why"] == lookups.MALFORMED for key in lookups.DESCRIBE_CELLS))

    def test_a_value_beside_a_cell_that_found_nothing_is_malformed(self):
        """Codex 2026-10-04 F5: 查不到 with a value was accepted, so a page could show a date beside 「查不到」."""
        got = lookups.describe("p-1", ["https://a.example/"], client=Fake(lambda items: answered(items, registered={"state": "查不到", "value": "2001-01-01", "why": "w"})))
        self.assertEqual(got["https://a.example/"]["registered"], {"state": "無法檢查", "why": lookups.MALFORMED})
        with self.assertRaisesRegex(InvariantViolation, "EVIDENCE_CELL_INVALID: 無法檢查 has no value"):
            words_cell("無法檢查", "x", "w")

    def test_an_answer_that_came_back_unreadable_is_malformed_and_the_next_batch_is_still_asked(self):
        """Codex 2026-10-04 F4: a body that was not JSON read as 「沒有回應」 and stopped the run's other batches."""
        calls = []

        def unreadable(url, timeout, *, error_prefix, **kwargs):   # what egress.fetch_json raises for a body that is not JSON
            calls.append(url)
            raise InvariantViolation(f"{error_prefix}_MALFORMED_RESPONSE: JSONDecodeError")

        client = CollectionServiceClient("https://app.aware-wave.com", "t", fetch=unreadable)
        got = lookups.describe("p-1", [f"https://s{index}.example/" for index in range(30)], client=client)
        self.assertEqual(len(calls), 2)
        self.assertTrue(all(cells["registered"]["why"] == lookups.MALFORMED for cells in got.values()))
        self.assertEqual(lookups.factcheck("p-1", "某句話", client=client)[0]["why"], lookups.MALFORMED)

    def test_collects_words_are_capped_so_a_card_stays_under_its_cap(self):
        long = {"state": "查到", "value": "很" * 5000, "why": "因" * 5000}
        got = lookups.describe("p-1", ["https://a.example/"], client=Fake(lambda items: answered(items, registered=long)))
        cell = got["https://a.example/"]["registered"]
        self.assertEqual((len(cell["value"]), len(cell["why"])), (lookups.MAX_VALUE, lookups.MAX_WHY))

    def test_a_malformed_answer_marks_its_own_batch_and_the_next_batch_is_still_asked(self):
        answers = iter([{"kind": "describe", "items": []}, None])
        fake = Fake(lambda items: next(answers) or answered(items))
        got = lookups.describe("p-1", [f"https://s{index}.example/" for index in range(30)], client=fake)
        self.assertEqual(len(fake.calls), 2)
        self.assertEqual((got["https://s0.example/"]["registered"]["why"], got["https://s29.example/"]["registered"]["state"]), (lookups.MALFORMED, "查不到"))

    def test_many_pages_are_asked_in_batches_and_once_collect_is_down_the_rest_is_not_asked(self):
        many = [f"https://s{index}.example/" for index in range(60)] + ["https://s0.example/"]
        fine = Fake(answered)
        self.assertEqual(len(lookups.describe("p-1", many, client=fine)), 60)
        self.assertEqual([len(call[1]) for call in fine.calls], [25, 25, 10])
        down = Fake(error=InvariantViolation("COLLECT_LOOKUP_UNAVAILABLE: timeout"))
        got = lookups.describe("p-1", many, client=down)
        self.assertEqual(len(down.calls), 1)   # each ask may wait the full timeout; a run does not wait it three times
        self.assertTrue(all(cells["registered"]["why"] == lookups.DOWN for cells in got.values()))


class OneTermTests(unittest.TestCase):
    def test_no_page_or_message_calls_the_service_that_looks_things_up_a_蒐集器(self):
        """2026-10-04: one user-facing term, 「找資料的服務」. 蒐集器 was the developers' word and reached a page through a
        DOWN message, a ruleset line and an example why; a source file that says it again fails here."""
        found = [path.relative_to(PRODUCT_ROOT).as_posix() for folder, suffixes in (("ai_lego", {".py"}), ("apps/cognitive-web/components", {".tsx"}), ("apps/cognitive-web/lib", {".ts"}), ("specs/wire", {".json"}))
                 for path in (PRODUCT_ROOT / folder).rglob("*") if path.suffix in suffixes and ".test." not in path.name and "蒐集器" in path.read_text(encoding="utf-8")]
        self.assertEqual(found, [])


class FactcheckTests(unittest.TestCase):
    text = EXAMPLES["factcheck"]["request"]["items"][0]["text"]

    def test_the_spec_example_is_read_as_it_is(self):
        got = lookups.factcheck("p-1", self.text, client=Fake(EXAMPLES["factcheck"]["answer"]))
        self.assertEqual([entry["db"] for entry in got], list(lookups.DBS))
        self.assertEqual((got[0]["state"], got[1]["state"], got[1]["why"]), ("查到", "無法檢查", "Cofacts 這次沒有回應"))

    def test_collect_down_is_uncheckable_for_every_database(self):
        got = lookups.factcheck("p-1", self.text, client=Fake(error=InvariantViolation("x")))
        self.assertEqual(got[0], EXAMPLES["collect_down"]["engine_factcheck_db"])

    def test_a_state_that_does_not_match_its_hits_is_malformed(self):
        lying = json.loads(json.dumps(EXAMPLES["factcheck"]["answer"]))
        lying["items"][0]["dbs"][0]["hits"] = []                                                           # 查到 with nothing found
        lying["items"][0]["dbs"][1] = {"db": "cofacts", "state": "查不到", "attribution": "", "hits": []}   # 查不到 without why
        got = lookups.factcheck("p-1", self.text, client=Fake(lying))
        self.assertEqual((got[0]["why"], got[1]["why"]), (lookups.MALFORMED, lookups.MALFORMED))

    def test_only_the_databases_asked_see_the_words_and_come_back_with_the_licence(self):
        """P2 (lookup.v1 optional dbs and license): someone outside Taiwan asks ClaimReview only; a hit keeps its licence."""
        example = EXAMPLES["factcheck_claimreview_only"]
        client = Fake(example["answer"])
        got = lookups.factcheck("p-1", example["request"]["items"][0]["text"], client=client, dbs=example["request"]["dbs"])
        self.assertEqual(([entry["db"] for entry in got], client.dbs), (["claimreview"], [["claimreview"]]))
        self.assertEqual(got[0]["hits"][0]["license"], example["answer"]["items"][0]["dbs"][0]["hits"][0]["license"])
        lookups.factcheck("p-1", self.text, client=client)
        self.assertEqual(client.dbs[-1], None)   # absent = both, as before
        self.assertEqual((lookups.factcheck("p-1", self.text, client=client, dbs=[]), len(client.calls)), ([], 2))   # none to ask: nothing is sent

    def test_a_licence_is_capped(self):
        long = json.loads(json.dumps(EXAMPLES["factcheck_claimreview_only"]["answer"]))
        long["items"][0]["dbs"][0]["hits"][0]["license"] = "授" * 500
        got = lookups.factcheck("p-1", long["items"][0]["text"], client=Fake(long), dbs=["claimreview"])
        self.assertEqual(len(got[0]["hits"][0]["license"]), 200)

    def test_the_request_names_the_databases_only_when_asked(self):
        bodies = []

        def fetch(url, timeout, *, body, **kwargs):
            bodies.append(body)
            return {"kind": "factcheck", "items": []}

        client = CollectionServiceClient("https://app.aware-wave.com", "t", fetch=fetch)
        client.lookup("p-1", "factcheck", [{"text": "x"}], 1.0, dbs=["claimreview"])
        client.lookup("p-1", "factcheck", [{"text": "x"}], 1.0)
        self.assertEqual([body.get("dbs") for body in bodies], [["claimreview"], None])
        self.assertNotIn("dbs", bodies[1])


if __name__ == "__main__":
    unittest.main()
