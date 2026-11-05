#!/usr/bin/env bash
# check-auth-profiles.sh -- exit 1 when "every auth user has a profiles row" (migration 0161) is not holding:
#   (a) an auth.users row has no public.profiles row (an FK-referencing write naming that user fails), or
#   (b) the auth.users insert or delete trigger of 0161 is missing or not enabled (tgenabled = 'O'; a trigger disabled
#       with ALTER TABLE ... DISABLE TRIGGER, or dropped by a GoTrue schema change, makes (a) true at the next signup).
# Count-only output, never an email. A permanent (a) is a user 0161 could not give a row (email collision / no email):
# its UNRESOLVED warning names the id; fix that user, do not silence the check.
# exit 2 = cannot tell (db unreachable, unparseable answer). Read-only. Runs every 10 min through cron-run.sh, so a
# non-zero exit turns the auth_profiles_check row on /ops/schedules red and schedule_alerts pushes Telegram + Slack.
# Tests swap the reader: AUTH_PROFILES_PSQL (a command; psql reads SQL on stdin, prints missing|insert_trg|delete_trg).
set -euo pipefail

psql_q() {
  if [[ -n "${AUTH_PROFILES_PSQL:-}" ]]; then $AUTH_PROFILES_PSQL
  else timeout 60 docker exec -i supabase-db psql -U supabase_admin -d postgres -At -F '|' -v ON_ERROR_STOP=1; fi
}

row="$(psql_q <<'SQL'
select
  (select count(*) from auth.users a where not exists (select 1 from public.profiles p where p.id = a.id)),
  (select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'ensure_profile_on_auth_user_insert' and tgenabled = 'O' and not tgisinternal),
  (select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'release_profile_on_auth_user_delete' and tgenabled = 'O' and not tgisinternal);
SQL
)" || { echo "cannot tell: auth profiles query failed"; exit 2; }

IFS='|' read -r missing ins del <<< "$row"
for v in "$missing" "$ins" "$del"; do
  [[ "$v" =~ ^[0-9]+$ ]] || { echo "cannot tell: unexpected answer from the auth profiles query"; exit 2; }
done

bad=0
if (( missing > 0 )); then echo "ALERT: $missing auth user(s) without a profiles row (0161; find ids with the query in its header)"; bad=1; fi
if (( ins != 1 )); then echo "ALERT: auth.users insert trigger ensure_profile_on_auth_user_insert missing or not enabled"; bad=1; fi
if (( del != 1 )); then echo "ALERT: auth.users delete trigger release_profile_on_auth_user_delete missing or not enabled"; bad=1; fi
if (( bad )); then echo "fix: re-apply migration 0161 (node scripts/apply-db-migration.mjs --force-reapply 0161)"; exit 1; fi
echo "ok: 0 auth users without a profiles row, both triggers enabled"
