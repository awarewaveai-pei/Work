# SearchContent Architecture Pack

**Baseline:** `4b26e83612caad72698271545ee1952058cc32dd`
**Status（2026-09-02，ADR-021 ACCEPTED）：** 邊界/命名/事件/路徑裁決已定案；11 份規格文件維持 `PROPOSED`；驗證器 Gate H 綠燈（`tests/run_golden_tests.py` 2333/2333 PASSED）。

## 建議閱讀／落地順序

0. `SEARCH_CONTENT_PACK_COMMON.md` — 共同段落（工程身份／路徑治理／證據表／狀態詞彙／驗證指令）**先讀這份**，其餘 11 份都指回它
1. `SEARCH_CONTENT_AI_LEGO_INTEGRATION_MATRIX.md` — SearchContent × AI-LEGO Integration Matrix（含 field-level schema SSOT 權責表）
2. `../adr/ADR-021-search-content-boundary-and-ownership.md` — ADR-021：SearchContent Boundary and Ownership（ACCEPTED）
3. `SEARCH_CONTENT_DOMAIN_MODEL.md` — SearchContent Domain Model（17 個 object 的唯一 schema SSOT）
4. `SEARCH_SOURCE_PROFILE_AND_AUTHORITY_POLICY.md` — Search Source Profile and Authority Policy
5. `SEARCH_EVIDENCE_RETRIEVAL_SPEC.md` — Search Evidence Retrieval Specification
6. `SEARCH_INTELLIGENCE_SPEC.md` — Search Intelligence Specification
7. `CONTENT_BRIEF_CONTRACT.md` — Content Brief Contract
8. `SEARCH_CONTENT_METHOD_AND_CAPABILITY_REGISTRY.md` — SearchContent Method and Capability Registry
9. `SEARCH_CONTENT_QUALITY_GATES.md` — SearchContent Quality Gates
10. `PUBLISHING_ADAPTER_CONTRACT.md` — Publishing Adapter Contract
11. `CONTENT_MEASUREMENT_SPEC.md` — Content Measurement Specification
12. `SEARCH_CONTENT_MVP_VERTICAL_SLICE.md` — SearchContent MVP Vertical Slice（含 §12 SC-Phase 對照）

敘事正本（PROPOSED，唯讀參考，衝突時以上列 12 份為準）：`SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md`（v3，文末含 Errata 附錄）、`SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md`。

機器可讀記錄（生成檔，見各自檔頭的 regenerate 說明）：`SEARCH_CONTENT_REGISTRY_RECORDS.yaml`（122 筆 Method/Capability/Recipe/DependencyRequest）、`SEARCH_CONTENT_GATE_RECORDS.yaml`（59 個 gate）、`SEARCH_CONTENT_OPEN_QUESTIONS.yaml`（20 個 OQ-SC-* 未決項）。

## 核心原則

- 先 ownership / contract / ID convergence，再 runtime。
- 所有 Machine ID 只有一個 canonical registry（`SEARCH_CONTENT_REGISTRY_RECORDS.yaml`）；每個物件只有一個 schema SSOT（Integration Matrix §3.1）。
- Core object 只引用，不由 SearchContent 重做。
- External provider 是 Capability/Tool boundary，不是 Repository storage。
- Production write 必須 Gate / Policy / Authority / Verification / Rollback。
- 每個 contract 區塊自帶 `source_of_truth_for` + `decided_by`；未決項一律登記 `OQ-SC-*`，不留無標記的空白。

## 驗證

```bash
cd agency-os/docs/AI_LEGO_Cognitive_Engineering_OS
python tests/architecture/search_content_pack_check.py   # 本包獨立驗證（Gate H）
python tests/run_golden_tests.py                          # 全平台（含本包），目前 2333/2333
```

## 文件狀態

11 份規格文件為 `PROPOSED` 工程設計文件；`ADR-021` 已 `ACCEPTED`（操作者明示委任，記錄於該檔檔頭）；`SEARCH_CONTENT_PACK_COMMON.md` 與本檔標 `ACCEPTED`（只承載已裁決內容）。任何 ADR 尚未涵蓋的新決策仍須 operator 明示接受後才可升級。
