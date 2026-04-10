# Rules Version and Enforcement (SSOT)

> Owner: this file is the single source of truth for runtime rule precedence, versioning, and hard-fail enforcement.
> Scope: AO-RESUME/AO-CLOSE behavior and rule-mirror consistency across `agency-os/.cursor/rules` and monorepo root `.cursor/rules`.

## Version

- Version: `2026-04-10.1`
- Supersedes: ad-hoc verbal conventions and implicit "assistant memory" habits.
- Effective from: immediately.

## Non-Negotiable Priority

1. User explicit instruction in current turn
2. AO keyword rules (`00`, `30`, `40`) and this enforcement file
3. `AGENTS.md` and operational SSOT docs
4. Legacy patterns/templates

If conflict exists, lower-priority behavior is invalid.

## Hard-Fail Criteria

The following conditions must be treated as failures (not style differences):

- AO-RESUME report does not include all unchecked `- [ ]` lines from `TASKS.md` (or open-tasks snapshot when present).
- Rule mirrors are inconsistent between `agency-os/.cursor/rules` and root `.cursor/rules` for required files.
- AO preflight is reported as PASS while underlying script exits non-zero.

## Required Runtime Enforcement

- `scripts/ao-resume.ps1` must run a rule-consistency precheck before normal preflight.
- Rule-consistency precheck must fail when mirror verification fails.
- Failure output must include one-line quick fix instructions.

## Rule Mirror Set (minimum)

- `00-session-bootstrap.mdc`
- `30-resume-keyword.mdc`
- `40-shutdown-closeout.mdc`
- `50-operator-autopilot.mdc`
- `63-cursor-core-identity-risk.mdc`
- `64-architecture-mcp-routing.mdc`
- `65-build-standards-data-state.mdc`
- `66-skills-observability-protocol.mdc`

## AO-RESUME Report Validity Contract

Any AO-RESUME reply is invalid unless it includes:

- required sections per `30-resume-keyword.mdc`
- complete "unchecked tasks full listing" with no omissions
- explicit mention of preflight PASS/FAIL
- **Git／開工裁決**（`30-resume-keyword.mdc` 第 3 節「目前進度」）：**`ao-resume.ps1` exit code**；**Strict** 是否 **`AUDIT RESULT: PASS (no warnings)`**（或誠實寫失敗原因）；**`ahead`／`behind` vs `origin/main`**

## Change Process (to avoid drift)

1. Update this owner file first.
2. Update execution hooks (`ao-resume.ps1`, keyword rule files).
3. Run sync/health gates.
4. Record in `WORKLOG.md`, `TASKS.md`, and memory files.

