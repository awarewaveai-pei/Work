"""0175 against a disposable Postgres; no production connections. The three functions start as their pre-0175 definitions
(read from 0148 / 0143 / 0133), the tables they touch before the root-account check are stand-ins."""

from pathlib import Path
import secrets
import subprocess
import time

import pytest

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
UP = "0175_organizations_kind_test.sql"
DOWN = "0175_organizations_kind_test.down.sql"
INTERNAL = "00000000-0000-4000-8000-000000000001"
CUST = "00000000-0000-4000-8000-0000000000a1"
TEST1 = "00000000-0000-4000-8000-0000000000a2"
TEST2 = "00000000-0000-4000-8000-0000000000a3"
CHILD_OF_TEST = "00000000-0000-4000-8000-0000000000a4"
FUNCS = ("billing_apply_payment_event", "entitlement_staff_account", "seller_root_account_check")


def src(name, a, b):
    return "\n".join((MIGRATIONS / name).read_text(encoding="utf-8").split("\n")[a - 1:b]) + "\n"


class Db:
    def __init__(self):
        self.name = f"t0175-{secrets.token_hex(4)}"

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
        """The raised message, '' when the statement succeeded."""
        r = self.psql(sql, check=False)
        return "" if r.returncode == 0 else r.stderr

    def migration(self, name):
        return self.psql((MIGRATIONS / name).read_text(encoding="utf-8"))

    def defs(self):
        return {f: self.one(f"select pg_get_functiondef(p.oid) from pg_proc p where p.proname = '{f}'") for f in FUNCS}


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
        # organizations.kind exactly as 0110 made it (inline check -> organizations_kind_check); the rest are stand-ins
        # for the tables the functions read before (or for %rowtype at) the root-account check.
        d.psql(f"""
            create role anon nologin; create role authenticated nologin; create role service_role nologin;
            create table public.schema_migrations (filename text primary key);
            insert into public.schema_migrations values ('{UP}');
            create table public.organizations (id uuid primary key, slug text unique not null,
              parent_organization_id uuid references public.organizations(id), sold_by_organization_id uuid);
            alter table public.organizations add column kind text not null default 'customer'
              check (kind in ('internal','customer'));
            create table public.payment_events (id uuid primary key default gen_random_uuid(), provider text, event_id text,
              kind text, organization_id uuid, payload jsonb, site_id uuid, processed_at timestamptz, result jsonb);
            create table public.plans (plan_key text primary key, product_key text, kind text, features jsonb);
            create table public.organization_product_subscriptions (id uuid primary key default gen_random_uuid());
            create table public.seller_sites (id uuid primary key default gen_random_uuid(), key_id text, status text,
              seller_organization_id uuid);
            insert into public.organizations (id, slug, kind) values
              ('{INTERNAL}', 'awarewave-ops', 'internal'),
              ('{CUST}', 'soulful-expression', 'customer'),
              ('{TEST1}', 'e2e-verify-0704-5c1356', 'customer'),
              ('{TEST2}', 'test-wp-webhook-co-c705c6', 'customer');
            insert into public.organizations (id, slug, kind, parent_organization_id) values
              ('{CHILD_OF_TEST}', 'e2e-brand', 'customer', '{TEST1}');
        """)
        d.psql(src("0148_credit_call_holds.sql", 125, 506))
        d.psql(src("0143_entitlement_staff_grants.sql", 19, 29))
        d.psql(src("0133_seller_sites.sql", 38, 49))
        d.psql("""
            create table public.t_seller (seller uuid);
            create trigger t_seller_root before insert on public.t_seller
              for each row execute function public.seller_root_account_check('seller');
        """)
        d.before = d.defs()
        yield d
    finally:
        d.sh(["docker", "rm", "-f", d.name], check=False)


def pay(org):
    return f"""select public.billing_apply_payment_event('woo', 'e-{secrets.token_hex(3)}',
      jsonb_build_object('kind', 'credit_pack', 'organization_id', '{org}'))"""


def gates(d, org):
    """What each function answers for this account: '' = admitted, else the message."""
    def msg(e):
        return next((p for p in ("not_a_customer_billing_account", "site_disabled", "not_a_customer_account",
                                 "must name a root billing account") if p in e), e.strip() or "")
    return (msg(d.error(pay(org))),
            msg(d.error(f"select public.entitlement_staff_account('{org}', 'owner')")),
            msg(d.error(f"insert into public.t_seller values ('{org}')")))


def test_baseline_a_customer_passes_the_root_account_check(db):
    # 'test' cannot exist before 0175 (constraint), so the baseline is what a customer gets
    assert gates(db, CUST) == ("site_disabled", "", "")


def test_up_marks_only_the_two_slugs(db):
    db.migration(UP)
    rows = db.one("select slug || '=' || kind from public.organizations order by slug").split("\n")
    assert rows == ["awarewave-ops=internal", "e2e-brand=customer", "e2e-verify-0704-5c1356=test",
                    "soulful-expression=customer", "test-wp-webhook-co-c705c6=test"]
    assert "violates check constraint" in db.error(f"update public.organizations set kind = 'bogus' where id = '{CUST}'")


def test_a_test_unit_passes_every_gate_exactly_like_a_customer(db):
    assert gates(db, TEST1) == gates(db, CUST) == ("site_disabled", "", "")
    assert gates(db, TEST2) == gates(db, CUST)
    # a brand (not a root) is refused whatever its root's kind; internal keeps its old answers
    assert gates(db, CHILD_OF_TEST) == ("not_a_customer_billing_account", "not_a_customer_account", "must name a root billing account")
    assert gates(db, INTERNAL) == ("not_a_customer_billing_account", "not_a_customer_account", "")


def test_each_function_differs_from_its_source_by_the_one_condition(db):
    after = db.defs()
    assert after["billing_apply_payment_event"] == db.before["billing_apply_payment_event"].replace(
        "and kind = 'customer') then", "and kind in ('customer','test')) then")
    assert after["entitlement_staff_account"] == db.before["entitlement_staff_account"].replace(
        "and kind = 'customer') then", "and kind in ('customer','test')) then")
    assert after["seller_root_account_check"] == db.before["seller_root_account_check"].replace(
        "kind in ('internal','customer')) then", "kind in ('internal','customer','test')) then")
    assert all(after[f] != db.before[f] for f in FUNCS)


def test_down_restores_rows_constraint_functions_and_ledger(db):
    db.migration(DOWN)
    assert db.one("select count(*) from public.organizations where kind = 'test'") == "0"
    assert db.one(f"select kind from public.organizations where id = '{TEST1}'") == "customer"
    assert "violates check constraint" in db.error(f"update public.organizations set kind = 'test' where id = '{CUST}'")
    assert db.defs() == db.before
    assert db.one(f"select count(*) from public.schema_migrations where filename = '{UP}'") == "0"
    assert gates(db, TEST1) == ("site_disabled", "", "")   # customer again


def test_up_again_after_down(db):
    db.migration(UP)
    assert db.one("select count(*) from public.organizations where kind = 'test'") == "2"
    assert gates(db, TEST1) == gates(db, CUST)
