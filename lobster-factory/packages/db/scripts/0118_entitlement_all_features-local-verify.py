#!/usr/bin/env python3
"""0118 on one disposable local Postgres (no published port): seed refuses a missing account atomically, top-up for
every all-features account is idempotent, only rows it owns are unique, removing coverage stops the top-up,
service_role only, down restores 0117, up again. Touches no production database."""
from pathlib import Path
import json
import os
import subprocess
import time
import uuid

DB = Path(__file__).resolve().parents[1]
NAME = "adr017-all-features-verify-" + uuid.uuid4().hex[:10]
UP = DB / "migrations/0118_entitlement_all_features.sql"
DOWN = DB / "migrations/0118_entitlement_all_features.down.sql"
INTERNAL, EDD, SOULFUL = "39ad4149-5044-4077-8d9a-b6b916de0e21", "ecf4e311-4f38-4288-9396-e70fd7697aca", "2bf60452-3d4d-47c2-9970-b9046ed1a35a"
FEATURES = json.dumps([{"product_key": "tarot", "feature_key": "tarot.image"}, {"product_key": "social", "feature_key": "social.rewrite"}])


def command(args, sql=None, succeeds=True):
    result = subprocess.run(args, input=sql, text=True, encoding="utf-8", capture_output=True)
    if succeeds and result.returncode:
        raise RuntimeError(result.stderr + result.stdout)
    return result


def query(sql, succeeds=True):
    return command(["docker", "exec", "-i", NAME, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-At"], sql, succeeds)


def one(sql):
    return query(sql).stdout.strip().splitlines()[-1]


def expect_error(sql, text):
    result = query(sql, succeeds=False)
    assert result.returncode and text in result.stderr, result.stdout + result.stderr


def top_up():
    return one(f"set role service_role; select public.entitlement_ensure_all_features('{FEATURES}'::jsonb);")


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
        for prefix in ["0062", "0063", "0066", "0077", "0110", "0117"]:
            matches = [p for p in (DB / "migrations").glob(prefix + "_*.sql") if not p.name.endswith(".down.sql")]
            assert len(matches) == 1, prefix
            query(matches[0].read_text(encoding="utf-8"))
        query(f"""insert into organizations(id,type,name,slug) values
          ('{INTERNAL}','client','AwareWave Ops','awarewave-ops'), ('{EDD}','client','EdD 論文研究','edd-research');
          update organizations set kind='internal' where id='{INTERNAL}';""")

        # soulful missing: the whole migration rolls back, nothing of it remains
        expect_error(UP.read_text(encoding="utf-8"), "soulful-expression root organization not found")
        assert one("select to_regclass('public.organization_all_features') is null and to_regprocedure('public.entitlement_ensure_internal_comp(jsonb)') is not null") == "t"
        query(f"insert into organizations(id,type,name,slug) values ('{SOULFUL}','client','Soulful Expression Art Therapy','soulful-expression');")
        query(UP.read_text(encoding="utf-8"))
        assert one("select string_agg(source || ':' || source_ref, ',' order by source_ref) from organization_all_features") == \
            "comp:all-features:edd-research,comp:all-features:internal,contract:all-features:soulful-2026-10-23"

        assert top_up() == "6"
        assert top_up() == "0", "a rerun must add nothing"
        assert one(f"select count(*) from organization_entitlements where organization_id='{SOULFUL}' and source='contract' and status='active'") == "2"
        expect_error(f"insert into organization_entitlements(organization_id,product_key,feature_key,source,source_ref) values ('{SOULFUL}','tarot','tarot.image','contract','all-features:soulful-2026-10-23');", "organization_entitlements_all_features_live_uniq")
        # grants this mechanism does not own are not bound by its index
        query(f"insert into organization_entitlements(organization_id,product_key,feature_key,source,source_ref) values ('{SOULFUL}','tarot','tarot.image','contract','sub-1'),('{SOULFUL}','tarot','tarot.image','contract','sub-1');")
        # an expired grant is refilled while coverage stays; removing coverage stops the refill
        query(f"update organization_entitlements set status='expired' where organization_id='{EDD}' and feature_key='tarot.image';")
        assert top_up() == "1"
        query(f"delete from organization_all_features where organization_id='{EDD}'; update organization_entitlements set status='expired' where organization_id='{EDD}';")
        assert top_up() == "0"
        for role in ["anon", "authenticated"]:
            expect_error(f"set role {role}; select public.entitlement_ensure_all_features('[]'::jsonb);", "permission denied")
            expect_error(f"set role {role}; select * from public.organization_all_features;", "permission denied")
        expect_error("set role service_role; select public.entitlement_ensure_all_features('{}'::jsonb);", "p_features must be an array")
        expect_error(f"insert into organization_all_features(organization_id,source,source_ref) values ('{EDD}','comp','edd');", "organization_all_features_source_ref_check")

        query((DB / "migrations/0118_entitlement_all_features.down.sql").read_text(encoding="utf-8"))
        assert one("select to_regclass('public.organization_all_features') is null and to_regprocedure('public.entitlement_ensure_internal_comp(jsonb)') is not null and to_regclass('public.organization_entitlements_comp_live_uniq') is not null") == "t"
        query(UP.read_text(encoding="utf-8"))
        assert top_up() == "2", "edd coverage re-seeded by up: its two expired grants come back"
        print("0118 local verify: PASS (atomic seed, top-up 6 then 0, owned rows unique, refill/stop, service_role only, down->0117, up again)")
    finally:
        command(["docker", "rm", "-f", NAME], succeeds=False)


if __name__ == "__main__":
    main()
