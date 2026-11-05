"""0161 against a disposable Postgres (auth.users stubbed); no production connections."""

import os
from pathlib import Path
import secrets
import subprocess
import time

import pytest

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
UP = "0161_profiles_for_every_auth_user.sql"
DOWN = "0161_profiles_for_every_auth_user.down.sql"
ORG = "00000000-0000-4000-8000-0000000000a1"
U_BARE = "00000000-0000-4000-8000-0000000000b1"      # no profile before the migration
U_COLLIDE = "00000000-0000-4000-8000-0000000000b2"   # email held by a legacy profile of another id
U_HAS = "00000000-0000-4000-8000-0000000000b3"       # already has a profile, org set
U_NOMAIL = "00000000-0000-4000-8000-0000000000b4"    # phone/anonymous style user
LEGACY = "00000000-0000-4000-8000-0000000000c1"
REL = "00000000-0000-4000-8000-0000000000a5"
REL2 = "00000000-0000-4000-8000-0000000000a6"
NEW_OK = "00000000-0000-4000-8000-0000000000d1"
NEW_COLLIDE = "00000000-0000-4000-8000-0000000000d2"
NEW_NOMAIL = "00000000-0000-4000-8000-0000000000d3"
SIGNUP_USER = "00000000-0000-4000-8000-0000000000d4"
SIGNUP_ORG = "00000000-0000-4000-8000-0000000000e1"


class Db:
    def __init__(self):
        self.name = f"t0161-{secrets.token_hex(4)}"

    def sh(self, args, sql=None, check=True):
        r = subprocess.run(args, input=sql, text=True, encoding="utf-8", capture_output=True)
        if check and r.returncode:
            raise RuntimeError(f"{args[:4]} exited {r.returncode}: {r.stderr}{r.stdout}")
        return r

    def psql(self, sql, check=True):
        return self.sh(["docker", "exec", "-i", self.name, "psql", "-U", "postgres", "-d", "postgres",
                        "-X", "-v", "ON_ERROR_STOP=1", "-qAt"], sql, check)

    def as_auth(self, sql):
        """GoTrue's role: not superuser, no bypassrls; only what the real one has on auth.users."""
        return self.psql("set role supabase_auth_admin;\n" + sql)

    def one(self, sql):
        return self.psql(sql).stdout.strip()

    def migration(self, name, check=True):
        return self.psql((MIGRATIONS / name).read_text(encoding="utf-8"), check)


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
        d.psql("""
            create role anon nologin; create role authenticated nologin; create role service_role nologin;
            create role supabase_auth_admin nologin nosuperuser nobypassrls;
            alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
            create schema auth;
            create table auth.users (id uuid primary key, email text, created_at timestamptz not null default now());
            grant usage on schema auth to supabase_auth_admin;
            grant select, insert, update, delete on auth.users to supabase_auth_admin;
        """)
        d.migration("0001_core.sql")
        # stand-ins for the tables 0110's portal_complete_signup writes (only the columns it names)
        d.psql(f"""
            create table public.plans (plan_key text, product_key text, kind text, features jsonb, limits jsonb);
            create table public.organization_product_subscriptions (id uuid primary key default gen_random_uuid(),
              organization_id uuid, product_key text, plan_key text, status text, started_at timestamptz,
              trial_started_at timestamptz, current_period_end timestamptz);
            create table public.organization_entitlements (organization_id uuid, product_key text, feature_key text,
              source text, source_ref text, starts_at timestamptz, ends_at timestamptz, limits jsonb);
            insert into public.plans values ('social_trial', 'social', 'base', '["post"]', '{{}}');
            insert into organizations(id, type, name, slug) values ('{ORG}', 'client', 'Org', 'org');
            insert into profiles(id, email, default_organization_id) values ('{U_HAS}', 'has@x.test', '{ORG}');
            insert into profiles(id, email) values ('{LEGACY}', 'collide@x.test');
            insert into auth.users(id, email) values
              ('{U_BARE}', 'Bare@X.test'), ('{U_COLLIDE}', 'collide@x.test'), ('{U_HAS}', 'has@x.test'), ('{U_NOMAIL}', null);
        """)
        yield d
    finally:
        d.sh(["docker", "rm", "-f", d.name], check=False)


def profile(db, uid):
    return db.one(f"select email || '|' || status || '|' || coalesce(default_organization_id::text, 'NULL') || '|' || metadata::text "
                  f"from profiles where id = '{uid}'")


def test_backfill_reports_and_never_grants(db):
    r = db.migration(UP)
    assert "UNRESOLVED" in r.stderr and U_COLLIDE in r.stderr and U_NOMAIL in r.stderr
    assert profile(db, U_BARE) == "bare@x.test|active|NULL|{}"
    assert profile(db, U_HAS) == f"has@x.test|active|{ORG}|{{}}"  # existing row untouched
    assert profile(db, U_COLLIDE) == "" and profile(db, U_NOMAIL) == ""
    assert db.one("select count(*) from profiles where id = '%s'" % LEGACY) == "1"


def test_up_is_idempotent(db):
    before = db.one("select count(*) from profiles")
    db.migration(UP)
    assert db.one("select count(*) from profiles") == before


def test_trigger_creates_profile_and_never_blocks_signup(db):
    db.as_auth(f"""insert into auth.users(id, email) values ('{NEW_OK}', 'new@x.test'), ('{NEW_COLLIDE}', 'COLLIDE@x.test'),
                ('{NEW_NOMAIL}', null);""")
    assert db.one("select count(*) from auth.users where id in ('%s','%s','%s')" % (NEW_OK, NEW_COLLIDE, NEW_NOMAIL)) == "3"
    assert profile(db, NEW_OK) == "new@x.test|active|NULL|{}"
    assert profile(db, NEW_COLLIDE) == "" and profile(db, NEW_NOMAIL) == ""


def test_delete_tombstones_an_organizationless_profile_and_frees_the_email(db):
    db.as_auth(f"insert into auth.users(id, email) values ('{REL}', 'rel@x.test')")
    assert profile(db, REL) == "rel@x.test|active|NULL|{}"
    db.psql(f"update profiles set display_name = 'Rel', avatar_url = 'https://a/x.png', metadata = '{{\"phone\":\"1\"}}' where id = '{REL}'")
    db.as_auth(f"delete from auth.users where id = '{REL}'")
    assert db.one(f"select coalesce(display_name,'') || coalesce(avatar_url,'') from profiles where id = '{REL}'") == "", "personal fields erased"
    assert profile(db, REL) == f"deleted+{REL}@invalid|disabled|NULL|{{}}"
    assert db.one("select count(*) from profiles where email = 'rel@x.test'") == "0"
    db.as_auth(f"insert into auth.users(id, email) values ('{REL2}', 'rel@x.test')")  # same address, new account
    assert profile(db, REL2) == "rel@x.test|active|NULL|{}"
    # a profile that holds an organization is data, not a leftover: untouched
    db.as_auth(f"delete from auth.users where id = '{U_HAS}'")
    assert profile(db, U_HAS) == f"has@x.test|active|{ORG}|{{}}"
    db.psql(f"insert into auth.users(id, email) values ('{U_HAS}', 'has@x.test')")


def test_self_check_refuses_an_unexplained_gap(db):
    db.psql("alter table profiles add constraint t_bad check (email <> 'bad@x.test')")
    db.psql("alter table auth.users disable trigger ensure_profile_on_auth_user_insert; "
            "insert into auth.users(id, email) values ('00000000-0000-4000-8000-0000000000f1', 'bad@x.test'); "
            "alter table auth.users enable trigger ensure_profile_on_auth_user_insert;")
    r = db.migration(UP, check=False)
    assert r.returncode != 0 and "reason other than email collision" in r.stderr
    db.psql("delete from auth.users where email = 'bad@x.test'; alter table profiles drop constraint t_bad")


def test_functions_not_executable_by_anon_or_authenticated(db):
    for role in ("anon", "authenticated"):
        assert db.one(f"select has_function_privilege('{role}', 'public.ensure_profile_for_auth_user(uuid,text)', 'EXECUTE')") == "f"
        assert db.one(f"select has_function_privilege('{role}', 'public.ensure_profile_on_auth_user_insert()', 'EXECUTE')") == "f"
        assert db.one(f"select has_function_privilege('{role}', 'public.release_profile_on_auth_user_delete()', 'EXECUTE')") == "f"
        assert db.one(f"select has_function_privilege('{role}', 'public.portal_complete_signup(uuid,uuid,text,text,text,text)', 'EXECUTE')") == "f"
    assert db.one("select has_function_privilege('service_role', 'public.portal_complete_signup(uuid,uuid,text,text,text,text)', 'EXECUTE')") == "t"


def test_portal_complete_signup_sets_its_columns_on_the_trigger_row(db):
    db.as_auth(f"insert into auth.users(id, email) values ('{SIGNUP_USER}', 'owner@x.test')")
    assert profile(db, SIGNUP_USER) == "owner@x.test|active|NULL|{}"
    db.psql(f"select public.portal_complete_signup('{SIGNUP_ORG}', '{SIGNUP_USER}', 'Acme', 'owner@x.test', 'social')")
    assert profile(db, SIGNUP_USER) == f"owner@x.test|active|{SIGNUP_ORG}|{{}}"
    assert db.one(f"select count(*) from organization_memberships where user_id = '{SIGNUP_USER}'") == "1"


def test_standing_detector_script_against_the_real_catalog(db):
    script = Path(__file__).resolve().parents[3] / "infra/hetzner-phase1-core/scripts/check-auth-profiles.sh"
    env = {**os.environ, "AUTH_PROFILES_PSQL": f"docker exec -i {db.name} psql -U postgres -d postgres -At -F | -v ON_ERROR_STOP=1"}

    def run_script():
        git_bash = Path("C:/Program Files/Git/usr/bin/bash.exe")  # plain `bash` on this laptop is WSL, which cannot see D:\
        r = subprocess.run([str(git_bash) if git_bash.exists() else "bash", str(script)], env=env, text=True, capture_output=True)
        return r.returncode, r.stdout
    rc, out = run_script()
    assert rc == 1 and "4 auth user(s) without a profiles row" in out and "@" not in out  # collide + no-email users
    db.psql(f"delete from auth.users where id in ('{U_COLLIDE}', '{U_NOMAIL}', '{NEW_COLLIDE}', '{NEW_NOMAIL}')")
    assert run_script()[0] == 0
    db.psql("alter table auth.users disable trigger ensure_profile_on_auth_user_insert")
    rc, out = run_script()
    assert rc == 1 and "insert trigger" in out
    db.psql("alter table auth.users enable trigger ensure_profile_on_auth_user_insert; "
            "alter table auth.users disable trigger release_profile_on_auth_user_delete")
    rc, out = run_script()
    assert rc == 1 and "delete trigger" in out
    db.psql("alter table auth.users enable trigger release_profile_on_auth_user_delete")
    assert run_script()[0] == 0


def test_down_removes_trigger_keeps_profiles_restores_plain_insert(db):
    before = db.one("select count(*) from profiles")
    db.migration(DOWN)
    assert db.one("select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal") == "0"
    assert db.one("select count(*) from pg_proc where proname like 'ensure_profile%' or proname like 'release_profile%'") == "0"
    assert db.one("select count(*) from profiles") == before
    assert "on conflict" not in db.one("select pg_get_functiondef('public.portal_complete_signup(uuid,uuid,text,text,text,text)'::regprocedure)")
    assert db.one("select has_function_privilege('authenticated', 'public.portal_complete_signup(uuid,uuid,text,text,text,text)', 'EXECUTE')") == "f"
    db.migration(UP)  # re-apply after down works
