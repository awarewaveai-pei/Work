"""0182 against a disposable Postgres; no production connections. organizations, profiles, seller_sites,
customer_identities (0124 + 0133 shape) and ops_audit_events (0011 shape) are stand-ins with the columns 0180/0182 use;
0180 itself is applied from its file."""

from pathlib import Path
import secrets
import subprocess
import time

import pytest

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
BASE = "0180_member_invites.sql"
UP = "0182_member_transfer.sql"
DOWN = "0182_member_transfer.down.sql"
SITE = "00000000-0000-4000-8000-0000000000e1"
ORG = "00000000-0000-4000-8000-0000000000e2"
ORG_PLAIN = "00000000-0000-4000-8000-0000000000e3"
OLD_USER = "00000000-0000-4000-8000-0000000000f1"
NEW_USER = "00000000-0000-4000-8000-0000000000f2"
PAY_USER = "00000000-0000-4000-8000-0000000000f3"


class Db:
    def __init__(self):
        self.name = f"t0182-{secrets.token_hex(4)}"

    def sh(self, args, sql=None, check=True):
        r = subprocess.run(args, input=sql, text=True, encoding="utf-8", capture_output=True)
        if check and r.returncode:
            raise RuntimeError(f"{args[:4]} exited {r.returncode}: {r.stderr}{r.stdout}")
        return r

    def cmd(self):
        return ["docker", "exec", "-i", self.name, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-qAt"]

    def psql(self, sql, check=True):
        return self.sh(self.cmd(), sql, check)

    def one(self, sql):
        return self.psql(sql).stdout.strip()

    def migration(self, name):
        return self.psql((MIGRATIONS / name).read_text(encoding="utf-8"))

    def shape(self):
        return self.one("""
            select concat_ws(' | ',
              (select string_agg(proname || ':' || md5(prosrc), ',' order by proname) from pg_proc p
                 join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'),
              (select string_agg(column_name, ',' order by column_name) from information_schema.columns
                 where table_schema = 'public' and table_name = 'member_invites'),
              (select string_agg(conname, ',' order by conname) from pg_constraint where conrelid = 'public.member_invites'::regclass),
              (select string_agg(indexname, ',' order by indexname) from pg_indexes where tablename = 'customer_identities'),
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
            create table public.organizations (id uuid primary key, kind text not null, parent_organization_id uuid);
            create table public.profiles (id uuid primary key, email text);
            create table public.seller_sites (id uuid primary key);
            create table public.customer_identities (
              id uuid primary key default gen_random_uuid(), provider text not null,
              site_id uuid not null references public.seller_sites(id), external_id text not null, user_id uuid not null,
              organization_id uuid not null references public.organizations(id), created_at timestamptz not null default now(),
              unique (site_id, external_id), unique (site_id, user_id));
            create index customer_identities_organization_id_idx on public.customer_identities(organization_id);
            grant select, insert on public.customer_identities to service_role;
            create table public.ops_audit_events (
              id uuid primary key default gen_random_uuid(),
              organization_id uuid not null references public.organizations(id) on delete cascade,
              actor_role text not null check (actor_role in ('owner', 'admin', 'operator', 'viewer')),
              event_type text not null, target_type text not null, target_id text, trace_id text not null,
              payload jsonb not null default '{{}}'::jsonb, created_at timestamptz not null default now());
            insert into public.seller_sites values ('{SITE}');
            insert into public.organizations values ('{ORG}', 'customer', null), ('{ORG_PLAIN}', 'customer', null);
            insert into public.profiles values ('{OLD_USER}', 'old@unit.test'), ('{NEW_USER}', 'new@unit.test'),
              ('{PAY_USER}', 'pay@unit.test');
            insert into public.customer_identities (provider, site_id, external_id, user_id, organization_id)
              values ('awarewave-wp', '{SITE}', '11', '{OLD_USER}', '{ORG}');
            insert into public.schema_migrations values ('{BASE}');
        """)
        d.migration(BASE)
        d.before = d.shape()
        d.migration(UP)
        d.psql(f"insert into public.schema_migrations values ('{UP}')")
        yield d
    finally:
        d.sh(["docker", "rm", "-f", d.name], check=False)


def code_hash():
    return secrets.token_hex(32)


def issue_transfer(db, email="new@unit.test", reason="聯絡人離職"):
    return db.one(f"""select id from public.member_transfer_issue('{ORG}', '{email}', '{code_hash()}',
                      now() + interval '14 days', 'staff-1', '{reason}', 'admin')""")


def redeem(db, invite, external, user, email):
    return db.one(f"select public.member_invite_redeem('{invite}', 'awarewave-wp', '{SITE}', '{external}', '{user}', '{email}')")


def holders(db, org=ORG):
    return db.one(f"select string_agg(external_id || ':' || user_id, ',') from public.customer_identities where organization_id = '{org}'")


def test_before_redeem_the_old_manager_stays_the_manager(db):
    issue_transfer(db)
    assert holders(db) == f"11:{OLD_USER}"
    assert db.one(f"select transfer_of is not null from public.member_invites where organization_id = '{ORG}' and used_at is null and voided_at is null") == "t"


def test_transfer_redeem_replaces_the_identity_and_writes_one_audit_row(db):
    invite = issue_transfer(db)   # reissue voids the earlier live one
    assert redeem(db, invite, "22", NEW_USER, "new@unit.test") == "ok"
    assert holders(db) == f"22:{NEW_USER}"
    assert db.one(f"select count(*) from public.ops_audit_events where organization_id = '{ORG}' and event_type = 'member_transferred'") == "1"
    assert db.one(f"""select concat_ws('|', actor_role, payload->>'initiated_by', payload->>'reason', payload->'old_identity'->>'user_id',
                      payload->'new_identity'->>'user_id') from public.ops_audit_events where event_type = 'member_transferred'""") \
        == f"admin|staff-1|聯絡人離職|{OLD_USER}|{NEW_USER}"
    assert redeem(db, invite, "22", NEW_USER, "new@unit.test") == "ok"   # the sender's retry
    assert holders(db) == f"22:{NEW_USER}"


def test_an_ordinary_invite_on_an_account_with_a_member_is_still_refused(db):
    invite = db.one(f"""select id from public.member_invite_issue('{ORG}', 'pay@unit.test', '{code_hash()}',
                        now() + interval '14 days', 'staff-1')""")
    assert redeem(db, invite, "33", PAY_USER, "pay@unit.test") == "invite_org_linked"
    assert holders(db) == f"22:{NEW_USER}"


def test_a_transfer_redeem_racing_the_payment_path_leaves_one_identity(db):
    invite = issue_transfer(db, email="pay@unit.test")
    racer = subprocess.Popen(db.cmd(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8")
    racer.stdin.write(f"""begin;
        select public.member_invite_redeem('{invite}', 'awarewave-wp', '{SITE}', '44', '{PAY_USER}', 'pay@unit.test');
        select pg_sleep(3); commit;""")
    racer.stdin.close()
    time.sleep(1)   # the redeem holds its rows; the payment path's plain insert (linkIdentity) waits on the index
    pay = db.psql(f"""insert into public.customer_identities (provider, site_id, external_id, user_id, organization_id)
                      values ('awarewave-wp', '{SITE}', '55', '{OLD_USER}', '{ORG}')""", check=False)
    out, err = racer.communicate(timeout=30)
    assert racer.returncode == 0, err
    assert "ok" in out
    assert pay.returncode != 0 and "customer_identities_one_per_organization" in pay.stderr
    assert holders(db) == f"44:{PAY_USER}"


def test_down_restores_0180_and_up_again(db):
    db.migration(DOWN)
    assert db.shape() == db.before
    db.migration(UP)
    assert db.one("select to_regprocedure('public.member_transfer_issue(uuid, text, text, timestamptz, text, text, text)') is not null") == "t"
    assert db.one("select has_function_privilege('anon', 'public.member_transfer_issue(uuid, text, text, timestamptz, text, text, text)', 'execute')") == "f"
    assert db.one("select has_function_privilege('service_role', 'public.member_transfer_issue(uuid, text, text, timestamptz, text, text, text)', 'execute')") == "t"
