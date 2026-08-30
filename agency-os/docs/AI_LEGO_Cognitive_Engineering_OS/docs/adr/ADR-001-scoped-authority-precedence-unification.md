# ADR-001: 統一三母規格的 Scoped Authority 衝突裁決鏈與 Architecture Constitution 身分

Status: ACCEPTED（2026-08-29，操作者明示授權 Claude 行使架構師裁決權；Codex 對抗式覆審 NEEDS-REVISION 已修正）
Date: 2026-08-29
Deciders: Claude（裁決）；操作者（明示授權範圍：STOP-FOR-HUMAN-REVIEW gate 之 4 項待決事項，2026-08-29 對話）

**此 Status 的精確範圍（避免誤讀為母文件已修改）**：`ACCEPTED` 代表本 ADR 的**架構決策本身**（選 Option A、其修正版內容）已定案，不再是待討論的選項。這**不等於**三份母文件已被編輯——實際套用仍須依 ADR-006 定義的 `.ai/proposals/<NNN>-<slug>/PROPOSAL.md` 流程逐項產生提案，該流程的 `status: APPROVED` 依規定**只能由操作者本人**推進（directive §XV 絕對句，Claude 永遠不能自我核准母文件編輯本身），與本欄位的 ADR 決策狀態是兩個獨立欄位、兩條不同規則。

## Context

AI LEGO Cognitive Engineering OS 由三份獨立維護的母規格構成：Master Plan (MP)、Method Atlas、Execution Contract (EC)。三者互相衝突時的仲裁機制本身——理論上應該是全系統最不容妥協的一塊——已經漂移出兩個互相矛盾的版本，且其中一個 load-bearing 節點的身分在兩份文件間自相矛盾。Phase 0 對抗式 verifier 已逐條 CONFIRMED（`verified-findings.yaml` CROSS-T-9 / CROSS-R-12 / CROSS-R-13，各 2 票獨立驗證），`open-questions.yaml` OQ-9 已登錄但未裁決。本 ADR 不重新調查問題是否存在，只設計解法。

**問題 1 — 裁決鏈本身被定義兩次且已漂移（CROSS-T-9）**

MP §0.0.2（L60-84）:
```text
Applicable Law / Regulatory Hard Constraint
        ↓
Architecture Constitution / Security / Privacy Hard Policy   ← L67，6 層鏈第 2 層
        ↓
Approved Machine-readable Contract / Schema
        ↓
Accepted ADR
        ↓
┌ Architecture/Platform Scope → MP 優先 ┬ Cognitive Method/Tool Scope → Atlas 優先 ┐  ← L73-76
        ↓
Recipe / Runbook / Example
```

EC §2.1（L111-137）:
```text
Applicable Binding Law / Regulatory Hard Constraint
        ↓
Approved Security / Privacy / Safety Hard Policy   ← L116，8 層鏈第 2 層，無 Architecture Constitution
        ↓
Approved Machine-readable Contract / Schema
        ↓
Accepted ADR
        ↓
Scoped Normative Document
        ↓
Recipe / Runbook → Example → Ad-hoc Suggestion
```

兩鏈層數不同（6 vs 8）、第 2 層定義不同（含/不含 Architecture Constitution）。當「Architecture Constitution 條款」與「machine contract」衝突時，兩條鏈給出相反的贏家——這是仲裁機制自己內部矛盾，不是某個下游規則矛盾。

**問題 1b — 授權表本身也對不齊管轄範圍（CROSS-R-13）**

MP §0.0.1（L53-58）文件職責表只認 MP + Atlas（+ Machine Specs + ADR），MP 自佔列包含 `Governance`（L55 尾字）；EC 完全沒有列在這張表裡。但 EC §2（L90-110）自己的 Scoped Authority 表卻自佔兩列：「AI 執行生命週期」（L104）、「AI Authority / Tool Use / Change Control」（L105）。同一個 scope 衝突，查 MP 的表跟查 EC 的表得到不同的權威文件——而這正是兩份文件都宣稱必須升級為 `CONFLICT_REQUIRES_HUMAN_REVIEW` 的那種同層級衝突，卻嵌在衝突解決機制本身裡面，沒有任何機制能偵測到它。

**問題 2 — Architecture Constitution 身分自相矛盾（CROSS-R-12，即 OQ-9）**

EC §152 End State（L4147-4153）：
```text
Master Plan
= Architecture Constitution / Product Direction
```
明確宣稱 Master Plan 本身就是 Architecture Constitution。

但 MP 自己完全不這麼認為：
- MP §85 Phase 0（L3457-3467）把 `Architecture Constitution v1` 列為**尚待建立**的核心規格之一，與 `Capability Contract v1` 等並列。
- MP §90 建議下一步（L3781-3799）把 `Architecture-Constitution-v1.md` 列為 pre-MVP 22 份規格清單的**第 1 項**——一份獨立、目前不存在的檔案。
- MP §135（L5285-5295）明確指示「寫入 Architecture Constitution」一條 No Legal Hallucination Rule，語氣上把它當一份會被後續填內容的具體文件，不是「泛指 MP 全文」。
- 更嚴重的是，MP 自己的 §0.0.2 裁決鏈（L67）把 `Architecture Constitution` 排在「Architecture/Platform Scope → Master Plan authoritative」這個 scoped 分支**之上**（L73-76）。若採信 EC 的說法「MP = Architecture Constitution」，MP 的裁決鏈就變成「MP 排在 MP 自己所屬的 scoped 層之上」——自己贏過自己所在的那一層，邏輯上是自我循環，不是單純的「未決定」。若不採信 EC 的說法，則裁決鏈第 2 層點名一份不存在的文件，形同虛設層——沒有任何機制能真正引用它、驗證它的版本、或判斷它是否被遵守。

兩種讀法都是結構性壞掉，不是風格分歧。這是本 ADR 必須直接回答的第二個問題。

**現況時機**：`AI_LEGO_OS_Program_Plan_v1.md` §6 確認 Phase 3（machine-readable specs）`Status: NOT_STARTED`；repo 內搜尋確認**目前沒有任何程式碼消費這條裁決鏈**——這是修正成本最低的時間點，越晚修，Phase 3 把某一版鏈寫死進 schema 後，回頭改的成本越高。

## Decision Drivers

- **正確性優先於相容性**：裁決鏈是仲裁「所有其他衝突」的根，它本身有矛盾等於整個 Scoped Authority 機制不可信；不能用「先跑著看」處理。
- **30 年存活率**：EC 自己的使命宣言（L4177-4181）是「即使 AI、模型、雲端、團隊全部更換，仍能強迫下一代先理解再規劃」——這要求規則物理上只存在一份，不能依賴「大家記得哪份是準的」這種跨代際會流失的默契。
- **不變量而非補丁**（AGENTS.md R0 補丁判準）：這不是第一次出現「同一規則在多份母文件各自定義一份、然後漂移」——OQ-7（risk_tier 詞彙 MP 4 值 vs Atlas/EC 11 值）、OQ-8（epistemic label 4 套詞彙）、OQ-10（platform gate 三套集合不同）全部是同一個缺陷類別的不同實例。若本 ADR 只在「裁決鏈」這一個實例上打補丁（例如硬性指定「EC 版本贏」），並沒有回答「這一類問題的不變量是什麼」；正確的不變量是**跨母文件的規範性定義不得重複，只能有一處 SSOT，其餘文件只能 reference**。
- **零重工 / 時機窗口**：Phase 3 尚未開始、無下游程式碼消費者，是修正成本最低、範圍最小的時間點。
- **修改成本受限**：`AI_LEGO_OS_Program_Plan_v1.md` §6 規定任何母文件修改須走「母文件修改協議」（PROPOSED_CHANGE/RATIONALE/SOURCE_DOCUMENT/AFFECTED_SECTIONS/DEPENDENCIES/COMPATIBILITY/MIGRATION/ROLLBACK/EVIDENCE），且**禁止建立新 branch**（repo settings 硬擋，見 ADR-006）——任何選項的遷移計畫都要在這個限制下可行。

## Options Considered

### Option A：建立單一 Governance/Constitution SSOT 文件，三母文件皆 reference 之（推薦）

新建 `Architecture-Constitution-v1.md`——**直接沿用 MP §90 L3785 已經預留的檔名**，不另造新名詞。內容只放三塊，且只放一次：
1. 唯一一條 Scoped Authority 裁決鏈（合併 MP 6 層 + EC 8 層，取兩者聯集後去重，不再各自持有一份）
2. 唯一一張文件職責/授權表（合併 MP §0.0.1 + EC §2，把 EC 自佔的「AI 執行生命週期」「AI Authority/Tool Use/Change Control」正式收編進表裡，消解 CROSS-R-13）
3. 已經散落在 MP、明確標註「寫入 Architecture Constitution」的跨文件硬政策（目前只有 1 條：MP §135 No Legal Hallucination Rule，L5287；抽取工作量極小）

MP §0.0.2、§90 item 1、EC §2/§2.1 全部改成 3 行指標：「見 `Architecture-Constitution-v1.md`，禁止在本文件重複定義」。同時回答問題 2：Architecture Constitution **既不是** Master Plan 本身（消解自我循環），**也不是**永遠不存在的待辦項（消解虛設層），而是現在就存在、內容極小、獨立於 MP/EC 之外的第四份文件。

- **Correctness**：高。從根源移除「重複定義」這個缺陷類別本身，而非指定一個贏家後留著另一份重複拷貝。CROSS-T-9 / CROSS-R-12 / CROSS-R-13 三條 finding 同時消解，不是各自打補丁。
- **Maintainability**：高。未來只改一處；同時建立可複用樣板——OQ-7/OQ-8/OQ-10 那三個同類重複定義問題，Phase 2 後續可以直接照這個模式抽成獨立 SSOT 檔案，不必每次重新設計解法。
- **Extensibility**：高。新增規範性內容（例如未來的 Safety Policy）只需在這份文件加一個 scope 分支，不必同步改三份敘事文件。
- **Operability**：中高。MP §0.0.3 已有先例——Execution Manifest 必須記錄 Atlas 版本+content_hash+loaded 旗標；同一模式可直接複製給 Architecture Constitution（版本+hash+loaded），讓「這次執行載入的是哪一版仲裁規則」變成可機器驗證，而不是「大家假設都讀到同一份」。
- **Cost**：低。新文件本身極小（裁決鏈 1 段 + 表 1 張 + 1 條政策 ≈ 1 頁）；三處編輯（MP 2 處、EC 2 處）換成指標行，工作量小於 Option B/C 需要的「保留摘要 + 手動核對摘要與正本一致」的持續維護成本。
- **Complexity**：新增 1 個檔案，但**淨複雜度下降**——移除了 2 份互相矛盾的重複定義。
- **Migration**：具體且範圍小——3 個編輯點（新檔 1 份 + MP 2 段落 + EC 2 段落），全部走 Program Plan §6 母文件修改協議；Phase 3 尚未開始，無程式碼遷移。
- **Reversibility**：高。純文件變更，git revert 立即還原；repo 內確認目前無任何程式碼消費此裁決鏈（見 Context 末段），回滾零風險。
- **Vendor Lock-in**：無，純 Markdown。
- **30-year survivability**：高。單一 SSOT 是唯一不依賴「未來的人記得哪份是準的」這種默契就能自然抗漂移的結構；EC 自己的 30 年宣言（L4181）事實上要求這個答案。

### Option B：EC §2.1 版本定為 authoritative，MP §0.0.2 降級為摘要並加註「見 EC §2.1」

- **Correctness**：中低。解決「兩條鏈哪個贏」，但**不解決問題 2**——EC 自己就是宣稱「MP = Architecture Constitution」的來源（L4152-4153），選 EC 為準並不會讓這個自我循環消失，仍需額外裁決。且更根本的問題：EC 自己的 Scoped Authority 表（L98-110）宣稱的管轄範圍是「AI 執行生命週期」「AI Authority/Tool Use/Change Control」，並不包含「Architecture / Product / Governance」（那是 MP 自己 L55 宣稱的範圍）。把「Architecture Constitution / Security / Privacy Hard Policy」這種 Architecture-scope 的硬政策裁決權放進 EC 裡，等於讓 EC 去仲裁一個**它自己的職責表都沒宣稱擁有**的範圍——這本身違反 EC 自己訂的 Scoped Authority 原則，是新的自相矛盾，不是乾淨的修法。
- **Maintainability**：中。MP 若保留「摘要」而非純指標，未來編輯 MP 段落時仍可能無意中讓摘要用詞跟 EC 正本不同步（歷史上這正是本次漂移的成因——兩份文件本來可能是同一份的兩次獨立編輯）。若把 MP 摘要也做成純指標（不保留任何內容），則 Option B 實質上退化成 Option A 的簡化版，只是把 SSOT 放在 EC 裡而不是新檔案裡——但如上一點，EC 不是這塊內容邏輯上該住的地方。
- **Migration**：小（2 處編輯：MP 段落換指標）。
- **30-year survivability**：中。少了「新文件」的認知負擔，但把 Architecture-scope 治理長期綁在一份自稱「AI Operating Discipline」的文件裡，日後若要把 AI 執行紀律規則搬到別的技術棧，會被迫連帶處理跟它範圍不符的 Architecture Constitution 內容。

### Option C：MP §0.0.2 版本定為 authoritative，EC §2/§2.1 降級為摘要並加註「見 MP §0.0.2」

- **Correctness**：低——比 Option B 更差。這個方向表面上跟 EC 自己的宣稱一致（EC 說 MP=Architecture Constitution，選 MP 為準看似順理成章），但正因如此，它把 CROSS-R-12 指出的自我循環直接**焊進了「贏家」文件裡**：若 MP 的裁決鏈被定為唯一正本，而 Architecture Constitution 又等於 MP 本身，則 MP 的裁決鏈第 2 層就是在說「MP 排在 MP 所屬的 scoped 層之上」——這個矛盾原本只存在於「兩份文件互相參照」的縫隙裡，選 MP 為單一正本後，矛盾就內化成正本自身的邏輯錯誤，比修正前更難處理。
- **Maintainability**：低，原因同上——正本內部有無法自洽的自我指涉，任何人接手都會卡在同一個悖論。
- **Migration**：小（2 處編輯：EC 段落換指標），但遺留的邏輯債務大於節省的編輯成本。
- **30-year survivability**：低。把一個結構性悖論固化進「唯一正本」，是本 ADR 想消除的問題的加重版，不是解法。

### Status Quo：僅加交叉引用連結，不合併內容

MP §0.0.2 加一行「另見 EC §2.1」，EC §2.1 加一行「另見 MP §0.0.2」，兩條鏈本身的內容、層數、Architecture Constitution 身分矛盾維持原樣。

- **Correctness**：最低。矛盾原封不動；更諷刺的是，兩份文件都明文規定「同層級跨文件矛盾必須升級為 `CONFLICT_REQUIRES_HUMAN_REVIEW`」（MP L83、EC L134），但沒有任何機制會偵測到「裁決鏈自己」就是這種矛盾——加連結不會讓系統或後續 agent 自動觸發這條規則，只讓人類讀者「有機會」自己發現。
- **Maintainability**：最低。兩份拷貝繼續獨立存在，未來任何一份被單獨編輯（例如加一個新的風險層級）都會再次漂移，且下次漂移不保證會被 Phase 0 等級的對抗式 verifier 再抓到。
- **Migration**：幾乎零成本（這正是它唯一的優點）。
- **Reversibility**：不適用（沒有結構性改動可回滾）。
- **30-year survivability**：最低。等於把「發現並記得這個矛盾」的責任外包給每一個未來、沒有跨 session 記憶的 agent 重新踩雷一次——這正是 AGENTS.md 明文列為紅線的那類風險（補丁互相保護、依賴記憶而非結構）。

## Method Used

比較採 Method Atlas 正式定義的 **MCDA（Multi-Criteria Decision Analysis）** 流程（Atlas §11.32，L1951-1978）：`Options → Criteria → Weights → Normalize → Score → Sensitivity → Stakeholder Views → Human Decision`，並參考 §12.33 Weighted Decision Matrix（L2987-3004：`Options × Criteria × Weights → Scores → Sensitivity → Decision`，「限制：高風險決策要補 hard constraints、scenario 與 stakeholder weights」）。

比較維度直接取自 `AI_LEGO_OS_Program_Plan_v1.md` §6（L118）已定義的 13 項標準清單，本 ADR 涵蓋其中 Correctness / Maintainability / Extensibility / Operability / Cost / Complexity / Migration / Reversibility / Vendor Lock-in / 30-year survivability 十項（未逐一硬套 Security/Privacy/Performance，因四個選項皆為純文件層變更，此三項在四選項間無實質差異，未特別展開）。

**誠實聲明（Atlas Method-specific Gate，§22.3 L4198-4209）**：Atlas 明文規定 MCDA「禁止直接輸出 Automatic Authority」，必須補「Human Judgment + Sensitivity」（L4208）。本 ADR 因此維持 `Status: PROPOSED`，最終裁決權在操作者，本文件的排序建議不構成自動生效的決定。

**額外誠實聲明**：Atlas §28 快速選工具表（L4509-4533）把「高風險決策」列為獨立情境，首選方法是 **Evidence Matrix**，MCDA 僅作為「Red Team + MCDA + Reversal」組合中的一員（L4532），且明文禁止 `AI Auto-Decide`。本 ADR 屬於治理層級的高風險決策，嚴格而言 Atlas 建議的完整流程應包含 Evidence Matrix（claim×evidence 對齊）與 Red Team（對抗式反駁）兩個額外環節，本次因任務範圍明確要求 MCDA 風格比較而未展開；**建議操作者在核准前，至少對 Option A 的建議做一輪 Red Team/devil's-advocate 檢視（例如請 Codex oracle 覆審本 ADR）**，並在採納後補上 Reversal Criteria（Atlas §11.33，L1980-2003）——見下方 Recommendation 末段。

## Recommendation

**建議採用 Option A**：建立 `Architecture-Constitution-v1.md` 作為裁決鏈與文件職責表的單一 SSOT，直接使用 MP §90 已預留的檔名，同時回答問題 2——Architecture Constitution 是一份現在就存在、內容精簡（≈1 頁）、獨立於 MP 與 EC 之外的第四份文件，不等於 Master Plan，也不是永遠不存在的待辦項。

理由排序：
1. 這是唯一同時解決 CROSS-T-9（裁決鏈重複）、CROSS-R-12（身分矛盾/OQ-9）、CROSS-R-13（授權表範圍不對齊）三條 finding 的選項，其餘選項最多解一條、甚至（Option C）讓問題變嚴重。
2. 唯一不需要額外裁決就能自洽回答「Architecture Constitution 是誰」的選項——Option B/C 都繼承或製造了自我循環。
3. 修正時機最佳：Phase 3 尚未開始，repo 內確認零程式碼依賴，遷移成本與回滾成本目前都是全生命週期最低點。
4. 直接呼應 EC 自己的 30 年生存宣言（L4181）與 AGENTS.md 的補丁判準——本方案關掉的是「跨母文件重複定義規範性內容」這一整類問題的模板，OQ-7/OQ-8/OQ-10 可沿用同一手法收斂，而不是這次修完下次再犯。

Reversal Criteria（依 Atlas §11.33 建議，隨 ADR 一併記錄）：
```yaml
reversal:
  indicator: "Architecture-Constitution-v1.md 被證明無法承載 Architecture/Platform-scope 硬政策內容（例如發現它與 MP 現有 Governance 職責重疊到無法切分）"
  condition: "Phase 3 machine-readable spec 設計階段，任兩位獨立審查者（人類或 Codex oracle）認定切分不可行"
  action: "重新review，改採 Option B 並補一份獨立、極簡的 OQ-9-only 裁決記錄解決身分矛盾"
  owner: "操作者"
```

## Codex Oracle 對抗式覆審（2026-08-29，已完成，見下方修正）

依 Method Used 末段誠實聲明的建議，操作者授權後已對本 ADR 跑一輪 `codex-oracle.ps1 -Mode inspect`（獨立於 Claude 分析，未餵入本 ADR 結論），完整 artifact：`agency-os/reports/oracle/2026-08-29-inspect-d80a93e4.md`。

**判定：NEEDS-REVISION（CONFIRMED，已於本次修訂納入，見下方 Option A 修正版與 Migration 新增步驟）**

> Option A 把 `Architecture-Constitution-v1.md` 設成唯一 SSOT，並要把 MP/EC 改成指標行而不再重複定義內容；但 EC 的必讀文件解析與 document registry 仍只要求三份母文件與 accepted ADR（`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:173`「找到 Master Plan」、`:174`「找到 Method Atlas」、`:229-252` Document Registry 範例僅 3 個 entry），沒有把這個新 SSOT 納入必載入/必追蹤集合。情境：母文件已降成指標行，但 `Architecture-Constitution-v1.md` 缺失或過期；照 EC §3.1 實作的 agent 仍可通過「7 步 Required Document Resolution」檢查（因為該清單本身沒有第 8 步指名這份新檔），卻沒載入唯一有效的裁決鏈，形成靜默繞過——新 SSOT 建好了，但強制載入它的機制沒有同步更新，等於治本方案自己留了一個逃生門。

**根因判斷**：這不是 Option A 本身選錯，是 Option A 原始描述遺漏了一個必要的配套修改——新建 SSOT 檔案與「強制系統實際載入它」是兩件事，前者做了不代表後者自動發生。**不變量修正**（依 AGENTS.md 補丁判準）：任何新增的必讀規範性文件，必須同時登記進 EC §3.1 Required Document Resolution 清單與 §4 Document Registry，否則「建立單一 SSOT」這個模式本身不完整——這一條同樣適用於未來 OQ-7/OQ-8/OQ-10 若採用同一手法時的配套要求，已補進下方 Migration。

**修正後的 Option A（新增第 4 點）**：
4. **EC §3.1 Required Document Resolution 新增第 8 步**：「找到 `Architecture-Constitution-v1.md`」，缺失時同樣觸發 `DOCUMENT_RESOLUTION_BLOCKED`（沿用既有機制，不新增狀態碼）；**EC §4 Document Registry 範例新增第 4 個 entry**：`id: ai-lego.architecture-constitution, filename: Architecture-Constitution-v1.md, major: 1, required: true`——與 MP/EC 同等級「一律必讀」，不掛在 `required_for` 條件清單下（因為它是裁決鏈本身，任何 scope 的衝突都可能需要它，不能限定情境）。

## Consequences

**採納 Option A（含 Codex 覆審後修正版）解決的既有 findings**：CROSS-T-9（裁決鏈重複定義）、CROSS-R-12 / OQ-9（Architecture Constitution 身分矛盾）、CROSS-R-13（Scoped Authority 授權表範圍不對齊）三條全數 CLOSED，`open-questions.yaml` OQ-9 可標記 `RESOLVED`（附本 ADR 編號）。

**產生的新工作**：
1. 依 `AI_LEGO_OS_Program_Plan_v1.md` §6 母文件修改協議，對 MP（2 處：§0.0.2、§90 item 1）與 EC（3 處：§2、§2.1、**新增 §3.1+§4**）的每一處修改各產一份 `PROPOSED_CHANGE / RATIONALE / SOURCE_DOCUMENT / AFFECTED_SECTIONS / DEPENDENCIES / COMPATIBILITY / MIGRATION / ROLLBACK / EVIDENCE` 套件——本 ADR 不代替該協議，只是其上游決策依據。
2. 新建 `Architecture-Constitution-v1.md`，內容三塊已在 Option A 描述中列出。
3. **（Codex 覆審後新增，非原始建議）** EC §3.1 第 8 步 + §4 Document Registry 第 4 個 entry，確保新 SSOT 被納入強制載入集合，不是只被新建卻沒人被要求讀。
4. 建議（非本 ADR 強制）：仿照 MP §0.0.3 Execution Manifest 記錄 Atlas 版本的模式，未來 Execution Manifest schema 也應記錄 Architecture Constitution 的 `file / declared_version / content_hash / loaded`。
5. 建議把 OQ-7（risk_tier 詞彙）、OQ-8（epistemic label 詞彙）、OQ-10（platform gate 集合）列為「同類問題」，Phase 2 後續 ADR 可直接複用本 ADR 的 SSOT-抽取手法**，且必須連帶複製本次修正的第 3 點（登記進 §3.1/§4），不能只抽取 SSOT 卻漏掉強制載入配套**。
6. Codex 對抗式覆審已完成（見上方新增段落），非本 ADR 待辦——已根據其 CONFIRMED 發現修正 Option A 內容,不再是懸而未決的建議。

## Migration / Rollback

**若採納 Option A（含 Codex 覆審後修正版）**：
1. ~~新建 `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/Architecture-Constitution-v1.md`（路徑待操作者確認，建議與三母文件同層）~~ ——**已完成（2026-08-30）**：檔案已建於建議路徑，內容三塊（統一裁決鏈、統一文件職責表、No Legal Hallucination Rule）逐字轉錄自本 ADR 已批准的 Option A 描述，非新設計。這是新增檔案，非編輯既有母文件，不受 ADR-006 proposal 流程約束。
2. MP §0.0.2（L60-84）與 §90 item 1（L3785 一行）改為指標行；EC §2 / §2.1（L90-137）改為指標行——**這是編輯既有母文件，仍待 `.ai/proposals/` 流程操作者核准**，見 `.ai/proposals/001-architecture-constitution-mp-pointer/` 等對應提案（2026-08-30 建立，`status: DRAFT`）。
3. **（Codex 覆審後新增）** EC §3.1（L169-185）Required Document Resolution 清單新增第 8 步；EC §4（L218-253）Document Registry 範例新增 `ai-lego.architecture-constitution` entry，`required: true`——**同上，待操作者核准的獨立提案**。
4. 因 repo 禁建 branch（settings deny），全部編輯直接在 `main` 完成，比照 CLAUDE.md「Git 分支」規則。
5. `open-questions.yaml` OQ-9 標記 `RESOLVED`，加註本 ADR 檔名。

**Rollback**：純文件變更，`git revert` 對應 commit 即可完全還原；因 Phase 3 尚未開始、無程式碼消費此內容，回滾零風險、零下游影響。

## Evidence

- MP `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`：L53-58（§0.0.1 文件職責表，L55 含 Governance）、L60-84（§0.0.2 六層裁決鏈，L67 Architecture Constitution 層、L73-76 scoped 分支圖）、L85-94（§0.0.3 Execution Manifest 記錄 Atlas 版本先例）、L3457-3467（§85 Phase 0，Architecture Constitution v1 列為待建）、L3781-3799（§90 建議下一步，item 1 = `Architecture-Constitution-v1.md`）、L5285-5295（§135 No Legal Hallucination Rule，「寫入 Architecture Constitution」）
- EC `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md`：L90-110（§2 Scoped Authority 表，L104-105 EC 自佔列）、L111-137（§2.1 八層裁決鏈，L116 無 Architecture Constitution、L131-137 CONFLICT_REQUIRES_HUMAN_REVIEW）、L4147-4185（§152 End State，L4152-4153「Master Plan = Architecture Constitution / Product Direction」、L4177-4181 三十年使命宣言）
- Atlas `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md`：L1951-1978（§11.32 MCDA 正式定義）、L1980-2003（§11.33 Reversal Criteria）、L2987-3004（§12.33 Weighted Decision Matrix）、L4198-4209（§22.3 Method-specific Gate，L4208 MCDA 禁止 Automatic Authority）、L4509-4533（§28 快速選工具表，L4532 高風險決策行）
- `.ai/research/phase-0/verified-findings.yaml`：CROSS-T-9（L291-309）、CROSS-R-12（L354-375）、CROSS-R-13（L376+）
- `.ai/research/phase-0/open-questions.yaml`：OQ-9（L59-63）
- `AI_LEGO_OS_Program_Plan_v1.md`：L110（Phase 1 exit gate）、L114-124（Phase 2 比較維度定義、母文件修改協議、STOP FOR HUMAN REVIEW gate）
- Repo-wide grep 確認：Phase 3 `Status: NOT_STARTED`，無任何 `.ts/.js/.py/.yaml/.json` 程式碼消費此裁決鏈
- EC `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md`：L169-185（§3.1 Required Document Resolution 七步清單）、L218-253（§4 Document Registry 三筆範例，Codex 指出缺第 4 筆）
- `agency-os/reports/oracle/2026-08-29-inspect-d80a93e4.md`：Codex 對抗式覆審 artifact（NEEDS-REVISION，已於本次修訂納入）
