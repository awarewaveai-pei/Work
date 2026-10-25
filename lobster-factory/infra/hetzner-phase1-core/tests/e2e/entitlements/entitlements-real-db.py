#!/usr/bin/env python3
"""ADR 017 step 3 against a real database, enforce mode, touching no production.

A throwaway Postgres with 0001/0062/0063/0066/0077/0092/0110/0117/0118 (the expire route tops up all-features rows; the three accounts 0118 needs are seeded first) and PostgREST in front of it (same images as the smartlink e2e);
a fresh Ed25519 key pair; then lib/entitlements/__tests__/entitlements.e2e.test.ts drives the real routes:
  the usable-features list greys a credits feature at zero balance, the paid route answers 403 {code:no_credits},
  a wallet grant makes both usable; the cognitive permit issuer refuses without an entitlement row and issues with one.
Last, the cognitive engine's Python check_entitlement verifies that issued permit (cross-language, enforce).
    python lobster-factory/infra/hetzner-phase1-core/tests/e2e/entitlements/entitlements-real-db.py
--suite payments (ADR 017 step 4a) adds 0092/0117/0118 (with the three accounts 0118 seeds), 0120, 0127 and 0128, then drives
POST /api/webhooks/payments/local, /ops/billing and the client hub 帳務 tab through lib/entitlements/__tests__/payments.e2e.test.ts.
    python lobster-factory/infra/hetzner-phase1-core/tests/e2e/entitlements/entitlements-real-db.py --suite payments
"""
from __future__ import annotations

import json
import os
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
APP = ROOT / "lobster-factory/infra/hetzner-phase1-core/apps/next-admin"
COS = ROOT / "Projects/internal/cognitive-engineering-os"
MIG = ROOT / "lobster-factory/packages/db/migrations"
TAG = secrets.token_hex(4)
PG, REST = f"entitlements-e2e-pg-{TAG}", f"entitlements-e2e-rest-{TAG}"


def free_port() -> str:
    # A fixed port breaks when Windows reserves its range (Hyper-V/WinNAT exclusions change across reboots).
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return str(sock.getsockname()[1])


PORT = os.environ.get("ENTITLEMENTS_REST_PORT") or free_port()
SECRET = "entitlements-e2e-" + secrets.token_hex(16)


def run(args, sql=None, check=True, **kw):
    r = subprocess.run(args, input=sql, text=True, encoding="utf-8", capture_output=True, **kw)
    if check and r.returncode:
        raise RuntimeError(f"{args[:4]} -> {r.returncode}\n{r.stderr}{r.stdout}")
    return r


def psql(sql):
    return run(["docker", "exec", "-i", PG, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-q"], sql)


def migration(prefix):
    found = [p for p in MIG.glob(prefix + "_*.sql") if not p.name.endswith(".down.sql")]
    assert len(found) == 1, (prefix, found)
    psql(found[0].read_text(encoding="utf-8"))


# 0118 seeds all-features rows for these three accounts and refuses to apply without them.
SEED_0118 = """insert into organizations(id, type, name, slug, kind) values
  ('00000000-0000-4000-8000-0000000000a1', 'agency', 'AwareWave', 'e2e-internal', 'internal'),
  ('00000000-0000-4000-8000-0000000000e1', 'client', 'EdD', 'edd-research', 'customer'),
  ('00000000-0000-4000-8000-0000000000f1', 'client', 'Soulful', 'soulful-expression', 'customer');"""
SUITES = {
    "entitlements": {"migrations": ("0062", "0063", "0066", "0077", "0092", "0110", "0117"), "after": ("0118",), "test": "lib/entitlements/__tests__/entitlements.e2e.test.ts"},
    "payments": {"migrations": ("0062", "0063", "0066", "0077", "0092", "0110", "0117"), "after": ("0118", "0120", "0127", "0128"),
                 "test": "lib/entitlements/__tests__/payments.e2e.test.ts"},
}


def main() -> int:
    suite_name = sys.argv[sys.argv.index("--suite") + 1] if "--suite" in sys.argv else "entitlements"
    suite = SUITES[suite_name]
    run(["docker", "run", "-d", "--name", PG, "--label", "awarewave.test=entitlements-e2e", "-e", "POSTGRES_PASSWORD=verify", "postgres:15.8-alpine"])
    try:
        for _ in range(60):
            if run(["docker", "exec", PG, "pg_isready", "-U", "postgres"], check=False).returncode == 0 and \
               run(["docker", "exec", PG, "psql", "-U", "postgres", "-c", "select 1"], check=False).returncode == 0:
                break
            time.sleep(1)
        print(f"== schema (0001, {', '.join(suite['migrations'] + suite['after'])})")
        psql("""create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
          grant usage on schema public to anon, authenticated, service_role;
          alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
          alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
          alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
          create schema auth;
          create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;""")
        migration("0001")
        psql("""create function public.user_has_org_membership(p_org_id uuid) returns boolean language sql stable security definer
          set search_path=public,pg_temp as $$ select exists (select 1 from organization_memberships where organization_id=p_org_id
          and user_id=auth.uid() and status='active'); $$;""")
        for prefix in suite["migrations"]:
            migration(prefix)
        if suite["after"]:
            psql(SEED_0118)
            for prefix in suite["after"]:
                migration(prefix)
        psql("grant service_role to postgres; grant anon to postgres; grant authenticated to postgres;")
        ip = run(["docker", "inspect", "-f", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", PG]).stdout.strip()
        print(f"== PostgREST on 127.0.0.1:{PORT}")
        run(["docker", "run", "-d", "--name", REST, "-p", f"127.0.0.1:{PORT}:3000", "-e", f"PGRST_DB_URI=postgres://postgres:verify@{ip}:5432/postgres",
             "-e", "PGRST_DB_SCHEMAS=public", "-e", "PGRST_DB_ANON_ROLE=anon", "-e", f"PGRST_JWT_SECRET={SECRET}", "postgrest/postgrest:v14.6"])
        for _ in range(30):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/", timeout=2)
                break
            except Exception:  # noqa: BLE001 -- not up yet
                time.sleep(1)
        with tempfile.TemporaryDirectory() as tmp:
            permit_file = Path(tmp) / "permit.json"
            env = {**os.environ, "ENTITLEMENTS_REST": f"http://127.0.0.1:{PORT}", "ENTITLEMENTS_JWT_SECRET": SECRET, "ENTITLEMENTS_PERMIT_OUT": str(permit_file)}
            print("== next-admin routes against it (enforce)")
            npx = "npx.cmd" if os.name == "nt" else "npx"
            vt = subprocess.run([npx, "vitest", "run", suite["test"]], cwd=APP, env=env)
            if vt.returncode:
                return vt.returncode
            if suite_name != "entitlements":
                print(json.dumps({"result": "PASS", "suite": suite_name, "production_touched": False}))
                return 0
            print("== cognitive check_entitlement verifies the issued permit (enforce)")
            out = json.loads(permit_file.read_text(encoding="utf-8"))
            py = run([sys.executable, "-c", PY_CHECK, json.dumps(out)], cwd=COS, env={**os.environ, "PYTHONPATH": str(COS)})
            print(py.stdout.strip())
        print(json.dumps({"result": "PASS", "production_touched": False}))
        return 0
    finally:
        run(["docker", "rm", "-f", REST, PG], check=False)


PY_CHECK = r"""
import json, sys, uuid
from ai_lego.platform.entitlement import check
o = json.loads(sys.argv[1])
class Store:
    def get_tenant(self, t): return {"status": "active"}
    def record_entitlement_check(self, *a): pass
env = {"ENTITLEMENT_MODE": "enforce", "ENTITLEMENT_PUBLIC_KEYS": "k1:" + o["public_pem"].replace("\n", "\\n"),
       "ENTITLEMENT_BILLING_ACCOUNTS": "tenant-1=" + o["org"], "ENTITLEMENT_ISSUER_URL": "https://unused.test", "ENTITLEMENT_ISSUER_TOKEN": "x"}
g = check.check_entitlement(Store(), "tenant-1", o["feature"], o["actor"], permit=o["permit"], env=env)
assert g.allowed and not g.shadow and g.entitlement_id == o["entitlement_id"], (g.allowed, g.reason)
bad = check.check_entitlement(Store(), "tenant-1", o["feature"], "cognitive:someone-else", permit=o["permit"], env=env)
assert not bad.allowed and bad.reason.startswith("invalid_permit:"), bad.reason
print("COGNITIVE_CHECK_VERIFIED_REAL_PERMIT_OK", g.entitlement_id)
"""

if __name__ == "__main__":
    raise SystemExit(main())
