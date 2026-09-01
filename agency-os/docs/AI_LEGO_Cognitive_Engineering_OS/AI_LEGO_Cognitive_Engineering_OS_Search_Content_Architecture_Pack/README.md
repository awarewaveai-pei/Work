# SearchContent Architecture Pack — 繁體中文版

**Baseline:** `4b26e83612caad72698271545ee1952058cc32dd`

## 建議閱讀／落地順序

1. `SEARCH_CONTENT_AI_LEGO_INTEGRATION_MATRIX.md` — SearchContent × AI-LEGO Integration Matrix
2. `ADR_SEARCH_CONTENT_BOUNDARY_AND_OWNERSHIP.md` — ADR — SearchContent Boundary and Ownership
3. `SEARCH_CONTENT_DOMAIN_MODEL.md` — SearchContent Domain Model
4. `SEARCH_SOURCE_PROFILE_AND_AUTHORITY_POLICY.md` — Search Source Profile and Authority Policy
5. `SEARCH_EVIDENCE_RETRIEVAL_SPEC.md` — Search Evidence Retrieval Specification
6. `SEARCH_INTELLIGENCE_SPEC.md` — Search Intelligence Specification
7. `CONTENT_BRIEF_CONTRACT.md` — Content Brief Contract
8. `SEARCH_CONTENT_METHOD_AND_CAPABILITY_REGISTRY.md` — SearchContent Method and Capability Registry
9. `SEARCH_CONTENT_QUALITY_GATES.md` — SearchContent Quality Gates
10. `PUBLISHING_ADAPTER_CONTRACT.md` — Publishing Adapter Contract
11. `CONTENT_MEASUREMENT_SPEC.md` — Content Measurement Specification
12. `SEARCH_CONTENT_MVP_VERTICAL_SLICE.md` — SearchContent MVP Vertical Slice

## 核心原則

- 先 ownership / contract / ID convergence，再 runtime。
- 所有 Machine ID 只有一個 canonical registry。
- Core object 只引用，不由 SearchContent 重做。
- External provider 是 Capability/Tool boundary，不是 Repository storage。
- Production write 必須 Gate / Policy / Authority / Verification / Rollback。

## 文件狀態

全部為 `PROPOSED` 工程設計文件；ADR 必須 operator 明示接受後才可升級為 Accepted decision。
