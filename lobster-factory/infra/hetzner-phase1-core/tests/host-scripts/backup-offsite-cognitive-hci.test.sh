#!/usr/bin/env bash
# backup-offsite-cognitive-hci.sh against stub docker / uploader (no network, no containers). From the repo root:
#   MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD/lobster-factory/infra/hetzner-phase1-core:/src:ro" ubuntu:24.04 \
#     bash /src/tests/host-scripts/backup-offsite-cognitive-hci.test.sh
# ubuntu:24.04 = ks-aw-01's bash 5.2 / GNU find. SRC=<file> tests a mutated copy.
set -euo pipefail

SRC="${SRC:-$(dirname "$0")/../../scripts/backup-offsite-cognitive-hci.sh}"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"
# docker stub: `inspect` answers the .runtime volume name from $VOL (empty = no such mount); `run ... tar czf` writes
# a non-empty runtime.tgz into the -v <dir>:/backup mount.
cat > "$T/bin/docker" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == inspect ]]; then printf '%s' "${VOL:-}"; exit 0; fi
for a in "$@"; do [[ "$a" == *:/backup ]] && out="${a%:/backup}"; done
echo blobs > "$out/runtime.tgz"
EOF
cat > "$T/bin/upload" <<'EOF'
#!/usr/bin/env bash
echo "$R2_PREFIX $2 $(ls -A "$1" | sort | tr '\n' ' ')" >> "$UPLOADS"
exit "${UPLOAD_RC:-0}"
EOF
chmod +x "$T/bin/docker" "$T/bin/upload"

pass=0; failed=0
check() { local d="$1"; shift; if "$@"; then echo "PASS $d"; pass=$((pass + 1)); else echo "FAIL $d"; failed=$((failed + 1)); fi; }
not() { ! "$@"; }

reset() {
  rm -rf "$T/cog" "$T/out" "$T/hci" "$T/uploads"
  mkdir -p "$T/cog" "$T/out" "$T/hci/20260115-024501"
  touch "$T/cog/cognitive-db-2026-01-15-636f676e69746976655f6f73-021701-42.dump" \
        "$T/cog/cognitive-db-2026-01-15-706f737467726573-021701-42.dump" \
        "$T/hci/20260115-024501/hci-postgres.sql.gz" "$T/hci/20260115-024501/.complete"
  echo x > "$T/cog/cognitive-db-2026-01-15-636f676e69746976655f6f73-021701-42.dump"
}
run() {
  set +e
  PATH="$T/bin:$PATH" VOL="${VOL-cognitive-os-files-aw01}" UPLOADS="$T/uploads" COG_SRC="$T/cog" COG_OUT_ROOT="$T/out" \
    HCI_ROOT="$T/hci" UPLOAD="$T/bin/upload" bash "$SRC" > "$T/log" 2>&1
  RC=$?
  set -e
}
snapshots() { find "$T/out" -mindepth 1 -maxdepth 1 -type d | wc -l; }

# 1. A good run ships both databases + runtime.tgz under cognitive/, and the finished hci snapshot under hci/.
reset; run
check "good run exits 0"                          test "$RC" -eq 0
check "cognitive dir has both dumps + runtime"    grep -q "^cognitive .* cognitive_os.dump postgres.dump runtime.tgz" "$T/uploads"
check "hci snapshot shipped"                      grep -q "^hci 2026-01-15 " "$T/uploads"
check "cognitive snapshot marked .complete"       test -n "$(find "$T/out" -name .complete)"

# 2. The same dump run is never shipped twice (a re-ship restarts R2's age clock: erasure).
run
check "second run with no new dump fails"         test "$RC" -eq 1
check "no second cognitive upload"                test "$(grep -c '^cognitive ' "$T/uploads")" -eq 1
check "no second local snapshot"                  test "$(snapshots)" -eq 1

# 3. Old local snapshots go even when the upload fails.
reset; mkdir -p "$T/out/20260101-025001"; touch -d '6 days ago' "$T/out/20260101-025001"
UPLOAD_RC=1 run
check "failed upload still removes a 6-day-old snapshot" not test -e "$T/out/20260101-025001"
check "failed upload exits 1"                     test "$RC" -eq 1

# 4. No .runtime mount -> fail, nothing shipped (an unknown volume name would make docker create an empty one).
reset; VOL="" run
check "missing .runtime volume fails"             grep -q "has no .runtime volume" "$T/log"
check "nothing uploaded for cognitive"            not grep -q "^cognitive " "$T/uploads"

# 5. An hci snapshot without .complete is not shipped.
reset; rm "$T/hci/20260115-024501/.complete"; run
check "unfinished hci snapshot fails"             grep -q "did not finish" "$T/log"
check "unfinished hci snapshot not uploaded"      not grep -q "^hci " "$T/uploads"

echo "pass=$pass failed=$failed"
[[ "$failed" -eq 0 ]]
