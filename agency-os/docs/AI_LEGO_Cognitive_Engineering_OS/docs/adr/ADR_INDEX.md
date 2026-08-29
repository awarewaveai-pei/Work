# ADR Index — AI LEGO Cognitive Engineering OS

**狀態（2026-08-30 更新）**：全部 12 份 ADR 狀態為 `ACCEPTED`。ADR-001~009 由操作者明示授權 Claude 行使架構師裁決權（2026-08-29 對話，「你決定」）；ADR-010 的授權路徑略有不同，見該 ADR 檔頭——Sub-decision (a) 原則操作者已明示接納，Sub-decision (b) 的完整命名對照表是本次首次形式化產出，操作者尚未逐條過目；ADR-011 同 ADR-001~009 授權模式（2026-08-30 對話，「繼續！你決定！」）。**這不等於三母文件已被編輯**——`ACCEPTED` 代表架構決策本身定案，實際套用仍須依 ADR-006 定義的 `.ai/proposals/<NNN>-<slug>/PROPOSAL.md` 流程逐項產生提案，該流程的 `status: APPROVED` 依 directive §XV 絕對句規定**只能由操作者本人**推進，Claude 永遠不能自我核准母文件編輯本身。兩個欄位（ADR Status / Proposal Status）是兩條獨立規則，見每份 ADR 檔頭的範圍聲明。

| # | 標題 | 解決的 findings | 建議方案（一句話） | Status |
|---|---|---|---|---|
| [ADR-001](ADR-001-scoped-authority-precedence-unification.md) | Scoped Authority 裁決鏈與 Architecture Constitution 身分統一 | CROSS-T-9 / CROSS-R-12 (OQ-9) / CROSS-R-13 | 新建極簡 `Architecture-Constitution-v1.md`（沿用 MP §90 已預留檔名），三母文件的裁決鏈與授權表全部改為指向它 | ACCEPTED（Codex 覆審 NEEDS-REVISION 已修正：EC §3.1/§4 新增第 4 份必讀文件登記） |
| [ADR-002](ADR-002-personal-data-erasure-vs-event-immutability.md) | 個資刪除權 vs 事件不可變架構 | P1-CONFLICT-1 | Crypto-shredding（per-subject DEK）為主機制 + PersonalDataRedacted 事件為稽核輔助層；「事件存在性」與「內容可讀性」拆為正交維度 | ACCEPTED（Codex 覆審 NEEDS-REVISION 已修正：Rollback 拆分事故/決策兩種情境 + 新增 Key Destruction Record Replay on Restore 強制關卡） |
| [ADR-003](ADR-003-tenant-model-and-cas-isolation.md) | Tenant 模型 + CAS 隔離 + Blast-Radius 鏈統一 | P1-CONFLICT-2 / P1-DUP-3 / P1-GAP-SEC-7（部分） | Tenant 列為 Domain Model 第 23 物件（1:N Workspace）；CAS 改 tenant-scoped 命名空間 + narrow 全域例外池；Atlas 七層鏈（含 Branch）定為正本 | ACCEPTED |
| [ADR-004](ADR-004-risk-tier-and-epistemic-label-canonicalization.md) | risk_tier 與信任標籤詞彙統一 | CROSS-T-3/R-10（risk_tier）、CROSS-T-6/R-9/R-11（epistemic labels）、CDX-7、OQ-7、OQ-8 | risk_tier 全面收斂到 EC 的 R0-R4；信任標籤拆成兩個正交 enum（`epistemic_type` 11 值 + `authorship_state` 6 值），皆抽為獨立 schema | ACCEPTED（含 Gate Injection 觸發範圍擴大 critical→R3∪R4 之明確認可，理由見該 ADR 檔頭） |
| [ADR-005](ADR-005-db-migration-recipe-and-method-id-grammar.md) | DB Migration Recipe 與 Method ID 文法統一 | P1-DUP-1（實際五處非三處）、OQ-12、CDX-4 | DB Migration 正本定於 EC §28（15 步，用查證過的業界 expand-contract 順序修正）；Method ID 統一為 Atlas 機讀契約已在用的 bare 形式 `<family>.<name>` | ACCEPTED |
| [ADR-006](ADR-006-mother-doc-revision-flow-and-repo-layout.md) | 母文件修改流程 + Repo 佈局歸屬 | OQ-6、OQ-11、Codex path-as-architecture 批評 | `.ai/proposals/<NNN>-<slug>/` 流程（非 branch）；repo 具體路徑移出母規格到 Phase-4-owned repo-layout spec，母文件只留敘事級原則 | ACCEPTED（其守門規則本身——Claude 不能自我推進至 APPROVED——不因本次批准而放寬） |
| [ADR-007](ADR-007-pii-redaction-vs-pseudonymization-timing.md) | PII Redaction 現行時效 vs Pseudonymization「未來能力」時序矛盾 | P1-CONFLICT-3 | v1 用 Deterministic Keyed-HMAC Tokenization（重用 ADR-002 Key Vault）；MP §149 依成熟度拆為 `v1_baseline`（Pseudonymization/Tokenization）與 `future_advanced`（其餘 6 項） | ACCEPTED |
| [ADR-008](ADR-008-business-planning-recipe-method-gap.md) | Business Planning Recipe 引用不存在的 Financial Assumptions 方法 | P1-CONFLICT-4 | MP §43 加註現況警語（`PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED` 何時觸發），不現在造 stub、不刪節點——finance domain pack 依 Atlas §25 排在其自身 Phase 4 | ACCEPTED |
| [ADR-009](ADR-009-nomenclature-and-directory-canonicalization.md) | Plane/Workspace/Module 命名分層 + Localization 目錄正本化 | P1-DUP-2、P1-DUP-5 | 三層維持各自正本並補 12×6×22 跨層對照表（非強行合一）；Localization 正本 = `/platform/trust-fabric/localization/`（8 目錄制），與 `REPOSITORY_ARCHITECTURE.md` 一致 | ACCEPTED（過程中發現並訂正 P1-DUP-5 的 Atlas 端引用不可驗證存在，見下方「本輪新增發現」） |
| [ADR-010](ADR-010-database-platform-and-table-naming.md) | DB 主機平台選型 + Table 命名規範 | 操作者提問（非 Phase 1 register 條目）：AI LEGO DB 是否應與 Lobster Factory Supabase 統一 | 獨立 Supabase 專案（同 vendor 不同 instance，不與 Lobster Factory 共用）；23 個 Domain Model 物件依 `REPOSITORY_ARCHITECTURE.md` 既有分組套 7 組前綴命名（`platform_/prov_/control_/trust_/canvas_/core_/data_`） | ACCEPTED（platform-separation 原則為操作者本次對話明示接納；23 物件 table 命名對照表為 Claude 本次首次形式化產出，操作者尚未逐條過目確認，見該 ADR 檔頭範圍聲明） |
| [ADR-011](ADR-011-platform-gate-ownership-and-unification.md) | 平台 Global/High-risk Gate 歸屬 + 內容聯集 + 命名統一 | OQ-10 / CROSS-R-5 / CROSS-R-7 / CROSS-T-11 | Master Plan 依其自身＋EC 自身的 Scoped Authority 表定為唯一 owner；內容為三方聯集（14 Global + 6 High-risk，驗證為子集/超集關係非真衝突）；3 個 CROSS-T-11 命名採 Atlas 版本，EC 3 個名稱降為 deprecated alias | ACCEPTED |
| [ADR-012](ADR-012-branch-merge-state-machine.md) | Branch 完整狀態機（誰能 Merge、衝突處理）| ADR-003 Consequences follow-up (iii)、MRSP-4 | 6 狀態機（ACTIVE/MERGE_REQUESTED/CONFLICT/MERGED/ABANDONED/ROLLED_BACK）；merge 授權門檻 >= A2；R3/R4 額外要求 mandatory-gates.yaml 兩條規則皆 PASS（引用 ADR-011）；衝突一律由 merge_base 過期偵測，只能人工裁決。全系統零母文件先例的首份 ADR，由 5 個既有已裁決機制組合而成 | ACCEPTED |

## 決策依賴關係

- ADR-001（治理裁決鏈）與 ADR-006（修改流程）是**前置阻塞項**——套用其餘 7 份 ADR 對母文件的實際編輯前，須先走 ADR-006 定義的流程。
- ADR-002 的 Key Vault 基礎設施被 ADR-007 直接重用（多開 `hmac_signing_key` 用途），兩者應視為同一批次套用，避免 Key Vault schema 被兩次獨立編輯各自漂移。
- ADR-004（risk_tier 擴大 Gate Injection 觸發範圍為 R3∪R4）是**語意變更**而非純重命名，操作者已於本輪明示授權中一併確認可接受。
- ADR-009 的 Module 層建議依附於 `REPOSITORY_ARCHITECTURE.md`（Phase 2 Round 2 交付物，`Status: PROPOSED`，非 ADR，待 Phase 3/4 執行時自然生效）。
- ADR-010 的 table 命名前綴同樣依附於 `REPOSITORY_ARCHITECTURE.md`（Bounded Context Analysis 分組），與 ADR-009 依賴同一份未 ACCEPTED 文件；ADR-010 的 DB 主機平台選型（Sub-decision a）不依賴它，可獨立生效。
- ADR-011 直接套用 Master Plan §0.0.2 已生效的 Scoped Authority 機制（非新裁決機制），並沿用 ADR-003 sub-decision (c) 的去重方法（detail 只留一處，其餘指向 SSOT）；不依賴任何其他 ADR 才能生效，但其消費者 `gate.schema.yaml`/`mandatory-gates.yaml`/`release-policy.yaml` 已同批次更新（見 WORKLOG 2026-08-30）。
- ADR-012 直接依賴 ADR-011（merge gate 內容引用其 `gate_catalog`）與 ADR-004（R3∪R4 觸發條件）、`authority.schema.yaml`（A0-A4）、`rollback.schema.yaml`（ROLLED_BACK 終態）——這 4 者皆須先存在其套用才有意義，但因全數已 ACCEPTED，ADR-012 可直接套用不需額外等待。
- 其餘 ADR 彼此獨立，可任意順序套用。

## Codex 對抗式覆審（2026-08-29，本輪新增）

依 2026-08-29 操作者明示授權，已對本批 9 份 ADR 中風險最高的兩份（ADR-001、ADR-002）跑 `codex-oracle.ps1 -Mode inspect` 獨立覆審（未餵入 Claude 結論）：

- **ADR-001**：NEEDS-REVISION（CONFIRMED）——新建的 Architecture-Constitution-v1.md 未被登記進 EC §3.1 Required Document Resolution 與 §4 Document Registry 的必讀集合，會造成「新 SSOT 建好但沒人被要求讀」的靜默繞過。**已修正**：ADR-001 新增 EC §3.1 第 8 步 + §4 第 4 個 registry entry。
- **ADR-002**：NEEDS-REVISION（1 CONFIRMED + 1 PLAUSIBLE）——(1) 原始 Rollback 段「停止受理新刪除請求」與 Decision Driver #2（DSAR 不得失效）直接矛盾；(2) Key Vault 備援副本的 DEK 若未與 live 端同步銷毀，災復還原後會製造假刪除復活。**已修正**：Rollback 拆分為「營運事故」（不得拒收 DSAR，改佇列+SEV 升級）與「架構決策推翻」（Expand-Contract 式過渡）兩種情境；新增 Key Destruction Record Replay on Restore 強制關卡，並與 `DEVOPS_SRE_PLAN.md` 的 WORM 35 天窗口交叉確認風險視窗。

完整 artifact：`agency-os/reports/oracle/2026-08-29-inspect-d80a93e4.md`。ADR-003~009 本輪未逐份跑 Codex 覆審（見下方誠實聲明）。

另跑一輪 Codex 獨立分析 Phase 5 MVP 切片選擇（`agency-os/reports/oracle/2026-08-29-inspect-de5cc96f.md`）——**未產出與 Research Mode 競爭的替代選擇**，改以「找 5 個 CONFIRMED 執行就緒缺口」的形式回應，其中 3 項（Gate 契約不可機讀、Method Selection 不可執行、Jurisdiction Pack 未定義）已在 `MACHINE_READABLE_SPEC_PLAN.md` 標記 `BLOCKED_PENDING_ROUND2_ADR`/`SKELETON_ONLY`，非本次新發現；1 項（Business Mode 自我阻塞）與 ADR-008 結論一致；1 項（P1-ASSUM-PROD-3 錯誤 ID）已於本輪修正（見下方）。**誠實記錄**：這不構成 directive §9 要求的「Claude 與 Codex 各自對三選一做出獨立選擇後比較」——Codex 從未明確評估 Learning Mode，也未對 Research vs Business 給出直接對比判斷，僅重新確認了已知的執行缺口與 Business Mode 的不可行性。詳見 `IMPLEMENTATION_ROADMAP.md` §2 類別 D 的完整揭露，此缺口尚未閉環。

## 本輪新增發現（2026-08-29，ADR-007/008/009 起草過程中）

- **ASSUMPTION_REGISTER.yaml:25 已訂正**：`P1-ASSUM-PROD-3` 的 `underlies` 欄位原誤植 `P1-GAP-PROD-9`（無關的 Trade finding），正確為 `P1-CONFLICT-4`——由 `MVP_VERTICAL_SLICE_PLAN.md` 與 Codex 獨立覆審雙重確認後修正。
- **DUPLICATION_REGISTER.yaml P1-DUP-5 已加註**：Atlas 端引用（「§122 Localization Architecture，行 4918」）經 ADR-009 逐字查證**不可驗證存在**（Atlas 全文僅 4618 行，章節僅到 §30）。MP 端引用不受影響。ADR-009 改用獨立工程理由裁決正本，不依賴此引用。
- **GAP_REGISTER.yaml:264 已訂正**：`duplication_candidates` 原誤指向 `DUPLICATION_REGISTER.yaml P1-DUP-4`（實際內容為因果推論方法重複，與 PII 無關），已改為正確指向 `CONFLICT_REGISTER.yaml P1-CONFLICT-3`。**修正歸屬（VBC 自我更正）**：ADR-007 起草 agent 僅**發現並記錄**此錯誤（其檔案 Context 段明文「不在此修正」），實際修正是由另一個並行 session 依操作者指示執行（見 `WORKLOG.md` 對應條目）——本文件初版誤將此修正歸給 ADR-007 agent 並指控其「邊界確認聲明與行為不符」，經核對 ADR-007 檔案原文與 git log 後確認此指控不實，ADR-007 agent 的邊界聲明是準確的，已在此更正，避免對正確行事的 agent 留下錯誤的負面記錄。

## 誠實聲明（適用於全部 12 份，ADR-010/011/012 另有補充見其檔頭）

- ADR-003/005/006（Round 1）與 ADR-009（Round 2.5）本輪**未**逐份安排 Codex 對抗式覆審——僅 ADR-001/002 因起草 agent 主動標記「架構影響面最大」而優先安排。操作者若要求對其餘 6 份也補一輪覆審，可比照 ADR-001/002 的模式逐份執行。
- 每份 ADR 的 Evidence 段落引用已由起草 agent 自行 Grep/Read 核對；ADR-009 的過程本身即證明「起草 agent 自我核對」不是萬無一失的防線（它抓到了 Phase 1 register 自己的引用錯誤），但也證明這套「每份 ADR 自帶查證」的設計確實會抓到問題，不是流於形式。
- 全部 12 份 ADR 標記 `Status: ACCEPTED`，但依上方範圍聲明，任何一份轉為母文件實際編輯前，仍須先產生 `.ai/proposals/` 提案並由操作者推進至 `APPROVED`，Claude 不得自我批准該步驟。ADR-010/011/012 未經 Codex 覆審（ADR-010 為純基礎設施/命名決策，ADR-011 為純治理歸屬/內容聯集決策，ADR-012 為純架構設計決策——三者皆非治理裁決鏈或個資機制核心，但依 AGENTS.md §跨模型 oracle 排程，本次任務結束後會對本 session 全部程式/schema 改動跑一次 `/codex-review`，涵蓋 ADR-011/012 消費者 `gate.schema.yaml`/`mandatory-gates.yaml`/`release-policy.yaml`/`specs/workflow/branch.schema.yaml` 的實際編輯，見 WORKLOG 2026-08-30）。
