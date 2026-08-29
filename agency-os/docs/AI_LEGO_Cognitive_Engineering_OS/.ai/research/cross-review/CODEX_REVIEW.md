# CODEX_REVIEW — 三母規格獨立架構審查（Codex 方）

**日期**：2026-08-29 01:11（elapsed 21.3 min，answer 11,460B）
**產出方式**：`scripts/codex-oracle.ps1 -Mode inspect`（hardcoded read-only sandbox），prompt 僅含三母文件路徑＋中性問題集＋輸出格式；**未含 Claude 任何結論**，並明令禁讀 `.ai/`、Program Plan、WORKLOG。Codex 開頭自我聲明：未讀三份文件以外的 repo 檔案、未見他方分析。
**Raw artifact**：`agency-os/reports/oracle/2026-08-29-inspect-518679ce.md`
**Fidelity 聲明**：oracle wrapper 的 artifact 捕獲有 CP950 double-encoding bug（已開修復 task），CJK prose 有 ~4% 字元在捕獲當下永久損毀；**machine-facing 內容（finding ID、severity、verdict、file:line、verbatim 英文 quotes、enum 值）全為 ASCII，逐字完好**。本檔為規範化轉錄：evidence 逐字保留，CJK 敘述依可讀串流忠實重寫。
**行號校準（Claude 事後驗證，不影響獨立性）**：Codex 對 **MP 與 Atlas 的行號逐一驗證為準確**（L55/56/91/742-746/825/833/995-1000/1077 等全命中）；對 **EC 的行號有系統性偏移約 −28 行**（其 EC:1960 實為空行、`LOCKED_FACT` 在 L1988；其 EC:1448 實為空行、`SOURCE_FACT` 在 L1476）——引用內容全部真實存在，僅 EC 行號視為近似值。

---

## PART A — Findings（CDX-1 ~ CDX-9）

1. **CDX-1｜High**：三份規格的 canonical filename / logical identity 互相衝突。MP:55 `"master_plan_v2_1.md"`、:56 `"v1_2_zhTW.md"`、:91 `"file: ..._v1.md"`、:635/:804 `"..._v1_2_zhTW.md"`；EC:60/:61 用 `_v1.md`。後果：document resolver 若以 MP §0.0.1 為 key 找 `v2_1`/`v1_2_zhTW`，若以 EC Canonical Companion Documents 為 key 找 `v1`——同一 execution 無法穩定綁定正確文件的 hash。

2. **CDX-2｜Medium**：文件宣稱 Atlas 是 method authority，但 Master Plan 仍直接立了 method-specific contract。MP:16 「不再重複完整定義」、:43 「禁止只根據本 Master Plan」、:56 authority 表把 Method Contract 歸 Atlas；但 MP:742 `execute_method(root_cause.fishbone)`、:743 `ProblemStatement + EvidenceSet? → CauseHypothesisSet`、:745 `execute_method(strategy.swot)`、:746 `KnowledgeSet → SWOTAnalysis`。後果：工程師照 MP 實作 fishbone I/O，若 Atlas 定義不同，兩份「合法」實作互不相容。

3. **CDX-3｜High**：Atlas 的 primitive kernel enum 缺它自己的子章 method contract 使用的 token。kernel 表（:170 `FRAME` ~ :193 `LEARN`）未含 `CAUSE_HYPOTHESIS / TRANSFORM / CLASSIFY / CONTEXTUALIZE / WEIGHT`，但 :199-:203 與 :996 使用之。後果：依 kernel 建 enum 的 primitive validator 會拒絕 Atlas 自己的 method example/contract。

4. **CDX-4｜High**：Method ID grammar 不一致。Atlas:50 `method.association.mind_map`、:989 `id: root_cause.fishbone`；MP:742 `execute_method(root_cause.fishbone)`、:825 `method_id: research.thematic_analysis`、:833 `method_id: evidence.triangulation`。後果：registry 收 `method.*.*` 或 `family.method` 都無法把三份文件的 ID 全部 resolve。

5. **CDX-5｜High**：Risk tier enum 在 selection 與 execution 之間 drift。Atlas:1077 `risk_tier: low|medium|high|critical`；EC（≈:379-:454）`R0`~`R4`、（≈:769）`tier: R2`。後果：selector 輸出 `critical`，gate compiler 認的是 `R4`，缺 mapping，無法保證同一風險得到同等強制。

6. **CDX-6｜Medium**：「缺文件/缺 Atlas」的 blocked 狀態被多處定義為不同 machine value，且不入 state machine。MP:45-47 `PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED`；EC（≈:184）`DOCUMENT_RESOLUTION_BLOCKED`、（≈:723）`METHOD_RESOLUTION_BLOCKED`、（≈:566）`BLOCKED`。後果：workflow router 若只認 state machine 的 `BLOCKED`，就會漏接語義化的阻塞碼。

7. **CDX-7｜High**：Epistemic / provenance label enum drift。MP:995-1000 authorship 標籤 `HUMAN ORIGINAL / AI GENERATED / HUMAN APPROVED / SOURCE QUOTATION`；EC（≈:1476-:1487）`SOURCE_FACT / EVIDENCE / ASSUMPTION / AI_INFERENCE / CALCULATED_RESULT / DECISION`。後果：authorship 模組輸出 `HUMAN APPROVED` 或 `SOURCE QUOTATION`，execution trust-boundary validator 沒有對應 enum，會 reject 或丟失資訊。

8. **CDX-8｜High**：Human lock token 定義不一：空格/底線版並存。MP:970 `Locked Fact`、:975 `LOCKED FACT`、:978 「AI 永遠不可覆寫」；EC（≈:1988）`` `LOCKED_FACT` / `LOCKED_DECISION` ``、「不得由 AI 修改」。後果：內容被標成 `LOCKED FACT` 而 runtime 只檢查 `LOCKED_FACT`——人類想鎖定的內容仍可被 AI 覆寫。

9. **CDX-9｜High**：三份文件要求 exact machine-readable contracts，但沒有任何一份實際提供。EC（≈:106）`Exact Schema / Enum / Runtime Contract`、（≈:176）「找到 machine-readable specs」、（≈:2780）`/specs/execution/`；MP:697 `method_id`、:708 `MethodExecutionRequest`、:712 `TypedMethodResult`、:743/:746 typed I/O；Atlas:1003 `ProblemStatement`、:1010 `CauseHypothesisSet`、:1013 `problem_statement.status == validated`。後果：每個實作都自稱遵循規格，但把 `validated` 寫成字串或自己編 enum；replay / validation / interop 全部失效。

## PART B — Architecture Assessment

**可建置的部分**：`Scoped Authority` 的 meta-model 是清楚的（MP:60-:83；EC:90-:106 附近）；`Capability ↔ Method` 的 typed execution boundary 可直接對應 compiler/runtime（MP:630/:699/:701；Atlas:165/:199）；`current-state → rollback-first → gates → handoff` 的 execution lifecycle 足夠工程化（EC:141/:551 等）。

**過度規定**：repo/path 佈局被直接寫入核心規格（MP:612/:767/:845/:1007；EC ≈:619/:2725/:2780 的 `/ai/`、`/specs/cognitive/`、`/workflows/`、`/authorship/`、`/.ai/tasks/`、`/policies/ai-execution/`、`/specs/execution/`）；Master Plan 把 edition / packaging 直接寫入母規格（MP:527/:536/:545/:554/:562）。同時，被宣告為必要的 exact schemas/enums 卻缺失。

**Top 5 風險（若明天照三份文件開工）**：
1. 首批實作誕生在 contract 真空：核心 schema/enum 被要求存在但未定義。
2. 文件解析與 replay 首日就被 filename/ID drift 破壞。
3. Provenance / human-protection 因 label/lock drift 出現 silent mismatch。
4. Method semantics 有兩個 authority 來源，實作者注定選錯一套。
5. 30 年壽命目標下，path-as-architecture 把規格硬綁到單一 repo 佈局，遷移成本異常高。

## PART C — Open Questions（8 條 UNKNOWN）

1. 三份規格唯一 canonical filename set 到底是哪一組？
2. Authoritative method ID grammar 是否允許 `method.*.*` 與 `*.*` 並存？
3. `low|medium|high|critical` ↔ `R0-R4` 的正式 mapping 是什麼？
4. Authoritative epistemic/provenance enum 是哪一份？
5. `PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED` 是正式 status/error code，還是 `BLOCKED` 的 reason？
6. `MethodExecutionRequest`、`TypedMethodResult`、`ProblemStatement`、`CauseHypothesisSet` 的 authoritative schema 在哪裡？
7. Master Plan 內的 method-specific I/O 與 workflow snippet 是否要被 compiler 視為 normative contract？
8. 第一個 nontrivial task 時 machine-readable specs 尚未存在——如何處理？（EC 要求 resolve 它們）
