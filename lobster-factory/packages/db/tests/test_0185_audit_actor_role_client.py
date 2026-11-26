"""0185 against a disposable Postgres; no production connections. ops_audit_events and ops_action_runs are 0011's shape
with the columns the check touches (the inline actor_role check gets Postgres' default name, as in production)."""

from pathlib import Path
import secrets
import subprocess
import time

import pytest

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
UP = "0185_audit_actor_role_client.sql"
DOWN = "0185_audit_actor_role_client.down.sql"
ORG = "00000000-0000-4000-8000-0000000000e1"


class Db:
    def __init__(self):
        self.name = f"t0185-{secrets.token_hex(4)}"

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

    def checks(self):
        return self.one("""select string_agg(conname || '=' || pg_get_constraintdef(oid), ' | ' order by conname)
                           from pg_constraint where conname like '%actor_role_check'""")

    def audit(self, role, check=True):
        return self.psql(f"""insert into public.ops_audit_events (organization_id, actor_role, event_type, target_type, trace_id)
                             values ('{ORG}', '{role}', 'e', 'organizations', 't')""", check)


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
            create table public.schema_migrations (filename text primary key);
            create table public.organizations (id uuid primary key);
            create table public.ops_audit_events (
              id uuid primary key default gen_random_uuid(),
              organization_id uuid not null references public.organizations(id) on delete cascade,
              actor_role text not null check (actor_role in ('owner', 'admin', 'operator', 'viewer')),
              event_type text not null, target_type text not null, trace_id text not null);
            create table public.ops_action_runs (
              id uuid primary key default gen_random_uuid(),
              actor_role text not null check (actor_role in ('owner', 'admin', 'operator', 'viewer')));
            insert into public.organizations values ('{ORG}');
        """)
        d.before = d.checks()
        d.migration(UP)
        d.psql(f"insert into public.schema_migrations values ('{UP}')")
        yield d
    finally:
        d.sh(["docker", "rm", "-f", d.name], check=False)


def test_a_customer_action_is_recorded_as_client_and_staff_roles_still_hold(db):
    db.audit("client")
    db.audit("operator")
    bad = db.audit("customer", check=False)
    assert bad.returncode != 0 and "ops_audit_events_actor_role_check" in bad.stderr
    assert db.one("insert into public.ops_action_runs (actor_role) values ('client') returning actor_role") == "client"


def test_down_refuses_while_client_rows_exist_then_up_down_up(db):
    refused = db.migration(DOWN, check=False)
    assert refused.returncode != 0 and "rolled forward, not down" in refused.stderr
    assert db.one("select count(*) from public.ops_audit_events where actor_role = 'client'") == "1"   # nothing deleted
    db.psql("delete from public.ops_audit_events where actor_role = 'client'; delete from public.ops_action_runs where actor_role = 'client'")
    db.migration(DOWN)
    assert db.checks() == db.before
    assert db.one("select count(*) from public.schema_migrations") == "0"
    db.migration(UP)
    db.audit("client")
