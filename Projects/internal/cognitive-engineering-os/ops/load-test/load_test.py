"""Capacity rig client for the throwaway stack (docker-compose.load.yml). Pure stdlib + psycopg: runs in the API image.

    seed-db    one tenant (or --tenants T) + N synthetic people through the repo own IdentityStore (bootstrap_phase1_tenant.bootstrap)
    seed-data  each person logs in over HTTP and opens --cases cases with an intake, --cards SENSE cards and a DECIDE card
    run        N people, ramped in over --ramp seconds, then --duration seconds of weighted page-level actions with think time;
               per-endpoint p50/p95/p99/max/errors, then the DB is asked whether every acknowledged save is there (lost writes)

State lives in --state (users.json) and results in --out; both under the mounted /work. Never point --base at production:
the rig refuses a base that is not an in-network name or loopback. This file is ASCII on purpose (the tool that wrote it
mangles CJK in a heredoc); every Chinese value the API checks is imported from the repo own constants.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

PASSWORD = "LoadTest-Pw-2026!"
CRLF = bytes((13, 10))
HEAD_END = CRLF + CRLF
ALLOWED_HOSTS = ("api", "web", "127.0.0.1", "localhost")
ACTIONS = {"home": 20, "case_open": 25, "save_sense": 20, "save_decide": 8, "catalog": 7, "method_run": 5, "lead": 8, "teach": 7}
WHEN = ("in the meeting", "on the commute", "after work", "at lunch")
FEEL = ("a bit tense", "quite calm", "stuck on tomorrow", "interrupted")


# -- minimal HTTP/1.1 keep-alive client ------------------------------------------------------------------------------

class Stale(Exception):
    """A reused connection the server had already closed: nothing was answered, so one retry on a new connection is safe."""


async def read_response(reader):
    head = await reader.readuntil(HEAD_END)
    lines = head.split(CRLF)
    status = int(lines[0].split(b" ", 2)[1])
    headers = {}
    for line in lines[1:]:
        if b":" in line:
            key, value = line.split(b":", 1)
            headers[key.strip().lower()] = value.strip()
    if headers.get(b"transfer-encoding", b"").lower() == b"chunked":
        body = bytearray()
        while True:
            size = int((await reader.readuntil(CRLF)).strip().split(b";")[0], 16)
            if size == 0:
                await reader.readuntil(CRLF)
                break
            body += await reader.readexactly(size)
            await reader.readexactly(2)
        data = bytes(body)
    else:
        length = int(headers.get(b"content-length", b"0"))
        data = await reader.readexactly(length) if length else b""
    return status, headers, data


class Stats:
    def __init__(self):
        self.lat = defaultdict(list)
        self.outcome = defaultdict(Counter)

    def add(self, label, ms, outcome):
        self.lat[label].append(ms)
        self.outcome[label][outcome] += 1


class Run:
    """Shared run state: phase boundary, two stat buckets (ramp / steady), in-flight gauge, write ledger, error samples."""

    def __init__(self, host, port, timeout):
        self.host, self.port, self.timeout = host, port, timeout
        self.measure_from = 0.0
        self.ramp, self.steady = Stats(), Stats()
        self.by_conn = Stats()   # the steady requests again, split by whether they opened a new connection
        self.inflight = 0
        self.inflight_samples = []
        self.acked = []          # (doc_id, version) the server said it saved
        self.unacked = 0         # a save that ended in an error or a timeout: its outcome in the DB is unknown
        self.samples = []        # first few non-expected answers
        self.reconnects = 0
        self.stop = False
        self.prefix = ""         # "/api" when the target is the web container, which proxies /api/* to the API


class Person:
    def __init__(self, run, index):
        self.run, self.index = run, index
        self.idle = []
        self.cookie = None

    async def _roundtrip(self, method, path, body, fresh=False):
        run = self.run
        if fresh:   # the server closed the idle ones (uvicorn keep-alive is 5 s): drop them all, open a new one
            for _, old in self.idle:
                old.close()
            self.idle.clear()
        reused = bool(self.idle)
        if reused:
            reader, writer = self.idle.pop()
        else:
            reader, writer = await asyncio.open_connection(run.host, run.port)
        try:
            payload = b"" if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
            head = [f"{method} {path} HTTP/1.1", f"Host: {run.host}", "Accept: application/json"]
            if self.cookie:
                head.append(f"Cookie: {self.cookie}")
            if body is not None:
                head += ["Content-Type: application/json", f"Content-Length: {len(payload)}"]
            writer.write(CRLF.join(x.encode("utf-8") for x in head) + HEAD_END + payload)
            await writer.drain()
            status, headers, data = await read_response(reader)
        except (asyncio.IncompleteReadError, ConnectionError) as error:
            writer.close()
            if reused:
                raise Stale() from error
            raise
        except BaseException:
            writer.close()
            raise
        if headers.get(b"connection", b"").lower() == b"close":
            writer.close()
        else:
            self.idle.append((reader, writer))
        return status, headers, data, not reused

    async def call(self, label, method, path, body=None, expect=(200,)):
        run = self.run
        path = run.prefix + path
        t0 = time.monotonic()
        bucket = run.steady if t0 >= run.measure_from else run.ramp
        run.inflight += 1
        outcome, status, data, headers, fresh = None, None, b"", {}, False
        try:
            try:
                status, headers, data, fresh = await asyncio.wait_for(self._roundtrip(method, path, body), run.timeout)
            except Stale:
                run.reconnects += 1
                status, headers, data, fresh = await asyncio.wait_for(self._roundtrip(method, path, body, fresh=True), run.timeout)
            outcome = status
        except asyncio.TimeoutError:
            outcome = "timeout"
        except Exception as error:
            outcome = "conn:" + type(error).__name__
        finally:
            run.inflight -= 1
        ms = (time.monotonic() - t0) * 1000
        bucket.add(label, ms, outcome)
        if bucket is run.steady and isinstance(outcome, int):
            run.by_conn.add(label + (" [new conn]" if fresh else " [reused conn]"), ms, outcome)
        if not (isinstance(outcome, int) and outcome in expect) and len(run.samples) < 12:
            run.samples.append({"label": label, "outcome": outcome, "body": data[:300].decode("utf-8", "replace")})
        parsed = None
        if status == 200 and data[:1] in (b"{", b"["):
            try:
                parsed = json.loads(data)
            except ValueError:
                parsed = None
        return status, parsed, headers

    async def login(self, email):
        status, _, headers = await self.call("POST /auth/login", "POST", "/auth/login", {"email": email, "password": PASSWORD})
        if status != 200:
            return False
        cookie = headers.get(b"set-cookie", b"").decode("utf-8", "replace")
        self.cookie = cookie.split(";", 1)[0] if cookie else None
        return self.cookie is not None


# -- the scenario content (every value the API checks comes from the repo own constants) ------------------------------

def case_kinds():
    from ai_lego.core.domain import doc_kinds
    return sorted(name for name, spec in doc_kinds.kinds().items() if spec.owner == "case")[:60]


def person_kinds(prefix):
    from ai_lego.core.domain import doc_kinds
    return sorted(name for name, spec in doc_kinds.kinds().items() if spec.owner == "person" and name.startswith(prefix))


def sense_content(rng):
    from ai_lego.core.domain.kinds.sense import CATEGORIES
    return {"category": rng.choice(CATEGORIES), "text": f"Noticed {rng.choice(WHEN)} that I feel {rng.choice(FEEL)}, note {rng.randint(1, 10**6)}."}


def decide_content(rng):
    from ai_lego.core.domain.kinds.decide import INTENSITY
    return {"conclusion": f"Provisional: take the small step {rng.randint(1, 10**6)}", "uncertainty": "I do not know what the other side really expects",
            "change_condition": "New numbers would make me reconsider", "confidence": rng.randint(10, 90), "intensity_now": rng.choice(INTENSITY)}


def intake_content(k):
    from ai_lego.core.domain.kinds.assembler import PACKAGES, PURPOSES
    return {"purpose": PURPOSES[0], "question": f"Why does thing number {k} bother me", "package": list(PACKAGES)[0], "blocks": list(PACKAGES[list(PACKAGES)[0]])}


# -- seeding ------------------------------------------------------------------------------------------------------------

def seed_db(args):
    import uuid

    from ai_lego.apps.cli.bootstrap_phase1_tenant import bootstrap
    from ai_lego.data.db import Databases
    from ai_lego.platform.identity.store import IdentityStore

    with Databases.from_env(max_size=8) as databases:
        store, region = IdentityStore(databases), databases.directory_region
        tenants = [bootstrap(store, f"user{t}@load.test", PASSWORD, f"Load User {t}", region)["tenant_id"] for t in range(args.tenants)]

        def make(i):
            tenant = tenants[i % args.tenants]
            store.create_identity(str(uuid.uuid4()), tenant, f"user{i}@load.test", f"Load User {i}", PASSWORD)
            return {"i": i, "email": f"user{i}@load.test", "tenant_id": tenant}

        with ThreadPoolExecutor(8) as pool:
            users = [{"i": t, "email": f"user{t}@load.test", "tenant_id": tenants[t]} for t in range(args.tenants)]
            users += list(pool.map(make, range(args.tenants, args.users)))
    with open(args.state, "w", encoding="utf-8") as handle:
        json.dump(sorted(users, key=lambda u: u["i"]), handle)
    print(f"seed-db: {len(users)} people in {args.tenants} tenant(s) -> {args.state}")


async def seed_data(args):
    users = json.load(open(args.state, encoding="utf-8"))[: args.users]
    run = Run(*endpoint(args.base), timeout=120)
    gate, rng = asyncio.Semaphore(args.concurrency), random.Random(7)

    async def one(u):
        async with gate:
            person = Person(run, u["i"])
            if not await person.login(u["email"]):
                return
            u["projects"] = []
            for k in range(args.cases):
                _, project, _ = await person.call("POST /projects", "POST", "/projects", {"name": f"case-{u['i']}-{k}", "purpose": "capacity rig", "data_classification": "Internal"})
                if not project:
                    continue
                pid = project["project_id"]
                await person.call("POST docs/assembler.intake", "POST", f"/projects/{pid}/docs/assembler.intake", {"content": intake_content(k)})
                for _ in range(args.cards):
                    await person.call("POST docs/sense.card", "POST", f"/projects/{pid}/docs/sense.card", {"content": sense_content(rng)})
                _, judgment, _ = await person.call("POST docs/decide.judgment", "POST", f"/projects/{pid}/docs/decide.judgment", {"content": decide_content(rng)})
                if judgment:
                    u["projects"].append({"project_id": pid, "judgment": {"doc_id": judgment["doc_id"], "version": judgment["version"]}})

    await asyncio.gather(*(one(u) for u in users))
    with open(args.state, "w", encoding="utf-8") as handle:
        json.dump(users, handle)
    report(run.steady, "seed-data")
    print("people with a usable case:", sum(1 for u in users if u.get("projects")), "of", len(users))
    for sample in run.samples[:6]:
        print("sample:", sample)


def endpoint(base):
    host, _, port = base.replace("http://", "").partition(":")
    if host not in ALLOWED_HOSTS:
        raise SystemExit(f"refused: --base host {host!r} is not one of {ALLOWED_HOSTS}; the rig never targets a public name")
    return host, int(port or 80)


# -- the scenario -------------------------------------------------------------------------------------------------------

def get(person, label, path):
    return person.call(label, "GET", path)


async def act_home(person, u, rng, ctx):
    await asyncio.gather(get(person, "GET /projects", "/projects"), get(person, "GET /facilitate/me", "/facilitate/me"))


async def act_case_open(person, u, rng, ctx):
    pid = rng.choice(u["projects"])["project_id"]
    await asyncio.gather(get(person, "GET /facilitate/me", "/facilitate/me"), get(person, "GET /projects/:id", f"/projects/{pid}"),
                         get(person, "GET /projects/:id/route", f"/projects/{pid}/route"),
                         get(person, "GET /projects/:id/docs?kinds=(60 kinds)", f"/projects/{pid}/docs?kinds={ctx['case_kinds']}"))


async def save(person, run, label, method, path, content, base_version=None):
    body = {"content": content} if base_version is None else {"content": content, "base_version": base_version}
    status, doc, _ = await person.call(label, method, path, body)
    if status == 200 and doc:
        run.acked.append((doc["doc_id"], doc["version"]))
    elif status is None or status >= 500:
        run.unacked += 1
    return doc


async def act_save_sense(person, u, rng, ctx):
    pid = rng.choice(u["projects"])["project_id"]
    await save(person, ctx["run"], "POST docs/sense.card", "POST", f"/projects/{pid}/docs/sense.card", sense_content(rng))
    await get(person, "GET /projects/:id/docs?kinds=(4 sense kinds)", f"/projects/{pid}/docs?kinds=sense.card,sense.state,sense.mirror,sense.review")


async def act_save_decide(person, u, rng, ctx):
    mine = rng.choice(u["projects"])
    if not mine.get("synced"):   # a page open reads the card first: another level may have moved its version
        _, listed, _ = await get(person, "GET /projects/:id/docs?kinds=decide.judgment (sync)", f"/projects/{mine['project_id']}/docs?kinds=decide.judgment")
        current = (listed or {}).get("docs", {}).get("decide.judgment") or []
        if current:
            mine["judgment"] = {"doc_id": current[-1]["doc_id"], "version": current[-1]["version"]}
            mine["synced"] = True
    doc = await save(person, ctx["run"], "PUT docs/decide.judgment", "PUT", f"/projects/{mine['project_id']}/docs/decide.judgment/{mine['judgment']['doc_id']}",
                     decide_content(rng), mine["judgment"]["version"])
    if doc:
        mine["judgment"]["version"] = doc["version"]
    else:
        mine["synced"] = False


async def act_catalog(person, u, rng, ctx):
    await asyncio.gather(get(person, "GET /facilitate/me", "/facilitate/me"), get(person, "GET /catalog", "/catalog"))


async def act_method_run(person, u, rng, ctx):
    method = rng.choice(ctx["methods"])
    await asyncio.gather(get(person, "GET /catalog", "/catalog"), get(person, "GET /methods/:id/form", f"/methods/{method}/form"))


async def act_lead(person, u, rng, ctx):
    await asyncio.gather(*[get(person, "GET /facilitate/me", "/facilitate/me") for _ in range(4)], get(person, "GET /blocks/teach/lessons", "/blocks/teach/lessons"))


async def act_teach(person, u, rng, ctx):
    await asyncio.gather(get(person, "GET /facilitate/me", "/facilitate/me"), get(person, "GET /me/docs?kinds=(teach kinds)", f"/me/docs?kinds={ctx['teach_kinds']}"),
                         get(person, "GET /blocks/teach/practice-cases", "/blocks/teach/practice-cases"))


DO = {"home": act_home, "case_open": act_case_open, "save_sense": act_save_sense, "save_decide": act_save_decide, "catalog": act_catalog,
      "method_run": act_method_run, "lead": act_lead, "teach": act_teach}


async def living(run, u, seed, start_delay, end_ts, think, ctx):
    rng = random.Random(seed)
    await asyncio.sleep(start_delay)
    person = Person(run, u["i"])
    if not await person.login(u["email"]) or not u.get("projects"):
        return
    names = list(ACTIONS)
    await act_home(person, u, rng, ctx)
    while not run.stop and time.monotonic() < end_ts:
        await asyncio.sleep(rng.uniform(*think))
        if run.stop or time.monotonic() >= end_ts:
            break
        await DO[rng.choices(names, [ACTIONS[n] for n in names])[0]](person, u, rng, ctx)


# -- reporting and the lost-write check ---------------------------------------------------------------------------------

def pct(values, q):
    return values[min(len(values) - 1, int(round(q * (len(values) - 1))))] if values else 0.0


def report(stats, title):
    rows = []
    for label in sorted(stats.lat):
        values, outcomes = sorted(stats.lat[label]), stats.outcome[label]
        errors = sum(count for o, count in outcomes.items() if not isinstance(o, int) or o >= 500)
        other = sum(count for o, count in outcomes.items() if isinstance(o, int) and 300 <= o < 500)
        rows.append({"label": label, "n": len(values), "p50": pct(values, 0.5), "p95": pct(values, 0.95), "p99": pct(values, 0.99), "max": values[-1],
                     "errors": errors, "other_4xx": other, "outcomes": {str(o): c for o, c in outcomes.items()}})
    print(f"## {title}")
    print("| endpoint | n | p50 ms | p95 ms | p99 ms | max ms | 5xx/err | 4xx |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|")
    for r in rows:
        print(f"| {r['label']} | {r['n']} | {r['p50']:.0f} | {r['p95']:.0f} | {r['p99']:.0f} | {r['max']:.0f} | {r['errors']} | {r['other_4xx']} |")
    return rows


def db_url():
    from ai_lego.data.db import parse_database_urls
    return next(iter(parse_database_urls(os.environ["COGNITIVE_OS_DATABASE_URLS"]).values()))


def saved_count(connection):
    return connection.execute("SELECT count(*) FROM events WHERE event_type = %s", ("DocSaved",)).fetchone()[0]


def missing_writes(connection, acked):
    ids = sorted({doc_id for doc_id, _ in acked})
    found = set()
    for start in range(0, len(ids), 5000):
        rows = connection.execute("SELECT payload_json->>%s, (payload_json->>%s)::int FROM events WHERE event_type = %s AND payload_json->>%s = ANY(%s)",
                                  ("doc_id", "version", "DocSaved", "doc_id", ids[start:start + 5000])).fetchall()
        found.update((row[0], row[1]) for row in rows)
    return [pair for pair in acked if tuple(pair) not in found]


async def watch(run, args):
    while not run.stop:
        await asyncio.sleep(1)
        if time.monotonic() >= run.measure_from:
            run.inflight_samples.append(run.inflight)
        if args.abort_file and os.path.exists(args.abort_file):
            print("ABORT FILE seen: stopping the load", flush=True)
            run.stop = True


async def run_level(args):
    import psycopg

    users = [u for u in json.load(open(args.state, encoding="utf-8")) if u.get("projects")][: args.users]
    if len(users) < args.users:
        raise SystemExit(f"only {len(users)} seeded people with a case; asked for {args.users}")
    run = Run(*endpoint(args.base), timeout=args.timeout)
    run.prefix = args.prefix
    ctx = {"run": run, "case_kinds": ",".join(case_kinds()), "teach_kinds": ",".join(person_kinds("teach.")) or "teach.run"}
    probe = Person(run, -1)
    await probe.login(users[0]["email"])
    _, methods, _ = await probe.call("setup GET /methods", "GET", "/methods")
    ctx["methods"] = [m["method_id"] for m in (methods or [])][:40] or ["x"]
    think = tuple(float(x) for x in args.think.split(","))
    with psycopg.connect(db_url(), autocommit=True) as connection:
        before = saved_count(connection)
        t0 = time.monotonic()
        run.measure_from = t0 + args.ramp
        end_ts = run.measure_from + args.duration
        run.ramp, run.steady, run.by_conn = Stats(), Stats(), Stats()
        watcher = asyncio.create_task(watch(run, args))
        tasks = [asyncio.create_task(living(run, u, args.seed + u["i"], args.ramp * n / max(1, len(users)), end_ts, think, ctx)) for n, u in enumerate(users)]
        await asyncio.wait(tasks, timeout=args.ramp + args.duration + 90)
        run.stop = True
        await asyncio.sleep(1)
        watcher.cancel()
        after = saved_count(connection)
        lost = missing_writes(connection, run.acked)
    ramp_rows = report(run.ramp, f"{args.label} ramp ({args.ramp}s, logins)")
    steady_rows = report(run.steady, f"{args.label} steady ({args.duration}s, {len(users)} people)")
    if args.split_conn:
        report(run.by_conn, f"{args.label} steady split by connection")
    samples = run.inflight_samples
    summary = {"label": args.label, "users": len(users), "think": think, "ramp_s": args.ramp, "duration_s": args.duration,
               "requests_steady": sum(r["n"] for r in steady_rows), "rps_steady": round(sum(r["n"] for r in steady_rows) / args.duration, 1),
               "inflight_mean": round(sum(samples) / max(1, len(samples)), 1), "inflight_max": max(samples or [0]), "reconnects": run.reconnects,
               "saves_acked": len(run.acked), "saves_unknown_outcome": run.unacked, "db_docsaved_delta": after - before, "lost_acked_writes": len(lost),
               "lost_examples": lost[:5], "error_samples": run.samples}
    print(json.dumps({k: v for k, v in summary.items() if k != "error_samples"}))
    for sample in run.samples[:8]:
        print("sample:", sample)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            json.dump({"summary": summary, "ramp": ramp_rows, "steady": steady_rows}, handle, indent=1)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("seed-db", "seed-data", "run"):
        p = sub.add_parser(name)
        p.add_argument("--state", default="/work/state/users.json")
        p.add_argument("--users", type=int, default=50)
        if name == "seed-db":
            p.add_argument("--tenants", type=int, default=1)
            continue
        p.add_argument("--base", default="http://api:8420")
        if name == "seed-data":
            p.add_argument("--cases", type=int, default=2)
            p.add_argument("--cards", type=int, default=8)
            p.add_argument("--concurrency", type=int, default=40)
        else:
            p.add_argument("--label", default="level")
            p.add_argument("--ramp", type=float, default=60)
            p.add_argument("--duration", type=float, default=180)
            p.add_argument("--think", default="4,10", help="min,max seconds between a person actions")
            p.add_argument("--timeout", type=float, default=30)
            p.add_argument("--seed", type=int, default=1000)
            p.add_argument("--out", default="")
            p.add_argument("--split-conn", action="store_true")
            p.add_argument("--prefix", default="", help="/api to go through the web container")
            p.add_argument("--abort-file", default="/work/state/ABORT")
    args = parser.parse_args()
    os.makedirs(os.path.dirname(args.state), exist_ok=True)
    if args.command == "seed-db":
        seed_db(args)
    elif args.command == "seed-data":
        asyncio.run(seed_data(args))
    else:
        asyncio.run(run_level(args))


if __name__ == "__main__":
    main()
