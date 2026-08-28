# PHASE 0 — CURRENT STATE REPORT

**Program**：AI LEGO Cognitive Engineering OS
**Phase**：0 — 文件完整性與 Current State Reconstruction
**日期**：2026-08-29（分析基準 snapshot：2026-08-28，見 [document-hashes.yaml](document-hashes.yaml)）
**產出方法**：8-agent workflow（`wf_7d1cd8d8-038`）——3 個全文精讀 reader（三母文件共 14,885 行逐行覆蓋）→ 2 個跨文件分析（terminology/duplication + reference-integrity/scope）→ 3 個 doc-scoped **對抗式** verifier（預設立場「finding 是錯的」，逐條 Grep 原文驗 quote/line/claim）。**每一條 finding 都經過至少 1 個、跨文件者經過 2–3 個獨立 verifier 驗證。**
**Findings SSOT**：[verified-findings.yaml](verified-findings.yaml)（71 條全文＋verdict＋verifier reason）。本報告只做綜合，不重抄細節。

> **Phase 0 紀律**：本報告**登錄**問題，不修任何一條。修改走 Phase 2 收斂（Option A/B/C/Status-Quo + ADR + 母文件修改協議）。
> **限制**：本分析為 Claude 單模型產出。Codex 獨立 cross-review（反 anchoring，directive §V）尚未執行——本報告結論在 CONVERGENCE_MATRIX 完成前不得視為 FACT。

---

## 1. Current State（現況）

| 事實 | 證據 |
|---|---|
| 三份母文件存在且唯一（磁碟全機搜尋無其他 lineage） | [document-inventory.yaml](document-inventory.yaml) |
| 共 14,885 行 / ~268KB；SHA-256 已鎖定 | [document-hashes.yaml](document-hashes.yaml) |
| 只有 Execution Contract 有完整 identity header（ID+semver+lineage） | document-inventory.yaml `defects` |
| 全部 machine-readable 基礎設施（/specs、/policies、schemas、ADR）**尚不存在**，均為文件內的規劃宣告 | verified-findings CROSS-R-3、Atlas Appendix A |
| 文件在 snapshot 時 untracked；本次 commit 進 main 作 hash-anchored baseline（OQ-5 暫案） | git log |

**Inventory 規模**（全文精讀產出，各檔為 SSOT）：

| Register | 內容 | 規模 |
|---|---|---|
| [architecture-inventory.yaml](architecture-inventory.yaml) | headings 640 全數 + 構件 + machine blocks | 168 components / 64 blocks |
| [method-inventory.yaml](method-inventory.yaml) | Atlas 方法目錄**全編目** | 284 methods（+MP 4、EC 1） |
| [policy-inventory.yaml](policy-inventory.yaml) | policy / gate / redline / status code | 251 條（EC 152、MP 62、Atlas 37） |
| [terminology-map.yaml](terminology-map.yaml) | 核心術語與 machine identifiers | 246 terms |
| [domain-inventory.yaml](domain-inventory.yaml) | 宣告的 domains | 42（MP 30、Atlas 12） |
| [reader-defects-and-references.yaml](reader-defects-and-references.yaml) | 單文件 defects + 42 條跨文件引用 | 35 defects |

## 2. Known（已確立、可依賴）

- 三文件分工意圖清楚且一致被三份文件重申：MP=WHAT/WHY、Atlas=HOW TO THINK、EC=HOW AI MUST EXECUTE（[document-authority-map.yaml](document-authority-map.yaml)）。
- 核心理念在三份文件中無矛盾：Human-led / Evidence-centered / Model-replaceable / Local-first / Typed LEGO / 30-year discipline。**衝突全部發生在機制層（enum、schema、狀態碼、路徑），不在理念層。**
- Atlas 方法體系實質完整：24 primitives kernel、F01–F24 目錄、284 個方法、selection engine、method contracts、gates——是三份中最接近可機器化的。
- EC 的執行生命週期（Boot Contract → Task Packet → Gates → Manifest → Handoff）結構完整，狀態機與 side states 有明文詞彙表。

## 3. Unknown（無法從文件推得，不猜）

- **v2_1 / v1_2_zhTW lineage 是否存在於他處**（→ OQ-2，人類回答）。
- 哪些 path tree 是 binding、哪些是 advisory（EC §91–94 無限定詞 vs 他節「建議」；finding DOC-execution_contract-11）。
- `Jurisdiction Pack` / `Applicable Pack` 的定義、schema、路徑（三文件皆無；DOC-execution_contract-5）。
- `ProblemStatement.status` enum 與轉移規則（Atlas contract precondition 引用但未定義；DOC-method_atlas-9）。
- `Perspective Packs` / `Independent Analysis`（Atlas §1 列為強制設計，全文件僅出現一次無定義；DOC-method_atlas-13）。
- MP §90 的 22 份 pre-MVP 規格檔全部尚未存在——其內容只能於 Phase 2/3 由人類批准後產生。

## 4. Conflict（跨文件矛盾——13 條 high 全數在此類，完整清單見 verified-findings.yaml）

**最嚴重的一組：仲裁機制自身壞掉。**

1. **CROSS-T-9**：衝突解決 precedence chain（仲裁所有其他衝突的規則）本身被定義兩次且已漂移——MP §0.0.2 六層（第 2 層含 Architecture Constitution）vs EC §2.1 八層（無 Architecture Constitution）。
2. **CROSS-R-13**：MP 的 Scoped Authority 模型（§0.0.1 表 + §0.0.2 圖）**沒有 Execution Contract 的位置**——只認 MP+Atlas+Specs+ADR，Governance 歸 MP；EC 的表則自佔兩列。兩套授權模型治理同一組文件。
3. **CROSS-T-10 / CROSS-R-12**：`Architecture Constitution` 在 EC = Master Plan 本身（L4152–4153），在 MP = 一份待寫的獨立檔 `Architecture-Constitution-v1.md`（§90 item 1）且位階高於 scoped 層。precedence chain 的 load-bearing 節點身分不明。

**Load-bearing enum 衝突（validator 無法實作）：**

4. **CROSS-T-3 / CROSS-R-10**：`risk_tier` 兩套不相容 vocabulary——Atlas `low|medium|high|critical`（gate injection 觸發於 `critical`）vs EC `R0–R4`。EC §14 把 task_context 餵給 Atlas selector，但無任何轉換定義 → **Mandatory Gate Injection 在機器上永遠無法觸發**。
5. **CROSS-T-6 / CROSS-R-9**：epistemic label（內容信任邊界）三套版本：Atlas 11 值空格式、EC 11 值 SNAKE_CASE、MP 6 值＋「禁止混合」。
6. **CROSS-T-5 / CROSS-R-4**：「Atlas 無法讀取」同一失敗條件兩個強制狀態碼：MP `PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED` vs EC `METHOD_RESOLUTION_BLOCKED`，皆不在 EC side-state 詞彙表內。
7. **CROSS-T-15**：rigor 模式 MP 五種（含 Deep Intelligence）vs Atlas enum 四值——第五種模式在機器上不可表達。
8. **CROSS-R-5**：release gate 集合實質不同——MP §158 GDoD 11 項（高風險只加 1）vs Atlas §22 14+6 項。以哪份放行，結果不同。

**Scope violations（違反自己宣告的分工）：**

9. **CROSS-R-7**：Atlas §22.1/22.2 立法 platform-wide Global/High-risk Gate，但兩份授權表都只給 Atlas「Method-specific Gate」。
10. **CROSS-R-8**：Atlas §18 重新定義 Global Jurisdiction Architecture（授權表歸 MP）。
11. **CROSS-R-14**：Atlas §19/§21 立法 execution lifecycle 與 authority gate（授權表歸 EC）。

## 5. Duplication（雙重維護點——多數已在 v1 內漂移，證明規則「同一規則不得多文件維護」已被違反）

| Finding | 機制 | 漂移狀態 |
|---|---|---|
| CROSS-T-4 / CROSS-R-6 | **Execution Manifest**（30 年 replay 的核心機制）| **3–4 套不相容 key set**（declared_version/content_hash vs version/sha256 vs flat EX-991）＋EC 自己 prose（L85）與 schema（§64）欄位名不同 |
| CROSS-T-11 | Global/High-risk Gate checklist（Atlas §22 vs EC §68） | 已名稱漂移（Independent Judge PASS vs Independent Review 等 3 處） |
| CROSS-T-12 | Reversal Criteria schema | 3 套形狀（reversal_conditions[] vs reversal 單數 vs indicators[]/thresholds[]） |
| CROSS-T-13 | Assumption Registry（ASM-*） | 3 套欄位集（各缺 owner / type+confidence 不一） |
| CROSS-T-19 | Deprecation pipeline | 6 步 vs 7 步（EC 多 Deadline） |
| CROSS-T-20 | Champion/Challenger | 3 份，適用範圍各異（models only vs Method/Model/Recipe vs +Prompt） |
| CROSS-T-21 | Capability Availability 7 值 enum | 逐字重複 ×2（目前一致=純雙維護點）＋MP 自己範例用小寫 |
| DOC-method_atlas-11 | Atlas §8 總表 vs §11 詳解 | 6 組表格逐字重複（TOWS/Assumption Mapping/Power–Interest/Scenario/Futures Wheel/Causal DAG） |
| CROSS-T-22 | ADR 位置+模板 | /docs/adr/ ×3 處 vs /docs/governance/adr/（EC §93）；模板兩版 |

## 6. Gap（缺失的 contract——被規範性引用但無定義）

- **CROSS-R-3**：核心 capability contract `cognitive.execute_method` 的 I/O 型別 `MethodExecutionRequest` / `TypedMethodResult` 全三文件無 schema、不在任何承諾清單。
- **CROSS-T-16**：EC `task_context` → Atlas `selection_context` 的欄位映射不存在（缺 goal_type/problem_type/required_rigor 等 7 欄）——兩文件的接縫斷開。
- **CROSS-T-18**：`Section Registry`、`Normative Context Bundle`、`normative-context.yaml`（Task Packet 必要件）無任何 schema。
- **DOC-method_atlas-7**：§14.1 型別相容性宣稱可 static type check，依賴 12+ typed objects（KnowledgeSet、SWOTAnalysis、HumanDecision…），但 §16 只定義 3 種。
- **DOC-execution_contract-9**：9 個 blocking/escalation 狀態碼無一映射到 Execution State Machine 的合法 side states。
- **CROSS-T-7**：最常被引用的紅線「UNKNOWN 不得提升為 FACT」的 `FACT` 不在任何 enum。
- **CROSS-R-11**：EC 紅線鎖定的 `LOCKED_DECISION` 三文件皆無定義。

## 7. Risk（若不先收斂就實作的後果）

1. **Boot 即死**：EC Boot Contract 要求 resolve 三文件並驗 hash；MP 有 10 處 MUST-resolve 指向不存在的 `v1_2_zhTW` 檔（CROSS-R-1）——**任何忠實實作 Boot Contract 的 agent 第一步就 BLOCKED**。這不是理論風險，是現狀。
2. **Validator 不可能實作**：epistemic labels、risk_tier、status codes 各有多套 vocabulary——任何一個 enum validator 都必須先選邊，而選邊=未經批准的架構決策（violates NO SILENT POLICY BYPASS）。
3. **雙維護已被實證失敗**：v1 尚未實作任何程式碼，重複定義的機制就已有 7 組漂移。30 年尺度下這是最高複利的債。
4. **仲裁機制不可用**：Scoped Authority 是全系統的衝突終審，但它自己有兩套版本＋anchor 檔名指向不存在的檔（CROSS-T-2）——用壞掉的法庭審理其他案件。
5. **結構化工具會誤切**：4 處 stray H1 ＋ 1 處未閉合 code fence（MP L365）會讓任何以 heading/fence 解析的 Section Registry / TOC / retrieval pipeline 誤分段——而 EC 正要求建這種 index-based retrieval。

## 8. Technical Debt（不阻塞、但要在 Phase 2 一併清）

Markdown fence 未閉合（MP L365→404）；stray H1 ×4（MP L1145、L5116；EC L96；Atlas L4568）；計數錯誤（MP §90 列 22 項自稱 20 份）；EC §1.1 filename 文法無法重生成三個真實檔名（PARTIAL——可解析但 grammar 與實名不合）；Atlas method ID 三套文法並存（`method.association.mind_map` / `root_cause.fishbone` / `method.swot.v1`）；同名異物 `Stress Test`（F19 負載測試）vs `Stress Testing`（F12 情境壓力測試）。

## 9. Questions Requiring Human Decision

完整定義與選項見 [open-questions.yaml](open-questions.yaml)。摘要：

| ID | 決策 | 時機 |
|---|---|---|
| OQ-1 | MP/Atlas 補 identity header？ | Phase 2 前 |
| OQ-2 | **磁碟 v1 = canonical？v2_1/v1_2_zhTW 草稿是否存在他處？** | **立即（Phase 1 前）** |
| OQ-3 | PROJECT_ROOT 映射暫案確認 | Phase 4 前 |
| OQ-4 | Codex 寫入權適配 | Phase 3 前 |
| OQ-5 | baseline commit（已執行）＋是否打 immutable tag | 任意 |
| OQ-6 | 母文件修改流程（branch 替代案） | Phase 2 前 |
| OQ-7 | risk vocabulary 定於一尊（R0–R4 vs low/med/high/critical，或定義映射） | Phase 2（ADR） |
| OQ-8 | epistemic label canonical set（6 vs 11 值；空格 vs SNAKE_CASE） | Phase 2（ADR） |
| OQ-9 | Architecture Constitution = MP 本身或獨立文件 | Phase 2（ADR） |
| OQ-10 | platform-wide gate 的 owner（MP §158 vs Atlas §22 vs EC §68） | Phase 2（ADR） |
| OQ-11 | path trees 哪些 binding 哪些 advisory | Phase 2（ADR） |

## 10. 方法誠實聲明（limitations）

- Verifier 為對抗式（預設 finding 為錯），實際產出 6 條 PARTIAL（框架過度延伸被抓）、3 條 LINE_MISMATCH（行號修正）、多條 finding 內部計數錯誤被糾正——**驗證是真做的，不是橡皮圖章**；但 0 REFUTED 仍偏順向，Codex cross-review 是下一道獨立防線。
- Workflow 第一版有 finding-ID 碰撞 bug（`DOC-` 前綴取檔名前 12 字元，三檔相同），造成 merge 時 verdict 錯接；已從 per-verifier journal 重建正確 mapping 並在 register 中改用 `DOC-<doc_key>-<n>` 消歧（本檔 §「產出方法」的 71 條數字以重建後為準）。
- 本報告與全部 registers 為 **Claude 單模型產出**。依 directive §V，Codex 將以無污染 prompt（只給文件路徑＋中性問題集）獨立分析後建 CONVERGENCE_MATRIX；在此之前，本報告任何結論的上限是「Claude 單方主張」。

## 11. Phase 0 Exit Gate 自檢

11 項輸出全數存在（本資料夾）；矛盾 71 條全數「登錄未修」；Questions Requiring Human Decision 已列。**Phase 0：COMPLETE。**
下一步（依 [Program Plan](../../../AI_LEGO_OS_Program_Plan_v1.md) §4）：Claude 獨立 review 寫檔 → Codex 無污染獨立分析 → CONVERGENCE_MATRIX → Phase 1 gap analysis。**OQ-2 建議在 cross-review 前由操作者回答。**
