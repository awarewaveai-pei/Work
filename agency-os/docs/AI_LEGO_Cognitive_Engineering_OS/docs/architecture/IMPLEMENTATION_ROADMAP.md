# IMPLEMENTATION_ROADMAP
Status: PROPOSED
Date: 2026-08-29
Author: Claude（統籌彙整全部 Phase 0-2 產出，未新增未經其他文件論證的排程決策）

## 0. 定位

本文件是 Phase 2 exit gate 第 15 項（最終）交付物，把已產出的 14 份文件（3 份 Phase 0/1/CrossReview 摘要 + 6 份 ADR + 9 份 Round 2 架構計畫，含本文件自己彙整的 `PROPOSED_ARCHITECTURE_CHANGES.md`）串成一條總時間軸。**本文件不做新決策，只做排序**——所有時程都是既有文件已標註的依賴關係的直接推導，任何時間單位（週/月）皆為 Claude 估計，非承諾。

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

## 2. STOP-FOR-HUMAN-REVIEW：操作者需要決定的 4 類事項

| 類別 | 具體項目 | 對應文件 |
|---|---|---|
| **A. 是否批准 6 份 ADR** | 可整批、可分批、可部分駁回；ADR-004 的 P-014（risk_tier 觸發範圍語意擴大）建議獨立審閱 | `docs/adr/ADR-001~006*.md`、`PROPOSED_ARCHITECTURE_CHANGES.md` §3 |
| **B. 是否要求 Codex 對特定 ADR 做對抗式覆審** | ADR-001（治理裁決鏈）與 ADR-002（個資刪除 vs 事件不可變）是 6 份中影響面最大者；`ADR_INDEX.md` 已誠實揭露這兩份尚未經 Codex 驗證 | `docs/adr/ADR_INDEX.md` |
| **C. 4 項 Round 2 待裁決衝突如何排程** | P1-CONFLICT-3/4、P1-DUP-2/5——是否併入下一輪 ADR，或視為低風險直接授權 Phase 3 執行者裁決 | `MACHINE_READABLE_SPEC_PLAN.md` §5 開放問題 MRSP-1~5 |
| **D. Phase 5 MVP 切片方向** | Program Plan §9 明定 Learning/Research/Business 三選一「尚未決定」；`MVP_VERTICAL_SLICE_PLAN.md` 已選定 Research Mode 作為**建議**，但這是 Claude 單方分析，未經 directive 要求的「Claude 與 Codex 各自論證後比較」 | `MVP_VERTICAL_SLICE_PLAN.md`、`AI_LEGO_OS_Program_Plan_v1.md` §9 |

**誠實聲明**：類別 D 是本次 Phase 2 產出中唯一一處可能被誤讀為「已經決定」的項目——`MVP_VERTICAL_SLICE_PLAN.md` 選了 Research Mode 並寫出完整 28 步 walkthrough，但 Program Plan §9 的原始要求是雙模型比較後才選，尚未執行。操作者若要求嚴格遵守原始 directive，這一步在 Phase 3 開始前需要補做 Codex 側的獨立論證。

---

## 3. Phase 3（機讀基礎層）排程 —— 沿用 `MACHINE_READABLE_SPEC_PLAN.md` §3 Build Order

| Wave | 內容 | 前提 | 估計規模 |
|---|---|---|---|
| Wave 0 | 操作者批准 ADR-001/004/005/006 | 本文件 §2 類別 A | 決策動作，非工程 |
| Wave 1 | `epistemic-label` / `risk-tier` / `status-codes` / `manifest`（全系統型別字母表） | Wave 0 | ~4 個 schema |
| Wave 2 ∥ Wave 3 | Wave 2：Tenant/CAS/個資加密（依賴 ADR-002/003）<br>Wave 3：Cognitive Engine 核心（method/primitive/typed-objects，含 Method Selection 兩個全新型別） | Wave 1 | Wave 2 ~8 檔；Wave 3 ~20 檔（含 10 個 typed-object 新設計） |
| Wave 4 | Evidence/Decision/Jurisdiction | Wave 2+3 | ~8 檔 |
| Wave 5 | 其餘 execution/ 契約 + `gate.schema.yaml`（骨架，等 Round 2） | Wave 4 | ~10 檔 |
| Wave 6 | policies/ 代碼化（多數需操作者法遵/技術選型決策，非文件收斂） | Wave 5 | 部分 SKELETON_ONLY |
| Wave 7 | recipes/validated/（DB Migration、Deprecation、Champion/Challenger） | Wave 5 | 3 檔 |
| Wave 8 | tests/ 全目錄（每個 schema 的 golden test）+ analytics（低優先） | Wave 1-7 | 依 Wave 1-7 檔案數等比例 |

**平行化提示**：Wave 2 與 Wave 3 互不依賴，可同時進行（例如 Claude 做 Wave 2，Codex inspect 模式協助 Wave 3 的方法清點交叉核對，最終寫入仍由 Claude 執行，符合 §跨模型 oracle 分工的讀寫分離原則）。

**已知阻塞（不影響其餘 Wave）**：`gate.schema.yaml`／`release-policy.yaml`／`conflict-of-laws-output.schema.yaml`／`workflow/branch.schema.yaml`／`tenant-isolation-controls.schema.yaml` 五個檔案標記 `BLOCKED_PENDING_ROUND2_ADR`，Phase 3 內先建骨架，內容留 placeholder，不阻塞其餘 ~50 個 schema 檔案的建置。

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
| 6 份 ADR 若被 Codex 覆審推翻，Phase 3 已建的 Wave 1 型別需要重新核對 | `ADR_INDEX.md`、`MACHINE_READABLE_SPEC_PLAN.md` MRSP-7 | Phase 3 開工前完成 Codex 覆審（本文件 §2 類別 B），而非邊做邊改 |
| Phase 5 切片方向若與 Research Mode 建議不同，`MVP_VERTICAL_SLICE_PLAN.md` 的 28 步 walkthrough 與 Tier 1 Method Contract 清單需重寫 | `MVP_VERTICAL_SLICE_PLAN.md`、§3 Atlas Method Contract 補齊 | 在本文件 §2 類別 D 決議後，若方向改變，重寫成本已知且侷限在單一文件，不影響 Phase 3 Wave 1-2 已完成的型別基礎 |
| Global/High-risk Gate 清單（CROSS-R-5/7、CROSS-T-11）長期未裁決，會讓 Wave 5-6 兩個檔案永遠卡在骨架狀態 | `MACHINE_READABLE_SPEC_PLAN.md` MRSP-1 | 建議操作者將此列為 Round 2 ADR 第一優先項，避免變成長期未追蹤缺口（同 §已知信任邊界的教訓：偵測到的缺口若無 owner 與期限，會退化成無人管理的技術債） |
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
5. `docs/adr/ADR_INDEX.md` + 6 份 ADR
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

**邊界確認**：本文件僅彙整既有 14 份文件的依賴關係與排程建議，未執行任何母文件修改、未建立任何 `.ai/proposals/` 實體檔案、未自行裁決任何標記為 `BLOCKED_PENDING_ROUND2_ADR` 的項目。§2 類別 D 的誠實揭露（MVP 切片選擇尚未完成 directive 要求的雙模型比較）是本文件唯一主動指出的流程缺口，非隱藏或淡化處理。
