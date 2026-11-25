"""0184 against a disposable Postgres; no production connections. Stand-ins as in test_0182 (organizations, profiles,
seller_sites, customer_identities, ops_audit_events); 0180 and 0182 are applied from their files."""

from pathlib import Path
import secrets
import subprocess
import time

import pytest

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
BASES = ("0180_member_invites.sql", "0182_member_transfer.sql")
UP = "0184_member_events.sql"
DOWN = "0184_member_events.down.sql"
SITE = "00000000-0000-4000-8000-0000000000e1"
ORG = "00000000-0000-4000-8000-0000000000e2"
ORG_FREE = "00000000-0000-4000-8000-0000000000e3"
USER = "00000000-0000-4000-8000-0000000000f1"
LATE_USER = "00000000-0000-4000-8000-0000000000f2"
T1 = "2026-11-25T10:00:00Z"
T2 = "2026-11-25T11:00:00Z"
T3 = "2026-11-25T12:00:00Z"


class Db:
    def __init__(self):
        self.name = f"t0184-{secrets.token_hex(4)}"

    def sh(self, args, sql=None, check=True):
        r = subprocess.run(args, input=sql, text=True, encoding="utf-8", capture_output=True)
        if check and r.returncode:
            raise RuntimeError(f"{args[:4]} exited {r.returncode}: {r.stderr}{r.stdout}")
        return r

    def psql(self, sql, check=True):
        cmd = ["docker", "exec", "-i", self.name, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-qAt"]
        return self.sh(cmd, sql, check)

    def one(self, sql):
        return self.psql(sql).stdout.strip()

    def migration(self, name, check=True):
        return self.psql((MIGRATIONS / name).read_text(encoding="utf-8"), check)

    def shape(self):
        return self.one("""
            select concat_ws(' | ',
              (select string_agg(proname || ':' || md5(prosrc), ',' order by proname) from pg_proc p
                 join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'),
              (select string_agg(column_name || ':' || is_nullable, ',' order by column_name) from information_schema.columns
                 where table_schema = 'public' and table_name = 'former_customer_identities'),
              (select string_agg(conname, ',' order by conname) from pg_constraint
                 where conrelid = 'public.former_customer_identities'::regclass),
              (select string_agg(tablename, ',' order by tablename) from pg_tables where schemaname = 'public'),
              has_function_privilege('service_role', 'public.member_invite_redeem(uuid, text, uuid, text, uuid, text)', 'execute'),
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
            grant select, insert on public.customer_identities to service_role;
            create table public.ops_audit_events (
              id uuid primary key default gen_random_uuid(),
              organization_id uuid not null references public.organizations(id) on delete cascade,
              actor_role text not null check (actor_role in ('owner', 'admin', 'operator', 'viewer')),
              event_type text not null, target_type text not null, target_id text, trace_id text not null,
              payload jsonb not null default '{{}}'::jsonb, created_at timestamptz not null default now());
            insert into public.seller_sites values ('{SITE}');
            insert into public.organizations values ('{ORG}', 'customer', null), ('{ORG_FREE}', 'customer', null);
            insert into public.profiles values ('{USER}', 'owner@unit.test'), ('{LATE_USER}', 'late@unit.test');
        """)
        for base in BASES:
            d.migration(base)
            d.psql(f"insert into public.schema_migrations values ('{base}')")
        d.before = d.shape()
        d.migration(UP)
        d.psql(f"insert into public.schema_migrations values ('{UP}')")
        yield d
    finally:
        d.sh(["docker", "rm", "-f", d.name], check=False)


def issue(db, org, email):
    return db.one(f"""select id from public.member_invite_issue('{org}', '{email}', '{secrets.token_hex(32)}',
                      now() + interval '14 days', 'staff-1')""")


def invite_event(db, event_id, at, invite, external, user, email):
    return db.one(f"""select public.member_event_invite('{SITE}', '{event_id}', '{at}', '{invite}', 'awarewave-wp',
                      '{external}', '{user}', '{email}')""")


def deleted_event(db, event_id, at, external):
    return db.one(f"select public.member_event_deleted('{SITE}', '{event_id}', '{at}', 'awarewave-wp', '{external}')")


def holder(db, org):
    return db.one(f"select string_agg(external_id, ',') from public.customer_identities where organization_id = '{org}'")


def count(db, sql):
    return int(db.one(f"select count(*) {sql}"))


def test_an_invite_event_links_and_its_replay_is_not_redone(db):
    invite = issue(db, ORG, "owner@unit.test")
    assert invite_event(db, "member_invite:11:a1", T1, invite, "11", USER, "owner@unit.test") == "ok"
    assert holder(db, ORG) == "11"
    assert invite_event(db, "member_invite:11:a1", T1, invite, "11", USER, "owner@unit.test") == "ok"
    assert count(db, "from public.member_events where event_id = 'member_invite:11:a1'") == 1
    # the unstamped entry point is closed to the app
    assert db.one("select has_function_privilege('service_role', 'public.member_invite_redeem(uuid, text, uuid, text, uuid, text)', 'execute')") == "f"
    assert db.one("select has_function_privilege('service_role', 'public.member_event_invite(uuid, text, timestamptz, uuid, text, text, uuid, text)', 'execute')") == "t"
    assert db.one("select has_function_privilege('anon', 'public.member_event_deleted(uuid, text, timestamptz, text, text)', 'execute')") == "f"


def test_member_deleted_moves_the_identity_out_with_one_former_row_and_one_audit_row(db):
    assert deleted_event(db, "member_deleted:11:d1", T2, "11") == "deleted"
    assert holder(db, ORG) == ""
    assert db.one("select concat_ws(':', external_id, user_id, organization_id, reason, invite_id is null, member_event_id is not null) "
                  "from public.former_customer_identities") == f"11:{USER}:{ORG}:deleted:t:t"
    assert db.one(f"select concat_ws('|', actor_role, payload->>'event_id', payload->'identity'->>'user_id') from public.ops_audit_events "
                  f"where organization_id = '{ORG}' and event_type = 'member_deleted'") == f"operator|member_deleted:11:d1|{USER}"
    # the same event again: nothing redone, the first answer
    assert deleted_event(db, "member_deleted:11:d1", T2, "11") == "deleted"
    assert count(db, "from public.former_customer_identities") == 1
    assert count(db, "from public.ops_audit_events where event_type = 'member_deleted'") == 1
    # the same id for another kind or member is the sender's bug
    assert deleted_event(db, "member_deleted:11:d1", T2, "12") == "event_id_reused"


def test_an_older_invite_after_the_deletion_is_refused_and_never_links_again(db):
    # the core guard: a member_invite stamped before the deletion (replayed with a new id, or delivered late) is stale
    invite = issue(db, ORG, "owner@unit.test")
    assert invite_event(db, "member_invite:11:late", T1, invite, "11", USER, "owner@unit.test") == "event_stale"
    assert holder(db, ORG) == ""
    assert db.one(f"select used_at is null from public.member_invites where id = '{invite}'") == "t"
    assert db.one(f"""select public.member_event_check('{SITE}', 'member_invite:11:late', 'member_invite', '11', '{T1}')->>'result'""") == "event_stale"


def test_a_deleted_member_with_no_identity_is_recorded_and_a_late_invite_stays_refused(db):
    assert deleted_event(db, "member_deleted:77:d", T2, "77") == "no_identity"
    invite = issue(db, ORG_FREE, "late@unit.test")
    assert invite_event(db, "member_invite:77:x", T1, invite, "77", LATE_USER, "late@unit.test") == "event_stale"
    assert holder(db, ORG_FREE) == ""


def test_email_changed_only_audits_domains(db):
    invite = issue(db, ORG_FREE, "late@unit.test")
    assert invite_event(db, "member_invite:88:a", T3, invite, "88", LATE_USER, "late@unit.test") == "ok"
    out = db.one(f"""select public.member_event_email_changed('{SITE}', 'member_email:88:e', '{T3}', 'awarewave-wp', '88',
                     'unit.test', 'new.test')""")
    assert out == "audited"
    assert holder(db, ORG_FREE) == "88"
    assert db.one("select concat_ws('|', payload->>'old_email_domain', payload->>'new_email_domain', payload ? 'email') "
                  "from public.ops_audit_events where event_type = 'member_email_changed'") == "unit.test|new.test|f"


def test_down_restores_0182_and_up_again(db):
    refused = db.migration(DOWN, check=False)
    assert refused.returncode != 0 and "rolled forward, not down" in refused.stderr
    db.psql("delete from public.former_customer_identities")
    db.migration(DOWN)
    assert db.shape() == db.before
    db.migration(UP)
    assert db.one("select to_regclass('public.member_events') is not null") == "t"
