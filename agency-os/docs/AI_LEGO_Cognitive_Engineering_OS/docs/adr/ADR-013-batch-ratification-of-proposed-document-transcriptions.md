# ADR-013: Batch Retroactive Ratification of PROPOSED-Document Transcriptions

Status: ACCEPTED（2026-08-30，操作者明示授權 Claude 行使架構師裁決權，同 ADR-001~012 範圍聲明：ADR 決策定案 ≠ 母文件已編輯，套用仍須走 ADR-006 `.ai/proposals/` 流程，該流程 `status: APPROVED` 僅操作者本人可推進。**授權路徑比照 ADR-010 而非 ADR-001~009**：本 ADR 批准的不是 Claude 這次全新設計的取捨，而是「確認一份先前已由 Claude 直接轉錄、操作者尚未逐條過目的 PROPOSED 規劃文件內容，忠實無誤，可正式採納為該 schema 檔案的權威內容」——與 ADR-010 Sub-decision (b) 的授權性質相同，見該 ADR 檔頭的同款誠實聲明）
Date: 2026-08-30
Related: ADR-003（Sub-decision (b)/(c) 已裁決 CAS/blast-radius，但 Consequences 明文排除 relational RLS 與共用元件洩漏防護，本 ADR 的 tenant-isolation 子決策正是補上這兩項 follow-up）、ADR-007（pii-redaction 已由此 ADR 完整覆蓋，本 ADR 不重複裁決，見 §0）、ADR-011（gate 相關內容不在本 ADR 範圍）、`docs/architecture/DATA_ARCHITECTURE_PLAN.md`／`docs/architecture/DEVOPS_SRE_PLAN.md`／`docs/architecture/GLOBAL_JURISDICTION_PLAN.md`（三份 Status: PROPOSED 規劃文件，本 ADR 批准的是「這些文件的特定段落已被忠實轉錄進機讀 schema」這件事，不是把這三份文件本身升格為 ACCEPTED——它們的 Status 保持 PROPOSED 不變，見 §5）

## Context

Phase 3 建置過程中，5 個 schema/policy 檔案的內容是直接轉錄自另一份仍標記 `Status: PROPOSED`（尚未走本專案自己的 ADR 正式批准流程）的規劃文件，而非轉錄自三份母文件本身或既有 ADR。每個檔案自己的 `decided_by`/`open_questions` 段落都誠實揭露了這個缺口，並點名「需要一份批次 Round 2 ADR」：

- `specs/domain/repository-contract.schema.yaml`（`open_questions.OQ-REPOCONTRACT-1`）
- `specs/security/tenant-isolation-controls.schema.yaml`（`open_questions.OQ-TENANTISO-1`）
- `policies/provider/ai-gateway-fallback.policy.yaml`（`open_questions.OQ-GATEWAYFALLBACK-1`）
- `policies/provider/model-registry.policy.yaml`（`open_questions.OQ-MODELREGISTRY-1`）
- `specs/jurisdiction/conflict-of-laws-output.schema.yaml`（`open_questions.OQ-CONFLICTOFLAWS-1`）
- `specs/execution/method-resolution.schema.yaml` 的 `policy_context`/`regulatory_exposure` 欄位（`open_questions.OQ-mres-4`——訂正：先前任務摘要誤引 `OQ-mres-5`，該 id 實際是另一個較窄的問題，見 §4.5）

**第 6 個候選項目、`policies/privacy/pii-redaction.policy.yaml`，經查證後排除**：見 §0。

**方法**：對每個檔案，(a) 重讀該檔自己的 `decided_by`/`compilation_decisions`/`open_questions` 承認缺口的原文；(b) 重讀其轉錄來源的 PROPOSED 文件對應章節全文；(c) 逐欄位比對確認轉錄忠實（無新增內容、無遺漏內容）；(d) 若發現轉錄過程中產生的獨立缺陷（非「是否忠實」問題，而是 schema 自身的正確性問題），一併修正並記錄。這個方法本身沿用 ADR-010 Method Used 段「直接應用已有原則」與 `deprecation-pipeline.schema.yaml` `merge_verification` 段「逐項核對而非照抄任務摘要」的既有紀律。

## §0 排除項目：`pii-redaction.policy.yaml`——已由 ADR-007 完整覆蓋，非本 ADR 範圍

查證結論：`pii-redaction.policy.yaml` 自己的 `decided_by`（該檔 L47-52）明文寫「`docs/adr/ADR-007-pii-redaction-vs-pseudonymization-timing.md`（ACCEPTED）...本檔內的欄位形狀與命名選擇是轉錄該 ADR Recommendation 的 Phase 3 Low-risk 編譯決策，不是新架構決策——實際決策由該 ADR 完成」。全文 grep 該檔案的「尚未走 ADR」字樣：零命中。唯二的 open_questions（`OQ-PII-1`、`OQ-PII-2`）分別是「另一檔案本身鬆散」與「母文件文字套用仍待 ADR-006 proposal 流程」，皆與「這份 policy 檔的內容本身是否已批准」無關。逐欄位核對 ADR-007 全文（190 行）與該 policy 檔：Sub-decision (a) 的 Deterministic Keyed-HMAC Tokenization 機制（`token_alg`/`requires_keyed_hmac`/`hmac_key_ref`）、Sub-decision (b) 的 MP §149 `v1_baseline`/`future_advanced` 分級、FMEA 發現的裸雜湊禁令（`forbidden_mechanisms`）、4 值分級沿用（`classification_tag`）——全部逐條對應，無新增、無遺漏。

**結論：此項目不需要本 ADR 批准，因為它早已被 ADR-007 批准。** 不列為本 ADR 的第 6 個子決策，僅在此記錄查證過程，避免未來任何人誤以為它是遺漏項。

## Decision Drivers

1. **不重新做設計，只確認轉錄忠實**——與 ADR-001~009「Claude 從零裁決」不同，這 5 個檔案的實質內容已經是 Claude 早先直接轉錄自對應 PROPOSED 文件（每個文件本身都經過完整的多角度分析與量化門檻設計，只是尚未走本專案自己的 ADR 儀式）。本 ADR 的價值在於：完成第三方（本次任務）獨立逐欄位核對，並正式記錄「這份轉錄可信」的稽核軌跡——而不是重新論證一次已經論證過的架構取捨。
2. **忠實度是可驗證的事實，不是取捨判斷**——每個項目的查證都基於直接重讀來源文件章節與 schema 檔案逐欄比對，附 file:line 引用，可被任何人重跑驗證，非主觀評分。
3. **轉錄過程中發現的獨立缺陷，即使與「是否忠實」無關，也一併修正**——`repository-contract.schema.yaml` 的 9 vs 8 計數不一致與 `tenant-isolation-controls.schema.yaml` 的過期交叉引用聲稱，都是本次查證過程中新發現的真實缺陷，不因為它們超出「忠實度」這個窄問題就略過不修（同 R4「聲稱即驗證」紀律）。
4. **來源 PROPOSED 文件本身的 Status 不因本 ADR 改變**——`DATA_ARCHITECTURE_PLAN.md`／`DEVOPS_SRE_PLAN.md`／`GLOBAL_JURISDICTION_PLAN.md` 本身仍是 `Status: PROPOSED`，本 ADR 批准的範圍嚴格限定在「這 5 個機讀 schema/policy 檔案已忠實轉錄該文件的特定段落，可作為該檔案的權威內容」，不是把整份來源文件升格為 ACCEPTED——同 ADR-010 §Migration「本 ADR 的命名方案可隨時重新命名，但主機平台選型 post-launch 不可逆」那種精確劃定批准範圍的做法。

## Sub-decision 1: `repository-contract.schema.yaml` ← `DATA_ARCHITECTURE_PLAN.md` §1-5

**忠實度查證**：重讀 `DATA_ARCHITECTURE_PLAN.md` §1（Storage Engine Necessity Analysis，L17-33）、§2（System-of-Record Assignment）、§3（Consistency & Concurrency Strategy，L64-72）、§4（Backup & DR Matrix，L76-98）、§5（Provenance Chain Unification，L102-128）全文，逐欄位比對 schema 檔案對應區塊。欄位名稱、Tier 0/1/2 模型、`pg_advisory_xact_lock(hashtext(execution_id))` 常數、Reconciliation Job 沿用 ADR-005 語意、`ResultPromotedToEvidence` 事件形狀——全數逐字對應。

**發現並修正的獨立缺陷（非忠實度問題，是 schema 自身正確性問題）**：`storage_engine_assignment` 陣列原寫 `minItems: 8, maxItems: 8`，但同一陣列的 `purpose` enum 始終有 9 個值（`structured_metadata/object_storage/semantic_retrieval_vector_index/graph_store/event_store/full_text_search_index/metrics_timeseries/cache/queue`）。原始說明試圖用「來源表格把 Cache/Queue 標成 8a/8b 一對，所以算 8 不算 9」自圓其說——但直接重讀 `DATA_ARCHITECTURE_PLAN.md:29-30` 確認 Cache 與 Queue 各自有獨立的「MVP 方案」與「抽離門檻」欄位內容（Cache：Postgres `shared_buffers`+應用層 memoization；Queue：EC §27 Outbox 表+`LISTEN/NOTIFY`），是兩個真正獨立的用途，不是一列拆兩個標籤。**根因是來源文件自己 L33 結論句「MVP 階段 8 類需求」的措辭**——這是文件自己對「8 個編號列（1-7 加上 8a/8b 這對標籤）」的簡稱，不是「Cache 和 Queue 應合併成一個 schema 條目」的主張。已修正：`minItems`/`maxItems` 改為 9（與 enum 值數量一致，這個數字原本從未對齊過）；並比照本套件既有的 `deprecation-pipeline.schema.yaml`（MRSP-16 bug class）防護手法，補上 9 條 `allOf`/`contains`/`minContains: 1`/`maxContains: 1`，逐一釘死每個 purpose 值必須恰好出現一次——單純的 `minItems`/`uniqueItems` 不足以防止「兩筆條目共用同一個 purpose、靠其他欄位文字不同而各自視為唯一」這個已知 bug class。連動修正 `tests/contracts/specs/domain/repository-contract.fixtures.yaml`：其 `valid` fixture 本身就漏了 `queue` 這一項（同一個計數錯誤鏡射進測試資料），另外 2 個 `invalid` fixture 的 `storage_engine_assignment` 陣列也一併補齊，避免它們意外因為這個不相干的欄位而通不過測試。

## Sub-decision 2: `tenant-isolation-controls.schema.yaml` ← `DATA_ARCHITECTURE_PLAN.md` §6

**忠實度查證**：重讀 `DATA_ARCHITECTURE_PLAN.md` §6（L132-147）全文。`default_isolation_model: const "shared_schema_with_rls"`（schema L77）逐字對應 L141；`shared_component_controls`（vector_index/graph_store 兩項，含 fallback 規則，schema L100-129）逐字對應 L142；`object_storage_path_reuse`（schema L131-143）正確地「不重新裁決」，只指向 ADR-003 既有的 CAS 路徑慣例，對應 L143 的邊界聲明。無新增、無遺漏。

**既有 ADR 覆蓋檢查**：ADR-003 本身**明文排除**這個決策——其 Consequences 段（`ADR-003:112`）逐字寫：「(i) full RLS/schema-per-tenant vs. shared-schema decision for relational data outside the CAS layer; (ii) how shared components like a cross-workspace Knowledge Graph or Vector Index avoid cross-tenant leakage」列為「New follow-up surfaced (not solved here)」。所以這不是「ADR-003 已經批准、本檔重複裁決」的情況（不像 pii-redaction/ADR-007），這 2 個 follow-up 確實需要本 ADR 補齊。

**發現並修正的獨立缺陷**：該檔自己的 `description` 段落宣稱「`SECURITY_THREAT_MODEL.md` 的 I1/Ds1 兩列尚未交叉引用本檔的裁決，仍描述為完全未解決」——這個宣稱在本次查證時重讀 `SECURITY_THREAT_MODEL.md:109,130` 後確認**已經過期**：I1/Ds1 兩列現在都已寫「**UPDATED（2026-08-29）**」並明確點名本檔——顯然是同一天稍晚的另一輪編輯已經補上了交叉引用，只是本檔自己的 description 文字沒跟著更新。已修正 description 措辭（從「尚未做」改為「查證當下已確認完成，本檔文字先前沒跟上」）；`open_questions.OQ-TENANTISO-2`（原本問「是否該去編輯 SECURITY_THREAT_MODEL.md」）標記為 `RESOLVED`。

## Sub-decision 3: `ai-gateway-fallback.policy.yaml` + `model-registry.policy.yaml` ← `DEVOPS_SRE_PLAN.md` §4/§5

**忠實度查證**：重讀 `DEVOPS_SRE_PLAN.md` §4（L138-167，circuit breaker 全部數值：15s/60s 健康檢查窗、≥20 樣本且錯誤率>20%或 p95>3x baseline 觸發跳脫、30s 冷卻、5 個 canary 請求 ≥80% 成功才 Close、30/60/120/300s 退避序列、R3+對外阻斷+alert vs R0-R2 入列重試、單一 provider Open>5min 升 SEV2/全體 Open 升 SEV1）與 §5（L171-197，`model_registry_entry` 14 欄位完整範例）全文。兩份 policy 檔案的每一個數字常數（以 JSON Schema `const` 落實）皆逐字對應來源，欄位名稱亦逐一對應，無新增、無遺漏。兩檔自己的 `verification.note` 也已誠實記錄「這些常數不是自己發明的」。

**額外發現**：`model-registry.policy.yaml` 的 `champion_status` 值 `retired` 雖然本身確實在 `DEVOPS_SRE_PLAN.md:189` 的原始範例裡逐字出現，但該檔自己的 verification 段落誠實標註「這個值本身未見於 EC §37」——這是一個已經被前手誠實揭露、不需要本 ADR 再處理的既有揭露，記錄於此僅為完整性。

## Sub-decision 4: `conflict-of-laws-output.schema.yaml` ← `GLOBAL_JURISDICTION_PLAN.md` §5

**忠實度查證**：重讀 `GLOBAL_JURISDICTION_PLAN.md` §5.2（L259-261，單一邏輯 owner = Conflict-of-Laws Engine，`/modules/jurisdiction/conflicts/` 只是儲存位置非決策者，最終 repo 路徑留待 Phase 4）、§5.3（L265-289，`conflict_of_laws_result` 完整範例）、§5.4（L291-293，`status` 是 Stage 3 的唯一 fail-closed 訊號）全文。`owning_component: const "conflict_of_laws_engine"`（schema L71-74）正確只解決「哪個元件擁有決定權」，不判定任何真實法律優先權，逐字對應 §5.2 的邊界聲明；5 值 `status` enum（`RESOLVED/CONSERVATIVE_SAFE_MODE/AMBIGUOUS/CONFLICT/LEGAL_REVIEW_REQUIRED`）逐字沿用 MP §98 與 §5.3 範例。無新增、無遺漏（本次查證刻意不重新評估 2026-08-30 已由真實 `/codex-review` 抓到並修正的 `allOf`/`if`/`then` 補強，那是與「原始轉錄是否忠實」無關的獨立強化）。

**另一項附帶提醒**：`MACHINE_READABLE_SPEC_PLAN.md:162` 記錄了一個與本檔相鄰但明確不屬本 ADR 範圍的既知缺口——P1-DUP-6（MP §98 五值 vs MP §134 六值法律不確定性詞彙衝突），該檔自己已誠實標註「仍待獨立 Round 2 ADR 裁決」，本 ADR 不處理。

## Sub-decision 5: `method-resolution.schema.yaml` 的 `policy_context`/`regulatory_exposure` ← `GLOBAL_JURISDICTION_PLAN.md` §6

**訂正一處引用錯誤**：任務摘要原引用 `open_questions.OQ-mres-5` 作為本項「尚未走 ADR」的承認依據，查證後發現這個引用錯誤——真正承載這個承認的是 `OQ-mres-4`；`OQ-mres-5` 是另一個範圍更窄的問題（§6.4 的 forcing rule 為什麼不能編碼成同物件 JSON Schema 約束，屬跨物件選擇演算法行為，已有 `partial_resolution` 註記，與「是否已 ADR 批准」無關）。本節後續一律引用正確的 `OQ-mres-4`。

**忠實度查證**：重讀 `GLOBAL_JURISDICTION_PLAN.md` §6.2（L303-322，`policy_context` 11 個子欄位完整範例＋衍生欄位 `regulatory_exposure`）、§6.3（L324-337，MP §26.3 十一項政策分析維度對照表）、§6.4（L339-345，forcing rule）全文。schema 檔案的 `policy_context` 物件（`method-resolution.schema.yaml:542-608`）逐一對應全部 11 個子欄位，巢狀形狀（`budget_context{available,source,cycle}`／`tax_exposure{present,refs}`／`trade_exposure{present,refs}`／`privacy_exposure{present}`／`election_cycle_window{start,end}` 等）逐字相符；`regulatory_exposure` 正確放在 `policy_context` 的同層兄弟欄位（對應來源 L321 的縮排層級，不是巢狀在 `policy_context` 裡面），且正確限定只出現在 resolved 端（`resolved_selection_context`），never 出現在手填輸入端（`selection_context_supplement`），逐字對應來源「DERIVED, never hand-set」的註解。`^LAW-` pattern 是合理、已揭露的推論（沿用來源自己的 `[LAW-...]` 範例語法），非超出範圍的發明。無遺漏、無發明。§6.4 的 forcing rule 誠實地未編碼進 schema（有明確、正確的理由——跨物件行為非同物件形狀約束），而非靜默省略。

**本 ADR 後續一次真實 `/codex-review`（審 ADR-013 本身這批 commit）額外抓到的獨立缺口，非「忠實度」問題**：`regulatory_exposure` 是「DERIVED, never hand-set」，且（因先前一次真實 `/codex-review` 修正）現在是必填欄位——但重讀 `GLOBAL_JURISDICTION_PLAN.md` §6 全文確認：**來源文件自己也沒有給出從 `policy_context` 11 個子欄位推導出 `regulatory_exposure` 值的具體演算法或對照表**，§6.3 的對照表只說明每個維度對「method selection 的下游效果」，不是「如何算出 regulatory_exposure 本身」的公式。這不是本項轉錄不忠實（schema 忠實反映了來源文件同樣缺失這個演算法），而是來源文件自己就沒解決的一個更根本缺口——欄位必填但無法可靠計算，等於保證不同實作在邊界案例上會算出不同答案。這正是本次任務 `/codex-review` focus text 第一段明確要求檢查的「這個改動是否依賴 diff 外看不見的東西」——已誠實記錄為 `method-resolution.schema.yaml` 新增的 `open_questions.OQ-mres-6`，不由本 ADR 或 Claude 自行發明推導演算法（這屬於法規/政策判斷，同 Zero Trust/Supply Chain 選型一樣，是操作者層級的決定，非 Phase 3 schema 編譯可自行拍板的範圍）。

## Method Used

直接應用既有原則於一個新主題（同 ADR-010 Method Used 段的方法論），此處應用對象是「確認轉錄忠實」而非「從零裁決取捨」。Evidence Triangulation（每個項目的忠實度判斷都交叉核對來源文件原文＋schema 檔案內容＋既有 ADR 覆蓋範圍三方）。R4 聲稱即驗證：兩處獨立缺陷（`repository-contract.schema.yaml` 的計數錯誤、`tenant-isolation-controls.schema.yaml` 的過期交叉引用聲稱）皆透過直接重讀來源檔案驗證後才修正，不是照抄查證報告的結論。

## Recommendation

1. 正式採納上述 5 個 sub-decision 對應的 schema/policy 檔案內容為權威版本（`decided_by` 可更新為引用本 ADR，見套用清單）。
2. `pii-redaction.policy.yaml` 不需任何動作——已由 ADR-007 完整覆蓋（§0）。
3. `repository-contract.schema.yaml` 的計數缺陷、`tenant-isolation-controls.schema.yaml` 的過期交叉引用聲稱，兩處獨立缺陷已在本次任務中一併修正（見套用清單），不留待未來。
4. `DATA_ARCHITECTURE_PLAN.md`／`DEVOPS_SRE_PLAN.md`／`GLOBAL_JURISDICTION_PLAN.md` 三份來源規劃文件本身**維持 `Status: PROPOSED` 不變**——本 ADR 不批准整份文件，只批准「這 5 個機讀 schema/policy 檔案已忠實轉錄其特定段落」這件事。

## Consequences

- Positive：5 個此前「已建但無 ADR 稽核軌跡」的檔案現在有正式、可重跑驗證的批准記錄；過程中額外抓到並修正 2 個獨立於「忠實度」問題本身的真實缺陷（計數不一致、過期交叉引用聲稱），沒有因為「只是來查忠實度」就對明顯的其他問題視而不見。
- Negative：無——這是文件層級的批准與 2 個小型 schema 修正，無 runtime 副作用。
- 尚未解決的 follow-up（本 ADR 明確不處理，記錄供未來參考）：(i) `repository-contract.schema.yaml` 的 3 份來源規劃文件本身仍待走 ADR-006 `.ai/proposals/` 流程才能實際編輯母文件文字；(ii) P1-DUP-6（MP §98/§134 法律不確定性詞彙衝突）仍待獨立 Round 2 ADR；(iii) `tenant-isolation-controls.schema.yaml` 的 `OQ-TENANTISO-3`（實際 RLS policy SQL/DDL 與測試）是實作階段任務，非本 ADR 範圍；(iv) **本 ADR 自身這批 commit 事後被真實 `/codex-review` 抓到的新缺口**：`regulatory_exposure` 必填但無任何定義好的 `policy_context → regulatory_exposure` 推導演算法，來源文件 `GLOBAL_JURISDICTION_PLAN.md` §6 自己也沒解決這件事——已記錄為 `method-resolution.schema.yaml` 的 `open_questions.OQ-mres-6`，明確不由本 ADR 或 Claude 自行發明（屬法規/政策判斷，需操作者裁決）。

## Migration / Rollback

- **Migration**：零成本——這是文件批准 + 2 個機讀 schema 修正，尚無任何 runtime 資料依賴這些檔案。
- **Rollback**：純文件/schema 編輯，`git revert` 可完整回退。回退後 `repository-contract.schema.yaml` 的 8 vs 9 計數缺陷與 `tenant-isolation-controls.schema.yaml` 的過期聲稱會重新出現，需注意。

## Evidence

- `specs/domain/repository-contract.schema.yaml`（`decided_by` L36-50、`open_questions.OQ-REPOCONTRACT-1` L286-298、`storage_engine_assignment` L135-227）
- `docs/architecture/DATA_ARCHITECTURE_PLAN.md`（§1 L17-33、§2 L37-60、§3 L64-72、§4 L76-98、§5 L102-128、§6 L132-147）
- `specs/security/tenant-isolation-controls.schema.yaml`（`decided_by`/`description` L7-52、`open_questions.OQ-TENANTISO-1/2` L155-176）
- `docs/architecture/SECURITY_THREAT_MODEL.md`（I1 L109、Ds1 L130，兩處「UPDATED（2026-08-29）」的即時重讀確認）
- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md`（Consequences，L112，明文排除的 2 項 follow-up）
- `policies/provider/ai-gateway-fallback.policy.yaml`（`decided_by` L29-33、`open_questions.OQ-GATEWAYFALLBACK-1` L114-121）
- `policies/provider/model-registry.policy.yaml`（`decided_by` L23-27、`open_questions.OQ-MODELREGISTRY-1` L100-107）
- `docs/architecture/DEVOPS_SRE_PLAN.md`（§4 L138-167、§5 L171-197）
- `specs/jurisdiction/conflict-of-laws-output.schema.yaml`（`decided_by` L39-47、`open_questions.OQ-CONFLICTOFLAWS-1` L151-158）
- `docs/architecture/GLOBAL_JURISDICTION_PLAN.md`（§5 L253-294、§6 L297-345）
- `specs/execution/method-resolution.schema.yaml`（`open_questions.OQ-mres-4`/`OQ-mres-5`/新增 `OQ-mres-6`、`compilation_decisions` L188-235、`policy_context`/`regulatory_exposure` 欄位、`GLOBAL_JURISDICTION_PLAN.md` §6 全文重讀確認無推導演算法）
- `agency-os/reports/oracle/`（本 ADR 這批 commit 事後的真實 `/codex-review` artifact，抓到 `OQ-mres-6` 這個獨立缺口的原始來源）
- `policies/privacy/pii-redaction.policy.yaml`（`decided_by` L47-52，§0 排除判定的依據）與 `docs/adr/ADR-007-pii-redaction-vs-pseudonymization-timing.md`（全文 190 行逐條比對）
- `docs/adr/ADR-010-database-platform-and-table-naming.md`（授權路徑與 Method Used 段的模板參考）
- `docs/adr/ADR_INDEX.md`（既有 12 份 ADR 的編號/依賴關係記錄慣例）
- `specs/execution/deprecation-pipeline.schema.yaml`（`allOf`/`contains`/`minContains`/`maxContains` 完整性防護手法的既有先例，本 ADR 的 Sub-decision 1 修正直接沿用）

**邊界確認**：本次任務全程執行 Read/Grep（唯讀）+ 對 2 個獨立發現的真實缺陷做最小必要修正（`repository-contract.schema.yaml` 的計數與完整性約束、`tenant-isolation-controls.schema.yaml` 的過期聲稱），未對三母文件或任何 `Status: PROPOSED` 規劃文件本身做任何修改。本 ADR 本身即為輸出；後續各檔案 `decided_by` 欄位更新為引用本 ADR，屬本 ADR 之後的獨立最小編輯。
