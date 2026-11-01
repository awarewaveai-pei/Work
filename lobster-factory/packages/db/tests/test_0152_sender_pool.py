"""0152 against a disposable Postgres (no published host port): pool columns and backfill, the free-mail recipient key,
co_begin_send caps and refusals, co_convert_to_warm, three races between two sessions, re-run, down -> up."""

from pathlib import Path
import secrets
import subprocess
import time

import pytest


MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
ORG = "00000000-0000-4000-8000-0000000000b1"
CAPS = '{"mailbox": 10, "sender_domain": 20, "recipient_30d": 2}'


def run(args, sql=None, check=True):
    result = subprocess.run(args, input=sql, text=True, encoding="utf-8", capture_output=True)
    if check and result.returncode:
        raise RuntimeError(f"{args[:4]} exited {result.returncode}: {result.stderr}{result.stdout}")
    return result


class Database:
    def __init__(self):
        self.name = f"m0152-pg-{secrets.token_hex(4)}"

    def cmd(self):
        return ["docker", "exec", "-i", self.name, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-qAt"]

    def psql(self, sql, check=True):
        return run(self.cmd(), sql, check)

    def value(self, sql):
        return self.psql(sql).stdout.strip()

    def migrate(self, name):
        self.psql((MIGRATIONS / name).read_text(encoding="utf-8"))

    def race(self, first, second):
        """first holds its transaction open 2 s after its statement; second starts 0.5 s later. Returns both outputs."""
        a = subprocess.Popen(self.cmd(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             text=True, encoding="utf-8")
        a.stdin.write(f"begin; {first}; select pg_sleep(2); commit;\n")
        a.stdin.close()
        time.sleep(0.5)
        t0 = time.time()
        b = self.value(second)
        waited = time.time() - t0
        out_a, err_a = a.communicate(timeout=30)
        assert a.returncode == 0, err_a
        return out_a.strip().splitlines()[0], b, waited


@pytest.fixture(scope="module")
def db():
    database = Database()
    run(["docker", "run", "-d", "--name", database.name, "--label", "awarewave.test=m0152",
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
        for name in ("0001_core.sql", "0048_co_outreach_core.sql", "0149_outbound_v2_expand.sql"):
            database.migrate(name)
        database.psql(f"""
            insert into organizations(id, type, name, slug) values ('{ORG}', 'client', 'Org', 'org');
            insert into co_connector_accounts(id, organization_id, connector_name, connector_type, settings, updated_at) values
              ('00000000-0000-4000-8000-00000000c001', '{ORG}', 'gmail', 'email_send', '{{"email":"old@pool.com"}}', now() - interval '1 day'),
              ('00000000-0000-4000-8000-00000000c002', '{ORG}', 'gmail', 'email_send', '{{"email":"Old@pool.com"}}', now());
            insert into co_sender_accounts(id, organization_id, email, provider, stream_type, created_at) values
              ('00000000-0000-4000-8000-00000000a000', '{ORG}', 'old@pool.com', 'gmail', 'cold', now() - interval '2 days'),
              ('00000000-0000-4000-8000-00000000a0d0', '{ORG}', 'old@pool.com', 'gmail', 'cold', now());
        """)
        database.migrate("0152_sender_pool.sql")
        yield database
    finally:
        run(["docker", "rm", "-f", database.name], check=False)


_n = 0


def sender(db, email, domain_health="healthy", mode="auto", connected=True):
    conn = db.value(f"insert into co_connector_accounts(organization_id, connector_name, connector_type) values ('{ORG}', 'gmail', 'email_send') returning id;")
    link = f"'{conn}'" if connected else "null"
    return db.value(f"insert into co_sender_accounts(organization_id, email, provider, stream_type, send_mode, warmup_stage, health_status, connector_id) "
                    f"values ('{ORG}', '{email}', 'gmail', 'cold', '{mode}', 'w1', '{domain_health}', {link}) returning id;")


def lead_message(db, email, status="drafted", lead_status="drafted", name=None):
    global _n
    _n += 1
    lead = db.value(f"insert into co_leads(organization_id, name, email, status) values ('{ORG}', '{name or f'Lead {_n}'}', '{email}', '{lead_status}') returning id;")
    msg = db.value(f"insert into co_messages(organization_id, lead_id, channel, output_type, body, status) "
                   f"values ('{ORG}', '{lead}', 'email', 'cold_email', 'hi', '{status}') returning id;")
    return lead, msg


def begin(db, msg, snd, email, caps=CAPS):
    return db.value(f"select co_begin_send('{msg}', '{snd}', '{email}', '{caps}');")


def test_backfill_and_columns(db):
    assert db.value("select warmup_stage || ',' || send_mode || ',' || connector_id from co_sender_accounts "
                    "where id = '00000000-0000-4000-8000-00000000a000';") == "full,draft,00000000-0000-4000-8000-00000000c002"
    # the duplicate mailbox row gets no connector: one mailbox per connector (one Google token)
    assert db.value("select coalesce(connector_id::text, 'null') from co_sender_accounts where id = '00000000-0000-4000-8000-00000000a0d0';") == "null"
    dup = db.psql("update co_sender_accounts set connector_id = '00000000-0000-4000-8000-00000000c002' "
                  "where id = '00000000-0000-4000-8000-00000000a0d0';", check=False)
    assert dup.returncode != 0 and "co_sender_accounts_connector_uniq" in dup.stderr
    bad = db.psql(f"insert into co_sender_accounts(organization_id, email, provider, stream_type, send_mode) "
                  f"values ('{ORG}', 'x@y.com', 'gmail', 'cold', 'blast');", check=False)
    assert bad.returncode != 0 and "check" in bad.stderr.lower()
    bad = db.psql(f"insert into co_sender_accounts(organization_id, email, provider, stream_type, warmup_stage) "
                  f"values ('{ORG}', 'x@y.com', 'gmail', 'cold', 'new');", check=False)
    assert bad.returncode != 0


def test_recipient_key_free_mail_is_per_address(db):
    assert db.value("select co_recipient_cap_key(' Amy@Gmail.com ');") == "amy@gmail.com"
    assert db.value("select co_recipient_cap_key('a@mail.yahoo.com.tw');") == "a@mail.yahoo.com.tw"
    assert db.value("select co_recipient_cap_key('ceo@Acme.com.tw');") == "acme.com.tw"
    assert db.value("select co_recipient_cap_key('x@notgmail.com');") == "notgmail.com"


def test_free_mail_recipients_do_not_share_the_cap(db):
    snd = sender(db, "a@free-test.com")
    for i in range(3):
        _, msg = lead_message(db, f"person{i}@gmail.com")
        assert begin(db, msg, snd, f"person{i}@gmail.com") == "t"
    # a company domain does share it: third mail to acme in 30 days refused
    results = []
    for who in ("a", "b", "c"):
        _, msg = lead_message(db, f"{who}@acme-share.com")
        results.append(begin(db, msg, snd, f"{who}@acme-share.com"))
    assert results == ["t", "t", "f"]


def test_mailbox_cap_and_message_states(db):
    snd = sender(db, "m@cap-test.com")
    caps = '{"mailbox": 1, "sender_domain": 20, "recipient_30d": 2}'
    _, m1 = lead_message(db, "x@r1.com")
    _, m2 = lead_message(db, "x@r2.com")
    assert begin(db, m1, snd, "x@r1.com", caps) == "t"
    assert db.value(f"select status from co_messages where id = '{m1}';") == "sending"
    assert begin(db, m2, snd, "x@r2.com", caps) == "f"
    assert begin(db, m1, snd, "x@r1.com") == "f"  # already claimed
    # not drafted: false and no claim left behind
    _, m3 = lead_message(db, "x@r3.com", status="approved")
    assert begin(db, m3, snd, "x@r3.com") == "f"
    assert db.value(f"select count(*) from co_send_claims where message_id = '{m3}';") == "0"
    # a released claim (proven unsent) frees the slot and lets the message be claimed again
    db.psql(f"update co_send_claims set released_at = now() where message_id = '{m1}'; update co_messages set status = 'drafted' where id = '{m1}';")
    assert begin(db, m1, snd, "x@r1.com", caps) == "t"


def test_refusals(db):
    snd = sender(db, "r@refuse-test.com")
    paused = sender(db, "p@refuse-test.com", domain_health="paused")
    draft = sender(db, "d@refuse-test.com", mode="draft")
    unlinked = sender(db, "u@refuse-test.com", connected=False)
    _, m = lead_message(db, "y@ok-refuse.com")
    assert begin(db, m, paused, "y@ok-refuse.com") == "f"
    assert begin(db, m, draft, "y@ok-refuse.com") == "f"
    assert begin(db, m, unlinked, "y@ok-refuse.com") == "f"  # no connector: no token of its own
    assert begin(db, m, snd, "other@ok-refuse.com") == "f"  # not the lead's address
    _, m = lead_message(db, "w@warm-refuse.com", lead_status="warm")
    assert begin(db, m, snd, "w@warm-refuse.com") == "f"
    lead, m = lead_message(db, "n@dnc-refuse.com")
    db.psql(f"update co_leads set do_not_contact = true where id = '{lead}';")
    assert begin(db, m, snd, "n@dnc-refuse.com") == "f"
    db.psql(f"insert into co_suppression_list(organization_id, domain, reason, source, scope) values ('{ORG}', 'supp-refuse.com', 'domain_block', 't', 'domain');")
    _, m = lead_message(db, "s@supp-refuse.com")
    assert begin(db, m, snd, "s@supp-refuse.com") == "f"
    db.psql(f"insert into co_suppression_list(organization_id, company_name, reason, source, scope) values ('{ORG}', 'Blocked Co', 'user_manual', 't', 'company');")
    _, m = lead_message(db, "c@company-refuse.com", name=" blocked co ")
    assert begin(db, m, snd, "c@company-refuse.com") == "f"
    bad = db.psql(f"select co_begin_send('{m}', '{snd}', 'c@company-refuse.com', '{{}}');", check=False)
    assert bad.returncode != 0 and "caps" in bad.stderr


def test_convert_to_warm(db):
    lead, m = lead_message(db, "v@warm-convert.com")
    sent = db.value(f"insert into co_messages(organization_id, lead_id, channel, output_type, body, status) values ('{ORG}', '{lead}', 'email', 'followup', 'f', 'sent') returning id;")
    db.psql(f"update co_leads set next_followup_date = current_date + 3 where id = '{lead}';")
    assert db.value(f"""select co_convert_to_warm('{lead}', '{{"status":"form_submitted","source":"meta_lead_ad_csv:spring"}}');""") == "1"
    assert db.value(f"select status || ',' || consent_status || ',' || consent_source || ',' || coalesce(next_followup_date::text, 'null') "
                    f"from co_leads where id = '{lead}';") == "warm,form_submitted,meta_lead_ad_csv:spring,null"
    assert db.value(f"select status from co_messages where id = '{m}';") == "skipped"
    assert db.value(f"select status from co_messages where id = '{sent}';") == "sent"
    assert db.value(f"select count(*) from co_timeline_events where lead_id = '{lead}' and event_type = 'cold_cancelled';") == "1"
    assert db.value("select coalesce(co_convert_to_warm(gen_random_uuid(), '{\"status\":\"opted_in\"}')::text, 'null');") == "null"


def test_race_same_sender_domain_last_slot(db):
    a = sender(db, "a@race-domain.com")
    b = sender(db, "b@race-domain.com")
    caps = '{"mailbox": 10, "sender_domain": 1, "recipient_30d": 2}'
    _, m1 = lead_message(db, "p@race-r1.com")
    _, m2 = lead_message(db, "p@race-r2.com")
    first, second, waited = db.race(f"select co_begin_send('{m1}', '{a}', 'p@race-r1.com', '{caps}')",
                                    f"select co_begin_send('{m2}', '{b}', 'p@race-r2.com', '{caps}');")
    assert (first, second) == ("t", "f") and waited > 1  # second waited on the domain lock, then saw the claim


def test_race_two_sender_domains_same_recipient_third_mail(db):
    a = sender(db, "a@race-sx.com")
    b = sender(db, "b@race-sy.com")
    _, m0 = lead_message(db, "one@race-target.com")
    assert begin(db, m0, a, "one@race-target.com") == "t"
    _, m1 = lead_message(db, "two@race-target.com")
    _, m2 = lead_message(db, "three@race-target.com")
    first, second, waited = db.race(f"select co_begin_send('{m1}', '{a}', 'two@race-target.com', '{CAPS}')",
                                    f"select co_begin_send('{m2}', '{b}', 'three@race-target.com', '{CAPS}');")
    assert (first, second) == ("t", "f") and waited > 1


def test_race_warm_conversion_and_send_on_one_lead(db):
    snd = sender(db, "s@race-warm.com")
    # conversion first: the send waits on the lead row, then sees warm
    lead, m = lead_message(db, "q@race-warm-a.com")
    first, second, waited = db.race(f"""select co_convert_to_warm('{lead}', '{{"status":"opted_in","source":"t"}}')""",
                                    f"select co_begin_send('{m}', '{snd}', 'q@race-warm-a.com', '{CAPS}');")
    assert (first, second) == ("1", "f") and waited > 1
    assert db.value(f"select status from co_messages where id = '{m}';") == "skipped"
    assert db.value(f"select count(*) from co_send_claims where message_id = '{m}';") == "0"
    # send first: the conversion waits, the sending mail is left to finish, nothing else to cancel
    lead, m = lead_message(db, "q@race-warm-b.com")
    first, second, waited = db.race(f"select co_begin_send('{m}', '{snd}', 'q@race-warm-b.com', '{CAPS}')",
                                    f"""select co_convert_to_warm('{lead}', '{{"status":"opted_in","source":"t"}}');""")
    assert (first, second) == ("t", "0") and waited > 1
    assert db.value(f"select status from co_messages where id = '{m}';") == "sending"


def test_rerun_then_down_then_up(db):
    db.migrate("0152_sender_pool.sql")
    blocked = db.psql((MIGRATIONS / "0152_sender_pool.down.sql").read_text(encoding="utf-8"), check=False)
    assert blocked.returncode != 0 and "still sending" in blocked.stderr
    db.psql("update co_messages set status = 'needs_edit' where status = 'sending';")
    db.migrate("0152_sender_pool.down.sql")
    assert db.value("select to_regclass('public.co_send_claims') is null and to_regproc('public.co_begin_send') is null;") == "t"
    assert db.value("select count(*) from information_schema.columns where table_name = 'co_sender_accounts' and column_name = 'send_mode';") == "0"
    db.migrate("0152_sender_pool.sql")
    assert db.value("select count(*) from information_schema.columns where table_name = 'co_sender_accounts' "
                    "and column_name in ('send_mode','warmup_started_at','dns_status','dns_checked_at','connector_id');") == "5"
    assert db.value("select has_function_privilege('anon', 'public.co_begin_send(uuid, uuid, text, jsonb)', 'execute');") == "f"
