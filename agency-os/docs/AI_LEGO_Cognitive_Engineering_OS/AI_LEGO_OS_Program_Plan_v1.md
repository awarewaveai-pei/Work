# AI LEGO Cognitive Engineering OS — Program Plan（階段治理計畫）

**Canonical Filename**：`AI_LEGO_OS_Program_Plan_v1.md`
**Document ID**：`ai-lego.program-plan`
**Document Version**：`1.0.0`
**Major Lineage**：`v1`
**文件類型**：Program / Process Governance（**非架構文件**）
**Source Directive**：操作者 2026-08-28 chat directive（archival copy：[.ai/research/phase-0/source-directive-2026-08-28.md](.ai/research/phase-0/source-directive-2026-08-28.md)）

> **Scoped Authority（本文件的邊界）**
> 本文件只治理「研究 → 收斂 → 實作」的**程序**：階段定義、gates、角色分工、路徑映射、狀態追蹤。
> 不定義 product architecture（Master Plan 職權）、不定義 method semantics（Method Atlas 職權）、不重複 execution discipline（Execution Contract 職權）。
> 與三份母文件衝突時本文件**讓位**，狀態輸出 `CONFLICT_REQUIRES_HUMAN_REVIEW`。
> 本文件**不是**第四套架構——它是三母文件收斂工程的排程表。

---

## 0. 三份 Canonical Documents（2026-08-28 snapshot）

位置：`D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\`

| # | Filename | Internal Version | Document ID（宣告） | SHA-256 | Lines / Bytes |
|---|---|---|---|---|---|
| 1 | `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md` | **未宣告**（header 無 version 欄位；filename lineage `v1`） | **未宣告**（暫編 `ai-lego.master-plan`） | `8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10` | 6082 / 87797 |
| 2 | `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md` | `1.0`（`**版本**：1.0`） | **未宣告**（暫編 `ai-lego.method-atlas`） | `a47424f96bf6f88023b9870d4112ab1f607e9b424236693572d6a5558d2804a1` | 4618 / 124214 |
| 3 | `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md` | `1.0.0`（完整 identity header） | `ai-lego.execution-contract` | `2ad2a179944b917fe390119b6340ba9019344d7d15fcc9b77fdda3677937fc1e` | 4185 / 55924 |

已登錄 identity defects（Phase 0 只列不修，見 [open-questions.yaml](.ai/research/phase-0/open-questions.yaml)）：

- Master Plan §0.0.1 表格自稱 `ai_lego_cognitive_engineering_os_global_master_plan_v2_1.md`、引用 Atlas 為 `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1_2_zhTW.md`——**兩個檔名在磁碟上都不存在**（已全機搜尋確認），為 stale self-reference。
- Master Plan 與 Atlas 缺 Execution Contract §1 要求的 identity header（`Document ID + Version + Hash` 才是 identity，filename 不是）。

**Scoped Authority 分工**（正本：Execution Contract §2 + Master Plan §0.0.2；此處僅索引）：

- Master Plan = Product / Domain / Platform / Security / Data / Deployment / Global Jurisdiction / Governance / 30 年工程方向
- Method Atlas = Cognitive Primitive / Method / Lens / Method Selection / Method Contract / Method-specific Gate / Cognitive Recipe
- Execution Contract = AI 執行生命週期 / Authority / Tool Use / Change Control / Handoff Protocol
- 衝突解決順序（EC §2.1）：Law → Security/Privacy Hard Policy → Machine-readable Contract → Accepted ADR → Scoped Normative Document → Recipe/Runbook → Example → Ad-hoc；同層同 scope 衝突 = `CONFLICT_REQUIRES_HUMAN_REVIEW`。

---

## 1. 角色分工

| 角色 | 職責 | 限制 |
|---|---|---|
| **Human（操作者）** | 最終決策者；批准 ADR、母文件修改、High-risk 動作、phase gate 放行 | — |
| **Claude** | Chief Architect / Research Integrator / Technical Program Lead：architecture synthesis、gap analysis、ADR、risk、scope、Codex handoff、final integration；**D:\Work 唯一寫入者** | 不得自我批准高風險修改 |
| **Codex** | Principal Investigator / Independent Reviewer：大量讀檔、跨檔掃描、獨立 review、implementation feasibility、findings | 於 `D:\Work` 為 **read-only**（`scripts/codex-oracle.ps1` 硬寫死 `-s read-only`）；不可推翻 normative architecture；code/文件不符 → 輸出 `ARCHITECTURE_DRIFT` 交 Claude + Human |

**Directive §XIV 的 repo 適配**（source directive 要 Codex 寫 schema / tests / migrations；本 repo 治理 = Claude 唯一寫入者，機械閘只掛在 Claude Code hooks 上）：

- Phase 0–2（純研究）：無衝突——Codex 全程唯讀 review，本來就是其角色。
- Phase 3+（實作）：映射為「Codex 產 patch 建議 → Claude 逐條驗證後寫入」；`D:\tmp` 拋棄式原型 Codex 可全包。已列 **OQ-4** 待操作者確認。

**反 anchoring 協議（directive §V，強制）**：Codex 獨立分析前，prompt 只含①三母文件路徑②中性問題集（角色 × failure-mode 清單）③輸出格式要求。**不含 Claude 的任何結論、發現、傾向**。Claude 的 review 先寫檔但不餵給 Codex；兩份完成後才建 CONVERGENCE_MATRIX。

---

## 2. 路徑映射（Path Convention）

`PROJECT_ROOT` = `D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\`

Source directive 中所有根路徑（`/.ai/`、`/specs/`、`/policies/`、`/methods/`、`/recipes/`、`/docs/`、`/tests/`、`/infra/`、`/apps/` …）一律解讀為 **PROJECT_ROOT 相對路徑**，直到 Phase 4 的 repository decision 決定正式家（獨立 repo 或 monorepo 子樹）後**整批 `git mv` 搬遷保留歷史**。理由：最小爆炸半徑——不污染 `D:\Work` monorepo 根目錄、不與既有 agency-os 治理搶路徑。已列 **OQ-3**。

---

## 3. Phase 0 — 文件完整性與 Current State Reconstruction

**Status：COMPLETE（2026-08-28 開工，2026-08-29 exit gate 通過）** | 禁令：不修矛盾、不寫產品功能、不動三母文件內容。

輸出（`PROJECT_ROOT/.ai/research/phase-0/`）：

| 檔案 | 內容 | 狀態 |
|---|---|---|
| `document-hashes.yaml` | 三文件 SHA-256 / size / mtime snapshot | ✅ DONE |
| `document-inventory.yaml` | filename / declared version / internal version / identity defects | ✅ DONE |
| `document-authority-map.yaml` | Scoped Authority + 衝突階梯（含 file:line 出處） | ✅ DONE |
| `open-questions.yaml` | 需人類裁決的問題（SSOT；本 plan §12 僅摘要） | ✅ DONE（隨研究持續追加） |
| `source-directive-2026-08-28.md` | 操作者 directive archival copy（non-normative evidence） | ✅ DONE |
| `terminology-map.yaml` | 跨文件術語對照（duplicate / conflicting / undefined terms） | ✅ DONE（246 terms） |
| `domain-inventory.yaml` | Master Plan 宣告的全部 Domain | ✅ DONE（42） |
| `architecture-inventory.yaml` | 三文件宣告的全部 architecture 構件 | ✅ DONE（640 headings / 168 components / 64 machine blocks） |
| `method-inventory.yaml` | Atlas 全部 Method / Primitive / Lens 編目 | ✅ DONE（289，Atlas 284 全編目） |
| `policy-inventory.yaml` | 三文件宣告的全部 policy / gate / 紅線 | ✅ DONE（251） |
| `reader-defects-and-references.yaml` + `verified-findings.yaml` | 35 單文件 defects + 36 跨文件 findings，71 條全數對抗式驗證（62 CONFIRMED / 6 PARTIAL / 3 LINE_MISMATCH） | ✅ DONE |
| `PHASE_0_CURRENT_STATE_REPORT.md` | Current State / Known / Unknown / Conflict / Duplication / Gap / Risk / Technical Debt / Questions Requiring Human Decision | ✅ DONE（2026-08-29） |

**Exit Gate**：11 項全 DONE；矛盾全數「列出未修」；報告含 Questions Requiring Human Decision 段。→ **已通過（2026-08-29）**。

---

## 4. Cross-Review 協議（directive §V）

路徑：`PROJECT_ROOT/.ai/research/cross-review/`

1. `CLAUDE_REVIEW.md` — Claude 先獨立分析（寫檔，不餵 Codex）。
2. `CODEX_REVIEW.md` — 經 `scripts/codex-oracle.ps1 -Mode inspect` 以中性 prompt 取得；oracle artifact 自動存 `agency-os/reports/oracle/`（repo ORACLE gate 既有機制），內容納入本檔。三母文件共 ~270KB 超過單次 context 時分文件、分章節多輪跑。
3. `CONVERGENCE_MATRIX.md` — 逐項分類：`AGREE / PARTIAL_AGREEMENT / DISAGREE / UNKNOWN / REQUIRES_EVIDENCE / REQUIRES_HUMAN_DECISION`。**AI consensus ≠ FACT**——兩 AI 同意的項目上限標到 `AGREE`，不得標 `FACT`。

---

## 5. Phase 1 — 三文件 Gap Analysis

**Status：COMPLETE（2026-08-29）** | Entry：Phase 0 exit gate ✅ + Cross-Review 三件套 ✅（2026-08-29）。種子材料：verified-findings.yaml + CONVERGENCE_MATRIX.md。

方法：6 個角色群 lens agent 平行掃描，涵蓋 Program Plan 本節列出的全部 33 個角色 × 30 個 failure modes（完整清單正本在 source directive §VI），每組比對 Phase 0 71 條 findings 排除重複，只回報新發現，每條附 `file:line`。

輸出（`PROJECT_ROOT/.ai/research/phase-1/`）：`GAP_REGISTER.yaml`(51)、`CONFLICT_REGISTER.yaml`(4)、`DUPLICATION_REGISTER.yaml`(5)、`RISK_REGISTER.yaml`(19)、`ASSUMPTION_REGISTER.yaml`(9)、`UNKNOWN_REGISTER.yaml`(10)——合計 98 條，ID 全唯一，9 條抽查引用行號全命中。`PHASE_1_GAP_ANALYSIS_SUMMARY.md` 為總覽入口。

**Exit Gate**：六 registers 完成 + cross-review 三件套完成 → **已通過（2026-08-29）**。**限制**：Claude 單模型單輪產出，尚未 Codex 交叉驗證；4 條 CONFLICT 建議 Phase 2 前補驗證。

---

## 6. Phase 2 — Architecture Convergence

**Status：COMPLETE（15/15 交付物，2026-08-29）→ STOP-FOR-HUMAN-REVIEW 已完成操作者審閱與裁決（2026-08-29 續）** | Entry：Phase 1 exit gate 通過。

**Round 1 產出**：`docs/adr/ADR-001~006`（見 [ADR_INDEX.md](docs/adr/ADR_INDEX.md)），解決 2 條 CONFLICT（全部）、部分 DUPLICATION、OQ-6/7/8/9/11/12。

**Round 2 產出**（`docs/architecture/`）：`MACHINE_READABLE_SPEC_PLAN.md`（Phase 3 Wave 0-8 全建置清單）、`REPOSITORY_ARCHITECTURE.md`、`SECURITY_THREAT_MODEL.md`（STRIDE+LINDDUN）、`DATA_ARCHITECTURE_PLAN.md`、`GLOBAL_JURISDICTION_PLAN.md`、`DEVOPS_SRE_PLAN.md`、`MVP_VERTICAL_SLICE_PLAN.md`、`TEST_EVAL_STRATEGY.md`、`MIGRATION_AND_ROLLBACK_STRATEGY.md`、`PROPOSED_ARCHITECTURE_CHANGES.md`（6 份 ADR → 23 項具體修改提案 P-001~P-023）、`IMPLEMENTATION_ROADMAP.md`（總排程）。

**Round 3 — 操作者授權裁決（2026-08-29 續）**：操作者對 STOP-FOR-HUMAN-REVIEW 的 4 類待決事項明示「你決定」，授權 Claude 行使架構師裁決權。處理結果：① **全部 9 份 ADR（含新增 ADR-007/008/009）裁決為 `ACCEPTED`**（ADR-004 的 risk_tier 觸發範圍擴大 critical→R3∪R4 已明確認可）——**範圍澄清：ACCEPTED 為 ADR 決策定案，非母文件已編輯**，實際套用仍須依 ADR-006 的 `.ai/proposals/` 流程逐案由操作者推進 `APPROVED`；② 對 ADR-001/002（影響面最大）跑 Codex 對抗式覆審，兩份皆 `NEEDS-REVISION`（ADR-001：新 SSOT 未登記進 EC 必讀文件集合；ADR-002：Rollback 段自相矛盾 + 備份 DEK 同步缺口），**均已修正納入 ADR 正文**；③ P1-CONFLICT-3/4、P1-DUP-2/5 四項 Round 2 待裁決衝突全數新增 ADR 裁決（ADR-007/008/009）；④ Phase 5 MVP 切片方向補做一輪 Codex 獨立分析，**但誠實記錄：未真正完成 directive 要求的「三選一雙模型比較」**，Codex 回應形式是找執行缺口而非做選擇，此缺口見 `IMPLEMENTATION_ROADMAP.md` §2 類別 D。過程中額外訂正 2 條 Phase 1 register 引用錯誤。詳見 `docs/adr/ADR_INDEX.md` 與 2026-08-29 WORKLOG。

- 每個重大問題提 `Option A / B / C / Status Quo`，比較維度：Correctness / Security / Privacy / Maintainability / Extensibility / Operability / Performance / Cost / Complexity / Migration / Reversibility / Vendor Lock-in / 30-year survivability。
- Method semantics 一律取自 Method Atlas（ATAM / MCDA / Pre-mortem / Red Team / Threat Modeling / Causal Analysis / Decision Matrix）；Atlas 缺該 method 定義時輸出 `PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED`，不得以模型記憶補。
- ADR：`PROJECT_ROOT/docs/adr/`，一決策一檔。
- **母文件修改協議**（directive §IX）：每項修改先產 `PROPOSED_CHANGE / RATIONALE / SOURCE_DOCUMENT / AFFECTED_SECTIONS / DEPENDENCIES / COMPATIBILITY / MIGRATION / ROLLBACK / EVIDENCE`，保留 Original / Proposed / Reason，僅接受 semantic correction / missing contract / boundary clarification / duplication removal / feasibility / testability / versionability——禁止文風美化。⚠️ directive 要求 branch `docs/architecture-v1-review`，但本 repo **禁建 branch**（settings deny 硬擋）→ 替代提案見 **OQ-6**，等人類裁決後才動母文件。
- 三文件分工不變：敘事 authority 留 Markdown；machine-readable 逐步移至 `/specs/`、`/policies/`、`/methods/`、`/recipes/`。

**Exit Gate = STOP FOR HUMAN REVIEW**：交付 directive §XXVIII 的 15 份文件（CURRENT_STATE_REPORT / THREE_DOCUMENT_GAP_ANALYSIS / CLAUDE_CODEX_CONVERGENCE_MATRIX / PROPOSED_ARCHITECTURE_CHANGES / ADR_INDEX / MACHINE_READABLE_SPEC_PLAN / REPOSITORY_ARCHITECTURE / MVP_VERTICAL_SLICE_PLAN / SECURITY_THREAT_MODEL / DATA_ARCHITECTURE_PLAN / GLOBAL_JURISDICTION_PLAN / DEVOPS_SRE_PLAN / TEST_EVAL_STRATEGY / MIGRATION_AND_ROLLBACK_STRATEGY / IMPLEMENTATION_ROADMAP）+ 3 份新增 ADR（007/008/009）。**操作者已審閱並就 4 類待決事項明示裁決授權（見 Round 3）；Phase 3 開工仍待操作者對本輪最終結果的明確 go-ahead**（尤其類別 D 的 MVP 切片雙模型比較尚未真正閉環，不應被本輪處理默默蓋過）。

---

## 7. Phase 3 — Machine-readable Foundation

**Status：IN_PROGRESS（Wave 0-3 核心完成，2026-08-29）** | Entry：Phase 2 human review 通過，操作者「繼續」+「你決定」授權開工。

**Wave 2-3（核心部分完成）**：24 個新 schema/registry 檔落地（Tenant/CAS/Blast-Radius/個資加密體系 8 檔 + Cognitive Engine 核心 12 檔 + typed-objects 3 節點 + methods registry 2 檔）。明確延後項目（非遺漏，各自附理由）：`workflow/branch.schema.yaml`（BLOCKED，ADR-003 follow-up）、`domain/repository-contract.schema.yaml`（SKELETON_ONLY，待操作者法遵決策）、`domain/capability-contract.schema.yaml`／`cognitive/{method-execution-request,typed-method-result}.schema.yaml`／`execution/method-resolution.schema.yaml`（依賴 Wave 5 尚未建的 task/result schema）、`cognitive/problem-type.schema.yaml`（循環依賴 method-resolution）、`security/tenant-isolation-controls.schema.yaml`（BLOCKED_PENDING_ROUND2_ADR）、typed-objects 鏈其餘 10 個節點（依計畫指示待 Phase 5 切片方向鎖定再補）。過程中修正 1 個真實 bug（ADR-002 檔頭仍寫 PROPOSED 與 ADR_INDEX 登記的 ACCEPTED 不一致）、新增 2 個 open_questions（MRSP-8/9，見 `MACHINE_READABLE_SPEC_PLAN.md` §5）。

建 `PROJECT_ROOT` 下 `/specs/{domain,cognitive,evidence,artifact,workflow,execution,decision,jurisdiction,security,analytics}/`、`/policies/{ai-execution,security,privacy,jurisdiction,provider,release}/`、`/methods/{contracts,registry}/`、`/recipes/validated/`、`/docs/{architecture,adr,runbooks}/`、`/tests/{architecture,contracts,governance}/`。Markdown = human-readable authority；YAML / JSON Schema = machine-executable contract。依 `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md` §3 Wave 0-8 建置序執行。

**Wave 0**：9 份 ADR 全數 ACCEPTED（見 Phase 2 Round 3）。**Wave 1（全系統型別字母表，已完成）**：`specs/governance/epistemic-label.schema.yaml`、`specs/execution/{risk-tier,status-codes,manifest}.schema.yaml` 共 4 檔，全數 YAML 語法驗證通過，逐檔附完整 `source_of_truth_for` file:line 引用與 `verification` 段。過程中 `status-codes.schema.yaml` 額外發現一條 Phase 0/1 皆未捕捉的新衝突（MP §98 vs §134 兩套不相容的法律不確定性狀態詞彙），已登記為 `DUPLICATION_REGISTER.yaml` P1-DUP-6（尚無 ADR 裁決，留待下一輪）。

## 8. Phase 4 — Repository Architecture

**Status：NOT_STARTED**。優先 Modular Monolith Core + Isolated Workers + Stable Ports/Adapters + 有理由才 event-driven；先驗證 bounded contexts 再定目錄；同時裁決 OQ-3（正式 repo 家）。

## 9. Phase 5 — MVP Vertical Slice

**Status：NOT_STARTED**。一條垂直切片證明全鏈：Source → Ingest → Normalize → Knowledge → Human Contribution → Method Selection → Workflow → AI/Compute → Evidence → Artifact → Human Review → Version → Audit → Replay/Rollback。Learning / Research / Business 三選一——選「最能驗證 architecture」而非功能最多，Claude 與 Codex 各自論證後比較。

**已定決策（操作者 2026-08-29）**：部署主機名 = **`cognitive.aware-wave.com`**（獨立一級子網域，不放 app.aware-wave.com；CF Universal cert 涵蓋一級）。**DNS 記錄延後至本 Phase 有 MVP 可 serve 時才建**（避免 dangling DNS / subdomain takeover / Kuma 假紅），屆時寫入 deployment ADR。

---

## 10. 最高工程原則（索引，不重抄）

正本：source directive §II（archival copy）+ Execution Contract 全文。一行版：多角度優先 / 30 年工程紀律 / 零重工 / 完整閉環 / 最小爆炸半徑；UNDERSTAND→EVIDENCE→ROLLBACK→SCOPE→POLICY→METHOD→COMPUTE→VERIFY→OBSERVE→HUMAN AUTHORITY；NO PATCH-FIRST / NO SILENT CHANGE / NO FAKE COMPLETION / NO UNBOUNDED BLAST RADIUS。

**Phase 0–2 期間禁令**（directive §III）：不建 UI / Chat / Agent、不接 provider SDK、不拆 microservices、不決定 Kubernetes、不建正式 DB schema、不寫 production code。

---

## 11. Program Status Tracker

| Phase | 內容 | Status | Gate |
|---|---|---|---|
| 0 | 文件完整性 + Current State | **COMPLETE**（2026-08-29；71 verified findings） | 11 outputs + 報告 ✅ |
| CR | Claude/Codex Cross-Review | **COMPLETE**（2026-08-29；9/9 交集 0 DISAGREE，Codex 補 3 組新證據＋3 個新決策點） | 三件套 + 分類矩陣 ✅ |
| 1 | Gap Analysis | **COMPLETE**（2026-08-29；98 條，含 4 CONFLICT + 5 DUPLICATION） | 6 registers ✅ |
| 2 | Architecture Convergence | **COMPLETE**（2026-08-29；15/15 deliverables + 3 新增 ADR；9 份 ADR 全數 `ACCEPTED`） | 15 deliverables ✅ → HUMAN REVIEW 已審閱裁決 → **等待 Phase 3 明確 go-ahead** |
| 3 | Machine-readable Foundation | **IN_PROGRESS**（Wave 0-1 ✅，2026-08-29；4/約 50+ schema 已建） | specs/policies/tests 樹 + schema 驗證 |
| 4 | Repository Architecture | NOT_STARTED | bounded contexts 驗證 + repo 決策 |
| 5 | MVP Vertical Slice | NOT_STARTED | 全鏈 e2e + replay/rollback 實證 |

---

## 12. Open Questions（摘要；SSOT = `.ai/research/phase-0/open-questions.yaml`）

| ID | 問題 | 需要 |
|---|---|---|
| OQ-1 | Master Plan / Atlas 缺 identity header（違 EC §1 自身規則） | 批准補 header（屬 missing contract 類修正） |
| OQ-2 | Master Plan 內部 stale 引用 `v2_1` / `v1_2_zhTW`——磁碟上 v1 是否即 canonical？是否存在更新版草稿在他處？ | 人類確認 lineage |
| OQ-3 | PROJECT_ROOT 路徑映射暫案 + 未來正式 repo 家 | Phase 4 前確認 |
| OQ-4 | Codex 寫入權：directive §XIV vs repo「Claude 唯一寫入者」 | Phase 3 前裁決（建議維持 Claude 寫入） |
| OQ-5 | 三母文件目前 untracked——是否 commit 進 git 作為 hash-anchored baseline（EC §1 要求 Git tag / content hash 保歷史） | 本次直接 commit（Low risk、可回滾）；tag 待人類 |
| OQ-6 | 母文件修改流程：directive 要 branch，repo 禁 branch | 人類裁決替代案（main + `.ai/proposals/` 三段保留制） |
| OQ-7~11 | Phase 0 verified findings 產生的收斂決策點（risk vocabulary / epistemic labels / Architecture Constitution 身分 / platform gate owner / path 約束力） | Phase 2 ADR；定義見 open-questions.yaml |

---

## 13. 本文件變更管理

Semantic Version；任何修改走 R0（[任務理解]…[驗證計畫] 全套）；phase status 更新屬 Low-risk 例行維護可直接改，其餘段落改動需說明理由。歷史由 git 保存。
