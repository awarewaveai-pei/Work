"""Test data for the steps 3+4 page walk (scripts/page_walk_step34.mjs). LOCAL TEST DATABASE ONLY.

Makes one throwaway tenant with three people and the records the six new pages draw, through the real routes of a running
API (so every hook ran), plus the two records only the AI writes (an AI sentence in a draft, the AI's restatement of a
member's position), written in-process as the AI would. Every value is a test value; the people's passwords are random
per run and exist only in the --state file, which the walk reads and you delete afterwards.

Refuses a database that is not on this machine. Start the stack (the exact commands, also in page_walk_step34.mjs):

    docker run -d --name c80_pg -p 127.0.0.1:55480:5432 -e POSTGRES_PASSWORD=<test value> -e POSTGRES_DB=cos <the postgres:17-alpine digest of tests/pg.py>
    export COGNITIVE_OS_DATABASE_URLS="eu=postgresql://postgres:<test value>@127.0.0.1:55480/cos"
    python -c "from ai_lego.data.db import migrate; migrate('postgresql://postgres:<test value>@127.0.0.1:55480/cos')"
    python -m uvicorn ai_lego.apps.api.main:app --host 127.0.0.1 --port 8431          # from the product root
    cd apps/cognitive-web && COS_API_ORIGIN=http://127.0.0.1:8431 npm run build && npx next start -p 3101

then, from the product root, with the same COGNITIVE_OS_DATABASE_URLS:  python scripts/seed_step34.py --state <file>
"""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from urllib.parse import urlparse

PRODUCT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PRODUCT_ROOT))

from ai_lego.apps.cli.bootstrap_phase1_tenant import bootstrap   # noqa: E402
from ai_lego.data.db import DATABASE_URLS_ENV, Databases, parse_database_urls   # noqa: E402
from ai_lego.data.events import record_log   # noqa: E402
from ai_lego.data.repositories.case_docs import CaseDocs   # noqa: E402
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository   # noqa: E402
from ai_lego.platform.identity.store import IdentityStore   # noqa: E402
from ai_lego.platform.lessons import FACILITATOR_COURSE, courses, load_lessons, load_practice_cases   # noqa: E402

LOCAL_HOSTS = ("127.0.0.1", "localhost", "::1")


class Person:
    """One signed-in test person: calls the API with their session cookie."""

    def __init__(self, api: str, tenant_id: str, identity_id: str, email: str, password: str, name: str) -> None:
        self.api, self.tenant_id, self.identity_id, self.email, self.password, self.name = api, tenant_id, identity_id, email, password, name
        self.cookie = ""

    def login(self) -> None:
        request = urllib.request.Request(self.api + "/auth/login", method="POST", headers={"Content-Type": "application/json"},
                                         data=json.dumps({"tenant_id": self.tenant_id, "email": self.email, "password": self.password}).encode())
        with urllib.request.urlopen(request, timeout=30) as response:
            match = re.search(r"cognitive_os_session=([^;]+)", response.headers.get("Set-Cookie", ""))
        if not match:
            raise SystemExit(f"SEED_FAILED: no session cookie for {self.name}")
        self.cookie = match.group(1)

    def call(self, method: str, path: str, body: dict | None = None):
        request = urllib.request.Request(self.api + path, method=method, headers={"Content-Type": "application/json", "Cookie": f"cognitive_os_session={self.cookie}"},
                                         data=None if body is None else json.dumps(body).encode())
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                text = response.read().decode()
        except urllib.error.HTTPError as error:
            raise SystemExit(f"SEED_FAILED: {method} {path} -> {error.code} {error.read().decode()[:300]}") from None
        return json.loads(text) if text else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--state", required=True, help="where to write the ids and the random test passwords the walk reads")
    parser.add_argument("--api", default="http://127.0.0.1:8431")
    args = parser.parse_args()

    urls = parse_database_urls(os.environ.get(DATABASE_URLS_ENV, ""))
    for url in urls.values():
        if urlparse(url).hostname not in LOCAL_HOSTS:
            raise SystemExit("SEED_REFUSED: the database is not on this machine; this script writes test data only to a local database")
    if urlparse(args.api).hostname not in LOCAL_HOSTS:
        raise SystemExit("SEED_REFUSED: the API is not on this machine")

    password = secrets.token_urlsafe(18)
    with Databases.from_env(max_size=2) as databases:
        store = IdentityStore(databases)
        suffix = secrets.token_hex(3)
        ids = bootstrap(store, f"alice-{suffix}@step34.test", password, "測試甲", databases.directory_region)
        tenant_id = ids["tenant_id"]
        people = {"alice": Person(args.api, tenant_id, ids["identity_id"], f"alice-{suffix}@step34.test", password, "測試甲")}
        for key, name in (("bob", "測試乙"), ("carol", "測試丙")):
            email = f"{key}-{suffix}@step34.test"
            identity = store.create_identity(str(uuid.uuid4()), tenant_id, email, name, password)
            people[key] = Person(args.api, tenant_id, identity["identity_id"], email, password, name)
        for person in people.values():
            person.login()
        alice, bob, carol = people["alice"], people["bob"], people["carol"]

        # carol finishes the leader course the way the page does: one run per lesson, the system writes the completion
        versions = {item["id"]: item["version"] for item in load_lessons().items}
        case_id = load_practice_cases().items[0]["id"]
        for lesson_id in courses()[FACILITATOR_COURSE]:
            carol.call("POST", "/me/docs/teach.run", {"content": {"lesson": lesson_id, "lesson_version": versions[lesson_id], "practice_case": case_id, "role": "提出者", "notes": "我先寫出看到的事。"}})
        # alice has done one lesson and one review of her own, for the TEACH page
        first_lesson = next(iter(versions))
        alice.call("POST", "/me/docs/teach.run", {"content": {"lesson": first_lesson, "lesson_version": versions[first_lesson], "practice_case": case_id, "role": "反方", "notes": "我找反例。"}})
        alice.call("POST", "/me/docs/teach.aar", {"content": {"predicted": "我以為兩個月做完", "happened": "做了三個月", "missed_context": "沒問過客戶的假期", "change_next_time": "先問清楚時程"}})

        # group 1: a decision of three partners (two here), with the COLLAB records the page draws
        g1 = alice.call("POST", "/groups", {"name": "第三位合夥人要不要加入", "purpose": "decision"})["group_id"]
        token = alice.call("POST", f"/groups/{g1}/invites", {"role": "participant"})["token"]
        bob.call("POST", "/invites/accept", {"token": token})
        alice.call("POST", f"/groups/{g1}/collab/collab.question", {"content": {"text": "第三位合夥人要不要加入我們？", "round": 1}})
        alice.call("POST", f"/groups/{g1}/collab/collab.place", {"content": {"where": "台北"}})
        bob.call("POST", f"/groups/{g1}/collab/collab.place", {"content": {"where": "高雄"}})
        alice.call("POST", f"/groups/{g1}/collab/collab.position", {"content": {"round": 1, "text": "我想讓他加入，多一個人分擔。", "confidence": "六成"}})
        bob_position = bob.call("POST", f"/groups/{g1}/collab/collab.position", {"content": {"round": 1, "text": "我擔心決定變慢。"}})
        option = alice.call("POST", f"/groups/{g1}/collab/collab.option", {"content": {"round": 1, "text": "先試用三個月再決定", "risks": "試用期間責任不清楚", "values_tradeoff": "彈性換來不確定"}})
        alice.call("POST", f"/groups/{g1}/collab/collab.stance", {"content": {"option": option["doc_id"], "stance": "同意", "reason": "風險小。"}})
        bob.call("POST", f"/groups/{g1}/collab/collab.stance", {"content": {"option": option["doc_id"], "stance": "異議", "reason": "試用期還是要先講好誰負責。"}})
        alice.call("POST", f"/groups/{g1}/collab/collab.authority", {"content": {"to": bob.identity_id, "scope": "對外簽約"}})

        # group 2: a class led by carol
        g2 = alice.call("POST", "/groups", {"name": "冰山模型工作坊", "purpose": "class"})["group_id"]
        carol.call("POST", "/invites/accept", {"token": alice.call("POST", f"/groups/{g2}/invites", {"role": "facilitator"})["token"]})
        bob.call("POST", "/invites/accept", {"token": alice.call("POST", f"/groups/{g2}/invites", {"role": "participant"})["token"]})

        # alice's case: two records, a selection of them, and a draft with one AI sentence and one of her own
        alice_case = alice.call("POST", "/projects", {"name": "寫給合夥人的一封信", "purpose": "整理想法", "data_classification": "Confidential"})["project_id"]
        cards = [alice.call("POST", f"/projects/{alice_case}/docs/sense.card", {"content": {"category": "事件", "text": text}}) for text in ("合夥人下週要回覆", "我還沒想清楚要不要加入")]
        refs = [{"project_id": alice_case, "kind": "sense.card", "doc_id": card["doc_id"]} for card in cards]
        alice.call("POST", f"/projects/{alice_case}/express/selection", {"content": {"items": refs, "format": "一封信", "reader": "第三位合夥人", "key_points": "我願意試用，但責任要先講好。"}})

        # bob's case: one card he shows the leader of group 2, and his consent
        bob_case = bob.call("POST", "/projects", {"name": "我的想法", "purpose": "整理想法", "data_classification": "Confidential"})["project_id"]
        bob_card = bob.call("POST", f"/projects/{bob_case}/docs/sense.card", {"content": {"category": "感受", "text": "我有點緊張"}})
        bob.call("POST", "/me/consents", {"purpose": "facilitator", "target": carol.identity_id, "items": [{"project_id": bob_case, "kind": "sense.card", "doc_id": bob_card["doc_id"]}]})
        bob.call("POST", "/me/appeals", {"group_id": g2, "about_identity_id": carol.identity_id, "text": "第二步的時間太趕。", "named": False})

        # what only the AI writes, in-process (no model is called: the sentence is a test value)
        docs = CaseDocs(ProjectSourceRepository(databases))
        docs.save(tenant_id, record_log.case(alice_case), "express.draft",
                  {"format": "一封信", "reader": "第三位合夥人", "sentences": [
                      {"text": "我願意先試用三個月。", "refs": [{"kind": "sense.card", "doc_id": cards[1]["doc_id"]}], "unchecked": False, "author": "ai"},
                      {"text": "試用前先講好誰負責簽約。", "refs": [{"kind": "sense.card", "doc_id": cards[0]["doc_id"]}], "unchecked": False, "author": "user"}]},
                  record_log.Writer("ai", "EXPRESS"))
        restated = "AI 轉述：乙擔心共同決定會變慢。"
        restatement = docs.save(tenant_id, record_log.group(g1), "collab.restatement", {"about": bob.identity_id, "position": bob_position["doc_id"], "text": restated},
                                record_log.Writer("ai", "COLLAB", bob.identity_id))
        bob.call("POST", f"/groups/{g1}/collab/collab.confirm", {"content": {"restatement": restatement["doc_id"], "verdict": "說得對"}})

    state = {"api": args.api, "tenant_id": tenant_id, "groups": {"decision": g1, "class": g2}, "alice_case": alice_case,
             "people": {key: {"email": person.email, "password": person.password, "identity_id": person.identity_id} for key, person in people.items()},
             "ai_texts": {"express": "我願意先試用三個月。", "group": restated}}
    Path(args.state).write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"SEED_OK tenant={tenant_id} groups=2 cases=2 state={args.state}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
