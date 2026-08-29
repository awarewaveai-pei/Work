# codex-oracle review -- 2026-08-30 03:55:14 +08:00

- mode: `review`
- source: `/codex:adversarial-review` (via write-oracle-artifact.ps1, not codex-oracle.ps1)
- binding: bound to captured snapshot: C:\Users\user1115\AppData\Local\Temp\codex-review-e2e-test.diff
- scope: whole repo
- target: `1d7f0e617..HEAD`
- context: End-to-end verification of the /codex-review pipeline itself, targeting conflict-of-laws-output.schema.yaml + method-resolution.schema.yaml regulatory_exposure
- files-reviewed: .claude/commands/codex-review.md, .claude/commands/review.md, agency-os/AGENTS.md, agency-os/TASKS.md, agency-os/WORKLOG.md, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/MACHINE_READABLE_SPEC_PLAN.md, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/policies/provider/ai-gateway-fallback.policy.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/policies/provider/model-registry.policy.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/method-resolution.schema.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/status-codes.schema.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/jurisdiction/conflict-of-laws-output.schema.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/jurisdiction/pack.schema.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/policies/provider/ai-gateway-fallback.fixtures.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/policies/provider/model-registry.fixtures.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/specs/execution/method-resolution.policy-context.fixtures.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/specs/jurisdiction/conflict-of-laws-output.fixtures.yaml, agency-os/docs/CHANGE_IMPACT_MATRIX.md, agency-os/docs/operations/TOOL_TRIGGER_MAP.md, agency-os/docs/operations/cursor-enterprise-rules-index.md, agency-os/docs/operations/new-doc-linkage-checklist.md, scripts/write-oracle-artifact.ps1
- deletions-reviewed: (none)
- findings-count: 2

> Codex output via /codex:adversarial-review, NOT verified truth. R0 requires the
> caller to confirm every `file:line` before acting on it. Archived so that SKIPPING
> the oracle is visible -- not so that its findings are trusted.

---

# Codex Adversarial Review

Target: branch diff against 1d7f0e617
Verdict: needs-attention

No-ship: the new legal-routing schemas still validate contradictory state, so the fail-closed behavior they are supposed to define can be bypassed without any validator complaint.

Findings:
- [high] `conflict-of-laws-output` allows a real conflict list to coexist with `status: RESOLVED` (agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/jurisdiction/conflict-of-laws-output.schema.yaml:62-124)
  Lines 62-124 never relate `conflicts_detected` back to `status`. `conflicts_detected` is not required at all, and the only `allOf` rules key off `status` to require `resolution_rule_applied` or `human_counsel_ref`. That means a schema-valid instance can contain `conflict_type: DIRECT_CONTRADICTION` while still declaring `status: RESOLVED`, or even declare `status: CONFLICT` with no `conflicts_detected` evidence. This conflicts with `GLOBAL_JURISDICTION_PLAN.md` §5.4, which makes `conflict_of_laws_result.status` the sole Stage-3 fail-closed signal. Downstream consumers can therefore silently treat a real legal conflict as resolved.
  Recommendation: Add reciprocal constraints between `conflicts_detected` and `status`: `RESOLVED` should require `conflicts_detected` to be empty/absent, and `contains` rules for conflict-bearing entries should force `status` into a non-RESOLVED state. Add invalid fixtures for `RESOLVED` + `DIRECT_CONTRADICTION` and for conflict statuses with missing conflict evidence.
- [medium] `regulatory_exposure` remains optional even though repo-level routing rules depend on it (agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/method-resolution.schema.yaml:643-699)
  The new contract says `policy_context` closes P1-GAP-LEGAL-7 and adds derived `regulatory_exposure`, but lines 643-699 do not require that field anywhere. A `resolved_selection_context` with populated `policy_context` and no `regulatory_exposure` still validates, and the companion fixture suite already treats omission as valid in the no-policy case. The hidden dependency is outside this diff: `GLOBAL_JURISDICTION_PLAN.md` §6.4 routes the Policy/Jurisdiction method insertion off `regulatory_exposure`. As shipped, that routing only works if every consumer re-derives or synthesizes the field out-of-band; the schema itself permits outputs that silently skip the new behavior.
  Recommendation: Make the contract unambiguous: either require `regulatory_exposure` on resolved outputs (at least whenever `policy_context` is present, ideally always with explicit `none`), or remove it from the serialized schema and require consumers to derive it from `policy_context` themselves. Add an invalid fixture for `policy_context` present but `regulatory_exposure` missing.

Next steps:
- Tighten `conflict-of-laws-output.schema.yaml` so conflict evidence and status cannot disagree.
- Tighten `method-resolution.schema.yaml` so `regulatory_exposure` is not an optional, out-of-band convention.
- Add regression fixtures for both contradiction classes and rerun the contract suite.

