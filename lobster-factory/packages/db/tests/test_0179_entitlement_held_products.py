"""0179 against a disposable Postgres; no production connections. organization_entitlements is a stand-in with the columns the function reads."""

from pathlib import Path
import secrets
import subprocess
import time

import pytest

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
UP = "0179_entitlement_held_products.sql"
DOWN = "0179_entitlement_held_products.down.sql"
A = "00000000-0000-4000-8000-0000000000a1"
B = "00000000-0000-4000-8000-0000000000a2"
FN = "public.entitlement_held_products()"


class Db:
    def __init__(self):
        self.name = f"t0179-{secrets.token_hex(4)}"

    def sh(self, args, sql=None, check=True):
        r = subprocess.run(args, input=sql, text=True, encoding="utf-8", capture_output=True)
        if check and r.returncode:
            raise RuntimeError(f"{args[:4]} exited {r.returncode}: {r.stderr}{r.stdout}")
        return r

    def psql(self, sql, check=True, user="postgres"):
        return self.sh(["docker", "exec", "-i", self.name, "psql", "-U", "postgres", "-d", "postgres",
                        "-X", "-v", "ON_ERROR_STOP=1", "-qAt"], sql, check)

    def one(self, sql):
        return self.psql(sql).stdout.strip()

    def error(self, sql):
        r = self.psql(sql, check=False)
        return "" if r.returncode == 0 else r.stderr

    def migration(self, name):
        return self.psql((MIGRATIONS / name).read_text(encoding="utf-8"))

    def shape(self):
        return self.one("""
            select concat_ws(' | ',
              (select string_agg(proname, ',' order by proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public'),
              (select string_agg(filename, ',' order by filename) from public.schema_migrations))""")


@pytest.fixture(scope="module")
def db():
    d = Db()
    d.sh(["docker", "run", "-d", "--name", d.name, "-e", "POSTGRES_PASSWORD=verify", "postgres:15.8-alpine"])
    try:
        for _ in range(60):
            if d.sh(["docker", "exec", d.name, "pg_isready", "-U", "postgres"], check=False).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("Postgres did not start")
        time.sleep(2)
        d.psql(f"""
            create role anon nologin; create role authenticated nologin; create role service_role nologin;
            create table public.schema_migrations (filename text primary key);
            insert into public.schema_migrations values ('0178_organization_product_operations.sql'), ('{UP}');
            create table public.organization_entitlements (id serial primary key, organization_id uuid not null,
              product_key text not null, feature_key text not null, source text not null check (source in ('contract','comp')),
              status text not null default 'active', starts_at timestamptz not null default now() - interval '1 day',
              ends_at timestamptz, limits jsonb not null default '{{}}');
        """)
        d.before = d.shape()
        yield d
    finally:
        d.sh(["docker", "rm", "-f", d.name], check=False)


def row(org, product, feature, source="contract", status="active", starts="now() - interval '1 day'", ends="null", limits="'{}'"):
    return (f"insert into public.organization_entitlements (organization_id, product_key, feature_key, source, status, starts_at, ends_at, limits) "
            f"values ('{org}', '{product}', '{feature}', '{source}', '{status}', {starts}, {ends}, {limits}::jsonb)")


def test_up_adds_a_service_role_only_function(db):
    db.migration(UP)
    assert db.one(f"select has_function_privilege('service_role', '{FN}', 'execute')") == "t"
    assert db.one(f"select has_function_privilege('anon', '{FN}', 'execute')") == "f"
    assert db.one(f"select has_function_privilege('authenticated', '{FN}', 'execute')") == "f"


def test_anon_and_authenticated_cannot_call_it(db):
    for role in ("anon", "authenticated"):
        assert "permission denied" in db.error(f"set role {role}; select * from {FN}")


def test_groups_live_rights_by_account_product_source_and_pay(db):
    for i in range(300):   # an all-features account: hundreds of rows, one group
        db.psql(row(A, "content", f"content.f{i}"))
    db.psql(row(A, "design", "design.export", limits="'{\"pay\": \"credits\"}'"))
    db.psql(row(B, "content", "content.write", source="comp"))
    out = db.one(f"select string_agg(organization_id || ':' || product_key || ':' || source || ':' || pay, ' ' order by organization_id, product_key, source, pay) from {FN}")
    assert out == f"{A}:content:contract: {A}:design:contract:credits {B}:content:comp:"


def test_ended_not_started_inactive_and_resell_rows_do_not_count(db):
    db.psql("truncate public.organization_entitlements")
    db.psql(row(A, "ended", "ended.f", ends="now() - interval '1 hour'"))
    db.psql(row(A, "future", "future.f", starts="now() + interval '1 day'"))
    db.psql(row(A, "suspended", "suspended.f", status="suspended"))
    db.psql(row(A, "video", "video.resell"))            # a licence to sell, not a held product
    db.psql(row(A, "live", "live.f", ends="now() + interval '1 day'"))
    assert db.one(f"select string_agg(product_key, ',') from {FN}") == "live"


def test_down_leaves_exactly_what_was_there_before(db):
    db.migration(DOWN)
    assert db.one("select to_regprocedure('public.entitlement_held_products()') is null") == "t"
    assert db.shape() == db.before.replace(f",{UP}", "")


def test_up_again_after_down(db):
    db.migration(UP)
    db.psql("truncate public.organization_entitlements")
    db.psql(row(A, "content", "content.write"))
    assert db.one(f"select count(*) from {FN}") == "1"
