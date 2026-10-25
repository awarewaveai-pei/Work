#!/usr/bin/env python3
"""0127 on one disposable local Postgres (no published port). Touches no production database.
Bootstraps 0001..0120 like the 0120 verify, then: up leaves 0120's billing_overview untouched (expand only) -> down -> up;
service_role only; 3000 root accounts + 100 brands + 300k ledger rows: billing_attention's totals equal an independent
count (internal excluded, an overdrawn account never offsets another, brands are not roots), its pages cover every
attention account exactly once, limits are clamped; billing_account resolves a brand to its root, caps the ledger at
20 rows, returns null for an unknown id; and its execution time. Last, 0129 (the contract step): drops billing_overview,
leaves 0127's reads answering; its down restores billing_overview byte for byte. 0130 (billing_ledger, the ledger of every
account): totals agree with 0127's, 30-day sums leave older entries out, each filter and the escaped search count
right, pages cover every match once, a row carries its contracts and last payment; down drops only billing_ledger.
    python lobster-factory/packages/db/scripts/0127_billing_account_views-local-verify.py"""
from pathlib import Path
import json
import os
import subprocess
import time
import uuid

DB = Path(__file__).resolve().parents[1]
NAME = "billing-0127-verify-" + uuid.uuid4().hex[:10]
UP = DB / "migrations/0127_billing_account_views.sql"
DOWN = DB / "migrations/0127_billing_account_views.down.sql"
DROP_UP = DB / "migrations/0129_drop_billing_overview.sql"
DROP_DOWN = DB / "migrations/0129_drop_billing_overview.down.sql"
LEDGER_UP = DB / "migrations/0130_billing_ledger.sql"
LEDGER_DOWN = DB / "migrations/0130_billing_ledger.down.sql"
ORDER_UP = DB / "migrations/0131_billing_ledger_order_search.sql"
ORDER_DOWN = DB / "migrations/0131_billing_ledger_order_search.down.sql"
INTERNAL, EDD, SOULFUL = "39ad4149-5044-4077-8d9a-b6b916de0e21", "ecf4e311-4f38-4288-9396-e70fd7697aca", "2bf60452-3d4d-47c2-9970-b9046ed1a35a"
CUST, BRAND = "00000000-0000-4000-8000-0000000000c1", "00000000-0000-4000-8000-0000000000b1"
N = 3000


def command(args, sql=None, succeeds=True):
    result = subprocess.run(args, input=sql, text=True, encoding="utf-8", capture_output=True)
    if succeeds and result.returncode:
        raise RuntimeError(result.stderr + result.stdout)
    return result


def query(sql, succeeds=True):
    return command(["docker", "exec", "-i", NAME, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-At"], sql, succeeds)


def one(sql):
    lines = query(sql).stdout.strip().splitlines()
    return lines[-1] if lines else ""


def migration(prefix):
    matches = [p for p in (DB / "migrations").glob(prefix + "_*.sql") if not p.name.endswith(".down.sql")]
    assert len(matches) == 1, prefix
    query(matches[0].read_text(encoding="utf-8"))


def acct(i):
    return f"00000000-0000-4000-9000-{i:012d}"


def balance(i):
    return (100 if i % 3 == 0 else 0) + (-150 if i % 7 == 0 else 0)


def reasons(i):
    b = balance(i)
    return [r for r, hit in (("frozen", i % 50 == 0), ("overdrawn", b < 0), ("past_due", i % 40 == 0), ("suspended", i % 60 == 0)) if hit]


def ledger(flt="all", q=None, limit=50, offset=0):
    qs = "null" if q is None else "'" + q.replace("'", "''") + "'"
    return json.loads(one(f"set role service_role; select public.billing_ledger('{flt}', {qs}, {limit}, {offset});"))


def attention(limit, offset):
    return json.loads(one(f"set role service_role; select public.billing_attention({limit}, {offset});"))


def main():
    command(["docker", "run", "-d", "--name", NAME, "--label", "awarewave.test=billing-0127", "-e", "POSTGRES_PASSWORD=verify", os.environ.get("PG_IMAGE", "postgres:15.8-alpine")])
    try:
        for _ in range(60):
            if query("select 1", succeeds=False).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("disposable Postgres did not become ready")
        query("""
          create role anon; create role authenticated; create role service_role bypassrls;
          grant usage on schema public to anon, authenticated, service_role;
          alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
          alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
          create schema auth;
          create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
        """)
        query((DB / "migrations/0001_core.sql").read_text(encoding="utf-8"))
        query("""create function public.user_has_org_membership(p_org_id uuid) returns boolean
          language sql stable security definer set search_path=public,pg_temp as $$ select false $$;""")
        for prefix in ["0062", "0063", "0066", "0077", "0092", "0110", "0117"]:
            migration(prefix)
        query(f"""insert into organizations(id,type,name,slug) values
          ('{INTERNAL}','client','AwareWave Ops','awarewave-ops'), ('{EDD}','client','EdD','edd-research'),
          ('{SOULFUL}','client','Soulful','soulful-expression'), ('{CUST}','client','Customer','customer');
          update organizations set kind='internal' where id='{INTERNAL}'; update organizations set org_level='group' where id='{CUST}';
          insert into organizations(id,type,name,slug,parent_organization_id) values ('{BRAND}','client','Brand','brand','{CUST}');""")
        migration("0118")
        migration("0120")
        overview_src = one("select md5(prosrc) from pg_proc where proname = 'billing_overview'")

        query(UP.read_text(encoding="utf-8"))
        assert one("select md5(prosrc) from pg_proc where proname = 'billing_overview'") == overview_src, "0127 must not touch billing_overview"
        query(DOWN.read_text(encoding="utf-8"))
        assert one("""select to_regprocedure('public.billing_account(uuid,integer,integer)') is null
          and to_regprocedure('public.billing_attention(integer,integer)') is null""") == "t"
        assert one("select md5(prosrc) from pg_proc where proname = 'billing_overview'") == overview_src
        query(UP.read_text(encoding="utf-8"))
        print("OK up, down, up: billing_overview untouched throughout (the deployed build keeps working); down drops only 0127's reads")

        for fn in ["billing_account(uuid,integer,integer)", "billing_attention(integer,integer)"]:
            assert one(f"select has_function_privilege('anon', 'public.{fn}', 'execute') or has_function_privilege('authenticated', 'public.{fn}', 'execute')") == "f", fn
            assert one(f"select has_function_privilege('service_role', 'public.{fn}', 'execute')") == "t", fn
        print("OK service_role only")

        t0 = time.time()
        query(f"""
          insert into plans(plan_key, product_key, kind, features) values ('social_basic','social','base','["social.rewrite"]');
          insert into organizations(id, type, name, slug)
            select format('00000000-0000-4000-9000-%s', lpad(i::text, 12, '0'))::uuid, 'client', format('Acct %s', lpad(i::text, 5, '0')), format('acct-%s', lpad(i::text, 5, '0'))
            from generate_series(1, {N}) i;
          insert into organizations(id, type, name, slug, parent_organization_id)
            select format('00000000-0000-4000-a000-%s', lpad(i::text, 12, '0'))::uuid, 'client', format('Brand %s', i), format('brand-%s', i), '{CUST}'
            from generate_series(1, 100) i;
          insert into media_credit_ledger(organization_id, units, entry_type, idempotency_key)
            select format('00000000-0000-4000-9000-%s', lpad(i::text, 12, '0'))::uuid, 100, 'grant', format('seed-g-%s', i) from generate_series(1, {N}) i where i % 3 = 0
            union all select format('00000000-0000-4000-9000-%s', lpad(i::text, 12, '0'))::uuid, -150, 'debit', format('seed-d-%s', i) from generate_series(1, {N}) i where i % 7 = 0
            union all select format('00000000-0000-4000-a000-%s', lpad(i::text, 12, '0'))::uuid, 5, 'grant', format('seed-b-%s', i) from generate_series(1, 100) i
            union all select '{INTERNAL}'::uuid, 9000, 'grant', 'internal-9000'
            union all select format('00000000-0000-4000-9000-%s', lpad(i::text, 12, '0'))::uuid, case when n % 2 = 0 then 1 else -1 end,
              case when n % 2 = 0 then 'grant' else 'debit' end, format('seed-v-%s-%s', i, n)
              from generate_series(1, {N}) i, generate_series(1, 100) n;
          insert into payment_events(provider, event_id, kind, organization_id, payload)
            select 'local', format('cb-%s', i), 'chargeback', format('00000000-0000-4000-9000-%s', lpad(i::text, 12, '0'))::uuid, '{{}}'::jsonb
            from generate_series(1, {N}) i where i % 50 = 0;
          insert into credit_wallet_holds(organization_id, reason, payment_event_id)
            select organization_id, 'chargeback', id from payment_events where event_id like 'cb-%';
          insert into organization_product_subscriptions(organization_id, product_key, plan_key, status)
            select format('00000000-0000-4000-9000-%s', lpad(i::text, 12, '0'))::uuid, 'social', 'social_basic', case when i % 40 = 0 then 'past_due' else 'active' end
            from generate_series(1, {N}) i where i % 10 = 0;
          insert into organization_entitlements(organization_id, product_key, feature_key, source, status)
            select format('00000000-0000-4000-9000-%s', lpad(i::text, 12, '0'))::uuid, 'social', 'social.rewrite', 'contract', case when i % 60 = 0 then 'suspended' else 'active' end
            from generate_series(1, {N}) i where i % 20 = 0;
          analyze;""")
        assert int(one("select count(*) from media_credit_ledger")) >= N * 100
        print(f"OK seeded {N} accounts, 100 brands, {one('select count(*) from media_credit_ledger')} ledger rows in {time.time() - t0:.1f}s")

        want = {i: reasons(i) for i in range(1, N + 1)}
        listed = [i for i in want if want[i]]
        totals = attention(50, 0)["totals"]
        expected = {
            "unused_units": sum(balance(i) for i in want if balance(i) > 0),   # internal 9000 and brands' 500 are not customer roots
            "unused_accounts": sum(1 for i in want if balance(i) > 0),
            "frozen": sum(1 for i in listed if "frozen" in want[i]), "overdrawn": sum(1 for i in listed if "overdrawn" in want[i]),
            "past_due": sum(1 for i in listed if "past_due" in want[i]), "suspended": sum(1 for i in listed if "suspended" in want[i]),
            "attention": len(listed),
        }
        assert totals == expected, (totals, expected)
        print(f"OK totals over every root account match an independent count: {totals}")

        seen = []
        for offset in range(0, expected["attention"] + 50, 50):
            page = attention(50, offset)
            assert len(page["rows"]) <= 50
            seen += page["rows"]
        assert [r["slug"] for r in seen] == [f"acct-{i:05d}" for i in sorted(listed)], "pages: every attention account once, in name order"
        for r in seen:
            i = int(r["slug"][5:])
            assert r["reasons"] == want[i] and r["balance"] == balance(i), r
            assert (r["frozen_since"] is not None) == ("frozen" in want[i]), r
        assert len(attention(1000, 0)["rows"]) == 200 and len(attention(0, 0)["rows"]) == 1 and attention(50, -5)["rows"] == attention(50, 0)["rows"]
        print(f"OK {len(seen)} attention rows over {-(-len(seen) // 50)} pages, each once with its reasons and balance; limit clamped to 1..200")

        brand = json.loads(one(f"set role service_role; select public.billing_account('{BRAND}');"))
        assert brand["organization_id"] == CUST and brand["slug"] == "customer", brand
        a = json.loads(one(f"set role service_role; select public.billing_account('{acct(600)}');"))
        assert a["balance"] == balance(600) and len(a["ledger"]) == 20 and a["hold"]["reason"] == "chargeback", a
        assert [c["status"] for c in a["contracts"]] == ["past_due"] and [g["state"] for g in a["grants"]] == ["suspended"], a
        assert len(a["payments"]) == 1 and a["payments"][0]["event_id"] == "cb-600"
        assert one(f"set role service_role; select public.billing_account('{uuid.uuid4()}') is null;") == "t"
        print("OK billing_account: a brand resolves to its root; ledger capped at 20; hold, contract, grants, payments; unknown id -> null")

        # 0130: an entry older than 30 days counts in the balance, not in the 30-day sums.
        query(f"insert into media_credit_ledger(organization_id, units, entry_type, idempotency_key, created_at) values ('{acct(1)}', 7, 'grant', 'seed-old-1', now() - interval '40 days');")
        query(LEDGER_UP.read_text(encoding="utf-8"))
        assert one("select has_function_privilege('anon', 'public.billing_ledger(text,text,integer,integer)', 'execute') or has_function_privilege('authenticated', 'public.billing_ledger(text,text,integer,integer)', 'execute')") == "f"
        bal = {i: balance(i) + (7 if i == 1 else 0) for i in range(1, N + 1)}
        led = ledger()
        roots_with_data = int(one(f"""select count(distinct o.id) from organizations o join (
            select organization_id id from media_credit_ledger union select organization_id from organization_product_subscriptions
            union select organization_id from organization_entitlements union select organization_id from payment_events) d on d.id = o.id
          where o.parent_organization_id is null"""))
        t = led["totals"]
        assert t["accounts"] == roots_with_data >= N + 1, (t, roots_with_data)
        assert t["unused_units"] == sum(b for b in bal.values() if b > 0) and t["unused_accounts"] == sum(1 for b in bal.values() if b > 0), t
        assert {k: t[k] for k in ("frozen", "overdrawn", "past_due", "suspended", "attention")} == {k: expected[k] for k in ("frozen", "overdrawn", "past_due", "suspended", "attention")}
        assert t["granted_30d"] == sum((100 if i % 3 == 0 else 0) + 50 for i in range(1, N + 1)) + 9000 + 0, t   # +7 is 40 days old; brands are not roots
        assert t["spent_30d"] == sum((150 if i % 7 == 0 else 0) + 50 for i in range(1, N + 1)), t
        assert led["matching"] == t["accounts"] and len(led["rows"]) == 50
        counts = {f: ledger(f)["matching"] for f in ("attention", "balance", "contract", "internal")}
        assert counts == {"attention": expected["attention"], "balance": sum(1 for b in bal.values() if b > 0) + 1,   # + the internal account's 9000
                          "contract": N // 10, "internal": 1}, counts
        assert ledger("all", "acct-0001")["matching"] == 10 and ledger("all", "%")["matching"] == 0 and ledger("all", "_")["matching"] == 0
        query(f"""insert into profiles(id, email) values ('00000000-0000-4000-b000-000000000005', 'Buyer.Five@Example.com');
          insert into organization_memberships(organization_id, user_id) values ('{acct(5)}', '00000000-0000-4000-b000-000000000005');
          update organization_product_subscriptions set source_ref = 'local:TX-777' where organization_id = '{acct(10)}';""")
        query(f"""insert into profiles(id, email) values ('00000000-0000-4000-b000-000000000006', 'brand.member@example.com');
          insert into organization_memberships(organization_id, user_id) values ('{BRAND}', '00000000-0000-4000-b000-000000000006');
          insert into media_credit_ledger(organization_id, units, entry_type, idempotency_key) values ('{CUST}', 1, 'grant', 'seed-cust-1');""")
        for q, slug in (("buyer.five@example", "acct-00005"), ("cb-600", "acct-00600"), ("tx-777", "acct-00010"), ("brand.member@", "customer")):
            got = ledger("all", q)
            assert got["matching"] == 1 and got["rows"][0]["slug"] == slug, (q, got["matching"], [r["slug"] for r in got["rows"]])
        seen = []
        for offset in range(0, counts["contract"] + 50, 50):
            seen += ledger("contract", None, 50, offset)["rows"]
        assert [r["slug"] for r in seen] == [f"acct-{i:05d}" for i in range(10, N + 1, 10)], "contract pages: every match once, in name order"
        row = next(r for r in ledger("all", "acct-00600")["rows"] if r["slug"] == "acct-00600")
        assert row["balance"] == bal[600] and row["reasons"] == want[600], row
        assert [(c["product_key"], c["plan_key"], c["status"]) for c in row["contracts"]] == [("social", "social_basic", "past_due")], row
        assert row["last_payment"]["kind"] == "chargeback" and row["next_period_end"] is None, row
        assert ledger("all", "acct-00001")["rows"][0]["granted_30d"] == 50 and ledger("all", "acct-00001")["rows"][0]["balance"] == 7
        expect_error = query("set role service_role; select public.billing_ledger('bogus', null, 50, 0);", succeeds=False)
        assert expect_error.returncode and "invalid_filter:bogus" in expect_error.stderr
        query(LEDGER_DOWN.read_text(encoding="utf-8"))
        assert one("select to_regprocedure('public.billing_ledger(text,text,integer,integer)') is null and to_regprocedure('public.billing_attention(integer,integer)') is not null") == "t"
        query(LEDGER_UP.read_text(encoding="utf-8"))
        # 0131: a second pack's order id lives only in its payment payload (the contract keeps the first order's ref).
        query(f"""insert into payment_events(provider, event_id, kind, organization_id, payload) values
          ('woo', 'woo-evt-555', 'credit_pack', '{acct(7)}', '{{"order_ref": "PO-999"}}'),
          ('woo', 'woo-evt-556', 'subscription_paid', '{acct(8)}', '{{"external_ref": "SUB-4242"}}');""")
        assert ledger("all", "po-999")["matching"] == 0
        src_0130 = one("select md5(prosrc) from pg_proc where proname = 'billing_ledger'")
        query(ORDER_UP.read_text(encoding="utf-8"))
        for q, slug in (("po-999", "acct-00007"), ("sub-4242", "acct-00008"), ("woo-evt-555", "acct-00007")):
            got = ledger("all", q)
            assert got["matching"] == 1 and got["rows"][0]["slug"] == slug, (q, got["matching"])
        query(ORDER_DOWN.read_text(encoding="utf-8"))
        assert one("select md5(prosrc) from pg_proc where proname = 'billing_ledger'") == src_0130
        assert one("select has_function_privilege('anon', 'public.billing_ledger(text,text,integer,integer)', 'execute')") == "f"
        query(ORDER_UP.read_text(encoding="utf-8"))
        print("OK 0131: search finds a payment's order_ref / external_ref; down restores 0130's body byte for byte")
        print(f"OK 0130 billing_ledger: totals {t['accounts']} accounts agree with 0127; 30-day sums skip older entries; filters {counts}; search by name, member email, payment id, contract ref (wildcards escaped); pages; row detail; down drops only it")

        for label, sql in (("billing_attention(50, 0)", "select public.billing_attention(50, 0)"),
                           ("billing_ledger('all', null, 50, 0)", "select public.billing_ledger('all', null, 50, 0)"),
                           (f"billing_account('{acct(600)}')", f"select public.billing_account('{acct(600)}')")):
            out = query(f"set role service_role; explain (analyze, format json) {sql};").stdout
            plan = json.loads(out[out.index("["):])
            print(f"OK {label}: {plan[0]['Execution Time']:.0f} ms execution")

        before = attention(50, 0)["totals"]
        query(DROP_UP.read_text(encoding="utf-8"))
        assert one("select to_regprocedure('public.billing_overview(integer,integer)') is null") == "t"
        assert attention(50, 0)["totals"] == before
        query(DROP_DOWN.read_text(encoding="utf-8"))
        assert one("select md5(prosrc) from pg_proc where proname = 'billing_overview'") == overview_src
        assert one("select has_function_privilege('service_role', 'public.billing_overview(integer,integer)', 'execute')") == "t"
        assert one("select has_function_privilege('anon', 'public.billing_overview(integer,integer)', 'execute')") == "f"
        query(DROP_UP.read_text(encoding="utf-8"))
        assert one("select to_regprocedure('public.billing_overview(integer,integer)') is null") == "t"
        print("OK 0129 up, down, up: billing_overview dropped, 0127's reads unchanged; down restores 0120's text and grants")
        print("PASS 0127 + 0129 + 0130 + 0131")
    finally:
        command(["docker", "rm", "-f", NAME], succeeds=False)


if __name__ == "__main__":
    main()
