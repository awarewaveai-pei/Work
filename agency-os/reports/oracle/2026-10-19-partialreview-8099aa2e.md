# codex-oracle review -- 2026-10-19 16:02:43 +08:00

- mode: `review`
- scope: -Path scripts/supervisor-kit/build.mjs, scripts/supervisor-kit/check.mjs, agency-os/handoffs/2026-10-16-customer-model-supervisor/build.mjs, agency-os/handoffs/2026-10-16-customer-model-supervisor/check.mjs, agency-os/handoffs/2026-10-17-social-v15-supervisor/build.mjs, agency-os/handoffs/2026-10-17-social-v15-supervisor/check.mjs, agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/generation/supervisor/build.mjs, agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/generation/supervisor/check.mjs, agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/scripts/foundry_generate.py, agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/tests/test_artifact_generation.py, agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/README.md, agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/03_SYSTEM_FOUNDRY_EXECUTION_CONTRACT.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: System Foundry V17-3: shared supervisor kit (scripts/supervisor-kit build+check) replaces two copied build/check.mjs (customer-model and social-v15 supervisors now import it; data.mjs format unchanged; html changes only CSS unification, depends as links, waitFor colour); foundry_generate.py writes supervisor/data.mjs per generated project (STEPS = modules in dependency layers from capability requires, SCC cycle shares one layer, RULES = 18 foundation, OPEN = stack + DER-*-ADAPTER providers), copies kit byte-for-byte; generated check.mjs binds to foundry-plan.json
- exit: 0 | elapsed: 199153ms | answer: 1814B
- files-reviewed: agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/03_SYSTEM_FOUNDRY_EXECUTION_CONTRACT.md, agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/README.md, agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/generation/supervisor/build.mjs, agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/generation/supervisor/check.mjs, agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/scripts/foundry_generate.py, agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/tests/test_artifact_generation.py, agency-os/handoffs/2026-10-16-customer-model-supervisor/build.mjs, agency-os/handoffs/2026-10-16-customer-model-supervisor/check.mjs, agency-os/handoffs/2026-10-17-social-v15-supervisor/build.mjs, agency-os/handoffs/2026-10-17-social-v15-supervisor/check.mjs, scripts/supervisor-kit/build.mjs, scripts/supervisor-kit/check.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Dependency layers are not validated against dependencies.
  agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/generation/supervisor/check.mjs:23 -> scripts/supervisor-kit/check.mjs:21
  confidence  -> CONFIRMED
  scenario    -> A depends on B, but both are assigned L1; the checker only verifies B has a lower step number, so it passes and the page says A and B can run simultaneously.
  why missed  -> The check validates recorded groups but never derives layer ordering from `depends`.

FINDING 2: An invalid priority reference crashes the checker before reporting errors.
  agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/generation/supervisor/check.mjs:23 -> agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/generation/supervisor/check.mjs:21
  confidence  -> CONFIRMED
  scenario    -> `PRIORITY[0].steps` contains an unknown module; the mismatch is detected, then `STEPS.find(...).group` dereferences `undefined`, producing a TypeError instead of a controlled validation failure.
  why missed  -> The code assumes the earlier coverage check guarantees every priority reference exists.

FINDING 3: Foundation rule content can be blank while the supervisor check passes.
  agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/generation/supervisor/check.mjs:19 -> agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/generation/supervisor/check.mjs:11
  confidence  -> CONFIRMED
  scenario    -> `RULES[0].t` is removed or emptied while its ID remains unchanged; the generated HTML renders an empty foundation-rule description, but the checker passes because it compares only foundation IDs and does not validate rule fields.
  why missed  -> The generated check delegates field validation to `checkCommon`, whose required fields contain only step fields, not `RULES`.

TOTAL: 3 findings
