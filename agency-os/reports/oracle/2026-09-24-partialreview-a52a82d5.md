# codex-oracle review -- 2026-09-24 14:05:23 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/scripts/deprovision-staging.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/hosting-gate.test.sh  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2. Round 1 finding (confirmed): an HTTP 200 non-JSON wp_sites body became SB_COUNT=0 and teardown continued. Invariant applied to every Supabase interaction in the script, not just that line: every read must be a verified JSON array (is_json_array) or the script aborts before anything destructive; the organizations read gained --fail + the same check; the organizations PATCH now checks its HTTP status and aborts before DB/dir deletion. Test gained a busybox stub serving HTML on 200. Verify and report anything else real. If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 266439ms | answer: 733B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/scripts/deprovision-staging.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/hosting-gate.test.sh
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Organization metadata cleanup always fails because the JSON pipe is overridden by the Python heredoc
  file:line   -> lobster-factory/infra/hetzner-phase1-core/scripts/deprovision-staging.sh:311
  confidence  -> CONFIRMED
  scenario    -> An organization row exists and its `metadata.site_url` matches the staging URL -> `python3 -` reads the heredoc as its script, receives EOF instead of `ORG_JSON` on stdin, raises `JSONDecodeError`, and `set -e` aborts deprovision before database or directory deletion; the org row remains uncleared.
  why missed  -> The pipeline and heredoc both attempt to provide stdin; the heredoc silently wins, so the intended JSON input never reaches `json.load(sys.stdin)`.

TOTAL: 1 findings
