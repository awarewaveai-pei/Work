# MIGRATION_AND_ROLLBACK_STRATEGY
Status: PROPOSED
Date: 2026-08-29
Related: ADR-001~006, Program Plan §6 Phase 2 交付物清單, EC §8/§19/§20/§28-31/§64-65/§112-113, Atlas §24, MP §96/§142

## 0. 範疇與定位

本文件與 `TEST_EVAL_STRATEGY.md` 並列為 Phase 2 交付物之一。本文件**不重新設計**六份 ADR 各自已定案的 migration/rollback，只做兩件事：(1) 從六份 ADR 的實作中歸納出跨案通用的原則；(2) 把原則套用到三份都沒觸及、但已被 EC §112（30-year Replacement Drill）與 Atlas §24（30 年演進策略）點名為必然會發生的三個場景。

全文只執行 Read/Grep（唯讀），未修改三母文件或任何 ADR。

**訂正**：EC §19 實際是 **Rollback-first Rule**（通用回滾原則），DB Migration 的原始序列在 **§28 Database Change Contract**，且已被 ADR-005 修正為 15 步版本（正本移至 EC §28）。

---

## 1. Cross-ADR Common Patterns

逐份重讀六份 ADR 的 Migration/Rollback 段落後，浮現九個重複出現、非個案性的結構：

| # | 模式 | 出現於 |
|---|---|---|
| P1 | **SSOT 抽取，不挑贏家留輸家** — 每個「同一內容被多份文件重複定義」的問題，解法一律是「抽成獨立檔案/schema，其餘全部改指標行」 | ADR-001（新建 Architecture-Constitution-v1.md）、ADR-004（抽出 risk-tier.schema.yaml + epistemic-label.schema.yaml）、ADR-005（DB recipe 正本定於 EC §28，Method ID 正本定於 Atlas §9）、ADR-006（repo 路徑移出母規格） |
| P2 | **Hash-anchored baseline** — 每個提案動筆前，先記錄目標文件當下的 `document-hashes.yaml` SHA-256 | ADR-006 `target_baseline_hash` 欄位；ADR-001/004/005 Rollback 段均明文「git baseline」 |
| P3 | **一提案一 commit，不打包** | ADR-004 步驟 7、ADR-005/ADR-006 一致採用「單一 proposal = 單一 commit」 |
| P4 | **越早做越便宜，成本曲線不是平的** | ADR-001「Phase 3 尚未開始」、ADR-002「無 production 事件資料」、ADR-003「cheapest point in system's 30-year life」、ADR-005「越晚修越貴」 |
| P5 | **存在性與可讀性是正交維度** | ADR-002 的核心不變量——本文件 §4/§6 兩個新場景都直接複用的模式 |
| P6 | **可逆性隨真實資料/租戶/執行紀錄出現而單調遞減** | ADR-003「reverse direction... explicitly NOT safe post-launch」；ADR-002 的 DEK 銷毀同理 |
| P7 | **postcondition 是機器可驗的，不是敘述的** | ADR-002 Verification（對所有已知引用嘗試 decrypt）；ADR-004 步驟 7（grep 舊值歸零）；EC §30 |
| P8 | **語意擴大 ≠ 純改名，需要單獨標註並取得明示同意** | ADR-004 明確標註「risk_tier IN {R3,R4}」是語意變更而非純重命名 |
| P9 | **人類批准的邊界本身就是防線的一部分** | ADR-006 硬性規則：「Claude 只能把 status 從 DRAFT 推進到 HUMAN_REVIEW，永遠不能自己把 status 設為 APPROVED」 |

---

## 2. Universal Migration Principles（遷移十誡）

**誡一：任何規範性內容只能有一處 SSOT，其餘只能是指標。**
> 不變量：兩份文件永遠不會各自維護一份「同一件事」的完整定義；只要發現重複，遷移的第一步永遠是「抽取，不是投票」。
來源：ADR-001/004/005/006。

**誡二：編輯任何母文件前，先記錄該文件當下的 baseline hash。**
> 不變量：Original 永遠可用「hash → git show」精確復原，不依賴任何人「記得」改動前長什麼樣子。
來源：ADR-006 `target_baseline_hash`；`document-hashes.yaml`。

**誡三：一個提案只做一件事，一個 commit 只回應一個提案。**
> 不變量：任何單一改動的回滾半徑，永遠不會意外波及另一個不相關的改動。
來源：ADR-004/005/006。

**誡四：能在真實資料/租戶/執行紀錄出現前完成的遷移，優先現在做。**
> 不變量：遷移成本曲線只會隨「已存在的真實狀態」增加而升高。
來源：ADR-001/002/003/005。

**誡五：區分「這件事發生過」與「這件事現在還能不能被讀取/引用」，只讓後者可逆地翻轉。**
> 不變量：任何「必須撤銷但不能否認歷史發生過」的需求，正確解法都是在可讀性/可執行性層開關，不是竄改事件本身。
來源：ADR-002（crypto-shred）；本文件 §4/§6 兩個新場景直接套用。

**誡六：結構性/命名空間決策必須有明確的「上線前最後一次真實測試」把關。**
> 不變量：可逆性的分界點必須是「被測試主動確認跨過」，不能是「事後才發現已經跨過」。
來源：ADR-003 pre-launch gate。

**誡七：遷移完成的判準是機器可重跑的 postcondition，不是敘述。**
> 不變量：「我改過了」不算完成；「跑一次檢查，回傳預期值」才算完成。
來源：ADR-002 Verification；ADR-004 步驟 7；EC §30。

**誡八：語意擴大或緊縮的變更，必須與純粹重新命名分開標註，各自取得明示同意。**
> 不變量：「順便」擴大判斷範圍是遷移中最容易被忽略、也最需要人類覆核的一種變更。
來源：ADR-004 對 Gate Injection 觸發範圍 R3∪R4 擴大的明確標註。

**誡九：任何前進動作生效前，Rollback/Compensating Plan 必須已經存在並可執行。**
> 不變量：沒有寫下 rollback 或 compensating plan 的變更，本質上等於尚未規劃完成。
來源：EC §19 Rollback-first Rule；六份 ADR 全數依此結構寫成。

**誡十：任何代理都不能把自己的提案推進到「已核准/已套用」狀態。**
> 不變量：把「決定要不要做」與「執行怎麼做」分成兩個不同權限的角色，才能保證每一個已經發生的變更，都曾經有一個活人明確看過並同意。
來源：ADR-006（directive §XV 的絕對句）。

---

## 3. Uncovered Scenario: AI Provider Replacement

呼應 EC §112「Replace AI Provider」演練項與 Atlas §24.2 Champion/Challenger。既有 ADR 均未處理，但 EC §64 Execution Manifest 已經預先埋好需要的欄位（`ai.provider / model_profile / model_identifier / prompt_version`）。

### 3.1 觸發情境
既有 provider 停用 API、大幅漲價、或 outage 頻率超過可接受門檻。

### 3.2 流程（Champion/Challenger，Atlas §24.2 原樣套用）

```
現有 Provider = Champion；新 Provider = Challenger
  ↓ Shadow（Challenger 平行跑，不面向使用者，取樣真實生產任務或既有 Execution Manifest 重放輸入）
  ↓ Eval（依 TEST_EVAL_STRATEGY 定義的量測指標）
  ↓ Compare
  ↓ risk_tier ∈ {R3, R4} 的 Method → 額外要求 Human Specialist Review 取樣人工核對
  ↓ Promote or Reject（附 Atlas §11.33 Reversal Criteria：indicator/condition/action/owner）
```

### 3.3 舊 Execution Manifest 的 Replay 問題

核心答案沿用**誡五**：一次歷史 AI 呼叫「發生過」與「現在能不能重新呼叫同一個供應商」是兩件事，必須拆成兩種不同動作：

- **結構性重播（Structural Replay，預設、永遠可行）**：EC §65 Content-addressed Evidence 已規定重要 evidence 需存 `hash / source / timestamp / producer`——舊 Execution Manifest 的**輸出**本身就是已凍結的歷史事實，重播只需要重建 Workflow IR 的節點順序與決策點，並讀出已存的輸出，完全不需要重新呼叫已停用的舊供應商。
- **重新執行（Re-execution，選擇性、需明示觸發）**：若使用者要求「用現在的模型重新產生一次」，這不是 replay，是一次全新的 execution——必須產生新的 Execution Manifest，新輸出依 ADR-004 provenance schema 標記為新的 `AI_GENERATED` 內容，不得呈現成與歷史原始輸出等價。

**新增規格缺口（建議）**：Execution Manifest schema 的 `ai:` 區塊加一個 `provider_status: active | deprecated | archived` 欄位；EC §113 Deprecation Contract 的 Archive 步驟套用到 provider 退役時，必須明文「Archive 動作只封鎖新呼叫，永不刪除任何歷史 Execution Manifest 或 Evidence 記錄」。

### 3.4 Rollback

Challenger 晉升後若在生產中發現缺陷，且 Champion 尚未被合約終止：rollback = 把路由設定切回 Champion（EC §20 Config Rollback），成本低、可立即執行。若 Champion 已被完全下架：動用 EC §19 的 Compensating Plan 分支——退回到預先協議好的第三供應商，或降級為 A0 Observe。**這條備援路徑必須在決定停用 Champion 之前就先協議好**——這是 MP §142 Global Deployment Admission Control「Required Provider Available?」關卡的既有精神在「既有市場換供應商」情境下的直接延伸。

---

## 4. Uncovered Scenario: New Jurisdiction Onboarding

呼應 MP §142 Global Deployment Admission Control（已存在的九步關卡）、MP §96 Legal Authority Hierarchy、MP FAIL CLOSED 系列硬規則，以及 ADR-003 Tenant schema 的 `home_jurisdiction: JurisdictionPackRef` 欄位。**MP §142 本身就是這個遷移的正確流程，不需要另外發明一套**；本場景要補的是「Pack 還沒建好期間，系統該怎麼表現」這個既有流程沒說清楚的空隙。

### 4.1 觸發情境
業務需要支援一個全新國家。

### 4.2 建立新 Jurisdiction Pack 的流程

1. 依 MP §96：新 Pack 自行定義**專屬於該國法律體系**的 `authority_hierarchy`——**明文禁止**沿用任何其他國家 Pack 的排序當預設。
2. 依 MP §100 Global Privacy Engine 抽象 Rights Model，把該國實際擁有的 Rights 子集（含 Deletion 權——串接 ADR-002 crypto-shred 機制）填入。
3. 走 MP §142 既有九步關卡（Country/Region Request → Jurisdiction Pack Exists? → Legal Freshness Valid? → Data Region Available? → Required Provider Available? → Security Controls Available? → Localization Complete? → Sector Pack Complete? → Human Legal Sign-off? → Enable Market）——這九步**本來就是**新 Jurisdiction 上線的正式流程，本文件不重新設計，只確認它是唯一入口。

### 4.3 FAIL CLOSED 期間系統該如何表現

MP 已有三條硬規則可直接組裝成完整答案：

- 「UNKNOWN LEGAL STATUS IS A VALID SYSTEM STATE」——Pack 尚未通過 §142 admission 前，系統對該國的法律狀態必須明確呈現為 `UNKNOWN`，**不可靜默借用地理上最接近或最相似國家的 Pack 當預設**（這是最需要主動防範的反模式）。
- FAIL CLOSED 條款原文是針對「Method Atlas 載入失敗」，本文件類推適用到「所需 Jurisdiction Pack 不存在」：**任何解析到這個尚未通過 admission 的國家、且風險等級落在 R2 以上的工作，必須 FAIL CLOSED**；只有 R0（純讀取/文件性質）可以照常進行。
- 「HIGH-RISK AMBIGUITY MUST ESCALATE TO A HUMAN SPECIALIST」——FAIL CLOSED 不是終點，必須同時觸發人類法務專家介入。

### 4.4 Rollback

**上線前**：MP §142 本身已內建零成本的失敗路徑——任一 Critical 項失敗即「DO NOT ENABLE」，因為沒有任何 tenant 曾經被允許在此 jurisdiction 下運作，爆炸半徑天生是零（**誡六**的直接體現）。**例外情境**：若因流程繞過而發生「租戶已被暫時性 onboard、但完整 admission 尚未走完」，復原路徑是走 ADR-003 Tenant.status enum 的緊急路徑（`active → suspended → offboarding → deleted`），且必須先完成資料匯出才能進入 deleted 狀態。**上線後的既有 Pack 再驗證**：本質上是同一套 admission 關卡的迷你重放；若某國法規被廢止/取代，走 EC §113 Deprecation Contract，版本化為 `jurisdiction.<country>.v1` → `v2`，**不得就地覆寫**。

---

## 5. Uncovered Scenario: Breaking Method Schema Change

呼應 Atlas §24.1（Method 版本化）、§24.2（Champion/Challenger）、§24.3（Deprecation pipeline），以及 ADR-005 已定案的 Method ID 文法。

### 5.1 觸發情境
某個 Method 的 input schema 需要破壞性變更。

### 5.2 版本共存期的具體規則

1. **絕不就地覆寫**（Atlas §24.1）：新版本永遠是新的 `version` 值（依 ADR-005 grammar，版本是獨立欄位），v1 定義本身完全不動。
2. **Compatibility Matrix 是強制產出**（§24.3）：明確聲明這是向後相容的欄位擴充或真正破壞性變更。
3. **共存期間的路由規則**：v1 與 v2 必須同時可被獨立解析與呼叫；v1 **不因 v2 存在而被下架**。**新的 workflow/execution** 預設路由到 v2；**舊 Execution Manifest 的重播**永遠針對其原本記錄的 version 值重播（即針對 v1），不得「升版重播」——這與 §3.3 AI Provider 場景的「結構性重播 vs 重新執行」是同一個不變量（誡五）的第三個實例。
4. **Usage Scan 是量化步驟，不是估計**：下 Deadline 前，必須實際 grep/query 全部 Execution Manifest 與 Workflow IR 定義中對舊版本的引用次數，產出具體數字。
5. **Deadline 與 Archive**：Usage Scan 若確認零剩餘引用，Deadline 可立即設定；若仍有引用，v1 保持可重播狀態**不設 Deadline**。
6. **Migration Tool**：機械可轉譯的欄位變更需提供轉換工具；無法機械轉譯的破壞性變更需明確標註「無自動遷移路徑，v1 需長期保留供重播」。

### 5.3 Rollback

若 v2 晉升後才發現缺陷：rollback = 把「新工作預設路由」指標改回 v1（Config Rollback），v2 依 §24.3 pipeline 反向走一次。因為 v1 從未被刪除，這個回滾無論經過多久都同樣便宜——這正是「絕不就地覆寫、只走 Deprecation 不走 Delete」這條不變量帶來的直接紅利（呼應**誡一**）。

### 5.4 與 Provenance 的銜接

依 ADR-004 的 provenance schema，任何以 v1 執行的紀錄，其 `epistemic_type`/`authorship_state` 不需改變，但建議 Execution Manifest 需能查出「這筆執行實際用的是哪個 method version」，避免未來稽核者誤以為同名 method 的所有歷史執行都用同一套 input 契約。

---

## 6. Reversibility Classification Table

| 遷移類型 | 分類 | 不可逆分界點 | 緩解措施 | 依據 |
|---|---|---|---|---|
| 母文件純敘事編輯（六份 ADR 現有案例） | **完全可逆** | 無（Phase 3 未開始） | `git revert` | ADR-001/004/005/006 |
| CAS 儲存命名空間選擇 | 上線前可逆／**上線後實質不可逆** | 第一個真實租戶寫入的瞬間 | 上線前跑雙租戶隔離真實測試（誡六） | ADR-003 |
| Crypto-shred DEK 銷毀 | **設計上不可逆**（刻意） | 執行銷毀指令的瞬間 | 銷毀前的 Dependency Check + Dry Run 是唯一防線 | ADR-002 |
| risk_tier / epistemic label enum 遷移 | 定義本身可逆／**下游消費者上線後語意鎖定** | 第一個機器邏輯硬編碼依賴新 enum 值上線 | 保留 Migration crosswalk 表 | ADR-004 |
| DB Migration Recipe 15 步 | 步驟中段可逆／**Contract Old Schema 步驟後不可逆** | 序列中「Contract Old Schema」執行的瞬間 | Dual Write 全程保持到 Contract 前一刻 | ADR-005 |
| AI Provider 歷史輸出 vs 重新呼叫 | 歷史輸出**永久可逆保存**／重新呼叫舊供應商在合約終止後**不可逆** | 舊供應商合約/API 完全下架的瞬間 | Deprecation Archive 步驟禁止刪除 Evidence/Execution Manifest | 本文件 §3，套用誡五 |
| 新 Jurisdiction「Enable Market」翻轉 | 翻轉前**零成本可逆**／翻轉後有真實租戶則**實質不可逆** | 第一個真實租戶產生資料的瞬間 | Admission control 九關卡本身就是上線前測試 | 本文件 §4，套用誡六 |
| Method Schema 版本破壞性變更 | 方法定義本身**永久可逆**（v1 不刪除）／個別執行結果一旦已觸發外部真實決策則**不可逆** | 分界點是外部世界，不在系統內部 | 系統內只能保證定義可查、可重播 | 本文件 §5，套用誡一 |
| Repository 路徑調整 | **完全可逆** | 無（純字串引用） | 逐站點各自一個 commit | ADR-006 |

**分類判準（一般化）**：一項遷移是否可逆，關鍵永遠在於「是否已有真實的、外部不可控的狀態依附其上」，而不在於這項遷移本身的技術複雜度。

---

## 7. Rollback Window by Risk Tier

依 EC §8 R0-R4（ADR-004 建議此五級成為全系統唯一 canonical risk_tier）給出具體天數建議，區分**事後 Rollback Window**（R0-R3）與**事前 Cooling-off Window**（真正不可逆的 R4 動作）——後者的觀察期是在「核准」與「真正執行」之間，這個區分是 EC §31 既有序列（`Approval → Deletion → Verification`）已隱含、但從未被明講成通用規則的設計。

| Risk Tier | EC §8 定義範例 | 窗口類型 | 建議最短天數 | 理由 |
|---|---|---|---|---|
| **R0** | 搜尋、說明、讀 code | 無需窗口 | 0 | 定義本身無持久副作用 |
| **R1** | isolated code fix、unit test、local refactor | 事後 | 1 天 | 足夠讓 CI 與立即性下游消費者暴露問題 |
| **R2** | 多 module、public API、workflow behavior | 事後 | 7 天 | 涵蓋一次完整週期（含週末流量與週期性 batch job） |
| **R3** | Production、DB migration、Security boundary、Identity/Authorization | 事後 | 一般 14 天／財務類 30 天 | ADR-005 指出 backfill 期間未持續 Dual Write 會遺失資料，Close 過早正是風險來源；財務類需涵蓋至少一次月結週期 |
| **R4**（有 Compensating Plan） | account privilege model 變更、cross-region sovereignty change | 事前 Cooling-off | 至少 30 天預告期 | 呼應 Deprecation Contract 的 Notice 精神 |
| **R4**（無 Compensating Plan） | destructive data operation、cryptographic root key 銷毀 | 事前 Cooling-off | Approval 與執行之間至少 7 天，且需 2 位獨立人類簽核 | EC §31 序列已把 Approval 放在 Deletion 之前；本節把「必須有時間差 + 雙人簽核」講成明文規則 |

**與六份 ADR 的交叉檢查**：ADR-002 的 DEK 銷毀屬於「R4 無 Compensating Plan」列——目前 ADR-002 只寫了 Dependency Check + Dry Run，未明確要求 Approval 與 Deletion 之間的最短天數與雙人簽核，**建議**在 ADR-002 正式被核准套用時補上本節這條「7 天 + 雙簽核」規則。

---

## 8. 尚未涵蓋、留給後續的缺口

- 本文件的 R0-R4 天數建議是工程判斷，未經 Atlas 正式方法驗證，也未做敏感度分析——建議另跑 `/decide` 或一輪 Codex oracle 對抗式覆審。
- §3/§4/§5 三個新場景的具體 metric/門檻留待 `TEST_EVAL_STRATEGY` 文件定案，本文件只定流程骨架與銜接點。
- ADR-004 目前仍為 `Status: PROPOSED`，本文件 §7 直接沿用其 R0-R4 canonical 化的建議；若操作者最終不核准 ADR-004，本文件 §7 的表格需要重新對照兩套詞彙調整。

---

## Evidence

- EC §8 R0-R4：`EC:379-475`；§19 Rollback-first Rule：`EC:853-880`；§20 rollback-plan.yaml：`EC:882-921`；§28 Database Change Contract：`EC:1129-1157`；§29 DB Migration Requirements：`EC:1161-1195`；§30 Data Integrity Contract：`EC:1198-1222`；§31 Data Deletion Contract：`EC:1225-1251`；§64 Execution Manifest：`EC:2123-2181`；§65 Content-addressed Evidence：`EC:2185-2196`；§112 30-year Replacement Drill：`EC:3143-3162`；§113 Deprecation Contract：`EC:3164-3192`
- Atlas §11.33 Reversal Criteria：`Atlas:1980-2003`；§24 30 年演進策略：`Atlas:4251-4290`
- MP §96 Legal Authority Hierarchy：`MP:4093-4118`；§142 Global Deployment Admission Control：`MP:5472-5504`；FAIL CLOSED 系列：`MP:6030-6058`
- `AI_LEGO_OS_Program_Plan_v1.md:114-126`（Phase 2 Exit Gate 15 份交付物清單）
- `.ai/research/phase-0/document-hashes.yaml`（baseline hash 機制實際格式）
- `docs/adr/ADR-001~006` 全文

**邊界確認**：本次任務全程僅執行 Read/Grep/Bash（唯讀），未對三母文件、任何 ADR 檔案或 repo 內任何檔案做修改或寫入。
