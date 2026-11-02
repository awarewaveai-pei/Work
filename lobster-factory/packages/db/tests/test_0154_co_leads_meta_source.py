"""0154 against a disposable Postgres (no published host port): the partial unique index on (organization, source_url)
for meta:leadgen/ keys exists, a second lead with the same key is refused (NULL organization included), other source_urls
stay non-unique, existing duplicates make the migration refuse, down -> up."""

from pathlib import Path
import secrets
import subprocess
import time

import pytest


MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
ORG = "00000000-0000-4000-8000-0000000000c1"


def run(args, sql=None, check=True):
    result = subprocess.run(args, input=sql, text=True, encoding="utf-8", capture_output=True)
    if check and result.returncode:
        raise RuntimeError(f"{args[:4]} exited {result.returncode}: {result.stderr}{result.stdout}")
    return result


class Database:
    def __init__(self):
        self.name = f"m0154-pg-{secrets.token_hex(4)}"

    def cmd(self):
        return ["docker", "exec", "-i", self.name, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-qAt"]

    def psql(self, sql, check=True):
        return run(self.cmd(), sql, check)

    def value(self, sql):
        return self.psql(sql).stdout.strip()

    def migrate(self, name, check=True):
        return self.psql((MIGRATIONS / name).read_text(encoding="utf-8"), check)


@pytest.fixture(scope="module")
def db():
    database = Database()
    run(["docker", "run", "-d", "--name", database.name, "--label", "awarewave.test=m0154",
         "-e", "POSTGRES_PASSWORD=verify", "postgres:15.8-alpine"])
    try:
        for _ in range(60):
            if run(["docker", "exec", database.name, "pg_isready", "-U", "postgres"], check=False).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("Postgres did not start")
        time.sleep(1)
        database.psql("create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;")
        for name in ("0001_core.sql", "0048_co_outreach_core.sql", "0149_outbound_v2_expand.sql", "0152_sender_pool.sql", "0154_co_leads_meta_source.sql"):
            database.migrate(name)
        database.psql(f"insert into organizations(id, type, name, slug) values ('{ORG}', 'client', 'Org', 'org');")
        yield database
    finally:
        run(["docker", "rm", "-f", database.name], check=False)


def lead(db, org, source_url, email, check=True):
    org_sql = f"'{org}'" if org else "null"
    return db.psql(f"insert into co_leads(organization_id, name, email, source_url) "
                   f"values ({org_sql}, 'L', '{email}', '{source_url}');", check)


def test_same_leadgen_id_refused_per_organization(db):
    assert db.value("select count(*) from pg_indexes where indexname = 'co_leads_org_meta_leadgen_uniq';") == "1"
    lead(db, ORG, "meta:leadgen/111", "a@x.com")
    dup = lead(db, ORG, "meta:leadgen/111", "b@x.com", check=False)
    assert dup.returncode and "co_leads_org_meta_leadgen_uniq" in dup.stderr
    lead(db, None, "meta:leadgen/111", "c@x.com")  # another organization (the agency) may hold the same id
    again = lead(db, None, "meta:leadgen/111", "d@x.com", check=False)
    assert again.returncode and "co_leads_org_meta_leadgen_uniq" in again.stderr


def test_other_source_urls_stay_non_unique(db):
    lead(db, ORG, "https://dir.example/acme", "e@x.com")
    lead(db, ORG, "https://dir.example/acme", "f@x.com")
    assert db.value(f"select count(*) from co_leads where source_url = 'https://dir.example/acme';") == "2"


def test_existing_duplicates_refuse_then_down_up(db):
    db.migrate("0154_co_leads_meta_source.down.sql")
    assert db.value("select count(*) from pg_indexes where indexname = 'co_leads_org_meta_leadgen_uniq';") == "0"
    lead(db, ORG, "meta:leadgen/222", "g@x.com")
    lead(db, ORG, "meta:leadgen/222", "h@x.com")
    refused = db.migrate("0154_co_leads_meta_source.sql", check=False)
    assert refused.returncode and "0154: co_leads has more than one lead for the same Meta leadgen id" in refused.stderr
    assert db.value("select count(*) from pg_indexes where indexname = 'co_leads_org_meta_leadgen_uniq';") == "0"
    db.psql(f"delete from co_leads where email = 'h@x.com';")
    db.migrate("0154_co_leads_meta_source.sql")
    db.migrate("0154_co_leads_meta_source.sql")  # re-run is a no-op
    assert db.value("select count(*) from pg_indexes where indexname = 'co_leads_org_meta_leadgen_uniq';") == "1"


def test_convert_to_warm_refuses_an_opted_out_lead(db):
    """Codex C14 F1: under the lead lock an unsubscribed / do_not_contact person is never turned warm."""
    for col, val in (("status", "'unsubscribed'"), ("do_not_contact", "true"), ("consent_status", "'do_not_contact'")):
        lid = db.psql(f"insert into co_leads(organization_id, name, email) values ('{ORG}', 'O', 'o-{col}@x.example') returning id;").stdout.strip()
        db.psql(f"update co_leads set {col} = {val} where id = '{lid}';")
        got = db.psql(f"""select co_convert_to_warm('{lid}', '{{"status":"form_submitted","source":"meta_lead_ad_csv:f"}}');""").stdout.strip()
        assert got == "-1", col
        assert db.psql(f"select status || ',' || coalesce(consent_source, '-') from co_leads where id = '{lid}';").stdout.strip() != "warm,meta_lead_ad_csv:f"
    ok = db.psql(f"insert into co_leads(organization_id, name, email) values ('{ORG}', 'W', 'w@x.example') returning id;").stdout.strip()
    assert db.psql(f"""select co_convert_to_warm('{ok}', '{{"status":"form_submitted","source":"meta_lead_ad_csv:f"}}');""").stdout.strip() == "0"
