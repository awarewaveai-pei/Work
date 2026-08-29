# REPOSITORY_ARCHITECTURE
Status: PROPOSED
Date: 2026-08-29

> 依 `source-directive-2026-08-28.md` §XII 產出（Phase 4 交付物清單第 7 項）。本文件遵守該指令「不要因為原文件寫了某個 path 就盲目照抄，先驗證 bounded contexts」與 ADR-006 §(b) 折衷方案的過渡處置——三母文件現有的具體路徑（§80 程式碼目錄、Atlas §17 確切工程路徑、EC §95 Execution Runtime Modules 等）一律視為**草稿訊號**，本文件逐一驗證後才決定保留、合併、搬移或推翻，不是逐字轉抄。
>
> 唯讀邊界確認：本次任務全程僅 Read/Grep，未建立任何目錄或檔案，未修改三母文件。若操作者核准，下一步是把本文件內容落地為 `.ai/research/phase-2/repo-layout-draft.yaml`（ADR-006 已預留的落點），而非直接建立實體目錄——Phase 4 才是這份 spec 的正式擁有者。

---

## Bounded Context Analysis

### 方法：兩層測試，不是「一物件一模組」

Domain Model 有 22+1 個物件（Master Plan §3；Tenant 為 ADR-003 新增的第 23 個物件）。直覺反應是「23 物件 → 23 模組」，但這正是本文件要拒絕的第一個方案（詳見 Rationale）。改用兩層測試：

1. **Shared Kernel 測試**：這個物件是否被 3 個以上互不相關的 vertical 同時讀寫？是 → 它是「名詞」不是「模組」，只能有一個 schema/invariant 正本，放 `/core/domain/`，所有 vertical 透過 `/core/contracts`（Port）存取，不得各自複製一份定義。
2. **Engine 複雜度測試**：對這個物件的操作本身是否複雜到需要獨立的執行引擎（不只是 CRUD + 掛勾 Workflow）？是 → 除了 `/core/domain` 的 schema 外，額外配一個 `/modules/<engine>`。

用這兩層測試逐一驗證現有 22+1 物件，結果如下表：

| Domain Object | Shared Kernel？ | 獨立 Engine？ | 落點 |
|---|---|---|---|
| Tenant | 是（最外層，ADR-003 blast-radius 第一層；Master Plan §1.5） | 否 | `/core/domain/tenant` |
| Workspace | 是（每個 vertical 都要知道「這個東西屬於哪個 workspace」） | 否 | `/core/domain/workspace` |
| Project | 是 | 否 | `/core/domain/project` |
| Source | 是（溯源鏈起點） | 否 | `/core/domain/source` |
| Evidence | 是 | 否 | `/core/domain/evidence` |
| Claim | 是 | 否 | `/core/domain/claim` |
| Knowledge | 是（schema） | **是**（RAG/Graph/Embedding 引擎規模夠大，值得獨立 vertical） | `/core/domain/knowledge`（schema）+ `/modules/knowledge`（engine） |
| Artifact | 是 | 否（產出端物件，被 Authorship/Rendering Worker 共用） | `/core/domain/artifact` |
| Capability | 是（Control Plane） | 否 | `/core/domain/capability` |
| Workflow | 是（Control Plane） | 否（Workflow IR 是 `/platform/workflow` 的引擎，物件本身仍是 kernel schema） | `/core/domain/workflow` |
| Execution | 是（Control Plane + blast-radius 最內層） | 否 | `/core/domain/execution` |
| Policy | 是（Control Plane + Trust Fabric） | 否 | `/core/domain/policy` |
| Identity | 是（Control Plane + Trust Fabric） | 否 | `/core/domain/identity` |
| Decision | 是（被 Authorship/Audit/幾乎每個 vertical 引用） | 否 | `/core/domain/decision` |
| HumanContribution | 是（Canvas 的核心承載物件） | 否 | `/core/domain/human-contribution` |
| Annotation | 是 | 否 | `/core/domain/annotation` |
| Idea | 是 | 否 | `/core/domain/idea` |
| Dataset | 否（只被 Data Science cluster 使用） | **是** | `/core/domain/dataset`（schema）+ `/modules/data-science/datasets`（engine） |
| AnalysisPlan | 否 | **是** | `/core/domain/analysis`（schema）+ `/modules/data-science/analysis`（engine） |
| AnalysisRun | 否 | **是** | 同上 |
| Simulation | 否 | **是** | `/core/domain/simulation`（schema）+ `/modules/data-science/simulation`（engine） |
| Experiment | 否 | **是** | `/core/domain/experiment`（schema）+ `/modules/data-science/experiments`（engine） |
| Outcome | 否（Data Science 專屬產出） | 否（薄物件，掛在 AnalysisRun/Experiment 底下即可） | `/core/domain/outcome` |

**結論**：23 個物件裡，17 個是純 Shared Kernel（只需要 schema，不需要專屬 vertical）；Knowledge 是「schema 在 kernel、engine 獨立」的特例；剩下 5 個（Dataset/AnalysisPlan/AnalysisRun/Simulation/Experiment）自然聚成同一個 bounded context——這正是現有 `/modules/analytics/` 想做卻沒做完整的事。

### 驗證現有 20 個 `/modules` 目錄（P1-GAP-ARCH-10 的具體檢驗）

Master Plan §80 已列出一份候選 `/modules` 清單（canvas / knowledge / research / business / learning / brainstorm / analytics / simulation / optimization / decision / stakeholders / artifact / authorship / jurisdiction / compliance / privacy / localization / accessibility / trade / tax / legal / standards）。逐條套用上面兩層測試：

| 現有 `/modules/*` | 測試結果 | 判定 |
|---|---|---|
| `canvas` | 非 Domain 物件，是 HumanContribution 的**承載介面**（Master Plan §11） | 保留為 vertical——但只做 UI 編排，不擁有資料，資料仍在 `/core/domain/human-contribution` |
| `knowledge` | 見上表 | 保留，改為純 engine（schema 移出到 core） |
| `research` / `business` / `learning` / `brainstorm` | 皆非 Domain 物件，是 source-directive §XIII 定義的 **Recipe vertical** | 保留為 vertical，定位為「薄編排層」 |
| `stakeholders` | 對應 Master Plan 獨立 Plane（`STAKEHOLDER INTELLIGENCE PLANE`），非 Domain 物件 | 保留為 vertical |
| `analytics` | 內嵌 `datasets/cleaning/statistics/ml/causal/timeseries/experiments/visualization`（§28），深度 3 層 | **問題根源**：Experiment 被埋 3 層深，Simulation 卻在別處是頂層兄弟（見下） |
| `simulation` | 獨立頂層 `/modules/simulation/`（§33） | **與 `analytics` 是同一個 bounded context 卻被拆成兩個不同深度的頂層目錄**——這就是 P1-GAP-ARCH-10 引用的矛盾範例（「Simulation 獨立擁有頂層 `/modules/simulation/`，但 Experiment 被埋在三層深的 `/modules/analytics/experiments/`」） |
| `optimization` | 同時出現在 `/modules/optimization`（§80）與 `/compute/optimization`（§80） | 重複站點，判定：`/compute/optimization`（求解器執行）與 `/modules/data-science/optimization`（業務情境包裝，如「價格最佳化」Recipe）其實是不同東西，**不是重複**，只是命名相同造成誤讀——需分開保留並在文件中明示差異 |
| `decision` | Decision 是 Shared Kernel 物件（見上表） | **應移除**此 `/modules/decision`，併入 `/core/domain/decision`；不需要獨立 vertical |
| `artifact` | Artifact 是 Shared Kernel 物件 | **應移除**此 `/modules/artifact`，併入 `/core/domain/artifact` |
| `authorship` | 對應獨立 Plane（§12），非 Domain 物件，但邏輯上是「記錄其他一切動作的 metadata 層」 | 保留為 vertical，但定位為橫切關注點（見下） |
| `jurisdiction` / `compliance` / `privacy` / `localization` / `accessibility` / `trade` / `tax` / `legal` / `standards`（9 個） | 全部對應 `GLOBAL JURISDICTION & COMPLIANCE PLANE`（§4）與 Trust Fabric（「任何 Capability 在執行前都必須先通過 Trust Fabric」） | **不應該是 `/modules` 的平行項**——它們是強制關卡，不是使用者可選的功能垂直線（使用者可以不去 Brainstorm，但 Capability 不能跳過 Privacy 檢查）。移到 `/platform/trust-fabric/`（見下）|

**額外發現（P1-DUP-5 的具體佐證）**：`localization` 在 Master Plan `/config/localization/`（5 個扁平檔案）與 Atlas `/modules/localization/`（8 個子目錄）各自定義一次，根路徑、項目數、粒度三者皆不同（`DUPLICATION_REGISTER.yaml`）。本提案透過「Trust Fabric 只能有一個結構化正本」原則直接解決：兩份定義都作廢，改採 `/platform/trust-fabric/localization/`，粒度採 Atlas 版本（8 個子目錄，較完整），accessibility 移出獨立成 Trust Fabric 底下的兄弟目錄（因為它同時被 Atlas `/lenses/accessibility` 與 Master Plan `/modules/accessibility` 各提一次，屬性更接近合規關卡而非在地化子項）。

### 三份母文件對「Cognitive Method System 該放哪」互相衝突——採 Atlas 版本為正本

Master Plan §80 把方法系統拆成三個平行頂層目錄：`/specs/cognitive/*.schema.yaml`、`/methods/registry|contracts|versions`、`/compiler/method-selector|compatibility|mandatory-gates`。而 Method Atlas §17 把幾乎同一組概念（kernel/methods/domain-packs/lenses/representations/evidence/profiles/recipes/compiler/runtime/evaluation）全部收進**單一 `/cognitive/` 命名空間**下。

依 source-directive §X 的分工聲明——「Method Atlas：負責完整 Cognitive Method System」——**Atlas 對這塊擁有 authoritative source 地位，Master Plan 的版本只是敘事層提及**（Master Plan 自己在 §8.5 也明講「AI 必須到 Atlas 讀取該 Method 的 Contract」）。因此本提案採 Atlas §17 的巢狀 `/cognitive/` 結構為正本，Master Plan §80 提到的 `/methods/registry`、`/compiler` 降級為**機器可讀「目錄/合約」層**（見下段解釋為何這不是重複而是分層）。

### `/methods`、`/recipes` 頂層目錄 vs `/cognitive/methods`、`/cognitive/recipes`——分層而非重複

Source directive §XI 把 `/methods/{contracts,registry}` 與 `/recipes/{validated}` 列為 Phase 3 machine-readable foundation 的一部分，這與 Atlas `/cognitive/methods/<category>/`、`/cognitive/recipes/<domain>/` 表面上撞名。驗證後判定這不是衝突，是兩個不同層次：

- `/methods/registry`、`/methods/contracts`、`/methods/versions`（頂層）＝**目錄層**——「這個平台目前有哪些 method_id、每個的 contract 長什麼樣、哪個版本被鎖定」，是純資料（YAML），被 Workflow IR、Capability Contract 引用。
- `/cognitive/methods/<category>/`（Atlas 巢狀）＝**實作層**——每個 method family（framing/decomposition/root_cause/…）的實際推理邏輯/prompt/選擇規則原始碼。

一個 method 從「寫程式」到「可被引用」要經過：`/cognitive/methods/<category>/` 開發 → 通過 `/cognitive/compiler/validator` → 註冊進 `/methods/registry`。`/recipes` 比照同一模式（`/cognitive/recipes/<domain>/` 是 Recipe 草稿與領域範本，`/recipes/validated/` 才是被 Workflow 允許直接引用的正式目錄）。這個分層在文件中必須明講，否則未來實作者一樣會誤判為重複而各自維護一份。

---

## Proposed Directory Tree

```text
/apps                          # Experience Plane（Master Plan §4）— 零 business logic，只呼叫 /core/application
    /web
    /desktop                   # 承載 §5.2 完全離線需求（轉錄/OCR/統計/Local LLM 皆需離線可用）
    /mobile
    /api                       # 對外 REST/GraphQL gateway，與 web/desktop 共用同一組 /core/contracts

/core
    /domain                    # Shared Kernel —— 23 個 Domain Model 物件的唯一 schema/invariant 正本
        /tenant                # ADR-003 新增物件 #23；tenant_id/home_jurisdiction/data_residency_region/encryption_root_key_ref
        /workspace
        /project
        /source
        /evidence
        /claim
        /knowledge            # 僅 schema；engine 見 /modules/knowledge
        /artifact
        /capability
        /workflow
        /execution
        /policy
        /identity
        /decision
        /human-contribution
        /annotation
        /idea
        /dataset              # 僅 schema；engine 見 /modules/data-science
        /analysis             # AnalysisPlan + AnalysisRun 成對生命週期
        /simulation
        /experiment
        /outcome
    /application                # Use-case 編排層——Workers 與 /apps/api 都呼叫這層，不是直接戳 /modules 內部
    /contracts                  # Ports：所有 /modules、/platform/workers 必須實作的介面（Stable Ports/Adapters 原則）

/modules                       # Bounded Contexts = 能力垂直線；只透過 /core/contracts 存取 kernel，不得複製一份物件定義
    /canvas                    # §11 Multimodal Knowledge Canvas —— HumanContribution 承載介面
    /knowledge                 # Knowledge 物件的 RAG / Graph / Embedding engine
    /research                  # Research Recipe vertical
    /business                  # Business Recipe vertical
    /learning                  # Learning Recipe vertical
    /brainstorm                # Idea 物件的編排介面（Ideation UI + workflow 掛勾）
    /stakeholders              # Stakeholder & Expert Intelligence Plane
    /data-science              # 合併 bounded context：Dataset+AnalysisPlan+AnalysisRun+Simulation+Experiment+Outcome
        /datasets
        /analysis
        /statistics
        /ml
        /causal
        /timeseries
        /experiments          # 與 /simulation 同深度，修正 P1-GAP-ARCH-10 的深度不一致
        /simulation
        /optimization         # 業務情境包裝（價格/庫存/人力最佳化），呼叫 /compute/optimization 的求解器
        /visualization
    /authorship                # §12 Authorship & Integrity Plane —— 記錄跨模組動作來源，橫切但走 vertical 形式落地

/cognitive                      # Method Atlas 擁有的權威結構（採 Atlas §17 原樣，Master Plan §80 的平行版本作廢）
    /kernel/{primitives,types,contracts,invariants}
    /methods/{framing,decomposition,ideation,association,root_cause,human_insight,
              stakeholders,strategy,systems,epistemic,causal,challenge,foresight,
              feasibility,validation,decision,learning}      # 實作層，非目錄層
    /domain-packs/{architecture,devops-sre,security,database-data,pm-governance,
                   research,business,policy,education,healthcare,finance,supply-chain}
    /lenses/{stakeholder,profession,government,local,culture,legal,security,
             privacy,ethics,accessibility}
    /representations/{text,outline,table,matrix,mindmap,conceptmap,timeline,
                       causal,graph,canvas,audio}
    /evidence/{retrieval,claims,counterevidence,quality,provenance}   # method 執行時的證據操作，非 /core/domain/evidence 的 schema
    /profiles/{cognitive,representation,rigor,accessibility}
    /recipes/{generic,research,business,policy,engineering,education,decision}   # 草稿/範本層，非 /recipes/validated 正式登記
    /compiler/{intent,problem-classifier,method-selector,graph,compatibility,
               optimizer,validator,mandatory-gates}
    /runtime/{execution,branch,checkpoint,replay,rollback}    # 方法執行專屬 runtime，不同於 /platform/ai-execution
    /evaluation/{golden,regression,adversarial,safety,privacy,jurisdiction}

/ai                             # AI Gateway 基礎設施（Master Plan §7）—— 模型管線，非推理策略
    /gateway
    /providers
    /models
    /routing
    /budgets
    /evaluation

/compute                        # Trusted Compute Engine（§26-32）—— 確定性數學沙盒，與 AI 幻覺風險隔離
    /python
    /r
    /sql
    /statistics
    /ml
    /causal
    /optimization               # 純數學求解器；業務包裝在 /modules/data-science/optimization

/platform                       # Modular Monolith 自身的運行骨幹
    /workflow                   # Workflow IR compiler/runtime（§9），所有 /modules 共用
    /event-bus                  # §67 提到 Event Bus 卻從未給路徑——本提案補上
    /observability
    /backup
    /recovery
    /workers                    # Isolated Workers —— 詳見 Worker Placement 節
        /ai
        /document
        /research
        /data
        /rendering
        /simulation
    /ai-execution                # EC §95 —— AI/Agent 工程紀律 runtime，治理「怎麼把工作做出來」，非產品 domain logic
        /document_resolver
        /normative_context
        /current_state
        /task_classifier
        /risk_engine
        /method_resolver
        /plan_compiler
        /authority
        /tool_broker
        /execution_runtime
        /gate_engine
        /rollback
        /audit
        /handoff
        /replay
    /trust-fabric                 # 強制關卡引擎（Policy Engine 呼叫，非使用者可選 vertical）—— 解決 P1-DUP-5
        /jurisdiction
        /compliance
        /privacy
        /legal
        /localization             # 採 Atlas 8 子目錄版本為正本，MP 5 檔版本作廢
        /accessibility
        /trade
        /tax
        /standards

/data                            # 物理儲存層
    /object                      # CAS —— 依 ADR-003 Option A 強制 tenant-scoped：/object/<tenant_id>/sha256/aa/bb/<hash>
    /repositories                 # 關聯式儲存
    /graph
    /vector
    /events                       # Event Bus 的事件儲存
    /search

/security
    /identity                     # AuthN/AuthZ 實作（區別於 /core/domain/identity 的 schema）
    /policy                       # RBAC/ABAC 存取控制（區別於 /policies/ai-execution 與 /platform/trust-fabric/compliance）
    /audit
    /secrets
    /supply_chain                 # SBOM / Dependency Scan / Artifact Signing（§62-66）

/specs                           # 機器可讀 schema 登記處，各子系統各自的 schema 放對應子目錄
    /domain
    /cognitive                    # Atlas 擁有
    /evidence
    /decision
    /jurisdiction
    /execution                    # EC 擁有（task/document-registry/current-state/risk/authority/…schema）
    /governance                   # document-registry.yaml
    /artifacts
    /capabilities
    /workflows
    /analytics
    /provenance
    /authorship
    /stakeholders

/policies                        # Policy-as-Code（宣告層，被 /platform/ai-execution 與 /security 引擎讀取執行）
    /ai-execution                 # EC §91
    /security
    /privacy
    /jurisdiction
    /provider
    /release

/methods                          # 機器可讀「方法登記處」（目錄/合約/版本鎖定），非實作——實作在 /cognitive/methods
    /registry
    /contracts
    /versions

/recipes                          # 已驗證、可被 Workflow IR 直接引用的正式 Recipe 登記處
    /validated

/docs
    /architecture
    /adr
    /runbooks
    /governance/ai-execution       # EC §93

/tests
    /architecture                  # EC §90 —— fitness function，強制本文件自己定的模組邊界規則
    /contracts
    /governance/ai-execution
    /golden-cases

/infra                             # Build/Provision 時期（IaC），與 /platform（Run-time 引擎）明確區分
    /iac
    /ci
    /container-images
    /config-as-code                # §81 Config 路徑（deployment/ai/privacy/compute/licensing/storage/jurisdiction/legal/compliance/localization）

/.ai                                # Runtime workspace，非永久 identity（EC §12 明文）
    /tasks/{task_id}/               # TASK.md、manifest、current-state、risk-assessment、methods、change-plan、rollback-plan、gates、evidence、results、handoff
    /proposals/<NNN>-<slug>/        # ADR-006 Option A —— 母文件修改提案
    /research/phase-N/               # 本研究軌跡自身（phase-0、phase-1、phase-2…）
```

---

## Worker Placement

Master Plan §67 名列 6 個 Worker：AI / Document / Research / Data / Rendering / Simulation，但只給名字沒給邊界規則。本提案的原則：**Worker 是「隔離／部署」邊界，不是「邏輯」邊界**——每個 Worker 是一個獨立 process/container，訂閱 `/platform/event-bus`，但它呼叫的業務邏輯必須來自 `/core/application` 或某個 `/modules/*`／`/compute/*`／`/ai/*`／`/cognitive/*`，Worker 目錄本身只放：佇列消費入口、訊息序列化、重試/退避、以及對應 use-case 的一行呼叫。

**理由（不可退讓的一條）**：§5.2/§5.4 要求完全離線（轉錄/OCR/統計/Local LLM 全部要能離線跑），離線環境沒有訊息佇列基礎設施。若業務邏輯寫死在 Worker 裡，離線模式就要重寫一份——這正是「Ports/Adapters」原則要防的事。正確做法是同一個 use-case function 有兩個 adapter：一個「in-process 直接呼叫」（離線/本機走這條）、一個「event-bus 佇列呼叫」（雲端/Hybrid 走這條），Worker 只是後者的殼。

| Worker | 主要 Bounded Context | 隔離理由 |
|---|---|---|
| **AI Worker** | `/ai`（gateway 呼叫）+ `/cognitive`（method 執行） | 外部 API 延遲/rate limit 不可靠，需與主請求路徑解耦 |
| **Document Worker** | 攝入/正規化管線（`/modules/knowledge` 的 ingest 子流程，對應 Source→Evidence 溯源鏈起點） | 轉錄/OCR/語音辨識為 CPU/IO 密集，且是 §5.2 離線清單的核心項目——offline adapter 與此 Worker 必須共用同一 use-case |
| **Research Worker** | `/modules/research` + `/modules/knowledge`（retrieval） | 長時間執行、依賴外部學術/文獻 API（rate-limited），需要獨立重試策略 |
| **Data Worker** | `/compute`（Trusted Compute Engine：python/r/sql/stats/ml/causal） | **安全隔離優先於效能隔離**——執行任意 Python/R/SQL 有明確不同信任邊界，必須符合 §1.5 最小爆炸半徑原則，不能與其他 Worker 共用執行環境 |
| **Rendering Worker** | `/modules/data-science/visualization` + Artifact 產出管線（PDF/PPT/Word 生成） | CPU/記憶體密集，不應阻塞請求路徑 |
| **Simulation Worker** | `/modules/data-science/simulation`（Monte Carlo/Scenario/Sensitivity/Stress Test） | 單次執行可能長達數分鐘至數小時，且負載呈季節性尖峰 |

**Worker 是否跨模組？**——會，但只透過既有 Port，不得走捷徑。例如 Research Worker 完成文獻檢索後，若需要立即跑主題分析，它呼叫的是 `/cognitive` 的 `method_id: research.thematic_analysis`（Workflow IR 範例），而不是自己重新實作一份方法邏輯——這是防止 Worker 演變成「第二套、逐漸與主線分岔的業務邏輯」的關鍵紀律（Modular Monolith 退化成分散式泥球的典型路徑）。

---

## Microservice Extraction Threshold

P1-GAP-ARCH-13 指出「真正需要時再抽離 Service」全文找不到任何量化訊號。本節直接補上這些訊號，且刻意採**多訊號聯集**而非單一數字：單看 QPS 就下判斷，正是任何工程師都能各自解讀合理化的根因。

一個 Worker/Module 要從「Isolated Worker（同 repo、同部署管線）」升級為「獨立 Service（獨立 repo、獨立版本、獨立 on-call）」，必須**同時**滿足以下四個訊號中至少三個，或單獨觸發訊號 (d)：

**(a) 團隊／Conway 訊號**：該 bounded context 需要一個不與 Monolith Core 共用的 ≥2 人 on-call 輪值，才可拆。理由：本系統目前的 Incident Mode 缺 paging/escalation policy 分級（P1-GAP-INFRA-1），在沒有明確 owner 的狀況下拆出一個新 Service 只是製造一個孤兒可部署單元，比不拆更糟。刻意讓組織邊界先於服務邊界存在（Conway's Law 的主動應用，而非被動後果）。

**(b) 部署耦合頻率訊號**：滾動 90 天內，量測「該模組的改動需要與 Monolith Core 同步部署（因為契約非向下相容）」的頻率。若頻率 ≥ 每週 1 次，**判定尚未可拆**——此時抽離只是把耦合搬進分散式系統（RPC/版本 skew），沒有真正移除耦合。只有當獨立部署成功率在滾動 90 天窗口內達到 ~95%（即 port 已被實證穩定），才通過此訊號。

**(c) 負載/擴展差異訊號**：某 Worker 的 queue backlog 或 p95 latency，要求它的 replica 數與 Monolith API replica 數的比例差異持續 ≥30 天超過 3 倍。**必須是持續訊號，不是單次尖峰**——避免為一次性活動抽離服務。

**(d) 爆炸半徑／安全訊號（唯一可單獨觸發、不需等待 a/b/c 累積證據）**：當一個模組執行第三方或使用者提供的程式碼，且其信任邊界與 Monolith 其餘部分實質不同時，**立即**抽離，不用等統計證據。這直接適用於 **Data Worker（Trusted Compute Engine 的任意 Python/R/SQL 執行）** 與任何 **Local AI 模型執行**——呼應 Master Plan §1.5 既有的「最小爆炸半徑」原則。安全性訊號優先於效率訊號，這是刻意的例外，不是前後不一致。

**明確排除的反訊號（防止未來被誤用來合理化提早拆分）**：
- **單純 QPS 門檻不足以觸發**——因為 QPS 問題可先靠水平擴展 Monolith Worker replica 解決，遠早於需要新的獨立部署生命週期。
- **單純程式碼行數（LOC）不足以觸發**——LOC 過大是「模組內部邊界該重構」的訊號，該用更好的模組切分在 Monolith 內部解決，不是服務抽離的理由。

---

## Rationale for Rejected Alternatives

**方案 1（拒絕）：一個 Domain Model 物件對應一個 `/modules/<object>`。**
直覺但錯誤——本文件 Bounded Context Analysis 的兩層測試顯示，23 個物件裡有 17 個是被多個 vertical 共同讀寫的 Shared Kernel 名詞。若逐一各開一個模組，每個 vertical 都要 import 十幾個兄弟模組，形成循環依賴網——這正是 DDD Shared Kernel pattern 存在的理由。現有語料庫已經示範過這條路走歪的樣子：P1-GAP-ARCH-10 引用的 Simulation（頂層）vs Experiment（三層深）就是「半調子物件導向模組化」的直接後果。

**方案 2（拒絕）：Phase 4 一開始就上百 Microservice。**
Source directive §XII 本身已明確排除，Master Plan §67 亦同。本文件 Microservice Extraction Threshold 的存在理由正是把這句話從「原則宣示」變成「可執行判準」。

**方案 3（拒絕）：維持現況——把 9 個合規/管轄權目錄當成與 canvas/research/business 平行的 `/modules/*` 項目。**
這誤判了它們的執行語意。Master Plan §4 明講 Trust Fabric「任何 Capability 在執行前都必須先通過」——使用者可以選擇不去用 Brainstorm 模組，但系統不能讓一個 Capability 跳過 Privacy/Jurisdiction 檢查。把強制關卡建模成「使用者可選的功能垂直線」，語意上就錯了，也是 P1-DUP-5（localization 兩份不相容定義）之所以會發生的根因之一。

**方案 4（拒絕）：保留 Master Plan `/methods`+`/compiler`+`/specs/cognitive` 與 Atlas `/cognitive/methods`+`/cognitive/compiler` 兩套並存、互不引用的定義。**
這是現狀，會導致「Atlas 修改方法規格，MP 端不會同步也不會被標記過期」。本文件用「目錄層 vs 實作層」的顯式分工取代，兩者都保留但賦予不同、不重疊的職責。

**方案 5（拒絕）：Worker 直接擁有自己的業務邏輯副本（不透過 `/core/application` 或 `/modules` 呼叫）。**
表面上簡化 Worker 實作，但違反 §5.2/§5.4 的 Local-first 強制要求——若 Document Worker 自己重寫一份轉錄/OCR 邏輯，離線模式就需要維護第二份平行邏輯，兩份會漂移。

**方案 6（拒絕）：全盤照抄 Master Plan §80 現有候選樹，只是把 20 個目錄原樣搬進本提案。**
這正是 ADR-006 與 source-directive §XII 明文禁止的動作。本文件逐一驗證後，實際保留、移除、合併、新增的變動統計：**移除** `/modules/decision`、`/modules/artifact`（併入 kernel）；**合併** `/modules/analytics` + `/modules/simulation` → `/modules/data-science`（統一深度）；**搬移** 9 個合規類 `/modules/*` → `/platform/trust-fabric/*`；**新增** `/platform/event-bus`（原文件提到概念卻从未給路徑）、`/core/contracts`、`/cognitive` 頂層命名空間（原本被錯誤拆散在 MP 三處）；**維持** Atlas §17 全樹為方法系統正本、EC §95 全樹為 AI 執行治理正本（兩者本身內部一致，未發現需修正之處）。
