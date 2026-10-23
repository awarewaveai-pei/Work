#!/usr/bin/env python3
"""0120 on one disposable local Postgres (no published port). Touches no production database.
Bootstraps 0001..0118 like the 0118 verify, then: down before any event restores the 0066/0110 functions; up again; the
step 4 card's payment state machine end to end (trial -> paid in place, comp superseded, replay no-op, reused id
refused, renewal never shortens, plan change, cancel to period end + grace, pack once per order, refund only the unused
part and only once, chargeback suspends + freezes until a local review clears it, refused events leave nothing), one
live grant per feature, audit rows immutable, service_role only, down refused once events exist.
    python lobster-factory/packages/db/scripts/0120_payment_events-local-verify.py"""
from pathlib import Path
import json
import os
import subprocess
import time
import uuid

DB = Path(__file__).resolve().parents[1]
NAME = "adr017-payments-verify-" + uuid.uuid4().hex[:10]
UP = DB / "migrations/0120_payment_events.sql"
DOWN = DB / "migrations/0120_payment_events.down.sql"
INTERNAL, EDD, SOULFUL = "39ad4149-5044-4077-8d9a-b6b916de0e21", "ecf4e311-4f38-4288-9396-e70fd7697aca", "2bf60452-3d4d-47c2-9970-b9046ed1a35a"
CUST, BRAND = "00000000-0000-4000-8000-0000000000c1", "00000000-0000-4000-8000-0000000000b1"
TRIAL = "00000000-0000-4000-8000-00000000c0a1"


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


def expect_error(sql, text):
    result = query(sql, succeeds=False)
    assert result.returncode and text in result.stderr, result.stdout + result.stderr


def migration(prefix):
    matches = [p for p in (DB / "migrations").glob(prefix + "_*.sql") if not p.name.endswith(".down.sql")]
    assert len(matches) == 1, prefix
    query(matches[0].read_text(encoding="utf-8"))


def pay_sql(event_id, payload, provider="local"):
    body = json.dumps(payload).replace("'", "''")
    return f"set role service_role; select public.billing_apply_payment_event('{provider}', '{event_id}', '{body}'::jsonb);"


def pay(event_id, payload, provider="local"):
    return json.loads(one(pay_sql(event_id, payload, provider)))


def refused(event_id, payload, code, provider="local"):
    before = one("select count(*) from payment_events")
    expect_error(pay_sql(event_id, payload, provider), "payment_rejected:" + code)
    assert one("select count(*) from payment_events") == before, f"{code}: a refused event left its inbox row"


def live(feature, org=CUST):
    """The live rows for one feature as source:source_ref, oldest first ('' = none)."""
    return one(f"""select coalesce(string_agg(source || ':' || coalesce(source_ref, ''), ',' order by created_at), '') from organization_entitlements
      where organization_id = '{org}' and feature_key = '{feature}' and status = 'active' and (ends_at is null or ends_at > now())""")


def balance(org=CUST):
    return int(one(f"select coalesce(sum(units), 0) from media_credit_ledger where organization_id = '{org}'"))


def spendable(org=CUST):
    return int(float(one(f"set role service_role; select public.entitlement_credit_balance('{org}');")))


def debit(units, key):
    return one(f"set role service_role; select allowed from public.media_credit_reserve('{CUST}', {units}, '{key}', 'test', 'x');")


def at(days):
    return one(f"""select to_char((now() + interval '{days} days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')""")


def main():
    command(["docker", "run", "-d", "--name", NAME, "--label", "awarewave.test=adr017", "-e", "POSTGRES_PASSWORD=verify", os.environ.get("PG_IMAGE", "postgres:15.8-alpine")])
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
        old_reserve = one("select md5(prosrc) from pg_proc where proname = 'media_credit_reserve'")
        old_balance = one("select md5(prosrc) from pg_proc where proname = 'entitlement_credit_balance'")

        query(UP.read_text(encoding="utf-8"))
        assert one("select md5(prosrc) from pg_proc where proname = 'media_credit_reserve'") != old_reserve
        query(DOWN.read_text(encoding="utf-8"))
        assert one("select md5(prosrc) from pg_proc where proname = 'media_credit_reserve'") == old_reserve
        assert one("select md5(prosrc) from pg_proc where proname = 'entitlement_credit_balance'") == old_balance
        assert one("select to_regclass('public.payment_events') is null and to_regprocedure('public.billing_apply_payment_event(text,text,jsonb)') is null") == "t"
        query(UP.read_text(encoding="utf-8"))
        print("OK up, down, up: down restores 0066 reserve and 0110 balance byte for byte")

        assert one("""select count(*) from information_schema.role_table_grants where table_name in ('payment_events','credit_wallet_holds')
          and grantee in ('anon','authenticated','PUBLIC')""") == "0"
        for fn in ["billing_apply_payment_event(text,text,jsonb)", "billing_overview(integer,integer)"]:
            assert one(f"select has_function_privilege('anon', 'public.{fn}', 'execute') or has_function_privilege('authenticated', 'public.{fn}', 'execute')") == "f", fn
        assert one("select count(*) from pg_policies where tablename in ('payment_events','credit_wallet_holds') and roles <> '{service_role}'") == "0"
        print("OK service_role only: no anon/authenticated grants, function execute or policies")

        query(f"""insert into plans(plan_key, product_key, kind, features, limits) values
          ('social_trial','social','base','["social.rewrite","social.dispatch"]','{{}}'),
          ('social_pro','social','base','["social.rewrite","social.dispatch","social.ads"]','{{"social.rewrite":{{"posts":100}}}}'),
          ('social_basic','social','base','["social.rewrite"]','{{}}'),
          ('social_ads_addon','social','addon','["social.ads"]','{{}}'),
          ('social_extra_addon','social','addon','["social.extra"]','{{}}'),
          ('social_bad_limits','social','base','["social.rewrite"]','{{"social.rewrite":null}}');
          insert into organization_product_subscriptions(id, organization_id, product_key, plan_key, status, started_at, trial_started_at, current_period_end)
            values ('{TRIAL}','{CUST}','social','social_trial','trial', now() - interval '3 days', now() - interval '3 days', now() + interval '11 days');
          insert into organization_entitlements(organization_id, product_key, feature_key, source, source_ref, starts_at, ends_at) values
            ('{CUST}','social','social.rewrite','contract','{TRIAL}', now() - interval '3 days', now() + interval '18 days'),
            ('{CUST}','social','social.dispatch','contract','{TRIAL}', now() - interval '3 days', now() + interval '18 days'),
            ('{CUST}','social','social.ads','comp','staff gift', now() - interval '3 days', null);""")

        paid = {"kind": "subscription_paid", "organization_id": CUST, "plan_key": "social_pro", "period_end": at(30), "external_ref": "TX-1"}
        r = pay("bank-1", paid)
        assert r["ok"] and r["contract"] == TRIAL and r["entitlements"] == 3, r
        assert one(f"select status || ':' || plan_key || ':' || source_ref from organization_product_subscriptions where id = '{TRIAL}'") == "active:social_pro:local:TX-1"
        assert one("select count(*) from organization_product_subscriptions") == "1"
        for f in ["social.rewrite", "social.dispatch", "social.ads"]:
            assert live(f) == f"contract:{TRIAL}", (f, live(f))
        assert one("select status from organization_entitlements where source = 'comp'") == "expired"
        assert one(f"""select bool_and(ends_at = (select current_period_end from organization_product_subscriptions where id = '{TRIAL}') + interval '7 days')
          from organization_entitlements where source_ref = '{TRIAL}' and status = 'active'""") == "t"
        assert one(f"select limits->>'posts' from organization_entitlements where source_ref = '{TRIAL}' and status = 'active' and feature_key = 'social.rewrite'") == "100"
        print("OK one paid event yields one contract row and one entitlement set (trial row paid in place, older comp ended)")

        rows = one("select count(*) from organization_entitlements")
        r = pay("bank-1", paid)
        assert r["replayed"] is True and one("select count(*) from organization_entitlements") == rows and one("select count(*) from payment_events") == "1", r
        refused("bank-1", {**paid, "period_end": at(40)}, "event_id_reused")
        print("OK replaying the same event id is a no-op via the inbox; the same id with another payment is refused")

        ids = one(f"select string_agg(id::text, ',' order by id) from organization_entitlements where source_ref = '{TRIAL}' and status = 'active'")
        pay("bank-2", {**paid, "period_end": at(60)})
        end60 = one(f"select current_period_end from organization_product_subscriptions where id = '{TRIAL}'")
        pay("bank-3", {**paid, "period_end": at(45)})
        assert one(f"select current_period_end from organization_product_subscriptions where id = '{TRIAL}'") == end60
        assert one(f"select string_agg(id::text, ',' order by id) from organization_entitlements where source_ref = '{TRIAL}' and status = 'active'") == ids
        print("OK renewal extends the same rows; a late older event never shortens the period")

        r = pay("bank-4", {**paid, "plan_key": "social_basic"})
        assert r["entitlements"] == 1 and live("social.rewrite") == f"contract:{TRIAL}" and live("social.ads") == "" and live("social.dispatch") == "", r
        assert one(f"select count(*) from organization_entitlements where source_ref = '{TRIAL}' and status = 'expired'") == "5"   # 2 trial + 3 pro
        print("OK a plan change ends the old rows now and starts the new plan's rows")

        rows = one("select count(*) from organization_entitlements")
        r = pay("bank-5", {"kind": "subscription_canceled", "organization_id": CUST, "plan_key": "social_basic"})
        assert r["entitlements"] == 1 and one("select count(*) from organization_entitlements") == rows, r
        # the contract stays active (the launcher opens active/trial, as can() still grants); the daily sweep ends it
        assert one(f"select status from organization_product_subscriptions where id = '{TRIAL}'") == "active"
        assert live("social.rewrite") == f"contract:{TRIAL}"
        assert one(f"""select ends_at = (select current_period_end from organization_product_subscriptions where id = '{TRIAL}') + interval '7 days'
          from organization_entitlements where source_ref = '{TRIAL}' and status = 'active'""") == "t"
        assert pay("bank-6", {"kind": "subscription_canceled", "organization_id": CUST, "plan_key": "social_basic"})["entitlements"] == 1
        print("OK a cancel keeps access (and the contract open) until period end plus grace and adds no rows; a second cancel changes nothing")

        r = pay("bank-7", {"kind": "subscription_paid", "organization_id": CUST, "plan_key": "social_pro", "period_end": at(30)})
        assert r["contract"] == TRIAL and r["entitlements"] == 3, r
        assert live("social.rewrite") == f"contract:{TRIAL}", live("social.rewrite")
        r = pay("bank-8", {"kind": "refund", "target": "subscription", "organization_id": CUST, "plan_key": "social_pro"})
        assert r["entitlements_ended"] == 3 and live("social.rewrite") == "" and live("social.ads") == "", r
        assert one(f"select status from organization_product_subscriptions where id = '{TRIAL}'") == "canceled"
        print("OK paying again before a cancel takes effect renews the same contract; a subscription refund cancels it and ends access now")

        pack = {"kind": "credit_pack", "organization_id": CUST, "units": 100, "order_ref": "O1"}
        assert pay("pack-1", pack)["units"] == 100 and balance() == 100
        assert pay("pack-1-again", pack).get("already_granted") is True and balance() == 100
        print("OK a credit pack grants once per order id")

        assert debit(30, "debit-key-0001") == "t" and balance() == 70
        r = pay("refund-1", {"kind": "refund", "target": "credit_pack", "organization_id": CUST, "order_ref": "O1"})
        assert r["refunded_units"] == 70 and r["granted_units"] == 100 and balance() == 0, r
        pay("pack-2", {**pack, "units": 200, "order_ref": "O2"})
        assert pay("refund-1-again", {"kind": "refund", "target": "credit_pack", "organization_id": CUST, "order_ref": "O1"}).get("already_refunded") is True
        assert balance() == 200
        pay("pack-3", {**pack, "units": 50, "order_ref": "O3"})
        assert pay("refund-3", {"kind": "refund", "target": "credit_pack", "organization_id": CUST, "order_ref": "O3"})["refunded_units"] == 50 and balance() == 200
        refused("refund-x", {"kind": "refund", "target": "credit_pack", "organization_id": CUST, "order_ref": "NOPE"}, "unknown_order")
        # first in, first out (Codex 2026-10-23): with A then B and A's worth spent, refunding A returns nothing
        # and leaves B's credits; refunding B returns B
        pay("pack-a", {**pack, "units": 100, "order_ref": "FA"})
        pay("pack-b", {**pack, "units": 100, "order_ref": "FB"})
        assert debit(300, "debit-key-fifo") == "t" and balance() == 100
        assert pay("refund-a", {"kind": "refund", "target": "credit_pack", "organization_id": CUST, "order_ref": "FA"})["refunded_units"] == 0 and balance() == 100
        assert pay("refund-b", {"kind": "refund", "target": "credit_pack", "organization_id": CUST, "order_ref": "FB"})["refunded_units"] == 100 and balance() == 0
        pay("pack-c", {**pack, "units": 200, "order_ref": "FC"})
        print("OK a refund of a credit pack reverses only the unused part, once per order")

        r = pay("bank-9", {"kind": "subscription_paid", "organization_id": CUST, "plan_key": "social_pro", "period_end": at(30)})
        sub = r["contract"]
        refused("addon-1", {"kind": "subscription_paid", "organization_id": CUST, "plan_key": "social_ads_addon", "period_end": at(30)}, "feature_in_another_contract")
        addon = pay("addon-2", {"kind": "subscription_paid", "organization_id": CUST, "plan_key": "social_extra_addon", "period_end": at(30)})
        assert addon["contract"] != sub and addon["entitlements"] == 1 and live("social.ads") == f"contract:{sub}", addon
        print("OK an add-on may not take a feature another live contract grants; a disjoint add-on is its own contract")

        # a duplicate the payment path did not make (two comp rows elsewhere) must not block a chargeback's hold
        query(f"""insert into organization_entitlements(organization_id, product_key, feature_key, source, source_ref) values
          ('{CUST}','hci','hci.report','comp','dup-1'), ('{CUST}','hci','hci.report','comp','dup-2');""")
        r = pay("cb-1", {"kind": "chargeback", "organization_id": CUST, "ref": "O2"})
        assert r["entitlements_suspended"] == 4 and r["wallet_frozen"] is True, r
        assert one(f"select count(*) from organization_entitlements where source_ref = '{sub}' and status = 'suspended'") == "3"
        assert one(f"select string_agg(status, ',' order by status) from organization_product_subscriptions where id in ('{sub}', '{addon['contract']}')") == "past_due,past_due"
        assert live("social.rewrite") == "" and spendable() == 0 and balance() == 200 and debit(1, "debit-key-0002") == "f"
        refused("pack-4", {**pack, "order_ref": "O4"}, "account_frozen")
        refused("bank-10", {"kind": "subscription_paid", "organization_id": CUST, "plan_key": "social_pro", "period_end": at(60)}, "account_frozen")
        refused("cb-clear-woo", {"kind": "chargeback_cleared", "organization_id": CUST}, "manual_review_only", provider="woo")
        r = pay("cb-clear", {"kind": "chargeback_cleared", "organization_id": CUST})
        assert r["entitlements_restored"] == 4 and live("social.rewrite") == f"contract:{sub}" and spendable() == 200 and debit(1, "debit-key-0003") == "t", r
        assert one(f"select string_agg(status, ',') from organization_product_subscriptions where id in ('{sub}', '{addon['contract']}')") == "active,active"
        query("update organization_entitlements set status = 'expired' where source_ref in ('dup-1', 'dup-2')")
        refused("cb-clear-2", {"kind": "chargeback_cleared", "organization_id": CUST}, "no_open_hold")
        print("OK a chargeback suspends entitlements, marks the contracts past_due and freezes the wallet until a local review clears it")

        refused("brand-1", {**pack, "organization_id": BRAND}, "not_a_customer_billing_account")
        refused("internal-1", {**pack, "organization_id": INTERNAL}, "not_a_customer_billing_account")
        refused("edd-1", {"kind": "subscription_paid", "organization_id": EDD, "plan_key": "social_pro", "period_end": at(30)}, "account_covers_all_features")
        assert pay("edd-2", {**pack, "organization_id": EDD, "order_ref": "E1"})["units"] == 100
        refused("bad-1", {"kind": "subscription_paid", "organization_id": CUST, "plan_key": "nope", "period_end": at(30)}, "unknown_plan")
        refused("bad-2", {"kind": "subscription_paid", "organization_id": CUST, "plan_key": "social_pro", "period_end": at(-1)}, "invalid_period_end")
        refused("bad-3", {"kind": "subscription_paid", "organization_id": CUST, "plan_key": "social_pro", "period_end": "soon"}, "invalid_period_end")
        refused("bad-3b", {"kind": "subscription_paid", "organization_id": CUST, "plan_key": "social_pro", "period_end": at(30)[:-1]}, "invalid_period_end")
        refused("bad-3c", {"kind": "subscription_paid", "organization_id": CUST, "plan_key": "social_bad_limits", "period_end": at(30)}, "invalid_plan_limits")
        refused("bad-4", {**pack, "units": 0, "order_ref": "Z"}, "invalid_units")
        refused("bad-5", {**pack, "organization_id": "not-a-uuid"}, "invalid_organization")
        refused("bad-6", {"kind": "teleport", "organization_id": CUST}, "unknown_kind")
        refused("bad-7", pack, "unknown_provider", provider="stripe")
        refused("bad-8", {"kind": "refund", "target": "everything", "organization_id": CUST}, "invalid_refund_target")
        print("OK refused events (brand, internal, all-features subscription, bad plan/limits/period/units/org/kind/provider) leave nothing")

        assert one("""select count(*) from (select organization_id, product_key, feature_key from organization_entitlements
          where status = 'active' and (ends_at is null or ends_at > now()) and source_ref not like 'all-features:%'
          group by 1, 2, 3 having count(*) > 1) d""") == "0"
        print("OK one live grant per account x product x feature after every event")

        expect_error("delete from payment_events", "never deleted")
        expect_error("update payment_events set payload = '{}'::jsonb", "written once")
        expect_error("update credit_wallet_holds set reason = 'x'", "cleared once")
        expect_error("delete from credit_wallet_holds", "never deleted")
        expect_error("set role service_role; truncate payment_events cascade", "permission denied")
        expect_error("set role service_role; truncate credit_wallet_holds", "permission denied")
        print("OK payment_events and wallet holds are immutable audit rows")

        overview = json.loads(one("set role service_role; select public.billing_overview();"))
        cust = next(a for a in overview if a["organization_id"] == CUST)
        assert cust["balance"] == 199 and cust["hold"] is None and len(cust["contracts"]) == 3 and len(cust["payments"]) == 10, cust
        assert any(g["source"] == "contract" and g["state"] == "active" and g["features"] == 3 for g in cust["grants"]), cust["grants"]
        assert len(cust["ledger"]) == 12 and cust["ledger"][0]["entry_type"] == "debit", cust["ledger"]
        assert {a["slug"] for a in overview} >= {"customer", "edd-research"} and "brand" not in {a["slug"] for a in overview}
        print("OK billing_overview: root accounts with contracts, grouped grants, ledger sum, last ledger rows and events")

        expect_error(DOWN.read_text(encoding="utf-8"), "rolled forward, not down")
        assert one("select to_regclass('public.payment_events') is not null") == "t"
        print("OK down is refused once payment events exist")
        print("PASS 0120")
    finally:
        command(["docker", "rm", "-f", NAME], succeeds=False)


if __name__ == "__main__":
    main()
