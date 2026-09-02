# SearchContent Architecture Pack — 共同段落（Common Sections）

**Document ID:** `search-content.pack-common`  
**Status:** `ACCEPTED`（依 ADR-021 §D8，2026-09-02）  
**Version:** `1.1.0`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Canonical repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/SEARCH_CONTENT_PACK_COMMON.md`

**目的：** 本檔是 SearchContent 架構包 12 份文件**共用段落的唯一正本**。2026-09-02 獨立驗證（`agency-os/reports/audit/2026-09-02-search-content-pack-verification.md`，finding M1／M15／M16）證實：工程身份、路徑治理、共同證據基準、驗證指令四段在 12 份文件中 byte-identical（sha1 各一），任何一條行號錯誤要改 12 次、`BUILD_MANIFEST.json` 的 `has_evidence: true` 也因此對每份文件都在回報同一塊文字。抽出成單一檔案後：證據表只維護一處；每份文件的頭部只留身份資訊與指向本檔的一行；`tests/architecture/search_content_pack_check.py` 機械驗證每份文件引用的 `EV-*` 都存在於本檔 §3。

---

## 1. 工程身份與決策準則

本套文件假設所有執行者（人類、agent、subagent、code reviewer、operator）均以以下複合角色工作：**架構師 / DevOps / 資安 / DB / PM / Search-Content 技術專家**。任何單一角色的局部最佳化不得破壞全域一致性。

每個決策必須同時通過五個檢查：

1. **多角度優先**：功能、架構、資料、資安、營運、可觀測性、成本、產品、法遵、維運至少交叉檢查。
2. **30 年工程紀律**：不把 provider、模型、prompt、單一 CMS、單一 DB 寫成不可替換的核心真理。
3. **零重工原則**：先解 ownership / ID / contract / migration，再寫 runtime；不得先做後重構。
4. **完整閉環**：Input → Validate → Execute → Gate → Persist/Event → Measure → Decide → Rollback/Refresh 必須閉合。
5. **最小爆炸半徑**：所有 write 皆需 scope、idempotency、version、rollback 或明確不可回滾條件。

硬規則：

```text
MODEL IS DISPOSABLE
PROMPT IS DISPOSABLE
PROVIDER IS REPLACEABLE
CANONICAL CONTRACT / EVIDENCE / DECISION / EVENT HISTORY MUST SURVIVE
```

> 每份文件不得自行覆蓋更高權威的 ACTIVE schema、accepted ADR 或 Architecture Constitution。發現衝突時，必須依 Scoped Authority 進入 `CONFLICT_REQUIRES_HUMAN_REVIEW`，不可選對實作者最方便的版本。

## 2. 路徑治理

| 階段 | 路徑 | 狀態 |
|---|---|---|
| 初次產出（GPT，2026-09-01）| `/mnt/data/search_content_architecture_pack_zh-TW/` | **歷史**（GPT 執行環境內的暫存路徑，從未存在於本 repo）|
| 首次入庫（commit `14a8a063c`，2026-09-02）| `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/AI_LEGO_Cognitive_Engineering_OS_Search_Content_Architecture_Pack/` | **歷史**（追蹤用暫置，未經 ADR-006 路徑治理）|
| **正式路徑（現況）** | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/` | **ACCEPTED**（ADR-021 §D8，2026-09-02）|
| ADR 正式路徑 | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/adr/ADR-021-search-content-boundary-and-ownership.md` | **ACCEPTED**（編號由 `docs/adr/ADR_INDEX.md` 登記，非自行猜測）|

物理路徑屬 architecture，須經 Repository Architecture / ADR-006 治理（證據：`EV-REPO-ARCH`、`EV-ADR006`）。本包的路徑裁決記錄於 ADR-021 §D8；master architecture §6／§53 原提的 `/cognitive/domain-packs/search-content/` 已由該裁決明文取代（見 `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md` 文末 Errata E-04）。

機器可讀交付物（schema / policy / contract / fixture）的落點依各文件「Proposed Paths」段，且一律落在平台既有的 `specs/`、`policies/`、`methods/contracts/`、`capabilities/contracts/`、`recipes/validated/`、`tests/` 樹下，不另建 vertical 私有樹。

## 3. 共同證據基準

所有文件的 `FINDING-*` 均只使用已驗證的檔案／行號；尚未被證據直接支持者必須標為 `OPEN_QUESTION` 或 `DEFERRED` 並登記於 `SEARCH_CONTENT_OPEN_QUESTIONS.yaml`（附 `OQ-SC-*` 編號），不得寫成「可能」「應該已經」「看起來像」。

行段表示「本包實際讀過並據以立論的範圍」，非檔案全長；驗證器檢查每條的檔案存在且結尾行號不超過檔案實際長度、起始行非空白。這是上界檢查，不是內容錨定——真正的行號漂移（範圍仍落在檔案長度內，但已指向錯誤內容）目前無法機械偵測，已誠實登記為 `OQ-SC-21`，不宣稱已解決。相對路徑以 repo 根為準；無目錄前綴的檔名指本目錄（`docs/architecture/search-content/`）內的檔案。

| ID | 證據 |
|---|---|
| EV-CONST | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/Architecture-Constitution-v1.md:L1-L84` — Scoped Authority、文件職責、machine-readable contract/ADR 優先序、ADR-006 提案流程。 |
| EV-REPO-ARCH | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/REPOSITORY_ARCHITECTURE.md:L1-L220` — Shared Kernel、Knowledge engine、Recipe vertical、方法實作/registry 分層、路徑治理。 |
| EV-ADR006 | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/adr/ADR-006-mother-doc-revision-flow-and-repo-layout.md:L1-L181` — physical path 是 architecture；母文件/高風險規格修改使用 `.ai/proposals/`、不可 AI 自我批准。 |
| EV-ADR011 | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/adr/ADR-011-platform-gate-ownership-and-unification.md:L1-L60` — Global 14 + High-risk 6 gate 的 owner 與內容聯集。 |
| EV-ADR019 | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/adr/ADR-019-status-code-taxonomy-and-reason-codes.md:L1-L53` — closed side-state enum + `reason_code`，語意原因不膨脹為 top-level state。 |
| EV-EVIDENCE | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/evidence/evidence.schema.yaml:L1-L180` — canonical Evidence、8 個 quality dimensions、domain-specific hierarchy、source/content 仍有 NEW_DESIGN 邊界。 |
| EV-CLAIM | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/evidence/claim.schema.yaml:L1-L178` — canonical Claim、supporting/contradicting Evidence、confidence/provenance。 |
| EV-EGRAPH | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/evidence/evidence-graph.schema.yaml:L1-L240` — Source/Evidence/Claim/Assumption/Decision/Entity graph；Entity/Relation 僅 minimal NEW_DESIGN；Source/Entity ID grammar 亦屬 NEW_DESIGN。 |
| EV-SENTPROV | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/evidence/sentence-provenance.schema.yaml:L1-L60` — sentence-level provenance link（Sentence → Claim → Evidence → Source → Page/Region/Timestamp），ACTIVE；citation 綁定的正本。 |
| EV-DECISION | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/decision/decision.schema.yaml:L1-L240` — canonical Decision，包含 criteria/evidence/assumptions/unknowns/recommendation/human judgment/reversal/monitoring/outcome。 |
| EV-METHOD | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/method.schema.yaml:L1-L220` — canonical Method Contract；ADR-005 bare `<family>.<name>` grammar；`source_of_truth_for`／`decided_by` 欄位樣式（`:26-33`）。 |
| EV-CAPABILITY | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/domain/capability-contract.schema.yaml:L1-L280` — Capability ≠ Method；Capability Contract 與 ID grammar `^[a-z_]+(\.[a-z_]+)?$`（`:555`）；`OQ-cc-1`（`:770-779`）dotted namespace 是否構成正式 registry 尚未裁決。 |
| EV-RECIPE | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/recipe.schema.yaml:L170-L200` — Recipe id grammar `^[a-z][a-z0-9-]*$`（`:179`）、semver（`:194`）。 |
| EV-WORKFLOW | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/workflow/workflow-ir.schema.yaml:L1-L220` — Recipe/Method 與 executable Workflow IR 分層；IR node 嚴格區分 method/capability。 |
| EV-GATE | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/gate.schema.yaml:L230-L290` — Gate Result；`gate_catalog.global` 14 項「all mandatory for every deliverable regardless of risk tier」（`:238`）；`high_risk` 6 項由 R3∪R4 觸發（`:255-258`）；`method_specific` 為 open namespace（`:272-279`）。 |
| EV-MGATES | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/policies/ai-execution/mandatory-gates.yaml:L1-L60` — policy-as-code：哪些 gate 在哪些條件下強制，ACTIVE；Quality Gates §11 的組合規則引用此檔而非自訂。 |
| EV-EVENT | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/event-ledger.schema.yaml:L1-L260` — canonical Event Ledger；`ArtifactPublished` 僅出現於 MP 自陳「例如」的非窮舉清單（`:17`），無 payload contract；event_type 為 open PascalCase；每筆 event 硬 `$ref` `epistemic-label.schema.yaml#/provenance_record`（`:42-43`）；replay/idempotency invariants。 |
| EV-EPISTEMIC | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/governance/epistemic-label.schema.yaml:L37-L90` — `epistemic_type` 11 值（`:45-56`）、`authorship_state` 6 值（`:81-87`），ADR-004 收斂四套詞彙的正本。 |
| EV-STATUS | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/status-codes.schema.yaml:L72-L106` — `legal_side_states`（BLOCKED / NEEDS_HUMAN_REVIEW / FAILED / CANCELLED / ROLLED_BACK / COMPENSATED / PARTIAL_SUCCESS）、`final_status`、`emittable_reason_codes`。 |
| EV-DEPRECATION | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/deprecation-pipeline.schema.yaml:L184-L200` — Method/Capability 退役 7 步（Notice → Replacement → Compatibility Matrix → Migration Tool → Usage Scan → Deadline → Archive）。 |
| EV-AUDIT | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/audit.schema.yaml:L1-L40` — canonical audit record，ACTIVE；per-run telemetry 綁定對象。 |
| EV-ROLLBACK | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/rollback.schema.yaml:L1-L40` — canonical rollback record／`ROLLED_BACK` 終態，ACTIVE。 |
| EV-RISKTIER | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/risk-tier.schema.yaml:L1-L40` — R0–R4、`mandatory_gate_injection_trigger`（R3∪R4），ACTIVE。 |
| EV-AUTH | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/authority.schema.yaml:L1-L230` — A0–A4；Capability ≠ Authority；A3/A4 的 policy/gate/approval 條件。 |
| EV-REPOSITORY | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/domain/repository-contract.schema.yaml:L1-L230` — Repository Contract；vector/graph/FTS/event/metrics/cache/queue 等 storage roles（`cache` 於 `:177`）；app 不直接依賴 DB。 |
| EV-TESTS | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/README.md:L1-L60` — 既有 golden test harness（`tests/run_golden_tests.py`）與 fixture 檔案契約（positive/negative/target_ref）。 |
| EV-V3-BOUNDARY | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md:L68-L240` — v3 horizontal/vertical boundary、Core reuse、maturity model（§3.3 八值成熟度 enum 於 `:207-222`）。 |
| EV-V3-AUTH | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md:L381-L701` — §7 authority policy、§8 freshness policy、§9 retrieval/reranking、§10 conflict analysis。 |
| EV-V3-OBS | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md:L702-L867` — §11 Search Intelligence Layer（core objects `:705-716`）、§12 observation model、§13 competitor intelligence。 |
| EV-V3-STRATEGY | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md:L868-L1019` — §14 content strategy engine（TopicCluster `:904`）、§15 URL/Topic mapping、§16 priority model。 |
| EV-V3-BRIEF | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md:L1020-L1220` — §17 ContentBrief（`required_source_tiers` 於 `:1051-1053`，見 Errata E-02）、§18 EvidencePack、§19 production pipeline、§20 writing engine boundary。 |
| EV-V3-DOMAINS | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md:L1421-L3432` — §22–§30 各 domain operating architecture 與 Outputs 清單（SEO `:1834`、GEO `:2120`、AEO `:2327`、LLMO `:2567`、Entity `:2727`、SXO/CRO `:3276`）。 |
| EV-V3-METHODS | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md:L4893-L4993` — §52 Proposed Capabilities（27 個）、§53 Proposed Methods（15 個）。 |
| EV-V3-RECIPES | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md:L4994-L5146` — §54 recipes（3 個）、§55 events、§56 artifact type catalog（13 值）。 |
| EV-V3-GATES | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md:L4228-L4306` 與 `L5147-L5188` — §34–§37 domain gates 敘事清單、§57 gate bundle。 |
| EV-V3-PUBLISH | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md:L3433-L3646` 與 `L4307-L4454` — §31 publishing operations（adapter contract `:3500`）、§38 publishing engine、§39 safety、§40 ContentPublication object。 |
| EV-V3-MEASURE | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md:L3647-L3896` 與 `L4455-L4650` — §32 measurement/attribution（metric definition `:3723`、attribution `:3810`、decay `:3829-3861`、outputs `:3881`）、§41–§45 measurement layer / ContentPerformance / learning loop / refresh context。 |
| EV-V3-SOURCE | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md:L4692-L4892` — §47 SearchSourceProfile、§48 ingestion（chunking rule `:4775`）、§49 Knowledge Card、§50 brand knowledge、§51 Hybrid Retrieval Router。 |
| EV-V3-MVP | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md:L5372-L5657` — §63 MVP scope、§64 SC-Phase 0–8 delivery plan、§65 minimum viable slice 驗收條件（`:5647-5656`）。 |
| EV-CRIT-H01 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md:L496-L585` — Method namespace collision 已確認。 |
| EV-CRIT-H02 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md:L586-L653` — ContentBrief `required_source_tiers` 與 claim-scope authority 衝突。 |
| EV-CRIT-H03 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md:L654-L715` — Live Web Search boundary 錯置。 |
| EV-CRIT-H04 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md:L716-L767` — Entity maturity 被寫得過高。 |
| EV-CRIT-H05 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md:L768-L868` — Event semantic ownership/duplicate 風險。 |
| EV-CRIT-H06 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md:L869-L914` — Method catalog 分裂。 |
| EV-CRIT-H07 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md:L915-L978` — Capability catalog 分裂。 |
| EV-CRIT-H08 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md:L979-L1036` — ContentPerformance 太薄。 |
| EV-CRIT-M | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md:L1036-L1455` — M-01 runtime 用詞（`:1036`）、M-03 repo path（`:1110`）、M-04 Source ID、M-05 SearchObservation Entity、M-06 domain method shape、M-07 domain methodology 未經 AI-LEGO 證實（`:1232`）、M-08 publishing approval、M-09 evidence versioning、M-11 gate mapping、M-12 section numbering。 |
| EV-AUDIT-0902 | `agency-os/reports/audit/2026-09-02-search-content-pack-verification.md:L1-L327` — 本包 2026-09-02 獨立驗證報告（7 BLOCKING／17 MAJOR）；所有「2026-09-02 audit remediation」註記的來源。 |

## 4. 狀態／成熟度詞彙對照

驗證報告 finding M8 指出本包曾同時使用四套互不相容的成熟度／狀態詞彙，且未引用平台 ACTIVE 的 epistemic 契約。以下是唯一對照表；各文件只能使用表中的詞彙。

### 4.1 文件狀態（document status）

| 值 | 意義 | 誰能推進 |
|---|---|---|
| `PROPOSED` | 工程設計文件草案，內容可被引用但不構成 ACCEPTED 決策 | — |
| `ACCEPTED` | ADR 決策或已被 ADR 明文採納的段落 | 操作者（含明示委任，見 ADR-021 檔頭與 `ADR_INDEX.md`）|

本包 11 份規格文件維持 `PROPOSED`（同 ADR-014 Sub-decision (b) 先例：接受 ADR 不等於把規劃文件整份升格）；ADR-021 為 `ACCEPTED`；本檔與 `README.md` 因只承載已裁決的路徑／證據／詞彙，標 `ACCEPTED`。

### 4.2 平台依賴成熟度（master §3.3，八值，MUST）

```text
NARRATIVE_DEFINED | ACTIVE_SCHEMA | ACTIVE_POLICY | CONTRACT_INSTANCE_AVAILABLE
| VALIDATED_RECIPE_AVAILABLE | RUNTIME_IMPLEMENTED | ADAPTER_IMPLEMENTED | E2E_VERIFIED
```

Integration Matrix 曾使用的 `MINIMAL_NEW_DESIGN` **不在 enum 內**，一律改寫為 `NARRATIVE_DEFINED`（附註 "minimal graph-node shape only"）；散文描述（「尚未成熟」「尚待實作」）只能作為 enum 值的附註，不能取代它。

### 4.3 Registry 生命週期 vs. 證據成熟度（兩條正交軸）

| 軸 | 值 | 意義 |
|---|---|---|
| `status`（contract lifecycle）| `PROPOSED` → `CONTRACTED` → `VALIDATED` → `RUNTIME_IMPLEMENTED`；旁支 `DEPRECATED` → `RETIRED` | 對應 §4.2：`CONTRACTED` ≈ `CONTRACT_INSTANCE_AVAILABLE`，`VALIDATED` ≈ `VALIDATED_RECIPE_AVAILABLE`（含 golden test），`RUNTIME_IMPLEMENTED` = 同名 |
| `evidence_maturity`（domain efficacy）| `DOMAIN_PROPOSAL` → `LITERATURE_SUPPORTED` → `EMPIRICALLY_VALIDATED` | 回應 `EV-CRIT-M`（M-07）：SEO/GEO/AEO/LLMO/Entity/Local/CRO/ASO 方法論在本平台尚無外部證據佐證。一個 Method 可以 `status: VALIDATED`（契約與 fixture 齊備）同時 `evidence_maturity: DOMAIN_PROPOSAL`（領域效力未證）；兩軸不可互相推導。升級 `evidence_maturity` 需在 registry record 的 `evidence_refs` 附上文獻或實驗 Evidence ref |

### 4.4 Epistemic / authorship 標籤（平台 ACTIVE 契約，硬約束）

所有 vertical event 依 `EV-EVENT`（`event-ledger.schema.yaml:42-43`）硬 `$ref` `epistemic-label.schema.yaml#/provenance_record`；MethodResult／assessment／observation 亦帶同一組標籤。本包的預設對照（由**產生者**標記，消費者不得改標）：

| 本包物件 | `epistemic_type` | `authorship_state` |
|---|---|---|
| Search/Competitor/AIAnswer/Citation/Ranking observation（raw）| `SOURCE_FACT` | `SOURCE_QUOTATION` |
| Method 推理輸出（MethodResult、TopicCluster、DecayObservation 的 severity 估計）| `AI_INFERENCE` | `AI_GENERATED` |
| AuthorityAssessment / FreshnessAssessment / ContentPerformance projection | `CALCULATED_RESULT` | `AI_GENERATED` |
| ContentBrief draft / Draft artifact | `AI_SUGGESTION` | `AI_GENERATED` → 人工修訂後 `HUMAN_EDITED` |
| Brief/Publication approval、Core Decision | `DECISION` | `HUMAN_APPROVED` |
| 未能分類的 provider 欄位 | `UNKNOWN` | `SOURCE_QUOTATION` |

## 5. 驗證指令

本包的機械驗證器是 `tests/architecture/search_content_pack_check.py`，並已掛進既有 golden test harness（`tests/run_golden_tests.py` 第 5 個 check family；證據：`EV-TESTS`）。不再使用 2026-09-02 之前那四條泛用 git 指令（驗證報告 M2：其 ID grep 回 127 行全噪音、`git diff --check` 被無關檔案卡紅）。

```bash
# 於 agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/ 執行
python tests/architecture/search_content_pack_check.py            # 只跑本包檢查，列出每條失敗
python tests/run_golden_tests.py                                   # 全平台 golden tests（含本包）
python tests/architecture/search_content_pack_check.py --write-manifest   # 重新產生 BUILD_MANIFEST.json（唯一允許的產生方式）
git diff --check -- docs/architecture/search-content docs/adr/ADR-021-search-content-boundary-and-ownership.md
```

**預期結果：**

```text
search_content_pack_check: PASSED <N> checks, 0 failures   （exit 0）
ALL GOLDEN TESTS PASSED                                     （exit 0）
git diff --check exit 0
```

驗證器檢查的不變量（每一條對應驗證報告的一個 finding class，缺一即 FAIL）：

1. 每份文件 code fence 成對；每個 ```yaml 區塊可被 PyYAML 解析。
2. 每個 **contract 區塊**（頂層 key 非 `EXAMPLE`/metadata 標記者）含非空 `source_of_truth_for`（list）與 `decided_by`（B2 root cause）。
3. 每個在本包出現的 Method/Capability ID 都在 `SEARCH_CONTENT_REGISTRY_RECORDS.yaml` 有一筆 record（含 `status: RETIRED|REJECTED|DEPENDENCY_REQUEST` 者）；每筆 record 的 `owner`/`status`/`purpose`/`evidence_maturity` 非空且在 enum 內（M7／M6）。
4. 每個在本包出現的 `search_content.<domain>.<name>` gate ID 都在 `SEARCH_CONTENT_GATE_RECORDS.yaml` 有一筆 record；每筆 record 的 `display_name`/`owner`/`severity`/`applies_to_artifact_types`/`category` 非空，`applies_to_artifact_types` ⊆ artifact type catalog（M7／M11／M12）。
5. 每個 `OPEN_QUESTION`／`DEFERRED`／`DEPENDENCY` 標記都引用一個存在於 `SEARCH_CONTENT_OPEN_QUESTIONS.yaml` 的 `OQ-SC-*`；每筆 OQ 至少被引用一次（M3）。
6. 每份文件引用的 `EV-*` 都存在於本檔 §3；§3 每條的檔案存在且結尾行號 ≤ 檔案實際行數（M15）。
7. `/mnt/data/` 只允許出現在標明「歷史」的行（M16）；`Proposed repo path` 不得再出現（已改 `Canonical repo path`）。
8. ADR-021 §D6 event registry 的每個 event 都有 aggregate owner；`SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md` 內不存在 H1 編號與 H2 編號不一致的標題（M5／Gate H）。
9. `BUILD_MANIFEST.json` 由驗證器產生且與現況一致（M1）。

## 6. 機器可讀 contract 的最低交付規則

若要建立 machine-readable schema/contract，該文件必須同時新增（依 `EV-TESTS` 的 fixture 契約）：

```text
positive fixture
negative fixture
golden regression fixture
version / migration note
rollback or deprecation rule（退役走 EV-DEPRECATION 七步，不自訂）
```

不得只新增 YAML 而沒有測試樣本。

## 7. 變更紀錄

| 版本 | 日期 | 內容 | 依據 |
|---|---|---|---|
| `1.0.0-draft` | 2026-09-01 | GPT 初版 12 份文件 | — |
| `1.0.1-draft` | 2026-09-02 | 驗證報告任務 1–9：證據檔名／行段修正、三個重複物件合併、tenant scope、state/enum 統一、machine ID 收斂、`search.*` namespace 澄清、Retrieval 執行層綁定 | commit `d82fc3705`、`632dd1913`、`EV-AUDIT-0902` |
| `1.1.0-draft`（規格文件）／`1.1.0`（本檔、README、ADR-021）| 2026-09-02 | 任務 10–12 與 MAJOR 全數：路徑正式化（ADR-021 §D8）、ADR-021 編號與接受、共同段落抽出、`source_of_truth_for`/`decided_by` 全區塊補齊、DecayObservation／artifact type catalog、registry/gate 記錄本體、open-question 登記、跨領域 evidence gates、publishing check↔gate 一一對應、平台 ACTIVE 契約綁定（sentence-provenance／status-codes／mandatory-gates／deprecation-pipeline／audit／rollback／risk-tier／epistemic-label）、驗證器與 golden test 整合、master errata | ADR-021、`EV-AUDIT-0902` §3／§5 |
