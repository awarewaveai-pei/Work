# Aware Wave System Foundry — Master Plan v1.6

## 定位
System Foundry 是 **Enterprise System Engineering Compiler + Semantic Assurance Runtime + Project Control Plane**。輸入想法、需求、既有系統或轉型目標，輸出可執行、可驗證、可回滾、可替換、可長期演進的 Blueprint、Repository Skeleton、Implementation Backlog、Release Evidence 與 Lifecycle State。

## 八大母準則
1. 多角度優先
2. 30 年工程紀律
3. 零重工原則
4. 完整閉環
5. 最小爆炸半徑
6. 證據優於假設
7. 可逆優於鎖死
8. 可證明優於宣稱

## Prime Directive
Every agent/subagent inherits the complete non-overridable content-hashed kernel. `NO EVIDENCE -> NO FACTUAL CLAIM`. Existing-system changes require verified current state and root cause before implementation. A rule is not considered strong merely because it exists in prose: cross-reference, risk, authority, evidence, lifecycle, release, and runtime integrity must be semantically validated and fail closed.

## 全流程
IDEA / EXISTING SYSTEM → INTAKE → CURRENT STATE / ROOT CAUSE WHEN EXISTING → POLICY/RISK/AUTHORITY → DOMAIN → >=3 OPTIONS → ENGINEERING REVIEW → FALSIFICATION/RED TEAM → INDEPENDENT ASSURANCE → HUMAN APPROVAL → REPOSITORY BOOTSTRAP → IMPLEMENTATION → VERIFICATION → RELEASE READINESS → RELEASE → POST-RELEASE PROOF → HANDOFF → LIFECYCLE / RETIREMENT.

## Binary Configurator and Artifact Compiler
For new systems, the user selects only legitimate product/business choices using `要 / 不要`. Foundry baselines are locked. Deterministic rules derive hidden engineering obligations, resolve dependency closure, prevent deferred/current contradictions, generate only selected LEGO modules, materialize a complete 10-artifact contract package per selected module, and produce all 73 controlled blueprint sections as `ACTIVE` or `NOT_APPLICABLE`. Selection/output correctness is release-tested by all-NO, all-YES, each single question, exhaustive pairwise combinations, randomized mixes, every module, conflicts, custom requirements, and artifact hashes.

## Machine truth hierarchy
1. `registries/` — canonical IDs, kernel digest, risk/authority and non-waivable rules.
2. `schemas/` — machine contracts.
3. `runtime/` — gates, DAG, enforcement and state machine.
4. `.foundry/` — per-project control-plane state pinned by `foundry-lock.json`.
5. Markdown standards — human-readable rationale and operating guidance; they must not silently contradict machine truth.

## Quality standard
Every actionable change includes exact paths, deterministic actions/commands, dependencies, migration, tests, observability, rollback, acceptance criteria, expected result and retained evidence. Foundry itself must pass version, manifest, semantic, adversarial, E2E and unit validation before release.
