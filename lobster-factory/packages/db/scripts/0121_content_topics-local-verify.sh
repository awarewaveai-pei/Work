#!/usr/bin/env bash
# Verify 0121 against a disposable PostgreSQL container. Touches no production database.
# Bootstraps what 0121 assumes (organizations, wp_sites, client_schedules as 0097 left it, the migration ledger), applies
# 0121, checks constraints / RLS / grants / the every_5m frequency, runs the down (refused with topics, then allowed),
# and re-applies twice. Usage: bash packages/db/scripts/0121_content_topics-local-verify.sh   (PG_IMAGE overrides the image)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
CONTAINER="content-0121-verify-$$"
IMAGE="${PG_IMAGE:-postgres:15.8-alpine}"   # production supabase-db is 15.8
if command -v docker >/dev/null 2>&1 && docker version >/dev/null 2>&1; then DOCKER=docker; else DOCKER=docker.exe; fi
cleanup() { "$DOCKER" rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"$DOCKER" run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  "$DOCKER" exec "$CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1 && break
  sleep 1
done
psql_run() { "$DOCKER" exec -i "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { psql_run -f - < "$1"; }

psql_run <<'SQL' >/dev/null
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;   -- as Supabase does: the revokes must win
GRANT USAGE ON SCHEMA public TO service_role;
CREATE TABLE public.organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL);
CREATE TABLE public.wp_sites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, organization_id uuid);
CREATE TABLE public.client_schedules (                       -- 0097 shape, frequency check under its production name
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_key text NOT NULL, enabled boolean NOT NULL DEFAULT false,
  frequency text NOT NULL DEFAULT 'weekly' CONSTRAINT client_schedules_frequency_check CHECK (frequency IN ('daily','weekly')),
  hour_utc int NOT NULL DEFAULT 3, day_of_week_utc int NOT NULL DEFAULT 1, PRIMARY KEY (organization_id, job_key));
CREATE TABLE public.schema_migrations (filename text PRIMARY KEY, number text NOT NULL, sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(), applied_by text NOT NULL);
INSERT INTO public.schema_migrations VALUES ('0120_payment_events.sql', '0120', repeat('0', 64), now(), 'local-verify');
INSERT INTO public.organizations (id, slug) VALUES ('00000000-0000-4000-8000-00000000000a', 'brand-a');
INSERT INTO public.wp_sites (id, name, organization_id) VALUES ('00000000-0000-4000-8000-0000000000a1', 'A', '00000000-0000-4000-8000-00000000000a');
INSERT INTO public.client_schedules (organization_id, job_key, frequency) VALUES ('00000000-0000-4000-8000-00000000000a', 'collect_crawl', 'weekly');
SQL

apply_up() {
  psql_file "$DB_DIR/migrations/0121_content_topics.sql" >/dev/null
  psql_run -c "INSERT INTO public.schema_migrations (filename, number, sha256, applied_by) VALUES ('0121_content_topics.sql', '0121', repeat('0', 64), 'local-verify') ON CONFLICT (filename) DO NOTHING" >/dev/null
}
apply_up

psql_run <<'SQL' >/dev/null
DO $$
DECLARE org uuid := '00000000-0000-4000-8000-00000000000a';
BEGIN
  -- trends: one row per item per day; bad geo / hash refused
  INSERT INTO public.content_trends (geo, source, title, hash) VALUES ('TW', 'Google News', '感恩日記', repeat('a', 64));
  BEGIN INSERT INTO public.content_trends (geo, source, title, hash) VALUES ('TW', 'Google News', '感恩日記', repeat('a', 64));
    RAISE EXCEPTION 'same item twice in a day accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
  INSERT INTO public.content_trends (geo, source, title, hash, fetched_on) VALUES ('TW', 'Google News', '感恩日記', repeat('a', 64), current_date - 1);
  BEGIN INSERT INTO public.content_trends (geo, source, title, hash) VALUES ('tw', 's', 't', repeat('b', 64));
    RAISE EXCEPTION 'lowercase geo accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.content_trends (geo, source, title, hash) VALUES ('TW', 's', 't', 'nothex');
    RAISE EXCEPTION 'bad hash accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.content_trends (geo, source, title, hash, related_queries) VALUES ('TW', 's', 't', repeat('c', 64), '{}');
    RAISE EXCEPTION 'object related_queries accepted'; EXCEPTION WHEN check_violation THEN NULL; END;

  -- topics: defaults, month on the 1st, formats from the list, one keyword per brand per month, status list
  INSERT INTO public.content_topics (organization_id, site_id, title, keyword, source, month, created_by)
    VALUES (org, '00000000-0000-4000-8000-0000000000a1', '五分鐘感恩日記', '感恩日記', 'plan', '2026-11-01', 'ops:owner:u');
  ASSERT (SELECT status = 'proposed' AND version = 1 AND formats = array['article','social'] AND artifacts = '{}'::jsonb
          FROM public.content_topics WHERE keyword = '感恩日記'), 'topic defaults wrong';
  BEGIN INSERT INTO public.content_topics (organization_id, title, keyword, source, month, created_by)
      VALUES (org, 't', '感恩日記', 'plan', '2026-11-01', 'x');
    RAISE EXCEPTION 'same keyword twice in a month accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
  INSERT INTO public.content_topics (organization_id, title, keyword, source, month, created_by)
    VALUES (org, 't', '感恩日記', 'plan', '2026-12-01', 'x');                      -- next month is fine
  BEGIN INSERT INTO public.content_topics (organization_id, title, keyword, source, month, created_by)
      VALUES (org, 't', 'k2', 'plan', '2026-11-02', 'x');
    RAISE EXCEPTION 'month not on the 1st accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.content_topics (organization_id, title, keyword, source, month, created_by, formats)
      VALUES (org, 't', 'k3', 'plan', '2026-11-01', 'x', array['podcast']);
    RAISE EXCEPTION 'unknown format accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.content_topics (organization_id, title, keyword, source, month, created_by, formats)
      VALUES (org, 't', 'k4', 'plan', '2026-11-01', 'x', array[]::text[]);
    RAISE EXCEPTION 'empty formats accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.content_topics SET status = 'done' WHERE keyword = '感恩日記';
    RAISE EXCEPTION 'unknown status accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.content_topics (organization_id, title, keyword, source, month, created_by)
      VALUES (org, 't', 'k5', 'rss', '2026-11-01', 'x');
    RAISE EXCEPTION 'unknown source accepted'; EXCEPTION WHEN check_violation THEN NULL; END;

  -- claim: an update guarded by the version it read moves the row once
  UPDATE public.content_topics SET status = 'approved', version = version + 1 WHERE keyword = '感恩日記' AND month = '2026-11-01' AND version = 1;
  UPDATE public.content_topics SET status = 'generating', version = version + 1 WHERE keyword = '感恩日記' AND month = '2026-11-01' AND version = 1;
  ASSERT (SELECT status = 'approved' AND version = 2 FROM public.content_topics WHERE keyword = '感恩日記' AND month = '2026-11-01'),
    'a stale version moved the row';

  -- site deleted: topic kept, site_id cleared
  DELETE FROM public.wp_sites WHERE id = '00000000-0000-4000-8000-0000000000a1';
  ASSERT (SELECT site_id IS NULL FROM public.content_topics WHERE keyword = '感恩日記' AND month = '2026-11-01'), 'site delete did not clear site_id';

  -- schedules: every_5m allowed, anything else still refused
  UPDATE public.client_schedules SET frequency = 'every_5m';
  BEGIN UPDATE public.client_schedules SET frequency = 'hourly'; RAISE EXCEPTION 'hourly accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE public.client_schedules SET frequency = 'weekly';

  -- content_trends_top: a title hot on more days ranks first; spacing and case fold into one title
  INSERT INTO public.content_trends (geo, source, title, hash, fetched_on) VALUES
    ('TW', 'PTT', '藝術 治療', repeat('d', 64), current_date), ('TW', 'PTT', '藝術  治療', repeat('e', 64), current_date - 2),
    ('TW', 'PTT', '藝術 治療', repeat('f', 64), current_date - 5), ('TW', 'PTT', '舊新聞', repeat('9', 64), current_date - 40);
  ASSERT (SELECT array_agg(title ORDER BY days DESC, last_seen DESC) FROM public.content_trends_top('TW', current_date - 30, 10))
    = array['藝術  治療', '感恩日記'], 'trend ranking wrong';

  -- content_topics_start: one start per call within the cap; a stale version or a full day starts nothing
  INSERT INTO public.content_topics (id, organization_id, title, keyword, source, month, created_by, status) VALUES
    ('00000000-0000-4000-8000-0000000000c1', org, 't', 's1', 'plan', '2027-01-01', 'x', 'approved'),
    ('00000000-0000-4000-8000-0000000000c2', org, 't', 's2', 'plan', '2027-01-01', 'x', 'approved');
  ASSERT (SELECT count(*) FROM public.content_topics_start(org, '00000000-0000-4000-8000-0000000000c1', 1, '2027-01-02', 1)) = 1, 'first start refused';
  ASSERT (SELECT status = 'generating' AND version = 2 AND started_on = '2027-01-02' FROM public.content_topics WHERE id = '00000000-0000-4000-8000-0000000000c1'), 'start did not move the row';
  ASSERT (SELECT count(*) FROM public.content_topics_start(org, '00000000-0000-4000-8000-0000000000c2', 1, '2027-01-02', 1)) = 0, 'cap passed';
  ASSERT (SELECT count(*) FROM public.content_topics_start(org, '00000000-0000-4000-8000-0000000000c2', 9, '2027-01-03', 5)) = 0, 'stale version started';
  ASSERT (SELECT count(*) FROM public.content_topics_start(org, '00000000-0000-4000-8000-0000000000c2', 1, '2027-01-03', 5)) = 1, 'next day refused';

  -- indexes: the sweep's, the daily count's and the site FK's exist; the duplicate (org, month) one does not
  ASSERT to_regclass('public.content_topics_org_status') IS NOT NULL AND to_regclass('public.content_topics_org_started') IS NOT NULL
     AND to_regclass('public.content_topics_site') IS NOT NULL AND to_regclass('public.content_topics_org_month') IS NULL, 'indexes wrong';

  -- functions: service_role only
  ASSERT has_function_privilege('service_role', 'public.content_topics_start(uuid, uuid, integer, date, integer)', 'EXECUTE'), 'service_role cannot start';
  ASSERT NOT has_function_privilege('anon', 'public.content_topics_start(uuid, uuid, integer, date, integer)', 'EXECUTE'), 'anon can start';
  ASSERT NOT has_function_privilege('authenticated', 'public.content_trends_top(text, date, integer)', 'EXECUTE'), 'authenticated can read trends';

  -- RLS on, service_role only, anon/authenticated have nothing
  ASSERT (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.content_trends'::regclass, 'public.content_topics'::regclass)), 'RLS off';
  ASSERT NOT has_table_privilege('anon', 'public.content_topics', 'SELECT'), 'anon can read topics';
  ASSERT NOT has_table_privilege('authenticated', 'public.content_trends', 'SELECT'), 'authenticated can read trends';
  ASSERT has_table_privilege('service_role', 'public.content_topics', 'UPDATE'), 'service_role cannot write topics';
END $$;
SQL
echo "OK up 0121: trends one per item per day, topic constraints, version claim, site delete, every_5m, RLS and grants"

# down is refused while topics exist, then allowed once they are gone
if psql_file "$DB_DIR/migrations/0121_content_topics.down.sql" >/dev/null 2>&1; then echo "FAIL down ran with topics present"; exit 1; fi
psql_run -c "UPDATE public.client_schedules SET frequency = 'every_5m'; DELETE FROM public.content_topics;" >/dev/null
if psql_file "$DB_DIR/migrations/0121_content_topics.down.sql" >/dev/null 2>&1; then echo "FAIL down ran with an every_5m schedule"; exit 1; fi
psql_run -c "UPDATE public.client_schedules SET frequency = 'weekly';" >/dev/null
psql_file "$DB_DIR/migrations/0121_content_topics.down.sql" >/dev/null
psql_run <<'SQL' >/dev/null
DO $$ BEGIN
  ASSERT to_regclass('public.content_topics') IS NULL AND to_regclass('public.content_trends') IS NULL, 'tables remain after down';
  ASSERT to_regprocedure('public.content_topics_start(uuid, uuid, integer, date, integer)') IS NULL
     AND to_regprocedure('public.content_trends_top(text, date, integer)') IS NULL, 'functions remain after down';
  ASSERT NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename = '0121_content_topics.sql'), '0121 ledger row remains';
  ASSERT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename = '0120_payment_events.sql'), 'down removed 0120 ledger row';
  ASSERT (SELECT count(*) FROM public.client_schedules) = 1, 'down lost schedule rows';
  BEGIN UPDATE public.client_schedules SET frequency = 'every_5m'; RAISE EXCEPTION 'every_5m still allowed after down';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SQL
echo "OK down 0121: refused with topics and with every_5m, then tables, ledger row and every_5m gone; schedules kept"

apply_up
apply_up
echo "OK re-up + second up idempotent"
diff -q "$DB_DIR/migrations/0121_content_topics.down.sql" "$DB_DIR/scripts/0121_content_topics_down.sql" >/dev/null
echo "PASS 0121"
