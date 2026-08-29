# Aware Wave — HCI-30 × AI LEGO Product Architecture Pack (V2)

## Status

**This is the current, authoritative specification.** `HCI_AI_LEGO_Blueprint_v1\` is superseded and archived — do not read it for current truth; it is kept only as a historical record of what V1 said before independent review. If you find yourself reading a `v1` file, stop and come here instead.

V2 was produced by taking V1, applying 80 findings from a 9-independent-reviewer architecture re-research that did not require operator judgment, and marking the remaining 24 findings that do require operator judgment as explicit, inline **🔴 DECISION PENDING** blocks — not hidden in a separate file, but placed exactly where that content belongs in the spec, so nobody can read past them without noticing. The full evidence and reasoning behind every decision in this document — including the ones already resolved — lives in `D:\Work\agency-os\docs\HCI30_RESEARCH_REVIEW\` and is cited by ID (e.g. `DOM-01`, `HD-05`) throughout. You do not need to read that package to build from V2; you need it only if you want to see *why* a specific line reads the way it does.

## Purpose

This package is the source-of-truth for the architecture and product decisions for:

1. **HCI-30** — Human Collaboration Intelligence / 辨人與合作決策系統
2. **AI LEGO Cognitive Engineering OS** — 通用認知工程作業系統
3. **Aware Wave Product Ecosystem** — 母品牌、平台、子網域、共用基礎設施與商業化邊界

The two products are **peer systems** at the domain layer, sharing a small versioned Foundation-layer kernel underneath. See `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` §Shared Kernel for exactly what is and is not shared, and why this is not a "Shared God Platform."

---

## Core decision

```text
HCI-30
= 辨人 + 關係情報 + 合作評估 + 是否合作 + 風險控制
= assessable Subjects: Person (V1 scope) — see 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md
  §Subject Model for the 🔴 DECISION PENDING on whether Organization becomes
  independently assessable

AI LEGO Cognitive Engineering OS
= 如何系統化思考 + 選方法 + 編排 workflow + AI 執行治理 + replay/rollback

Relationship
= independent peer products at the domain layer
+ a shared, versioned Foundation-layer kernel (epistemic vocabulary, thin
  references, risk-tier ladder, tenant/entitlement substrate) that both
  products vendor a specific version of — not a live shared service
```

---

## Reading order

An AI or engineer implementing or reviewing this system should read in this order:

1. `01_SYSTEM_CONSTITUTION.md`
2. `02_PRODUCT_BOUNDARIES.md`
3. `03_AWARE_WAVE_DOMAIN_AND_SUBDOMAIN_MAP.md`
4. `04_HCI30_PRODUCT_SPEC.md`
5. `05_HCI30_INTELLIGENCE_METHODS.md`
6. `06_HCI30_PUBLIC_INTELLIGENCE.md`
7. `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md`
8. `08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md`
9. `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md`
10. `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md`
11. `11_SECURITY_PRIVACY_GOVERNANCE.md`
12. `12_DEPLOYMENT_API_AND_MULTI_TENANCY.md`
13. `13_TESTING_REPLAY_ROLLBACK_AND_SRE.md`
14. `14_ROADMAP_AND_DEFINITION_OF_DONE.md`
15. `15_BRAND_AND_GO_TO_MARKET_PRINCIPLES.md`
16. `16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md`
17. `17_REPOSITORY_LAYOUT_AND_PATHS.md`
18. `18_LEGO_CONTRACT_AND_COMPONENT_TAXONOMY.md`
19. `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md`
20. `20_VERIFIED_SUBDOMAIN_INVENTORY_AND_BRAND_IA.md`
21. `21_HCI_TOP_TIER_GAP_ANALYSIS.md`
22. `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md`
23. `23_CURRENT_INFRASTRUCTURE_SOURCE_OF_TRUTH.md`

---

## Non-negotiable architecture principles

- 30-year maintainability
- Zero rework where avoidable
- Minimal blast radius
- Evidence before inference
- Human final decision
- No universal "good person / bad person" score
- Trust is domain-specific
- Trust is not permission
- HCI works without AI LEGO
- AI LEGO works without HCI
- No direct database coupling between peer systems
- APIs / events / contracts only
- Vendor-neutral core
- All important logic versioned, testable, replayable, and rollbackable
- High-impact conclusions require explainability and human review
- Customer data ownership and tenant isolation are first-class requirements
- **The Subject being assessed and the Requester's rights are both first-class** — a researched Person is a stakeholder, not only subject matter (new in V2, see `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` §Data Subject Rights)
- **A stated principle without a machine-enforced gate is not a control** — every "must"/"never" in this document should have a corresponding CI-blocking test or DB-level constraint before the data it protects goes live (new in V2, see `13_TESTING_REPLAY_ROLLBACK_AND_SRE.md` §Enforcement Discipline)

## How this differs from V1

24 findings in this document are marked 🔴 **DECISION PENDING** — genuine value trade-offs, legal-risk-tolerance calls, or product-scope questions that only the operator can resolve; no amount of further AI analysis will resolve them. **Do not implement the content of a 🔴 block until the operator has explicitly chosen an option.** Everything else in this document is ready to build against.

For the complete list of what changed and why, see `D:\Work\agency-os\docs\HCI30_RESEARCH_REVIEW\20_V1_TO_V2_CHANGESET.md`. For the complete list of pending decisions in one place (in addition to finding them inline here), see `D:\Work\agency-os\docs\HCI30_RESEARCH_REVIEW\22_OPEN_HUMAN_DECISIONS.md`.
