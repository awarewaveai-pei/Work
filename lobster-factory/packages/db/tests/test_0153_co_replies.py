"""0153 against a disposable Postgres (no published host port): co_mark_sent per message (a thread holding a sent first
email never marks its unsent follow-up), co_mark_unsent, co_apply_reply side effects once, unsubscribe / reject /
bounce suppression, a reply after no_reply, co_fail_reply exhaustion, privileges, re-run, down -> up."""

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
        self.name = f"m0153-pg-{secrets.token_hex(4)}"

    def cmd(self):
        return ["docker", "exec", "-i", self.name, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-qAt"]

    def psql(self, sql, check=True):
        return run(self.cmd(), sql, check)

    def value(self, sql):
        return self.psql(sql).stdout.strip()

    def migrate(self, name):
        self.psql((MIGRATIONS / name).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def db():
    database = Database()
    run(["docker", "run", "-d", "--name", database.name, "--label", "awarewave.test=m0153",
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
        for name in ("0001_core.sql", "0048_co_outreach_core.sql", "0149_outbound_v2_expand.sql", "0152_sender_pool.sql",
                     "0153_co_replies.sql"):
            database.migrate(name)
        database.psql(f"insert into organizations(id, type, name, slug) values ('{ORG}', 'client', 'Org', 'org');")
        yield database
    finally:
        run(["docker", "rm", "-f", database.name], check=False)


_n = 0


def lead_with_mail(db, lead_status="drafted", followup_status="draft"):
    """A lead with a drafted first email (its draft_created event) and one follow-up 3 days after."""
    global _n
    _n += 1
    lead = db.value(f"insert into co_leads(organization_id, name, email, status) "
                    f"values ('{ORG}', 'Lead {_n}', 'Who{_n}@Acme{_n}.com', '{lead_status}') returning id;")
    first = db.value(f"insert into co_messages(organization_id, lead_id, channel, output_type, body, status) "
                     f"values ('{ORG}', '{lead}', 'email', 'cold_email', 'hi', 'drafted') returning id;")
    follow = db.value(f"insert into co_messages(organization_id, lead_id, channel, output_type, body, status, followup_delay_days) "
                      f"values ('{ORG}', '{lead}', 'email', 'followup', 'again', '{followup_status}', 3) returning id;")
    db.psql(f"insert into co_sending_events(organization_id, lead_id, message_id, stream_type, event_type, provider_event_id, metadata) "
            f"values ('{ORG}', '{lead}', '{first}', 'cold', 'draft_created', 'd{_n}', "
            f"'{{\"draftId\":\"d{_n}\",\"messageId\":\"m{_n}\",\"threadId\":\"t{_n}\"}}');")
    return lead, first, follow


def reply(db, lead, kind="reply", key=None):
    global _n
    _n += 1
    return db.value(f"insert into co_replies(organization_id, lead_id, kind, dedupe_key, gmail_message_id, from_email, reply_text, received_at) "
                    f"values ('{ORG}', '{lead}', '{kind}', '{key or f'<r{_n}@x>'}', 'g{_n}', 'a@b.com', 'text', now()) returning id;")


def lead_row(db, lead, cols):
    return db.value(f"select concat_ws('|', {cols}) from co_leads where id = '{lead}';")


def count(db, sql):
    return int(db.value(f"select count(*) from {sql};"))


def test_first_email_sent_follow_up_not_marked(db):
    lead, first, follow = lead_with_mail(db, followup_status="drafted")
    assert db.value(f"select co_mark_sent('{first}', '2026-11-02T03:00:00Z', 'gm-first', 't1');") == "t"
    # the same Gmail message cannot also mark the follow-up of that thread as sent
    assert db.value(f"select co_mark_sent('{follow}', '2026-11-02T03:00:00Z', 'gm-first', 't1');") == "f"
    assert db.value(f"select status from co_messages where id = '{follow}';") == "drafted"
    assert db.value(f"select co_mark_sent('{first}', '2026-11-02T04:00:00Z', 'gm-other', 't1');") == "f"  # already sent
    assert count(db, f"co_sending_events where message_id = '{first}' and event_type = 'sent'") == 1
    assert db.value(f"select sender_account_id is null from co_sending_events where message_id = '{first}' and event_type = 'sent';") == "t"
    assert lead_row(db, lead, "status, first_contact_date, last_contact_date, next_followup_date") == \
        "sent|2026-11-02|2026-11-02|2026-11-05"


def test_mark_unsent_releases_the_claim(db):
    lead, first, _ = lead_with_mail(db)
    db.psql(f"update co_messages set status = 'sending' where id = '{first}';"
            f"insert into co_send_claims(organization_id, message_id, sender_domain, recipient_key) "
            f"values ('{ORG}', '{first}', 'pool.com', 'acme.com');")
    assert db.value(f"select co_mark_unsent('{first}', 'draft 404');") == "t"
    assert db.value(f"select status from co_messages where id = '{first}';") == "needs_edit"
    assert count(db, f"co_send_claims where message_id = '{first}' and released_at is null") == 0
    assert count(db, f"co_timeline_events where lead_id = '{lead}' and event_type = 'draft_missing'") == 1
    assert db.value(f"select co_mark_unsent('{first}', 'again');") == "f"


def test_reply_applies_once_and_stops_follow_ups(db):
    lead, first, follow = lead_with_mail(db)
    db.value(f"select co_mark_sent('{first}', now(), 'gm-r1', 'tr1');")
    r = reply(db, lead, key="<same@x>")
    dup = db.psql(f"insert into co_replies(organization_id, lead_id, kind, dedupe_key, gmail_message_id, from_email, reply_text, received_at) "
                  f"values ('{ORG}', '{lead}', 'reply', '<same@x>', 'other-mailbox-id', 'a@b.com', 't', now());", check=False)
    assert dup.returncode != 0 and "co_replies_dedupe_key_key" in dup.stderr
    assert db.value(f"select co_apply_reply('{r}', 'pricing', '報價', '想知道價格', 'ai');") == "applied"
    assert db.value(f"select co_apply_reply('{r}', 'pricing', '報價', '想知道價格', 'ai');") == "already"
    assert count(db, f"co_sending_events where lead_id = '{lead}' and event_type = 'replied'") == 1
    assert count(db, f"co_timeline_events where lead_id = '{lead}' and event_type = 'replied'") == 1
    assert db.value(f"select status from co_messages where id = '{follow}';") == "skipped"
    assert lead_row(db, lead, "status, consent_status, coalesce(next_followup_date::text, 'null'), do_not_contact") == \
        "replied|replied|null|f"
    assert count(db, f"co_suppression_list where lead_id = '{lead}'") == 0


def test_unsubscribe_reject_bounce_suppress_once(db):
    for kind, rtype, reason, status, consent in (("reply", "unsubscribe", "unsubscribe", "unsubscribed", "unsubscribed"),
                                                  ("reply", "reject", "manual_opt_out", "do_not_contact", "do_not_contact"),
                                                  ("bounce", "bounce", "hard_bounce", "sent", "unknown")):
        lead, first, _ = lead_with_mail(db)
        db.value(f"select co_mark_sent('{first}', now(), 'gm-{rtype}', 't-{rtype}');")
        for _ in range(2):
            r = reply(db, lead, kind=kind)
            assert db.value(f"select co_apply_reply('{r}', '{rtype}', null, null, 'rule');") == "applied"
        assert count(db, f"co_suppression_list where lead_id = '{lead}' and reason = '{reason}' and email = lower(email)") == 1
        assert lead_row(db, lead, "status, consent_status, do_not_contact") == f"{status}|{consent}|t"
    lead, _, _ = lead_with_mail(db)
    mismatch = db.psql(f"select co_apply_reply('{reply(db, lead, kind='bounce')}', 'pricing', null, null, 'ai');", check=False)
    assert mismatch.returncode != 0 and "cannot be classified" in mismatch.stderr


def test_reply_after_no_reply_and_later_statuses_kept(db):
    lead, _, _ = lead_with_mail(db, lead_status="no_reply")
    assert db.value(f"select co_apply_reply('{reply(db, lead)}', 'interested', null, null, 'ai');") == "applied"
    assert lead_row(db, lead, "status") == "replied"
    lead, _, _ = lead_with_mail(db, lead_status="meeting_booked")
    db.psql(f"update co_leads set consent_status = 'opted_in' where id = '{lead}';")
    db.value(f"select co_apply_reply('{reply(db, lead)}', 'more_info', null, null, 'ai');")
    assert lead_row(db, lead, "status, consent_status") == "meeting_booked|opted_in"


def test_claiming_a_reply_stops_follow_ups_before_classification(db):
    # Codex 2026-11-02 F3/F4: the follow-ups stop on insert, not after a classification that may fail four times; one
    # already in Gmail drafts is skipped too, with one timeline line asking the person to delete that draft.
    lead, first, follow = lead_with_mail(db, followup_status="drafted")
    db.value(f"select co_mark_sent('{first}', now(), 'gm-claim', 't-claim');")
    assert lead_row(db, lead, "next_followup_date") == db.value("select (now() at time zone 'Asia/Taipei')::date + 3;")
    reply(db, lead)
    assert db.value(f"select status from co_messages where id = '{follow}';") == "skipped"
    assert lead_row(db, lead, "coalesce(next_followup_date::text, 'null')") == "null"
    assert count(db, f"co_timeline_events where lead_id = '{lead}' and event_type = 'followup_draft_left'") == 1
    reply(db, lead)  # a second mail: nothing left to stop, no second line
    assert count(db, f"co_timeline_events where lead_id = '{lead}' and event_type = 'followup_draft_left'") == 1


def test_fail_reply_exhausts_into_unprocessed(db):
    lead, first, follow = lead_with_mail(db)
    db.value(f"select co_mark_sent('{first}', now(), 'gm-fail', 't-fail');")
    r = reply(db, lead)
    assert [db.value(f"select co_fail_reply('{r}', 'openai_502', 5);") for _ in range(5)] == ["1", "2", "3", "4", "5"]
    assert db.value(f"select reply_type || ',' || classified_by || ',' || (processed_at is not null) from co_replies where id = '{r}';") == \
        "unprocessed,failed,true"
    assert db.value(f"select co_fail_reply('{r}', 'again', 5);") == "-1"
    assert db.value(f"select status from co_messages where id = '{follow}';") == "skipped"
    assert lead_row(db, lead, "status") == "replied"
    assert count(db, f"co_timeline_events where lead_id = '{lead}' and event_type = 'reply_processing_failed'") == 1
    # the Replies page retry: back to pending, then a classification applies
    db.psql(f"update co_replies set process_attempts = 0, processed_at = null where id = '{r}';")
    assert db.value(f"select co_apply_reply('{r}', 'no_need', null, null, 'ai');") == "applied"


def test_merge_gmail_sync_keeps_a_newer_rescan_press(db):
    conn = db.value(f"insert into co_connector_accounts(organization_id, connector_name, connector_type, settings) "
                    f"values ('{ORG}', 'gmail', 'email_send', '{{\"email\":\"me@pool.com\",\"gmail_sync\":{{\"rescan_days\":3,\"scan\":{{\"since\":1}}}}}}') returning id;")
    # the tick finishes the 3-day rescan, but a person pressed 7 days meanwhile: 7 survives, the scan key is removed
    db.psql(f"update co_connector_accounts set settings = jsonb_set(settings, '{{gmail_sync,rescan_days}}', '7') where id = '{conn}';")
    db.psql(f"select co_merge_gmail_sync('{conn}', '{{\"history_id\":\"900\",\"scan\":null}}', 3);")
    assert db.value(f"select settings->'gmail_sync' from co_connector_accounts where id = '{conn}';") == '{"history_id": "900", "rescan_days": 7}'
    db.psql(f"select co_merge_gmail_sync('{conn}', '{{}}', 7);")
    assert db.value(f"select (settings->'gmail_sync') ? 'rescan_days' from co_connector_accounts where id = '{conn}';") == "f"
    assert db.value(f"select settings->>'email' from co_connector_accounts where id = '{conn}';") == "me@pool.com"


def test_privileges(db):
    for fn in ("co_mark_sent(uuid, timestamptz, text, text)", "co_apply_reply(uuid, text, text, text, text)",
               "co_fail_reply(uuid, text, int)", "co_mark_unsent(uuid, text)", "co_stop_followups(uuid)", "co_merge_gmail_sync(uuid, jsonb, int)"):
        assert db.value(f"select has_function_privilege('anon', 'public.{fn}', 'execute');") == "f"
        assert db.value(f"select has_function_privilege('service_role', 'public.{fn}', 'execute');") == "t"
    assert db.value("select has_table_privilege('anon', 'public.co_replies', 'select');") == "f"


def test_rerun_then_down_then_up(db):
    db.migrate("0153_co_replies.sql")
    db.migrate("0153_co_replies.down.sql")
    assert db.value("select to_regclass('public.co_replies') is null and to_regprocedure('public.co_mark_sent(uuid, timestamptz, text, text)') is null;") == "t"
    db.migrate("0153_co_replies.sql")
    assert db.value("select to_regclass('public.co_replies') is not null;") == "t"
