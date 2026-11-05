#!/usr/bin/env bash
# scripts/check-auth-profiles.sh against a stub psql reader. From the repo root:
#   bash lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/check-auth-profiles.test.sh
# SRC=<path> tests a mutated copy.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${SRC:-$HERE/../../scripts/check-auth-profiles.sh}"
T="$(mktemp -d)"
cat > "$T/psql" <<'STUB'
#!/usr/bin/env bash
cat > /dev/null; [[ "$STUB_FAIL" == 1 ]] && exit 1; printf '%s\n' "$STUB_ROW"
STUB
chmod +x "$T/psql"
fails=0
# case_ <name> <expected exit> <expected text> <row> [fail]
case_() {
  out="$(STUB_ROW="$4" STUB_FAIL="${5:-0}" AUTH_PROFILES_PSQL="$T/psql" bash "$SRC" 2>&1)"; rc=$?
  if [[ "$rc" == "$2" && "$out" == *"$3"* ]]; then echo "ok   $1"
  else echo "FAIL $1 (rc=$rc)"; echo "$out" | sed 's/^/     /'; fails=$((fails + 1)); fi
}
case_ "all good"                  0 "ok: 0 auth users"       "0|1|1"
case_ "user without a profile"    1 "2 auth user(s) without" "2|1|1"
case_ "insert trigger missing"    1 "insert trigger"         "0|0|1"
case_ "delete trigger disabled"   1 "delete trigger"         "0|1|0"
case_ "query fails = cannot tell" 2 "cannot tell"            "" 1
case_ "garbled answer"            2 "unexpected answer"      "x|1|1"
rm -f "$T/psql"; rmdir "$T"
if (( fails )); then echo "$fails failed"; exit 1; fi
echo "all passed"
