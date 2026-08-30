# MVP_VERTICAL_SLICE_PLAN
Status: PROPOSED
Date: 2026-08-29

> Program Plan `AI_LEGO_OS_Program_Plan_v1.md` §9: Phase 5 exit gate = 一條垂直切片證明全鏈 `Source → Ingest → Normalize → Knowledge → Human Contribution → Method Selection → Workflow → AI/Compute → Evidence → Artifact → Human Review → Version → Audit → Replay/Rollback`。本文件是 Phase 2 交付物之一（Claude 論證版）。**Codex 論證版與雙方比較已完成**：`docs/architecture/PHASE_5_MODE_SELECTION_CODEX_COMPARISON.md`（2026-08-30）——Codex 獨立收斂於同一個選擇（Research），directive §9 要求已滿足。**2026-08-30 Mode 選擇本身已由 `docs/adr/ADR-014-phase-5-mode-selection-research.md` 正式批准**——該 ADR 刻意只批准「選 Research」這一個決策點，不豁免下面§範疇邊界所述的 Phase 3/4 完成前提，最終切片實際啟動仍待操作者 Phase 2 STOP-FOR-HUMAN-REVIEW 批准。
>
> **範疇邊界**：本文件為規劃文件，不修改三母文件，不寫 production code，不建 UI/DB schema（Program Plan §10 Phase 0-2 禁令）。實際執行本切片須待 Phase 3、Phase 4 完成、且本文件本身通過操作者 Phase 2 STOP-FOR-HUMAN-REVIEW 批准之後。

---

## 0. 一條更正（R4 聲稱即驗證，先於決策呈現）

任務摘要引用 `P1-GAP-PROD-9` 作為「Business 的 finance domain pack 是空的」這條發現的證據 ID。逐行核對 `phase-1/GAP_REGISTER.yaml:394-401` 後，**該 ID 實際指向另一條無關發現**（Trade/出口管制章節缺具名法規）。這不是本次任務摘要獨有的筆誤——`phase-1/ASSUMPTION_REGISTER.yaml:25-29` 的 `P1-ASSUM-PROD-3` 本身的 `underlies:` 欄位就錯誤指向了 `P1-GAP-PROD-9`——即 Phase 1 交付物自己的交叉引用已經漂移。

真正承載這條發現的正確 ID 是 **`P1-CONFLICT-4`**（`phase-1/CONFLICT_REGISTER.yaml:51-64`，medium severity）："Business Planning Recipe 引用的方法在 Atlas 對應 domain pack 中不存在，違反文件自己的方法解析紅線，理論上現在就該觸發 BLOCKED"。獨立驗證：`grep -i finance` 對 Atlas 全文僅命中一次（`Atlas:3901`，純目錄路徑 `/domain-packs/finance/`，零方法內容）。本文件下方一律引用 `P1-CONFLICT-4`，不再沿用錯誤的 `P1-GAP-PROD-9`；建議另案更正 `ASSUMPTION_REGISTER.yaml:25` 的 `underlies` 欄位（不在本文件邊界內執行，僅記錄待辦）。

`P1-GAP-AI-9`（質性研究編碼方法論兩邊都沒有定義）逐行核對 `phase-1/GAP_REGISTER.yaml:325-332` **屬實**，任務摘要引用正確。

---

## 1. Recipe Selection Matrix

比較方法：**MCDA**（Method Atlas §11.32）+ **Weighted Decision Matrix**（Atlas §12.33），與 ADR-001/002/003/004 採用同一方法家族。**誠實聲明**：Atlas §22.3 規定 MCDA 禁止輸出 Automatic Authority，本表僅供操作者與 Codex 對比判斷之用。

| 維度 | Learning | Research（Qualitative + 輕量 Quantitative） | Business |
|---|---|---|---|
| **Correctness of architecture coverage** | Medium — Human Contribution／Knowledge 扎實，但 AI/Compute 幾乎全是純文字生成，從未觸及 Trusted Compute Engine；Evidence/Claim chain 用不到 | **High** — MP §40 本身就是 SOURCE→EVIDENCE→CLAIM 鏈的示範案例；加一個真實統計量（inter-rater reliability）即可實地觸發 Trusted Compute Contract 而非文字生成假裝計算 | Medium-Low — SWOT/PESTEL/Porter 等 Method 定義完整，但旗艦 Recipe 唯一的「真計算」階段 Financial Assumptions 對應的 finance domain pack 目前是空殼（見 §0） |
| **缺口阻塞程度** | Low — 僅 `P1-GAP-PROD-10`（medium，非阻塞）；另有**本次任務新發現、尚未登記的缺口**：Atlas 全文 grep `Questioning` 零命中，MP §45 自己點名的 5 個方法中至少一個未定義，Phase 1 六個 registers 均未捕捉到 | Medium — `P1-GAP-AI-9`（medium）是切片必須解的**前置缺口**，但範疇明確；`P1-GAP-AI-2`（**high**，Trusted Compute 全文件零 schema）與 `P1-GAP-AI-3`（**high**，研究 Quality Gate 名稱與 EC Global Gates enum 不重疊）**正是本切片刻意要撞見並協助收斂的缺口** | **High** — `P1-CONFLICT-4` 是已登記的 **CONFLICT**，依文件自己的紅線（MP L45）理論上**現在就該觸發 BLOCKED**；要讓 Recipe 真正跑完，必須先在 Atlas 補齊 finance domain pack 內容——這是 Atlas 自己 dev-priority 排序（§25）中明確排在 **Phase 4** 的工作，Phase 5 切片若要用 Business 等於要求 Phase 4 內容提前於 Phase 5 完成 |
| **實作複雜度** | Low — 主要是循序 LLM 文字轉換 + 一個 Concept Map | Medium-High — 需要 diarization/transcription、Evidence Graph、crypto-shred、inter-rater 統計、tenant-scoped CAS 全部串起來；複雜度高，但這正是「驗證架構」該選擇的複雜度來源 | Medium — 步驟數與 Research 相近，但因 Financial Assumptions 卡住，若跳過該步驟則驗證範圍被迫縮水 |
| **能驗證的 ADR 機制數量** | **1 自然 + 3 硬湊**：ADR-004（自然）；ADR-002/003/001 無自然情境 | **4 自然**：ADR-002（訪談逐字稿天然含真實受訪者個資）；ADR-003（多研究機構共用平台是真實情境）；ADR-004（每個 Code/Theme/Claim 都天然需要三軸標記）；ADR-001（BLOCKED 觸發時需要治理鏈裁決） | **2 自然 + 2 硬湊**：ADR-004、ADR-001（自然）；ADR-002/003 需另外編造子情境 |

---

## 2. Decision & Rationale

**建議：選 Research Mode（Qualitative Research 為主幹，疊加一個輕量 Quantitative/Trusted-Compute 步驟）作為 Phase 5 第一條垂直切片。**

理由排序：

1. **Program Plan §9 的選擇準則是「最能驗證 architecture」，不是「風險最低」或「功能最多」**——與 walking skeleton／tracer bullet 慣例一致：先端到端串起系統中風險最高、最容易被低估的整合點，才能在便宜階段暴露架構縫隙。Research 是三個候選中唯一同時自然觸及 Evidence/Claim Provenance、Trusted Compute、crypto-shred、Tenant/CAS、epistemic/authorship 三軸五個機制的選項——Learning 只自然觸及一個，Business 觸及兩個且其中一個當下就會撞上 registered CONFLICT。
2. **Business 排除的理由是結構性的，不是偏好**：`P1-CONFLICT-4` 是**現在就成立**的規則衝突，且 Atlas 自己的開發優先序把 finance domain pack 排在 Phase 4，晚於 Phase 5 本次要驗證的核心鏈路。
3. **Learning 排除的理由是「驗證強度不足」而非「做不到」**：Learning Recipe 完全可執行（缺口最少），但這正是問題所在——它幾乎不強迫系統做除了「LLM 文字轉換」以外的任何事。若選它，Phase 5 出口時只證明了「LLM pipeline + Concept Map 能跑」，架構中最容易出錯、最需要提前驗證的部分完全沒被碰到。這正是「而非功能最多」這句話真正要排除的那種選擇。
4. **Research 撞見的缺口是切片存在的理由之一，不是應迴避的風險**：Phase 5 的目的正是在低成本階段發現「Phase 3 若照本文件現狀直接切 schema 會切錯什麼」。

**Sensitivity 分析**：若操作者或 Codex 認為「實作複雜度」應加重權重，結論會翻向 Learning。本文件明示這個轉折點，供 Codex 論證版與操作者對比時直接參照。

---

## 3. End-to-End Scenario Walkthrough

**情境**：Nordbrook Research Lab（Tenant A，`home_jurisdiction=EU`）進行一項「遠距工作者過勞」質性研究，訪談 3 位真實受訪者（P1/P2/P3，皆簽署知情同意書，同意錄音用於研究、可隨時撤回）。同時，Cascadia People Ops Consultancy（Tenant B）因使用同一份公開發布的標準訪談同意聲明範本，上傳了一段位元組完全相同的音檔片段——用於驗證 Tenant-scoped CAS 不會跨租戶洩漏。研究進行到一半，P2 依 GDPR 提出資料刪除請求。

### Source → Ingest

1. 研究員在 Tenant A 底下建立 Project「Remote-Worker-Burnout-2026」，上傳 P1/P2/P3 三段訪談音檔（MP §78：`Create Project → Upload Sources`）
2. 每個音檔以 Portable Artifact URI 定址：`artifact://tenant/TEN-NORDBROOK/project/PRJ-BURNOUT-01/source/SRC-INT-P1`（MP §59 + ADR-003）
3. 底層儲存寫入 `/objects/TEN-NORDBROOK/sha256/aa/bb/<hash-P1>`；Tenant B 因不同 tenant_id 命名空間，寫入 `/objects/TEN-CASCADIA/sha256/aa/bb/<hash-consent-script>`（即使 hash 相同，路徑不同，ADR-003 Sub-decision(b) Option A）
4. Event Ledger 寫入 `DocumentUploaded`（×4）（MP §57；`event_id` 不得重用，EC §27）

### Normalize → Knowledge

5. `transcribe` capability 執行：`AudioVideo → Transcript`（含 Speaker Diarization）（MP §8.4）
6. Transcript 中偵測到個資欄位（真實姓名、雇主名稱、居住城市）→ 依 MP §61 標記為 Confidential/Restricted
7. 被標記為 Confidential/Restricted 的欄位，寫入 Event payload 前以該 subject 專屬 DEK 加密；DEK 以 Tenant A 的 KEK 包住（ADR-002 Option A）
8. Event 寫入 `TranscriptGenerated`，payload 含 envelope 欄位 `cipher_alg/kek_ref/dek_wrapped/iv/ciphertext/classification_tag`
9. Knowledge Build：建立 Evidence Graph 節點，存入 `/modules/knowledge/{sources,evidence,claims,entities,relations,provenance,graph}/`（MP §13.3）

### Human Contribution → Method Selection

10. 人類研究員（Coder 1）手動閱讀逐字稿，加入 Annotation 標記初步觀察（MP §11）
11. 使用者輸入自然語言目標：「幫我把這三份訪談做主題編碼分析，並檢查兩位編碼者的一致性」（MP §10 Prompt→Plan Compiler）
12. 系統嘗試解析 method_id `research.qualitative_coding.open_axial`：查詢 Atlas，**發現該 method 未定義**（`P1-GAP-AI-9`）→ Execution State Machine 在 `METHODS_RESOLVED` 前置條件失敗，進入 side state `BLOCKED`，訊息 `PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED`（MP §8.5；EC §10；ADR-001 Scoped Authority 鏈決定誰有權核准補齊方法）
13. **前置缺口解決**（見 §4）：操作者／方法設計者補一份最小 Method Contract：`research.qualitative_coding`（open/axial/selective coding + inter-rater reliability 門檻 + saturation 判準），登記進 `/methods/registry/`——示範「BLOCKED 正確觸發 → 走正規補齊流程 → 重新解析成功」而非靜默繞過
14. Method 解析成功後，`execute_method(research.qualitative_coding)` 對逐字稿執行：AI 提出候選 Code（`AI_SUGGESTION`），Coder 1 逐一 Accept/Reject/Edit（MP §11.2）
15. Coder 1 對其中一則直接引用受訪者原話、且與研究問題高度相關的編碼，標記 `LOCKED_FACT`（epistemic_type=SOURCE_FACT, authorship_state=HUMAN_APPROVED, locked=LOCKED_FACT）（MP §11.3；EC §57；ADR-004）

### Workflow → AI/Compute

16. Workflow IR 編譯：`transcribe`（capability）→ `research.qualitative_coding`（method）→ `evidence.triangulation`（method）→ `run_statistics`（capability，計算 inter-rater reliability）（MP §9）
17. 兩位編碼者的編碼結果交給 `run_statistics` capability 計算一致性統計量（如 Cohen's Kappa）——**必須經 Trusted Compute Engine 真正執行，不得由 LLM「口算」後宣稱 CALCULATED_RESULT**（MP §27；EC §39，明文禁止 "LLM mentally calculates → CALCULATED_RESULT"；直接撞見並協助收斂 `P1-GAP-AI-2`）
18. Result Artifact（Kappa 值 + 信賴區間）標記 `epistemic_type=CALCULATED_RESULT, authorship_state=AI_GENERATED`，等待人類確認後可轉 `HUMAN_APPROVED`

### Evidence → Artifact → Human Review

19. 建立 Evidence Matrix：Claim × Evidence 對齊；每個重要句子可追溯 `Sentence → Claim → Evidence → Source → Timestamp`（MP §13.1）
20. 產出 Artifact：研究備忘錄（Theme Summary + Evidence Quotes + Triangulation 結果 + Kappa 統計），依 MP §42 Research Integrity Engine 輸出結構
21. Human Review：研究員審核 AI 建議的 Theme 分群，對其中一項不同意，標記 `Reject`；系統記錄 Diff 而非覆蓋（MP §78；EC §57）
22. Quality Gate 檢查：Research Integrity Gate / Citation Gate / Statistical Gate / Methodology Gate / Authorship Gate 逐項跑過（**此步驟同時暴露並協助收斂 `P1-GAP-AI-3`**——目前這五個 Gate 名稱在 EC §68 Global Gates enum 中不存在，執行時必須先在 Phase 3 補上對應 gate_id 才能真正掛勾）（MP §56）

### Version → Audit → Replay/Rollback

23. 每次 Capability/Method 執行留下 Execution Audit 記錄：`run_id / capability_version / model / model_version / prompt_version / input_hash / output_hash / validation_score / policy_version / knowledge_snapshot`（MP §82）
24. **P2 提出 GDPR 刪除請求（撤回同意）**：走 EC §31 Data Deletion Contract 全流程 `Authorization → Legal Hold Check → Retention Check → Dependency Check → Dry Run → Count/Scope Preview → Approval → Deletion → Verification → Deletion Evidence`（EC §8 R3，含 Privacy 範例）
25. Deletion 執行 = 銷毀 P2 專屬 DEK（**R4** — cryptographic root/key change / irreversible external action，需 Independent Review + Explicit Human Authority），寫一筆 `PersonalDataRedacted{subject_id, redacted_fields[], redacted_at, authorization_ref}` 稽核事件；原始 `TranscriptGenerated` 事件本身不動，只是該欄位永久無法解密（ADR-002 Option A + C）
26. Verification：對所有已知引用該 DEK 的 Event/Claim/Artifact 嘗試 decrypt，全部應失敗並回傳 `REDACTED` sentinel（ADR-002「不變量陳述」：內容可讀性（可撤銷）與事件存在性（不可否認）是正交維度）
27. **Replay 示範**：分別重播至 T0（刪除前）、T1（刪除完成後）、T2（一次 prompt_version 升級後）三個歷史時間點的 Projection。因 DEK 已銷毀，**T0 與 T1 對 P2 個資欄位的解密結果相同（皆為 REDACTED）**——這是 crypto-shred 設計的必然結果，不是 bug：可讀性撤銷不隨「重播到哪個時間點」而改變，只有事件的因果順序與 Claim/Theme 結構本身可以精確重播（**易誤解陷阱，見 §5 說明**）
28. **Rollback 示範**：`research.qualitative_coding` 的 prompt_version 從 v12（新版本，過度合併主題、品質退化）回滾至 v11（Champion）。Execution Manifest 記錄 `prompt_version: 11`，重跑同一輸入，確認輸出與 v11 原始 Golden Dataset 結果一致（MP §69 Rollback；MP §71 Champion/Challenger）

---

## 4. Required Phase-3 Specs

**`/specs/domain/`**：`tenant.schema.yaml`（ADR-003）、`knowledge-canvas.schema.yaml`、`artifact-uri.schema.yaml`

**`/specs/cognitive/`**：`method.schema.yaml` 下新增 `research.qualitative_coding`（open/axial/selective coding + inter-rater reliability 門檻 + saturation 判準，解 `P1-GAP-AI-9`）、`evidence.triangulation`；`recipe.schema.yaml` 具體實例 `research.qualitative.v1`

**`/specs/evidence/`**：`evidence-graph.schema.yaml`（MP §13.3）、`sentence-provenance.schema.yaml`（MP §13.1）

**`/specs/workflow/`**：`workflow-ir.schema.yaml`（MP §9）

**`/specs/execution/`**：`risk-tier.schema.yaml`（ADR-004）、`execution-manifest.schema.yaml`（MP §69 + ADR-001 Architecture Constitution 欄位）、`execution-state-machine.schema.yaml`（EC §10，含 `BLOCKED`／`PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED`——**已建成 2026-08-30**，`PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED` 依 status-codes.schema.yaml 既有裁決作為 METHOD_RESOLUTION_BLOCKED 的 deprecated alias 處理，非另立新碼）、`capability-contract.schema.yaml`（含 `transcribe/run_statistics/execute_method/validate_artifact`）、`audit.schema.yaml`（MP §82——**已建成 2026-08-30**，同時收斂 EC §66 Audit Event 的 who/what/when/where/why 決策敘事型形狀，見該檔 `compilation_decisions`）、`rollback-plan.schema.yaml`、`event-ledger.schema.yaml`（依 ADR-002 擴充加密 envelope 欄位）、`personal-data-redacted-event.schema.yaml`（ADR-002 Option C）

**`/specs/governance/`**：`epistemic-label.schema.yaml`（ADR-004）

**`/specs/security/`**：Key Vault / crypto-shred 生命週期 schema（ADR-002）、CAS path grammar（ADR-003）

**`/policies/ai-execution/`**：Trusted Compute Gate policy（EC §39，解 `P1-GAP-AI-2`）；Research Quality Gate ↔ EC Global Gates enum 對照表（解 `P1-GAP-AI-3`）

**`/policies/privacy/`**：Data Deletion policy（EC §31 + ADR-002 crypto-shred 分支）

**`/methods/registry/` + `/methods/contracts/`**：`research.qualitative_coding` Method Contract（正式登記）；Inter-rater reliability 統計方法契約

**非 schema 前置依賴**：`Architecture-Constitution-v1.md`（ADR-001）必須先存在並被 Execution Manifest 引用，否則上述 schema 彼此衝突時無單一 SSOT 可仲裁。

---

## 5. Acceptance Criteria

切片視為「證明了架構」須同時通過以下六項；任一項僅能用文字描述通過視為未達標，須有可重放的具體證據。

1. **Replay 到任意歷史狀態**：T0/T1/T2 三個時間點分別重播 Projection，證明：(a) 事件因果順序與 Claim/Theme 結構在三個時間點完全一致；(b) P2 個資欄位在 T0 與 T1 的解密結果**相同**（皆為 `REDACTED`）——**這是唯一正確答案，不是「T0 應顯示原文」**；若實作出的系統在 T0 顯示明文，代表 crypto-shred 設計被誤實作成「有時間範圍的軟刪除」，違反 ADR-002 的不變量陳述，判定不合格。
2. **Rollback**：`prompt_version` 從 v12 回滾至 v11 後，對同一輸入重跑，輸出與 v11 原始 Golden/Regression Dataset 逐字或逐 Kappa 值一致；Execution Manifest 正確記錄 `prompt_version: 11`。
3. **Human Lock Fact 不被 AI 覆寫**：對已標記 `LOCKED_FACT` 的編碼，觸發一次模型/prompt 升級後的重新分析；驗證該筆記錄在新 Projection 中內容不變，AI 的替代建議以獨立 `AI_SUGGESTION` 呈現而非覆蓋原值。
4. **Tenant-scoped CAS 隔離**：Tenant A 與 Tenant B 上傳位元組相同內容，驗證產生兩個不同儲存路徑，且任一方刪除自己的物件時，對另一方命名空間零讀取。
5. **Evidence 鏈可逆向追溯**：任取最終 Artifact 中一句話，成功逆向追溯 `Sentence → Claim → Evidence → Source → 逐字稿時間戳`，落地到原始音檔的精確秒數。
6. **BLOCKED 閘門正確觸發與復原**：驗證系統在 method 未定義時確實進入 `BLOCKED` 而非靜默以 LLM 常識代打；補齊 Method Contract 後重新解析成功並繼續執行——證明「Method 不得從 Master Plan 敘事即興」這條紅線在執行期真正可判定。

---

## 6. Risks

1. **前置缺口需要先動 Method Atlas 內容**：`P1-GAP-AI-9` 的補齊本質上是在 Atlas 新增內容，需走 Program Plan §6 母文件修改協議；若操作者認為 Atlas 內容新增都必須等到 Atlas 自己的 Phase 4 才能做，本切片 Step 12-13 需要改為縮小版驗收，需操作者明確裁決。
2. **ADR-001~004 目前皆為 `Status: PROPOSED`**：本文件的機制引用全部假設這四份 ADR 最終被採納。若操作者選擇不同 Option，本文件對應段落需要重寫。
3. **`P1-CONFLICT-1~4` 與本文件引用的四份 ADR 均只經過單一 lens agent / 單模型驗證**，尚未 Codex 交叉驗證。建議在操作者批准本切片前，至少對 ADR-002 與 ADR-003 安排一輪 `codex-oracle.ps1 -Mode review`。
4. **Trusted Compute 步驟選用 Cohen's Kappa 屬本文件自行選定的具體統計量**，具體公式與門檻仍須在 Phase 3 Method Contract 中正式釘死，本文件不代為決定。
5. **本文件的 Decision Matrix 使用 MCDA，依 Atlas 高風險決策應再補一輪 Evidence Matrix + Red Team**——本文件範疇是「切片選型」而非「治理裁決」，風險層級低於 ADR-001~004，未強制加做，但若操作者認為 Recipe 選型本身即屬高風險決策，建議比照 ADR-001 補一輪對抗式覆審。
6. **`ASSUMPTION_REGISTER.yaml:25` 內部交叉引用錯誤尚未修正**，本文件僅記錄不代為修改；建議另開一個 Low-risk 文件修正任務處理。

---

**邊界確認**：本次任務全程僅執行 Read/Grep/Bash（唯讀）與內部交叉核對，未對三母文件、ADR 檔案或任何 Phase 0/1 registers 做任何修改。所有機制引用附 file:line；一個既有 ID 錯誤（任務摘要與 `ASSUMPTION_REGISTER.yaml` 共同承襲的 `P1-GAP-PROD-9` 誤植）已在 §0 更正並附獨立驗證證據。
