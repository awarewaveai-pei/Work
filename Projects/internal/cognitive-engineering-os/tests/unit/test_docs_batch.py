"""GET .../docs?kinds=a,b,c: a page reads every kind it shows in one request (one per kind tripped the site's 50-per-10-
seconds limit, 2026-10-11). Each list is exactly the per-kind route's answer for that viewer; the case's owner check and
each kind's check come first."""

from __future__ import annotations

from ai_lego.apps.api import main as _api   # noqa: F401 -- main first: it mounts the block modules, which import docs
from ai_lego.apps.api.blocks.docs import MAX_KINDS_PER_READ
from tests.unit.test_project_source_api import ProjectSourceApiTestCase

KINDS = ("sense.card", "assembler.intake", "map.map")


class DocsBatchTests(ProjectSourceApiTestCase):
    def setUp(self):
        super().setUp()
        self._login()
        self.pid = self._create_project()["project_id"]
        self.base = f"/projects/{self.pid}"
        for text in ("合夥人第三次改條件", "他說同業都這樣改"):
            self.assertEqual(self.client.post(f"{self.base}/docs/sense.card", json={"content": {"category": "事件", "text": text}}).status_code, 200)
        card = self.client.get(f"{self.base}/docs/sense.card").json()[0]
        self.assertEqual(self.client.delete(f"{self.base}/docs/sense.card/{card['doc_id']}").status_code, 200)   # a tombstone

    def test_each_list_is_the_per_kind_answer(self):
        batch = self.client.get(f"{self.base}/docs", params={"kinds": ",".join(KINDS)})
        self.assertEqual(batch.status_code, 200, batch.text)
        self.assertEqual(batch.json(), {"docs": {kind: self.client.get(f"{self.base}/docs/{kind}").json() for kind in KINDS}})
        self.assertEqual(len(batch.json()["docs"]["sense.card"]), 1)   # the deleted card is not there
        mine = self.client.get("/me/docs", params={"kinds": "govern.location"})
        self.assertEqual(mine.json(), {"docs": {"govern.location": self.client.get("/me/docs/govern.location").json()}})

    def test_a_kind_its_route_refuses_is_refused_the_same_way(self):
        for base, kind in ((self.base, "govern.location"), (self.base, "no.such"), ("/me", "sense.card")):
            with self.subTest(base=base, kind=kind):
                one = self.client.get(f"{base}/docs/{kind}")
                many = self.client.get(f"{base}/docs", params={"kinds": f"sense.card,{kind}" if base != "/me" else kind})
                self.assertEqual((many.status_code, many.json()), (one.status_code, one.json()))
        self.assertEqual(self.client.get(f"{self.base}/docs", params={"kinds": ",".join(["sense.card"] * (MAX_KINDS_PER_READ + 1))}).status_code, 400)
        self.assertEqual(self.client.get(f"{self.base}/docs").status_code, 400)

    def test_another_persons_case_is_not_found(self):
        self._login_as_a_different_tenant()
        response = self.client.get(f"{self.base}/docs", params={"kinds": ",".join(KINDS)})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), self.client.get(f"{self.base}/docs/sense.card").json())   # PROJECT_NOT_FOUND, as one kind
        self.assertNotIn("他說同業都這樣改", response.text)
