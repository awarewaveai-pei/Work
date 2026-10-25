#!/usr/bin/env bash
# scripts/check-trigger-slots.sh against stub Redis / Postgres readers (fixtures in a temp dir). From the repo root:
#   bash lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/check-trigger-slots.test.sh
# SRC=<path> tests a mutated copy.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${SRC:-$HERE/../../scripts/check-trigger-slots.sh}"
T="$(mktemp -d)"
cat > "$T/redis" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  --scan) case "$5" in *:currentConcurrency) cat "$FIX/keys" ;; *) cat "$FIX/limits" ;; esac ;;
  smembers) [[ -f "$FIX/smembers-fails" ]] && exit 1; cat "$FIX/members.$(printf '%s' "$2" | md5sum | cut -c1-8)" 2>/dev/null ;;
esac
EOF
cat > "$T/psql" <<'EOF'
#!/usr/bin/env bash
cat > "$FIX/sql"; cat "$FIX/rows"
EOF
chmod +x "$T/redis" "$T/psql"

BASEK='engine:runqueue:{org:o}:proj:p:env:env_a'
ENV="$BASEK:currentConcurrency"
QUEUE="$BASEK:queue:task/x:currentConcurrency"
fails=0
# case <name> <expected exit> <expected text> <members, space separated> <psql rows, ; separated> [flag]
case_() {
  local name="$1" want="$2" text="$3" members="$4" rows="$5" flag="${6:-}"
  FIX="$(mktemp -d "$T/f.XXXX")"
  if [[ "$flag" == no-limit-key ]]; then : > "$FIX/limits"; else printf '%s\n%s\n' "$BASEK:concurrency" "$BASEK:queue:task/x:concurrency" > "$FIX/limits"; fi
  if [[ -n "$members" ]]; then printf '%s\n%s\n' "$ENV" "$QUEUE" > "$FIX/keys"; else : > "$FIX/keys"; fi
  [[ "$flag" == smembers-fails ]] && touch "$FIX/smembers-fails"
  tr ' ' '\n' <<< "$members" > "$FIX/members.$(printf '%s' "$ENV" | md5sum | cut -c1-8)"
  echo "should never be read" > "$FIX/members.$(printf '%s' "$QUEUE" | md5sum | cut -c1-8)"
  tr ';' '\n' <<< "$rows" > "$FIX/rows"
  out="$(FIX="$FIX" TRIGGER_REDIS_CLI="$T/redis" TRIGGER_PSQL="$T/psql" bash "$SRC" 2>&1)"; rc=$?
  if [[ "$rc" == "$want" && "$out" == *"$text"* ]]; then echo "ok   $name"
  else echo "FAIL $name (rc=$rc)"; echo "$out" | sed 's/^/     /'; fails=$((fails + 1)); fi
}

P='env_a|run1|PRODUCTION'
case_ "no slot held"                     0 "ok: 0 slots held" "" ""
case_ "executing run holds a slot"       0 "1 slot(s) held, 0 stuck" "run1" "$P|EXECUTING|site-watch-run|60"
case_ "pending for 30 min = leaked"      1 "STUCK (PRODUCTION/env_a): run1 site-watch-run PENDING for 30min" "run1" "$P|PENDING|site-watch-run|30"
case_ "pending for 5 min = young"        0 "(young)" "run1" "$P|PENDING|site-watch-run|5"
case_ "finished run still holds a slot"  1 "STUCK (PRODUCTION/env_a): run2" "run1 run2" "$P|EXECUTING|a|3;env_a|run2|PRODUCTION|COMPLETED_SUCCESSFULLY|b|40"
case_ "slot without a TaskRun row"       1 "has no TaskRun row" "run9" "env_a|run9|PRODUCTION|||"
case_ "dev env leak is listed, not failed" 0 "ignored (DEVELOPMENT/env_a)" "run1" "env_a|run1|DEVELOPMENT|DEQUEUED|x|90"
case_ "member with odd characters"       2 "refusing" "run1';drop" ""
case_ "no limit key = layout changed"    2 "key layout changed" "" "" no-limit-key
case_ "smembers fails = not ok"          1 "" "run1" "$P|EXECUTING|a|1" smembers-fails
case_ "query lost a row = cannot tell"   2 "returned 1 row" "run1 run2" "$P|EXECUTING|a|3"

rm -rf "$T"
(( fails )) && { echo "$fails failed"; exit 1; }
echo "all passed"
