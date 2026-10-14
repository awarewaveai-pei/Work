#!/usr/bin/env bash
# upload-to-r2.sh retry behaviour against a fake curl (no network, no token). From the repo root:
#   MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD/lobster-factory/infra/eu-backup:/src:ro" ubuntu:24.04 bash /src/upload-to-r2.test.sh
# ubuntu:24.04 = ks-aw-01's bash 5.2. SRC=<file> tests a mutated copy.
set -euo pipefail

SRC="${SRC:-$(dirname "$0")/upload-to-r2.sh}"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/in"

# Fake curl: answers a key with the next line of $FAKE_DIR/plan.<file name> (else plan.default).
# Every call is appended to $FAKE_DIR/calls as "<key> <code>".
cat > "$T/bin/curl" <<'EOF'
#!/usr/bin/env bash
url="${!#}"
if [[ "$url" == *"?prefix="* ]]; then   # listing: answer with $FAKE_DIR/list.<file name>, else empty
  key="${url##*\?prefix=}"; name="${key##*/}"; echo "LIST $key" >> "$FAKE_DIR/calls"
  if [[ -f "$FAKE_DIR/list.$name" ]]; then cat "$FAKE_DIR/list.$name"; else echo '{"success":true,"result":[]}'; fi
  exit 0
fi
key="${url##*/objects/}"; name="${key##*/}"
plan_file="$FAKE_DIR/plan.$name"; [[ -f "$plan_file" ]] || plan_file="$FAKE_DIR/plan.default"
code="$(head -1 "$plan_file")"; tail -n +2 "$plan_file" > "$plan_file.next"
[[ -s "$plan_file.next" ]] && mv "$plan_file.next" "$plan_file" || rm -f "$plan_file.next"
echo "$key $code" >> "$FAKE_DIR/calls"
printf '%s' "$code"
[[ "$code" == 000 ]] && exit 28
exit 0
EOF
chmod +x "$T/bin/curl"

pass=0; failed=0
check() { local d="$1"; shift; if "$@"; then echo "PASS $d"; pass=$((pass + 1)); else echo "FAIL $d"; failed=$((failed + 1)); fi; }
calls_for() { grep -c "^eu/D/$1 " "$T/fake/calls" || true; }

run() {  # run <case-name>; plan files must already be in $T/fake
  rm -f "$T/fake/calls"; touch "$T/fake/calls"
  set +e
  PATH="$T/bin:$PATH" FAKE_DIR="$T/fake" R2_API_TOKEN=x R2_PREFIX=eu R2_RETRY_BASE_SECONDS="${BASE:-0}" \
    R2_SPLIT_THRESHOLD_BYTES=1000 R2_SPLIT_PART_BYTES=1000 bash "$SRC" "$T/in" D > "$T/out.$1" 2>&1
  RC=$?
  set -e
}
plan() { mkdir -p "$T/fake"; printf '%s\n' "${@:2}" > "$T/fake/plan.$1"; }
reset() { rm -rf "$T/fake" "$T/in"; mkdir -p "$T/fake" "$T/in"; echo 200 > "$T/fake/plan.default"; }

# 1. A small file answered 502 once is retried and lands.
reset; head -c 100 /dev/zero > "$T/in/small.gz"; plan small.gz 502 200; run c1
check "502 then 200 on a small file -> exit 0"       test "$RC" -eq 0
check "502 then 200 -> two PUTs"                     test "$(calls_for small.gz)" -eq 2

# 2. The 10-14 case: a middle part of a split file answered 502 twice, then 200 -> manifest is written.
reset; head -c 2500 /dev/zero > "$T/in/big.tgz"; plan big.tgz.part-001 502 502 200; run c2
check "split part 502,502,200 -> exit 0"             test "$RC" -eq 0
check "split part -> manifest uploaded"              test "$(calls_for big.tgz.parts.json)" -eq 1
check "split part -> three PUTs for part-001"        test "$(calls_for big.tgz.part-001)" -eq 3
check "retry text stays out of the captured code"    grep -qE "big\.tgz\.part-001 \([^)]*\) \[200\]$" "$T/out.c2"

# 3. 000 (dropped connection, the 09-08/09-09 case) and 429 are retried too.
reset; head -c 100 /dev/zero > "$T/in/m.sql.gz"; plan m.sql.gz 000 429 200; run c3
check "000, 429, 200 -> exit 0"                      test "$RC" -eq 0
check "000, 429, 200 -> three PUTs"                  test "$(calls_for m.sql.gz)" -eq 3

# 4. A final 4xx is not retried.
reset; head -c 100 /dev/zero > "$T/in/x.gz"; plan x.gz 413 200; run c4
check "413 -> exit 1"                                test "$RC" -eq 1
check "413 -> one PUT only"                          test "$(calls_for x.gz)" -eq 1

# 5. A persistent 502 gives up after R2_PUT_ATTEMPTS (4) and no manifest is written for a split file.
reset; head -c 2500 /dev/zero > "$T/in/big.tgz"; plan big.tgz.part-002 502 502 502 502 200; run c5
check "persistent 502 -> exit 1"                     test "$RC" -eq 1
check "persistent 502 -> four PUTs"                  test "$(calls_for big.tgz.part-002)" -eq 4
check "persistent 502 -> no manifest"                test "$(calls_for big.tgz.parts.json)" -eq 0
check "retry lines are in the log, not in the code"  grep -q "retry eu/D/big.tgz.part-002 after HTTP 502" "$T/out.c5"

# 6. WORM prefix: 502 whose PUT was in fact stored, then 409 -> accepted because the stored size matches.
reset; head -c 100 /dev/zero > "$T/in/w.tgz"; plan w.tgz 502 409
echo '{"result":[{"key":"eu/D/w.tgz","etag":"e","size":100}]}' > "$T/fake/list.w.tgz"; run c6
check "409 with the same stored size -> exit 0"      test "$RC" -eq 0

# 7. 409 with a different stored size is a real conflict.
reset; head -c 100 /dev/zero > "$T/in/w.tgz"; plan w.tgz 409
echo '{"result":[{"key":"eu/D/w.tgz.parts.json","size":100},{"key":"eu/D/w.tgz","etag":"e","size":99}]}' > "$T/fake/list.w.tgz"; run c7
check "409 with another size -> exit 1"              test "$RC" -eq 1

# 8. The retry budget stops retries: a 15s wait would cross a 10s budget.
reset; head -c 100 /dev/zero > "$T/in/b.gz"; plan b.gz 502 200; R2_RETRY_BUDGET_SECONDS=10 BASE=15 run c8
check "budget exhausted -> exit 1"                   test "$RC" -eq 1
check "budget exhausted -> one PUT, no wait"         test "$(calls_for b.gz)" -eq 1

echo "pass=$pass failed=$failed"
[[ "$failed" -eq 0 ]]
