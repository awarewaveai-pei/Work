# codex-oracle inspect -- 2026-08-29 10:38:09 +08:00

- mode: `inspect`
- scope: whole repo
- target: `working tree (staged + unstaged + untracked)`
- context: (none given)
- exit: 0 | elapsed: 460144ms | answer: 2213B
- files-reviewed: (n/a for this mode)
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

1. `CONFIRMED` Gate contracts are not machine-joinable. `.ai/research/phase-0/open-questions.yaml:48-52,68-71,88-91`, `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md:102,182-187`, `docs/architecture/MVP_VERTICAL_SLICE_PLAN.md:88,117`. State: a Research slice reaches `Statistical Gate` / `Authorship Gate` after `run_statistics`. Wrong outcome: current repo has no stable `risk_tier` mapping, gate list, or side-state mapping to inject and record that gate, so the check cannot be represented deterministically.

2. `CONFIRMED` Method Selection compatibility checking is non-executable for almost all methods. `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md:12-15,163-168`, `AI_LEGO_OS_Program_Plan_v1.md:144`. State: Phase 5 asks the selector to compare any method outside the 2 contracted Atlas entries. Wrong outcome: there is no machine-readable contract set to evaluate compatibility, so method choice falls back to ad hoc inference instead of a checkable selector.

3. `CONFIRMED` Business mode is self-blocking under the repo’s own rules. `.ai/research/phase-1/CONFLICT_REGISTER.yaml:51-64`, `docs/architecture/MVP_VERTICAL_SLICE_PLAN.md:27-30,41`. State: the team chooses Business as the Phase 5 slice and reaches `Financial Assumptions`. Wrong outcome: Atlas has no resolvable method there, so the flow should stop with `PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED` before the recipe can complete.

4. `CONFIRMED` Jurisdiction/legal packing is still undefined. `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md:14,160-161,185`, `docs/architecture/MVP_VERTICAL_SLICE_PLAN.md:51,93`. State: an EU tenant enters deletion/compliance flow. Wrong outcome: there is no defined `Jurisdiction Pack` or conflict-of-laws output contract, so applicable-law selection cannot be replayed or audited deterministically.

5. `CONFIRMED` The evidence trail for the Business blocker is mislinked. `.ai/research/phase-1/ASSUMPTION_REGISTER.yaml:23-27`, `docs/architecture/MVP_VERTICAL_SLICE_PLAN.md:13-17`. State: a reviewer follows `P1-ASSUM-PROD-3` to understand the finance-pack blocker. Wrong outcome: the register points to `P1-GAP-PROD-9` instead of the actual blocker `P1-CONFLICT-4`, sending triage to the wrong issue.
