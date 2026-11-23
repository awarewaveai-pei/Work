"""0178 against a disposable Postgres; no production connections. organizations is a stand-in with 0175's kinds."""

from pathlib import Path
import secrets
import subprocess
import time

import pytest

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
UP = "0178_organization_product_operations.sql"
DOWN = "0178_organization_product_operations.down.sql"
INTERNAL = "00000000-0000-4000-8000-000000000001"
CUST = "00000000-0000-4000-8000-0000000000b1"
TEST = "00000000-0000-4000-8000-0000000000b2"
BRAND = "00000000-0000-4000-8000-0000000000b3"
T = "public.organization_product_operations"


class Db:
    def __init__(self):
        self.name = f"t0178-{secrets.token_hex(4)}"

    def sh(self, args, sql=None, check=True):
        r = subprocess.run(args, input=sql, text=True, encoding="utf-8", capture_output=True)
        if check and r.returncode:
            raise RuntimeError(f"{args[:4]} exited {r.returncode}: {r.stderr}{r.stdout}")
        return r

    def psql(self, sql, check=True):
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
        """Everything 0178 could leave behind: tables, functions, triggers, policies, the ledger row."""
        return self.one("""
            select concat_ws(' | ',
              (select string_agg(tablename, ',' order by tablename) from pg_tables where schemaname = 'public'),
              (select string_agg(proname, ',' order by proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public'),
              (select string_agg(tgname, ',' order by tgname) from pg_trigger where not tgisinternal),
              (select string_agg(policyname, ',' order by policyname) from pg_policies),
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
            insert into public.schema_migrations values ('0177_systems_user_requests.sql'), ('{UP}');
            create table public.organizations (id uuid primary key, slug text unique not null,
              parent_organization_id uuid references public.organizations(id),
              kind text not null default 'customer' check (kind in ('internal','customer','test')));
            insert into public.organizations (id, slug, kind) values
              ('{INTERNAL}', 'awarewave-ops', 'internal'), ('{CUST}', 'soulful-expression', 'customer'),
              ('{TEST}', 'e2e-verify-0704-5c1356', 'test');
            insert into public.organizations (id, slug, kind, parent_organization_id) values ('{BRAND}', 'soulful-brand', 'customer', '{CUST}');
        """)
        d.before = d.shape()
        yield d
    finally:
        d.sh(["docker", "rm", "-f", d.name], check=False)


def put(org, product="content", by="awarewave"):
    return f"""insert into {T} (organization_id, product_key, operated_by, updated_by) values ('{org}', '{product}', '{by}', 'ops:owner:u1')
      on conflict (organization_id, product_key) do update set operated_by = excluded.operated_by, updated_at = now(), updated_by = excluded.updated_by"""


def test_up_creates_an_empty_service_role_only_table(db):
    db.migration(UP)
    assert db.one(f"select count(*) from {T}") == "0"            # writes no data
    assert db.one(f"select relrowsecurity from pg_class where oid = '{T}'::regclass") == "t"
    assert db.one(f"select has_table_privilege('anon', '{T}', 'select') or has_table_privilege('authenticated', '{T}', 'select')") == "f"
    assert db.one(f"select has_table_privilege('service_role', '{T}', 'insert')") == "t"


def test_a_root_customer_or_test_account_is_switched_and_read_back(db):
    db.psql(put(CUST))
    db.psql(put(TEST, "video"))
    assert db.one(f"select operated_by from {T} where organization_id = '{CUST}' and product_key = 'content'") == "awarewave"
    db.psql(put(CUST, by="customer"))                             # switched back: one row, the last value
    assert db.one(f"select count(*) || ':' || min(operated_by) from {T} where organization_id = '{CUST}' and product_key = 'content'") == "1:customer"


def test_a_brand_an_internal_account_and_bad_values_are_refused(db):
    assert "operation:not_a_customer_account" in db.error(put(BRAND))
    assert "operation:not_a_customer_account" in db.error(put(INTERNAL))
    # moving an existing row onto a brand is refused too (the trigger runs on update)
    assert "operation:not_a_customer_account" in db.error(f"update {T} set organization_id = '{BRAND}' where organization_id = '{CUST}'")
    assert "violates check constraint" in db.error(put(CUST, by="reseller"))
    assert "violates check constraint" in db.error(put(CUST, product=" "))
    db.psql(put(CUST, product="oracle"))   # any non-empty key: the app checks the registry (lib/portal/products.ts)
    assert "violates check constraint" in db.error(
        f"insert into {T} (organization_id, product_key, operated_by, updated_by) values ('{CUST}', 'hci', 'awarewave', ' ')")


def test_down_leaves_exactly_what_was_there_before(db):
    db.migration(DOWN)
    assert db.one(f"select to_regclass('{T}') is null") == "t"
    assert db.shape() == db.before.replace(f",{UP}", "")


def test_up_again_after_down(db):
    db.migration(UP)
    db.psql(put(CUST))
    assert db.one(f"select operated_by from {T} where organization_id = '{CUST}'") == "awarewave"
