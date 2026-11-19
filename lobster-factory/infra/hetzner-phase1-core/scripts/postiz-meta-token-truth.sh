#!/usr/bin/env bash
# postiz-meta-token-truth.sh -- daily (cron.d/awarewave-schedules, key postiz_meta_token_truth): make Postiz's stored
# lifetime of every Facebook / Instagram channel equal what Meta itself says about the token (Graph API debug_token).
#
# Why: Postiz v2.25.1 hard-codes a Meta token's life at 59 days (facebook.provider.ts / instagram.provider.ts
# `expiresIn: dayjs().add(59,'days')`) although the Page tokens it stores never expire (debug_token expires_at = 0,
# measured 2026-11-19 for all four channels). When that made-up date passes, Postiz "refreshes", gets an empty token
# back (refreshToken() returns '') and sets refreshNeeded -- a valid channel is then shown as expired and our sender
# (lib/social/channel-health.ts mirror) refuses to post. Aware Wave Facebook hit this on 2026-11-10.
# Invariant: Postiz "Integration".tokenExpiration for Meta = Meta's own expires_at; this job fixes the CAUSE (the
# made-up date), never the symptom (refreshNeeded):
#   valid + publish scope on the posting token + a PAGE token for this channel -> tokenExpiration = Meta's expires_at
#     (0 = never -> 2126-01-01, as Postiz stores Bluesky). Run daily, Postiz's 59-day date (rewritten only on a
#     (re)connect) never gets near enough to fire, so its clock can no longer flag a valid channel.
#   invalid, publish scope missing or not this channel's Page token -> refreshNeeded = true (the 5-minute mirror raises
#     「需要重新授權」).
#   refreshNeeded is NEVER cleared here. It is shared by Postiz's clock, a failed post (page-permission errors map to
#   refresh-token) and the operator disconnecting a channel; its value alone cannot say which, so clearing it could
#   mark a disconnected or broken channel healthy (Codex 2026-11-19 reviews 7a34245f, d0266507, 7ec82e65). A flag left
#   by the clock before this job existed is cleared once by hand with evidence (WORKLOG 2026-11-19: Aware Wave Facebook).
# A finite Meta expiry is written as is: Postiz then flags the channel a day early (needsToBeRefreshed), which is the
# early warning we want for a token that really ends.
# An Instagram token is "<page token>___<user token>": both are checked, the shorter life wins.
# Secrets: the app id|secret and each input token go to curl through a mode-600 file, never argv; nothing is printed
# but provider, channel name, verdict and dates. --dry-run prints the plan and writes nothing.
# Exit 1 = some channel could not be checked (Meta unreachable / answer unreadable); /ops/schedules shows the row red.
set -euo pipefail

DRY=0; [[ "${1:-}" == "--dry-run" ]] && DRY=1
LOG_FILE="${POKE_LOG_FILE:-/var/log/poke.log}"
log() { echo "[$(date -u +%FT%TZ)] postiz_meta_token_truth: $*" >> "$LOG_FILE"; echo "$*"; }

envv() { docker inspect postiz --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n "s/^$1=//p" | head -1; }
APP_ID="$(envv FACEBOOK_APP_ID)"; APP_SECRET="$(envv FACEBOOK_APP_SECRET)"
[[ -n "$APP_ID" && -n "$APP_SECRET" ]] || { log "FACEBOOK_APP_ID / FACEBOOK_APP_SECRET not set in the postiz container -- nothing checked"; exit 1; }

# no -i: SQL goes in -c, and an attached stdin would swallow the while-loop's rows (and the script itself under bash -s)
psql_postiz() { timeout 60 docker exec supabase-db psql -U supabase_admin -d postiz -v ON_ERROR_STOP=1 "$@" < /dev/null; }
# cas_update <id> <token md5> <refreshNeeded as read t|f> <set clause>: writes only if the row still holds the token and
# flag this run judged -- a reconnect between the read and the write (Postiz rewrites the same row) wins (Codex 883e9144).
# Prints the number of rows changed (0 or 1). The md5 keeps the token itself out of the SQL text / process list.
cas_update() {
  psql_postiz -tA -c "with u as (update \"Integration\" set $4 where id = '$1' and md5(token) = '$2' and \"refreshNeeded\" = $([[ $3 == t ]] && echo true || echo false) returning 1) select count(*) from u"
}

work="$(mktemp -d)"; chmod 700 "$work"; trap 'rm -rf "$work"' EXIT
printf '%s|%s' "$APP_ID" "$APP_SECRET" > "$work/app"; chmod 600 "$work/app"

# debug <token> <publish scope> -> "valid|invalid expires_at has_scope(1|0) TYPE profile_id targets" or "error <text>"
#   targets = granular_scopes.target_ids of the publish scope, comma-joined; "*" = not limited to listed assets.
#   (curl name@file = name=<file content, encoded>)
debug() {
  printf '%s' "$1" > "$work/in"; chmod 600 "$work/in"
  curl -s -m 30 -G "https://graph.facebook.com/debug_token" --data-urlencode "input_token@$work/in" --data-urlencode "access_token@$work/app" |
  NEED="$2" python3 -c '
import json, os, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("error unreadable_answer"); sys.exit(0)
if "data" not in d:
    print("error " + str((d.get("error") or {}).get("message", "no data"))[:80].replace(" ", "_")); sys.exit(0)
d = d["data"]; need = os.environ["NEED"]
targets = "*"
for g in d.get("granular_scopes") or []:
    if g.get("scope") == need and g.get("target_ids"):
        targets = ",".join(str(t) for t in g["target_ids"])
print(("valid" if d.get("is_valid") else "invalid"), int(d.get("expires_at") or 0), 1 if need in (d.get("scopes") or []) else 0,
      d.get("type") or "-", d.get("profile_id") or "-", targets)
'
}

failed=0; changed=0
rows="$(psql_postiz -tA -F $'\t' -c "select id, \"providerIdentifier\", name, \"internalId\", token, \"refreshNeeded\", coalesce(extract(epoch from \"tokenExpiration\")::bigint, 0) from \"Integration\" where \"deletedAt\" is null and \"providerIdentifier\" in ('facebook','instagram') order by id")" \
  || { log "Postiz Integration read failed -- nothing checked"; exit 1; }

while IFS=$'\t' read -r id prov name internal tok need stored; do
  [[ -n "$id" ]] || continue
  [[ "$id" =~ ^[a-z0-9]+$ ]] || { log "$prov $name: unexpected id shape, skipped"; failed=1; continue; }
  need_scope="pages_manage_posts"; [[ "$prov" == "instagram" ]] && need_scope="instagram_content_publish"
  tokmd5="$(printf '%s' "$tok" | md5sum | cut -c1-32)"
  parts=("${tok%%___*}"); [[ "$tok" == *___* ]] && parts+=("${tok##*___}")
  verdict="valid"; why=""; expires=0; first=1
  for p in "${parts[@]}"; do
    read -r v e has ty prof targets <<<"$(debug "$p" "$need_scope")"
    # an unreadable answer is inconclusive -- unless an earlier part already proved the channel cannot post (Codex 4c828135)
    if [[ "$v" == "error" ]]; then [[ "$verdict" == "invalid" ]] || verdict="error:$e"; break; fi
    [[ "$v" == "valid" ]] || { verdict="invalid"; why="token invalid"; }
    # the first part is what Postiz posts with (instagram.provider.ts uses it for /media): it alone must be a Page
    # token holding the publish scope for THIS channel -- Facebook: profile_id = the Page; Instagram: the IG account
    # among the scope's target_ids when Meta limits it (Codex review-0c3089cf). The second part only has to be valid.
    if (( first )); then
      [[ "$ty" == "PAGE" ]] || { verdict="invalid"; why="not a Page token ($ty)"; }
      [[ "$has" == "1" ]] || { verdict="invalid"; why="$need_scope missing on the posting token"; }
      [[ "$prov" != "facebook" || "$prof" == "$internal" ]] || { verdict="invalid"; why="token belongs to another Page"; }
      [[ "$prov" != "instagram" || "$targets" == "*" || ",$targets," == *",$internal,"* ]] || { verdict="invalid"; why="token not granted for this Instagram account"; }
      first=0
    fi
    # 0 = never; the shorter real life wins
    if [[ "$e" != "0" ]] && { [[ "$expires" == "0" ]] || (( e < expires )); }; then expires="$e"; fi
  done
  if [[ "$verdict" == error:* ]]; then log "$prov $name: Meta answer unusable (${verdict#error:}) -- left as is"; failed=1; continue; fi

  if [[ "$verdict" == "valid" ]]; then
    target="2126-01-01 00:00:00+00"; label="never"
    if [[ "$expires" != "0" ]]; then target="$(date -u -d "@$expires" '+%F %T+00')"; label="$(date -u -d "@$expires" +%F)"; fi
    target_epoch="$(date -u -d "${target%+00}" +%s)"
    if [[ "$stored" == "$target_epoch" ]]; then
      echo "$prov $name: valid, expires $label (already stored$([[ $need == t ]] && echo '; refreshNeeded=t left: set by a post, a disconnect or the old clock'))"; continue
    fi
    log "$prov $name: Meta says valid, expires $label -> tokenExpiration $label (refreshNeeded=$need not touched)"
    [[ $DRY == 1 ]] || [[ "$(cas_update "$id" "$tokmd5" "$need" "\"tokenExpiration\" = '$target'")" == 1 ]] || { log "$prov $name: changed meanwhile (reconnect?), left for the next run"; continue; }
    changed=$((changed + 1))
  else
    if [[ "$need" == "t" ]]; then echo "$prov $name: Meta says no ($why), already refreshNeeded"; continue; fi
    log "$prov $name: Meta says no ($why) -> refreshNeeded true (the mirror raises 需要重新授權)"
    [[ $DRY == 1 ]] || [[ "$(cas_update "$id" "$tokmd5" "$need" "\"refreshNeeded\" = true")" == 1 ]] || { log "$prov $name: changed meanwhile (reconnect?), left for the next run"; continue; }
    changed=$((changed + 1))
  fi
done <<<"$rows"

echo "done: changed=$changed failed=$failed dry_run=$DRY"
exit "$failed"
