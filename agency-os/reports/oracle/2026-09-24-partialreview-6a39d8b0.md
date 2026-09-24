# codex-oracle review -- 2026-09-24 14:32:21 +08:00

- mode: `review`
- scope: -Path scripts/check-staging-orphans.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 4 on the staging-orphans detector. Round 3 (confirmed): pipes inside bash -c / outer pipes without pipefail masked du and wp-config read failures. Now: set -u -o pipefail; no pipes inside bash -c; every read checks its own status (docker exec du -sk directly, parsed in the outer shell; wp-config present -> read must succeed else PROBE_ERROR; absent -> NONE as data). Real fault injection on the host with the probe text from this file: bad DB container / bad staging dir / du on missing path / missing wp binary -> PROBE_ERROR each (db_query_failed, staging_dir_list_failed, du_failed:<site>, wp_config_read_failed:<site>); healthy -> PROBE_OK with correct DIR/DB rows. If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 102436ms | answer: 634B
- files-reviewed: scripts/check-staging-orphans.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `test -f` treats execution/read failures as “wp-config absent”
  scripts/check-staging-orphans.ps1:98 -> scripts/check-staging-orphans.ps1:103
  confidence  -> CONFIRMED
  scenario    -> `docker exec ... test -f` fails because the container runtime or command execution errors after `du` succeeds; the nonzero status enters `else`, emits `db=NONE`, and the probe still prints `PROBE_OK` instead of `PROBE_ERROR`.
  why missed  -> Shell `if` cannot distinguish “file absent” (status 1) from execution/permission/container failures (other nonzero statuses), and every failure is treated as absence.

TOTAL: 1 findings
