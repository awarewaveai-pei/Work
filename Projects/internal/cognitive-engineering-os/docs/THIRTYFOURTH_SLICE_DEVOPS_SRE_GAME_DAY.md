# Thirty-fourth Method Atlas slice: `devops_sre.game_day`

Status: **LANDED (2026-09-05)**. NINTH slice from the `devops_sre` family (F19), after `devops_sre.sli_slo` (twentieth), `devops_sre.canary_deployment` (twenty-first), `devops_sre.chaos_engineering` (twenty-second), `devops_sre.blue_green_deployment` (twenty-third), `devops_sre.error_budget` (twenty-fourth), `devops_sre.capacity_model` (thirty-first), `devops_sre.release_readiness_review` (thirty-second), and `devops_sre.runbook_execution` (thirty-third).

## What was built

Atlas gives this method exactly one citation of its own: the F19 tool table's Game Day row (L858: "scenario→roles→inject→recover→AAR", benefit "驗證人與流程" -- verify people and process). The formula's own final phase, AAR, is itself a named Atlas method (F17 After Action Review, L804: "Expected? Actual? Why? Next?"); this slice transcribes those four questions as the structure of its own `aar` phase output WITHOUT minting the F17 method. The five phases ground FOUR invariants: unique role names (compared after whitespace-collapse + casefold); `time_to_recover_minutes` present **iff** `outcome: recovered` (deliberately bidirectional -- a duration on a failed exercise is not a conservative extra, it is a number that reads as success); an optional `recovery.runbook_execution_ref` carrying the `RBEXEC-` prefix (the soft link `devops_sre.runbook_execution`'s own `OQ-RUNBOOKEXECUTION-2` asked for, now answered in that contract); and all four AAR questions answered.

* `methods/contracts/devops_sre.game_day.contract.yaml`, `specs/cognitive/typed-objects/game-day-record.schema.yaml` (spec-root suite 2786 -> 2789; the schema also carries an `if/then/else` defense-in-depth signal for the recovery-time coupling, the same class as `backup-restore-drill-record`'s own `dependentRequired`).
* `ai_lego/modules/devops_sre/game_day.py` -- builder + 2 gates, sharing eight predicates between builder and gate (record scalar fields, role shape, normalized duplicate roles, recovery key set, recovery validity, runbook-ref format, recovery-time coupling, aar shape) plus one shared normalization helper.
* `ai_lego/apps/cli/run_game_day_slice.py` -- a real recovered exercise and a real not-recovered exercise, plus two-layer attack-and-confirm (a recovered exercise with no duration at construction; a failed exercise with a smuggled duration at the gate).
* `tests/unit/test_game_day.py` -- 68 tests, including one dedicated gate-layer test per scalar identity field (id / scenario / injected_failure) -- the lesson `devops_sre.runbook_execution`'s own critic round taught when `runbook_ref` turned out to be untested independently of `id`.
* `methods/contracts/devops_sre.runbook_execution.contract.yaml` -- `OQ-RUNBOOKEXECUTION-2` annotated as answered (the question kept as the record).

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`, and every prior family module.

## Due diligence, done broad this time

Two consecutive prior slices' own critic rounds each caught a name-only citation grep that was too narrow. This slice searched the spec root for "game day / gameday", "AAR / after action / postmortem / post-mortem", and "演練 / drill / tabletop" BEFORE writing the contract, read every neighbour surfaced, and disclosed each as distinct: `devops_sre.chaos_engineering` (system hypothesis vs people/process -- `OQ-GAMEDAY-5` for a symmetric `chaos_experiment_ref`), `database_data.backup_restore_drill` (data restore vs people/process), `docs/architecture/DEVOPS_SRE_PLAN.md` §3.1's own semi-annual failover exercise (the closest real sibling, prose, `OQ-GAMEDAY-3`), Execution Contract §55's own Post-mortem terminal step, and risk-tier R4's own "Recovery Drill" required-action name.

## Critic round: first verdict `pass` this session -- but the untested-correct-line class survived twice

A `critic` subagent review (20 runtime mutations x 63 tests, 6 schema-layer mutations against a temp spec-root copy, and an independently written violation oracle over 1,012 enumerated recovery/role shapes) returned **pass: zero Critical, zero Major** -- the first slice this session whose first draft drew no Critical or Major. All seven builder `raise` sites were traced to a gate-side re-derivation via the same shared predicate (prior-round class "gate recomputes outputs but not inputs" fully pre-empted, proven by six gate-side mutations all killed); the oracle found zero escapes and zero false positives; the contract-backlog registration was verified real; no invented rule was found.

What the review still caught (all fixed):

1. **Minor** -- `_duplicate_role_names`'s `sorted()` was correct but no test supplied two *different* duplicated names, so replacing the sort with an unordered list survived the whole suite: the exact untested-sort class `devops_sre.runbook_execution`'s own round caught, which this slice's first draft claimed to have carried forward. Fixed with a two-duplicate gate test pinning sorted evidence.
2. **Minor** -- the builder's `version` / `generated_by_method` keyword parameters were unasserted; hardcoding `generated_by_method` (the value `MethodCatalog.invoke` provenance-chains on) survived. Fixed with a round-trip test.
3. **Minor** -- undisclosed runtime/schema divergence: the runtime enforces *another* record's id prefix (`RBEXEC-`) but not its own `^GAMEDAY-`, `version` type, or a closed top-level key set -- the builder emits `id: DRILL-999` and both gates pass. Disclosed as a compilation decision (family-wide convention: the schema owns the record's own envelope), with a schema-layer test pinning the sole defense.
4. **Minor** -- only the `if/then/else` clause of the schema was regression-protected; weakening every `\S` pattern, flipping `additionalProperties`, or deleting the id prefix all survived. Fixed with three negative schema tests, and the two existing schema tests tightened from `assertRaises(Exception)` to a field-named regex.
5. **Minor** -- the broad due-diligence grep still missed this contract's own purpose verb: `rehears*` hits Atlas L838/L867/L1111/L3420/L3449/L4481 and EC §55 (an unnamed pre-deploy flowchart step, not a method) -- disclosed in the contract; not a duplicate.
6. **Minor** -- this doc carried a stale "regression pending" claim after the regression had already run.

Suggestions not taken, each disclosed: top-level key set left open (family convention, now in the same compilation decision); `_duplicate_role_names` keeps its `continue` on malformed roles (both callers validate first, docstring states the precondition). Two stray untracked `agency-os/` trees inside the product and spec roots were confirmed to come from `~/.claude/hooks/ao-resume-on-prompt.ps1:36` throwing from a non-root cwd and writing its fail log relative to cwd -- not this slice's doing, left untouched, registered in `agency-os/TASKS.md`.

The lesson this round adds: a slice can genuinely pre-empt the *logic* classes prior rounds caught (gate re-validation, registration claims, broad grep) and still repeat the *proof* class -- a correct line that no test forces to execute. Mutation testing, not code review, is what finds that class, and it found it on the very line that mirrors the previous slice's own survivor.

## Evidence

CLI: `PASS devops_sre.game_day: 3 roles, outcome=recovered, time_to_recover_minutes=23, runbook_execution_ref=RBEXEC-2026-09-05-002, gates [provenance_required=PASS, game_day_integrity=PASS], invariant_verified(construction=True, gate=True)`. 68 unit tests passed (63 first draft -> 68 after the critic-fix round). Both critic-surviving mutations re-run after the fix are killed by the named tests. Golden suite 2789 (2786 before this slice). Full product-root regression: 896 -> 964 OK, zero regressions.

## Honest limits

No method-inventory.yaml machine_id row (`OQ-GAMEDAY-1`, same disclosed-not-silent pattern as every prior slice this session). F17 After Action Review has no contract; the embedded `aar` object may later become a reference (`OQ-GAMEDAY-2`). `DEVOPS_SRE_PLAN.md` §3.1's failover exercise is not cross-referenced in either direction (`OQ-GAMEDAY-3`). No structured timeline, only a duration (`OQ-GAMEDAY-4`). No `chaos_experiment_ref` (`OQ-GAMEDAY-5`). The `runbook_execution_ref` link is format-only -- this method cannot see the referenced record.
