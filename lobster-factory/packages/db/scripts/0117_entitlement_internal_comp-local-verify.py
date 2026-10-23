#!/usr/bin/env python3
"""0117 on one disposable local Postgres (no published port): idempotent top-up, STRICT internal account,
service_role-only execute, a second live comp row refused, down then up again. Touches no production database."""
from pathlib import Path
import json
import os
import subprocess
import time
import uuid

DB = Path(__file__).resolve().parents[1]
NAME = "adr017-internal-comp-verify-" + uuid.uuid4().hex[:10]
UP = DB / "migrations/0117_entitlement_internal_comp.sql"
DOWN = DB / "migrations/0117_entitlement_internal_comp.down.sql"
INTERNAL = "39ad4149-5044-4077-8d9a-b6b916de0e21"
FEATURES = json.dumps([{"product_key": "tarot", "feature_key": "tarot.image"}, {"product_key": "social", "feature_key": "social.rewrite"}])


def command(args, sql=None, succeeds=True):
    result = subprocess.run(args, input=sql, text=True, encoding="utf-8", capture_output=True)
    if succeeds and result.returncode:
        raise RuntimeError(result.stderr + result.stdout)
    return result


def query(sql, succeeds=True):
    return command(["docker", "exec", "-i", NAME, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-At"], sql, succeeds)


def file(path):
    return query(path.read_text(encoding="utf-8"))


def expect_error(sql, text):
    result = query(sql, succeeds=False)
    assert result.returncode and text in result.stderr, result.stdout + result.stderr


def top_up():
    return query(f"set role service_role; select public.entitlement_ensure_internal_comp('{FEATURES}'::jsonb);").stdout.strip().splitlines()[-1]


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
        file(DB / "migrations/0001_core.sql")
        query("""create function public.user_has_org_membership(p_org_id uuid) returns boolean
          language sql stable security definer set search_path=public,pg_temp as $$ select false $$;""")
        for prefix in ["0062", "0063", "0066", "0077", "0110"]:
            matches = [p for p in (DB / "migrations").glob(prefix + "_*.sql") if not p.name.endswith(".down.sql")]
            assert len(matches) == 1, prefix
            file(matches[0])
        query(f"insert into organizations(id,type,name,slug) values ('{INTERNAL}','client','AwareWave Ops','awarewave-ops');")
        query(f"update organizations set kind='internal' where id='{INTERNAL}';")
        file(UP)

        assert top_up() == "2"
        assert top_up() == "0", "a rerun must add nothing"
        assert query(f"select count(*) from organization_entitlements where organization_id='{INTERNAL}' and source='comp' and status='active'").stdout.strip() == "2"
        expect_error(f"insert into organization_entitlements(organization_id,product_key,feature_key,source,source_ref) values ('{INTERNAL}','tarot','tarot.image','comp','internal');", "organization_entitlements_comp_live_uniq")
        # comp rows from any other source (a customer gift, a plan change in flight) are not bound by the index
        query(f"insert into organization_entitlements(organization_id,product_key,feature_key,source,source_ref) values ('{INTERNAL}','tarot','tarot.image','comp','gift-1'),('{INTERNAL}','tarot','tarot.image','comp','gift-2');")
        query("update organization_entitlements set status='expired' where source_ref like 'gift-%';")
        # an expired comp row frees the slot; the next top-up restores a live one
        query(f"update organization_entitlements set status='expired' where organization_id='{INTERNAL}' and feature_key='tarot.image';")
        assert top_up() == "1"
        # contract rows are not constrained by the comp index
        query(f"insert into organization_entitlements(organization_id,product_key,feature_key,source) values ('{INTERNAL}','tarot','tarot.image','contract'),('{INTERNAL}','tarot','tarot.image','contract');")
        for role in ["anon", "authenticated"]:
            expect_error(f"set role {role}; select public.entitlement_ensure_internal_comp('[]'::jsonb);", "permission denied")
        expect_error("set role service_role; select public.entitlement_ensure_internal_comp('{}'::jsonb);", "p_features must be an array")
        query("insert into organizations(id,type,name,slug,kind) values (gen_random_uuid(),'client','Second internal','second-internal','internal');")
        expect_error(f"set role service_role; select public.entitlement_ensure_internal_comp('{FEATURES}'::jsonb);", "more than one row")
        query("delete from organizations where slug='second-internal'; update organizations set kind='customer' where id='" + INTERNAL + "';")
        expect_error(f"set role service_role; select public.entitlement_ensure_internal_comp('{FEATURES}'::jsonb);", "no rows")
        query(f"update organizations set kind='internal' where id='{INTERNAL}';")

        query("update organization_entitlements set status='expired' where source='contract';")
        file(DOWN)
        assert query("select to_regprocedure('public.entitlement_ensure_internal_comp(jsonb)') is null and to_regclass('public.organization_entitlements_comp_live_uniq') is null").stdout.strip() == "t"
        file(UP)
        assert top_up() == "0"
        print("0117 local verify: PASS (top-up 2 then 0, unique live comp, expired slot refilled, service_role only, STRICT internal, down/up)")
    finally:
        command(["docker", "rm", "-f", NAME], succeeds=False)


if __name__ == "__main__":
    main()
