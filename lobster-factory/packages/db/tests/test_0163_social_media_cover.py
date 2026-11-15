"""0163 against a disposable Postgres (social_media as 0096 defines it); no production connections."""

from pathlib import Path
import secrets
import subprocess
import time

import pytest

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "migrations"
UP = "0163_social_media_cover.sql"
DOWNS = [MIGRATIONS / "0163_social_media_cover.down.sql", ROOT / "scripts" / "0163_social_media_cover_down.sql"]
ORG = "00000000-0000-4000-8000-0000000000a1"
ORG2 = "00000000-0000-4000-8000-0000000000a2"
VIDEO = "00000000-0000-4000-8000-0000000000b1"
IMAGE = "00000000-0000-4000-8000-0000000000b2"
IMAGE2 = "00000000-0000-4000-8000-0000000000b3"
FOREIGN = "00000000-0000-4000-8000-0000000000b4"
VIDEO2 = "00000000-0000-4000-8000-0000000000b5"


class Db:
    def __init__(self):
        self.name = f"t0163-{secrets.token_hex(4)}"

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

    def run_file(self, path, check=True):
        return self.psql(Path(path).read_text(encoding="utf-8"), check)


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
        # 0096's social_media, column for column (lobster-factory/packages/db/migrations/0096_social_manager.sql:151-163)
        d.psql(f"""
            create table public.organizations (id uuid primary key);
            create table public.social_media (
              id uuid primary key default gen_random_uuid(),
              organization_id uuid not null references public.organizations(id) on delete cascade,
              kind text not null check (kind in ('image', 'video')),
              file_name text not null check (length(file_name) between 1 and 255),
              storage_path text not null, postiz_media_id text, postiz_path text, bytes bigint check (bytes >= 0),
              created_by text not null, created_at timestamptz not null default now(),
              unique (id, organization_id));
            insert into organizations values ('{ORG}'), ('{ORG2}');
            insert into social_media (id, organization_id, kind, file_name, storage_path, created_by) values
              ('{VIDEO}', '{ORG}', 'video', '16x9.mp4', 'v', 't'), ('{IMAGE}', '{ORG}', 'image', 'c.jpg', 'c', 't'),
              ('{IMAGE2}', '{ORG}', 'image', 'd.jpg', 'd', 't'), ('{FOREIGN}', '{ORG2}', 'image', 'f.jpg', 'f', 't'),
              ('{VIDEO2}', '{ORG}', 'video', '9x16.mp4', 'v2', 't');
        """)
        yield d
    finally:
        d.sh(["docker", "rm", "-f", d.name], check=False)


def test_up_is_idempotent_and_additive(db):
    db.run_file(MIGRATIONS / UP)
    db.run_file(MIGRATIONS / UP)
    assert db.one("select count(*) from social_media where cover_media_id is null") == "5"


def test_cover_rules(db):
    db.psql(f"update social_media set cover_kind = 'image', cover_media_id = '{IMAGE}' where id = '{VIDEO}'")
    assert db.one(f"select cover_media_id from social_media where id = '{VIDEO}'") == IMAGE
    # another organization's image, a cover on an image, a video as its own cover: all refused
    assert db.psql(f"update social_media set cover_kind = 'image', cover_media_id = '{FOREIGN}' where id = '{VIDEO}'", check=False).returncode != 0
    assert db.psql(f"update social_media set cover_kind = 'image', cover_media_id = '{IMAGE}' where id = '{IMAGE2}'", check=False).returncode != 0
    assert db.psql(f"update social_media set cover_kind = 'image', cover_media_id = '{VIDEO}' where id = '{VIDEO}'", check=False).returncode != 0
    # Codex 10974254 F2: another video of the same organization is not an image, so it cannot be a cover
    assert db.psql(f"update social_media set cover_kind = 'image', cover_media_id = '{VIDEO2}' where id = '{VIDEO}'", check=False).returncode != 0
    # the kind cannot be left out or lied about: no cover_kind, or 'video', is refused by the CHECK
    assert db.psql(f"update social_media set cover_kind = null, cover_media_id = '{IMAGE2}' where id = '{VIDEO}'", check=False).returncode != 0
    assert db.psql(f"update social_media set cover_kind = 'video', cover_media_id = '{VIDEO2}' where id = '{VIDEO}'", check=False).returncode != 0
    # deleting the cover image clears the pointer only; the video row stays with its organization
    db.psql(f"delete from social_media where id = '{IMAGE}'")
    assert db.one(f"select coalesce(cover_media_id::text, 'NULL') || '|' || coalesce(cover_kind, 'NULL') || '|' || organization_id from social_media where id = '{VIDEO}'") == f"NULL|NULL|{ORG}"


@pytest.mark.parametrize("down", DOWNS, ids=["migrations", "scripts"])
def test_both_down_files_revert_and_up_reapplies(db, down):
    assert DOWNS[0].read_text(encoding="utf-8") == DOWNS[1].read_text(encoding="utf-8")
    db.psql(f"update social_media set cover_kind = 'image', cover_media_id = '{IMAGE2}' where id = '{VIDEO}'")
    db.run_file(down)
    assert db.one("select count(*) from information_schema.columns where table_name = 'social_media' and column_name = 'cover_media_id'") == "0"
    assert db.one("select count(*) from social_media") == "4"
    assert db.one("select count(*) from information_schema.columns where table_name = 'social_media' and column_name = 'cover_kind'") == "0"
    db.run_file(MIGRATIONS / UP)
