"""Collector wire v2 (docs/platform/STEP2_SHARED_RULES.md §4.1), the engine's half. The examples live once, in
specs/wire/collector.v2.json: next-admin builds them from the same seeds (lib/collect/__tests__/collect-wire-v2.test.ts);
this file posts them, then breaks each rule the file states once."""

from __future__ import annotations

import copy
import json
import sqlite3
from pathlib import Path
from unittest import mock

from ai_lego.apps.api import main as api_main
from ai_lego.platform import block_hooks
from tests.unit.test_api_collections import CollectionApiTestCase

SPEC = json.loads((Path(__file__).resolve().parents[2] / "specs" / "wire" / "collector.v2.json").read_text(encoding="utf-8"))
SEARCHED = SPEC["ingest"]["sources"][1]   # found by a search, not pasted


class WireV2Case(CollectionApiTestCase):
    def setUp(self):
        super().setUp()
        self._collector()
        self.pid = self.project["project_id"]
        self.arrived: list[dict] = []
        hooks = {"GATHER": [lambda docs, tenant, owner, arrived: self.arrived.append(arrived)]}
        patcher = mock.patch.object(block_hooks, "_registry", lambda name: hooks if name == "AFTER_SOURCES" else {})
        patcher.start()
        self.addCleanup(patcher.stop)

    def _request(self, seeds: list[dict], confirm: bool = False):
        return self.client.post(f"/projects/{self.pid}/collections", json={"seeds": seeds, "confirm": confirm})

    def _start(self) -> None:
        response = self._request(SPEC["seeds"], confirm=True)
        self.assertEqual(response.status_code, 202, response.text)
        self.run_id = response.json()["run_id"]
        self.grant_ref = self.service.calls[-1]["grant_ref"]
        self.token = self._exchange(self.grant_ref).json()["grant_token"]

    def _ingest(self, sources: list[dict]):
        return self.client.post(f"/projects/{self.pid}/sources/ingest", json={"run_id": self.run_id, "sources": sources},
                                headers={"Authorization": f"Grant {self.token}"})

    def _complete(self, body: dict):
        return self.client.post(f"/projects/{self.pid}/collections/{self.run_id}/complete", json=body,
                                headers={"Authorization": f"Grant {self.token}"})

    def _run_status(self) -> str:
        return self.client.get(f"/projects/{self.pid}/collections/{self.run_id}").json()["status"]

    def _rows(self) -> list[dict]:
        return self._repo.list_sources(self.tenant["tenant_id"], self.pid)

    def _source(self, relevance: dict, schema_version: str = "2") -> dict:
        return {**copy.deepcopy(SEARCHED), "relevance": relevance, "schema_version": schema_version}


class SpecExamplesTests(WireV2Case):
    def test_the_spec_seeds_are_planned_and_reach_the_collector_unchanged(self):
        plan = self._request(SPEC["seeds"]).json()["plan"]
        # one claim seed; the pasted URL makes no query
        self.assertEqual((plan["seeds"], plan["max_queries"]), (2, api_main.RESEARCH_MAX_QUERIES_PER_ENTITY))
        self._start()
        self.assertEqual(self.service.calls[-1]["seeds"], SPEC["seeds"])

    def test_the_spec_batch_is_stored_with_its_relevance_exactly_as_sent(self):
        self._start()
        response = self._ingest(SPEC["ingest"]["sources"])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([r["outcome"] for r in response.json()["results"]], ["created"] * 3)
        stored = {row["canonical_url"]: row["relevance"] for row in self._rows()}
        self.assertEqual(stored, {s["canonical_url"]: s["relevance"] for s in SPEC["ingest"]["sources"]})

    def test_the_spec_completion_hands_its_aside_and_channels_to_the_hooks(self):
        self._start()
        self._ingest(SPEC["ingest"]["sources"])
        response = self._complete(SPEC["complete"])
        self.assertEqual(response.status_code, 200, response.text)
        block_hooks.wait_idle()
        end = [a for a in self.arrived if a["source_ids"] is None and a.get("channels")]
        self.assertEqual(len(end), 1)
        self.assertEqual((end[0]["run"], end[0]["aside"], end[0]["channels"]), (self.run_id, SPEC["complete"]["aside"], SPEC["complete"]["channels"]))

    def test_the_exchange_answer_lists_the_wire_versions_so_next_admin_never_sends_what_this_engine_refuses(self):
        self._request(SPEC["seeds"], confirm=True)
        answer = self._exchange(self.service.calls[-1]["grant_ref"]).json()
        self.assertEqual(answer["wire_versions"], ["1", "2"])

    def test_v1_is_stored_in_the_v2_shape_keeping_only_what_v2_allows(self):
        self._start()
        v1 = {"entityConfidence": "anchored", "searchQuery": "q", "searchProvider": "perplexity", "anything": [1], "pasted": True}
        self.assertEqual(self._ingest([self._source(v1, schema_version="1")]).status_code, 200)
        self.assertEqual(self._rows()[0]["relevance"], {"entityConfidence": "anchored", "searchQuery": "q", "pasted": False})

    def test_v1_is_still_accepted_free_form_and_a_completion_without_lists_hands_on_empty_ones(self):
        self._start()
        self.assertEqual(self._ingest([self._source({"entityConfidence": 0.9, "anything": [1]}, schema_version="1")]).status_code, 200)
        self.assertEqual(self._ingest([self._source({}, schema_version="3")]).status_code, 422)
        self.assertEqual(self._complete({"status": "completed", "report": SPEC["complete"]["report"]}).status_code, 200)
        block_hooks.wait_idle()
        # the accepted batch and the run's end; the refused batch never reached the hooks
        self.assertEqual([(a["aside"], a["channels"]) for a in self.arrived], [([], []), ([], [])])


class RelevanceRuleTests(WireV2Case):
    """Every key in the spec's `relevance`, at its limit and one past it."""

    def setUp(self):
        super().setUp()
        self._start()

    def accepts(self, relevance: dict) -> None:
        response = self._ingest([self._source(relevance)])
        self.assertEqual(response.status_code, 200, f"{relevance!r}: {response.text}")

    def refuses(self, relevance: dict) -> None:
        before = len(self._rows())
        response = self._ingest([self._source(relevance)])
        self.assertEqual(response.status_code, 400, repr(relevance)[:200])
        self.assertIn("SOURCE_RELEVANCE_INVALID", response.text)
        self.assertEqual(len(self._rows()), before)

    def test_each_key_at_its_limit_and_past_it(self):
        for key, rule in SPEC["relevance"].items():
            if key == "pasted":
                continue
            with self.subTest(key=key):
                base = {"pasted": False}
                kind, top = rule["type"], rule.get("max", 0)
                if kind == "enum":
                    for value in rule["values"]:
                        self.accepts({**base, key: value})
                    self.refuses({**base, key: "something-else"})
                elif kind == "text":
                    self.accepts({**base, key: "查" * top})
                    self.refuses({**base, key: "查" * (top + 1)})
                    self.refuses({**base, key: ""})
                    self.refuses({**base, key: 7})
                elif kind == "id":
                    self.accepts({**base, key: "a" * top})
                    self.refuses({**base, key: "a" * (top + 1)})
                    self.refuses({**base, key: "Upper"})
                elif kind == "url":
                    self.accepts({**base, key: "https://img.example/" + "p" * (top - len("https://img.example/"))})
                    self.refuses({**base, key: "https://img.example/" + "p" * (top + 1 - len("https://img.example/"))})
                    self.refuses({**base, key: "ftp://img.example/a.png"})
                elif kind == "texts":
                    self.accepts({**base, key: ["a"] * rule["items"]})
                    self.accepts({**base, key: ["b" * top]})
                    self.refuses({**base, key: ["a"] * (rule["items"] + 1)})
                    self.refuses({**base, key: ["b" * (top + 1)]})
                    self.refuses({**base, key: [""]})
                    self.refuses({**base, key: "not-a-list"})
                else:
                    self.fail(f"the spec names a type this test does not know: {kind}")

    def test_pasted_is_required_a_bool_and_never_beside_a_search_key(self):
        self.accepts({"pasted": True})
        self.refuses({})
        self.refuses({"pasted": "yes"})
        self.refuses({"pasted": 1})
        self.refuses({"pasted": True, "searchQuery": "x"})

    def test_an_unknown_key_is_refused(self):
        self.refuses({"pasted": False, "searchSnippet": "the vendor's words"})

    def test_the_whole_object_is_capped(self):
        hosts = [f"{'h' * 90}-{i}.example.com" for i in range(SPEC["relevance"]["outlinks"]["items"])]
        self.assertGreater(len(json.dumps({"pasted": False, "outlinks": hosts}, ensure_ascii=False).encode("utf-8")), SPEC["max_relevance_bytes"])
        self.refuses({"pasted": False, "outlinks": hosts})


class CompletionRuleTests(WireV2Case):
    """A completion whose lists break the spec still ends the run (as failed) and kills the grant -- never left open."""

    def assert_refused(self, **lists) -> None:
        self._start()
        response = self._complete({**SPEC["complete"], **lists})
        self.assertEqual(response.status_code, 400, str(lists)[:200])
        self.assertIn("COLLECTION_COMPLETE_INVALID", response.text)
        self.assertEqual(self._run_status(), "failed")
        self.assertEqual(self._complete(SPEC["complete"]).status_code, 401)
        block_hooks.wait_idle()
        self.assertFalse([a for a in self.arrived if a.get("run") == self.run_id and a["source_ids"] is None])

    def test_at_every_limit_it_is_accepted(self):
        limits = SPEC["completion_limits"]
        page = {"url": "https://a.example/" + "u" * (limits["aside_url"] - len("https://a.example/")), "title": "t" * limits["aside_title"], "reason": "r" * limits["aside_reason"]}
        channel = {"provider": "serper", "lang": "zh", "state": "unreachable", "why": "w" * limits["channel_why"]}
        self._start()
        response = self._complete({**SPEC["complete"], "aside": [page] * limits["aside"], "channels": [channel] * limits["channels"]})
        self.assertEqual(response.status_code, 200, response.text[:300])

    def test_each_rule_past_its_limit_is_refused(self):
        limits = SPEC["completion_limits"]
        page, channel = SPEC["complete"]["aside"][0], SPEC["complete"]["channels"][0]
        cases = {
            "too many pages": {"aside": [page] * (limits["aside"] + 1)},
            "a page with another key": {"aside": [{**page, "text": "x"}]},
            "a page that is not a web address": {"aside": [{**page, "url": "file:///etc/passwd"}]},
            "a url too long": {"aside": [{**page, "url": "https://a.example/" + "u" * limits["aside_url"]}]},
            "a title too long": {"aside": [{**page, "title": "t" * (limits["aside_title"] + 1)}]},
            "an empty reason": {"aside": [{**page, "reason": ""}]},
            "too many channels": {"channels": [channel] * (limits["channels"] + 1)},
            "a channel with another key": {"channels": [{**channel, "count": 1}]},
            "a provider that is not an id": {"channels": [{**channel, "provider": "Serper API"}]},
            "perplexity as a channel": {"channels": [{**channel, "provider": "perplexity", "state": "ok", "why": ""}]},
            "aside items that are not pages": {"aside": ["x"]},
            "aside that is not a list": {"aside": {"url": "https://a.example/"}},
            "channels that are not a list": {"channels": "serper"},
            "an empty string for pages": {"aside": ""},
            "a zero for channels": {"channels": 0},
            "false for pages": {"aside": False},
            "a language outside zh and en": {"channels": [{**channel, "lang": "fr"}]},
            "a state outside the three": {"channels": [{**channel, "state": "down"}]},
            "a why too long": {"channels": [{**channel, "why": "w" * (limits["channel_why"] + 1)}]},
        }
        for name, lists in cases.items():
            with self.subTest(name):
                self.assert_refused(**lists)


class ClaimSeedTests(WireV2Case):
    def assert_refused(self, seed: dict) -> None:
        response = self._request([seed], confirm=True)
        self.assertEqual(response.status_code, 400, json.dumps(seed, ensure_ascii=False)[:200])
        self.assertIn("COLLECTION_SEEDS_INVALID", response.text)
        conn = sqlite3.connect(self._repo.db_path)
        try:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM collection_runs").fetchone()[0], 0)
        finally:
            conn.close()

    def claim(self, **meta) -> dict:
        seed = copy.deepcopy(SPEC["seeds"][0])
        seed["meta"].update(meta)
        return seed

    def test_perplexity_is_never_a_provider(self):
        self.assert_refused(self.claim(providers=["perplexity"]))
        self.assert_refused(self.claim(providers=["serper", "perplexity"]))

    def test_every_claim_angle_language_and_engine_in_the_spec_is_accepted(self):
        seed = self.claim(angles=SPEC["claim_angles"], languages=SPEC["languages"], providers=SPEC["providers"])
        self.assertEqual(self._request([seed]).status_code, 200)

    def test_a_malformed_claim_is_refused_before_anything_is_written(self):
        cases = {
            "unknown angle": self.claim(angles=["rumour"]),
            "no angle": self.claim(angles=[]),
            "a repeated angle": self.claim(angles=["news", "news"]),
            "a language outside zh and en": self.claim(languages=["fr"]),
            "angles as a string": self.claim(angles="news,factcheck"),
            "an empty claim": self.claim(entityName="   "),
            "a claim over the limit": self.claim(entityName="查" * (SPEC["claim_max_chars"] + 1)),
            "another meta key": self.claim(maxDepth=3),
            "a missing meta key": {"uri": SPEC["seeds"][0]["uri"], "meta": {k: v for k, v in SPEC["seeds"][0]["meta"].items() if k != "providers"}},
            "a claim uri without meta": {"uri": SPEC["seeds"][0]["uri"]},
            "a claim uri with another kind": self.claim(kind="person"),
            "kind claim on a name seed": {"uri": "entity://Acme%20Ltd", "meta": {**SPEC["seeds"][0]["meta"]}},
            "a claim id with a slash": {**self.claim(), "uri": "entity://claim/a/b"},
            "a claim id over 64": {**self.claim(), "uri": "entity://claim/" + "a" * 65},
            "pasted that is not a bool": {"uri": SPEC["seeds"][1]["uri"], "meta": {"pasted": "yes"}},
            "pasted on an entity seed": {"uri": "entity://Acme%20Ltd", "meta": {"pasted": True}},
        }
        for name, seed in cases.items():
            with self.subTest(name):
                self.assert_refused(seed)

    def test_only_the_two_seed_shapes_pass_never_a_name_search_and_never_extra_meta(self):
        cases = {
            # a name seed reached the collector's name search, which honours COLLECT_SEARCH_PROVIDER (Perplexity)
            "a name seed": {"uri": "entity://Acme%20Ltd", "meta": {"entityKind": "organization"}},
            "a name seed without meta": {"uri": "entity://Acme%20Ltd"},
            # extra meta was copied onto every page and made the engine refuse the whole batch
            "an https seed with extra meta": {"uri": "https://acme.example/a", "meta": {"pasted": True, "searchQuery": "x"}},
            "an https seed with only other meta": {"uri": "https://acme.example/a", "meta": {"maxDepth": 5}},
            "plain http": {"uri": "http://acme.example/a"},
        }
        for name, seed in cases.items():
            with self.subTest(name):
                self.assert_refused(seed)
        self.assertEqual(self._request([{"uri": "https://acme.example/a"}, {"uri": "https://acme.example/b", "meta": {"pasted": False}}]).status_code, 200)

    def test_a_seed_uri_is_given_once(self):
        for seeds in ([SPEC["seeds"][0], copy.deepcopy(SPEC["seeds"][0])], [{"uri": "https://acme.example/a"}, {"uri": "https://acme.example/a", "meta": {"pasted": True}}]):
            response = self._request(seeds, confirm=True)
            self.assertEqual(response.status_code, 400)
            self.assertIn("COLLECTION_SEEDS_INVALID", response.text)
