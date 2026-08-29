# ADR-006: Mother-Document Revision Flow and Repository-Layout Ownership

Status: ACCEPTED（2026-08-29，操作者明示授權 Claude 行使架構師裁決權，見 ADR-001 同款範圍聲明）。本 ADR 定義的 `.ai/proposals/` 流程與其 `status: DRAFT→HUMAN_REVIEW→APPROVED` 硬性規則（Claude 永遠不能自我推進至 APPROVED）**本身不受此 ACCEPTED 影響、繼續原樣生效**——本 ADR 被接受，代表「採用這套流程」的架構決策定案，不代表流程本身的守門規則被放寬。
Date: 2026-08-29
Related: OQ-6, OQ-11 (`.ai/research/phase-0/open-questions.yaml`), Program Plan §6, source directive §IX/§X/§XII/§XV

> **編輯者附註**：本 ADR 由背景 subagent 起草。其原始輸出開頭出現一則 harness 自動安全標記，因內容逐字引用 `.claude/settings.json` 的 deny 規則作為證據而觸發「疑似指令注入格式」偵測。經人工核對，這是**誤報**——引用內容是合法的技術論證（證明 branch 禁令是機械層硬擋而非文件層君子協定），已用 `sed`/`grep` 對照 `settings.json` 實際內容逐條驗證屬實（見 Evidence 段）。內文不含任何指向 Claude 的嵌入指令，僅為技術分析與建議，最終仍需操作者核准。

## Context

Phase 2（Architecture Convergence）即將開始修正三份母文件。開工前有兩個治理層級的缺口必須先定案，否則 Phase 2 第一次 edit 就會撞到規則衝突：

**(a) 母文件修改流程衝突** — Source directive §IX（`source-directive-2026-08-28.md:188`）要求「建立 branch：`docs/architecture-v1-review`」，每項修改先出九個欄位再做 diff。但本 repo `.claude/settings.json` deny list（實測命令，非文件宣稱）明確包含：

```
"Bash(git checkout -b *)"
"Bash(git switch -c *)"
"Bash(git switch --create *)"
"Bash(git branch *)"
```

四條規則涵蓋所有建立/切換 branch 的路徑，是 mechanical deny（hard-blocked at tool permission layer），不是文件層面的君子協定。`CLAUDE.md`「## Git 分支（強制）」段重申「禁止建立新 branch」。directive 的具體執行手段（branch）在本 repo 物理上不可行，但 directive 的**目的**（不可直接覆寫母文件、保留 Original、留痕、可回滾）並未被 repo 規則排除——需要一個等效機制。

**(b) Path-as-architecture** — Codex 獨立審查（`CODEX_REVIEW.md` PART B）指出三份規格把 repo 目錄結構直接寫死在憲法級文件本身。Grep 逐條驗證為真，且範圍比 Codex 原引用更廣：

| 文件 | 行號 | 內容 |
|---|---|---|
| Master Plan | L611-616 | `/ai/gateway/ /providers/ /models/ ...` |
| Master Plan | L766-773 | `/specs/cognitive/*.schema.yaml`、`/methods/registry/` |
| Master Plan | L845 附近 | `/workflows/ir/ /compiler/ /recipes/ /validation/ /runtime/` |
| Master Plan | L1002-1008 | `/authorship/contribution-map.json`、`human-edits.json`、`ai-assistance.json`... |
| Execution Contract | L223 | `/specs/governance/document-registry.yaml` |
| Execution Contract | L647/735/2365 | `/.ai/tasks/{task_id}/...` |
| Execution Contract | L1008 | `/docs/adr/ADR-XXXX-<slug>.md` |
| Execution Contract | L2745-2828 | `/tests/architecture/`、`/policies/ai-execution/`、`/specs/execution/`、`/platform/ai-execution/` |
| Execution Contract | L3995-4054 | `/platform/ai-execution/current_state/`、`task_classifier/`、`risk_engine/`、`method_resolver/`、`gate_engine/`、`rollback/`、`authority/`、`tool_broker/`、`audit/`、`handoff/`、`replay/`（逐模組實作級路徑） |

即：這不只是「binding vs advisory 標記不清」（原 OQ-11 的 Option A/B 框架），而是「implementation-detail 級的具體檔名/模組目錄，被寫進 30 年壽命的憲法文件裡」。`CONVERGENCE_MATRIX.md` 已將此列為 Codex 獨有貢獻、Claude 驗真後 PARTIAL_AGREEMENT 採納，OQ-11 因此新增 Option C。

兩者都是「開始編輯母文件前必須先定案」的前置阻塞項，故合併為一份 ADR。

## Decision Drivers

依 Program Plan §6 規定的 13 維比較框架，本案聚焦：**Correctness**（是否真正保留 Original、可回滾）、**Operability**（單機單操作者、無跨 session 記憶的代理需要能冷啟動接手）、**Maintainability**、**Migration**、**Complexity**、**30-year survivability**、**Reversibility**。另受 directive 兩條硬約束：
- §IX：不可直接覆寫母文件丟失原版本；只接受 semantic correction / missing contract / boundary clarification / duplication removal / feasibility / testability / versionability 這幾類，禁止文風美化。
- §XV：「Claude 不得因為自己是 lead 就批准自己的高風險修改」——這是絕對句，沒有依修改類別分級的例外。

## Sub-decision (a): Mother-document revision flow

### Options Considered

**Option A（推薦）**：留在 `main`，每項提案落在 `.ai/proposals/<NNN>-<slug>/`，Original 靠 git history + baseline hash 保存。
**Option B**：操作者為此 docs 子樹解除 branch 禁令。

### 為何 Option B 不可行且不建議

Claude Code 的 permission 引擎是**命令字串比對**，不是路徑範圍比對——`Bash(git checkout -b *)` 這類 deny 規則作用於「這個 bash 指令長什麼樣子」，git 本身的 branch 也不是路徑級物件（branch 是整個 repo 的 ref，不限定於哪個子樹）。因此「只為這個 docs 子樹解禁」在技術上無法只用一條 allow 規則做到範圍限定；唯一做法是修改 `.claude/settings.json` 的 deny 清單本身——這是**全域治理面的修改**，影響整個 `D:\Work` monorepo 對所有任務都放寬的一條防線，不是局部影響。

即使做了，branch 本身也不比 `.ai/proposals/` 提供更多保護：branch 不會強制填九個欄位、不會強制 Original/Proposed/Reason 對照表——人類確實會忘記在 branch 上寫這些（這正是 directive §IX 額外要求它們的原因，branch 本身不夠）。而 Option A 的三層保存（git history 逐 commit 差異 + `document-hashes.yaml` baseline hash + 保留不刪除的 proposals 資料夾）在「保留 Original」這件事上**優於**單純的 branch。

判斷：Option A 在 Correctness 打平，Operability/Migration/30-year survivability/Reversibility 全面勝出。**不建議解除 no-branch 規則**——這不是「風格偏好」，是實測 Option A 已經滿足 directive §IX 真正要保護的東西，而 Option B 要付出的代價（弱化一條保護整個 monorepo 的機械閘）沒有對應的額外收益。

### Option A 具體流程設計

**命名規則**：`.ai/proposals/<NNN>-<slug>/`
- `<NNN>`：三位數、跨三份母文件共用的單調遞增序號（`001`, `002`...），不依文件分開計數。
- `<slug>`：kebab-case，≤ 60 字元，取自 PROPOSED_CHANGE 摘要。
- 資料夾內單一檔案：`PROPOSAL.md`（人類可讀，含 YAML front-matter + 九欄位 + diff）——單一檔案降低漏同步風險。

**PROPOSAL.md schema**：

```yaml
---
proposal_id: "003"
slug: "clarify-scoped-authority-precedence"
status: DRAFT            # DRAFT -> HUMAN_REVIEW -> APPROVED|REJECTED -> APPLIED | SUPERSEDED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "<sha256, 取自 document-hashes.yaml 建立提案當下的值>"
affected_line_ranges: ["L742-L746", "L825", "L833"]
related_open_questions: ["OQ-12"]
change_class: "missing_contract"   # 僅限 directive §IX 允許的 7 類之一
authored_by: "Claude"
approved_by: null
approved_at: null
approval_note: null        # 逐字轉錄操作者的核准訊息，供未來冷啟動 session 稽核
applied_commit: null
---

## PROPOSED_CHANGE
## RATIONALE
## SOURCE_DOCUMENT
## AFFECTED_SECTIONS
## DEPENDENCIES
## COMPATIBILITY
## MIGRATION
## ROLLBACK
## EVIDENCE

## Diff
### Original
### Proposed
### Reason
```

`change_class` 值域鎖定 directive 明列的 7 類（semantic correction / missing contract / boundary clarification / duplication removal / implementation feasibility / testability / versionability），值不在此清單 = 不合格提案，不得進 HUMAN_REVIEW。

**審核者是誰／AI 自我批准的界線（硬性不可違反）**：
- Claude 只能把 `status` 從 `DRAFT` 推進到 `HUMAN_REVIEW`。**永遠不能**自己把 `status` 設為 `APPROVED`——這條不依 `change_class` 分級給例外，因為 directive §XV 的措辭是絕對句，且這三份文件是整個 30 年計畫的單一事實來源。這比 `AGENTS.md` 通用文件風險表（doc/小修 = Low，直接做）更嚴——這是刻意的、針對這三個特定檔案的例外收緊，依「更具體規則覆蓋通用預設」的一般原則，不違反 `AGENTS.md` §規則優先序。
- 核准的觸發是操作者在對話中的明示 go-ahead（沿用既有 R0 Medium-risk 流程「先說計畫，同意再做」）。收到核准後，Claude 的動作限定為機械性寫入：把 `approved_by` / `approved_at` / `approval_note`（逐字轉錄操作者原話）寫進該提案的 front-matter——讓核准本身變成可被未來 session 讀到的**檔案證據**，不是只活在會被 `/clear` 掉的對話歷史裡。
- 目前操作者只有一人，不需要多核准者流程；未來若有第二人，此欄位設計可直接擴充為 `approvers: [...]` 陣列而不用重新設計 schema。

**核准後如何真正套用到母文件**：
1. `approved_at` 一旦寫入，Claude 用 `Edit` 工具把 diff 套進目標母文件（禁止用 `sed`/裸 patch 盲改）。
2. 依「一提案一 commit」：commit message 含 proposal id + `target_baseline_hash` 前 8 碼 + Original/Proposed 一句話摘要，例如：`docs(ai-lego): apply proposal 003 — clarify Scoped Authority precedence (baseline a1b2c3d4)`。
3. commit 完成後，Claude 把該 proposal 的 `status` 改為 `APPLIED`、`applied_commit` 填入實際 commit hash。
4. `.ai/proposals/<NNN>-<slug>/` 資料夾**永久保留、不刪除**，即使已 APPLIED——它本身就是稽核軌跡的一部分。

**與 git commit 歷史的關係**：Original 內容不靠任何額外備份機制——`git show <target_baseline_hash>:<path>` 或 `git log -p` 就能取回逐字原文；`.ai/proposals/` 保留的是「為什麼改」的敘事層，git history 保留的是「改了什麼」的內容層，`document-hashes.yaml` 的 baseline hash 是連接兩者的錨點。三層合一即是 directive §IX「不可直接覆寫後丟失原版本」的完整實現，且比單一 branch 冗餘度更高。

## Sub-decision (b): Repository layout ownership

### Options Considered

**Status Quo**：路徑細節留在母規格原地。
**Option C（Codex 提案）**：repo-layout 全部移出母規格，只活在一份 machine-readable、Phase-4-owned 的獨立 spec。
**折衷方案（本 ADR 推薦）**：母規格保留「這裡有一個 machine-readable specs/policies/methods/recipes/docs/tests 頂層分層」的**敘事級原則**（不含具體路徑字串），所有具體路徑（含 EC 那種模組級深路徑、MP 那種逐檔名列表）移到 Phase 2/3 建立、Phase 4 正式接手的獨立 `repo-layout` spec。

### 比較（Maintainability / Migration / 30-year survivability / Complexity）

| 選項 | Maintainability | Migration | 30-year survivability | Complexity |
|---|---|---|---|---|
| Status Quo | **低**——改一個目錄名 = 改憲法級文件三份之一 + 重跑 hash + 走完整 §IX 九欄位流程 | **低**——搬 repo 結構等於要動規格文件本身 | **低**——目錄慣例的變化速率遠快於 30 年，凍在憲法層必然導致未來要嘛違憲要嘛守著過期憲法 | 表面**低**，實際上把「治理很少變」與「資料夾常變」兩種變化速率混在同一份文件，隱藏了複雜度 |
| Option C（全移除） | **高**——repo-layout 變更是普通 spec 編輯，不觸發 §IX | **高**——本來就是設計目標 | **高** | 中——多一層 lookup，且若做過頭，連「為什麼要分 specs/policies/methods/recipes 這幾層」的架構理由也可能被一併移走，留下敘事空洞 |
| 折衷方案 | **高**（對會頻繁變動的 95% 深路徑）；頂層 6-7 個根目錄的變更頻率本身極低，留在母文件的成本可忽略 | **高**——痛點路徑（模組級/檔名級）全部可自由遷移 | **高** | **最低**（三者中）——不留架構理由空洞，只搬字串，取 Option C 的效益同時不付它的敘事真空風險 |

折衷方案在 Complexity 上嚴格優於 Option C，在其餘三維與 Option C 同分，全面優於 Status Quo。

**一個重要的內部一致性檢查**：折衷方案不是外加規則，而是 directive §X 本來就已經寫的原則（「Machine-readable 內容逐步移至 /specs/ /policies/ /methods/ /recipes/」）的自我套用——只是之前沒把「路徑字串本身」算進「machine-readable 內容」。這不是偏離 directive，是把 directive 已經表態的意圖做完整。

**Phase 4 之前的過渡處置**：directive §XII 本身已明講「不要因為原文件寫了某個 path 就盲目照抄，先驗證 bounded contexts」——即 directive 自己也不把現有路徑當作 Phase 4 的定論，只當草稿訊號。因此移出母規格後，不留空白，而是把抽出的路徑原樣寫進 `PROJECT_ROOT/.ai/research/phase-2/repo-layout-draft.yaml`，標記 `status: DRAFT_PENDING_PHASE_4`，供 Phase 4 的 bounded-context 分析引用/修正/推翻，不遺失任何既有資訊，也不假裝這是定案。

### 對 OQ-11 原框架的影響

原 OQ-11 問的是「哪些路徑樹 binding、哪些 advisory」（Option A/B）。採用折衷方案後，這個問題對「被移出的深路徑」而言**不再適用**——它們不再是母文件的一部分，binding/advisory 的判定改由 Phase-4-owned repo-layout spec 自己的版本治理規則決定。OQ-11 因此以「消解」而非「回答 A/B」的方式關閉——這點需要操作者知悉，不是含糊帶過。

## Method Used

依 Program Plan §6「Method semantics 一律取自 Method Atlas」的規定，本比較借用 Atlas §11.32 MCDA 的流程骨架：`Options → Criteria → Weights → Normalize → Score → Sensitivity → Stakeholder Views → Human Decision`。

**誠實揭露**：本 ADR 只做到「Options × Criteria → 方向性判定（高/低）」這一層，**沒有**做正式的權重誘導、常態化計分與敏感度分析——那需要操作者參與的權重設定會談。若操作者要更嚴謹的數字化版本，建議另跑 `/decide`（decision-intelligence 19-stage panel）產生完整 MCDA 計分矩陣。本文件的角色是把選項與方向性證據攤開，最後一步 `Human Decision` 原樣保留給操作者。

## Recommendation

1. **(a) 採用 Option A**（`.ai/proposals/` 機制）。**不建議**解除 repo no-branch 規則。
2. **(b) 採用折衷方案**：母規格保留「有一個 machine-readable 分層」的敘事原則，具體路徑全部移到 Phase-4-owned 的 `repo-layout` spec，過渡期先落地為 `phase-2/repo-layout-draft.yaml`（DRAFT_PENDING_PHASE_4）。**不建議**維持 Status Quo，也不建議 Codex 原版「全移除且不留任何架構敘事」。

## Consequences

**正面**：Phase 2 立刻有明確、可執行的母文件修改流程，不再被 branch 規則衝突卡住；三份母文件的篇幅減少，更貼近 directive §X 對三文件分工的原始意圖；OQ-6、OQ-11 兩題可標記 `RESOLVED_BY_HUMAN`，Phase 2 exit gate 少兩個阻塞項。

**負面／需要接受的成本**：`.ai/proposals/` 資料夾會隨 Phase 2 進度線性成長，需要一份索引（可比照 `open-questions.yaml` 的 SSOT 模式）——**本 ADR 未涵蓋此索引檔的設計**，若操作者批准 Option A，建議作為後續小任務補上；折衷方案讓「路徑到底在哪」多一層間接，對人類讀者是小成本，可接受；過渡期的 `repo-layout-draft.yaml` 是暫定，Phase 4 可能推翻其中任何一條——需要在該檔案標頭明確聲明，避免被後續 session 誤讀為定案。

## Migration / Rollback

**(a) 母文件流程**：無需遷移既有內容——`.ai/proposals/` 是全新機制，不影響任何既有檔案。Rollback：若操作者事後認為此機制不夠，恢復路徑是刪除尚未 APPLIED 的提案資料夾；已 APPLIED 的提案要撤銷，走一般 `git revert <applied_commit>`。

**(b) 路徑抽離**：具體執行落在 Phase 2 走上方 Option A 流程時，逐一針對各站點各開一個 proposal（`change_class: boundary_clarification` 或 `duplication_removal`），對照原文字換成「見 repo-layout spec」的引用句。Rollback：每個站點各自成一個 proposal + 一個 commit，`git revert` 單一 commit 即可還原單一站點，不影響其他已移除的站點。

## Evidence

- `D:\Work\.claude\settings.json` — `git checkout -b` / `git switch -c` / `git switch --create` / `git branch` 四條 deny，機械層驗證 branch 禁令為真（人工複核 `sed -n` 對照 settings.json 實際內容，確認逐字存在）。
- `D:\Work\CLAUDE.md` §Git 分支（強制）— 文件層重申。
- `.ai/research/phase-0/source-directive-2026-08-28.md`（§IX 全文、§X machine-readable 內容分工、§XII 不盲抄路徑、§XV Claude 不得批准自己的高風險修改）。
- `AI_LEGO_OS_Program_Plan_v1.md`（§2 路徑映射/OQ-3、§6 Phase 2 13 維比較框架 + 母文件修改協議段）。
- `.ai/research/phase-0/open-questions.yaml`（OQ-6、OQ-11 原文，含 Codex Option C）。
- `.ai/research/cross-review/CODEX_REVIEW.md`（PART B，path-as-architecture 風險）。
- `.ai/research/cross-review/CONVERGENCE_MATRIX.md`（PARTIAL_AGREEMENT 採納並擴充 OQ-11）。
- Grep 逐條驗證的路徑站點：Master Plan L611-616 / L766-773 / L845 / L1002-1008；Execution Contract L223 / L647 / L735 / L1008 / L2365 / L2745-2828 / L3995-4054（本次調查新確認，比 Codex 原引用更完整，尤其 EC 的實作路徑清單此前未被任何一方逐條列出）。
- Atlas §11.32 MCDA 流程定義：`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:1961-1969`。

**邊界確認**：本次任務全程僅執行 Read/Grep（唯讀），未對三母文件做任何修改，未寫入任何檔案。
