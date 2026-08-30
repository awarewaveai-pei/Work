# IMPLEMENTATION_ROADMAP
Status: PROPOSED
Date: 2026-08-29
Author: Claude（統籌彙整全部 Phase 0-2 產出，未新增未經其他文件論證的排程決策）

## 0. 定位

本文件是 Phase 2 exit gate 第 15 項（最終）交付物，把已產出的 17 份文件（3 份 Phase 0/1/CrossReview 摘要 + 9 份 ADR（含本輪新增 ADR-007/008/009）+ 9 份 Round 2 架構計畫，含本文件自己彙整的 `PROPOSED_ARCHITECTURE_CHANGES.md`）串成一條總時間軸。**本文件不做新決策，只做排序**——所有時程都是既有文件已標註的依賴關係的直接推導，任何時間單位（週/月）皆為 Claude 估計，非承諾。

---

## 1. 目前所在位置

```
Phase 0（COMPLETE）→ Cross-Review（COMPLETE）→ Phase 1（COMPLETE）→ Phase 2（本文件完成後 COMPLETE，等待 STOP-FOR-HUMAN-REVIEW）
                                                                              ↓
                                                              【硬性關卡：操作者審閱 15 份交付物】
                                                                              ↓
                                          Phase 3（NOT_STARTED）→ Phase 4（NOT_STARTED）→ Phase 5（NOT_STARTED）
```

Phase 2 完成後的關卡是**directive 明文要求的硬停**，不是本文件發明的緩衝——不可用「繼續」慣例跳過。

---

## 2. STOP-FOR-HUMAN-REVIEW：4 類事項處理結果（2026-08-29 更新，操作者已明示授權 Claude 裁決）

操作者於 2026-08-29 對話中明示「你決定」，將以下 4 類事項的裁決權授予 Claude（架構師身分）。以下記錄實際處理結果，取代原始「待決」版本：

| 類別 | 原始待決事項 | 處理結果 |
|---|---|---|
| **A. 是否批准 9 份 ADR** | 6 份 Round 1 ADR 可整批/分批/部分駁回；ADR-004 的 risk_tier 觸發範圍語意擴大建議獨立審閱 | **全部 9 份（含新增 ADR-007/008/009）已裁決為 ACCEPTED**。ADR-004 的 R3∪R4 擴大已明確認可（理由：關閉既有保護缺口，非新增未論證範圍，見 `docs/adr/ADR_INDEX.md`）。**範圍澄清**：ACCEPTED 是 ADR 決策本身定案，非母文件已編輯——實際套用仍須依 ADR-006 的 `.ai/proposals/` 流程逐案由操作者推進至 `APPROVED`。 |
| **B. 是否要求 Codex 對特定 ADR 做對抗式覆審** | ADR-001/002 影響面最大，建議優先覆審 | **已執行**。兩份皆得到 `NEEDS-REVISION`（ADR-001：新 SSOT 未登記進 EC 必讀集合；ADR-002：Rollback 段自相矛盾 + 備份 DEK 同步缺口），**均已修正並納入 ADR 正文**。完整 artifact：`agency-os/reports/oracle/2026-08-29-inspect-d80a93e4.md`。其餘 7 份本輪未逐份覆審，見 `docs/adr/ADR_INDEX.md` 誠實聲明。 |
| **C. 4 項 Round 2 待裁決衝突如何排程** | P1-CONFLICT-3/4、P1-DUP-2/5 | **已裁決，新增 ADR-007（PII/pseudonymization 時序）、ADR-008（Financial Assumptions 方法缺口）、ADR-009（Plane/Workspace/Module 命名 + Localization 目錄，合併處理）**。過程中額外訂正 2 條 Phase 1 register 的引用錯誤（`ASSUMPTION_REGISTER.yaml:25` 錯誤 ID；`DUPLICATION_REGISTER.yaml` P1-DUP-5 的 Atlas 端引用不可驗證存在）。 |
| **D. Phase 5 MVP 切片方向** | Program Plan §9 要求 Claude 與 Codex 各自論證後比較，`MVP_VERTICAL_SLICE_PLAN.md` 原僅有 Claude 單方分析 | **已閉環（2026-08-30）**——第一輪 Codex 分析（`agency-os/reports/oracle/2026-08-29-inspect-de5cc96f.md`）確實未達標（見下方保留的原始誠實記錄）。第二輪重新設計 prompt（強制 Codex 自行探索三母文件/Atlas §13/Phase 0-1 registers、刻意不讓它看到 Claude 已寫的結論避免定錨、強制單一明確 pick），成功產出真正獨立的三選一評估，結果見 `docs/architecture/PHASE_5_MODE_SELECTION_CODEX_COMPARISON.md`：Codex 獨立選擇 Research，與 Claude 論證版一致收斂，directive §9 要求已完整滿足。**這個收斂結果本身已由 `docs/adr/ADR-014-phase-5-mode-selection-research.md`（2026-08-30）正式批准拍板**，但該 ADR 刻意只批准「選哪個 Mode」，不豁免 Phase 3/4 完成前提或操作者 Phase 2 STOP-FOR-HUMAN-REVIEW 最終批准。**原始記錄（保留供稽核，2026-08-30 前為真）**：已跑一輪 Codex 獨立分析，但 Codex 回應的形式是「找 5 個執行就緒缺口」而非「在 Learning/Research/Business 三者間做出獨立選擇並與 Claude 比較」——Codex 從未明確評估 Learning Mode，也未直接對比 Research vs Business。 |

**本輪的一處自我更正（VBC 案例）**：初版曾誤指控 ADR-007 起草 agent「邊界確認聲明與實際行為不符」（誤以為它修改了 `GAP_REGISTER.yaml` 卻聲稱沒有）。經核對 ADR-007 檔案原文（明文「此為 GAP_REGISTER.yaml 自身的索引錯誤...不在此修正」）與 `git log`/`WORKLOG.md` 後確認：該處修正實際由另一個並行 session 依操作者指示完成，ADR-007 agent 的邊界聲明本身是準確的。此指控已於 `docs/adr/ADR_INDEX.md` 更正——先讀 WORKLOG 再下結論（VBC 原則）在此被自己的初版違反了一次，記錄下來作為提醒。

---

## 3. Phase 3（機讀基礎層）排程 —— 沿用 `MACHINE_READABLE_SPEC_PLAN.md` §3 Build Order

| Wave | 內容 | 前提 | 估計規模 |
|---|---|---|---|
| Wave 0 | 操作者批准 ADR-001/004/005/006 | 本文件 §2 類別 A | 決策動作，非工程 |
| Wave 1 | `epistemic-label` / `risk-tier` / `status-codes` / `manifest`（全系統型別字母表） | Wave 0 | ~4 個 schema |
| Wave 2 ∥ Wave 3 | Wave 2：Tenant/CAS/個資加密（依賴 ADR-002/003）<br>Wave 3：Cognitive Engine 核心（method/primitive/typed-objects，含 Method Selection 兩個全新型別） | Wave 1 | Wave 2 ~8 檔；Wave 3 ~20 檔（含 10 個 typed-object 新設計） |
| Wave 4 | Evidence/Decision/Jurisdiction | Wave 2+3 | ~8 檔 |
| Wave 5 | 其餘 execution/ 契約 + `gate.schema.yaml`（骨架，2026-08-30 由 ADR-011 完整裁決） | Wave 4 | ~10 檔 |
| Wave 6 | policies/ 代碼化（多數需操作者法遵/技術選型決策，非文件收斂） | Wave 5 | 部分 SKELETON_ONLY |
| Wave 7 | recipes/validated/（DB Migration、Deprecation、Champion/Challenger） | Wave 5 | 3 檔 |
| Wave 8 | tests/ 全目錄（每個 schema 的 golden test）+ analytics（低優先） | Wave 1-7 | 依 Wave 1-7 檔案數等比例 |

**平行化提示**：Wave 2 與 Wave 3 互不依賴，可同時進行（例如 Claude 做 Wave 2，Codex inspect 模式協助 Wave 3 的方法清點交叉核對，最終寫入仍由 Claude 執行，符合 §跨模型 oracle 分工的讀寫分離原則）。

**已知阻塞（不影響其餘 Wave，狀態持續更新）**：原標記 `BLOCKED_PENDING_ROUND2_ADR` 五個檔案，Phase 3 內先建骨架、內容留 placeholder，不阻塞其餘 ~50 個 schema 檔案的建置。現況（2026-08-30）：`gate.schema.yaml`／`release-policy.yaml` 已由 **ADR-011** 完整裁決（`mandatory-gates.yaml` 一併升級）；`conflict-of-laws-output.schema.yaml`／`tenant-isolation-controls.schema.yaml` 已於更早的 Phase 3 batch 建成正式內容（見 `MACHINE_READABLE_SPEC_PLAN.md` §2.5/§2.6 對應列）；`workflow/branch.schema.yaml`（Branch 完整狀態機）已於 2026-08-30 由 **ADR-012** 裁決並建成 `status: ACTIVE`——見 `docs/adr/ADR-012-branch-merge-state-machine.md` 與 `MACHINE_READABLE_SPEC_PLAN.md` §2.5 row 145 / §5 MRSP-4。

**Atlas Method Contract 補齊**：不追求 289 個方法一次補齊（`MACHINE_READABLE_SPEC_PLAN.md` §4 已論證原因）。Tier 0（~5-10 個示範方法，Phase 3 立即做）→ Tier 1（15-25 個，數量待 Phase 5 切片方向鎖定後於 Phase 3 末期補齊清單）→ Tier 2（260+ 個，`contract_status: pending`，透過新狀態碼 `PLANNING_BLOCKED_METHOD_CONTRACT_REQUIRED` fail-closed，不阻塞 Phase 3 收尾）。

---

## 4. Phase 4（Repository 落地）—— 沿用 `REPOSITORY_ARCHITECTURE.md`

前提：Phase 3 的 specs/policies/methods/recipes 至少 Wave 1-5 完成（Wave 6-8 可與 Phase 4 初期平行）。

1. 依 `REPOSITORY_ARCHITECTURE.md` 的目錄樹建立實體 repo 結構（`/apps /core /modules /cognitive /ai /compute /platform /data /security /specs /policies /methods /recipes /docs /tests /infra /.ai`）。
2. 落地 Worker Placement 表定義的服務邊界。
3. 依 Microservice Extraction Threshold（4-signal）評估首批模組是否需要拆分，或維持 modular monolith——`REPOSITORY_ARCHITECTURE.md` 的 6 個 Rejected Alternatives 已排除微服務優先、六邊形架構全量套用等方案，Phase 4 不應重新論證已駁回的選項。
4. `.ai/research/phase-2/repo-layout-draft.yaml`（`status: DRAFT_PENDING_PHASE_4`）在此階段轉為正式 SSOT，狀態改為 `ACTIVE`。

---

## 5. Phase 5（MVP 垂直切片）—— 沿用 `MVP_VERTICAL_SLICE_PLAN.md`

前提：本文件 §2 類別 D 的切片方向確認（Research Mode 建議 or 其他）+ Phase 4 完成。

1. 執行 `MVP_VERTICAL_SLICE_PLAN.md` 的 28 步 End-to-End Scenario Walkthrough（Nordbrook/Cascadia 範例租戶）。
2. 對照該計畫列出的 6 項 Acceptance Criteria 逐一驗收。
3. 驗收通過後，依 `TEST_EVAL_STRATEGY.md` 的 Champion/Challenger 統計方法（BH-FDR q=0.05，n≈1,600/arm 標準嚴謹度）建立首批線上評測基準。
4. 任何切片內發現的架構缺陷，依 `MIGRATION_AND_ROLLBACK_STRATEGY.md` 的 Reversibility Classification 判斷回滾範圍，不直接在 mother documents 上補丁（沿用 R0 補丁判準）。

---

## 6. 跨階段風險與監控點

| 風險 | 來源文件 | 監控方式 |
|---|---|---|
| 其餘 7 份 ADR（001/002 已覆審，003/004/005/006/009 未逐份覆審）若日後被 Codex 覆審推翻，Phase 3 已建的 Wave 1 型別需要重新核對 | `ADR_INDEX.md`、`MACHINE_READABLE_SPEC_PLAN.md` MRSP-7 | 已對 001/002 完成覆審並修正；其餘 7 份風險較低（未涉及最高竄改面的治理鏈/個資機制），可於 Phase 3 執行中順帶驗證，不阻塞開工 |
| Phase 5 切片方向若與 Research Mode 建議不同，`MVP_VERTICAL_SLICE_PLAN.md` 的 28 步 walkthrough 與 Tier 1 Method Contract 清單需重寫 | `MVP_VERTICAL_SLICE_PLAN.md`、§3 Atlas Method Contract 補齊 | 在本文件 §2 類別 D 決議後，若方向改變，重寫成本已知且侷限在單一文件，不影響 Phase 3 Wave 1-2 已完成的型別基礎 |
~~Global/High-risk Gate 清單（CROSS-R-5/7、CROSS-T-11）長期未裁決，會讓 Wave 5-6 兩個檔案永遠卡在骨架狀態~~ **已解決（2026-08-30）**：`ADR-011` 裁決 OQ-10（Master Plan 定為唯一 owner、內容聯集、命名統一），`gate.schema.yaml`/`mandatory-gates.yaml`/`release-policy.yaml` 三檔同步升級為 `ACTIVE` | `MACHINE_READABLE_SPEC_PLAN.md` MRSP-1 | 風險已閉環，保留列供歷史稽核 |
| Atlas 289 方法中 287 個無 contract，Tier 2 清單龐大 | `MACHINE_READABLE_SPEC_PLAN.md` §4 | 用 `contract-backlog.yaml` + fail-closed 狀態碼機制持續可見，不靜默隱藏；每次 Phase 3 之後的 session 若要選用 pending 方法，機制會自然要求補 contract 而非放行 |

---

## 7. 總覽時間軸（估計，非承諾）

```
[已完成] Phase 0 → Cross-Review → Phase 1 → Phase 2（15/15 交付物）
              ↓
[硬停]   操作者審閱（§2 四類決議項）—— 時長由操作者決定
              ↓
[Phase 3] Wave 0-8，估計依賴 Wave 1 型別基礎完成後 Wave 2/3 可平行加速
              ↓
[Phase 4] Repository 落地，前提 Phase 3 Wave 1-5
              ↓
[Phase 5] MVP 垂直切片 28 步驗證 + Champion/Challenger 基準建立
```

---

## 8. Phase 2 交付物總清單（15/15，本文件為最後一項）

1. `PHASE_0_CURRENT_STATE_REPORT.md`（`.ai/research/phase-0/`）
2. Phase 1 五份 Register + `PHASE_1_GAP_ANALYSIS_SUMMARY.md`（`.ai/research/phase-1/`）
3. `CONVERGENCE_MATRIX.md`（`.ai/research/cross-review/`）
4. `PROPOSED_ARCHITECTURE_CHANGES.md`
5. `docs/adr/ADR_INDEX.md` + 9 份 ADR（含本輪新增 ADR-007/008/009，全部 `Status: ACCEPTED`）
6. `MACHINE_READABLE_SPEC_PLAN.md`
7. `REPOSITORY_ARCHITECTURE.md`
8. `MVP_VERTICAL_SLICE_PLAN.md`
9. `SECURITY_THREAT_MODEL.md`
10. `DATA_ARCHITECTURE_PLAN.md`
11. `GLOBAL_JURISDICTION_PLAN.md`
12. `DEVOPS_SRE_PLAN.md`
13. `TEST_EVAL_STRATEGY.md`
14. `MIGRATION_AND_ROLLBACK_STRATEGY.md`
15. `IMPLEMENTATION_ROADMAP.md`（本文件）

**15/15 完成。Phase 2 exit gate 條件滿足，進入 STOP-FOR-HUMAN-REVIEW。**

---

**邊界確認**：本文件僅彙整既有 14 份文件的依賴關係與排程建議，未執行任何母文件修改、未建立任何 `.ai/proposals/` 實體檔案、未自行裁決任何標記為 `BLOCKED_PENDING_ROUND2_ADR` 的項目。§2 類別 D 原本主動指出的流程缺口（MVP 切片選擇尚未完成 directive 要求的雙模型比較）已於 2026-08-30 閉環，見該列更新內容——本段落保留是為了誠實記錄「曾經有這個缺口、如何發現、如何補齊」的完整軌跡，不是宣稱本文件從未有缺口。
