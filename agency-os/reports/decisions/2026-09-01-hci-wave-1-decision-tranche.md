# 決策：HCI Wave 1 的人類決策處理策略

**狀態：** `PARTIALLY APPLIED` — 本文件本身不是批准紀錄；`HD-00=C` 至 `HD-05=A` 的明示人類批准已記錄到 HCI ADR-0009～0011、ADR-0014～0016。其餘 HD 與本文件的 tranche 策略仍非已批准。
**日期：** 2026-09-01
**模式：** architecture_review
**信心值：** 0.70 — Wave 1 先處理的範圍有原始研究包 Section A 的直接支持；個別選項仍需要操作者明確選擇，尤其 HD-01 與 HD-02。
**參與角色：** Topic Analyzer、Research/Context、3×Advocate、Security、DevOps、Cost、Product、Customer Voice、Legal、Compliance、AI/ML、Scalability、Skeptic、Judge、Pre-mortem、Installation Planner、Rollout Planner。

---

## TL;DR（30 秒快讀）

**建議：C2 — 先以「Wave 1 決策 tranche」取得 11 項架構／安全／權利前置的逐項人類批准；其餘 13 項不假裝已解決，而是以具體觸發條件排入後續 Wave。**

**原因：** HCI 尚無 production 資料或 schema；Section A 的 11 項現在決定可避免之後對受限個資、租戶與證據模型做破壞性 retrofit，而 Section B 混有市場、銷售、實作驗證與方法定位，現在全數鎖死反而會製造假精確。

**Pre-mortem 主要風險：** 決策被批准成一份文件，卻沒有把批准綁到 schema、policy、驗證 gate 與 owner；數月後各 Wave 依不同理解實作，造成「有 ADR 但沒有可執行邊界」。

**最重要的切換條件：** 若 Wave 1 尚未開始前，HD-01（平台 Tenant）或 HD-02（Consent 三分語意）無法取得明確批准，停止資料模型／schema freeze，不以 placeholder 冒充裁決。

**首次複審：** 人類批准後 30 天；若未批准，於首次 Wave 1 排程前重新檢視。

## Approval record — 2026-09-01

Operator explicitly approved: `HD-00=C；HD-01=A；HD-02=C。`

| HD | Approval applied to | Implementation-gate status |
|---|---|---|
| HD-00 | `governance/ADR-0011-hci-subject-type-scope.md` | `SPECIFIED — RUNTIME OPEN` — ERD/constraint and non-Person test specifications exist; no executable HCI schema/test suite exists |
| HD-01 | `governance/ADR-0009-tenant-organization-model-reconciliation.md` | `SPECIFIED — RUNTIME OPEN` — adapter mapping/migration and cross-tenant test specifications exist; no executable HCI adapter exists |
| HD-02 | `governance/ADR-0010-consent-entity-scope.md` | `SPECIFIED — RUNTIME OPEN` — three-record policy/model/test specifications exist; jurisdiction-specific legal determination and enforcement remain open |

## Approval record — 2026-09-01 (second tranche)

Operator explicitly approved: `HD-03=A；HD-04=A；HD-05=A。`

| HD | Approval applied to | Implementation-gate status |
|---|---|---|
| HD-03 | `governance/ADR-0014-data-subject-rights-channel.md` | `SKELETON CREATED — REALTEST OPEN` — synthetic DSR schema/events/tests exist; no real-person processing or production readiness claim |
| HD-04 | `governance/ADR-0015-restricted-subject-identity-confirmation.md` | `SKELETON CREATED — REALTEST OPEN` — deterministic/human confirmation gate exists only in the local synthetic schema |
| HD-05 | `governance/ADR-0016-mandatory-tenant-rls.md` | `SKELETON CREATED — REALTEST OPEN` — isolated Postgres RLS/non-owner test runner exists; Docker execution evidence remains required |

HD-06 through HD-23 remain unapproved; literal `<A/B/C>` placeholders are not decisions. The tranche strategy itself remains a recommendation until separately accepted.

---

## 背景

- **現況：** HCI-30 仍是 pre-code 架構基線，尚無真實 HCI tenant 或受限個資；`22_OPEN_HUMAN_DECISIONS.md` 將 42 個 finding 收斂成 HD-00 至 HD-23 共 24 項。
- **團隊與操作：** 單一操作者搭配 AI coding agents；文件明定長期可維護、最小爆炸半徑、證據優先與人類最終決定。
- **硬約束：** 不得在 🔴 DECISION PENDING 未獲明示批准時實作；HCI 的第三方個資、身份比對、公共情報、RLS、資料主體權利與可能的 EU/美國市場均屬高敏感議題。
- **本決策的範圍：** 決定如何處理 24 項 human decisions；不替操作者選任何商業／法律／產品選項，也不修改 HCI 實作或 AI LEGO 三母文件。

## 候選策略與建議

### C2 — Wave 1 決策 tranche（首選）

1. 先完成 Section A 的 HD-00 至 HD-10，每項用 HCI proposal template 提供明確選項、建議、反例、影響與批准欄。
2. 每個批准決策都要有一個對應的 ADR／policy／schema gate，並標記它所解鎖的 Wave 1 交付物。
3. Section B 的 HD-11 至 HD-23 保持 `PLANNED`，但設定不可跳過的觸發條件；其中 HD-19 以 isolation prototype 取代紙上投票。

這是唯一同時保留人類最終權限、阻止高成本 schema retrofit、又不在市場／銷售／方法資料不足時製造不可逆承諾的策略。

### 為何不選其他策略

| 候選 | 不選原因 | 以下情況可改選 |
|---|---|---|
| C1：一次批准全部 24 項 | HD-11 至 HD-23 包含市場、Enterprise 銷售、部署隔離、AI agent access、方法定位與尚未驗證的 Trigger.dev isolation；現在批准會把未知當成結論。 | 操作者已有明確市場、法域、Enterprise 銷售與人員存取政策，且 HD-19 prototype 已通過。 |
| C3：全部延後 | Section A 已明示為 Wave 1 schema freeze 前必決；延後會讓 tenant、consent、權利、identity 與 RLS 以偶然實作方式定型。 | HCI 的 Wave 1 永久不啟動；否則此策略不合格。 |

### 切換條件

- [ ] 在 Wave 1 前，HD-01 或 HD-02 沒有明示人類選擇 → 不得 freeze domain schema。
- [ ] HD-19 isolation prototype 證明既有 Trigger.dev 能符合網路隔離與 DNS-rebind 防護要求 → 可將結果寫入其正式 ADR；否則規劃獨立 runner。
- [ ] 在處理任一 RESTRICTED 第三方資料前，HD-07、HD-08、HD-15 未獲批准，或 HD-03～05 的 runtime gates 未獲實跑 → 不得收集或處理該資料。
- [ ] 擬向 EU-linked、US employment-adjacent 或 Enterprise 客戶銷售前，HD-13、HD-14、HD-20、HD-21 未獲批准 → 停止相應市場聲稱與 onboarding。

## 權衡矩陣

分數 1–10 為本候選組的相對分數；加權總分採用單人團隊、高敏感第三方資料與長期可逆性的情境。

| 維度 | C1：全數現在批准 | C2：Wave 1 tranche | C3：全數延後 | 權重 |
|---|---:|---:|---:|---:|
| 開始 Wave 1 的速度 | 5 | 8 | 10 | 0.10 |
| 決策品質／證據適配 | 6 | 9 | 3 | 0.25 |
| 第三方個資與安全防護 | 7 | 9 | 2 | 0.30 |
| 單人團隊的可執行性 | 3 | 7 | 9 | 0.15 |
| 可逆性與避免假精確 | 4 | 9 | 3 | 0.10 |
| 抵抗已知 blocker 的能力 | 6 | 9 | 2 | 0.10 |
| **加權總分** | **5.55** | **8.60** | **4.20** | **1.00** |

**加權依據：** Section A 涉及資料主體權利、錯誤身份比對、RLS、不可逆 crypto-shred 與多租戶隔離，因此安全／證據權重高於短期速度；單人團隊仍必須避免一次產出 24 個看似完成、實際未落地的 ADR。

## 建議的人類批准包（Wave 1）

下表是供操作者逐項確認的**建議**，不是本文件所作出的決定。每一列批准後，才可在 `HCI_AI_LEGO_Blueprint_v2/governance/ADR_INDEX.md` 登錄對應 ADR 的正式狀態。

| HD | 建議選項／裁決方向 | 必須產生的可驗證 artifact | 不批准時的限制 |
|---|---|---|---|
| HD-00 | **C（已批准 2026-09-01）**：V1 功能 Person-only；Wave 1 ERD 加 nullable `subject_type`/`subject_id` forward-compatible stub，預設 `PERSON`。 | ERD + subject-type constraint。 | 不建 Organization assessment。 |
| HD-01 | **A（已批准 2026-09-01）**：以 AI LEGO ADR-003 Tenant 為平台語意，現有 portal `organizations` 成為 adapter，而非第二個平台 Tenant。 | tenant/organization mapping ADR、migration plan、cross-tenant test。 | 不 freeze tenant schema、不將 `external_tenant_id` 視為已裁決。 |
| HD-02 | **C（已批准 2026-09-01）**：將 tenant authorization、data-subject consent、source terms 分為不同欄位／記錄，不使用裸 `Consent`。 | consent model schema + lawful-basis policy。 | 不聲稱取得資料主體同意。 |
| HD-03 | **A**：建立 `DataSubjectRequest` 及生命週期／evidence versioning lineage，列為 P0。 | request state machine、access/correction/erasure audit tests。 | 不收集 RESTRICTED dossier。 |
| HD-04 | **A**：RESTRICTED subject 僅 deterministic ID match 或明確 human confirmation；LLM confidence 不得單獨確認。 | identity policy、`MATCH_CONFIRMED` gate、negative tests。 | 不將 candidate 升為 confirmed。 |
| HD-05 | **A**：每張 tenant-owned table mandatory RLS，加 CI-blocking cross-tenant read test。 | RLS matrix + integration test。 | 不上線 tenant-owned 資料表。 |
| HD-06 | 採 Reviewer B 建議：Evidence／Claim／Assessment／Decision 完整 bitemporal；其餘採 insert-only，個別擴展須記錄理由。 | ERD table matrix + temporal replay tests。 | 不宣稱「what did we know when」完整可重放。 |
| HD-07 | **A**：crypto-shredding；刪 DEK、保留 tombstoned metadata，並以適用法域 review 驗證。 | key lifecycle schema、deletion test、legal review record。 | 不以 WORM 取代 deletion answer。 |
| HD-08 | 採 Reviewer E 的 deterministic／probabilistic／LLM-assisted／human-only field policy，重用 AI LEGO A0–A4／R0–R4 gates。 | machine-readable policy + enforcement tests。 | LLM 不得自動執行高影響欄位轉換。 |
| HD-09 | 萃取最小、versioned Epistemic／Provenance／Decision-Authority kernel；產品各自 vendor/pin version。 | shared contract + version compatibility test。 | 不建立 live cross-product DB coupling。 |
| HD-10 | **A**：建立獨立 `Case/Engagement` aggregate，與 billing/tenancy `Project` 分離。 | case lifecycle + replay scope test。 | 不以 Person 全歷史作為預設 replay scope。 |

### 延後但不可遺忘的 13 項

| HD | 正確觸發條件 | 下個必要行動 |
|---|---|---|
| HD-11 | 放入任何 RESTRICTED HCI 資料前 | 決定 physical Postgres isolation／compensating control。 |
| HD-12 | field encryption 開始前 | 最小 key rotation／compromise-response runbook。 |
| HD-13 | 發布 BYOK 或 dedicated-DB sales claim 前 | block claim，直到 P1-04 測試完成。 |
| HD-14 | 首張含 data residency 條款的 Enterprise/Group 合約前 | 決定 multi-region trigger 與 honest capability statement。 |
| HD-15 | AI agent 取得 RESTRICTED production access 前 | 明示 agent access model、break-glass 與 audit boundary。 |
| HD-16 | 落地 public-intelligence Claim/Source persistence 前 | 在 tenant-local copy 與 shared record 間做資料刪除設計決策。 |
| HD-17 | 出現 sanctions/export-control relevant subject 前 | 指定 HCI 與 AI LEGO 的 screening ownership，不跨 DB。 |
| HD-18 | Enterprise RESTRICTED export 前 | 加 preventive export control，而非僅事後 alert。 |
| HD-19 | Wave 6 fetch/scan worker 前 | time-boxed isolation prototype；以實測取代推測。 |
| HD-20 | 鎖定 EU-linked 或 US employment-adjacent GTM 前 | jurisdiction/use-case ADR 與產品限制。 |
| HD-21 | 建立 customer DPA 或處理 data-subject request 前 | 逐 processing activity 做 controller/processor determination。 |
| HD-22 | HCI 呼叫 Cognitive OS execution 前 | 在 integration contract 寫 verified subscription metering clause。 |
| HD-23 | 任一 named-third-party assessment 使用人格／行為方法前 | 方法 evidence-grade policy，並將 Ziwei/Bazi 限為 self-only entertainment。 |

## Pre-mortem 分析

**失敗情境（18 個月後）：** 團隊在 Wave 1 初期快速勾選了 11 個批准，但每個批准沒有連結到 schema、policy、測試與實作 owner。第一個 RESTRICTED dossier 上線後，身份確認、RLS 與資料主體請求由不同模組各自解讀；一個 subject request 需要跨三個資料表人工追查，審計發現 ADR 存在但無法證明系統遵守。

**主要原因：** 將「人類批准」錯誤地當作完成，而未把批准轉化為可驗證的 implementation gate 與責任歸屬。

**貢獻因素：**

1. HD-01／HD-02 為方便而以 placeholder 含混處理。
2. Section B 沒有觸發台帳，業務承諾先於控制落地。
3. 單一操作者把 proposal、approval、implementation 與 review 壓在同一輪工作，獨立覆審消失。

**最早預警信號：** 任一 Wave 1 PR／proposal 引用「see ADR」卻沒有關聯 schema、policy 或測試 ID；連續兩項出現即停止 rollout。

**辯論室遺漏的：** 原始研究充分討論每個決策的內容，卻沒有把「批准後誰把它落到 machine-enforced control」設成明確 gate；本決策將此責任寫為 artifact-to-gate mapping。

| 新增風險 | 可能性 | 嚴重性 | 緩解措施 |
|---|---|---|---|
| 批准與可執行控制脫鉤 | medium | high | 每個 ACCEPTED ADR 必須列 implementation artifact、test、owner 與 Wave gate。 |
| 決策疲勞導致批次盲批 | medium | high | 每次人類批准最多 3 項同類決策；HD-01／02／03／04／05 不與低急迫項混批。 |

**對信心值的影響：** 發現可緩解的新執行風險；信心由 0.78 降為 **0.70**。

## 實施與上線計畫

| 階段 | 時長 | 目標與 Go/No-Go |
|---|---:|---|
| P1：建立 traceability matrix | 0.5 天 | 將 HD-00～10 對應到 owner doc、ADR、schema/policy/test、Wave gate。沒有 matrix 不送審。 |
| P2：形成 11 份精簡 proposal | 2–3 天 | 每份以 HCI proposal template 寫選項、影響、rollback、明確批准欄；不建立 accepted status。 |
| P3：人類逐批批准 | 操作者節奏 | 每批最多 3 項；批准值須含 HD ID、選項、日期。未批准即維持 `PLANNED`。 |
| P4：驗證批准可落地 | 1 天／批 | 對每個批准項建立或指定至少一個 schema/policy/test gate；無 gate 則退回 P2。 |
| P5：Wave 1 schema freeze | 只有 P1–P4 全通過後 | HD-00～10 全部有明示決定、artifact mapping 和 review evidence。 |

**刻意省略：** 不在此階段批准 Enterprise GTM、multi-region、personality-method 細節或 fetch worker 技術選型；這些缺少必要的市場／prototype 證據。

**全局 rollback：** 若任一批准被撤回，將其 ADR 設為 `SUPERSEDED` 或 `REJECTED`、回退尚未併入的 proposal；已合入實作則依該 ADR 的 migration/rollback plan，不用本文件取代技術回滾。

## 風險與可觀測性

| 指標／告警 | 閾值 | 行動 |
|---|---|---|
| Wave 1 必決 HD 有明示批准 | 11/11 | 少於 11：停止 schema freeze。 |
| ACCEPTED ADR 有 artifact-to-gate mapping | 100% | 任一缺失：停止該 ADR 所屬 Wave。 |
| cross-tenant negative test | 0 successful unauthorized reads | 任一讀取成功：P0，停止 tenant rollout。 |
| RESTRICTED identity confirmation | 0 LLM-only `MATCH_CONFIRMED` | 任一命中：停止 ingestion，稽核所有當期 subject。 |
| Subject request traceability | 100% 可回溯 evidence/version | 任一無法回溯：停止新 RESTRICTED ingestion。 |

## 決策複審節奏

- **批准後 30 天：** 檢查每個批准是否已有實作 gate；未落地者不得進下一 Wave。
- **批准後 90 天：** 對 HD-11～23 檢查是否有新的觸發條件。
- **每次市場／法域／資料類型變更：** 先重看 HD-13～23，再擴大銷售或處理範圍。

## 給操作者的開放問題

1. **HD-03～05：** 已於 2026-09-01 批准；在 Docker-backed synthetic negative tests 實跑前仍不得關閉 runtime gate。

## ADR 骨架

```text
標題：以 Wave 1 決策 tranche 處理 HCI 的架構與安全前置
日期：2026-09-01
狀態：Proposed

決定：在 Wave 1 schema freeze 前，要求 HD-00～10 的逐項人類批准與 artifact-to-gate mapping；HD-11～23 依明確觸發條件延後。
後果：避免前置 schema retrofit，但增加前期決策與 traceability 工作。
Pre-mortem 主要風險：批准未被轉成可執行控制。
切換條件：HD-01／02 未批准、或 HD-19 prototype 結果與假設相反。
```

## 完整辯論記錄（摘要）

<details>
<summary>展開 19-stage 決策審查摘要</summary>

### Stage 1–5：主題、情境、候選與角色

- **主題：** 架構治理；決定 24 項 HCI human decisions 的處理順序。
- **主要限制：** pre-code、單一操作者、敏感第三方資料、24 項決策已由 9 份獨立 review 收斂。
- **候選：** C1 全數現在批准、C2 Wave 1 tranche、C3 全數延後。
- **專家路由：** Security/Compliance/Legal 因 GDPR/資料主體權利；AI/ML 因 LLM-assisted identity；Customer Voice 因 subject rights；Scalability 因 tenancy/replay；DevOps/Cost/Product 因單人團隊與 Wave 可執行性。

### Stage 6–9：立場、交叉審問與 Skeptic

- **C1 advocate：** 最快消除所有文件 blocker；弱點是把未知市場與 prototype 問題錯當成現可決定的策略。
- **C2 advocate：** 對 Section A 做決策、把 B 的等待條件寫成 gate；弱點是 P2 文件工作增加，但在無實作時成本最低。
- **C3 advocate：** 最少當下決策成本；交叉審問承認它會讓 Section A 的 schema 從實作習慣而非治理選項定型。
- **Security/Compliance/Legal：** HD-03/04/05/07/08 與 HD-20/21 不能隱性延後；未釐清 controller/processor、rights channel 或 LLM-only identity 將造成不可接受責任。
- **DevOps/Cost/Product/Customer Voice：** 單人團隊不適合寫 24 份完整 ADR 再等待採用；受評 subject 是受影響人而非「資料欄位」，需要 rights/identity gate 先行。
- **AI/ML：** HD-04/08 必須成為 machine-enforced policy，模型信心不能替代身份確認；HD-19 需 prototype。
- **Skeptic：** C2 的致命風險不是技術，而是「批准變成文件」；用 artifact-to-gate mapping 與 3 項一批緩解。

### Stage 10–13：矩陣、Judge 與 Pre-mortem

Judge 排名為 **C2 > C1 > C3**。recency bias check：將 C3 置前重估後，C2 仍因 Section A 的高成本延誤與 Section B 的真實未知性勝出。Pre-mortem 新增「批准與可執行控制脫鉤」風險，令信心下修至 0.70。

### Stage 14–19：建議、計畫、風險、可觀測性、複審

對應本文件的「建議的人類批准包」「實施與上線計畫」「風險與可觀測性」「決策複審節奏」。

</details>

## 文件元資料

- **生成者：** AI Decision Intelligence System
- **完成的 Pipeline 階段：** 1–19（針對「處理順序」的架構治理決策）
- **信心值：** 0.70；個別 HD 的批准仍由操作者保留。
- **Pre-mortem 新發現：** 批准與 machine-enforced control 脫鉤。
- **下次複審：** 人類批准後 30 天，或 Wave 1 排程前。
