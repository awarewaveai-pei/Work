# codex-oracle review -- 2026-08-24 19:32:37 +08:00

- mode: `review`
- scope: -Path scripts/check-change-impact-matrix-drift.ps1, scripts/ao-resume.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `9babfd6f`
- context: New generalized drift-detection script: parses docs/CHANGE_IMPACT_MATRIX.md (~85 declared 主文件->impacted-file relationships, real-world messy markdown: full-width commas, parenthetical Chinese annotations, nested backticks, template placeholders like 專案 X.md, one literal Windows-absolute placeholder path), extracts only backtick-quoted spans as candidate paths (deliberately ignoring all prose), resolves each against two bases in order (agency-os-relative first, then repo-root-relative as fallback -- added after real execution caught CLAUDE.md and reverse agency-os/-prefixed paths resolving wrong with only one base), computes mtime drift in days between each resolvable main-doc/impacted-file pair, flags WARN at 90 days and FAIL at 180 days (thresholds match the sibling check-governance-docs-drift.ps1 exactly). Wired as a 5th monthly check into ao-resume.ps1, mirroring the existing 4-check pattern exactly (same exit-code mapping, same monthlyPayload/humanDesc/notification-loop additions).
- exit: 0 | elapsed: 385413ms | answer: 2273B
- files-reviewed: scripts/ao-resume.ps1, scripts/check-change-impact-matrix-drift.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Root `.cursor/rules` mirror files declared in the matrix are never checked
  file:line   -> scripts/check-change-impact-matrix-drift.ps1:151, scripts/check-change-impact-matrix-drift.ps1:156, scripts/check-change-impact-matrix-drift.ps1:182, agency-os/docs/CHANGE_IMPACT_MATRIX.md:26, .cursor/rules/40-shutdown-closeout.mdc:1
  confidence  -> CONFIRMED
  scenario    -> `agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md` changes, the `agency-os/.cursor/rules/*.mdc` copies get updated, but the monorepo-root mirror `.cursor/rules/40-shutdown-closeout.mdc` is forgotten. The matrix row explicitly says the same-name files under root `../.cursor/rules/` must stay mirrored, but the script only harvests backtick spans and then rejects `../.cursor/rules/` because it is not a leaf file. No pair is created for the real root mirror files, so the report can still pass without detecting the stale root rule.
  why missed  -> The implementation treated prose annotations as non-path noise, but this row encodes a real dependency set through a directory-plus-?ame-name file??note.

FINDING 2: The `01-04 guides` shorthand row is skipped, so onboarding-SOP drift against the actual guide files is not detected
  file:line   -> scripts/check-change-impact-matrix-drift.ps1:151, scripts/check-change-impact-matrix-drift.ps1:182, agency-os/docs/CHANGE_IMPACT_MATRIX.md:65, agency-os/tenants/templates/tenant-template/03_TOOLS_CONFIGURATION_GUIDE.md:1, agency-os/tenants/company-p1-pilot/04_OPERATIONS_AUTOMATION_GUIDE.md:1
  confidence  -> CONFIRMED
  scenario    -> `tenants/NEW_TENANT_ONBOARDING_SOP.md` changes, but the template/pilot guide docs such as `03_TOOLS_CONFIGURATION_GUIDE.md` and `04_OPERATIONS_AUTOMATION_GUIDE.md` are not updated. The matrix declares both `tenants/templates/tenant-template/01-04 guides` and `tenants/company-p1-pilot/01-04 guides` as impacted, but the script treats each shorthand as one path and drops it because it is not a leaf file. That means the real guide files never get drift pairs, so the report misses these stale documents entirely.
  why missed  -> The header comment groups ?ange descriptions??with ignorable noise, but this particular shorthand refers to tracked repo files, not a placeholder.

TOTAL: 2 findings
