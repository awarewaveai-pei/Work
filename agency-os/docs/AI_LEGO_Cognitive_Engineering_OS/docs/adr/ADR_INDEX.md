# ADR Index — AI LEGO Cognitive Engineering OS

**狀態**：全部 6 份 ADR 為 `PROPOSED`，待操作者於 Phase 2 STOP-FOR-HUMAN-REVIEW gate 逐案批准。任何一份被批准前，三母文件不會被修改（依 ADR-006 的 `.ai/proposals/` 流程執行）。

| # | 標題 | 解決的 findings | 建議方案（一句話） |
|---|---|---|---|
| [ADR-001](ADR-001-scoped-authority-precedence-unification.md) | Scoped Authority 裁決鏈與 Architecture Constitution 身分統一 | CROSS-T-9 / CROSS-R-12 (OQ-9) / CROSS-R-13 | 新建極簡 `Architecture-Constitution-v1.md`（沿用 MP §90 已預留檔名），三母文件的裁決鏈與授權表全部改為指向它 |
| [ADR-002](ADR-002-personal-data-erasure-vs-event-immutability.md) | 個資刪除權 vs 事件不可變架構 | P1-CONFLICT-1 | Crypto-shredding（per-subject DEK）為主機制 + PersonalDataRedacted 事件為稽核輔助層；「事件存在性」與「內容可讀性」拆為正交維度 |
| [ADR-003](ADR-003-tenant-model-and-cas-isolation.md) | Tenant 模型 + CAS 隔離 + Blast-Radius 鏈統一 | P1-CONFLICT-2 / P1-DUP-3 / P1-GAP-SEC-7（部分） | Tenant 列為 Domain Model 第 23 物件（1:N Workspace）；CAS 改 tenant-scoped 命名空間 + narrow 全域例外池；Atlas 七層鏈（含 Branch）定為正本 |
| [ADR-004](ADR-004-risk-tier-and-epistemic-label-canonicalization.md) | risk_tier 與信任標籤詞彙統一 | CROSS-T-3/R-10（risk_tier）、CROSS-T-6/R-9/R-11（epistemic labels）、CDX-7、OQ-7、OQ-8 | risk_tier 全面收斂到 EC 的 R0-R4；信任標籤拆成兩個正交 enum（`epistemic_type` 11 值 + `authorship_state` 6 值），皆抽為獨立 schema |
| [ADR-005](ADR-005-db-migration-recipe-and-method-id-grammar.md) | DB Migration Recipe 與 Method ID 文法統一 | P1-DUP-1（實際五處非三處）、OQ-12、CDX-4 | DB Migration 正本定於 EC §28（15 步，用查證過的業界 expand-contract 順序修正）；Method ID 統一為 Atlas 機讀契約已在用的 bare 形式 `<family>.<name>` |
| [ADR-006](ADR-006-mother-doc-revision-flow-and-repo-layout.md) | 母文件修改流程 + Repo 佈局歸屬 | OQ-6、OQ-11、Codex path-as-architecture 批評 | `.ai/proposals/<NNN>-<slug>/` 流程（非 branch）；repo 具體路徑移出母規格到 Phase-4-owned repo-layout spec，母文件只留敘事級原則 |

## 決策依賴關係

- ADR-001（治理裁決鏈）與 ADR-006（修改流程）是**前置阻塞項**——理論上應先批准，才能依它們定義的流程去套用其餘 4 份 ADR 對母文件的實際編輯。
- ADR-004（risk_tier 擴大 Gate Injection 觸發範圍為 R3∪R4）是**語意變更**而非純重命名，需要操作者格外注意這一點不是文字整理。
- ADR-002、ADR-003、ADR-005 彼此獨立，可任意順序批准與套用。

## 誠實聲明（適用於全部 6 份）

- 全部為 Claude 單模型單輪產出，尚未經 Codex 獨立驗證。ADR-001 的 subagent 已主動指出：Atlas 對「高風險治理決策」建議的正式方法是 Evidence Matrix + Red Team，而非本輪採用的 MCDA——建議操作者在正式核准前，至少對 ADR-001 與 ADR-002（架構影響面最大的兩份）安排一輪 `codex-oracle.ps1 -Mode review` 對抗式覆審。
- 每份 ADR 的 Evidence 段落引用已由起草 agent 自行 Grep/Read 核對；本輪未逐條由第二人（Claude 主 session）重新驗證每一個 file:line，僅對 ADR-006 引用的 `settings.json` deny 規則做了額外人工複核（因該份輸出觸發了 harness 的指令注入格式偵測，經確認為誤報）。
- 全部 ADR 標記 `Status: PROPOSED`，任何一份轉為 `ACCEPTED` 前不得套用到三母文件，依 ADR-006 定義的 `.ai/proposals/` 流程執行，Claude 不得自我批准。
