#!/usr/bin/env python3
"""ADR017: real SQL/roles/down-up in one disposable local Postgres; no published port."""
from pathlib import Path
import json
import os
import re
import subprocess
import time
import uuid

DB = Path(__file__).resolve().parents[1]
REPO = DB.parents[2]
NAME = "adr017-entitlements-verify-" + uuid.uuid4().hex[:10]
UP = DB / "migrations/0110_plans_entitlements.sql"
DOWN = DB / "migrations/0110_plans_entitlements.down.sql"


def command(args, sql=None, succeeds=True):
    result = subprocess.run(args, input=sql, text=True, encoding="utf-8", capture_output=True)
    if succeeds and result.returncode:
        raise RuntimeError(result.stderr + result.stdout)
    return result


def query(sql, succeeds=True):
    return command(["docker", "exec", "-i", NAME, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-At"], sql, succeeds)


def file(path, succeeds=True):
    return query(path.read_text(encoding="utf-8"), succeeds)


def expect_error(sql, text):
    result = query(sql, succeeds=False)
    assert result.returncode and text in result.stderr, result.stdout + result.stderr


def snapshot():
    return query("""select md5(pg_get_functiondef('public.portal_complete_signup(uuid,uuid,text,text,text,text)'::regprocedure));
      select policyname || ':' || roles::text || ':' || cmd || ':' || coalesce(qual,'') || ':' || coalesce(with_check,'')
      from pg_policies where schemaname='public' and tablename='organization_product_subscriptions' order by policyname;""").stdout


def main():
    # Three product CHECKs must track the registry exactly (including future products).
    registry = (REPO / "lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts").read_text(encoding="utf-8")
    keys = set(re.findall(r'^  \{ key: "([a-z][a-z0-9_-]*)"', registry, re.M))
    checks = re.findall(r"product_key in \(([^)]+)\)", UP.read_text(encoding="utf-8"))
    assert len(checks) == 3 and keys and all(set(re.findall(r"'([^']+)'", c)) == keys for c in checks)
    command(["docker", "run", "-d", "--name", NAME, "--label", "awarewave.test=adr017", "-e", "POSTGRES_PASSWORD=verify", os.environ.get("PG_IMAGE", "postgres:15.8-alpine")])
    try:
        for attempt in range(60):
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
          create function auth.uid() returns uuid language sql stable as $$
            select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
          $$;
        """)
        file(DB / "migrations/0001_core.sql")
        query("""create function public.user_has_org_membership(p_org_id uuid) returns boolean
          language sql stable security definer set search_path=public,pg_temp as $$
          select exists (select 1 from organization_memberships where organization_id=p_org_id and user_id=auth.uid() and status='active');
          $$;""")
        for name in ["0062_organization_product_subscriptions.sql", "0063_portal_complete_signup.sql", "0066_media_billing.sql", "0077_organization_hierarchy.sql"]:
            matches = list((DB / "migrations").glob(name[:4] + "_*.sql"))
            matches = [p for p in matches if not p.name.endswith(".down.sql")]
            assert len(matches) == 1
            file(matches[0])
        baseline = snapshot()
        query("""insert into organizations(id,type,name,slug) values
          ('39ad4149-5044-4077-8d9a-b6b916de0e21','client','AwareWave Ops','awarewave-ops'),
          ('00000000-0000-0000-0000-000000000001','client','Fixture A','fixture-a');
          insert into organization_product_subscriptions(organization_id,product_key,status)
          values ('00000000-0000-0000-0000-000000000001','cognitive','active');""")
        failed = file(UP, succeeds=False)
        assert failed.returncode and "explicit verified plan mapping" in failed.stderr
        assert query("select to_regclass('public.plans') is null").stdout.strip() == "t"
        query("delete from organization_product_subscriptions;")
        file(UP)
        assert query("select kind from organizations where slug='awarewave-ops'").stdout.strip() == "internal"
        assert query("select count(*) from pg_policies where schemaname='public' and tablename in ('plans','organization_entitlements','organization_product_subscriptions') and roles <> '{service_role}'").stdout.strip() == "0"
        assert query("select count(*) from pg_policies where schemaname='public' and tablename in ('plans','organization_entitlements','organization_product_subscriptions')").stdout.strip() == "3"
        # Down restores actual 0063 function and 0062 policies, then up recreates the schema.
        file(DOWN)
        assert snapshot() == baseline, "down did not restore 0062 policies / 0063 function"
        assert query("select to_regclass('public.plans') is null and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='organizations' and column_name='kind')").stdout.strip() == "t"
        file(UP)
        for role in ["anon", "authenticated"]:
            for table in ["plans", "organization_entitlements", "organization_product_subscriptions"]:
                for statement in [f"select * from {table}", f"insert into {table} default values", f"update {table} set product_key='social'", f"delete from {table}"]:
                    expect_error(f"set role {role}; {statement};", "permission denied")
            for rpc in ["entitlement_credit_balance('00000000-0000-0000-0000-000000000001')", "portal_complete_signup(gen_random_uuid(),gen_random_uuid(),'Denied','denied@example.test','social')"]:
                expect_error(f"set role {role}; select {rpc}", "permission denied")
        print("ENTITLEMENTS_0110_SCHEMA_ACCESS_DOWN_UP_OK")
        expect_error("set role service_role; select portal_complete_signup('00000000-0000-0000-0000-000000000002',gen_random_uuid(),'Missing plan','missing@example.test','social');", "trial plan is not configured")
        assert query("select count(*) from organizations where id='00000000-0000-0000-0000-000000000002'").stdout.strip() == "0"
        query("""set role service_role;
          insert into plans(plan_key,product_key,kind,features,limits) values
            ('social_trial','social','base','["write","schedule"]','{"write":{"max_runs":10}}'),
            ('social_paid','social','base','["write","schedule"]','{}');
          select portal_complete_signup('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','Trial','trial@example.test','social','rate-hash');
          do $$ declare s organization_product_subscriptions%rowtype; begin
            select * into strict s from organization_product_subscriptions where organization_id='00000000-0000-0000-0000-000000000003';
            assert s.status='trial' and s.plan_key='social_trial' and s.current_period_end=s.started_at+interval '14 days' and s.trial_started_at=s.started_at;
            assert (select count(*) from organization_entitlements where organization_id=s.organization_id and source='contract' and source_ref=s.id::text and starts_at=s.started_at and ends_at=s.current_period_end+interval '7 days')=2;
            assert (select limits from organization_entitlements where organization_id=s.organization_id and feature_key='write')='{"max_runs":10}'::jsonb;
          end $$;
        """)
        # Failure after organization insertion must roll back all signup writes.
        expect_error("set role service_role; select portal_complete_signup('00000000-0000-0000-0000-000000000005',gen_random_uuid(),'Atomic','trial@example.test','social');", "duplicate key")
        assert query("select count(*) from organizations where id='00000000-0000-0000-0000-000000000005'").stdout.strip() == "0"
        query("set role service_role; update organization_product_subscriptions set status='active',plan_key='social_paid' where organization_id='00000000-0000-0000-0000-000000000003';")
        expect_error("set role service_role; update organization_product_subscriptions set status='trial' where organization_id='00000000-0000-0000-0000-000000000003';", "trial may not be restarted")
        expect_error("set role service_role; update organization_product_subscriptions set trial_started_at=null;", "trial identity and start are immutable")
        expect_error("set role service_role; delete from organization_product_subscriptions;", "trial history must be retained")
        query("set role service_role; update organization_product_subscriptions set status='canceled';")
        expect_error("set role service_role; insert into organization_product_subscriptions(organization_id,product_key,plan_key,status) values('00000000-0000-0000-0000-000000000003','social','social_trial','trial');", "org_product_subs_trial_history_uniq")
        print("ENTITLEMENTS_0110_TRIAL_ATOMIC_ONCE_OK")
        query("""set role service_role;
          insert into media_credit_ledger(organization_id,units,entry_type,idempotency_key)
            select '00000000-0000-0000-0000-000000000003',1,'grant','adr017-fixture-'||i from generate_series(1,1005) i;
          do $$ begin
            assert entitlement_credit_balance('00000000-0000-0000-0000-000000000003')=1005;
            assert entitlement_credit_balance('00000000-0000-0000-0000-000000000001')=0;
          end $$;
          insert into organization_entitlements(organization_id,product_key,feature_key,source,starts_at,ends_at,status)
            select '00000000-0000-0000-0000-000000000003','social','expired-'||i,'comp',now()-interval '2 days',now()-interval '1 day',
              case when i%2=0 then 'active' else 'suspended' end from generate_series(1,1005) i;
          do $$ declare affected integer; begin
            update organization_entitlements set status='expired' where status in ('active','suspended') and ends_at<=now();
            get diagnostics affected = row_count;
            assert affected=1005;
            assert (select count(*) from organization_entitlements where status='active')=2;
          end $$;
        """)
        print("ENTITLEMENTS_0110_BALANCE_EXPIRY_1005_OK")
        # Each table independently prevents destructive rollback. Savepoints/rollback keep fixtures local.
        down = DOWN.read_text(encoding="utf-8")
        for table in ["plans", "organization_entitlements", "organization_product_subscriptions"]:
            # Transactional deletes can remove trial rows only after the test explicitly disables its trigger.
            prefix = "begin; alter table organization_product_subscriptions disable trigger org_product_subs_preserve_trial; "
            if table == "plans":
                prefix += "delete from organization_entitlements; delete from organization_product_subscriptions; "
            elif table == "organization_entitlements":
                prefix += "delete from organization_product_subscriptions; delete from plans; "
            else:
                # A subscription requires a plan; remove the fixture plan only inside this transaction after dropping its FK.
                prefix += "delete from organization_entitlements; alter table organization_product_subscriptions drop constraint org_product_subs_plan_fk; delete from plans; "
            result = query(prefix + down, succeeds=False)
            assert result.returncode and "tables not empty: forward-fix only" in result.stderr, result.stderr
        print("ENTITLEMENTS_0110_DOWN_GUARD_EACH_TABLE_OK")
        print(json.dumps({"result":"PASS","registry_keys":len(keys),"postgres":"local disposable","production_touched":False}))
    finally:
        command(["docker", "rm", "-f", NAME], succeeds=False)


if __name__ == "__main__":
    main()
