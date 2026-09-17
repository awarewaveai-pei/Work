# ADR-025 — Finance domain pack: first content, so the Master Plan §43 Business Planning chain runs end to end

Status: ACCEPTED (2026-09-17)
Date: 2026-09-17
Decision authority: Operator, in conversation on 2026-09-17 — after the Recipe engine deployment, the operator listed three gaps to close, the third verbatim: 「商業管線走到 NPV 就停（缺市場分析、KPI、執行計畫、提案書；Finance pack 還是空的）」, and directed 「結束去補缺口」. Same delegation class as ADR-022/023 (runtime only; no mother document edited).
Related: ADR-008 (P1-CONFLICT-4: the Recipe named a `Financial Assumptions` method the Atlas did not have; option (a) chosen then: annotate, do not build, because Business Planning was not the MVP slice), `recipes/validated/business-planning-review-v1.recipe.yaml` (stopped at NPV), `methods/registry/contract-backlog.yaml` tier_2.explicit_entries (ADR-008's pending mandate).

## Decision

1. ADR-008's deferral is lifted, not reversed: its reasoning ("do not build ahead of a consumer") no longer applies because the operator has named the consumer. `finance.financial_assumptions` is built as the first Finance domain-pack method (`ai_lego/modules/finance/`), with the shape the downstream computation needs: currency, discount rate, horizon, provenance-bearing assumptions each with a `basis`, and a period-indexed `cash_flow_projection` that `feasibility.npv` binds to directly.
2. The three remaining §43 nodes with no Atlas method get real implementations: `strategy.market_analysis` (TAM/SAM/SOM funnel + evidence-backed segments), KPI via the existing `framing.okr`, Execution Plan via the existing `delivery.outcome_roadmap`, Proposal via a new side-effect-free capability `artifact.generate_proposal` (composes only; carries every number from a gate-checked record).
3. One Recipe carries the full chain: `recipes/validated/business-plan-full-v1.recipe.yaml` (17 nodes). `business-planning-review-v1` stays as the bounded 14-node chain; its OQ-BUSINESS-PLANNING-REVIEW-1 is answered by this ADR.
4. Registry: `contract-backlog.yaml` tier_2.explicit_entries keeps ADR-008's row (now `contract_status: complete`) as the historical mandate; a tier_1 concrete entry is the live registration.

## Consequences

- `PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED` can no longer fire on the §43 chain for a missing Finance method; the Atlas §25 Phase-4 ordering is overtaken for this one pack by operator directive (recorded here, not silently).
- Scenario planning still does not consume financial ranges (OQ-BUSINESS-PLAN-FULL-1); the proposal is a draft artifact with `NEEDS_HUMAN_REVIEW` semantics, not investment advice.
- Verification: `tests/unit/test_business_plan_full_recipe.py` (API end-to-end, NPV bound from `outputs.financial_assumptions`, artifact sources traced), golden spec tests (contracts, schemas, recipe inventory, backlog invariants).
