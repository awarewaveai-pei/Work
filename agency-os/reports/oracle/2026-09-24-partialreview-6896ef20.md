# codex-oracle review -- 2026-09-24 14:25:27 +08:00

- mode: `review`
- scope: -Path scripts/check-staging-orphans.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2 on the staging-orphans detector. Round 1 (both confirmed): (1) DB probe failure produced no DB rows -> silent; now the query output is captured, a non-zero exit prints PROBE_ERROR db_query_failed (parser -> sg_probe blind spot); (2) cleanup hint hard-coded the host; now built from the same KsAw01* parameters. Same invariant applied to the directory side: the probe prints a PROBE_OK completion marker, and sg_parse_empty is now keyed on the missing marker instead of dirs.Count -eq 0, because after a full cleanup zero staging sites is the true state (the old rule would report a blind spot forever). Verify and report anything else real. If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 85257ms | answer: 1105B
- files-reviewed: scripts/check-staging-orphans.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Directory-probe failures can be reported as a valid empty staging set

  file:line   -> scripts/check-staging-orphans.ps1:86-94  
  confidence  -> CONFIRMED  
  scenario    -> `docker exec lobster-wordpress ... ls -1 $BASE` fails while the DB probe succeeds -> the loop emits no `DIR` rows, `PROBE_OK` is still printed, and the parser treats zero directories as a valid clean state, potentially missing directory-only orphans.  
  why missed  -> `set -u` does not fail on non-zero command substitutions; only the DB command has an explicit failure check.

FINDING 2: Cleanup commands do not use the configured private key

  file:line   -> scripts/check-staging-orphans.ps1:229-232  
  confidence  -> CONFIRMED  
  scenario    -> the probe succeeds with `-KsAw01PrivateKey C:\keys\staging.pem`, but the generated report’s cleanup command omits `-i C:\keys\staging.pem` -> following the report uses the default SSH key and fails authentication.  
  why missed  -> The host, port, and user were parameterized, but the key parameter was not carried into the generated command.

TOTAL: 2 findings
