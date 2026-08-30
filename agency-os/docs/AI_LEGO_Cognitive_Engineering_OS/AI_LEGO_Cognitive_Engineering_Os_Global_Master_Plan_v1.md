# AI LEGO Cognitive Engineering OS
## 30 年級 Human–AI 多專業、多利害關係人、研究、商業、學習與決策作業系統
### Global Master Architecture / Product / Engineering / Security / Research / Analytics / Legal / Compliance / Governance Plan

> **定位一句話**  
> 建立一套以人類為最終決策者、AI 為可替換能力引擎、證據為真實核心、計算為可重現依據、工作流為可組裝 LEGO、所有成果皆可追溯、可驗證、可回滾、可離線、可上雲、可持續演化 30 年的「認知工程作業系統」。

---

# 0.0 AI 必讀文件與規範邊界（Mandatory Companion Document）

> **MANDATORY AI INSTRUCTION — 不可略過**
>
> 本 Master Plan 定義 **產品、Domain、Architecture、Security、Data、Deployment、Global Jurisdiction、Governance 與 30 年工程原則**。
>
> 本文件 **不再重複完整定義 Cognitive Methods / Brainstorming Tools / Reasoning Methods / Decision Methods 的語意、選擇規則、限制與 Method-specific Quality Gates**。
>
> 任何涉及下列事項的 AI 任務，在規劃或執行前 **MUST FIRST READ**：
>
> `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md`
>
> 適用事項包括但不限於：
>
> - Brainstorming / Ideation
> - Problem Framing / Decomposition
> - Root Cause / Failure Analysis
> - Customer / Human Insight
> - Stakeholder / Negotiation
> - Strategy / Market Analysis
> - Systems Thinking
> - Assumption / Evidence / Epistemic Quality
> - Causal / Research Reasoning
> - Red Team / Challenge / Risk
> - Foresight / Unknown Unknowns
> - Feasibility / Economics
> - Experiment / Validation
> - Prioritization / Decision
> - Learning / Reversal
> - Architecture / DevOps / SRE / Security / Privacy / DB / Data / PM 方法
> - Global Jurisdiction / Compliance / Localization 方法
> - Representation / Cognitive Preference / Collaboration
>
> **禁止只根據本 Master Plan 裡的簡略例子推定 Method 的完整行為。**
>
> 若 Atlas 無法讀取、版本未知、內容不完整，且任務需要 Cognitive Method Selection，狀態必須為：
>
> `PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED`
>
> 不得自行補齊、猜測或以模型記憶取代 Atlas。

## 0.0.1 文件職責分離

| 文件 | Authoritative Scope | 不負責 |
|---|---|---|
| `ai_lego_cognitive_engineering_os_global_master_plan_v2_1.md` | Product / Architecture / Domain / Platform / Security / Data / Global / Deployment / Governance | 完整 Method Catalog 與 Method semantics |
| `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1_2_zhTW.md` | Cognitive Primitive / Method / Lens / Method Selection / Method Contract / Method-specific Gate / Cognitive Recipe | 整個平台的總體部署與產品主架構 |
| Machine-readable Specs | Schema / Contract / Enum / Validation / Runtime compatibility | 敘事性產品願景 |
| ADR | 已批准之具體架構決策 | 通用方法論 |

## 0.0.2 Scoped Authority / 衝突處理

Scoped Authority 裁決鏈的唯一正本見 `Architecture-Constitution-v1.md` §1，禁止在本文件重複定義。

## 0.0.3 Execution Manifest 必須記錄 Atlas 版本

任何使用 Cognitive Method 的 Execution 必須保存：

```yaml
cognitive_method_atlas:
  file: AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md
  declared_version: 1.0
  content_hash: <sha256>
  loaded: true
```

預期結果：

- 30 年後可重播當時使用的 Method semantics。
- Atlas 升級不會偷偷改變舊 Workflow。
- AI 不會因 Context 遺漏而自行簡化方法。
- Master Plan 與 Method Atlas 不會雙重維護同一份工具定義。

---

# 0. 文件目的

本文件整合整個產品與工程願景，涵蓋：

- AI LEGO 模組化工作流
- 研究論文
- 企劃書
- 商業策略
- Brainstorming
- 上課筆記
- 語音／影片／圖片／PDF／Word／PPT／Excel 等多模態資料
- 多專家、多博士、多產業、多政府、多地方、多利害關係人視角
- 高階數據分析、統計、ML、因果、模擬、最佳化
- Human-in-the-loop 與人類原創想法
- Authorship / Research Integrity
- Online / Offline / Hybrid
- Local AI / Cloud AI / BYOAI
- 安全、權限、資料治理、供應鏈安全
- 可維護、可測試、可重播、可驗證、可回滾
- 商業模式與授權
- 30 年工程紀律
- 全球 Jurisdiction / Legal / Regulatory / Compliance
- 國家／跨國區域／州省／縣市／地方／特殊行政區／原住民族或其他依法成立之管轄層級
- 全球資料保護、AI 法規、跨境資料、數據主權
- 產業法規、政府採購、貿易／制裁／出口管制、稅務、消保、勞動、智慧財產
- Localization / Accessibility / Language / Currency / Timezone / Units
- 法規版本、有效日期、官方來源、衝突法、法律不確定性與人工法律覆核
- 完整部署、資料、程式與規格路徑
- 每個關鍵模組的預期結果與驗證標準

---

# 1. 最高工程準則

所有設計、開發、上線、變更、部署與產品決策都必須通過以下五項準則。

## 1.1 多角度優先

任何重要決策都不得只從單一角度評估，至少檢查：

- 功能正確性
- 產品價值
- 使用者體驗
- 可維護性
- 可擴充性
- 安全性
- 隱私
- 法規
- 成本
- 延遲
- 可測試性
- 可驗證性
- 可觀測性
- 可回滾性
- 資料可攜性
- Vendor Lock-in
- 長期技術債
- 地域差異
- 文化差異
- 政策差異
- 執行可行性
- 潛在失敗情境

## 1.2 30 年工程紀律

不得假設以下任何項目永久存在：

- OpenAI
- Anthropic
- Google
- AWS
- Azure
- GCP
- 任一 Vector DB
- 任一 Workflow Engine
- 任一 UI Framework
- 任一 LLM
- 任一資料庫
- 任一 SaaS
- 任一 Prompt 格式

設計原則：

```text
MODEL IS DISPOSABLE.
PROMPT IS DISPOSABLE.
AI PROVIDER IS REPLACEABLE.
DATABASE IS REPLACEABLE.
CLOUD IS REPLACEABLE.
UI IS REPLACEABLE.
WORKFLOW ENGINE IS REPLACEABLE.

KNOWLEDGE MUST SURVIVE.
EVIDENCE MUST SURVIVE.
ARTIFACT MUST SURVIVE.
HISTORY MUST SURVIVE.
POLICY MUST REMAIN EXPLICIT.

EVERY DECISION MUST BE TRACEABLE.
EVERY EXECUTION MUST BE REPRODUCIBLE.
EVERY CHANGE MUST BE REVERSIBLE.
EVERY FAILURE MUST BE CONTAINED.
```

## 1.3 零重工原則

一份原始資料只應被高成本理解一次。

例如：

```text
video.mp4
  ↓
Transcription
  ↓
Normalized Transcript
  ↓
Knowledge Chunks
  ↓
Claims / Entities / Evidence
  ↓
Knowledge Graph
```

後續所有成果共用：

- 上課筆記
- 企劃案
- 商業策略
- Brainstorm
- 研究計畫
- 論文
- 簡報
- 數據分析
- 決策

禁止每次重新上傳、重新轉錄、重新解析。

## 1.4 完整閉環

任何重要流程必須具備：

```text
Input
→ Validation
→ Processing
→ Quality Check
→ Human Review
→ Versioning
→ Audit
→ Publish
→ Monitor
→ Learn
→ Rollback
```

## 1.5 最小爆炸半徑

故障只允許影響最小區域。

隔離層級的唯一正本見 Method Atlas §21 最小爆炸半徑（7 層，含 Branch：`Tenant → Workspace → Project → Workflow → Branch → Execution → Capability`），禁止在本文件重複定義以避免節點數漂移（ADR-003 Sub-decision (c)）。機讀正本：`specs/execution/blast-radius-chain.schema.yaml`。

---

# 2. 產品最高定位

## 2.1 正式名稱

**AI LEGO Cognitive Engineering OS**

## 2.2 中文定位

**人類＋AI 多專業、多政府層級、多地方、多產業、多文化的知識、研究、分析、決策與成果生成作業系統。**

## 2.3 核心公式

```text
Human Intelligence
+
AI Intelligence
+
Evidence
+
Computation
+
Collaboration
+
Provenance
+
Governance
=
Trusted Cognitive Output
```

## 2.4 真正核心

本系統不是「AI 寫文章」。

核心流程是：

```text
Think
→ Research
→ Challenge
→ Calculate
→ Simulate
→ Decide
→ Prove
→ Write
```

「寫作」只應是最後輸出階段，而不是整個系統核心。

---

# 3. 產品核心物件

整個 Domain Model 以以下物件為核心：

```text
Workspace
Project
Source
Evidence
Claim
Knowledge
Artifact
Capability
Workflow
Execution
Policy
Identity
Decision
HumanContribution
Annotation
Idea
Dataset
AnalysisPlan
AnalysisRun
Simulation
Experiment
Outcome
Tenant
```

`Tenant 1:N Workspace`：一個 Workspace 恰屬於一個 Tenant，不存在跨 Tenant 共用的 Workspace（ADR-003 Sub-decision (a)）。完整欄位定義見 `specs/domain/tenant.schema.yaml`。

---

# 4. 總體架構

採用多 Plane 架構，而不是單純 Layer。全球法規與在地化不是外掛補丁，而是從第一天納入核心 Control / Trust Fabric。

```text
┌────────────────────────────────────────────────────┐
│                 EXPERIENCE PLANE                   │
│ Chat / Canvas / Studio / Mobile / API / A11y      │
├────────────────────────────────────────────────────┤
│            HUMAN COLLABORATION PLANE               │
│ Ideas / Notes / Comments / Images / Files         │
├────────────────────────────────────────────────────┤
│          STAKEHOLDER INTELLIGENCE PLANE            │
│ Experts / Government / Local / Executors          │
├────────────────────────────────────────────────────┤
│       GLOBAL JURISDICTION & COMPLIANCE PLANE       │
│ Law / Privacy / AI / Trade / Tax / Sector / Local │
├────────────────────────────────────────────────────┤
│                DECISION PLANE                      │
│ Strategy / Scenario / Optimization / Reversal     │
├────────────────────────────────────────────────────┤
│               COMPUTATION PLANE                    │
│ Python / R / SQL / Stats / ML / Causal            │
├────────────────────────────────────────────────────┤
│                COGNITIVE PLANE                     │
│ Agents / Reasoning / Planning / Critique          │
├────────────────────────────────────────────────────┤
│                KNOWLEDGE PLANE                     │
│ Evidence / Claim / Graph / Provenance             │
├────────────────────────────────────────────────────┤
│                 ARTIFACT PLANE                     │
│ Paper / Proposal / Strategy / Notes / PPT         │
├────────────────────────────────────────────────────┤
│                 CONTROL PLANE                      │
│ Workflow / Policy / Identity / Version / Consent  │
├────────────────────────────────────────────────────┤
│                   DATA PLANE                       │
│ SQL / Object / Vector / Graph / Event             │
├────────────────────────────────────────────────────┤
│                 PLATFORM PLANE                     │
│ Security / DevOps / SRE / DR / Sovereignty        │
└────────────────────────────────────────────────────┘

Cross-cutting Trust Fabric：

```text
Identity
+ Jurisdiction
+ Policy
+ Provenance
+ Encryption
+ Audit
+ Legal Source Version
+ Data Classification
+ Human Approval
```

任何 Capability 在執行前都必須先通過 Trust Fabric。

**Plane / Workspace / Module 三層關係**（ADR-009 Sub-decision (a)，2026-08-29 ACCEPTED）：本文件用三個不同抽象層描述同一套系統，三者不是同義詞，不可互相取代：

- **Plane**（本節 §4 為唯一正本，內容不需要改）＝架構／信任邊界宣告層，變動頻率最低，不隨 UI 文案或程式碼重構變動。
- **Workspace**（§77 為唯一正本）＝ Experience Plane 內部對「人類可見功能」的二次分解，是 Plane 的子集（只有 6 個 Plane 有對應 Workspace），不是與 Plane 平行的另一套系統分解。
- **Module**（§80 為 v1 歷史快照；`docs/architecture/REPOSITORY_ARCHITECTURE.md` 的 Proposed Directory Tree 為程式碼層現行目標正本，該文件已於 2026-08-30 由操作者核准 ACCEPTED）＝程式碼 bounded-context 層，變動頻率最高。

---

# 5. 部署模式：Online / Offline / Hybrid

## 5.1 Cloud

適合：

- 一般個人
- 團隊
- 即時協作
- 強大雲端 AI
- 雲端備份
- 大型 GPU 任務

## 5.2 Local / Offline

必須支援完全離線：

- 文件匯入
- 影片轉錄
- 語音辨識
- OCR
- Embedding
- RAG
- Local LLM
- Python / R / SQL
- 統計分析
- ML
- 圖表
- 研究
- 企劃
- Brainstorm
- Word / PDF / PPT 輸出
- 版本控制
- 備份

## 5.3 Hybrid

核心流程：

```text
Private Data
↓
Local Processing
↓
Sanitization
↓
Policy Check
↓
Cloud AI
↓
Local Validation
↓
Artifact
```

## 5.4 原則

> **Local-first, Cloud-enhanced**

沒有 Cloud 時產品仍然完整；Cloud 只是能力加速器。

---

# 6. AI 使用與商業模式

不得把整套產品綁在單一 AI 訂閱。

## 6.1 支援模式

### Bundled AI

平台訂閱內含 AI 額度。

### BYOAI

使用者自己提供：

- OpenAI API
- Anthropic API
- Google API
- Enterprise Endpoint
- Private Endpoint

### Local AI

完全不使用外部 API。

### Enterprise AI

公司自有模型或私有雲模型。

## 6.2 商業收費拆分

```text
Platform License
+
AI Compute
+
Cloud Compute / Storage
+
Enterprise Services
```

## 6.3 產品 Edition

### Community / Free

- 基礎 Knowledge
- 基礎 LEGO
- 基礎 Notes
- 基礎 Brainstorm
- BYOAI
- Local-first

### Personal Pro

- Cloud Sync
- Bundled AI
- Research
- Business
- Canvas
- 更多 Recipe

### Professional

- Advanced Data Lab
- Research Engine
- Simulation
- Optimization
- Multi-model Verification
- Large Knowledge Base

### Local Pro

- 永久授權
- Optional Annual Maintenance
- 可離線
- 可本機模型
- 不依賴啟用伺服器長期存活

### Enterprise / Sovereign

- On-prem
- Private Cloud
- Air-gapped
- SSO
- RBAC / ABAC
- Audit
- Private Models
- SLA
- Policy Pack
- Custom Capability

---

# 7. AI Gateway

所有 AI 呼叫統一經過 AI Gateway。

```text
Capability Request
       ↓
Capability Resolver
       ↓
Policy Engine
       ↓
AI Gateway
       ↓
┌──────────────┬──────────────┬──────────────┐
│ Cloud Model  │ Customer API │ Local Model  │
└──────────────┴──────────────┴──────────────┘
```

AI Gateway 負責：

- Model Routing
- Provider Abstraction
- Fallback
- Cost Routing
- Privacy Routing
- Quality Routing
- Rate Limit
- Retry
- Token Budget
- Context Management
- Audit
- Observability

AI Gateway 的實作子模組（Provider Abstraction、Model Routing、Budget、Evaluation 等，見上方職責清單）的實際目錄切分方式由 repo-layout spec 決定，本文件不鎖定路徑字串。目錄結構見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`（Phase-4-owned repo-layout spec；過渡期草稿落點 `.ai/research/phase-2/repo-layout-draft.yaml`，標記 `status: DRAFT_PENDING_PHASE_4`）。

預期結果：

- 替換模型不影響 Business Logic
- 單一供應商故障不會癱瘓整個系統
- Restricted Data 可強制 Local

---

# 8. LEGO Capability 架構

本章只定義 **Capability 執行契約** 與其和 Cognitive Method 的邊界。

> Cognitive Method 的完整定義、Method Family、Primitive、Lens、工具選擇、限制、推薦搭配、Method-specific Gate，**以**
> `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1_2_zhTW.md`
> **為 authoritative source。**

## 8.1 Capability ≠ Method

```text
Capability
= 系統「能執行什麼」

Method
= 問題「應該如何思考 / 分析 / 驗證」
```

例如：

```text
Capability:
transcribe
retrieve_evidence
run_python
run_statistics
render_graph
execute_method
validate_artifact

Method:
Mind Map
Fishbone
SWOT / TOWS
PESTEL
Causal DAG
Red Team
AHP / MCDA
Scenario Planning
```

禁止把 Method 名稱硬編碼成平台核心 business logic。

## 8.2 Capability 範例

```text
transcribe
normalize_document
retrieve_evidence
verify_claim
run_python
run_r
run_sql
run_statistics
run_simulation
run_optimization
execute_method
render_representation
validate_artifact
```

其中：

```text
execute_method
```

必須接收 Atlas / machine-readable Method Contract 所定義的 `method_id`。

## 8.3 Capability Contract

```yaml
capability:
  id: cognitive.execute_method
  version: 1.0.0

input:
  type:
    - MethodExecutionRequest

output:
  type:
    - TypedMethodResult

preconditions:
  - method_atlas.loaded == true
  - method_contract.valid == true
  - workflow.static_validation == PASS
  - policy.validation == PASS

quality:
  provenance_required: true
  method_specific_gate_required: true

security:
  external_ai: policy_controlled

rollback:
  side_effect_free_preferred: true
```

## 8.4 Typed LEGO

每個能力與 Method 都必須具有 Input / Output type。

```text
transcribe:
AudioVideo → Transcript

extract_dataset:
Document → Dataset

execute_method(root_cause.fishbone):
ProblemStatement + EvidenceSet? → CauseHypothesisSet

execute_method(strategy.swot):
KnowledgeSet → SWOTAnalysis

strategy_synthesis:
ValidatedStrategyInputs → StrategyArtifact
```

不合法組合在執行前拒絕。

## 8.5 Method 定義禁止在 Master Plan 雙重維護

本 Master Plan 中出現 `SWOT / PESTEL / Fishbone / Red Team / MCDA / Scenario` 等名稱時：

- 僅代表 **架構例子或 Recipe 意圖**。
- 不構成完整 Method Specification。
- 不得以此處簡略描述覆蓋 Atlas。
- AI 必須到 Atlas 讀取該 Method 的 Contract、限制、輸入、輸出與 Quality Gate。
- 未來新增 Method 原則上只更新 Atlas / machine-readable method specs，不修改平台 Domain Kernel。

Method 的機讀規格（primitive/method/lens/representation/recipe schema）、registry/contracts/versions 的版本化登記、以及 method-selector/compatibility/mandatory-gates 的編譯邏輯，三者的實際目錄佈局由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`（過渡期草稿 `.ai/research/phase-2/repo-layout-draft.yaml`，`status: DRAFT_PENDING_PHASE_4`）。

預期結果：

- Master Plan 不再變成重複的工具百科。
- Atlas 可以獨立演進。
- Method 升級不要求改 Platform Core。
- AI 每次使用方法都有明確、可重播的來源版本。

---

# 9. Workflow IR 與 Recipe Engine

Recipe 不應直接綁 UI。

建立 Workflow Intermediate Representation。

凡 Workflow 節點涉及 Cognitive Method：

```text
MUST resolve method definition from
AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1_2_zhTW.md
or its approved machine-readable derivative.
```

Workflow IR 應分開表示 `capability` 與 `method`，避免把工具方法與執行能力混為一體。

```yaml
workflow:
  id: research.qualitative.v4

references:
  cognitive_method_atlas:
    file: AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1_2_zhTW.md
    required: true

nodes:
  - type: capability
    ref: transcribe
    input: source.video

  - type: method
    method_id: research.thematic_analysis
    input: output.transcript

  - type: capability
    ref: literature_search
    input: research.question

  - type: method
    method_id: evidence.triangulation
    input:
      - themes
      - literature

  - type: capability
    ref: artifact.generate_research_paper
```

Workflow Intermediate Representation、Compiler、Recipe、Validation、Runtime 五個子系統彼此邊界清楚、可獨立替換（見上方「UI 可換 / Workflow Engine 可換 / AI 模型可換」預期結果），實際目錄佈局由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`。

預期結果：

- UI 可換
- Workflow Engine 可換
- AI 模型可換
- 工作流規格仍可長期存在

---

# 10. Prompt → Plan Compiler

使用者可輸入自然語言目標。

例如：

> 我有三個創業訪談影片，我想判斷產品值不值得做，最後做投資簡報。

流程：

```text
User Intent
↓
Goal Specification
↓
Stakeholder Detection
↓
Capability Graph
↓
Workflow Compilation
↓
Static Validation
↓
Policy Validation
↓
Cost Estimate
↓
Risk Estimate
↓
Human Approval
↓
Execution
```

預期結果：

使用者不必理解所有 LEGO，也能讓 AI 自動組裝最佳流程。

---

# 11. Multimodal Knowledge Canvas

人類必須能直接加入自己的：

- 文字
- Sticky Note
- 圖片
- PDF
- Word
- PPT
- Excel
- CSV
- Audio
- Video
- URL
- 手寫
- Diagram
- Equation
- Table
- Chart
- Code
- Voice Note

確切路徑：

```text
/modules/canvas/
    /nodes/
    /edges/
    /annotations/
    /attachments/
    /realtime/
```

## 11.1 Human Contribution

```text
HumanContribution
├── Opinion
├── Idea
├── Question
├── Assumption
├── Objection
├── Correction
├── Decision
├── Approval
├── Evidence
└── Task
```

## 11.2 人類內容不能被 AI 靜默覆蓋

AI 只能：

- Suggest
- Diff
- Comment
- Challenge

使用者決定：

- Accept
- Reject
- Edit
- Lock
- Branch
- Merge

## 11.3 Locked Fact

人可指定：

```text
LOCKED_FACT
```

AI 永遠不得覆蓋。

---

# 12. Authorship & Integrity Plane

目標不是繞過 AI Detector，而是建立可證明的 Human-led Authorship。

不得宣稱：

- 100% 通過所有 AI 檢測器
- 保證 AI 0%
- 保證任何機構認定為人工

## 12.1 記錄內容來源

`authorship_state` 唯一正本見 `specs/governance/epistemic-label.schema.yaml#/definitions/authorship_state`（6 值：HUMAN_ORIGINAL / AI_GENERATED / AI_SUGGESTED / HUMAN_EDITED / HUMAN_APPROVED / SOURCE_QUOTATION）。原第 7 值 `CALCULATED RESULT` 已移除——經 ADR-004 確認為誤植自 §83 epistemic_type 的重複字串，非真實的第 7 種 authorship 概念。

## 12.2 追蹤檔案分類

Authorship & Integrity Plane 須維護六類追蹤資料：貢獻地圖（contribution map）、人工編輯紀錄、AI 輔助紀錄、來源溯源、引用驗證、版本歷史。實際檔案佈局由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`（過渡期草稿 `.ai/research/phase-2/repo-layout-draft.yaml`，`status: DRAFT_PENDING_PHASE_4`）。

## 12.3 Compliance Profile

```text
Academic Strict
Corporate
Personal
Research
No External AI
Institution-specific
```

預期結果：

若被質疑，可清楚回答：

- 哪段由人類提出
- 哪段由 AI 協助
- 哪段有真實來源
- 哪段由統計計算
- 哪段已經人類確認

---

# 13. Knowledge 與 Provenance

不能只用 Vector DB。

核心知識關係：

```text
SOURCE
↓
EVIDENCE
↓
CLAIM
↓
INFERENCE
↓
ASSUMPTION
↓
DECISION
```

例如：

```text
PDF p.32
↓
Evidence E912
↓
Claim C117
↓
Inference I72
↓
Recommendation R61
↓
Strategy S91
```

## 13.1 Sentence-level Provenance

每個重要句子可追：

```text
Sentence
→ Claim
→ Evidence
→ Source
→ Page / Region / Timestamp
```

## 13.2 圖片區域證據

```text
Image
↓
RegionAnnotation
↓
Evidence
↓
Claim
```

## 13.3 Evidence Graph

確切路徑：

```text
/modules/knowledge/
    /sources/
    /evidence/
    /claims/
    /entities/
    /relations/
    /provenance/
    /graph/
```

---

# 14. Knowledge Memory 分層

AI Memory 不等於聊天紀錄。

拆為：

```text
Episodic Memory
Semantic Memory
Project Memory
Personal Preference
Organization Knowledge
Temporary Context
```

每種皆需：

- Retention Policy
- Permission
- Version
- Expiry
- Audit

---

# 15. Human–AI 多專家、多利害關係人系統

正式加入：

# Stakeholder & Expert Intelligence Plane

不是讓 AI「扮演角色」，而是正式建立角色模型。

## 15.1 角色七維

```text
Knowledge Identity
Industry Identity
Government Identity
Execution Identity
Social Identity
Geographic Identity
Interest Position
```

## 15.2 專家層次

### 理論／學術博士

檢查：

- 理論
- 文獻
- 方法
- 因果
- 模型
- 替代理論

### 實務博士／Professional Expert

檢查：

- 現場可行性
- 組織
- 人力
- 成本
- 工作流程
- 執行障礙

### 第一線執行者

檢查：

- 真正做不做得到
- 日常負擔
- 工具可用性
- 時間
- 執行流程

---

# 16. 政府機關角色模型

政府不得只是一個 Government Agent。

至少包含：

```text
Policy Maker
Regulator
Funder
Central Government
Local Government
Implementation Agency
Frontline Executor
Audit / Oversight
```

依領域動態加入：

- 教育主管機關
- 教育局
- 科技主管機關
- 經濟主管機關
- 貿易機關
- 財政
- 勞動
- 個資／資安
- 城市治理
- 環境
- 交通
- 衛生
- 產業發展
- 外交
- 法規

## 16.1 Policy Execution Chain

```text
Policy Maker
↓
Funding
↓
Local Government
↓
Agency
↓
Institution
↓
Executor
↓
Citizen / User
```

任何一層出問題，都可造成政策失敗。

---

# 17. Local People / Local Intelligence

需考慮：

- 當地居民
- 學生
- 家長
- 教師
- 消費者
- 企業
- 媒體
- 地方政府
- 地方政治
- 弱勢
- 偏鄉
- 都會
- 地方文化
- 當地語言

AI 模擬 Local Perspective 必須標註：

```text
Hypothetical Local Perspective
```

不得冒充真實民意。

真正高風險決策需加入：

- Survey
- Interview
- Focus Group
- Public Consultation
- Local Data

---

# 18. 專家領域 Packs

初始至少包含：

```text
Business
Economics
Finance
Accounting
Marketing
Sales
Operations
Supply Chain
Trade
International Business

Education
Learning Science
Psychology
Sociology
Anthropology

AI
Computer Science
Cybersecurity
Data Science
Robotics
Semiconductor
Telecom

Law
Regulation
Public Policy
Government
Political Science
Geopolitics
International Relations

Urban Planning
Geography
Demography
Environment
Energy
Transportation

Healthcare
Public Health
Biotech

Culture
History
Language
Media
Communication

Risk
Security
Crisis Management
```

---

# 19. Role Assembly Engine

使用者只需描述問題。

例如：

> 評估在越南建立 AI 教育公司的可行性。

系統自動組合：

```text
Business Strategy
Finance
Trade
AI Architecture
Education Research
Teacher
Student
Parent
Vietnam Local Culture
Local Business
Local Government
Education Authority
Data Regulation
Labor
Political Risk
Geopolitical
Infrastructure
Investor
Competitor
Cybersecurity
```

## 19.1 Diversity Coverage Score

```text
Academic Coverage
Industry Coverage
Government Coverage
Local Coverage
Execution Coverage
Cultural Coverage
Political Coverage
Economic Coverage
Technology Coverage
```

若某項過低，自動補角色。

---

# 20. 利害關係人 Incentive Model

每個 Stakeholder 建模：

```text
Goals
Incentives
Constraints
Risks
Power
Influence
Opposition
Dependencies
```

## 20.1 Power / Influence Matrix

分析：

- 誰支持
- 誰反對
- 誰有權阻擋
- 誰真正執行
- 誰承擔成本
- 誰承擔風險

---

# 21. Conflict Engine

流程：

```text
Conflict
↓
Underlying Interests
↓
Constraints
↓
Negotiation Space
↓
Trade-off
↓
Candidate Resolution
↓
Simulation
↓
Decision
```

支援：

- 多方利益衝突
- 資料隱私 vs 商業價值
- 政策速度 vs 現場負擔
- 預算 vs 品質
- 中央 vs 地方
- 技術創新 vs 監管

---

# 22. Intelligence Council

重大問題建立：

```text
INTELLIGENCE COUNCIL
```

流程：

```text
Independent Analysis
↓
Cross Examination
↓
Evidence Challenge
↓
Conflict Resolution
↓
Minority Opinion Preservation
↓
Final Synthesis
```

輸出：

```text
Consensus
Minority Opinion
Critical Dissent
Unknowns
Assumptions
Reversal Conditions
```

---

# 23. Epistemic & Strategic Reasoning Engine

完整推理流程：

```text
Human Goal
↓
Problem Decomposition
↓
Context Expansion
↓
Evidence Collection
↓
Assumption Registry
↓
Causal Model
↓
Multi-Expert Analysis
↓
Deduction
↓
Induction
↓
Abduction
↓
Scenario Generation
↓
Second-order Effects
↓
Third-order Effects
↓
Red Team
↓
Contradiction Resolution
↓
Quantitative Validation
↓
Culture / Geography / Policy Review
↓
Uncertainty Calibration
↓
Human Judgment
↓
Final Synthesis
```

---

# 24. Assumption Registry

每個重要假設正式建檔。

```yaml
assumption:
  id: ASM-018
  statement: "大學願意採用外部 AI 教育平台"
  type: Market Adoption
  evidence_strength: Medium
  impact_if_wrong: Critical
  confidence: 0.62
  validation_method: "Interview 30 universities"
  status: Unverified
```

系統自動識別：

```text
CRITICAL ASSUMPTION
```

優先驗證。

---

# 25. 推理類型必須分離

## Deduction

演繹。

## Induction

歸納。

## Abduction

溯因。

## Causal

因果。

## Counterfactual

反事實。

## Temporal

時間推理。

## Second / Third Order

二階／三階影響。

確切路徑：

```text
/reasoning/
    /deductive/
    /inductive/
    /abductive/
    /causal/
    /counterfactual/
    /temporal/
    /second_order/
    /third_order/
```

---

# 26. Culture / Geography / Politics / Policy Context

確切路徑：

```text
/context/
    /cultural/
    /geographic/
    /political/
    /policy/
    /economic/
    /historical/
    /demographic/
    /environmental/
```

## 26.1 Culture

分析：

- 語言
- 溝通風格
- 權威結構
- 信任
- 風險偏好
- 群體規範
- 隱私感知
- 教育期待
- 科技接受
- 歷史脈絡

禁止使用刻板印象作為事實。

## 26.2 Geography

拆解：

```text
Country
→ Region
→ State / Prefecture
→ City
→ Urban / Rural
→ Institution
→ Segment
```

## 26.3 Policy

分析：

- Current Regulation
- Proposed Regulation
- Budget
- Industrial Policy
- Tax
- Trade
- Education Policy
- Privacy
- AI Regulation
- Labor
- Election Cycle
- International Relations

---

# 27. Data Science Plane

AI 不直接編造數學結果。

正確流程：

```text
AI
↓
Analysis Planner
↓
Trusted Compute Engine
↓
Validation
↓
Result Artifact
↓
AI Interpretation
```

---

# 28. Data Lab

確切模組：

```text
/modules/analytics/
    /datasets/
    /cleaning/
    /statistics/
    /ml/
    /causal/
    /timeseries/
    /experiments/
    /visualization/
```

使用者可以用自然語言：

> 哪些因素最影響續約率？

AI 先建立 Analysis Plan，再由 Compute Engine 真正計算。

---

# 29. 統計能力

支援：

## 基礎統計

- Mean
- Median
- Variance
- Standard Deviation
- Distribution
- Confidence Interval
- Effect Size

## 假設檢定

- t-test
- Chi-square
- ANOVA
- MANOVA
- ANCOVA
- Non-parametric
- Multiple Comparison Correction

## Regression

- Linear
- Logistic
- Poisson
- Negative Binomial
- Mixed Models
- Hierarchical Models

## 時間序列

- Trend
- Seasonality
- Forecast
- Backtesting
- Change-point
- Anomaly Detection

---

# 30. Machine Learning

支援：

- Classification
- Regression
- Clustering
- PCA
- Dimensionality Reduction
- Feature Selection
- Model Comparison
- Cross Validation
- Explainability
- Calibration
- Drift Detection

---

# 31. Causal Inference

支援：

- DAG
- Propensity Score
- Matching
- Difference-in-Differences
- Instrumental Variables
- Regression Discontinuity
- Synthetic Control
- Causal Impact

不得將相關性自動描述為因果。

---

# 32. Optimization

支援：

- Linear Programming
- Mixed Integer Programming
- Constraint Optimization
- Multi-objective Optimization

應用：

- 價格最佳化
- 庫存最佳化
- 人力配置
- 廣告預算
- 排程
- 物流
- 產品組合
- 資源分配

---

# 33. Monte Carlo / Scenario Engine

確切路徑：

```text
/modules/simulation/
    /scenario/
    /monte_carlo/
    /sensitivity/
    /stress_test/
```

輸出：

```text
Success Probability
Expected Outcome
Median Outcome
Best Case
Base Case
Worst Case
Sensitivity
Key Risk Variables
```

---

# 34. Experiment Engine

支援：

- A/B Test
- Multi-arm Test
- Sample Size
- Power Analysis
- Sequential Testing
- Experiment Design

---

# 35. Data Quality Engine

分析前自動檢查：

- Missing Values
- Duplicates
- Outliers
- Impossible Values
- Data Type Error
- Sampling Bias
- Leakage
- Class Imbalance
- Distribution Shift

不得在資料品質嚴重異常時直接得出高信心結論。

---

# 36. Statistical Guardrails

執行模型前自動檢查：

- Sample Size
- Multicollinearity
- Residuals
- Heteroskedasticity
- Normality
- Independence
- Model Assumptions

若不符合，推薦替代方法。

---

# 37. Reproducible Research

每次分析建立 AnalysisRun。

```yaml
analysis_id: ANA-92817

dataset:
  version: DATA-17
  hash: ...

analysis_plan:
  version: AP-6

runtime:
  python: 3.x
  r: 4.x

dependencies:
  locked: true

random_seed:
  391922

code:
  version: CODE-88

result:
  id: RESULT-229
```

論文中的數字可追：

```text
Paper Sentence
→ Result
→ AnalysisRun
→ Code
→ Dataset
→ Original Source
```

---

# 38. Visualization Engine

一般圖表：

- Bar
- Line
- Scatter
- Heatmap
- Boxplot
- Violin
- Histogram
- Sankey
- Network
- Map
- Timeline
- Funnel
- Waterfall
- Radar
- Treemap
- Cohort

研究圖：

- Forest Plot
- Kaplan-Meier
- ROC
- PR Curve
- Correlation Matrix
- PCA
- Cluster
- Regression Diagnostic

所有圖需綁定：

```text
Dataset
+
AnalysisRun
+
VisualizationSpec
```

---

# 39. Research Mode

完整研究流程：

```text
Research Topic
↓
Research Question
↓
Literature Search
↓
Literature Matrix
↓
Research Gap
↓
Method Design
↓
Data Collection
↓
Data Analysis
↓
Results
↓
Discussion
↓
Citation Check
↓
Methodology Check
↓
Research Integrity
↓
Paper
```

---

# 40. Qualitative Research

流程：

```text
Interview Audio / Video
↓
Transcription
↓
Speaker Diarization
↓
Coding
↓
Theme Analysis
↓
Evidence Quotes
↓
Triangulation
↓
Discussion
```

保留：

```text
Original Transcript
→ Code
→ Theme
→ Claim
```

---

# 41. Quantitative Research

流程：

```text
Research Question
↓
Hypothesis
↓
Instrument / Questionnaire
↓
Data
↓
Cleaning
↓
Descriptive Statistics
↓
Reliability
↓
Inferential Statistics
↓
Model Diagnostics
↓
Result
↓
Interpretation
```

---

# 42. Research Integrity Engine

支援：

- Citation Verification
- Evidence Strength
- Retraction Check
- Contradiction Detection
- Data Provenance
- Methodology Check
- Statistical Validation
- Reproducibility Package

輸出：

```text
Paper.pdf
Paper.docx
data/
analysis/
code/
citations/
provenance/
methodology/
reproduction.yaml
```

---

# 43. Business Planning Mode

> **Method Resolution Rule**  
> 下列只表示 Business Planning 的 architecture-level intent flow。  
> 真正使用哪些 Method、順序、限制、替代方法、全球在地化要求與 Method-specific Gate，必須先讀：
>
> `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1_2_zhTW.md`
>
> 禁止把本章簡略列表當成完整工具規格。

完整 Recipe：

```text
Source
↓
Problem Extraction
↓
Customer Insight
↓
Market Analysis
↓
Competitor Analysis
↓
SWOT
↓
PESTEL
↓
Porter
↓
STP
↓
Business Model
↓
Strategy
↓
Financial Assumptions
↓
Scenario
↓
Risk
↓
KPI
↓
Execution Plan
↓
Proposal
```

> **現況限制（P1-CONFLICT-4 / ADR-008，登記日 2026-08-29）**
>
> 上列 Recipe 中的 `Financial Assumptions` 節點，其對應的 Atlas Finance Domain Pack
>（`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md` `/domain-packs/finance/`，
> 目前實際行號請以該檔案即時內容為準，本提案登記時為 L3901，套用時已因該檔案其他
> 母文件修訂而位移）目前僅有目錄宣告，無任何方法內容。依本節 §Method Resolution
> Rule（本文件 L45-49）之規則，今日若實際驅動本 Recipe 執行到此節點，Method
> Selection Engine 必須回傳：
>
> `PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED`
>
> 節點名稱予以保留（非文件寫錯；Atlas §25 開發優先順序 Phase 4 列有 Business 大類，
> Finance 是否併入該大類或另立獨立 Phase 尚未在 §25 逐字點名，屬於未來排序細節，
> 不影響本 callout 的核心結論：domain pack 補齊前，本 Recipe 不具備端到端可執行性）。
> 詳見 ADR-008。

---

# 44. Business Strategy Mode

必須同時考慮：

- 市場
- 財務
- 競爭
- 客戶
- 供應鏈
- 政策
- 政治
- 貿易
- 文化
- 地理
- 執行
- 法規
- 資安
- AI
- 科技
- 組織
- 人才

---

# 45. Learning / Class Notes Mode

> Cognitive Mapping、Concept Map、Summary、Questioning、Learning / Reflection 等方法若需要 Method semantics，統一由
> `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1_2_zhTW.md`
> 解析；本章只定義產品輸出流程。

```text
Lecture Video
↓
Transcription
↓
Topic Segmentation
↓
Summary
↓
Concept Extraction
↓
Concept Graph
↓
Study Notes
↓
Flashcards
↓
Quiz
↓
Exam Questions
```

同一份課程可以繼續轉：

```text
Research Question
Business Idea
SWOT
Strategy
Proposal
Presentation
```

---

# 46. Brainstorming Mode

> **本章不再維護 Brainstorming Tool Catalog。**  
> Brainstorming / Divergence / Clustering / SCAMPER / Mind Map / Affinity / Challenge / Decision 等正式方法、選擇規則與搭配方式，以：
>
> `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1_2_zhTW.md`
>
> 為唯一敘事性 Method Source of Truth；machine-readable specs 為 runtime contract。

不是「產生 20 個點子」。

完整流程：

```text
Human Idea
↓
Divergence
↓
Clustering
↓
Persona Challenge
↓
Counterargument
↓
Evidence Search
↓
Feasibility
↓
Cost
↓
Risk
↓
Scenario
↓
Ranking
↓
Decision
```

Idea Artifact：

```text
Idea
├── source
├── assumptions
├── novelty
├── feasibility
├── business_value
├── cost
├── risk
├── dependencies
├── evidence
└── score
```

---

# 47. Multi-Agent Workshop

可加入角色：

- CEO
- CFO
- CTO
- PM
- Customer
- Competitor
- Investor
- Regulator
- Teacher
- Student
- Parent
- Researcher
- Local Resident
- Local Government
- Education Bureau

AI 角色輸出必須標示：

```text
Evidence-backed
Model inference
Hypothetical role perspective
Unknown
```

---

# 48. Red Team / Blue Team / Judge

重大 Artifact 強制經過：

```text
BLUE TEAM
建立最強論證

RED TEAM
摧毀論證

JUDGE
以證據與規則裁決
```

Red Team 檢查：

- 錯誤假設
- 邏輯跳躍
- 遺漏變數
- 反例
- 政策風險
- 文化錯判
- 統計問題
- 執行障礙
- 過度自信

---

# 49. Devil's Advocate

專門問：

> 如果整個主流觀點錯了呢？

用途：

- 防止 groupthink
- 找替代解釋
- 找低機率高衝擊事件
- 找結構性轉變

---

# 50. Unknown Unknown Discovery

比較：

```text
Current Model
vs
Historical Cases
vs
Other Industries
vs
Other Countries
vs
Adjacent Disciplines
```

找出：

- Missing Variables
- Hidden Dependencies
- Blind Spots
- Unexplored Relationships

---

# 51. Second / Third-order Effects

任何重大策略不得只看第一階影響。

```text
Decision
↓
Direct Effect
↓
Indirect Effect
↓
Behavioral Response
↓
Competitor Response
↓
Policy Response
↓
Long-term Structural Effect
```

---

# 52. Temporal Reasoning

每個重大結論至少分析：

```text
Immediate: 0–3 months
Short: 3–12 months
Medium: 1–3 years
Long: 3–10 years
Structural: 10+ years
```

---

# 53. Decision Intelligence

Decision Object：

```text
Decision
├── Options
├── Criteria
├── Evidence
├── Assumptions
├── Risks
├── Predictions
├── Simulations
├── Human Judgment
└── Outcome
```

半年後可回來比較：

```text
Prediction
vs
Reality
```

建立 Decision Feedback Loop。

---

# 54. Decision Reversal Criteria

所有重大建議都應包含：

```text
Current Recommendation
+
Conditions to Reverse
```

例如：

- CAC > X
- 採用率 < Y
- 政策變化
- 市場規模跌破 Z
- 供應鏈中斷
- 合作夥伴失敗

---

# 55. Claim Strength Model

每個重要 Claim 可顯示：

```text
Evidence Quality
Evidence Diversity
Logical Consistency
Quantitative Support
Expert Agreement
Policy Stability
Cultural Confidence
Geographic Coverage
Contradiction Risk
Assumption Dependency
Human Verification
```

---

# 56. Quality Gate

確切路徑：

```text
/quality/
    /evidence/
    /reasoning/
    /statistics/
    /causal/
    /policy/
    /culture/
    /geography/
    /security/
    /redteam/
    /consistency/
    /uncertainty/
    /authorship/
```

研究論文：

```text
Research Integrity Gate
Citation Gate
Statistical Gate
Methodology Gate
Authorship Gate
```

商業企劃：

```text
Market Gate
Financial Gate
Strategy Gate
Execution Gate
Risk Gate
Policy Gate
```

---

# 57. Event-native Architecture

核心狀態用 Event Ledger，而非只靠 CRUD。

例如：

```text
DocumentUploaded
TranscriptGenerated
TranscriptCorrected
ClaimCreated
ClaimVerified
ClaimRejected
StrategyGenerated
StrategyApproved
ArtifactPublished
PersonalDataRedacted
```

Current State = Events 的 Projection。

可以 Replay 到任意歷史狀態。

## 57.1 個資分級標註（Confidential/Restricted Event Types）

依 §61 資料分級，下列既有 event type 含 Confidential/Restricted 分級欄位，寫入前必須套用 Execution Contract §27.1 Encrypted Field Envelope：

```text
DocumentUploaded  — 可能含身分文件等 Restricted 欄位
ClaimCreated      — 可能含理賠人個資（如身分證號）等 Confidential/Restricted 欄位
```

`PersonalDataRedacted` 為稽核輔助角色事件（機器可讀正本：`specs/domain/personal-data-redacted-event.schema.yaml`），記錄「何時、依哪個 Authorization、對哪個 subject 的哪些欄位執行了 crypto-shred」。此事件本身不是刪除機制——原始事件（如 `ClaimCreated`）在 crypto-shred 後仍完整保留（含密文，見 Execution Contract §27.1），僅供 projection read path 疊加 `REDACTED` 呈現與稽核之用（對應 Execution Contract §31.1 Deletion Evidence 步驟）。單獨依賴此事件存在本身，不構成合規刪除的充分證明。

---

# 58. Immutable-first

原始資料不得直接覆蓋。

```text
Version 1
Version 2
Version 3
```

所有檔案 Content-addressed，且依 Tenant 隔離命名空間，預設規則為 tenant-scoped（ADR-003 Sub-decision (b) Option A，解 P1-CONFLICT-2）：

```text
/objects/<tenant_id>/sha256/aa/bb/<hash>
```

僅限明確標記且經 explicit / logged / platform-level 核准的內容類別（例：platform-authored templates、ingested public regulatory texts）可落入窄範圍全域去重例外池，以固定 sentinel `_global` 取代 `<tenant_id>`：

```text
/objects/_global/sha256/aa/bb/<hash>
```

完整 path grammar 與驗證規則（含 shard 推導、`global_pool_promotion` 記錄欄位）見 `specs/artifact/cas-path.schema.yaml`。

---

# 59. Portable Artifact URI

不得讓 Domain 依賴 S3 路徑。

使用邏輯 URI：

```text
artifact://project/PRJ001/source/SRC0003
```

實際 storage 可為：

- AWS
- Azure
- GCP
- MinIO
- NAS
- Local Disk
- Future Storage

---

# 60. Data Architecture

```text
PostgreSQL
→ Structured Metadata

Object Storage
→ Video / Audio / PDF / Artifact

Vector Index
→ Semantic Retrieval

Graph Store
→ Evidence / Claim / Entity Relationships

Event Store
→ State History

Search Index
→ Full Text

Time-series
→ Metrics
```

應用層透過 Repository Contract，不直接依賴資料庫。

---

# 61. 安全架構

資料分級：

```text
Public
Internal
Confidential
Restricted
```

Routing：

```text
Restricted
→ External AI DENY

Confidential
→ External AI require approval

Internal
→ Policy controlled

Public
→ Cloud allowed
```

---

# 62. Zero Trust

```text
Identity
↓
Workload Identity
↓
Mutual Authentication
↓
Short-lived Credentials
↓
Policy Decision
↓
Resource Access
```

禁止：

- Shared Password
- Long-lived API Key
- Hard-coded Secret

---

# 63. Secret Management

Local：

- macOS Keychain
- Windows Credential Manager
- Linux Secret Store

Cloud：

- Secret Manager
- Workload Identity
- Encrypted Secrets

不得將 Key 寫入：

- Git
- Log
- Plain config

---

# 64. Policy-as-Code

確切路徑：

```text
/policies/
    /data/
    /ai/
    /publishing/
    /research/
    /security/
    /enterprise/
```

範例：

```text
Restricted data
AND external_model = true
→ DENY
```

```text
Financial recommendation
AND confidence < 0.8
→ REQUIRE HUMAN REVIEW
```

---

# 65. Agent ≠ Authority

Agent 只能提出 Intent。

```text
Agent
↓
Intent
↓
Policy Engine
↓
Permission Check
↓
Human Approval / Auto Rule
↓
Execution
```

Agent 不可直接：

- Delete
- Publish
- Deploy
- Send
- Modify Locked Fact

---

# 66. Supply Chain Security

```text
Source
↓
Signed Commit
↓
CI
↓
SBOM
↓
Dependency Scan
↓
Artifact Signing
↓
Verified Deployment
```

Production 只接受 Signed Artifact。

---

# 67. Deployment

採：

```text
Modular Monolith Core
+
Isolated Workers
+
Event Bus
```

初期不要一開始拆成上百 Microservices。

Worker：

```text
AI Worker
Document Worker
Research Worker
Data Worker
Rendering Worker
Simulation Worker
```

真正需要時再抽離 Service。

---

# 68. Immutable Deployment

禁止：

```text
SSH
手改 Production Config
```

只允許：

```text
Git
↓
CI
↓
Immutable Image
↓
Deploy
```

並實作：

- IaC
- Config-as-Code
- Policy-as-Code
- Schema-as-Code
- Workflow-as-Code

---

# 69. Rollback

必須同時可回滾：

```text
Application
Workflow
Prompt
Model
Schema
Policy
Knowledge Snapshot
Artifact
Configuration
```

Execution Manifest：

```yaml
execution_id: EX-991
app_version: 21.3
workflow_version: 8.4
capability_version: 5.7
prompt_version: 17
model_profile: reasoning-high-v3
schema_version: 6
policy_version: 9
knowledge_snapshot: KS-20290117-1132
```

---

# 70. 測試與 Eval

AI 系統沒有 Eval 不得上線。

每個 Capability 需：

```text
Golden Dataset
Regression Dataset
Adversarial Dataset
Privacy Dataset
Safety Dataset
```

每次變更重跑：

- Accuracy
- Grounding
- Faithfulness
- Consistency
- Hallucination
- Latency
- Cost
- Security
- Regression

---

# 71. Champion / Challenger

Production：

```text
Champion Model
```

新模型：

```text
Challenger
```

先 Shadow 執行，不影響使用者。

只有品質、成本、延遲達標才升級。

---

# 72. Agent Evaluation

每個 Agent 監控：

- Success Rate
- Hallucination Rate
- Retry Rate
- Human Override
- Cost
- Latency
- Grounding

表現持續惡化可自動停用。

---

# 73. Observability

確切路徑：

```text
/platform/observability/
    /logs/
    /metrics/
    /traces/
    /alerts/
    /dashboards/
```

重要監控：

- Workflow Failure
- Model Error
- Retrieval Quality
- Cost Anomaly
- Security Event
- Data Drift
- Quality Regression
- SLA
- Queue Lag

---

# 74. Disaster Recovery

至少：

```text
Primary Region
Secondary Region
Cold Archive
Offline Backup
```

定義：

```text
RPO
RTO
```

範例：

```text
Core metadata:
RPO < 5 min

Artifacts:
RPO < 24h

Recovery:
RTO < 2h
```

---

# 75. Offline License

Local 版本不得永久依賴公司 License Server。

採 Signed Offline License。

永久版：

```text
No activation server dependency
```

即使公司基礎設施多年後改變，舊版仍能使用。

---

# 76. Cloud ↔ Local 可攜

Project Package：

```text
/project.manifest
/sources
/knowledge
/artifacts
/workflows
/events
/provenance
/datasets
/checksums
```

支援：

```text
Cloud → Export → Local
Local → Encrypted Package → Cloud
```

---

# 77. UI 工作空間

產品不應只有 Chat。

正式六大 Workspace：

## Canvas

想法、圖片、Brainstorm。

## Knowledge

來源、文獻、Evidence、Claims。

## Data Lab

統計、分析、ML、因果、模擬。

## Workflow Lab

LEGO 組裝。

## Artifact Studio

論文、企劃、報告、簡報。

## Decision Room

策略、Scenario、決策、風險。

可再加入：

## Intelligence Council

多專家、多政府、多地方辯論。

---

# 78. 使用者完整流程

```text
Create Project
↓
Upload Sources
↓
Ingest
↓
Normalize
↓
Knowledge Build
↓
Human Adds Ideas / Images / Files
↓
Select Goal
↓
Role Assembly
↓
Workflow Compilation
↓
Policy Check
↓
Cost / Risk Estimate
↓
Approve
↓
Execute
↓
Data Analysis
↓
Expert Debate
↓
Red Team
↓
Human Review
↓
Artifact Generation
↓
Quality Gates
↓
Sign
↓
Publish
↓
Monitor
↓
Outcome Feedback
```

---

# 79. 專案資料路徑

```text
/projects/{project_id}/
    sources/
    documents/
    transcripts/
    knowledge/
    evidence/
    claims/
    ideas/
    annotations/
    datasets/
    analyses/
    simulations/
    decisions/
    workflows/
    runs/
    artifacts/
    versions/
    audit/
    authorship/
    jurisdiction/
    compliance/
    legal/
    consent/
    privacy/
    transfers/
    retention/
    legal-hold/
```

---

# 80. 程式碼目錄

```text
/apps
    /web
    /desktop
    /mobile

/core
    /domain
    /application
    /contracts

/modules
    /canvas
    /knowledge
    /research
    /business
    /learning
    /brainstorm
    /analytics
    /simulation
    /optimization
    /decision
    /stakeholders
    /artifact
    /authorship
    /jurisdiction
    /compliance
    /privacy
    /localization
    /accessibility
    /trade
    /tax
    /legal
    /standards

/compute
    /python
    /r
    /sql
    /statistics
    /ml
    /causal
    /optimization

/ai
    /gateway
    /planner
    /agents
    /evaluation

/reasoning
    /deductive
    /inductive
    /abductive
    /causal
    /counterfactual
    /temporal
    /second_order
    /third_order

/context
    /cultural
    /geographic
    /political
    /policy
    /economic
    /historical
    /demographic
    /environmental

/experts
    /business
    /finance
    /education
    /trade
    /government
    /political
    /technology
    /ai
    /security
    /research
    /local

/review
    /redteam
    /blue_team
    /devils_advocate
    /independent_judge
    /human

/data
    /repositories
    /object
    /graph
    /vector
    /events
    /search

/security
    /identity
    /policy
    /audit
    /secrets
    /supply_chain

/platform
    /workflow
    /workers
    /observability
    /backup
    /recovery

/specs
    /artifacts
    /capabilities
    /workflows
    /analytics
    /provenance
    /authorship
    /stakeholders
```

---

# 81. 配置路徑

```text
/config/
    deployment/
        mode.yaml

    ai/
        providers.yaml
        models.yaml
        routing.yaml
        budgets.yaml

    privacy/
        classification.yaml
        routing-policy.yaml

    compute/
        local.yaml
        cloud.yaml

    licensing/
        features.yaml

    storage/
        policy.yaml

    jurisdiction/
        resolver.yaml
        hierarchy.yaml
        conflicts.yaml

    legal/
        sources.yaml
        freshness.yaml
        human-review.yaml

    compliance/
        obligations.yaml
        controls.yaml
        sector-packs.yaml
        market-entry.yaml

    localization/
        locale.yaml
        currencies.yaml
        timezones.yaml
        units.yaml
        accessibility.yaml
```

---

# 82. Execution Audit

每次 Capability Run 必留：

```text
run_id
block_id
capability_version
model
model_version
prompt_version
input_hash
output_hash
timestamp
user
latency
token_usage
cost
validation_score
status
policy_version
knowledge_snapshot
```

---

# 83. 最重要的內容原則

AI 產出必須區分（canonical enum 定義見 `specs/governance/epistemic-label.schema.yaml#/definitions/epistemic_type`，本清單為其嚴格子集，ADR-004 Sub-decision b）：

```text
SOURCE_FACT
AI_INFERENCE
AI_SUGGESTION
HUMAN_OPINION
CALCULATED_RESULT
UNKNOWN
```

禁止混合。

---

# 84. 高階模式

## Fast

快速一般回覆。

## Professional

Evidence + Verification。

## Research Grade

文獻 + 方法 + 統計 + Citation + Reproducibility。

## Board Grade

財務 + 市場 + Strategy + Risk + Scenario + Red Team。

## Deep Intelligence

```text
Multi-disciplinary
+
Multi-stakeholder
+
Multi-model
+
Evidence-grounded
+
Quantitative
+
Causal
+
Scenario Simulation
+
Geopolitical
+
Cultural
+
Geographic
+
Policy
+
Historical
+
Local
+
Government
+
Execution
+
Red Team
+
Human Judgment
```

---

# 85. MVP 分階段

## Phase 0 — Architecture Constitution

先完成核心永久規格與規範關係：

```text
Architecture Constitution v1
Capability Contract v1
Artifact & Provenance Specification v1
Cognitive Method Contract v1
Document Authority / Scoped Precedence v1
```

並將：

```text
AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1_2_zhTW.md
```

註冊為 Cognitive Method 的 mandatory companion specification。

預期結果：

所有後續開發都不可違反核心契約。

---

## Phase 1 — Core Platform

功能：

- Project
- Source Import
- Knowledge
- Canvas
- AI Gateway
- Capability Engine
- Workflow IR
- Versioning
- Audit
- Local-first Storage

Recipes：

- 課堂筆記
- Brainstorm
- 商業企劃
- 商業策略
- 研究企劃

Method 實作來源：

```text
AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1_2_zhTW.md
→ /specs/cognitive/*.schema.yaml
→ /methods/contracts/*
→ Recipe Compiler
```

禁止在 Phase 1 重新手刻另一套 SWOT / Fishbone / PESTEL / Red Team 等邏輯。

---

## Phase 2 — Research + Data

加入：

- Literature
- Citation
- Qualitative
- Quantitative
- Data Lab
- Statistics
- Visualization
- Reproducibility

---

## Phase 3 — Intelligence Council

加入：

- Expert Packs
- Government Roles
- Local Roles
- Stakeholder Mapping
- Role Assembly
- Diversity Score
- Conflict Engine
- Red Team
- Devil's Advocate

---

## Phase 4 — Decision Intelligence

加入：

- Scenario
- Monte Carlo
- Optimization
- Decision Objects
- Reversal Criteria
- Outcome Feedback

---

## Phase 5 — Sovereign / Enterprise

加入：

- Air-gapped
- SSO
- Enterprise RBAC / ABAC
- Private Model
- Policy Pack
- Audit Pack
- Signed Offline License
- Enterprise SLA

---

# 86. 每個功能的標準交付格式

任何功能規格與工程任務都必須輸出：

```text
1. 目標
2. 前置條件
3. 完整流程
4. 確切程式路徑
5. API / Schema
6. 權限
7. 資料流
8. 失敗模式
9. 驗證方式
10. 預期結果
11. 監控
12. 回滾方式
```

---

# 87. 成功判斷標準

本系統完成後，必須做到：

## 可靠

- 任何重要結果可重現
- 任何變更可回滾

## 可驗證

- 每個重要 Claim 可追到 Evidence
- 每個統計數字可追到 Dataset / Analysis

## 可維護

- 模型可換
- DB 可換
- Cloud 可換
- UI 可換

## 可攜

- Cloud ↔ Local
- 供應商可替換
- 永久可匯出

## 安全

- Restricted Data 可完全不出本機
- 所有存取有 Audit

## 人類主導

- AI 不覆寫人類
- AI 不直接發布高風險內容
- 人類可加入自己的文字、圖、檔案、聲音、圖片、資料

## 高品質

- 多專業
- 多利害關係人
- 多政府層級
- 多地方視角
- 多文化
- 多模型
- 數據驗證
- 因果
- 模擬
- Red Team

---

# 88. 最終工程憲法

```text
NO IMPORTANT DECISION
SHALL BE EVALUATED
FROM A SINGLE DISCIPLINE,
SINGLE STAKEHOLDER,
SINGLE GEOGRAPHY,
SINGLE MODEL,
OR SINGLE WORLDVIEW.

AI MAY PROPOSE.
AI MAY ANALYZE.
AI MAY SIMULATE.
AI MAY EXPLAIN.

AI MUST NOT FABRICATE COMPUTATION.
AI MUST NOT SILENTLY OVERWRITE HUMAN WORK.
AI MUST NOT REMOVE PROVENANCE.
AI MUST NOT CHANGE LOCKED FACTS.
AI MUST NOT PUBLISH HIGH-RISK OUTPUT WITHOUT POLICY APPROVAL.

HUMANS RETAIN FINAL AUTHORITY.

KNOWLEDGE IS USER-OWNED.

SOURCE IS IMMUTABLE.

RESULT MUST BE TRACEABLE.

COMPUTATION MUST BE REPRODUCIBLE.

WORKFLOW MUST BE VERSIONED.

FAILURE MUST BE CONTAINED.

CHANGE MUST BE REVERSIBLE.

THE SYSTEM MUST REMAIN USEFUL
EVEN IF A MODEL, CLOUD, PROVIDER,
DATABASE OR VENDOR DISAPPEARS.
```

---

# 89. 最終產品願景

本系統不只是：

- 論文 AI
- 企劃 AI
- 筆記 AI
- 商業策略 AI
- Brainstorm AI
- Data Analysis AI

而是一個：

> **Human–AI Multi-Stakeholder Intelligence, Research & Decision Operating System**

它能把：

```text
影片
語音
圖片
PDF
Word
PPT
Excel
CSV
網頁
手寫
人的想法
政府資料
研究文獻
市場資料
Local Feedback
```

轉成：

```text
Knowledge
↓
Evidence
↓
Reasoning
↓
Analysis
↓
Simulation
↓
Strategy
↓
Decision
↓
Research
↓
Artifact
```

同一份知識可以持續轉成：

- 課堂筆記
- 研究問題
- 研究計畫
- 論文
- Brainstorm
- 企劃書
- 商業策略
- 市場分析
- 政策分析
- 投資分析
- 簡報
- 決策報告
- 風險評估
- 執行計畫

真正做到：

> **Create Once, Transform Forever.**

以及：

> **User-owned Knowledge, Human-led Decisions, AI-accelerated Intelligence.**

---

# 90. 建議下一步

正式進入開發前，不應立刻寫大量功能，而是先建立以下不可隨意破壞的核心規格：

1. `Architecture-Constitution-v1.md`（已建立，見同層目錄，內容為 Scoped Authority 裁決鏈與文件職責表的單一正本）
2. `Domain-Model-v1.md`
3. `Capability-Contract-v1.md`
4. `Artifact-Provenance-Spec-v1.md`
5. `Workflow-IR-Spec-v1.md`
6. `Security-Policy-v1.md`
7. `Research-Integrity-Spec-v1.md`
8. `Analytics-Reproducibility-Spec-v1.md`
9. `Stakeholder-Expert-Role-Spec-v1.md`
10. `Offline-Cloud-Portability-Spec-v1.md`
11. `Jurisdiction-Model-v1.md`
12. `Legal-Source-Registry-v1.md`
13. `Compliance-Policy-Compiler-v1.md`
14. `Privacy-Data-Rights-v1.md`
15. `Cross-Border-Transfer-v1.md`
16. `AI-Regulatory-Classification-v1.md`
17. `Sector-Compliance-Pack-v1.md`
18. `Localization-Accessibility-v1.md`
19. `Legal-Change-Management-v1.md`
20. `Global-Market-Entry-Compiler-v1.md`
21. `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1_2_zhTW.md`（Mandatory Companion / Cognitive Method Source of Truth）
22. `Document-Authority-and-Scoped-Precedence-v1.md`

這 20 份規格正確之後，再開始大規模 MVP，才能最大程度符合：

- 多角度優先
- 30 年工程紀律
- 零重工原則
- 完整閉環
- 最小爆炸半徑
- Worldwide-capable
- Law-aware by design
- Sovereignty-aware by design

---

# 91. 世界各地通用：真正的設計定義

「全球通用」不得被誤解為：

> 寫一套固定規則，然後宣稱在全世界都合法。

這在工程與法律上都不可靠。

正確定義是：

> **核心平台全球一致；管轄、法規、資料主權、產業規則、文化、語言與執行條件全部以可版本化 Policy / Jurisdiction Pack 動態套用。**

因此全球能力分成兩部分：

```text
GLOBAL INVARIANTS
+
LOCAL / JURISDICTIONAL VARIANTS
```

Global Invariants：

- Evidence
- Provenance
- Versioning
- Identity
- Audit
- Capability Contract
- Workflow IR
- Artifact Contract
- Human Authority
- Reproducibility

Local Variants：

- 法律
- 法規
- 政策
- 稅
- 資料主權
- 兒少規則
- 產業規範
- 政府採購
- 語言
- 貨幣
- 時區
- 文化
- 執行流程

預期結果：

- 新增一個國家不必 fork 整個產品。
- 法律修改不必改寫核心程式。
- 全球產品只有一個 Domain Core。

---

# 92. Global Jurisdiction & Compliance Plane

新增正式 Plane：

```text
GLOBAL JURISDICTION & COMPLIANCE PLANE
```

職責：

- 判斷適用管轄
- 取得適用法律
- 區分法律／行政命令／規則／主管機關指引／標準／契約／內規
- 判斷法規有效日期
- 管理跨境資料
- 管理資料主權
- 管理 AI 監管分類
- 產業法規
- 稅務
- 貿易
- 政府採購
- 消費者保護
- 智慧財產
- 勞動
- Accessibility
- 研究倫理
- Records Retention
- Legal Hold
- Regulatory Reporting

核心流程：

```text
Project Context
↓
Jurisdiction Resolver
↓
Applicable Law Graph
↓
Obligation Resolver
↓
Control Mapping
↓
Policy Compilation
↓
Workflow Admission
↓
Execution
↓
Compliance Evidence
↓
Audit Artifact
```

---

# 93. Jurisdiction Model：不只國家與州

必須支援：

```text
Supranational
Country
Federal
State / Province
Canton
Prefecture
Territory
Special Administrative Region
County
City / Municipality
District
Tribal / Indigenous Jurisdiction
Free Trade Zone
Special Economic Zone
Industry Regulator
Public Sector Authority
Contractual Governing Law
```

例如同一個專案可能同時受：

```text
EU
+
Member State
+
Local Authority
+
Education Regulator
+
Privacy Regulator
+
Contract Law
```

影響。

---

# 94. Jurisdiction Resolver

不得只看 IP Address。

必須以 Project / Processing Activity 為單位建立 Jurisdiction Context。

```yaml
jurisdiction_context:
  operator_legal_entity: ...
  establishment_locations: [...]
  target_markets: [...]
  user_locations: [...]
  data_subject_locations: [...]
  processing_locations: [...]
  storage_locations: [...]
  model_provider_locations: [...]
  subprocessor_locations: [...]
  governing_law: ...
  sector: education
  data_categories: [...]
  children_involved: true
  government_customer: false
```

注意：

- 只有真正必要的屬性才收集。
- 不得用推測的敏感個資來判斷。
- 高風險欄位必須由使用者／組織明確設定。

確切路徑：

```text
/modules/jurisdiction/
    /context/
    /resolver/
    /hierarchy/
    /conflicts/
    /temporal/
    /tests/
```

預期結果：

輸出：

```yaml
jurisdiction_resolution:
  applicable:
    - JUR-001
    - JUR-008
  uncertain:
    - JUR-021
  human_review_required: true
```

---

# 95. Legal Source Registry

AI 不得靠記憶回答重要法律問題。

建立 Legal Source Registry。

每項法律資料必須包含：

```yaml
legal_source:
  id: LAW-...
  jurisdiction: ...
  authority: ...
  source_type: statute
  title: ...
  official_url: ...
  language: ...
  translation_status: official
  enacted_at: ...
  effective_from: ...
  effective_to: null
  status: effective
  supersedes: ...
  checksum: ...
  retrieved_at: ...
  reviewed_at: ...
  reviewed_by: ...
```

Source Type：

```text
Constitution
Treaty
Regulation
Statute / Act
Administrative Rule
Court Decision
Regulator Order
Regulator Guidance
Standard
Contract
Internal Policy
```

不得把：

```text
Blog
Vendor marketing page
AI summary
```

當成 Primary Legal Authority。

---

# 96. Legal Authority Hierarchy

不同法域有不同法律層級，不可寫死一套全球排序。

因此：

```text
Jurisdiction Pack
↓
Authority Hierarchy
```

例如每個 Pack 自己定義：

```yaml
authority_hierarchy:
  - constitutional
  - supranational
  - national_statute
  - regulation
  - state_or_province
  - local
  - regulator_rule
  - binding_order
  - guidance
```

預期結果：

系統知道：

- 哪個來源具有法律拘束力
- 哪個只是 Guidance
- 哪個只是 Best Practice

---

# 97. Temporal Law Engine

法律不是只有「現在版本」。

必須支援：

```text
Proposed
Enacted
Partially Effective
Effective
Transitional
Suspended
Repealed
Superseded
```

所有 Execution 記錄：

```text
Legal Snapshot ID
```

例如：

```yaml
legal_snapshot:
  id: LS-20260828-EU-01
  evaluated_at: 2026-08-28T...
  effective_laws: [...]
```

因此 2035 年仍可回答：

> 2026 年當時這份決策，是依哪一版法律做的？

---

# 98. Conflict-of-Laws Engine

不得採用簡化規則：

> 永遠套最嚴格法律。

因為這不一定法律上正確，甚至不同要求可能互相衝突。

正確流程：

```text
Applicable Rules
↓
Scope Test
↓
Extraterritorial Test
↓
Authority Test
↓
Conflict Detection
↓
Contract / Choice-of-Law Check
↓
Mandatory Law Check
↓
Resolution
↓
Human Counsel if unresolved
```

狀態：

```text
RESOLVED
CONSERVATIVE_SAFE_MODE
AMBIGUOUS
CONFLICT
LEGAL_REVIEW_REQUIRED
```

高風險：

```text
AMBIGUOUS / CONFLICT
→ BLOCK irreversible action
```

---

# 99. Compliance Policy Compiler

把法律義務轉成可執行 Control，而不是讓工程師每次手寫 if/else。

```text
Legal Requirement
↓
Normalized Obligation
↓
Control Requirement
↓
Executable Policy
↓
Evidence Requirement
```

範例：

```yaml
obligation:
  id: OBL-123
  action: restrict_external_transfer
  applies_when:
    data_classification: restricted
  controls:
    - local_processing_only
    - transfer_assessment_required
```

確切路徑：

```text
/modules/compliance/
    /obligations/
    /controls/
    /compiler/
    /evidence/
    /exceptions/
```

---

# 100. Global Privacy Engine

不能只支援 GDPR。

需建立抽象 Rights Model：

```text
Access
Correction
Deletion
Portability
Restriction
Objection
Opt-out
Limit
Consent Withdrawal
Appeal
Automated Decision Rights
Sensitive Data Rights
```

每個 Jurisdiction Pack 決定：

- 有哪些 Rights
- 適用條件
- 法定期限
- 例外
- 身分驗證要求
- 保留義務

確切路徑：

```text
/modules/privacy/
    /lawful-basis/
    /consent/
    /rights/
    /requests/
    /identity-verification/
    /deadlines/
```

---

# 101. Lawful Basis / Consent Registry

每個 Processing Activity 都必須知道：

```text
Purpose
Data Category
Data Subject
Lawful Basis
Consent State
Retention
Recipients
Transfer
```

建立：

```text
ProcessingActivityArtifact
```

不得只有一個全站「我同意」。

---

# 102. Cross-Border Data Transfer Engine

分析：

```text
Source Country
↓
Data Category
↓
Destination
↓
Subprocessor
↓
Transfer Mechanism
↓
Localization Requirement
↓
Risk Assessment
↓
Allow / Deny
```

支援抽象 Mechanism：

```text
Adequacy
Standard Contractual Clauses
Binding Corporate Rules
Contractual Clauses
Consent Exception
Statutory Exception
Local Processing Only
Other Jurisdiction-specific Mechanism
```

不得假設不同國家制度完全相同。

確切路徑：

```text
/modules/privacy/transfers/
    /routes/
    /mechanisms/
    /assessments/
    /localization/
```

---

# 103. Data Residency & Sovereignty

Deployment Scheduler 必須理解：

```text
Data Residency
Encryption Key Residency
Model Residency
Backup Residency
Log Residency
Support Access Location
```

某些資料可以：

```text
EU-only
Country-only
On-prem-only
Device-only
```

預期結果：

Scheduler 自動選符合 Policy 的 Worker / Region。

---

# 104. Sovereign Regional Cell Architecture

全球雲端不可把所有資料集中在一個 Global DB。

建議：

```text
Global Control Metadata
(no customer content where prohibited)

        │
 ┌──────┼────────┐
 ▼      ▼        ▼
EU Cell US Cell APAC Cell
 │       │        │
Local DB Local DB Local DB
Local KMS Local KMS Local KMS
```

需要時再細分：

```text
Country Sovereign Cell
Government On-Prem Cell
Air-gapped Cell
```

---

# 105. AI Regulatory Classification Engine

每個 AI Capability 在每個使用情境重新分類。

輸入：

```text
Use Case
Affected Persons
Sector
Decision Impact
Automation Level
Biometric Use
Children
Employment
Education
Credit
Health
Government
Critical Infrastructure
```

輸出：

```text
Risk Classification
Required Controls
Documentation
Human Oversight
Transparency
Testing
Logging
Prohibited / Allowed
```

不得把「模型本身分類」等同「使用情境分類」。

---

# 106. AI Governance

核心控制：

- Model Inventory
- Intended Use
- Prohibited Use
- Training Data Provenance
- Evaluation
- Bias Testing
- Security Testing
- Human Oversight
- Incident Logging
- Transparency
- Model Change Control
- Third-party Model Risk

可 crosswalk：

- 法規
- 企業 Policy
- ISO / NIST 等非法律標準

注意：

> 標準與 Framework 不得誤標成法律。

---

# 107. Sector Compliance Packs

基礎架構一致，但高風險產業使用 Pack。

至少：

```text
Education
Children
Healthcare
Finance
Credit
Insurance
Employment / HR
Public Sector
Critical Infrastructure
Legal Services
Scientific Research
Biometrics
Defense / Dual-use
Telecom
Transportation
Energy
E-commerce
Media
```

每個 Pack 定義：

```text
Required Roles
Required Legal Checks
Required Data Controls
Required Human Review
Prohibited Capabilities
Retention
Audit
```

---

# 108. Education / Children Pack

需考慮：

- 學生資料
- 未成年人
- 家長／監護人
- 教師
- 學校
- 教育局
- 地方政府
- 學術誠信
- 年齡驗證
- 兒少廣告
- 教育公平
- 無障礙
- 校園採購
- Data Residency

不可假設：

> 家長同意 = 所有處理都合法。

由 Jurisdiction Pack 決定。

---

# 109. Government / Public Sector Pack

支援：

- Sovereignty
- Procurement
- Records Law
- Public Records
- Accessibility
- Security Classification
- Audit
- Data Residency
- Public Accountability
- Algorithmic Impact Assessment
- Human Oversight

特殊模式：

```text
Government Sovereign
Government Private Cloud
Air-gapped
```

---

# 110. Research Ethics Pack

除法律外，研究還需 Ethics / Institutional Rules。

支援：

```text
Human Subject Research
Informed Consent
IRB / Ethics Review
De-identification
Sensitive Population
Research Data Management
Publication Integrity
Conflict of Interest
```

研究倫理與法律分開建模。

---

# 111. Intellectual Property & Content Rights

必須處理：

```text
Copyright
Database Rights
Trademark
Patent
Trade Secret
Moral Rights
Open Source License
Dataset License
Image License
Video License
Publication License
AI Training Rights
AI Output Terms
```

每個 Source 建立 Rights Metadata：

```yaml
rights:
  owner: ...
  license: ...
  permitted_uses: [...]
  ai_processing_allowed: unknown
  commercial_use: ...
  attribution_required: ...
```

Unknown Rights：

```text
不得自動當成自由使用。
```

---

# 112. Open Source & Software License Governance

CI 需建立：

```text
SBOM
License Inventory
License Compatibility
Copyleft Risk
Notice Generation
Vulnerability Scan
```

確切路徑：

```text
/security/supply_chain/licenses/
```

---

# 113. Cybersecurity / Breach / Incident Regulatory Engine

Incident 不只做技術處理，也要判斷：

```text
Affected Jurisdiction
Data Type
Severity
Critical Infrastructure
Notification Requirement
Regulator
Data Subject Notice
Contractual Notice
Deadline
```

流程：

```text
Incident Detected
↓
Contain
↓
Evidence Preserve
↓
Jurisdiction Resolve
↓
Notification Matrix
↓
Legal Review
↓
Report
↓
Remediation
```

---

# 114. Records Retention / Legal Hold / eDiscovery

資料不能只用固定「30 天刪除」。

每個 Artifact / Dataset 需：

```text
Retention Policy
Legal Hold
Regulatory Hold
Research Hold
Contractual Hold
User Deletion Request
```

衝突時 Policy Engine 決定，並產生理由。

確切路徑：

```text
/modules/legal/
    /retention/
    /legal-hold/
    /ediscovery/
```

---

# 115. Trade / Sanctions / Export Control

全球商業與 AI / 科技尤其需要。

Market / Capability 啟用前檢查：

```text
Destination
Counterparty
Product / Technology
Encryption
AI / Compute
Dual-use Risk
Sanctions
Export Restriction
Import Restriction
End User
End Use
```

高風險情況：

```text
BLOCK
→ Specialist Review
```

不得只靠一般 LLM 判定。

---

# 116. Customs / Trade / Supply Chain

商業企劃模式應加入：

- Customs
- Tariffs
- Rules of Origin
- Incoterms
- Import Licensing
- Export Licensing
- Local Content Rules
- Free Trade Agreements
- Supply Chain Resilience
- Port / Logistics Constraints

---

# 117. Tax / Payments / Commercial Operations

全球落地需支援：

```text
VAT
GST
Sales Tax
Withholding
Corporate Tax Context
Invoice Requirements
Digital Service Tax
Payment Regulations
Currency
Refund
Chargeback
Consumer Protection
```

本系統提供規則與風險分析；高風險稅務結論需專業人士覆核。

---

# 118. Consumer Protection / E-commerce

需分析：

- Advertising
- Misleading Claims
- Subscription Terms
- Auto-renewal
- Cancellation
- Refund
- Price Display
- Digital Goods
- Warranty
- Dark Patterns
- Distance Selling
- Consumer Rights

產品文案輸出進入 Publish 前可由 Compliance Gate 掃描。

---

# 119. Labor / Employment

若系統用於招聘、人事、績效或員工分析：

- Automated Decision Risk
- Discrimination
- Worker Privacy
- Monitoring
- Employment Records
- Labor Consultation
- Human Review
- Appeal

此類 Workflow 應預設高風險。

---

# 120. Competition / Antitrust / Anti-Bribery

商業策略模組需防止：

- Collusion-like Recommendations
- Price Coordination
- Market Allocation
- Bid Rigging
- Improper Government Influence
- Bribery Facilitation
- Conflict of Interest

系統需有 Risk Gate，而不是只追求「最有效策略」。

---

# 121. Accessibility by Design

全球通用不只是翻譯。

UI / Artifact 至少支援：

- Keyboard Navigation
- Screen Reader
- Captions
- Transcript
- High Zoom
- Contrast-safe themes
- Alt Text
- Accessible PDF / DOCX / PPT where possible
- Reduced Motion
- Cognitive Accessibility
- Language Simplicity Modes

Accessibility Standard / 法律依 Jurisdiction Pack 套用。

---

# 122. Localization Architecture

不得把英文／台灣格式硬寫在 Business Logic。

支援：

```text
Language
Script
RTL / LTR
Locale
Collation
Timezone
Calendar
Date
Number
Currency
Tax display
Address
Phone
Name
Pluralization
Units
Paper Size
Keyboard / IME
```

確切路徑：

```text
/modules/localization/
    /locale/
    /language/
    /currency/
    /timezone/
    /calendar/
    /units/
    /address/
    /formatting/
```

---

# 123. Cultural Localization

Translation ≠ Localization。

內容產生需考量：

- 敬語
- 法定用詞
- 地方商業慣例
- 教育體系
- 政府結構
- 文化風險
- 圖像／象徵
- 地方政治敏感性
- 歷史脈絡

但：

> Culture Engine 不得把 stereotype 當成 evidence。

---

# 124. Indigenous / Tribal / Customary Context

某些地區存在：

- Tribal Jurisdiction
- Indigenous Data Sovereignty
- Customary Law
- Community Consent
- Local Governance

系統不能假設國家法律是唯一社會治理來源。

是否具有法律拘束力與適用範圍交由 Jurisdiction Pack + Legal Review 決定。

---

# 125. Political / Election / Government Influence Controls

若產出涉及：

- 選舉
- 公投
- 政治廣告
- 政府遊說
- 公共政策宣傳
- 選民資料

必須啟用：

```text
Political Compliance Pack
```

檢查：

- Applicable Election Rules
- Ad Disclosure
- Data Use
- Funding / Sponsorship
- Foreign Influence Restrictions
- Recordkeeping

---

# 126. Legal Change Management

法律一定會變，因此核心不是「知道現在法律」，而是「可安全更新」。

流程：

```text
Official Source Update
↓
Fetch
↓
Signature / Hash
↓
Diff
↓
Machine Classification
↓
Legal Human Review
↓
Impact Analysis
↓
Regression Tests
↓
Shadow Policy
↓
Canary
↓
Activate
```

任何 Law Pack 都有：

```text
version
effective_from
effective_to
approved_by
signature
```

Rollback：

```text
Policy Pack v12
→ issue
→ rollback v11
```

但不可把 rollback 用來忽略已生效的法律；回滾是技術安全手段，法律適用仍需人工確認。

---

# 127. Signed Offline Law Packs

Offline 版仍需法律能力。

```text
jurisdiction-pack-XX-v123.bundle
```

包含：

- Legal Sources
- Obligation Rules
- Control Mapping
- Effective Dates
- Checksums
- Signatures
- Translation Metadata

Local App 驗證簽章後安裝。

若 Pack 太久未更新：

```text
Freshness Warning
```

高風險 Workflow 可以：

```text
Expired Legal Pack
→ BLOCK
```

---

# 128. Legal Freshness SLA

每個 Legal Source 需：

```text
Last Checked
Next Check
Freshness Class
Criticality
```

例如：

```text
Critical AI / Privacy Law:
higher monitoring frequency

Stable civil-law definition:
lower frequency
```

不是所有法律都用相同刷新頻率。

---

# 129. Compliance Center UI

新增 Workspace：

# Compliance Center

顯示：

```text
Applicable Jurisdictions
Legal Pack Versions
Data Residency
Cross-border Transfers
Consent / Lawful Basis
AI Risk Classification
Sector Requirements
Open Compliance Issues
Upcoming Legal Changes
Human Review Queue
Audit Evidence
```

---

# 130. Global Market Entry Compiler

商業企劃的一個關鍵 Recipe：

```text
Target Market
↓
Jurisdiction Resolution
↓
Company / Entity Requirements
↓
Privacy
↓
AI Regulation
↓
Sector Law
↓
Trade / Sanctions
↓
Tax
↓
Payments
↓
Consumer Protection
↓
Employment
↓
Government / Procurement
↓
IP
↓
Cybersecurity
↓
Localization
↓
Culture / Local Intelligence
↓
Operational Feasibility
↓
Cost / Risk
↓
Go / Conditional Go / No-Go
```

輸出：

```text
Market Entry Passport
```

---

# 131. Market Entry Passport

```yaml
market_entry_passport:
  market: ...
  jurisdictions: [...]
  allowed_capabilities: [...]
  restricted_capabilities: [...]
  prohibited_capabilities: [...]
  data_residency: ...
  required_registrations: [...]
  required_reviews: [...]
  localization: [...]
  major_risks: [...]
  unresolved_questions: [...]
  decision: CONDITIONAL_GO
```

---

# 132. Global Project Passport

每個 Project 建立：

```text
Project Passport
```

包含：

- Jurisdictions
- Sector
- Languages
- Currencies
- Timezones
- Data Classes
- Legal Bases
- AI Risk
- Children
- Government
- Cross-border
- Retention
- Required Approvals
- Allowed Providers

所有 Workflow 自動繼承。

---

# 133. Compliance Decision Artifact

每次高風險執行都產生：

```yaml
compliance_decision:
  execution_id: ...
  applicable_rules: [...]
  controls_evaluated: [...]
  result: ALLOW
  exceptions: []
  human_review: false
  legal_snapshot: ...
```

因此可以回答：

> 為什麼當時允許這個 Workflow 執行？

---

# 134. Legal Uncertainty Is a First-class State

禁止 AI 在法律不明時硬猜。

狀態：

```text
KNOWN
INTERPRETATION_REQUIRED
AMBIGUOUS
CONFLICTING
STALE
UNKNOWN
```

處理：

```text
Low Risk
→ Conservative Mode

High Risk
→ Human Legal Review
```

---

# 135. No Legal Hallucination Rule

寫入 Architecture Constitution：

```text
AI MUST NOT INVENT LAW.
AI MUST NOT PRESENT GUIDANCE AS BINDING LAW.
AI MUST NOT PRESENT A PROPOSED LAW AS EFFECTIVE LAW.
AI MUST NOT OMIT THE JURISDICTION OR EFFECTIVE DATE
WHEN THEY MATERIALLY AFFECT THE ANSWER.
```

重要法律結論至少要有：

```text
Official Source
Jurisdiction
Effective Date
Source Type
Version
```

---

# 136. Legal Expert Escalation

重大領域：

- 法律
- 稅務
- 醫療
- 證券
- 金融
- 政府
- 制裁
- 出口管制
- 高風險 AI
- 兒少
- 人事

可進入：

```text
AI Legal Analysis
↓
Human Counsel Review
↓
Verified Legal Artifact
```

---

# 137. 全球專家議會擴充

Intelligence Council 動態加入：

```text
Local Attorney
Privacy Counsel
AI Regulation Counsel
Tax Advisor
Trade / Customs Expert
Labor Expert
Government Procurement Expert
Cybersecurity Regulator Perspective
Local Government
Local Citizen
Industry Regulator
Field Executor
```

AI 模擬專家仍須標示為 hypothetical，不得冒充真實專業意見。

---

# 138. International Standards Crosswalk

法律之外，可支援 standards / frameworks：

```text
ISO/IEC 27001
ISO/IEC 27701
ISO/IEC 42001
ISO/IEC 23894
NIST AI RMF
NIST CSF
SOC 2 control mapping
WCAG
Industry-specific standards
```

重要：

```text
LAW ≠ STANDARD ≠ GUIDANCE ≠ CONTRACT ≠ INTERNAL POLICY
```

系統必須分開標記。

---

# 139. 代表性全球法規來源：系統設計驗證樣本

本系統不可把以下清單視為全球完整清單；它們只是 Jurisdiction Engine 的 regression / design sample。

截至本計畫更新時，可使用官方來源建立測試 Pack，例如：

- 歐盟：GDPR 官方資料保護框架  
  `https://commission.europa.eu/law/law-topic/data-protection_en`
- 歐盟：AI Act 官方說明與適用時程  
  `https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai`
- 美國：NIST AI RMF（屬風險管理框架，不是一般意義的強制法規）  
  `https://www.nist.gov/itl/ai-risk-management-framework`
- California：CPPA / CCPA 官方資料  
  `https://cppa.ca.gov/`
- 英國：ICO UK GDPR / Data Protection Guidance  
  `https://ico.org.uk/`
- 印度：MeitY Digital Personal Data Protection Rules  
  `https://www.meity.gov.in/documents/act-and-policies`
- 巴西：ANPD / LGPD  
  `https://www.gov.br/anpd/`
- 新加坡：PDPC / PDPA  
  `https://www.pdpc.gov.sg/`
- 澳洲：OAIC / Australian Privacy Principles  
  `https://www.oaic.gov.au/privacy/australian-privacy-principles`

每個 Jurisdiction Pack 必須優先使用該地官方法源／主管機關來源。

---

# 140. 全球測試矩陣

新增：

```text
/tests/global/
    /jurisdiction/
    /temporal-law/
    /conflict-of-laws/
    /privacy-rights/
    /cross-border/
    /data-residency/
    /ai-risk/
    /children/
    /government/
    /trade/
    /tax/
    /localization/
    /accessibility/
```

Golden Cases 必須包含：

```text
Single-country
Federal + State
EU + Member State
Cross-border
Children
Government
Restricted Data
Air-gapped
Law Changed Mid-project
Conflicting Rules
Unknown Jurisdiction
Expired Offline Pack
```

---

# 141. Global Compliance Regression Gate

任何版本不得上線，除非：

```text
Jurisdiction Resolution Tests = PASS
Legal Temporal Tests = PASS
Cross-border Tests = PASS
Data Residency Tests = PASS
Rights Request Tests = PASS
AI Classification Tests = PASS
Sector Pack Tests = PASS
Rollback Tests = PASS
```

---

# 142. Global Deployment Admission Control

在部署新市場前：

```text
Country / Region Request
↓
Jurisdiction Pack Exists?
↓
Legal Freshness Valid?
↓
Data Region Available?
↓
Required Provider Available?
↓
Security Controls Available?
↓
Localization Complete?
↓
Sector Pack Complete?
↓
Human Legal Sign-off?
↓
Enable Market
```

若任一 Critical 項失敗：

```text
DO NOT ENABLE
```

這是最小爆炸半徑。

---

# 143. Capability Availability Matrix

每個 Capability 不一定全世界可用。

```yaml
capability_availability:
  capability: biometric_identification
  jurisdiction: ...
  status: prohibited
```

或：

```text
Allowed
Restricted
Human Review
Local-only
Government-only
Prohibited
Unknown
```

---

# 144. Compliance-aware AI Router

AI Router 不只看：

```text
Quality
Cost
Latency
```

還要看：

```text
Jurisdiction
Data Residency
Provider Terms
Model Location
Subprocessors
Data Retention
Training Use
Security Certification
```

輸出：

```text
Eligible Provider Set
```

再從中做成本／品質最佳化。

---

# 145. Provider & Subprocessor Registry

每個第三方服務建立：

```text
Provider
├── Legal Entity
├── Regions
├── Data Processing Terms
├── Retention
├── Training Policy
├── Subprocessors
├── Security
├── Certifications
├── Incident History
└── Contract Version
```

Provider Terms 變更也需進 Change Management。

---

# 146. Contract & DPA Engine

Enterprise 支援：

```text
MSA
DPA
SCC / Transfer Terms
Subprocessor Terms
SLA
Security Addendum
Data Residency Addendum
Government Clauses
```

系統將 Contract Obligations 也編譯成 Policy。

---

# 147. Contractual Policy != Law

例如客戶契約可能要求：

```text
EU-only storage
90-day deletion
No external AI
```

即使法律沒有要求，也必須執行。

因此 Applicable Controls：

```text
Law
+
Regulation
+
Contract
+
Organization Policy
+
User Policy
```

但保留來源層級，不能混淆。

---

# 148. Encryption & Key Sovereignty

支援：

```text
Platform-managed Keys
BYOK
HYOK
Customer HSM
Local-only Keys
Region-bound Keys
```

高主權環境：

```text
Customer controls key
Provider cannot decrypt independently
```

## 148.1 Per-Subject DEK Lifecycle

個資欄位（依 §61 分級為 Confidential/Restricted 者）寫入 Event Ledger 前，以該 data subject 專屬的 Data Encryption Key（DEK, AES-256-GCM）加密；DEK 本身用 tenant 級 Key-Encryption-Key（KEK）包住（envelope encryption，格式見 §27.1），KEK 依本節既有主權模型存放於獨立 Key Vault，不進 Event Ledger（key record 機器可讀結構見 `specs/security/key-vault-lifecycle.schema.yaml`）。

```text
Issue per-subject DEK
↓
Wrap DEK by tenant KEK
↓
Encrypt Confidential/Restricted field with DEK
↓
[DEK Active — 可解密]
↓（資料主體提出刪除請求）
Destroy DEK 的所有物理副本（live + 備援／災復快照）
↓
寫入 Key Destruction Record 至獨立稽核日誌
↓
[DEK Destroyed — 不可逆]
```

刪除請求 = 銷毀該 subject 的 DEK 記錄；Event 結構本身不動。projection 讀到已銷毀 DEK 的欄位時 decrypt 失敗，依 policy 填入 `REDACTED` sentinel，不中斷 Replay（§112）。

---

# 149. Privacy-preserving Computation

隱私保護運算技術依成熟度分為兩層（ADR-007 裁決，2026-08-29 ACCEPTED）：

v1_baseline（Must，本次即可用，已是法規承認的基準安全措施）：

- Pseudonymization
- Tokenization

future_advanced（Won't，需個案通過成本、維護、威脅模型驗證後才排入 roadmap）：

- Differential Privacy
- Secure Enclaves
- Federated Analysis
- Federated Learning
- Secure Multi-party Computation
- Homomorphic Encryption（只在適用成本與成熟度下）

不得為了「先進」而無條件採用 future_advanced 清單中的高複雜技術；需通過成本、維護、威脅模型驗證後才可排入 roadmap。v1_baseline 兩項為現行可用之基準安全措施，其 v1 去識別化機制見 `policies/privacy/pii-redaction.policy.yaml`。

---

# 150. 全球時間、法規與資料快照

任何重大 Artifact 都需可選擇固化：

```text
Knowledge Snapshot
Legal Snapshot
Policy Snapshot
Dataset Snapshot
Model Profile
Provider Contract Snapshot
```

完整 Reproduction：

```text
Artifact
↓
Execution Manifest
↓
Knowledge Snapshot
↓
Legal Snapshot
↓
Policy Snapshot
↓
Dataset
↓
Model / Compute
```

---

# 151. 全球失敗模式與降級

例：

## Legal Pack 失效

```text
High-risk Workflow → BLOCK
Low-risk → Warning + Conservative Mode
```

## Cloud Region 故障

```text
Failover only to legally eligible region
```

不可為了可用性把資料切到不合法區域。

## AI Provider 故障

```text
Fallback only within Eligible Provider Set
```

## 法規衝突

```text
Freeze irreversible action
→ Legal Review
```

## Offline 且 Pack 過期

```text
Research / Draft may continue
Publishing / regulated action may be blocked
```

---

# 152. 全球可觀測性

新增 Compliance Metrics：

```text
Legal Pack Freshness
Jurisdiction Resolution Errors
Policy Denials
Cross-border Blocks
Rights SLA
Human Legal Review Queue
Provider Eligibility
Data Residency Violations
Compliance Regression
```

確切路徑：

```text
/platform/observability/compliance/
```

---

# 153. 全球 Audit

Audit Event 必須增加：

```text
jurisdiction_snapshot
legal_snapshot
policy_snapshot
provider_route
data_region
key_region
human_approvals
```

可生成：

```text
Regulatory Evidence Package
```

---

# 154. 法規事件與業務事件分離

Legal Change Event：

```text
LawPublished
LawEffective
LawAmended
LawRepealed
RegulatorGuidanceUpdated
ProviderTermsChanged
```

Business Event：

```text
ArtifactPublished
DatasetProcessed
AIExecuted
```

透過 Impact Graph 連結。

---

# 155. Regulatory Impact Graph

當法律改變：

```text
Law Change
↓
Obligations
↓
Policies
↓
Capabilities
↓
Workflows
↓
Projects
↓
Artifacts
↓
Customers
```

系統立即知道：

> 哪些東西受影響？

這是 30 年維護的核心。

---

# 156. No Patch Change Discipline

全球法規不能用：

```text
if country == "XX":
    special_case()
```

長期會變成不可維護。

禁止規則：

```text
NO JURISDICTION-SPECIFIC BUSINESS LOGIC
OUTSIDE VERSIONED JURISDICTION / POLICY PACKS.
```

例外必須：

- 有 ADR
- 有 expiry
- 有 owner
- 有 test
- 有 migration plan

---

# 157. Architecture Decision Records

所有重大設計決策：

```text
/docs/adr/
```

格式：

```text
Context
Decision
Alternatives
Security Impact
Legal Impact
Operational Impact
Migration
Rollback
Expiry / Revisit Date
```

---

# 158. Global Definition of Done

一個功能不能因為「程式可跑」就完成。

必須：

```text
Functional PASS
Security PASS
Privacy PASS
Jurisdiction PASS
Localization PASS
Accessibility PASS
Data PASS
Observability PASS
Rollback PASS
Documentation PASS
Golden Test PASS
```

高風險另加：

```text
Human Specialist Review PASS
```

---

# 159. 修正版完整交付路徑

全球能力核心路徑：

```text
/modules/
    jurisdiction/
    compliance/
    privacy/
    legal/
    trade/
    tax/
    localization/
    accessibility/

/config/
    jurisdiction/
    legal/
    compliance/
    localization/

/specs/
    jurisdiction/
    legal/
    privacy/
    cross-border/
    ai-regulation/
    sector-packs/
    localization/
    accessibility/

/tests/global/
    jurisdiction/
    legal/
    privacy/
    cross-border/
    sector/
    localization/

/platform/
    sovereignty/
    regional-cells/
    legal-updates/
    observability/compliance/
```

---

# 160. 修正版預期結果

完成此全球層後，系統應做到：

1. **同一核心全球部署**  
   不需要每個國家維護一套程式。

2. **法規可替換、可版本化**  
   法律更新只改 Jurisdiction / Policy Pack，而非到處補 if/else。

3. **歷史可重現**  
   可知道當年使用哪版法律、Policy、模型、資料。

4. **跨境可控**  
   資料不會因故障 Failover 到不允許的地區。

5. **Local / Cloud / Hybrid 一致**  
   同一 Compliance Contract。

6. **高風險不猜**  
   法律不確定就進 Human Review。

7. **全球商業可分析**  
   法律、稅、貿易、政策、文化、執行共同進入 Market Entry Compiler。

8. **政府／教育／研究可用**  
   高主權、兒少、研究倫理、採購等皆可套 Pack。

9. **法規變動可安全上線與回滾**  
   有 Diff、Impact、Golden Test、Shadow、Canary。

10. **30 年可維護**  
    即使法律、AI 供應商、Cloud、資料庫改變，Knowledge / Evidence / Artifact / History 仍然存活。

---

# 161. 全球版工程憲法新增條款

```text
GLOBAL CORE MUST REMAIN JURISDICTION-NEUTRAL.

LOCAL LAW MUST BE EXPRESSED
THROUGH VERSIONED JURISDICTION AND POLICY PACKS.

NO IMPORTANT LEGAL CLAIM
MAY DEPEND ON MODEL MEMORY ALONE.

LAW, GUIDANCE, STANDARD,
CONTRACT AND INTERNAL POLICY
MUST NEVER BE SILENTLY CONFLATED.

NO FAILOVER MAY VIOLATE
DATA RESIDENCY OR SOVEREIGNTY.

UNKNOWN LEGAL STATUS
IS A VALID SYSTEM STATE.

HIGH-RISK AMBIGUITY
MUST ESCALATE TO A HUMAN SPECIALIST.

LEGAL CHANGE MUST BE
DIFFABLE, TESTABLE, VERSIONED,
AUDITABLE AND IMPACT-TRACEABLE.

GLOBAL AVAILABILITY
MUST NEVER OVERRIDE
LOCAL LEGAL COMPLIANCE.

MASTER PLAN MUST NOT
DUPLICATE THE FULL COGNITIVE METHOD CATALOG.

COGNITIVE METHOD SELECTION,
METHOD SEMANTICS AND METHOD-SPECIFIC GATES
MUST RESOLVE THROUGH THE APPROVED
COGNITIVE METHOD ATLAS / MACHINE-READABLE SPECS.

IF THE REQUIRED METHOD ATLAS
CANNOT BE LOADED,
METHOD-DEPENDENT HIGH-RISK PLANNING
MUST FAIL CLOSED.
```

---

# 162. 最終全球產品定義

本系統的全球版本正式定義為：

> **A Local-first, Cloud-enhanced, Jurisdiction-aware, Policy-driven, Human-governed, Evidence-native, Reproducible Human–AI Intelligence Operating System.**

它不是聲稱：

> 「全球任何地方都一定合法。」

而是工程上做到：

> **任何地方都能以相同核心接入正確的當地法律、州省／地方規則、產業規範、資料主權、文化與執行條件；若無法確認，系統會安全地限制、停止或要求真正的人類專家覆核，而不是猜。**

這才是符合 30 年工程紀律的 worldwide-capable architecture。

---

**End of Global Master Plan**

