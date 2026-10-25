"""0136 against disposable Postgres and PostgREST; no production connections."""

import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import time
import urllib.error
import urllib.request

import pytest


MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
ORG = "00000000-0000-4000-8000-0000000000a1"
OTHER = "00000000-0000-4000-8000-0000000000a2"
MEMBER = "00000000-0000-4000-8000-0000000000b1"
OUTSIDER = "00000000-0000-4000-8000-0000000000b2"
IDS = {
    "approvals": "00000000-0000-4000-8000-0000000000c1",
    "environments": "00000000-0000-4000-8000-0000000000c2",
    "workflow_runs": "00000000-0000-4000-8000-0000000000c3",
}
WORKSPACE = "00000000-0000-4000-8000-0000000000d1"
OTHER_WORKSPACE = "00000000-0000-4000-8000-0000000000d2"
PROJECT = "00000000-0000-4000-8000-0000000000d3"
OTHER_PROJECT = "00000000-0000-4000-8000-0000000000d4"
SITE = "00000000-0000-4000-8000-0000000000d5"
POLICY = "00000000-0000-4000-8000-0000000000d6"
WORKFLOW = "00000000-0000-4000-8000-0000000000d7"
VERSION = "00000000-0000-4000-8000-0000000000d8"
CLERK = "org_other_0136"


def run(args, sql=None, check=True):
    result = subprocess.run(args, input=sql, text=True, encoding="utf-8", capture_output=True)
    if check and result.returncode:
        raise RuntimeError(f"{args[:4]} exited {result.returncode}: {result.stderr}{result.stdout}")
    return result


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class Database:
    def __init__(self):
        tag = secrets.token_hex(4)
        self.pg = f"rls0136-pg-{tag}"
        self.rest = f"rls0136-rest-{tag}"
        self.secret = f"rls0136-{secrets.token_hex(16)}"
        self.port = free_port()
        self.up = False

    def psql(self, sql):
        return run(["docker", "exec", "-i", self.pg, "psql", "-U", "postgres",
                    "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-qAt"], sql).stdout.strip()

    def migration(self, name):
        sql = (MIGRATIONS / name).read_text(encoding="utf-8")
        if name == "0136_control_plane_tables_writes_only.sql" and os.environ.get("RLS0136_MUTATE_ENVIRONMENTS") == "1":
            sql = "\n".join(line for line in sql.splitlines()
                            if not line.startswith(("drop policy if exists environments_", "revoke insert, update, delete, truncate, references, trigger on public.environments ")))
        self.psql(sql)

    def phase(self, up):
        if self.up != up:
            self.migration("0136_control_plane_tables_writes_only.sql" if up
                           else "0136_control_plane_tables_writes_only.down.sql")
            self.up = up
            time.sleep(1)

    def jwt(self, role, sub=None, **claims):
        def encode(obj):
            return base64.urlsafe_b64encode(json.dumps(obj, separators=(",", ":")).encode()).rstrip(b"=").decode()
        payload = {"role": role, "exp": int(time.time()) + 3600, **claims}
        if sub:
            payload["sub"] = sub
        message = encode({"alg": "HS256", "typ": "JWT"}) + "." + encode(payload)
        signature = base64.urlsafe_b64encode(
            hmac.new(self.secret.encode(), message.encode(), hashlib.sha256).digest()
        ).rstrip(b"=").decode()
        return message + "." + signature

    def http(self, method, path, token, body=None):
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/{path}", method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                     "Prefer": "return=representation"},
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.status, json.loads(response.read() or b"[]")
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read() or b"{}")

    def seed_rows(self):
        self.psql(f"""
            insert into approvals(id,approval_policy_id,resource_type,resource_id,organization_id,status)
              values ('{IDS["approvals"]}','{POLICY}','test','{PROJECT}','{ORG}','pending')
              on conflict (id) do update set status='pending';
            insert into environments(id,organization_id,workspace_id,site_id,environment_type,name,status)
              values ('{IDS["environments"]}','{ORG}','{WORKSPACE}','{SITE}','production','test','pending')
              on conflict (id) do update set status='pending';
            insert into workflow_runs(id,workflow_version_id,organization_id,trigger_type,actor_type,status,risk_level)
              values ('{IDS["workflow_runs"]}','{VERSION}','{ORG}','manual','human','pending','low')
              on conflict (id) do update set status='pending';
        """)


@pytest.fixture(scope="module")
def db():
    database = Database()
    run(["docker", "run", "-d", "--name", database.pg, "--label", "awarewave.test=rls0136",
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
        # 0011 first avoids the known 0007/0011 media_assets shape conflict (0038 documents fresh replay).
        for name in (
            "0001_core.sql", "0002_factory.sql", "0003_agents_approvals_observability.sql",
            "0004_rls_helpers.sql", "0011_ops_console_control_plane.sql",
            "0007_v3_skeleton_modules.sql",
            "0008_decision_engine_recommendations.sql", "0009_cx_retention_upsell_baseline.sql",
            "0010_clerk_org_mapping_and_rls_expansion.sql",
            "0014_enable_public_table_rls.sql",
            "0016_ops_console_and_permission_catalog_rls_policies.sql",
            "0018_rls_initplan_and_workflow_runs_index_dedupe.sql",
        ):
            database.migration(name)
        database.psql(f"""
            insert into organizations(id,type,name,slug) values
              ('{ORG}','client','Member org','rls0136-member'),
              ('{OTHER}','client','Other org','rls0136-other');
            insert into profiles(id,email) values
              ('{MEMBER}','member@rls0136.test'),('{OUTSIDER}','outsider@rls0136.test');
            insert into organization_memberships(organization_id,user_id,status)
              values ('{ORG}','{MEMBER}','active');
            insert into workspaces(id,organization_id,name,slug) values
              ('{WORKSPACE}','{ORG}','Member workspace','member'),
              ('{OTHER_WORKSPACE}','{OTHER}','Other workspace','other');
            insert into projects(id,organization_id,workspace_id,name) values
              ('{PROJECT}','{ORG}','{WORKSPACE}','Member project'),
              ('{OTHER_PROJECT}','{OTHER}','{OTHER_WORKSPACE}','Other project');
            insert into sites(id,organization_id,workspace_id,project_id,name)
              values ('{SITE}','{ORG}','{WORKSPACE}','{PROJECT}','Member site');
            insert into approval_policies(id,name,slug,scope_type,resource_type)
              values ('{POLICY}','Test','rls0136','global','test');
            insert into workflows(id,scope_type,name,slug,domain,orchestrator_type,risk_level,default_version)
              values ('{WORKFLOW}','global','Test','rls0136','test','manual','low','1');
            insert into workflow_versions(id,workflow_id,version,definition_ref)
              values ('{VERSION}','{WORKFLOW}','1','test');
            insert into clerk_organization_mappings(clerk_organization_id,organization_id,status)
              values ('{CLERK}','{OTHER}','active');
            grant anon, authenticated, service_role to postgres;
        """)
        database.seed_rows()
        ip = run(["docker", "inspect", "-f", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", database.pg]).stdout.strip()
        run(["docker", "run", "-d", "--name", database.rest, "-p", f"127.0.0.1:{database.port}:3000",
             "-e", f"PGRST_DB_URI=postgres://postgres:verify@{ip}:5432/postgres",
             "-e", "PGRST_DB_SCHEMAS=public", "-e", "PGRST_DB_ANON_ROLE=anon",
             "-e", f"PGRST_JWT_SECRET={database.secret}", "postgrest/postgrest:v14.6"])
        for _ in range(30):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{database.port}/", timeout=2)
                break
            except (urllib.error.URLError, TimeoutError):
                time.sleep(1)
        else:
            raise RuntimeError("PostgREST did not start")
        yield database
    finally:
        run(["docker", "rm", "-f", database.rest, database.pg], check=False)


def test_member_write_blocked_after_0136(db):
    member = db.jwt("authenticated", MEMBER)
    for up, expected in ((False, 200), (True, 403)):
        db.phase(up)
        db.seed_rows()
        for table in IDS:
            new_status = "approved" if table == "approvals" else "ready" if table == "environments" else "completed"
            status, rows = db.http("PATCH", f"{table}?id=eq.{IDS[table]}", member, {"status": new_status})
            assert status == expected, (up, table, "PATCH", status)
            if not up:
                assert len(rows) == 1 and rows[0]["id"] == IDS[table] and rows[0]["status"] == new_status
            status, rows = db.http("DELETE", f"{table}?id=eq.{IDS[table]}", member)
            assert status == expected, (up, table, "DELETE", status)
            if not up:
                assert len(rows) == 1 and rows[0]["id"] == IDS[table]
            db.seed_rows()


def test_member_select_unchanged(db):
    db.phase(True)
    db.seed_rows()
    member = db.jwt("authenticated", MEMBER)
    for table in IDS:
        status, rows = db.http("GET", f"{table}?id=eq.{IDS[table]}&select=id", member)
        assert status == 200 and rows == [{"id": IDS[table]}], (table, status, rows)


def test_service_role_writes_unchanged(db):
    db.phase(True)
    db.seed_rows()
    service = db.jwt("service_role")
    records = {
        "approvals": {"approval_policy_id": POLICY, "resource_type": "test", "resource_id": PROJECT,
                      "organization_id": ORG, "status": "pending"},
        "environments": {"organization_id": ORG, "workspace_id": WORKSPACE, "site_id": SITE,
                         "environment_type": "production", "name": "service", "status": "pending"},
        "workflow_runs": {"workflow_version_id": VERSION, "organization_id": ORG,
                          "trigger_type": "manual", "actor_type": "human", "status": "pending", "risk_level": "low"},
    }
    for table, fields in records.items():
        status, rows = db.http("PATCH", f"{table}?id=eq.{IDS[table]}", service, {"status": fields["status"]})
        assert status == 200 and len(rows) == 1 and rows[0]["id"] == IDS[table], (table, "PATCH", status, rows)
        new_id = IDS[table][:-2] + "e" + IDS[table][-1]
        status, rows = db.http("POST", table, service, {"id": new_id, **fields})
        assert status == 201 and len(rows) == 1 and rows[0]["id"] == new_id, (table, "INSERT", status, rows)
        status, rows = db.http("DELETE", f"{table}?id=eq.{new_id}", service)
        assert status == 200 and len(rows) == 1 and rows[0]["id"] == new_id, (table, "DELETE", status, rows)


def test_user_metadata_org_id_ignored(db):
    outsider_user = db.jwt("authenticated", OUTSIDER, user_metadata={"org_id": CLERK})
    outsider_app = db.jwt("authenticated", OUTSIDER, app_metadata={"org_id": CLERK})
    db.phase(False)
    status, rows = db.http("GET", f"projects?id=eq.{OTHER_PROJECT}&select=id", outsider_user)
    assert status == 200 and rows == [{"id": OTHER_PROJECT}]
    db.phase(True)
    status, rows = db.http("GET", f"projects?id=eq.{OTHER_PROJECT}&select=id", outsider_user)
    assert status == 200 and rows == []
    status, rows = db.http("GET", f"projects?id=eq.{OTHER_PROJECT}&select=id", outsider_app)
    assert status == 200 and rows == [{"id": OTHER_PROJECT}]


def test_down_then_up(db):
    db.phase(True)
    db.phase(False)
    db.seed_rows()
    member = db.jwt("authenticated", MEMBER)
    status, rows = db.http("PATCH", f"environments?id=eq.{IDS['environments']}", member, {"status": "ready"})
    assert status == 200 and len(rows) == 1 and rows[0]["status"] == "ready"
    db.phase(True)
    status, _ = db.http("PATCH", f"environments?id=eq.{IDS['environments']}", member, {"status": "pending"})
    assert status == 403
