# Architecture-Constitution-v1

Document ID: `ai-lego.architecture-constitution` | Major: 1 | Status: DRAFT（本文件本身已可被讀取與引用；使其成為母文件正式必讀項目的 EC §3.1/§4 編輯，以及 MP §0.0.2/§90、EC §2/§2.1 改為指標行的編輯，走 `docs/adr/ADR-006-mother-doc-revision-flow-and-repo-layout.md` 定義的 `.ai/proposals/` 流程，尚待操作者核准，見 `.ai/proposals/001-architecture-constitution-ec-registration/PROPOSAL.md` 等對應提案）

> 本文件由 `docs/adr/ADR-001-scoped-authority-precedence-unification.md`（ACCEPTED 2026-08-29）Recommendation Option A 建立，內容為該 ADR 逐條指定的 3 個區塊，逐字/逐概念轉錄自 Global Master Plan、Execution Contract 現有內容，不新增未經 ADR 批准的規範。本文件刻意極小（≈1 頁），僅承載「裁決鏈本身」與「極少數必須跨文件生效的硬規則」，不承載具體產品/方法內容——那些仍分別屬於 Master Plan 與 Method Atlas 的權責範圍（見下方 §2）。

---

## 1. Scoped Authority 裁決鏈（唯一版本）

不得用單一「哪份文件永遠優先」粗暴處理所有衝突。任何規格/決策/建議之間的優先序，依下列鏈條由上至下決定：

```
1. Applicable Law / Regulatory Hard Constraint
        ↓
2. Architecture Constitution（本文件）/ Security / Privacy / Safety Hard Policy
        ↓
3. Approved Machine-readable Contract / Schema
        ↓
4. Accepted ADR
        ↓
5. Scoped Normative Document
     ├─ Architecture / Platform Scope   → Master Plan 為權威
     └─ Cognitive Method / Tool Scope   → Method Atlas 為權威
        ↓
6. Recipe / Runbook
        ↓
7. Example
        ↓
8. Ad-hoc Suggestion
```

**衝突處理規則**：
- 同一層級、同一 Scope 內若仍有兩份規格互相衝突：`CONFLICT_REQUIRES_HUMAN_REVIEW`。
- 跨 Scope（第 5 層 Architecture/Platform vs. Cognitive Method/Tool）仍無法消解：同樣 `CONFLICT_REQUIRES_HUMAN_REVIEW`。
- AI **不得**自行選擇對自己最方便的一條規則或文件版本。

**來源與整併說明**：本鏈條合併 Master Plan §0.0.2（原 6 層，Architecture Constitution 原本與 Hard Policy 同層但只是文字提及、無實體檔案）與 Execution Contract §2.1（原 8 層，未提及 Architecture Constitution，且與 Master Plan 各自獨立維護、曾有語意漂移風險）。第 5 層保留 Master Plan 版本較具體的「Architecture/Platform → Master Plan；Cognitive Method/Tool → Method Atlas」路由邏輯（Execution Contract 原版只寫泛稱「Scoped Normative Document」，資訊量較少，此處不捨棄更具體的版本）；第 6-8 層保留 Execution Contract 版本較細的三段拆分（Master Plan 原版將此三者合併為一段，資訊量較少）。此為「兩版本取聯集後去重」，非二選一。

---

## 2. 文件職責與授權表（唯一版本）

| 文件 | Authoritative Scope | 不負責 |
|---|---|---|
| **Master Plan** | Product / Architecture / Domain / Platform / Security / Data / Global / Deployment / Governance | 完整 Method Catalog 與 Method semantics；AI 執行生命週期細節；AI Authority / Tool Use / Change Control 細節 |
| **Method Atlas** | Cognitive Primitive / Method / Lens / Method Selection / Method Contract / Method-specific Gate / Cognitive Recipe | 整個平台的總體部署與產品主架構 |
| **Execution Contract** | AI 執行生命週期；AI Authority / Tool Use / Change Control（與已批准 machine policy 共同權威） | Product / Domain / Platform 主架構；Cognitive Method / Lens 語意 |
| **Machine-readable Specs**（`specs/` / `policies/` / `methods/` / `recipes/`） | Schema / Contract / Enum / Validation / Runtime compatibility | 敘事性產品願景 |
| **ADR**（`docs/adr/`） | 已批准之具體架構決策 | 通用方法論 |
| **Architecture Constitution**（本文件） | Scoped Authority 裁決鏈本身 + 跨文件必須生效的硬規則（如下方 §3） | 具體產品/方法內容——本文件僅承載仲裁機制與極少數不可違反的硬規則，不重複定義任何其他文件已定義的內容 |

**整併說明**：合併 Master Plan §0.0.1（原表未列出 Execution Contract 這一列，是 `CROSS-R-13` 發現的直接成因）與 Execution Contract §2（原表以 Scope 為列而非以文件為列，格式不同但內容可對應）。Execution Contract 原自佔的「AI 執行生命週期」「AI Authority / Tool Use / Change Control」兩項 Scope，正式收編為 Execution Contract 專屬的 Authoritative Scope 欄位內容，解決 Execution Contract 過去在文件職責表中「有權責、無登記」的落差。

---

## 3. 跨文件硬政策

### 3.1 No Legal Hallucination Rule

（原文位於 Master Plan §135，明文標註「寫入 Architecture Constitution」，逐字轉錄，不改寫）

```
AI MUST NOT INVENT LAW.
AI MUST NOT PRESENT GUIDANCE AS BINDING LAW.
AI MUST NOT PRESENT A PROPOSED LAW AS EFFECTIVE LAW.
AI MUST NOT OMIT THE JURISDICTION OR EFFECTIVE DATE
WHEN THEY MATERIALLY AFFECT THE ANSWER.
```

此規則適用範圍不限於任何單一文件或模組——任何輸出涉及法律敘述之處，無論產生自 Master Plan、Method Atlas、Execution Contract、或任何 Recipe/Runbook 執行結果，皆受本條約束。

---

## 4. 本文件的生效範圍與邊界

- **本文件現在就存在、內容極小、獨立於 Master Plan / Execution Contract 之外**——不是 Master Plan 的別名，也不是待補完的佔位文件；未來新增內容需另開 ADR，不得直接編輯本文件擴充其範圍。
- **本文件本身不是三份既有母文件之一的替代品**——它是新增的第 4 份必讀文件，Master Plan / Method Atlas / Execution Contract 三者的既有權責分工（見 §2）不因本文件存在而改變，只是原本各自重複維護、彼此可能漂移的裁決鏈與文件職責表，收斂到這一份單一正本。
- **本文件生效的前提**：Execution Contract §3.1（Required Document Resolution）與 §4（Document Registry）需新增對應項目，將本文件納入「一律必讀」清單；Master Plan §0.0.2/§90 item 1 與 Execution Contract §2/§2.1 需改為指向本文件的指標行，不再各自重複維護裁決鏈全文。這些是對既有母文件的實際編輯，依 `docs/adr/ADR-006-mother-doc-revision-flow-and-repo-layout.md` 規定的 `.ai/proposals/` 流程，須操作者本人核准 `status: APPROVED` 後才能套用——Claude 建立本文件本身不代表這些編輯已經生效，見本文件檔頭 Status 行。
- **回退標準**：若本文件的存在造成任何裁決鏈解讀出現新的歧義（例如兩個層級的邊界劃分在實務中證明不清楚），依 `ADR-001` Reversal Criteria 處理——優先修正本文件內容而非回退到「三份文件各自維護一份裁決鏈」的舊狀態，因為舊狀態本身就是 `CROSS-R-13`/`CROSS-T-9` 兩個發現的根因。

---

**Evidence**：`docs/adr/ADR-001-scoped-authority-precedence-unification.md`（全文，Recommendation Option A、Migration、Reversal Criteria 段）；`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`（§0.0.1 L51-58、§0.0.2 L60-84、§90 L3781-3800、§135 L5285-5295）；`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md`（§2 L90-110、§2.1 L111-137、§3.1 L169-185、§4 L218-253）。
