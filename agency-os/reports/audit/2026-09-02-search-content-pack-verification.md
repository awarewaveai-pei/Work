<!-- 本檔為 2026-09-02 完整版，取代同日稍早的中期版本（commit 7e8fe8d96）。 -->
<!-- 路徑異動（2026-09-02/03，ADR-021 §D8）：本報告驗證時的路徑 agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/AI_LEGO_Cognitive_Engineering_OS_Search_Content_Architecture_Pack/ 已遷至 docs/architecture/search-content/；ADR 已編號為 docs/adr/ADR-021-search-content-boundary-and-ownership.md；兩份敘事文件改名為 SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md / ..._CRITICAL_REVIEW.md。本報告內的路徑與行號保留為驗證當時的歷史紀錄，不回溯修改；§5A 任務 1–12 與 §5B 授權範圍內項目的處置結果見 agency-os/WORKLOG.md 2026-09-02（續1/續2）與 2026-09-03 SearchContent 條目。 -->

# Search & Content Architecture Pack — 獨立驗證報告（完整版）

> **驗證編制**：兩個多代理 workflow（缺口分析 35 agents／內容驗證 18 agents，共 53 agents、約 780 萬 token、1227 次工具呼叫）＋ Claude 逐條獨立複驗。
> **Claude 親手複驗過的項目**（非僅採信 agent 輸出）：B1 的兩個檔名不存在（`find` + `git log --all --diff-filter=A` 零命中）、B2 的 `search_source_profile` 雙重定義、B3 的 tenant 缺席（`grep -ci tenant` = 0）、M7 的 51 gate／0 門檻與 90 ID／0 紀錄（`grep -c registry_entry` = 1、`owner:` 填值 0 行）、M15 的三條超尾行號（`wc -l` = 84／181／178）、baseline commit `4b26e8361` 存在。
>
> **兩處我對 workflow 原始輸出的更正**：
> 1. 首輪機械檢查回報「62 條引用損壞」。**這個數字的粒度會誤導**：實際是 **6 個相異錯誤**（2 個不存在的檔名 + 3 條超尾行號 + 1 條歧義路徑），因 12 份共用同一張證據表而各出現一次。本報告 B1 講的 218 是**引用出現次數**（97 + 121），與 6 個相異錯誤不衝突，是同一件事的兩種計數。
> 2. 首輪曾指「架構 §31.7 的四項發布後檢查被刪除」。**實測為誤**：那四項被**搬到 `PUBLISHING_ADAPTER_CONTRACT.md` §9 Publish Validation（發布前）**。搬移仍是實質問題（發布前驗的是自己的草稿，發布後驗的才是 CMS 真的吐出來的頁面），但不是刪除。

---

# Search & Content 架構包 — 獨立驗證報告

**驗證對象**：`agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/AI_LEGO_Cognitive_Engineering_OS_Search_Content_Architecture_Pack/`（12 份 .md + README + BUILD_MANIFEST.json，約 4,475 行）
**驗證方式**：機械路徑/引用檢查（143 條唯一路徑）＋ 12 份逐檔審查 ＋ 4 組交叉稽核（跨文件一致性／critical review 閉環／架構忠實度／治理合規）
**Baseline**：`4b26e83612caad72698271545ee1952058cc32dd` — **已驗證為真**（`git cat-file -t` = commit，即 `4b26e8361 refactor(hci): align runtime with Projects product roots`，目前 main HEAD）

---

## 1. 一句話結論

**邊界決策可信，欄位層不可信 —— 可以拿它當「誰擁有什麼、不准重建什麼」的裁決依據，但現在還不能拿任何一個 YAML 區塊去生 machine-readable contract，因為同一個物件在包內被定義兩次且欄位不相容。**

補充兩點，因為它決定你要花多少力氣：

- 這不是幻覺產物。我抽查的每一條「平台上有什麼」的主張（A0–A4 authority ladder、ADR-005 的 `^[a-z_]+\.[a-z_]+$` 命名文法、ADR-011 的 gate 所有權、Evidence 的 8 個 quality dimension、Repository storage role enum）**全部為真**。全包 **零發明數字** —— 多位審查者各自 grep 過 threshold／百分比／權重／weight，唯一命中的數字是版本字串 `1.0.0-draft`。以你的紅線標準，這點做得比多數人類架構文件好。
- 但它是**骨架**，不是規格。~90 個 registry ID 全部指向一個空白的 `registry_entry` 模板；51 個 gate ID 沒有一個有 owner、severity 或 validator；幾乎所有 YAML 欄位的值是空的。BUILD_MANIFEST.json 的 36 個布林值全為 true，實際上只編碼了 3 個事實（見 §3）。

---

## 2. 必須先修的（BLOCKING）

判準：**會產出彼此不相容的 contract / fixture，或使包內自己的驗收條件在數學上不可能通過**。以下 7 項全部有兩組以上獨立稽核命中。

### B1｜全包 218 條證據引用指向兩個從不存在的檔名

| 項目 | 內容 |
|---|---|
| **文件** | 全 12 份（header L7-L8 ＋ 共同證據基準表的每一條 `EV-V3-*` / `EV-CRIT-*`） |
| **錯誤** | 引用 `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md`（97 處）與 `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md`（121 處） |
| **證據** | `find D:/Work` 對兩個檔名皆零命中；`git log --all --diff-filter=A --name-only` 確認**歷史上從未加入過**。真檔是 `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture.md`（5,881 行）與 `..._Critical_Review.md`（2,224 行），由 commit `14a8a063c` 加入 |
| **嚴重度** | 內容是對的 —— 抽查的行號全部落在正確段落（arch L68 = `## 2.1 AI LEGO is the Horizontal Platform`；CR L496 附近 = `SCV3-H-01` method namespace 碰撞；arch L1051 = `required_source_tiers`）。所以這是 **rename 沒有傳播**，不是捏造證據 |
| **後果** | 包內自訂規則「所有 `FINDING-*` 均只使用已驗證的檔案／行號」形式上失效；`BUILD_MANIFEST.json` 的 `has_evidence: true` 對 12 份文件都無法被機器滿足 |
| **修法** | 全 12 份做兩次字串替換（見 §5 任務 1）。**最便宜的一項，先做** |

### B2｜同一個物件在包內被定義兩次，欄位不相容，且沒有任何 SSOT 宣告

三處確認：

- **`citation_observation`** — `SEARCH_CONTENT_DOMAIN_MODEL.md:258-265` vs `SEARCH_INTELLIGENCE_SPEC.md:229-236`。7 個欄位有 6 個改名，`claim` 關聯從單值 `claim_context_ref` 變成陣列 `resolved_claim_refs[]`，Intelligence 版沒有 `id`。唯一相同的欄位是 `observed_at`。兩份文件在 Integration Matrix §3 的權責表上都涵蓋此物件（`:162` 給 Domain Model「vertical object semantics」、`:165` 給 Intelligence Spec「observation models」），**無裁決條款**
- **`search_source_profile`** — `SEARCH_CONTENT_DOMAIN_MODEL.md:134-149` vs `SEARCH_SOURCE_PROFILE_AND_AUTHORITY_POLICY.md:116-132`。`search_domains` → `domains` 改名；後者掉了 `tenant_ref`/`workspace_ref`/`created_at`/`updated_at`，`status` 掉了 enum，多出 `ingestion_modes`/`legal_or_terms_constraints`/`active_from`/`active_to`
- **`content_performance`** — `CONTENT_MEASUREMENT_SPEC.md:265` 多出 `baseline_refs: []`，`SEARCH_CONTENT_DOMAIN_MODEL.md:416-431` 沒有；而下游 `CONTENT_BRIEF_CONTRACT.md:186` 用的是單數 `baseline_ref`。`baseline_refs` 在全包只出現這一次，無定義

**根因（這才是要修的東西）**：41 個 YAML contract 區塊中，`source_of_truth_for` 與 `decided_by` 的 grep 命中數為 **0**。而平台自己的 `specs/cognitive/method.schema.yaml:33` 就帶 `decided_by: "docs/adr/ADR-005-...md (ACCEPTED 2026-08-29), Sub-decision (b), Option B"`。缺這兩個欄位就是為什麼包內能同時存在兩份真相卻沒人發現 —— 這直接違反 README 核心原則 #2。

**修法**：把 Integration Matrix §3 的「文件唯一權責」表升級成 **field-level 裁決**（每個 object 指名一份 schema SSOT，其餘只准 by-reference），並在每個 YAML 區塊加 `source_of_truth_for` / `decided_by`。

### B3｜10/16 個 persisted object 沒有 tenant scope，包含會對外部 CMS 寫入的那一個

- `SEARCH_CONTENT_AI_LEGO_INTEGRATION_MATRIX.md:103` 下的是**無條件**要求：「每個 persisted vertical object 必須攜帶 scope refs」
- `SEARCH_CONTENT_DOMAIN_MODEL.md:505` 自行加了鬆綁：「...tenant/workspace scope **where applicable**」，而「applicable」從未定義
- 實際掃描：有 scope 的僅 `search_source_profile`(L134)、`search_query`(L157)、`topic_cluster`(L285)、`evidence_pack`(L342)、`content_brief`(L375)。**無 scope 的包含 `content_publication`(L393)、`content_performance`(L416)、`refresh_context`(L438)** 及 5 種 observation
- 而下游要求硬擋：`SEARCH_CONTENT_MVP_VERTICAL_SLICE.md:315`「cross-tenant ref | hard BLOCK」、`SEARCH_EVIDENCE_RETRIEVAL_SPEC.md:283`「Tenant scope missing | BLOCK」

**同一物件的第二層問題**：`content_publication`（`SEARCH_CONTENT_DOMAIN_MODEL.md:393-409`）相對於 master architecture `:4420-4448` 掉了 `tenant_ref`/`workspace_ref`/`project_ref`、`publish_execution_ref`、`provenance`，也沒有任何 approval ref。這讓 architecture 驗收條件 #3（`:5649`「A published page is linked to its Artifact reference, Brief, Evidence Pack, Execution, and approval record」）在數學上不可能滿足，也讓 `search_content.publishing.approval_binding` 這個 gate 沒有欄位可以驗。

**修法**：把 `where applicable` 改成明列清單或直接刪掉例外；補回 `content_publication` 的四個欄位。

### B4｜ContentPublication 的 state machine 走不通 MVP 自己設計的路徑

三個互相咬住的矛盾：

1. **failure enum 兩份**：`SEARCH_CONTENT_DOMAIN_MODEL.md:476`（5 個）vs `PUBLISHING_ADAPTER_CONTRACT.md:202-210`（9 個）。Domain Model 缺 `REMOTE_CONFLICT` / `AUTH_FAILED` / `RATE_LIMITED` / `VERIFY_FAILED`
2. **MVP 依賴未定義狀態**：`SEARCH_CONTENT_MVP_VERTICAL_SLICE.md:313` 的 failure matrix 直接用 `VERIFY_FAILED`
3. **staged-only 無路可走**：MVP Step 12（`:266-276`）明說不做 production publish，只跑到 `publishing.preview`（= `PREVIEW_READY`），Step 13 卻要求跑出 `ContentPublicationVerified` 事件。但兩份文件逐字相同的 state machine（`PUBLISHING_ADAPTER_CONTRACT.md:190-196` = `SEARCH_CONTENT_DOMAIN_MODEL.md:467-473`）只有經 `SCHEDULED|PUBLISHED` 才能到 `VERIFIED`，且 Publishing §10（`:288-296`）明寫 verify 是驗 published state

**同類但獨立**：`ContentBrief` 的 `REJECTED` 只存在於 `CONTENT_BRIEF_CONTRACT.md:207-213`，Domain Model 的 status enum（`:384`）沒有 —— 被 `REVIEW_REQUIRED` 打回的 brief 無法表示。`SearchSnapshot` 的 `REQUESTED` 只在 state machine 有，不在 status enum（`:189` vs `:481-485`）。

### B5｜`search.*` namespace 被兩份文件指派成互斥用途

- `ADR_SEARCH_CONTENT_BOUNDARY_AND_OWNERSHIP.md:244-246`（§D4 裁決）：`search.* = cross-surface collection/normalization/observation reasoning only`，即 **Method family**
- `SEARCH_CONTENT_METHOD_AND_CAPABILITY_REGISTRY.md:120-129`（§2 Naming Rules 的 **Capability** 段）：`search.<action>` 列為 **Capability namespace**
- 實證：Registry §3 的 64 個 canonical method 中，`search.*` 有 **0 個**；§5 則把 7 個 `search.*` 全列為 Capability

依 ADR 讀，registry 的 7 個 capability 全部違規；依 registry 讀，ADR D4 的第一條 family 規則是死條文。**這是 ADR 自己要裁決的事，不能留給實作者猜。**

### B6｜16–20 個 v3 已承諾的 machine ID 被靜默丟棄；MVP 驗收條件因此不可能通過

Registry 自稱是唯一命名 SSOT（`:100-103`），但 v3 §52/§53 提出的一批 ID **既沒被納入 canonical catalog，也沒進「Explicitly Retired」(4 筆) 或「Rejected Capability Names」(4 筆)**。grep 全 12 份文件，每一個都是 0 命中。

> **⚠️ 稽核者不同調**：三組稽核給出 **20 / 17 / 16** 三個數字。差異在於是否計入 3 個 `knowledge.*`（Registry §5 明說路由給 Core 但**沒有開任何 `DEPENDENCY_REQUEST`** —— 全包 `DEPENDENCY_REQUEST` 只出現 1 次，就是那條規則本身）。修的時候用 set-diff 重算，不要採信任一個數字。

已確認被丟且**包內其他文件實際需要**的至少 4 個：`search.build_evidence_pack`（arch `:4907`；Retrieval Spec §7 產 EvidencePack 卻無 capability ID）、`search.source_conflict_analysis`（Retrieval Spec `:236-246` 的 `conflict_analysis` 有 `method_ref` 欄位但無 method）、`search.evidence_authority_analysis`（Source/Authority 產 AuthorityAssessment 卻無 producing method）、`content.build_refresh_context`（MVP Step 16 無 capability）。

**連帶**：`DecayObservation` 是 MVP Step 15（`:284-286`）的產出物，**全包無 schema**，不在 ADR §D1 的「SearchContent 可擁有」清單（`:167-188`），而 MVP 驗收條件 3 又要求「All persisted vertical objects have scope/provenance/version」。`SEARCH_CONTENT_DOMAIN_MODEL.md:443` 的 `refresh_context.trigger_refs: []` 指的正是這個不存在的物件。

因此 MVP 驗收 #2「All Method/Capability refs resolve canonical registries」現在不可能通過。ADR §7 自訂的 migration 規則（freeze → inventory → alias/deprecation map → tombstone，`:367-382`）沒有套用到這批 ID。

### B7｜Retrieval Spec 造了一個完整執行層，但沒綁任何 Method / Capability / Gate / Workflow IR

這是全包**唯一一個真的踩到自己核心承諾**的地方，值得單獨講。

包的中心主張是「不建第二套 RAG / evidence / artifact / workflow runtime」。前三項**確實做到了**（見 §4）。第四項沒有：

`SEARCH_EVIDENCE_RETRIEVAL_SPEC.md` 定義了 planner、channel selection、candidate envelope、rerank policy、**自帶 key grammar 的 cache**（`:260-272`，未對應 `repository-contract.schema.yaml:177` 的 `cache` storage role）、degradation ladder、BLOCK/FAIL_CLOSED 語意、telemetry —— 一整個執行層。而它：

- `:103` 宣告「RetrievalPlanner (SearchContent Method)」，但 Registry §3 **沒有任何 retrieval-planning method ID**
- 全文 **0 個 gate ID**（Quality Gates 也沒有 `search_content.retrieval.*` family）
- **從未提及 Workflow IR 編譯**，直接牴觸 master architecture `:4870`（「The router is best modeled as a SearchContent Method and/or Capability that compiles into the existing AI-LEGO Workflow / execution path」）與 `:4891`（「Workflow IR remains the executable orchestration representation」）
- 它的「直接依賴」清單（`:14-16`）沒有 Method、Capability 或 Workflow IR

**這還不是第二個 runtime，但它是第二個 runtime 長出來的那道縫，而且目前無人看守。** MVP 的驗收清單也剛好把 architecture `:5654` 的「Every SearchContent Recipe validates and compiles to Workflow IR」拿掉了 —— 唯一能機械抓到這件事的檢查被移除。

---

## 3. 重要但不擋路（MAJOR）— 依延遲成本排序

**M1｜BUILD_MANIFEST.json 的 36 個布林值只編碼 3 個事實**
四個 section 在 12 份文件中 byte-identical（sha1 各一個，n=12：證據表 `6e85c0f478`／5053 字元、路徑治理 `7efa27cd7c`、驗證指令 `5077fc6da0`、工程身份 `d0375b1c82`）。所以 `has_evidence: true` 對 ADR 與對 Brief Contract 背後是**同一塊文字**。manifest 的非布林欄位（行數、字元數）逐檔精確，這讓布林值更容易被誤信，不是更少。
**這條的延遲成本最高，因為它是「宣稱與真實不符的偵測器」—— 你自己的 §已知信任邊界紅線。**

**M2｜§11「驗證」是四條通用 git 指令，且今天就是紅的**
我在 D:/Work 實跑：ID grep 回 127 行全噪音，比對基準是同一份 PROPOSED 包的文件 8（不可機器判定）；`git diff --check` 今天 exit 2，卡在**不相干的** `agency-os/memory/CONVERSATION_MEMORY.md:593`。同時 repo 內已有真的 harness：`tests/run_golden_tests.py` 今天跑出 `PASSED: 851`，`tests/README.md:14-22` 就是包裡說想要的 positive/negative fixture 契約。包沒引用它，反而提議 `tests/integration/search-content/`（不存在；`tests/contracts`、`tests/architecture` 存在）。**VBC 失敗：既有機制沒查就設計新的。**

**M3｜零 OPEN_QUESTION、零 DEFERRED，違反包自訂規則**
包的 boilerplate 自己寫「尚未被證據直接支持者必須標為 `OPEN_QUESTION`」。全包 `OPEN_QUESTION` 命中數 = 1（就是那條規則），`DEFERRED|TBD|PENDING|OPERATOR_SET_PENDING` = 0。而 51 個 gate 無門檻、~90 個 registry ID 無 owner —— 這些是教科書等級的 DEFERRED 項。上游也沒登記：`.ai/research/phase-0/open-questions.yaml` 0 命中、`docs/adr/ADR_INDEX.md` 0 命中、`.ai/proposals/` 無相關檔。
**未標記的缺口比標記的缺口危險：讀者分不出「刻意延後」與「忘了寫」。**

**M4｜ADR 做了 8 個裁決（D1–D8），只為其中 1 個考慮過替代方案**
`ADR_SEARCH_CONTENT_BOUNDARY_AND_OWNERSHIP.md:138-156` 的三個 Option 全部在回答 D1。D2–D8（外部搜尋邊界、Entity、Method namespace、Capability、Event ownership、Publishing authority、Repo namespace）各有真實分岔，全無選項。D4 直接判 `KEEP seo.search_intent_analysis / RETIRE search.intent_analysis`，從未陳述或評估相反指派。且既有的三個選項不對稱：A、B 只有 `**Reject**` 無 benefits，C 無 costs。對照 repo 自己的樣板 `ADR-017:22-26` 是雙欄 Benefits／Costs-risks，連採用的那個都列。

**M5｜Master architecture 從未被修正，也從未標為 superseded**
每一條「修法 = 改 v3 用詞」的 review finding，字面上都還留在 master：`:64`（M-01 runtime 用詞）、`:1051`（`required_source_tiers`，H-02）、§3 Entity 列無 maturity caveat（H-04）、`:358`/`:4977`（`/cognitive/domain-packs/`，M-03）。更糟的是 heading 編號**重複**：`## 25.1`–`25.10` 在 L2364（LLMO）與 `## 25.1`–`25.4` 在 L4324（Publishing）；`## 32.x` 在 L3664 與 L4584 各一次。**任何未來 ADR 引用「§32.2」都是歧義的。** 而 master 仍宣稱自己是 conceptual SSOT、child spec 不得被要求補它的洞，包內唯一提及自己的地方是 `:5799` 的 Next Documents 清單。

**M6｜SCV3-M-07 被抹掉而非回答**
Critical review 要求把所有 SEO/GEO/AEO/LLMO/Entity/Local/CRO/ASO 方法論標為 `DOMAIN_PROPOSAL`（未經外部證據佐證）。包把 ~60 個這類 Method ID canonicalize 了，而 `registry_entry` 的 status enum（`PROPOSED|CONTRACTED|VALIDATED|RUNTIME_IMPLEMENTED|DEPRECATED|RETIRED`）**只有 contract lifecycle 軸，沒有 evidence maturity 軸** —— 一個方法可以在零領域證據下被標成 `VALIDATED`。全包 grep `DOMAIN_PROPOSAL|DOMAIN_METHOD_DESIGN|efficacy|empirical` 只有 1 個不相干命中。

**M7｜Registry 與 Gate 是空模板**
Registry §7 定義了 11 個欄位（owner/status/version/purpose/input_types/output_types/contract_path/aliases/distinct_from/provenance），對 90 個 ID **填了 0 個**。Quality Gates §3 定義 11 欄 gate record，對 51 個 gate 填了 0 個 —— 沒有 severity，所以 §12「每個 BLOCK gate 至少…」的規則沒有對象；沒有 `applies_to_artifact_types`，所以 §10 依 content type 分流的規則無法執行。**這阻擋 Stage 1 寫 code，不阻擋 ADR 決策。**

**M8｜第三、第四套 maturity/status 詞彙，且完全沒引用平台的 ACTIVE epistemic 契約**
Architecture `:207` 是明確 MUST + 8 值 enum。Integration Matrix 用 `ACTIVE_SCHEMA`（在 enum 內）混 `MINIMAL_NEW_DESIGN`（不在）＋ 11 列自由散文。Registry `:232` 再開第四套。無任何映射表。同時：`specs/governance/epistemic-label.schema.yaml`（status: ACTIVE，ADR-004，本身就是為了收斂「四套不相容詞彙」而生）在全 12 份文件 **grep `epistemic` = 0 命中**，而平台 Event Ledger 是硬 `$ref` 它的（`event-ledger.schema.yaml:438`）—— vertical event 若不帶它會靜默失去平台的 provenance 軸。

**M9｜完全沒碰到的平台 ACTIVE 契約（各自代表一個未來重建風險）**

| 缺席契約 | 為什麼危險 |
|---|---|
| `specs/evidence/sentence-provenance.schema.yaml`（ACTIVE） | 全包 grep `sentence` = 0。這是 citation 錨定的正本；一個產出「附引用內容」的 vertical 沒提到它，是最可能被下游默默重建的物件 |
| `specs/execution/status-codes.schema.yaml` ＋ ADR-019（ACCEPTED） | Publishing 的 `ROLLED_BACK` 與 canonical side state 逐字相同、`PARTIALLY_PUBLISHED` 是 `PARTIAL_SUCCESS` 改名。ADR-019 已裁決語意原因走 `reason_code` 而非新增 top-level state |
| `policies/ai-execution/mandatory-gates.yaml`（ACTIVE，594 行） | Quality Gates §10/§11 問的正是「gate 何時強制」，卻不引用這份已有答案的 policy-as-code |
| `specs/execution/deprecation-pipeline.schema.yaml`（ACTIVE） | 明文治理 `Method`/`Capability` 退役的 7 步流程；Registry §4 自行手寫了一個較輕的版本 |
| `specs/execution/audit.schema.yaml`、`rollback.schema.yaml`、`risk-tier.schema.yaml` | 皆 ACTIVE，皆無 ownership row。Retrieval §10 另立一套 per-run telemetry 詞彙未綁 canonical audit record |

**M10｜Quality Gates §11 誤述平台 Global gate 的觸發方式**
文件寫 `Risk-triggered Global/High-risk Gates from AI-LEGO`（`:253`）。平台明寫 Global 的 14 項「all mandatory for every deliverable **regardless of risk tier**」（`gate.schema.yaml:238`），只有 6 項 High-risk add-on 才由 R3∪R4 觸發。**照文件實作會漏跑 14 個強制 gate。**

**M11｜Gate 與 check 兩份清單、且沒有一份文件用 gate ID 綁定**
Publishing §9（`:275-285`）10 條散文 hard check vs Quality Gates §8 8 個 gate ID：5 條 check 無 gate（hreflang、media refs、alt、slug/url、redirect）、3 個 gate 無 check（metadata_validation、remote_diff、rollback_readiness）。而 `publishing_operation_policy.required_domain_gates: []`（`:224`）從頭到尾是空的。MVP 則用 Quality Gates 從未定義的「gate bundle」當納入單位（`:129-131`）。
**另**：4 個跨領域 gate（evidence / source_authority / freshness / citation）被 v3 的 flat 命名移進 `search_content.geo.*` —— 純 SEO、純 brand、純 local 的內容因此**沒有任何 claim-evidence gate**。

**M12｜brand.* / accessibility.* 共 6 個 gate 宣告 `category: DOMAIN_METHOD_SPECIFIC` 但無對應 method family**
ADR §D4 的 family 清單與 Registry §3 都沒有 brand / accessibility。`method_refs: []` 對所有 gate 皆空，所以依平台定義這 51 個 gate 目前沒有一個算 method-specific gate。且 Quality Gates §2 自己的範例 ID `search_content.brand.fact_consistency`（`:121`）在自家 §6 目錄裡不存在。

**M13｜Attribution 是 Measurement 文件名的一半，從未被 contract 化**
`CONTENT_MEASUREMENT_SPEC.md:217-230` 只給 6 個模型名 ＋ 2 條散文規則。無 AttributionModel 物件、無欄位、無 ID 文法，§14 Proposed Paths 也沒排程。而 `attribution_model_ref: null` 已經是三份文件的欄位（Measurement `:273`、Domain Model `:427`、Brief Contract `:189`）—— 包已經出貨了一個 resolve 不到任何東西的 reference type。同層級：`engagement` 在目的陳述與 §2 都出現，全包只出現 2 次，從未被規格化；publication→GSC/GA4 的 join key 從未定義（§10 反而把它列成 data-quality「限制」）。

**M14｜v3 已定義但整批消失的交付物**
Domain Pack §6（`/cognitive/domain-packs/search-content/`，v3 自己的 method lifecycle 第一站，grep = 0）、MVP 的 ingestion leg 與 chunking policy（§48 明文約束「Avoid blind fixed-length chunking」，grep `chunk` = 0；MVP Step 1 直接從「known source refs」開始，「30–50 sources」的規模也不見了）、13 值 artifact-type catalog §56（而 gate 正是以 `applies_to_artifact_types` 為鍵）、URLTopicMap §15/§22.11（grep = 0）、Recipes §54 ＋ Workflow-IR 編譯驗收條件、SC-Phase 0–8 §64（grep = 0）。

**M15｜三條行號超出檔尾，且所有行段是生成的整十位數**
`Architecture-Constitution-v1.md:L1-L90`（實 84 行）、`ADR-006-...md:L1-L220`（實 181 行）、`claim.schema.yaml:L1-L180`（實 178 行），各 ×12 = 36 條。其餘皆 L1-L180/220/230/240/260/280 這種形狀，對照 350/430/688/930 行的檔案。內容主張為真，純屬引用衛生。

**M16｜全 12 份仍以現在式宣稱交付路徑是 `/mnt/data/search_content_architecture_pack_zh-TW/`**
實際落在第三個路徑（commit `14a8a063c`），既非它、也非各文件自己宣告的 `Proposed repo path`。

**M17｜包自訂的 Integration Acceptance Gate 悄悄少了 review 的 8 道閘中的兩道**
Integration Matrix `:172-186` 的 8 條 AND 對應 review Gate A–F ＋ 路徑核准，漏掉 Gate G（measurement 完整性，實質上已做，屬美觀問題）與 **Gate H（文件完整性，完全沒做 —— 正是它的缺席讓 M5 的重複編號沒被抓到）**。且這 8 個 token 全部無定義：grep 全包，每個 token 恰好命中 1 次，就在那條 AND 表達式裡。

---

## 4. 這個 pack 做對了什麼（別重做）

不是客套。以下每一項都有多組獨立稽核交叉確認，你可以直接沿用。

**4.1 核心原則 #3（不重建 core object）—— 做得非常好，而且是用可執行的否定約束，不是形容詞**

引述可直接當紅線用的句子：
- `SEARCH_EVIDENCE_RETRIEVAL_SPEC.md:100`「Repository Contract 已擁有 storage/retrieval substrate；Live Web Search 不能被當另一個 storage engine」
- `:192`「Live external candidate 在 promotion 前可以沒有 evidence_ref；**不得偽造 Evidence ID**」
- `:256` EvidencePack「不是複製 canonical Evidence body」
- `SEARCH_CONTENT_DOMAIN_MODEL.md:368`「禁止複製 canonical Evidence content/quality 當第二真相」
- `:452`「`decision_ref` 指向 Core Decision；此 vertical 不建立另一個 decision schema」
- `:501`「任何 Tier-2 projection 可重建，不能成為唯一 truth」

ADR §D1 的「不得擁有 canonical」清單（`:190`）點名 Source / Evidence / Claim / Decision / Artifact / Workflow IR / Event Ledger / Gate catalog / Authority ladder / Repository substrate 十項。Integration Matrix 的 23 列每列都有獨立的「禁止事項」欄。**沒有第二個 vector/graph/FTS store、沒有第二個 Evidence 或 Decision record、沒有 vertical Artifact core。** RAG／evidence／artifact 三項的委派是真的。

**4.2 零 false precision —— 全包沒有任何發明的數字**
多組稽核各自用 regex 掃過門檻／百分比／小數／天數／`>=`／`threshold`／`門檻`，全包唯一命中是版本字串 `1.0.0-draft`。更值得記的是它**在該給數字的地方選擇留白而非猜**：`tier:`/`weight:` 空著、retention tier 命名但不編週期、「bounded retry」不編次數、§5 明說「Score formula 不寫死在 architecture」、§7 把可比性設為「固定 sampling contract」的條件而非斷言一個數。ADR §D7 更主動禁止最誘人的捷徑：「不得用 risk tier number == authority number 自行推導」。
**以你的紅線標準（改資料／加豁免／調門檻去消音偵測器是最惡樣態），這一層完全乾淨。**

**4.3 Status 與權限紀律 —— 無可挑剔**
`ADR:101-107` 帶機器可讀區塊 `status: PROPOSED / approval_required: true / self_approval_by_ai: forbidden`，後接「不能因為文件已寫完就視為 ACCEPTED」。`:62` 拒絕自己編 ADR 編號（檔名保持 `ADR-0XX`，理由寫明「不得自行猜一個未登記的 ADR number」）。`:54` 把目標 namespace 標 `PROPOSED_PHYSICAL_PATH` 並路由到 ADR-006。驗收條件第一條（`:397`）是「Operator explicitly approves ADR」。全 12 份 `Status: PROPOSED`。
**它沒有一處自我授權。**

**4.4 對平台的事實陳述準確 —— 抽查全中**
A0–A4（`authority.schema.yaml:149`）、ADR-005 bare `<family>.<name>` 且真有 regex `^[a-z_]+\.[a-z_]+$`（`method.schema.yaml:153`）、ADR-011 Global/High-risk 由平台擁有而 method-specific namespace 開放（`gate.schema.yaml:38, 148-150, 272-279`）、Evidence 的 8 個 quality dimension（`evidence.schema.yaml:94, 102-125`）、`hierarchy_tier` 刻意不定型因為「hierarchy varies per domain」、Repository 的 7 個 storage role（`repository-contract.schema.yaml:172-178`）、`gate_result` 欄位清單逐字相符 ＋「NOT_APPLICABLE 必須 rationale」對應 schema 的 if/then（`:190-196`）、`evidence-graph.schema.yaml:281` 的 `NEW_DESIGN` 自陳。**沒有找到一條無憑據的平台主張。**

**4.5 Critical review 的 20 條，有 9 條是真的關掉了 —— 而且用的是 review 指定的機制**

| Finding | 關法 |
|---|---|
| SCV3-H-02 | 拿掉無條件 `required_source_tiers: [P0,P1]`，換成 per-claim `claim_requirements` ＋ authority/freshness policy ref（`CONTENT_BRIEF_CONTRACT.md:100-103, 140-155`）；P0-P3 降為 UI 標籤 `policy_semantics: null` |
| SCV3-H-03 | dual-path retrieval：內部走 Repository/Knowledge ports、外部走 Capability/Tool/Provider Adapter，`LIVE_EXTERNAL` 成一級 channel |
| SCV3-H-04 + M-05 | Entity 標 `MINIMAL_NEW_DESIGN`；`raw_observed_entity{provider_type, provider_value}` 與 nullable `entity_ref` 分離，只在解析成功才填 |
| SCV3-H-08 | 四層拆解（provider raw → normalized → metric calc → projection）＋ versioned MetricDefinition ＋ MeasurementRun ＋ ContentPerformance 明標為 rebuildable projection |
| SCV3-M-02 / M-04 / M-08 / M-09 | RefreshContext 歸 vertical、`source_ref` 宣告 opaque、publishing approval 走 policy record、Evidence 用 supersede 不用 overwrite |

**這 9 條不要重做。**

**4.6 ADR §D4 是「關掉整類」而非「打補丁」的正確示範**
它先定 family 規則（`search.* = cross-surface collection/normalization/observation reasoning only`），再從規則推出 4 個 KEEP/RETIRE 裁決，最後**預先關掉下一個實例**：「DO NOT CREATE `search.entity_gap_analysis` unless a distinct cross-surface semantic is later ADR-defined」。Registry §9 也是 class-level CI 不變量（「same semantic fingerprint cannot have two ACTIVE IDs」）。Domain Model §5 的 7 條 data invariant 同樣是普遍陳述。
**這正是你 R0 的補丁判準要的形狀。** 唯一缺的是 §12 要求的「窮舉這一類的所有候選」那一步 —— 沒做這步，正是為什麼包內自己的 `search_source_profile` 重複定義活了下來（B2 的諷刺點）。

**4.7 其他值得留的具體產物**
MVP 的 10 列 failure-injection matrix；Measurement §7 的 LLMO sampling contract；ADR §D7 拒絕硬編 publish=A4；Measurement §13 拒絕建 SearchContent 自己的 Experiment truth；Publishing §1 的邊界句（「Adapter 只負責 provider protocol，不負責 SEO strategy / content truth / approval policy」）；Integration Matrix 的 5 條 FINDING 帶 verdict code，其中 FINDING-IM-02 是對 master architecture 發出 `REQUIRED_CORRECTION`（它敢反駁上游）。

---

## 5. 下一步建議

### 5A｜可以逐字交給 GPT 的任務清單（純文件內修正，不碰 D:/Work 治理決策）

> 以下全部在 `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/AI_LEGO_Cognitive_Engineering_OS_Search_Content_Architecture_Pack/` 內完成。**不得**新增 ADR 編號、不得改 `Status: PROPOSED`、不得寫入 `specs/`、`methods/`、`policies/` 或 master architecture。

**任務 1 — 修復證據鏈檔名（先做，最便宜）**
在全 12 份 .md 做兩次全域替換：
- `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md` → `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture.md`
- `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md` → `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture_Critical_Review.md`
含 header L7-L8 與所有 `EV-V3-*` / `EV-CRIT-*` 列。替換後逐條開檔驗證行號落點，把偏移的（如 EV-CRIT-H01 應為 L492 起）改成實際行號。

**任務 2 — 修正三條超出檔尾的行段，並把整十位數行段改成實際讀過的範圍**
`Architecture-Constitution-v1.md:L1-L90` → 實際 84 行；`ADR-006-...md:L1-L220` → 181 行；`claim.schema.yaml:L1-L180` → 178 行。其餘 11 條 evidence range 逐一開檔改成真實段落範圍（參考 repo 自身樣式 `ADR-017:48-52` 的 `:78-86` 這種形狀）。同時修正 `EV-GATE`：它引用的「method-specific gate namespace 可擴充」實際在 `gate.schema.yaml:272-279`，不在 `L1-L240` 內。

**任務 3 — 建立 object schema SSOT 裁決表，消除重複定義**
在 `SEARCH_CONTENT_AI_LEGO_INTEGRATION_MATRIX.md` §3 新增一張 field-level 權責表：每個 vertical object 指名**唯一一份** schema SSOT 文件，其餘文件只准 by-reference。然後：
- `citation_observation`：二擇一（`SEARCH_CONTENT_DOMAIN_MODEL.md:258-265` 或 `SEARCH_INTELLIGENCE_SPEC.md:229-236`），另一份刪除 YAML 改為 `→ 見 <SSOT 文件> §x.y`
- `search_source_profile`：同上（`DOMAIN_MODEL:134-149` vs `SOURCE_PROFILE:116-132`）；合併時必須保留 `tenant_ref`/`workspace_ref`
- `content_performance`：決定 `baseline_refs` 存在與否；若保留則補上定義（baseline 是什麼、怎麼算、存哪），並統一 `CONTENT_BRIEF_CONTRACT.md:186` 的單數 `baseline_ref`
- 統一 execution 欄位命名：`created_by_execution` / `generated_by_execution` / `execution_ref` 三選一，全包一致
- 統一 hash 欄位：`raw_content_hash` vs `content_hash`（注意 `PUBLISHING_ADAPTER_CONTRACT.md:158` 的 `content_hash` 是另一個語意，需重新命名其一）
- 每個 YAML 區塊加入 `source_of_truth_for:` 與 `decided_by:` 兩個欄位（樣式參照 `specs/cognitive/method.schema.yaml:33`）

**任務 4 — 修 tenant scope 缺口**
把 `SEARCH_CONTENT_DOMAIN_MODEL.md:505` 的 "where applicable" 改成明列清單或刪除該例外；為 `content_publication`、`content_performance`、`refresh_context`、`search_snapshot`、`search_observation`、`competitor_observation`、`ai_answer_observation`、`citation_observation`、`ranking_observation`、`authority_assessment`、`freshness_assessment` 補上 `tenant_ref` / `workspace_ref`。另為 `content_publication` 補回 master architecture `:4420-4448` 有而包內掉的欄位：`project_ref`、`publish_execution_ref`、`provenance`、以及一個 approval reference（讓 `search_content.publishing.approval_binding` 這個 gate 有東西可驗）。

**任務 5 — 統一 state / enum**
- ContentPublication failure states：把 `PUBLISHING_ADAPTER_CONTRACT.md:202-210` 的 9 個與 `SEARCH_CONTENT_DOMAIN_MODEL.md:476` 的 5 個收斂成一份，並在 SSOT 表指名所有者
- 在 state machine 補上 staged-only 分支：`PREVIEW_READY → VERIFIED(staged)`，或改 MVP Step 13 不發 `ContentPublicationVerified`。二擇一並寫明理由
- `ContentBrief`：把 `REJECTED` 加入 `DOMAIN_MODEL:384` 的 status enum
- `SearchSnapshot`：把 `REQUESTED` 加入 `:189` 的 status enum；並解決 `SEARCH_INTELLIGENCE_SPEC.md:155-163` 用 bool `partial` 無法表示 FAILED 的問題
- `SEARCH_SOURCE_PROFILE_AND_AUTHORITY_POLICY.md:236` 的 `assertion_type: POLICY` 不在 `:180` 的 enum 內（POLICY 是 `domain` 的值）—— 修正其一
- `capture_request.capture_at` vs `capture_result.captured_at`（`SEARCH_INTELLIGENCE_SPEC.md:150` / `:161`）統一
- `live_external` 在 §2 是字串 `conditional`、§3 是 boolean `false`（`:135-139` / `:153`）—— 定型

**任務 6 — 補齊被丟棄的 machine ID**
用 set-diff 重算 master architecture §52（`:4893-4945`）+ §53（`:4946-4993`）的全部 ID 對 Registry §3/§4/§5/§6 的差集（不同稽核給出 16/17/20 三個數字，以你重算的為準）。差集中的每一個 ID 必須落到三個去處之一：① 納入 canonical catalog、② 進 §4「Explicitly Retired」並附 migration target、③ 進 §6「Rejected」並附理由。三個 `knowledge.*` 若要路由給 Core，必須開出具名的 `DEPENDENCY_REQUEST`（目前全包 0 個）。
特別確認這 4 個 —— 包內其他文件正在使用它們：`search.build_evidence_pack`、`search.source_conflict_analysis`、`search.evidence_authority_analysis`、`content.build_refresh_context`。

**任務 7 — 解決 `search.*` namespace 矛盾**
`ADR:244-246`（Method family）與 `REGISTRY:120-129`（Capability namespace）互斥。二擇一，並讓 §3 Method catalog 與 §5 Capability catalog 的實際內容一致。同時處理連帶：Registry §6 拒絕 capability `search.cluster_queries` 並叫人「改用相對應 Method」，但 §3 沒有 query-clustering method。

**任務 8 — 為 `DecayObservation` 補契約或移除依賴**
它是 MVP Step 15（`:284-286`）的產出、`refresh_context.trigger_refs`（`DOMAIN_MODEL:443`）的指向，但全包無 schema、不在 ADR §D1 可擁有清單。二擇一：在 Domain Model §2 加一節 ＋ 加入 ADR §D1 清單；或改寫 Step 15 使其不產出具名物件。

**任務 9 — 綁定 Retrieval Spec 的執行層**
為 `SEARCH_EVIDENCE_RETRIEVAL_SPEC.md` 補：① `RetrievalPlanner`（`:103`）的 canonical Method ID 並登記進 Registry §3；② EvidencePack 生成的 Capability ID；③ 明文段落說明它如何編譯進 Workflow IR（對應 master `:4870`/`:4891`）；④ `:260-272` 的 cache key grammar 對應到 `repository-contract.schema.yaml:177` 的 `cache` storage role；⑤ 為 `:278-283` 的 BLOCK/degradation 行為註冊 gate ID（新增 `search_content.retrieval.*` family 或指向既有 gate）。同時在 MVP §9 驗收條件補回 master `:5654` 的「compile to Workflow IR」。

**任務 10 — 補齊 Gate 與 Registry 的記錄本體**
Registry §7 的 `registry_entry` 對 90 個 ID 至少填 `owner` / `status` / `purpose`；Quality Gates §3 對 51 個 gate 至少填 `display_name` / `owner` / `severity` / `applies_to_artifact_types`。並修正：
- `SEARCH_CONTENT_QUALITY_GATES.md:253` 誤述 —— Global 14 項是無條件強制（`gate.schema.yaml:238`），只有 6 項 High-risk add-on 由 R3∪R4 觸發
- `:121` 的範例 ID `search_content.brand.fact_consistency` 在 §6 不存在
- brand.* / accessibility.* 的 `method_refs` 無 family 可綁（需先解 ADR §D4 的 family 清單）
- 把 4 個跨領域 gate（evidence/source_authority/freshness/citation）從 `geo.*` 拉回跨領域層，或明文說明非 GEO 內容如何取得 claim-evidence 檢查
- 補 `PUBLISHING_ADAPTER_CONTRACT.md:224` 的 `required_domain_gates: []`，並讓 §9 的 10 條 hard check 與 §8 的 8 個 gate ID 一一對應

**任務 11 — 標記所有未決項**
依包自訂規則，把下列全部標為 `OPEN_QUESTION` 或 `DEFERRED`（含 restart condition 與 owner）：51 個 gate 的門檻／90 個 registry entry 的 owner／`attribution_model`（`CONTENT_MEASUREMENT_SPEC.md:217-230`）／`baseline_refs` 定義／publication→GSC/GA4 join key／engagement 層／retention 週期／§6 idempotency key 的序列化與 hash 函數（`PUBLISHING_ADAPTER_CONTRACT.md:238`）／`partial failure` 處理／§10「approved semantic equivalence」的定義（`:295`）。同時定義 Integration Matrix `:177-185` 那 8 個 gate token —— 現在每個在全包只出現 1 次，無人能評估。

**任務 12 — 文件衛生**
① 全 12 份的路徑治理段：`/mnt/data/search_content_architecture_pack_zh-TW/` 已非現況，改為歷史陳述或更新為實際 commit 路徑；② 補回 Integration Matrix `:172-186` 缺的 review Gate G 與 **Gate H（文件完整性）**；③ 為 `ADR:299` 的 `ContentOpportunityCreated` 指定 aggregate owner 或移除（該 aggregate 全包無建模，牴觸 ADR 自訂的 `:318` 規則）；④ 決定 `ContentPublicationRolledBack`（`PUBLISHING_ADAPTER_CONTRACT.md:304-306`）是否納入 ADR §D6 的 event registry。

### 5B｜必須留給 Claude session 或操作者（不可外包）

| 項目 | 為什麼不能給 GPT |
|---|---|
| **ADR 接受與否** | ADR 自己寫 `self_approval_by_ai: forbidden`、驗收第一條是 operator 明示核准。**只有你能點頭** |
| **ADR 編號指派** | 需查 `docs/adr/ADR_INDEX.md`（現行 ADR-001..ADR-020），且 ADR 明文禁止自己猜 |
| **physical path 決定** | ADR-006（ACCEPTED）把 repo layout 定為架構決策，須走 `.ai/proposals/` 流程。目前包落在第三個路徑，兩份文件宣告的都不是它 |
| **與已在進行的 Phase 5 MVP slice 的碰撞裁決** | `AI_LEGO_OS_Program_Plan_v1.md:148-150` 已定義 Phase 5 為**唯一**出口 slice，`ADR-014`（ACCEPTED 2026-08-30）已選定 Research 模式，`docs/architecture/MVP_VERTICAL_SLICE_PLAN.md` 已存在且 2026-08-30 已「實作開工」。**全 12 份文件 grep `MVP_VERTICAL_SLICE_PLAN|ADR-014|Phase 5` = 0 命中。** 這是取代／後續／並行，只有你能決定 |
| **master architecture 要不要下 errata 或 superseded header** | 寫入 `agency-os/` 的既有正本，屬 R0 範疇。含重複 heading 編號（`## 25.x` / `## 32.x` 各出現兩次）的修正 |
| **`required_source_tiers` 的反向分歧** | 這一條包是對的、master 是錯的：`CONTENT_BRIEF_CONTRACT.md` 拿掉了無條件 `[P0,P1]`，而 master `:1051` 還在，且牴觸它自己 §7.2。**需要修的是 master，不是包** |
| **domain method 的 evidence maturity 軸** | SCV3-M-07 要求 ~60 個 SEO/GEO 方法標為未經證實。加不加這條軸、以及是否接受「零領域證據可標 VALIDATED」，是產品層判斷 |
| **BUILD_MANIFEST 語意修正 ＋ 接上 `tests/run_golden_tests.py`** | 涉及 repo 內既有 harness（今天 851 passed）與偵測器誠實度，屬你的 §已知信任邊界紅線 |
| **ORACLE gate artifact 落地** | `agency-os/reports/oracle/` 最新是 2026-08-30，本次無 artifact。獨立覆審實際存在於 `agency-os/reports/audit/2026-09-02-search-content-pack-verification.md`（commit `7e8fe8d96`），屬**落地位置**問題非跳過覆審 —— 補一份 oracle artifact 即可 |
| **任何寫入 `specs/` `methods/registry/` `policies/`** | 那些是 ACTIVE 平台契約。特別注意 `methods/registry/method-inventory.yaml`（ACTIVE，289 entries）—— 包內 13 個 MVP 用到的 ID **一個都不在裡面**，而 MVP 驗收 #2 要求它們 resolve |

### 5C｜建議的執行順序

1. **任務 1 + 2**（引用衛生，1 小時內，讓後續每一次查證都能真的查到）
2. **任務 3 + 4 + 5**（消除不相容定義 —— 這是「現在改最便宜」的部分；一旦有人依這些 YAML 產 schema，`citation_observation`、`search_source_profile`、ContentPublication state 會直接生出彼此不相容的 contract 與 fixture）
3. **你決定**：Phase 5 碰撞、ADR 編號、physical path（阻擋 6/7/9 的方向）
4. **任務 6–9**（ID 收斂與執行層綁定）
5. **任務 10–12**（記錄本體與衛生）
6. 最後才談 machine-readable contract 生成

---

## 附：稽核者意見分歧（未替你消音）

| 議題 | 分歧 |
|---|---|
| **被丟棄的 machine ID 數量** | 20（含 3 個 `knowledge.*`）／17（不含）／16（另一組計數）。**修時請重算，勿採信任一數字** |
| **`ArtifactPublished` 的成熟度** | 逐檔審查者驗證 `EV-EVENT`「已存在」為真（`event-ledger.schema.yaml:535`）；架構忠實度稽核者指出它只在 `known_event_types.mp_57_example_list` 下、標註為 MP 自陳「例如」的非窮舉清單，**無 aggregate owner、無 payload contract、無 producer**，因此 ADR §D6 用它退役 `ContentPublished` 是踩到「architecture-defined ≠ schema-defined」。**我採後者為準**：ADR 該補一句說明它引用的是一個尚無 payload 契約的 event 名 |
| **`AuthorityAssessment`/`FreshnessAssessment` vs Evidence 的 quality dimension** | ADR 審查者判為**未裁決的重疊**（Evidence 已有 `source_authority`、`recency`）；Domain Model 審查者判為**合法擴充**（`hierarchy_tier` 刻意不定型因 hierarchy varies per domain，且 sibling 文件 `FINDING-SA-01` 已做調和）。**兩者都成立** —— 差別只在 ADR 沒有把這個判斷寫下來。修法是加一段裁決，不是改欄位 |
| **共用 boilerplate 證據表的嚴重度** | 逐檔審查多判 MINOR（裝飾性）；治理稽核判 CRITICAL（因為 `BUILD_MANIFEST.json` 把它當成 12 份文件各自的 grounding 回報）。**我採後者**：問題不在重複本身，在 manifest 用它產生虛假的完整性宣稱 |
| **檔名漂移的嚴重度** | 多數逐檔審查判 MAJOR，Retrieval Spec 與 Intelligence Spec 的審查判 MINOR（因為內容 resolve 得到）。**兩者不衝突**：修復成本是 MINOR，未修時的影響是 MAJOR |