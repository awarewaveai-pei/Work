"""0137 against disposable Postgres and PostgREST without a published host port."""

import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import subprocess
import time

import pytest


MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
ORG = "00000000-0000-4000-8000-0000000000a1"
MEMBER = "00000000-0000-4000-8000-0000000000b1"
WORKSPACE = "00000000-0000-4000-8000-0000000000d1"
REFERRAL = "00000000-0000-4000-8000-0000000000e1"
SERVICE_REFERRAL = "00000000-0000-4000-8000-0000000000e2"
UP = "0137_partner_referrals_writes_only.sql"
DOWN = "0137_partner_referrals_writes_only.down.sql"

HTTP_CLIENT = """
import json, sys, urllib.error, urllib.request
method, path, token, body = json.load(sys.stdin)
request = urllib.request.Request(
    'http://127.0.0.1:3000/' + path,
    method=method,
    data=json.dumps(body).encode() if body is not None else None,
    headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json',
             'Prefer': 'return=representation'},
)
try:
    with urllib.request.urlopen(request, timeout=10) as response:
        print(json.dumps([response.status, json.loads(response.read() or b'[]')]))
except urllib.error.HTTPError as error:
    print(json.dumps([error.code, json.loads(error.read() or b'{}')]))
"""


def run(args, sql=None, check=True):
    result = subprocess.run(args, input=sql, text=True, encoding="utf-8", capture_output=True)
    if check and result.returncode:
        raise RuntimeError(f"{args[:4]} exited {result.returncode}: {result.stderr}{result.stdout}")
    return result


class Database:
    def __init__(self):
        tag = secrets.token_hex(4)
        self.pg = f"rls0137-pg-{tag}"
        self.rest = f"rls0137-rest-{tag}"
        self.client = f"rls0137-client-{tag}"
        self.secret = f"rls0137-{secrets.token_hex(16)}"
        self.up = False

    def psql(self, sql):
        return run(["docker", "exec", "-i", self.pg, "psql", "-U", "postgres",
                    "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-qAt"], sql).stdout.strip()

    def migration(self, name):
        sql = (MIGRATIONS / name).read_text(encoding="utf-8")
        if name == UP and os.environ.get("RLS0137_MUTATE_GUARD") == "1":
            sql = "\n".join(line for line in sql.splitlines() if not line.startswith((
                "drop policy if exists partner_referrals_",
                "revoke insert, update, delete, truncate, references, trigger on public.partner_referrals ",
            )))
        self.psql(sql)

    def phase(self, up):
        if self.up != up:
            self.migration(UP if up else DOWN)
            self.up = up
            time.sleep(1)

    def jwt(self, role, sub=None):
        def encode(obj):
            return base64.urlsafe_b64encode(json.dumps(obj, separators=(",", ":")).encode()).rstrip(b"=").decode()
        payload = {"role": role, "exp": int(time.time()) + 3600}
        if sub:
            payload["sub"] = sub
        message = encode({"alg": "HS256", "typ": "JWT"}) + "." + encode(payload)
        signature = base64.urlsafe_b64encode(
            hmac.new(self.secret.encode(), message.encode(), hashlib.sha256).digest()
        ).rstrip(b"=").decode()
        return message + "." + signature

    def http(self, method, path, token, body=None):
        output = run(["docker", "exec", "-i", self.client, "python", "-c", HTTP_CLIENT],
                     json.dumps([method, path, token, body])).stdout
        return json.loads(output)

    def seed_row(self):
        self.psql(f"""
            insert into partner_referrals(id,organization_id,workspace_id,partner_name,status)
              values ('{REFERRAL}','{ORG}','{WORKSPACE}','Partner','open')
              on conflict (id) do update set status='open';
        """)


@pytest.fixture(scope="module")
def db():
    database = Database()
    run(["docker", "run", "-d", "--name", database.pg, "--label", "awarewave.test=rls0137",
         "-e", "POSTGRES_PASSWORD=verify", "postgres:15.8-alpine"])
    try:
        for _ in range(60):
            if run(["docker", "exec", database.pg, "pg_isready", "-U", "postgres"], check=False).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("Postgres did not start")
        database.psql("""
            create role anon nologin;
            create role authenticated nologin;
            create role service_role nologin bypassrls;
            grant usage on schema public to anon, authenticated, service_role;
            alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
            alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
            alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
            create schema auth;
            grant usage on schema auth to anon, authenticated, service_role;
            create function auth.jwt() returns jsonb language sql stable as $$
              select nullif(current_setting('request.jwt.claims', true), '')::jsonb;
            $$;
            create function auth.uid() returns uuid language sql stable as $$
              select nullif(auth.jwt() ->> 'sub', '')::uuid;
            $$;
        """)
        # 0011 first avoids the documented 0007/0011 fresh-replay media_assets conflict.
        for name in (
            "0001_core.sql", "0002_factory.sql", "0003_agents_approvals_observability.sql",
            "0004_rls_helpers.sql", "0011_ops_console_control_plane.sql",
            "0007_v3_skeleton_modules.sql", "0008_decision_engine_recommendations.sql",
            "0009_cx_retention_upsell_baseline.sql", "0010_clerk_org_mapping_and_rls_expansion.sql",
            "0014_enable_public_table_rls.sql", "0016_ops_console_and_permission_catalog_rls_policies.sql",
            "0018_rls_initplan_and_workflow_runs_index_dedupe.sql",
            "0136_control_plane_tables_writes_only.sql",
        ):
            database.migration(name)
        database.psql(f"""
            insert into organizations(id,type,name,slug)
              values ('{ORG}','client','Member org','rls0137-member');
            insert into profiles(id,email) values ('{MEMBER}','member@rls0137.test');
            insert into organization_memberships(organization_id,user_id,status)
              values ('{ORG}','{MEMBER}','active');
            insert into workspaces(id,organization_id,name,slug)
              values ('{WORKSPACE}','{ORG}','Member workspace','member');
            grant anon, authenticated, service_role to postgres;
        """)
        database.seed_row()
        run(["docker", "run", "-d", "--name", database.rest,
             "--network", f"container:{database.pg}",
             "-e", "PGRST_DB_URI=postgres://postgres:verify@127.0.0.1:5432/postgres",
             "-e", "PGRST_DB_SCHEMAS=public", "-e", "PGRST_DB_ANON_ROLE=anon",
             "-e", f"PGRST_JWT_SECRET={database.secret}", "postgrest/postgrest:v14.6"])
        run(["docker", "run", "-d", "--name", database.client,
             "--network", f"container:{database.pg}",
             "python:3.12-slim", "python", "-c", "import time; time.sleep(3600)"])
        for _ in range(30):
            try:
                database.http("GET", "", database.jwt("anon"))
                break
            except RuntimeError:
                time.sleep(1)
        else:
            raise RuntimeError("PostgREST did not start")
        yield database
    finally:
        run(["docker", "rm", "-f", database.client, database.rest, database.pg], check=False)


def test_partner_referral_member_and_service_writes(db):
    member = db.jwt("authenticated", MEMBER)
    service = db.jwt("service_role")
    for up, expected in ((False, 200), (True, 403), (False, 200), (True, 403)):
        db.phase(up)
        db.seed_row()
        status, rows = db.http("GET", f"partner_referrals?id=eq.{REFERRAL}&select=id", member)
        assert status == 200 and rows == [{"id": REFERRAL}], (up, "SELECT", status, rows)
        status, rows = db.http("PATCH", f"partner_referrals?id=eq.{REFERRAL}", member,
                               {"status": "closed"})
        assert status == expected, (up, "PATCH", status, rows)
        if not up:
            assert len(rows) == 1 and rows[0]["status"] == "closed"
        status, rows = db.http("DELETE", f"partner_referrals?id=eq.{REFERRAL}", member)
        assert status == expected, (up, "DELETE", status, rows)
        if not up:
            assert len(rows) == 1 and rows[0]["id"] == REFERRAL
        if up:
            status, rows = db.http("PATCH", f"partner_referrals?id=eq.{REFERRAL}", service,
                                   {"status": "closed"})
            assert status == 200 and len(rows) == 1 and rows[0]["status"] == "closed"
            status, rows = db.http("POST", "partner_referrals", service, {
                "id": SERVICE_REFERRAL, "organization_id": ORG, "workspace_id": WORKSPACE,
                "partner_name": "Service partner",
            })
            assert status == 201 and len(rows) == 1 and rows[0]["id"] == SERVICE_REFERRAL
            status, rows = db.http("DELETE", f"partner_referrals?id=eq.{SERVICE_REFERRAL}", service)
            assert status == 200 and len(rows) == 1 and rows[0]["id"] == SERVICE_REFERRAL
