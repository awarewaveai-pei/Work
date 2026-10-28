"""0138 against a disposable Postgres (no published host port): project columns, checks, asset link, smoke-row archive, down."""

from pathlib import Path
import secrets
import subprocess
import time

import pytest


MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
ORG = "00000000-0000-4000-8000-0000000000a1"
SMOKE = {
    "921292cd-4963-4f42-bf5a-99b6f2eb6f90": "release",
    "cb23d63c-80cc-4fbb-ae3b-c61196625233": "measure",
    "35a0ddbd-bcff-4d60-855a-f26d15c843d1": "measure",
    "f2c8333b-4f1e-481c-80f2-dcf0ad280ee2": "produce",
}


def run(args, sql=None, check=True):
    result = subprocess.run(args, input=sql, text=True, encoding="utf-8", capture_output=True)
    if check and result.returncode:
        raise RuntimeError(f"{args[:4]} exited {result.returncode}: {result.stderr}{result.stdout}")
    return result


class Database:
    def __init__(self):
        self.name = f"m0138-pg-{secrets.token_hex(4)}"

    def psql(self, sql, check=True):
        return run(["docker", "exec", "-i", self.name, "psql", "-U", "postgres", "-d", "postgres",
                    "-X", "-v", "ON_ERROR_STOP=1", "-qAt"], sql, check)

    def value(self, sql):
        return self.psql(sql).stdout.strip()

    def migrate(self, name):
        self.psql((MIGRATIONS / name).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def db():
    database = Database()
    run(["docker", "run", "-d", "--name", database.name, "--label", "awarewave.test=m0138",
         "-e", "POSTGRES_PASSWORD=verify", "postgres:15.8-alpine"])
    try:
        for _ in range(60):
            if run(["docker", "exec", database.name, "pg_isready", "-U", "postgres"], check=False).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("Postgres did not start")
        database.psql("""
            create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
            create schema auth;
            create function auth.jwt() returns jsonb language sql stable as $$
              select nullif(current_setting('request.jwt.claims', true), '')::jsonb; $$;
            create function auth.uid() returns uuid language sql stable as $$
              select nullif(auth.jwt() ->> 'sub', '')::uuid; $$;
        """)
        # 0011 before 0007: same order as test_0137 (documented fresh-replay media_assets conflict).
        for name in ("0001_core.sql", "0002_factory.sql", "0003_agents_approvals_observability.sql", "0004_rls_helpers.sql",
                     "0011_ops_console_control_plane.sql", "0007_v3_skeleton_modules.sql",
                     "0065_media_production_persistence.sql", "0070_media_story_bible_revisions.sql",
                     "0071_media_production_projects.sql"):
            database.migrate(name)
        database.psql(f"insert into organizations(id, type, name, slug) values ('{ORG}', 'client', 'Org', 'org');")
        database.psql("".join(
            f"insert into media_production_projects(id, organization_id, title, production_mode, lifecycle_stage) "
            f"values ('{pid}', '{ORG}', 'smoke', 'quick_video', '{stage}');" for pid, stage in SMOKE.items()))
        yield database
    finally:
        run(["docker", "rm", "-f", database.name], check=False)


def insert_project(db, extra_cols="", extra_vals=""):
    return db.psql(f"insert into media_production_projects(organization_id, title, production_mode{extra_cols}) "
                   f"values ('{ORG}', 't', 'quick_video'{extra_vals}) returning id;", check=False)


def test_up_adds_columns_checks_link_and_archives_smoke_rows(db):
    db.migrate("0138_media_projects_v2.sql")
    pid = insert_project(db).stdout.strip()
    assert db.value(f"select autonomy || ',' || source || ',' || array_to_string(formats, '|') "
                    f"from media_production_projects where id = '{pid}'") == "guided,manual,16x9"
    assert insert_project(db, ", autonomy", ", 'whenever'").returncode != 0
    assert insert_project(db, ", source", ", 'email'").returncode != 0
    assert insert_project(db, ", formats", ", '{1x1}'").returncode != 0
    assert insert_project(db, ", formats", ", '{}'").returncode != 0
    assert insert_project(db, ", formats, autonomy", ", '{16x9,4x5}', 'auto_after_render'").returncode == 0
    db.psql(f"insert into media_assets(organization_id, storage_backend, asset_domain, object_key, media_project_id) "
            f"values ('{ORG}', 'r2', 'ai_generated', 'video/x/16x9.mp4', '{pid}');")
    assert db.psql(f"delete from media_production_projects where id = '{pid}';", check=False).returncode != 0
    assert db.value("select count(*) from media_production_projects where lifecycle_stage = 'archived'") == "4"


def test_down_restores_and_up_reapplies(db):
    db.psql("delete from media_assets; delete from media_production_projects where title = 't';")
    db.migrate("0138_media_projects_v2.down.sql")
    assert db.value("select count(*) from information_schema.columns where table_name = 'media_assets' "
                    "and column_name = 'media_project_id'") == "0"
    assert db.value("select count(*) from information_schema.columns where table_name = 'media_production_projects' "
                    "and column_name in ('autonomy','source','source_ref','formats','last_error')") == "0"
    stages = dict(row.split("|") for row in db.value(
        "select id || '|' || lifecycle_stage from media_production_projects").splitlines())
    assert stages == SMOKE
    db.migrate("0138_media_projects_v2.sql")
    db.migrate("0138_media_projects_v2.sql")  # idempotent re-run
    assert db.value("select count(*) from media_production_projects where lifecycle_stage = 'archived'") == "4"
