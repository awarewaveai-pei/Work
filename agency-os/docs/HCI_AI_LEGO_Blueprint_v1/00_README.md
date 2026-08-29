# Aware Wave — HCI-30 × AI LEGO Product Architecture Pack

> ## 🚨 2026-08-29 SUPERSEDED — do not read this for current truth
> This document set (V1) was independently re-researched by 9 zero-cross-visibility reviewers,
> producing 104 findings (24 requiring operator decision). **The current, authoritative
> specification is `D:\Work\agency-os\docs\HCI_AI_LEGO_Blueprint_v2\00_README.md`.**
> - V2 keeps everything V1 got right (confirmed by independent re-derivation, not assumed) and
>   fixes what the review found — missing domain entities, an enforcement layer that was mostly
>   prose, a handful of unresolved naming/ownership conflicts.
> - Every genuinely open question (24 of them) is marked inline in V2 with a 🔴 **DECISION
>   PENDING** block exactly where that content belongs — nothing was silently decided on the
>   operator's behalf.
> - This V1 directory is kept **read-only, unmodified**, as the historical record of what was
>   proposed before review — useful only if you want to see what changed and why (cross-referenced
>   from V2, and fully evidenced in `D:\Work\agency-os\docs\HCI30_RESEARCH_REVIEW\`).
> - If you are about to implement anything HCI-30/AI-LEGO related, stop and go to V2 instead.
>
> Original V1 content follows below, unmodified except for this banner.

## Purpose

This package is the current source-of-truth summary of the architecture and product decisions discussed for:

1. **HCI-30** — Human Collaboration Intelligence / 辨人與合作決策系統
2. **AI LEGO Cognitive Engineering OS** — 通用認知工程作業系統
3. **Aware Wave Product Ecosystem** — 母品牌、平台、子網域、共用基礎設施與商業化邊界

The two products are **peer systems**. They are not one system and must not be merged into one domain.

---

## Core decision

```text
HCI-30
= 辨人 + 關係情報 + 合作評估 + 是否合作 + 風險控制

AI LEGO Cognitive Engineering OS
= 如何系統化思考 + 選方法 + 編排 workflow + AI 執行治理 + replay/rollback

Relationship
= independent peer products with optional integration
```

---

## AI reading order

An AI implementing or reviewing this system should read in this order:

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

---

## Non-negotiable architecture principles

- 30-year maintainability
- Zero rework where avoidable
- Minimal blast radius
- Evidence before inference
- Human final decision
- No universal “good person / bad person” score
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

## Top-tier production hardening

21. `21_HCI_TOP_TIER_GAP_ANALYSIS.md`
22. `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md`

23. `23_CURRENT_INFRASTRUCTURE_SOURCE_OF_TRUTH.md`
