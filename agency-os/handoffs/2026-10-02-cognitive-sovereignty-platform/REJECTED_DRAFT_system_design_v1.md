# 認知主權平台 — 完整系統設計 v1

> **狀態**：PROPOSED（AI 起草，操作者未批准；批准後取代 `RESEARCH_LINES_MASTER_PLAN.md` 的產品定位，該檔降為「VERIFY 管線與引擎建置紀錄」）。
> **來源意圖**：`COGNITIVE_SOVEREIGNTY_PLATFORM_BLUEPRINT_v0.7.md`（操作者藍圖，本檔以 §B-n 引用其章節）。藍圖是討論文件，本檔是系統設計：藍圖說「平台是什麼、不是什麼」，本檔說「每一塊是什麼物件、誰能寫、怎麼接、怎麼驗、怎麼蓋到完整」。
> **讀者**：接手的 agent 與操作者。一行做什麼＋至多一行為什麼；理由散文不寫。
> **範圍**：完整系統，不是 MVP。建置順序在 §12，但每一節描述的是蓋完後的樣子。
> **路徑縮寫**：`COS` = `Projects/internal/cognitive-engineering-os`；`SPEC` = `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`；`NA` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`。

---

## 0. 系統一句話與全貌

**認知主權平台**（Cognitive Sovereignty Platform）＝ 一套讓人**形成、檢查、修正、實踐自己判斷**的模組化系統（§B-2.2）。它不是問答工具、不是文件管線、不是測驗。

```
┌────────────────────────────────────────────────────────────────────────┐
│ 完整性核心 Integrity Kernel（§3）── 全程生效，任何模組不可覆寫            │
│   判斷權 ∣ 權限可見可撤 ∣ 內容種類分離 ∣ 依據與不確定性 ∣ 非操控 ∣ 可爭辯   │
├────────────────────────────────────────────────────────────────────────┤
│ 組裝器 Assembler（§6）── 目的 → 套件 → 模組順序（推薦附理由，人可改）       │
├────────────────────────────────────────────────────────────────────────┤
│ 能力模組 Modules（§5）                                                   │
│  SENSE  MAP  THINK  VERIFY  DECIDE  LEARN  COLLAB  GOVERN                │
│    ↕ 只讀寫各自宣告的欄位                                                │
├────────────────────────────────────────────────────────────────────────┤
│ 任務容器 Task（§4）── 聚合根：目的、合約、素材、地圖、主張、判斷、行動、回顧 │
│   每個欄位有 writable_by；每筆物件有 provenance 兩軸；事件 append-only       │
├────────────────────────────────────────────────────────────────────────┤
│ 人機協作層（§7）── 協作合約、回合規則、七角色、練習／直答模式、信任校準     │
├────────────────────────────────────────────────────────────────────────┤
│ 認知內容層（§8）── Method Atlas 285 方法、課程、範例、套件 ＝ 模組的「內容」 │
├────────────────────────────────────────────────────────────────────────┤
│ 治理／資料／安全（§10）── 同意、最小化、三庫分離、匯出、抹除、風險升級      │
├────────────────────────────────────────────────────────────────────────┤
│ 執行架構（§11）── 平台殼、引擎 API、蒐集器、AI gateway、儲存、身分          │
└────────────────────────────────────────────────────────────────────────┘
```

與既有 Cognitive Engineering OS 的關係：**OS 是引擎，平台是產品**。引擎（方法契約、builder＋gate、recipe 執行、AI gateway、CAS、事件、抹除）全部保留並成為 §5 模組的實作；平台新增的是 §3 核心、§4 容器、§6 組裝器、§7 協作層、§10 治理，以及把「終點」從報表核准改成判斷紀錄。

---

## 1. 設計判準（每個決策都過）

| # | 判準 | 機械落點 |
|---|---|---|
| J1 | 人的判斷只能由人寫（§B-4.1） | `writable_by: human` 欄位；`no_preset_conclusion` 閘 |
| J2 | AI 權限可見、可縮小、可撤回（§B-4.2） | `CollaborationContract` 物件；gateway 每次呼叫前驗合約 |
| J3 | 內容種類不混（§B-4.3） | 每個主張兩軸：`claim_kind`（主張種類）× `provenance`（來源與作者狀態） |
| J4 | 重要輸出附依據與不確定性（§B-4.4） | 引註 ⊆ manifest 閘；`confidence{level, reason}`；`gaps[]` 必填 |
| J5 | 不同結論皆可（§B-4.5） | 衡量只量過程不量立場（§9）；無「正確答案」欄位 |
| J6 | 非操控（§B-4.7） | 外化資料只進任務容器，不進推薦／廣告／評分；`no_belief_scoring` 閘 |
| J7 | 平台可被檢查（§B-4.9） | prompt／模型／門檻皆版本化資料；每個輸出帶 `prompt_version`；replay 可重放 |
| J8 | 共同程序另行設計（§B-4.10） | COLLAB 是獨立模組與獨立物件，不是個人任務加人數 |
| J9 | 30 年工程紀律（AGENTS §1） | 契約先於程式；閘可獨立 FAIL；每物件 schema 驗證後才落盤；可回滾 |
| J10 | LEGO | 模組有介面合約；加模組＝加檔案；套件是資料不是程式 |

---

## 2. 名詞對照（藍圖 ↔ 系統物件）

| 藍圖用語（§B-3） | 系統物件 | 說明 |
|---|---|---|
| 任務／任務容器 | `Task` | 聚合根（§4.1） |
| 協作合約 | `CollaborationContract` | 每任務一份，可逐回合縮小 |
| 外化素材 | `Material` | SENSE 輸出 |
| 六層問題地圖 | `ProblemMap` + `MapEntry` | MAP 輸出 |
| 思考卡 | `ThinkingCard` | THINK 輸出 |
| 主張帳本／來源卡 | `Claim` + `Source` | VERIFY 輸出；`Source` 沿用既有 |
| 判準／選項 | `Criterion` + `Option` | DECIDE 工作材料 |
| 判斷紀錄／判斷卡 | `JudgmentRecord` | 任務終點物件（§4.3） |
| 行動計畫 | `ActionPlan` | DECIDE 輸出 |
| 回顧／校準紀錄 | `CalibrationRecord` | LEARN 輸出 |
| 回合 | `Round` | 人機一次交換（§7.2） |
| 套件 | `Package` | 模組順序＋推薦理由（資料） |
| 共同審議 | `Deliberation` | COLLAB 聚合（§4.5） |
| 規範脈絡 | `NormativeCheck` | 橫切檢查，掛在 `ProblemMap` |
| 影響／影響來源 | `InfluenceEntry` | SENSE／LEARN 共用 |
| 我的／AI 提出／共同發展 | `provenance.authorship_state` | **不新增三值詞彙**，用既有六值（§4.2） |

---

## 3. 完整性核心 Integrity Kernel

### 3.1 三個機制承載十條原則

| 機制 | 做什麼 | 承載原則 |
|---|---|---|
| **欄位寫入權 `writable_by`** | 每個 schema 欄位標 `human` ∣ `ai_suggest` ∣ `system`。`human` 欄 AI 只能寫到旁邊的 `candidates[]`（`AI_SUGGESTED`），不能寫本欄；`system` 欄由程式算（如 `data_thickness`、hash） | J1、J3、J6 |
| **主張兩軸 provenance** | 每筆主張／卡片帶 `claim_kind` × `{epistemic_type, authorship_state, locked}` | J3、J4 |
| **核心閘 Kernel Gates** | 每個模組輸出落盤前跑（§3.3）；任一 FAIL → 不落盤、不顯示、記事件 | J1、J4、J6 |

### 3.2 主張兩軸

- **主張種類軸 `claim_kind`**（新；§B-4.3、§B-3.2）：`fact` ∣ `interpretation` ∣ `assumption` ∣ `legal_or_procedural` ∣ `value_choice` ∣ `creative` ∣ `recommendation` ∣ `unknown`。`legal_or_procedural` 必帶 `jurisdiction`、`as_of`、`source_ref`，缺一不得標 `confidence.level: high`。
- **來源軸 `provenance`**（既有，SSOT `SPEC/specs/governance/epistemic-label.schema.yaml`）：`epistemic_type` 11 值、`authorship_state` 6 值（`HUMAN_ORIGINAL／AI_GENERATED／AI_SUGGESTED／HUMAN_EDITED／HUMAN_APPROVED／SOURCE_QUOTATION`）、`locked`。藍圖的「我的／AI 提出／共同發展」= `HUMAN_ORIGINAL`／`AI_SUGGESTED`／`HUMAN_EDITED`，UI 顯示三個詞，資料存六值。
- 兩軸正交：「AI 推論的法律條件」= `claim_kind: legal_or_procedural` + `epistemic_type: AI_INFERENCE`，UI 必須同時顯示兩個標記。

### 3.3 核心閘（全平台，不限 L4）

| 閘 | 檢查 | 來源 |
|---|---|---|
| `participant_final_judgment` | `JudgmentRecord` 核心欄 `authorship_state ∈ {HUMAN_ORIGINAL, HUMAN_EDITED}`；後續模組把它當最高優先輸入 | 既有 D20（`COS/ai_lego/modules/reflection/sovereignty_gates.py`，作用域由 `art_reflection.*` 擴到全部） |
| `no_preset_conclusion` | AI 輸出不得寫入任何 `writable_by: human` 欄；`JudgmentRecord.conclusion` 在人填前為 null | 既有 D20 |
| `influence_inventory` | 任務進入 DECIDE 前 `InfluenceEntry[]` 至少被人看過一次（事件 `InfluenceReviewed`），可為空但不可未看 | 既有 D20 |
| `evidence_conditions` | `JudgmentRecord.revision_conditions[]` 非空，否則判斷標 `unrevisable` 且不可進 ActionPlan | 既有 D20 |
| `revisit_scheduled` | `ActionPlan.review_at` 必填 | 既有 D20 |
| `stop_signals` | 任務任一時刻命中安全訊號（§10.4）→ 深度反思模組停止推進，轉安全支持 | 既有 D20 |
| `no_belief_scoring` | 任何輸出不得含對使用者信念、立場、理性程度的分數 | 既有 D20 |
| `citation_integrity` | 每個主張 `citations ⊆ manifest`；越界或零引註 FAIL | 既有 P2 |
| `human_output_first`（新） | `mode: practice` 時，一個 `Round` 的 AI 輸出必須存在同回合、較早時間戳的人類輸出 | §B-8.1 |
| `contract_scope`（新） | gateway 呼叫前驗 `CollaborationContract.ai_permissions` 含本次動作；不含 → 拒絕並記 `ContractViolationBlocked` | §B-8.2 |
| `claim_kind_present`（新） | MapEntry／Claim／ThinkingCard 缺 `claim_kind` → FAIL | J3 |
| `legal_claim_qualified`（新） | `claim_kind: legal_or_procedural` 缺 jurisdiction／as_of／source_ref → 不得 `high` 信心 | §B-3.2 |

閘的實作慣例沿既有：純函式、可獨立 FAIL、突變測試證明非恆真（§13）。

---

## 4. 領域模型

### 4.1 `Task`（聚合根）

既有 `Project`（`COS/ai_lego/core/domain/project.py`）升級為 `Task`：同一張表、同一 id、同一抹除路徑，**加欄位不換表**。

| 欄位 | 型別 | writable_by | 說明 |
|---|---|---|---|
| `purpose_kind` | enum `self_understanding ∣ complex_decision ∣ information_judgment ∣ creative_strategy ∣ learning_reflection ∣ team_deliberation ∣ research`（含既有 `partnership_risk／decision／edd_research／method_dossier` 映射） | human | 決定預設套件 |
| `question` | text | human | 想釐清／選擇／解決什麼 |
| `scope`／`affected_parties[]`／`completion_condition` | text | human | §B-6.1 步驟 1 |
| `risk_tier` | enum R0–R4（既有 `SPEC/specs/execution/risk-tier.schema.yaml`） | human 初填，system 可升不可降 | 高風險自動加護欄（§10.3） |
| `contract_id` | ref | system | 當前合約 |
| `package_id` + `module_order[]` | ref | human（組裝器建議） | 本次組合 |
| `status` | enum `defined ∣ contracted ∣ sensing ∣ mapping ∣ thinking ∣ verifying ∣ deciding ∣ acting ∣ reviewing ∣ closed ∣ reopened` | system | 狀態機（§6.3） |
| `judgment_record_id`（當前版本） | ref | system | 終點物件 |
| `language`／`locale` | — | human | 課程、prompt、範例依此 |
| `data_classification` | 既有 | system | 由 purpose＋kind 推 |

### 4.2 任務內物件（每個：id、task_id、provenance 兩軸、version、created_at、schema 驗證後落盤）

| 物件 | 核心欄位 | writable_by 要點 |
|---|---|---|
| `CollaborationContract` | `ai_roles_allowed[]`（§7.3 七角色子集）、`ai_permissions{search, summarize, rank, simulate, suggest, execute}`、`data_scope{readable_fields[], excluded_fields[]}`、`non_delegable[]`、`required_context[]`、`handback_conditions[]`、`mode: practice ∣ direct`、`challenge_strength: low ∣ mid ∣ high`、`valid_from/until` | 全 human；每回合可縮不可擴（擴要新版本＋事件） |
| `Material` | `kind: event ∣ data ∣ feeling ∣ body ∣ expectation ∣ fear ∣ relation ∣ power ∣ intuition ∣ story ∣ norm`、`text`、`media_ref?`（P5 物件儲存）、`occurred_at?`、`links[]` | `text` human；AI 可建 `AI_SUGGESTED` 的整理卡（Mirror），不可改原卡 |
| `ProblemMap` / `MapEntry` | `layer: fact ∣ interpretation ∣ interest ∣ structure ∣ core_conflict ∣ intervention`、`claim_kind`、`text`、`citations[]`（→ Material／Source／Claim）、`confidence`、`gaps[]` | AI 可起草全部條目（`AI_SUGGESTED`）；人確認後轉 `HUMAN_EDITED`；`interest` 層不得寫「真實動機」只寫「標示為假設的利益」（schema `const` 檢查 `claim_kind ∈ {assumption, interpretation}`） |
| `NormativeCheck` | `rights_obligations`、`source_power`、`claim_kinds_involved[]`、`personal_stance: endorse ∣ comply_for_now ∣ reserve ∣ undecided`、`recheck_condition`、`jurisdiction?`、`as_of?` | `personal_stance` human-only；其餘 AI 可建議 |
| `ThinkingCard` | `type: alt_hypothesis ∣ inversion ∣ perspective_shift ∣ constraint_shift ∣ analogy ∣ second_order`、`claim`、`mechanism`、`benefit`、`risk`、`assumption_to_verify`、`claim_kind`、`user_reaction: resonate ∣ averse ∣ unclear`、`reaction_reason`、`selected: bool` | 卡本體 human 或 AI；`user_reaction`／`selected` human-only；每輪人至少自建 2 張（§B-8.4，practice 模式閘） |
| `Claim` | `text`、`claim_kind`、`sources[]`、`support[]`、`contradict[]`、`as_of`、`jurisdiction?`、`status: unknown ∣ supported ∣ contested ∣ refuted`、`manipulation_patterns[]?` | AI 建（`AI_INFERENCE`）；`status` 由 system 依 support/contradict 算，不由模型宣告 |
| `Source` | 既有（canonical_url、sha256、fetched_at、collector、provenance、supersedes） | 既有 I1 |
| `Criterion` / `Option` | `Criterion{name, weight, rationale}`；`Option{name, actions[], tradeoffs[], reversibility, cost, risk, citations[]}` | `weight` human-only（既有 C5 `human_required`）；Option AI 可建議 |
| `JudgmentRecord` | §4.3 | 核心欄 human-only |
| `ActionPlan` | `next_step`、`owner`、`expected_effect`、`risk`、`stop_conditions[]`、`escalation_conditions[]`、`prediction{what, confidence}`、`review_at` | `owner`、`prediction.confidence`、`review_at` human-only（既有 C11 規則） |
| `CalibrationRecord` | `judgment_version`、`prior{belief, confidence}`、`ai_contribution[]`（round refs）、`adopted/rejected{what, why}`、`outcome`、`missed_signals[]`、`judgment_update`、`trust_scope_update`、`next_practice_point` | `outcome`／`why`／`trust_scope_update` human-only；`prior` 由 system 從 Round 快照 |
| `InfluenceEntry` | `kind: person ∣ group ∣ emotion ∣ identity ∣ media ∣ algorithm ∣ rule ∣ institution ∣ narrative`、`text`、`noticed_at`、`reviewed: bool` | human 建；AI 只可問（Socratic） |
| `Round` | §7.2 | system 記錄 |
| `ModuleRun` | `module_id`、`inputs_read[]`、`outputs_written[]`、`ai_calls[]`、`gate_results[]`、`skipped_by_user?` | system |
| `Report`（可選輸出） | 既有 P4 report artifact；`report_state: AI_GENERATED ∣ HUMAN_APPROVED` | 既有 |

### 4.3 `JudgmentRecord`（§B-7.3，任務終點）

| 欄位 | writable_by | 閘 |
|---|---|---|
| `problem_definition` ＋ `why_defined_so` | human | — |
| `known_facts[]`（→ Claim/Source refs） | human 選、AI 建議 | `citation_integrity` |
| `assumptions[]` ＋ basis | human | `claim_kind_present` |
| `normative_context`（→ NormativeCheck） | human 確認 | — |
| `alternatives[]`（≥1 替代解釋或反例） | human 選、AI 建議 | schema `minItems: 1` |
| `criteria_and_tradeoffs` | human | — |
| `uncertainties[]` | human | — |
| **`conclusion`**（暫定結論）＋ `confidence{level, reason}` | **human only** | `participant_final_judgment`、`no_preset_conclusion` |
| **`revision_conditions[]`**（什麼會改變結論） | **human only** | `evidence_conditions` |
| `next_action` → ActionPlan | human | `revisit_scheduled` |
| `decision_maker`／`affected[]` | human | — |
| `version`／`revision_reason` | system／human | 每次改動新版本，舊版不刪 |
| `ai_candidates{}`（每欄旁的 AI 建議） | ai_suggest | 顯示為 `AI_SUGGESTED`，採納＝人複製進本欄並轉 `HUMAN_EDITED` |

**獨立版與協作版**（§B-6.15 雙軌）：`JudgmentRecord` 在 practice 模式自動保存兩個快照——`first_position`（AI 介入前）與 `after_collaboration`；兩者皆版本化，UI 可並排。

### 4.4 事件（append-only，既有 `events` 表）

新增事件類型：`TaskDefined`、`ContractSet`／`ContractNarrowed`、`MaterialAdded`、`MapEntryConfirmed`、`ThinkingCardReacted`、`ClaimStatusComputed`、`InfluenceReviewed`、`JudgmentRecorded`（既有 `UserJudgmentRecorded` 更名保留別名）、`JudgmentRevised`、`ActionCommitted`、`ReviewDue`、`CalibrationRecorded`、`ContractViolationBlocked`、`StopSignalTriggered`、`ModuleSkipped`、`DirectAnswerRequested`。衡量（§9）只讀事件。

### 4.5 `Deliberation`（COLLAB 聚合，獨立於 Task）

| 欄位 | 說明 |
|---|---|
| `tasks[]` | 參與者各自的 Task（個人判斷不被覆蓋） |
| `participants[]` + `roles{proposer, challenger, auditor, decider, reviewer}` | 角色輪替（§B-6.14） |
| `shared_problem_definition`、`disagreement_map` | 分歧地圖 |
| `authority_grants[]{who, scope, revocable_by, until}` | 授權／委任與撤回 |
| `dissent_records[]`（append-only，永不刪） | 少數意見保存 |
| `closure{reason, decided_by, responsible, review_date}` | 閉合 |
| `reopen_conditions[]` + `reopen_events[]` | 重開 |
| `consequence_writeback[]` | 結果回寫下一輪 |

機構核准 ≠ 個人認同：`Deliberation.closure` 不改任何參與者 `JudgmentRecord.conclusion`。

---

## 5. 八個模組的介面合約（§B-5.2 六欄，每模組一表）

共同規則：模組只讀寫宣告欄位；每次執行建 `ModuleRun`；AI 呼叫經 gateway 驗 `contract_scope`；輸出過核心閘；人可跳過（記 `ModuleSkipped`）、停止、刪除本模組產物。

### SENSE｜Reflect Studio（外化）
| 欄 | 內容 |
|---|---|
| 輸入 | 使用者文字／語音／圖像（P5）／既有 Material；**不讀** JudgmentRecord、CalibrationRecord（外化不受結論汙染） |
| 輸出 | `Material[]`、關係圖（Material 間 `links`）、時間線（`occurred_at`）、`InfluenceEntry[]`（情緒／關係／權力訊號） |
| AI 權限 | Mirror（整理不評價）、Socratic（一次一問）；**不得**推斷人格、診斷、斷言動機（§B-6.2） |
| 依據與限制 | 只依使用者給的材料；輸出全標 `AI_SUGGESTED`；不適用於急性危機（`stop_signals`） |
| 使用者控制 | 改／刪／不分享任一卡；拒絕任何詮釋；選媒介 |
| 資料 | 預設最敏感級；不進研究庫除非同意；可整批刪 |
| 內容來源 | L4 藝術反思（D19–D22、Airtable 20 表）＝ SENSE 的媒介之一；`wusheng-journey-v1` 為 SENSE recipe |

### MAP｜Cognitive Engine（認知拆解）
| 欄 | 內容 |
|---|---|
| 輸入 | Material、Source、Claim；不讀 CalibrationRecord |
| 輸出 | `ProblemMap`（六層 `MapEntry[]`）＋ `NormativeCheck`、`assumptions[]`、`gaps[]` |
| AI 權限 | 起草六層條目（全 `AI_SUGGESTED`）；標 `claim_kind`；提出假設；**不得**把推論寫成事實（schema：`layer: fact` ⇒ `claim_kind: fact` 且 `citations` 非空） |
| 依據與限制 | 每條目引註 ⊆ manifest；`core_conflict` 標 `assumption` 不標已證根因 |
| 使用者控制 | 逐條確認／改寫／刪除；`NormativeCheck.personal_stance` 只能人填 |
| 資料 | 同 Task |
| 內容來源 | 新方法契約 `framing.six_layer_map`（§8.2）；既有 framing／systems／decomposition／causal／root_cause／stakeholders 家族為可替換透鏡（冰山、魚骨、因果 DAG…皆可當 MAP 的另一種圖） |

### THINK｜Co-Thinking Gym（人機共思考）
| 欄 | 內容 |
|---|---|
| 輸入 | ProblemMap、Material、Claim、使用者本輪輸出（practice 模式必有） |
| 輸出 | `ThinkingCard[]`（六型標記）、反例、判準草稿、`Round[]` |
| AI 權限 | 七角色中合約允許者；每輪輸出型別受角色限制（§7.3）；數量／排序不得當品質（§B-8.4） |
| 依據與限制 | 卡片必含 `assumption_to_verify`；AI 不得預選 `selected` |
| 使用者控制 | 自建卡（practice 每輪 ≥2）、標反應、選 3 張進下一輪、要求反方、切角色、直答 |
| 資料 | Round 全記錄（含人先寫的版本）供 LEARN |
| 內容來源 | divergent／challenge／epistemic／association／foresight 家族＝發散與反證的具體方法；25 分鐘循環＝一個 `Package`（資料） |

### VERIFY｜Information Integrity（資訊完整性）
| 欄 | 內容 |
|---|---|
| 輸入 | 使用者指定要查的主張；Task 的 Source（含蒐集器抓回的） |
| 輸出 | `Claim[]`（主張帳本）、`Source[]`（來源卡）、支持／反證、`manipulation_patterns[]`、查證步驟、`gaps[]` |
| AI 權限 | 彙整（既有 synthesis）、拆主張、對應來源；**外部抓取只經蒐集器**（§11.3），AI 本身不上網；**不得**宣判真假（`status` system 算） |
| 依據與限制 | `citation_integrity` 強制；法律主張 `legal_claim_qualified`；來源快照 sha256 |
| 使用者控制 | 選哪些主張值得查、哪些來源可接受、成本預覽後才抓（既有 C7） |
| 資料 | Source 走既有 I1／supersede／抹除 |
| 內容來源 | 既有 P1 蒐集管線 ＋ P2 彙整引註閘 **整段搬入本模組**；三個彙整 typed object（dossier／decision-evidence／literature-matrix）＝ VERIFY 的三種帳本形狀 |

### DECIDE｜Judgment Workbench（判斷與行動）
| 欄 | 內容 |
|---|---|
| 輸入 | ProblemMap、選中的 ThinkingCard、Claim、InfluenceEntry（已 reviewed）、NormativeCheck |
| 輸出 | `Criterion[]`、`Option[]`、**`JudgmentRecord`**、`ActionPlan` |
| AI 權限 | Decision Coach：建議判準、列選項、估可逆性、提停止條件——全進 `ai_candidates`；**不得**寫 `conclusion`／`revision_conditions`／`weight`／`owner` |
| 依據與限制 | 既有 C11 四層方案來源（框架來自方法契約、每 option 引 [n]、力道交下一方法算、案例庫）；目標數字由 baseline 或人定 |
| 使用者控制 | 全部核心欄；可退回任一前模組；可只做判斷不做行動 |
| 資料 | 判斷卡每版保存；`first_position` 快照 |
| 內容來源 | decision／feasibility／strategy 家族＝判準與權衡的具體方法（WDM、Eisenhower、AHP、MCDA…） |

### LEARN｜Decision & Learning Loop（回顧校準）
| 欄 | 內容 |
|---|---|
| 輸入 | JudgmentRecord 各版、ActionPlan.prediction、Round 紀錄、到期事件 `ReviewDue` |
| 輸出 | `CalibrationRecord`、判斷更新（新版 JudgmentRecord）、信任範圍更新、下次練習點、跨任務遷移提示 |
| AI 權限 | Meta-Learning Coach：指出可觀察的策略、遺漏、信心偏差（引 Round）；**不得**評分人 |
| 依據與限制 | 只比較「預測 vs 結果」與「介入前 vs 後」；事後合理化偵測＝比對時間戳 |
| 使用者控制 | 寫結果、寫原因、決定保留／改變什麼；可拒絕遷移提示 |
| 資料 | 校準紀錄進個人庫；聚合後（§9）才進研究庫 |
| 內容來源 | learning／insight 家族；既有 `review_at`／`SolutionReview`／`prediction_tracking` |

### COLLAB｜Collective Procedure Lab（共同程序）
| 欄 | 內容 |
|---|---|
| 輸入 | 各參與者 Task（只讀其 JudgmentRecord 已分享部分）、共同問題 |
| 輸出 | `Deliberation`（§4.5） |
| AI 權限 | 整理分歧地圖、對照證據、提醒程序條件；**不得**裁決、不得合成「共識」 |
| 依據與限制 | 異議 append-only；閉合必有責任人與重開條件 |
| 使用者控制 | 每人控制自己分享範圍；授權可撤 |
| 資料 | 群組決策庫（第三庫，§10.2） |
| 內容來源 | stakeholders／challenge 家族（利害關係人地圖、紅隊、獨立裁判…）；角色輪替＝ Package |

### GOVERN｜Governance & Research（治理與研究）
| 欄 | 內容 |
|---|---|
| 輸入 | 事件流（聚合）、prompt／模型／門檻版本、使用者回饋、研究同意 |
| 輸出 | 稽核紀錄、版本變更紀錄（含每個 prompt 版本的 champion／challenger 證據）、研究資料集（匿名、已同意）、申訴紀錄、在地化包 |
| AI 權限 | 提案（prompt／角度表／範例）進演化迴圈；**不得**自動晉升超過 R2（既有 I9／I10） |
| 依據與限制 | 每個 AI 輸出可回溯 `prompt_version`＋`model`＋manifest（既有 replay） |
| 使用者控制 | 看自己哪一版 prompt 產生了哪個輸出；申訴；撤回研究同意 |
| 資料 | 研究庫與個人庫物理分離 |
| 內容來源 | 既有 champion-challenger recipe、harness、`ai_usage`、ADR 流程 |

---

## 6. 組裝器與工作流

### 6.1 套件（資料，`SPEC/recipes/packages/*.package.yaml`，新目錄）

| 套件 | 模組順序 | 預設合約 | 風險護欄 |
|---|---|---|---|
| 個人複雜決策 | SENSE → MAP → THINK → DECIDE → LEARN | practice、角色 Mirror＋Divergent＋RedTeam＋DecisionCoach＋Meta、搜尋關 | R2 起要求 VERIFY |
| 可疑訊息判斷 | VERIFY → THINK → DECIDE → LEARN | direct 可、角色 EvidenceAuditor＋RedTeam、搜尋開（經蒐集器） | 健康／金錢主張 → `legal_claim_qualified` ＋ 轉介提示 |
| 創意與策略 | SENSE 或 MAP → THINK → DECIDE | practice、Divergent 為主、挑戰 mid | — |
| 課堂反思 | SENSE → THINK → LEARN | practice、Mirror＋Socratic、無 DECIDE | facilitator 規則（§10.5） |
| 團隊審議 | MAP → VERIFY → COLLAB → DECIDE → LEARN | 每人各自合約 ＋ Deliberation 授權 | 閉合條件必填 |
| 研究（EdD） | VERIFY → MAP → THINK → DECIDE（Toulmin） | direct 可、搜尋開 | 引註強制 |
| 藝術反思旅程 | SENSE（五生階段）→ THINK → LEARN | practice、D20 全閘 | 參與者模式（§10.5） |

既有 16 條 recipe 的去向：`life-decision-v1`／`art-therapy×3`／`edd-research-evidence-v1`／`research-qualitative-v1` 掛進對應套件作為模組內方法鏈；`business×6` 掛「創意與策略」的商業變體（目錄只露 foundation／feasibility-review／plan-full 三條，其餘為其子集）；`champion-challenger`／`method-deprecation-retirement`／`db-migration-expand-contract` 為平台內部，不進目錄；`edd-literature-search-v1` 退場（既有 §8 清單）。

### 6.2 組裝規則（§B-5.3 六條 → 機制）

1. 先選 `purpose_kind` → 推薦套件；推薦理由引 package 檔與 catalog（既有 `route.method` 擴成 `route.package`，why 必引用，不憑記憶）。
2. 首輪 ≤5 模組（schema `maxItems: 5` 於 `module_order`）。
3. UI 顯示「現在這塊做什麼、下一塊做什麼」（讀 package 的 `rationale[]`）；重排／略過／暫停／結束皆為事件。
4. 關鍵結論回到人：由 `writable_by` 與 `no_preset_conclusion` 承載，不靠 UI 文案。
5. 可回放：`ModuleRun` ＋ `Round` ＋ 版本；既有 replay 機制。
6. 高風險自動護欄：`risk_tier ≥ R2` → 套件強制插入 VERIFY、合約 `challenge_strength: high`、DECIDE 前人工覆核提示、R4 → 轉介優先。

### 6.3 Task 狀態機

```
defined → contracted → (sensing|mapping|thinking|verifying)* → deciding → acting → reviewing → closed
                                                                    ↑                        │
                                                                    └──── reopened ──────────┘
```
- 模組狀態可任意順序、可重入（LEGO）；`deciding` 之前不得進 `acting`；`reviewing` 由 `ReviewDue` 事件觸發；`closed` 可 `reopened`（記原因）。
- 無「核准」狀態。治理支線（§6.4）掛在 Deliberation，不在 Task。

### 6.4 報表與核准（§B-6.3）

- `Report` 是任一時點可產的**輸出**，不是狀態；既有 P4 report artifact／Markdown export 保留，段落來源改為 Task 物件（判斷卡、主張帳本、地圖、校準）。
- 個人任務無核准。團隊／課堂／高風險走 `Deliberation.closure`，用詞「授權／共同決定」。

---

## 7. 人機協作層

### 7.1 協作合約生效機制

- gateway（既有 `COS/ai_lego/platform/ai_gateway/`）每次呼叫前讀 Task 當前合約：角色不在 `ai_roles_allowed` → 拒；動作不在 `ai_permissions` → 拒；讀取欄位不在 `data_scope.readable_fields` → manifest 不含該欄（引不到就不會出現在輸出，由 `citation_integrity` 保證）。
- `handback_conditions` 由兩種訊號觸發：人宣告（按鈕）或 system 偵測（資料不足 `gaps` 超門檻、`stop_signals`、`risk_tier` 升級）→ gateway 降級：只許 Mirror／Socratic，輸出型別限「問題／整理／缺口」。
- 合約縮小即時生效；擴大需新版本＋事件，且 practice 模式下不可在同一回合擴大。

### 7.2 回合規則（§B-8.1）

`Round{task_id, module_id, mode, human_output{kind, ref, at}, ai_role, ai_output{refs[], at}, human_response{kind: confirm ∣ edit ∣ reject ∣ skip, at}}`

- `mode: practice`：`human_output.at < ai_output.at`（`human_output_first` 閘）；`human_output.kind ∈ {observation, hypothesis, dont_know, evidence_condition, criterion_or_choice, reflection}` 至少一種（§B-6.2 六種）。
- `mode: direct`：無先寫要求；AI 輸出仍全標 `AI_SUGGESTED`／`AI_GENERATED`；**判斷點不變**（JudgmentRecord 核心欄仍 human-only）。
- 安全例外：`stop_signals` 命中 → 跳過回合規則，進安全支持。
- 兩層阻力的定義：**模組內阻力**由 `mode` 開關；**判斷點阻力**無開關。U-系列（懶人填寫、示範案例一鍵填入、問題路由）全在 direct 模式保留，practice 為加法。

### 7.3 七角色（prompt 資料，`SPEC/evolution/ai-roles/*.yaml`）

| 角色 | 允許輸出型別 | 禁止 | 預設模組 |
|---|---|---|---|
| Mirror | Material 整理卡、空白清單 | 建議、評價、動機 | SENSE |
| Divergent Partner | ThinkingCard（六型，機制互異） | 排序當品質、預選 | THINK |
| Socratic Guide | 一個問題 | 第二個問題、答案 | SENSE／MAP |
| Red Team | 反例、失敗模式、邊界條件 | 替代結論 | THINK／DECIDE |
| Evidence Auditor | Claim 分類（支持／推論／猜測／價值／缺口） | 宣判真假 | VERIFY／MAP |
| Decision Coach | Criterion／Option／停止條件候選 | conclusion、weight、owner | DECIDE |
| Meta-Learning Coach | 策略觀察、遺漏、信心偏差（引 Round） | 評分、人格 | LEARN |

每角色一個 prompt 檔，含 `allowed_output_types[]`（gateway 以 typed-object schema 強制）、`forbidden_patterns[]`（eval harness 突變案例）、`version`。七張指令卡（§B-6.11）＝ 七個角色＋模式的快捷組合，資料。

### 7.4 信任校準（§B-8.7、§B-6.13）

`CalibrationRecord` 承載。UI 五面向（可靠性／可預測性／任務效用／脈絡完整性／偏誤與依賴）各一行，資料來自：該角色在本租戶歷史 Round 的 `human_response` 分佈（system 算）、本次合約範圍、`gaps[]`、`handback` 次數。不給總分。

### 7.5 介面元件（§B-8.7 末段；皆為提案，不得阻止直答或離開）

Think First 區（practice 時 AI 回應摺疊直到人輸出）、協作合約面板、模式切換、來源標記（三詞顯示六值）、理由與信心軌跡（Round 時間線）、認知地圖（ProblemMap＋Claim＋ThinkingCard＋Criterion 同畫面）、反方按鈕（Red Team 一鍵）、暫停／直答、回顧提示（`ReviewDue`）、遷移提示（LEARN 跨任務比對相同 `InfluenceEntry.kind` 模式）。

---

## 8. 認知內容層

### 8.1 Method Atlas 的位置

285 個方法契約是**模組的內容**，不是模組。每個契約加三個 metadata 欄（`SPEC/methods/registry/method-display-metadata.yaml`）：

| 欄 | 值 |
|---|---|
| `module` | SENSE ∣ MAP ∣ THINK ∣ VERIFY ∣ DECIDE ∣ LEARN ∣ COLLAB ∣ GOVERN ∣ engineering |
| `audience` | individual ∣ business ∣ research ∣ engineering |
| `catalog_tier` | default（≤10，M12 教材版）∣ pool ∣ hidden |

第一刀（按契約檔實數）：

| 家族群 | 數 | module／audience／tier |
|---|---|---|
| framing、decomposition、systems、causal、root_cause、representation | 65 | MAP／individual／pool |
| divergent、association、challenge、epistemic、foresight | 56 | THINK／individual／pool |
| decision | 14 | DECIDE／individual／pool |
| learning、insight | 20 | LEARN／individual／pool |
| stakeholders（11） | 11 | COLLAB＋MAP／individual／pool |
| art_therapy | 14 | SENSE／individual／pool |
| strategy、feasibility、finance、computation | 27 | DECIDE／business／pool（只在創意與策略套件露出） |
| research、evidence、experiment | 14 | VERIFY／research／pool |
| devops_sre、database_data、security、architecture、jurisdiction、delivery | 64 | engineering／engineering／hidden（不刪；AO 自用；退場走 `method-deprecation-retirement`） |

`default` 十個由操作者定；建議：六層地圖、冰山、5 Whys、SWOT、Eisenhower、WDM、Toulmin、利害關係人地圖、紅隊、前提檢核。

### 8.2 新方法契約

- `framing.six_layer_map`（§B-7.1）：輸入 Material／Claim refs；輸出 `ProblemMap`；gates：每層 `claim_kind` 合法、`fact` 層必引註、`interest` 層不得 `fact`、`core_conflict` 標假設；`recommended_next` → causal.dag／systems.iceberg_model／stakeholders.stakeholder_map。
- `normative.context_check`（§B-7.2）：輸出 `NormativeCheck`；gate `legal_claim_qualified`。
- `reflection.influence_inventory`：輸出 `InfluenceEntry[]`；gate `no_belief_scoring`。

### 8.3 課程與範例

既有 U15／D17（每方法六步課）、D18（五組範例可切換、永不用真實案例）、D23（方法 dossier 自產課文）全保留；套件加「套件課」（五步，既有工作流課骨架）。25 分鐘循環、10 分鐘校準、每週衝刺＝教材，非強制。

---

## 9. 衡量與研究（§B-12）

| 項 | 設計 |
|---|---|
| 訊號來源 | 只讀事件（§4.4）與物件欄位，不加遙測表 |
| 過程指標 | 介入前能否定義問題（`first_position` 非空）；自建假設數與差異度（ThinkingCard human-origin 的 `type` 分佈）；事實／推論／價值分離（`claim_kind` 填寫率與人修正率）；改變條件（`revision_conditions` 非空率）；校準（`prediction.confidence` vs `outcome`）；採納／拒絕有理由率；支架遞減（同 purpose 連續任務 practice 回合數趨勢）；影響模式辨認（InfluenceEntry 跨任務重複） |
| 禁止指標 | 是否同意平台、是否改變立場、服從／反抗、單一自主分數、AI 次數、對話長度、模組數、速度（schema 層不存在這些欄位） |
| 粒度 | **只出聚合**（租戶級、套件級），個人層只給本人看自己的時間線，無排名 |
| 落點 | 既有 harness（`COS/eval/`）加第二個 scorer `eval/process/`；門檻人定（I10）；夜跑漂移 |
| 研究 | 匿名化後進第二庫（§10.2），需 `ResearchConsent`；必記未改變、退出、失敗、負面結果、facilitator drift |

---

## 10. 治理、資料、安全

### 10.1 同意與最小化
- `Consent{scope: storage ∣ ai_processing ∣ research ∣ sharing, granted_at, revoked_at?}` 每租戶每範圍一筆；撤回即時生效（研究庫停止納入，已匿名化資料依研究倫理規則處理並揭露）。
- 預設只存使用者明確放進任務的內容；無隱性遙測。

### 10.2 三庫分離
| 庫 | 內容 | 隔離 |
|---|---|---|
| 個人原始庫 | Task 全部物件、Round、CalibrationRecord | 租戶 CAS＋事件；既有 `Tenant→Workspace→Task`；P5 Postgres RLS Tier A |
| 研究庫 | 匿名化、已同意的聚合／去識別資料 | 獨立 workspace，單向匯入，無回連 id |
| 群組決策庫 | Deliberation | 參與者各自租戶可讀分享部分；dissent append-only |

### 10.3 風險升級
`risk_tier` R0–R4（既有 schema）：R2 強制 VERIFY＋高挑戰；R3 人工覆核提示＋轉介資源；R4（自傷／暴力／急性危機／金流／法律時效）→ `stop_signals`、安全導向支持、不繼續深度反思。

### 10.4 安全訊號
`stop_signals` 閘的輸入：使用者自報（按鈕）、Material 關鍵訊號（規則表，資料，不用 LLM 判定）、facilitator 標記。命中 → `StopSignalTriggered`、任務 `status` 凍結於當前模組、UI 顯示安全資源與人類專業轉介；解除只能由人。

### 10.5 課堂／組織／facilitator
不得強迫揭露（套件層 `disclosure_optional: true` 不可覆寫）；facilitator 角色有訓練／督導／保密／升級規則（GOVERN 物件 `FacilitatorPolicy`）；參與者模式（L4 P-ARF-participant）在 P5 物件儲存與 P-P 主體加密之後。

### 10.6 匯出、刪除、抹除
- 匯出：單一 Task 或全租戶，ndjson＋附件，含版本與來源（既有 report export 擴展）。
- 刪除：Task 級抹除既有 D10（`DELETE /projects/{id}` → events／sources／artifacts／blobs 一交易）；物件級刪除（單張 Material）為新增，同交易語意。
- 主體級加密與抹除（per-subject DEK、CAS 定址含 subject key）在第二租戶前落地（既有 P-P）。

### 10.7 平台可爭辯（§B-4.9）
prompt／角色／範例／門檻／模型路由皆版本化資料，走 champion-challenger（R0–R2 自動，R3+ 人審）；每個輸出帶 `prompt_version`；變更日誌對使用者可見；申訴進 GOVERN。

---

## 11. 執行架構

### 11.1 服務

| 服務 | 位置 | 角色 |
|---|---|---|
| 平台殼 `cognitive-web` | `COS/apps/cognitive-web`（Next.js），`cognitive.aware-wave.com` | §7.5 介面；任務容器 UI；舊 dashboard 留 `/expert/` |
| 引擎 API | `COS/ai_lego/apps/api`（FastAPI） | Task／物件 CRUD、模組執行、閘、事件、抹除、合約驗證 |
| AI gateway | `COS/ai_lego/platform/ai_gateway` | 角色 prompt、合約檢查、manifest、`ai_usage`、日額度 |
| 蒐集器 | `NA/lib/collect` 經 `POST /api/internal/collect/runs`（既有 P1） | VERIFY 的抓取工人；per-run grant；COS egress deny-by-default |
| 知識庫 | `NA/lib/kb` | **與平台無資料往來**；客服語料 |
| HCI-30 | `Projects/internal/hci30` | 獨立產品「評估他人可信度」；唯一接點 = `JudgmentRecord.external_refs[]` 可放 HCI 案件連結（人工），無 API 整合 |
| 身分 | 平台本地身分（既有）→ `portal.aware-wave.com`（第二使用者時接） | — |
| 儲存 | SQLite＋檔案 CAS（現）→ Postgres RLS＋物件儲存（P5） | repository 介面不變 |
| 排程 | 既有 `review_at` → Claude routine／Trigger | `ReviewDue` 事件 |

### 11.2 租戶與身分
`Tenant → Workspace → Task`；單一操作者＝一個真實租戶（現況）；COLLAB 參與者＝同租戶多 Identity 或跨租戶分享（P5 後）。

### 11.3 網路邊界
平台對外抓取只經蒐集器（I7 不變）；gateway 只連模型供應商（egress allowlist 既有）；HCI 隔離 runner 與平台無連線。

---

## 12. 建置順序（到完整；每階段獨立可上線、可回滾）

| 階段 | 內容 | 完成定義（缺一不算） | Rollback |
|---|---|---|---|
| **S0 憲法落地** | 核心閘作用域擴到全平台；`claim_kind` 軸；`writable_by` 於 schema；provenance 補齊到所有物件 | 突變：拔任一核心閘 → 指名測試紅；AI 寫 human 欄 → 422；golden 全綠 | 閘作用域還原為 `art_reflection.*` |
| **S1 容器與合約** | `Task` 欄位（Project 加欄）；`CollaborationContract`；`Round`；gateway 合約檢查；Think First UI；practice／direct | 合約拒絕未授權角色（實測 422＋事件）；practice 回合無人先寫 → AI 不回；direct 回合 U-系列全可用；`first_position` 快照存在 | 欄位 nullable；合約預設全允許＝舊行為 |
| **S2 四核心模組** | SENSE 文字卡＋關係圖；MAP `six_layer_map`＋`NormativeCheck`；THINK 七角色＋ThinkingCard；DECIDE `JudgmentRecord`＋`ActionPlan`；結果頁 ⑦⑧ 改為 `ai_candidates` | 個人複雜決策套件端到端：判斷卡 `conclusion` 只能人填（UI＋API 雙驗）；AI 候選全標 `AI_SUGGESTED`；`revision_conditions` 空 → 不可進 ActionPlan；每個 MapEntry 有 `claim_kind`；三個新契約 golden 綠 | 契約→DRAFT 即消失；UI 元件獨立可刪 |
| **S3 VERIFY 歸位** | 既有 P1／P2 管線搬入模組；`Claim` 物件；`status` system 算；法律主張欄；可疑訊息套件 | 既有 P2 DOD 全綠不退步；一條法律主張缺 jurisdiction → 信心不得 high（實測）；可疑訊息套件走完 | 模組殼移除，管線照舊可用 |
| **S4 LEARN** | `CalibrationRecord`；`ReviewDue` 排程；信任校準五面向；遷移提示 | 到期回訪一次真實任務：預測 vs 結果記錄、信任範圍更新、下次練習點；時間戳證明非事後合理化 | 排程停即無 |
| **S5 組裝器與目錄** | `route.package`；套件檔；三層目錄；285 契約 metadata；預設十個教材版；套件課 | 隨機 5 個問題描述 → 套件推薦附理由引 package 檔；目錄首頁只見 default；hidden 家族 grep 目錄 = 0 | 目錄回 PI 方法頁 |
| **S6 治理與資料** | Consent；三庫分離；匯出 ndjson；物件級刪除；安全訊號規則表；facilitator policy | 撤回研究同意 → 研究庫停止納入（實測）；匯出再匯入逐位元相同；安全訊號命中 → 任務凍結＋資源顯示 | 同意預設全開＝舊行為 |
| **S7 COLLAB** | `Deliberation`；角色輪替套件；dissent append-only；授權撤回；閉合／重開 | 兩個 Identity 一次審議：異議刪不掉（DB 層）；閉合不改任何人的 conclusion；重開留事件 | 模組移除；Deliberation 表留 |
| **S8 衡量與演化** | `eval/process/` scorer；聚合只讀事件；角色 prompt 進 champion-challenger；變更日誌 | 一次真實循環：prompt 挑戰者在 harness 不劣於 champion → 晉升 → 一鍵回滾；過程指標夜跑三晚有報告；個人層無排名（schema 無欄） | 停 routine |
| **S9 在地化與參與者** | 範例包／課程包／prompt 包 per locale；參與者模式（L4）；第二租戶（P5＋P-P 前置） | 第二 locale 整包切換；參與者 session 一次真跑（既有 P-ARF-participant DoD） | 包移除回預設 |

**與既有 RLMP 分期的對應**：PI-a／PI-b／P1／P2 已完成 → 成為 S2 結果頁、S3 內容；RLMP P3（三線端到端＋課程＋路由）→ S2＋S5；P4（報表＋解決方案）→ 報表為 S3 起可選輸出、解決方案為 S2 的 `ai_candidates`；P4b／P-E → S8；P5／P-P／P-ARF-participant → S9 前置。**不新增 Method Atlas 方法 slice** 的現行裁定維持，三個新契約（§8.2）為平台契約非 Atlas slice。

---

## 13. 驗證形狀（每階段四動作＋突變）

| 動作 | 本設計的形狀 |
|---|---|
| 實測 | 每階段 DoD 列的 curl／UI／DB 實查；practice 回合用真模型跑一次並留 `ai_usage` 記錄 |
| Review | 每階段一個 critic（auth／資料分離／抹除階段用 ≥2，逐 claim 重推） |
| 抓蟲 | 改 `Project→Task`、`UserJudgmentRecorded` 別名、provenance 欄位：grep `agency-os` `scripts` `COS` `NA` call sites＋docs stale 主張 |
| 突變 | 每個核心閘：拔 guard → 指名測試紅 → 還原綠；`writable_by: human` 欄：AI 路徑寫入 → 422 |

---

## 14. 本設計與藍圖 v0.7 的差異（有意偏離，供操作者否決）

| # | 藍圖 | 本設計 | 理由 |
|---|---|---|---|
| D-1 | 來源標記三詞 | 資料用既有六值，UI 顯示三詞 | 同一事實一套詞彙；既有 schema 已被 CAS／replay 消費 |
| D-2 | 「任務容器」為新物件 | `Project` 加欄升級為 `Task` | 零重工；抹除、CAS、事件已在 Project 上驗證過 |
| D-3 | VERIFY 列 P1 | 建置順序 S3（P0 模組之後），但內容今天最完整 | 優先序倒置是現況的根因；先補缺的 |
| D-4 | 內容種類為原則 | 落成正交軸 `claim_kind` ＋ 四個新閘 | 原則要能 FAIL |
| D-5 | AI 七角色為互動方式 | 角色＝prompt 資料＋允許輸出型別由 schema 強制 | 否則角色只是語氣 |
| D-6 | 「核准」不預設 | Task 無核准狀態；Deliberation 才有閉合 | 狀態機層面消除，不靠流程說明 |
| D-7 | 衡量為研究指標 | 事件導出、聚合、無個人欄位 | 讓「禁止指標」在 schema 不可能存在 |
| D-8 | 未提 HCI／KB／蒐集器 | §11.1 定位三句 | 執行架構責任 |

---

## 15. 開放問題（附建議；由操作者定）

| # | 問題 | 建議 |
|---|---|---|
| Q1 | MVP 首要場景（§B-14.1） | 個人複雜決策（藍圖自己的例子；L2 引擎最成熟；操作者是第一使用者） |
| Q2 | 外化媒介（§B-14.2） | 文字卡＋關係圖先；圖像等 S9（P5 物件儲存＋P-P 加密） |
| Q3 | AI 邊界（§B-14.3） | 外部搜尋只經蒐集器；挑戰強度在合約；R3+ 轉人 |
| Q4 | 資料承諾（§B-14.4） | 單租戶本機優先（現況）；研究同意等第二租戶 |
| Q5 | 試點假設（§B-14.5） | 只驗「判斷形成過程可見性」 |
| Q6 | 首批模組（§B-14.6） | S2 四模組＋S4 LEARN；COLLAB／GOVERN 後置 |
| Q7 | `default` 十個方法 | §8.1 建議清單 |
| Q8 | 產品殼網域 | 維持 `cognitive.aware-wave.com`；「認知主權平台」為產品名，Cognitive Engineering OS 為引擎名 |
| Q9 | 工程包 64 個去留 | hidden 不刪 |
| Q10 | 既有結果頁 ⑦⑧ | 改為 `ai_candidates`（S2），不保留「核准卡」 |

---

## 16. 本檔維護規則

- 本檔是產品層敘事正本；物件 schema 進 `SPEC/specs/`（`source_of_truth_for` 指回本檔 §號）；真正取捨進 ADR。
- 批准後：RLMP §0 進度板指向本檔 §12；RLMP §9 定案改寫（判斷卡為終點、報表可選、L4 升格、HCI 定位）；`feature-cognitive-os-completion.md` 八切片映射到 S0–S9。
- 決策改判直接改寫該列，歷史在 git。
