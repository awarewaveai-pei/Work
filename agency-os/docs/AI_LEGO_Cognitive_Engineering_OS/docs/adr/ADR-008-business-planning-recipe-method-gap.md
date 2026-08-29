# ADR-008: Business Planning Recipe 引用不存在的 Financial Assumptions 方法（P1-CONFLICT-4）

Status: ACCEPTED（2026-08-29，操作者明示授權 Claude 行使架構師裁決權，見 ADR-001 同款範圍聲明：ADR 決策定案 ≠ 母文件已編輯，套用仍須走 ADR-006 `.ai/proposals/` 流程，該流程 APPROVED 僅操作者可推進）
Date: 2026-08-29
Related: P1-CONFLICT-4（`.ai/research/phase-1/CONFLICT_REGISTER.yaml:51-64`）、MRSP-2（`docs/architecture/MACHINE_READABLE_SPEC_PLAN.md:277`）、ADR-005（Method ID Grammar 先例）、ADR-006（`.ai/proposals/` 修改流程，本 ADR 的 Migration 段依賴它）

## Context

Phase 1 對抗式驗證（`CONFLICT_REGISTER.yaml` P1-CONFLICT-4，severity: medium）登記了一條文件自我矛盾，經本次任務逐行複核屬實：

- **Statement A**（Master Plan §43 Business Planning Mode 旗艦 Recipe，`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:2137-2171`，逐字）：完整 Recipe 依序列出 `Source → Problem Extraction → Customer Insight → Market Analysis → Competitor Analysis → SWOT → PESTEL → Porter → STP → Business Model → Strategy → Financial Assumptions → Scenario → Risk → KPI → Execution Plan → Proposal`（`Financial Assumptions` 節點在 MP:2160）。
- **Statement B**（同文件 §Method Resolution Rule，`MP:43-49`，逐字）：「若 Atlas 無法讀取、版本未知、內容不完整，且任務需要 Cognitive Method Selection，狀態必須為：`PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED`。不得自行補齊、猜測或以模型記憶取代 Atlas。」

**不相容原因（已用 Grep 獨立核對，非沿用任務摘要）**：Method Atlas 全文 `grep -i finance` 僅命中一次——`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:3901`，出現在 `/domain-packs/` 目錄樹宣告（Atlas:3871-3903）裡的 `/finance/` 一行，沒有任何方法定義、Method Contract 或敘述性內容跟隨其後。`phase-0/domain-inventory.yaml:133-135` 獨立記錄同一事實：`finance` domain pack「僅目錄宣告，無方法內容」。對照之下，`domain-inventory.yaml:121-123` 的 `business` domain pack**沒有**同樣的「僅目錄宣告」註記——本次任務額外核對 Recipe 其餘節點，確認 SWOT/PESTEL/Porter/STP/Business Model/Scenario/KPI 全部在 Atlas 有真實內容，並非全部節點都是空殼：

| 節點 | Atlas 位置 | 狀態 |
|---|---|---|
| PESTEL / SWOT | Atlas §25 Phase 1 核心方法清單（`Atlas:4332-4333`） | 已列為優先實作方法 |
| Porter Five Forces | `Atlas:2677`（§12.11） | 有完整說明段落 |
| STP | `Atlas:2723-2729`（§12.14） | 有完整說明段落 |
| Business Model Canvas | `Atlas:2733`（§12.15） | 有完整說明段落 |
| Scenario Planning | `Atlas:1813-1820`（§11.27） | 有完整說明段落 |
| KPI / OKR | `Atlas:2611-2614`（§12.5） | 有完整說明段落 |
| **Financial Assumptions** | 僅 `Atlas:3901` 目錄宣告 | **零內容** |

即：這不是「整條 Recipe 都是空殼」，而是 17 個節點中唯一一個、精確對應到一個「僅目錄宣告」domain pack 的節點——這正是 P1-CONFLICT-4 標題所稱「引用的方法在 Atlas 對應 domain pack 中不存在」的字面意義。依 Statement B 的規則，任何人（或 AI）今天真的驅動這條 Recipe 走到 `Financial Assumptions` 節點，Method Selection Engine 理論上必須立即回傳 `PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED`，但 MP §43 敘述這條 Recipe 時完全沒有標注這一點，讀者（人類或 AI）唯一能發現此缺口的方式是自己去 Grep Atlas 全文——這正是本次任務做的事，也是 Phase 1 lens agent 當初做的事。

**下游文件已引用此衝突，尚無 ADR 裁決前的暫時處置**：

- `MACHINE_READABLE_SPEC_PLAN.md:277`（MRSP-2）已將此列為未決 Open Question，並**自行建議**（非 ADR，僅暫時處置）：「在 Round 2 ADR 前，MP §43 的 Recipe 範例應加註『僅示意，Financial Assumptions 方法尚待 Atlas finance domain pack 補齊』，避免誤導」——本 ADR 的 Recommendation 與此建議方向一致，但需要正式裁決其確切文字與治理歸屬（`change_class`、是否觸發 registry 記錄）。
- `MVP_VERTICAL_SLICE_PLAN.md:15` 訂正了任務摘要對本衝突的證據 ID 引用錯誤（原誤植 `P1-GAP-PROD-9`，正確應為 `P1-CONFLICT-4`），並獨立重跑同一個 Grep 驗證「finance 僅命中一次、純目錄路徑、零方法內容」——與本 ADR Context 段的核對結果一致。
- `MVP_VERTICAL_SLICE_PLAN.md:27-28`（Recipe Selection Matrix）因為這個確切缺口，把 Business Planning Mode 在「缺口阻塞程度」維度評為 **High**（「依文件自己的紅線（MP L45）理論上現在就該觸發 BLOCKED」），並指出「要讓 Recipe 真正跑完，必須先在 Atlas 補齊 finance domain pack 內容——這是 Atlas 自己 dev-priority 排序（§25）中明確排在 Phase 4 的工作，Phase 5 切片若要用 Business 等於要求 Phase 4 內容提前於 Phase 5 完成」。
- `MVP_VERTICAL_SLICE_PLAN.md:36` 最終**選定 Research Mode**（非 Business Planning Mode）作為 Phase 5 MVP 垂直切片——即本衝突**不阻塞目前的 MVP 路徑**，純粹是「一旦有人嘗試使用 Business Planning Mode 就會立刻現形」的已登記文件缺陷。
- Atlas 自己的 `# 25. 開發優先順序`（`Atlas:4292-4401`）把 `Business`（連同 Architecture/DevOps/Security/DB/PM/Research/Policy）列在其內部 **Phase 4 — Engineering Domain Packs**（`Atlas:4375-4386`，`Business` 在 `Atlas:4384`），排在 Phase 0（Schema/Contract 先行）、Phase 1（核心認知方法）、Phase 2（Evidence/Challenge）、Phase 3（Compute/Simulation/Decision）**之後**——即 Atlas 自己已經公開承諾「finance/business domain pack 的工程順位在後面」，不是本 ADR 新發明的排序。
- `MACHINE_READABLE_SPEC_PLAN.md:242-252`（§4）已明確排除「一次性補齊全部 289 個 Atlas 方法的完整 contract」這個方案，理由是：(a) Phase 5 MVP 切片當時尚未選定，全量補齊會產生大量永遠用不到的 contract；(b) 工作量遠超 Phase 3 其餘交付物總和，違反最小爆炸半徑。現在 Phase 5 已選定 Research Mode（非 Business），這個排除理由對「現在就設計 Financial Assumptions 方法」**更加成立，而非減弱**——Business Planning Mode 連候選都不是。

**範圍界定（避免誤讀）**：MP §44 Business Strategy Mode（`MP:2175-2196`）也用自由列表方式列出「財務」為必須考慮因子之一，但那是一份無序清單，不是 `→` 串接、指名個別方法節點的 Recipe pipeline，不會觸發 Statement B 那種「指名方法卻無法從 Atlas 解析」的字面違規——本 ADR 範圍僅限 §43 的 `Financial Assumptions` 節點,不涉及 §44。

## Decision Drivers

1. **文件誠實性優先於表面完整**：MP §43 目前把一條理論上會立即 BLOCKED 的 Recipe 敘述得像可執行，這正是 MRSP-2 點名「損害對 MP §43 旗艦範例的信任」的问题——修法必須讓文件對自己的現狀誠實，而不是掩蓋或延後暴露。
2. **不做超前工程（專案已明文的原則）**：`MACHINE_READABLE_SPEC_PLAN.md:244` 已排除「不知道哪條切片會被驗證就搶著補方法內容」；Business Planning Mode 現在連 MVP 候選都不是（`MVP_VERTICAL_SLICE_PLAN.md:36` 選了 Research Mode）。同一原則套用到「現在就設計一個完整 Financial Assumptions 方法」，結論更明確。
3. **與 Atlas 自身已公開的開發順序一致**：Atlas §25（`Atlas:4375-4386`）已經把 Business domain pack 排在其內部 Phase 4，且排在 Phase 0-3 的 schema/核心方法/證據/計算基礎之後——現在單獨搶建 Financial Assumptions，等於跳過 Atlas 自己還沒走完的 Phase 0-3 基礎（`Atlas:4294-4307` Primitive schema、Method Contract schema 等尚未定案），生產出的內容很可能與未來正式的 schema 不相容。
4. **文件職責分離不可違反**：`MP:51-58`（§0.0.1）明文「Master Plan 不負責完整 Method Catalog 與 Method semantics」——若真要現在補方法內容，也不該寫進 Master Plan 本體，這進一步削弱「現在就地補一個 stub」選項的正當性。
5. **最小 diff / 可逆**：修法必須是 ADR-006 定義的 `.ai/proposals/` 流程下一個小提案就能完成的範圍，不應牽動 Recipe 本身的節點順序或名稱——後者會製造「未來 Atlas 真的把 finance domain pack 做出來後，還要記得把節點加回 Recipe」的額外對齊工作。
6. **保留設計意圖**：`Financial Assumptions` 是一個未來確實會存在（已排入 Atlas §25 Phase 4）的合理階段，不是文件寫錯——直接刪除會讓 Recipe 失去「這裡本來規劃要有財務假設」的敘事完整性，是比誠實加註更大幅度、且不可逆代價更高的編輯。

## Method Used

**先做的檢查（依任務指示，不強套方法）**：Grep Method Atlas 全文尋找是否有正式方法家族專門處理「敘事文件對自己引用的子系統做出一個現況無法兌現的承諾」這類**文件自洽性 / feasibility-of-claim**問題：

- `F14 — 可行性與經濟性`（`Atlas:715-727`：TELOS、Cost-Benefit、TCO、Unit Economics、NPV、IRR、Real Options）與 `12.24 TELOS 可行性分析`（`Atlas:2849-2863`）：兩者評估的是「一個專案/投資值不值得做」（Technical/Economic/Legal/Operational/Schedule），對象是**未來要不要啟動的計畫**，不是「一份已存在的文件是否誠實描述另一子系統的現況能力」。不適用。
- 全文 Grep `documentation debt` / `self-consisten` / `spec.*implementation gap` / `wishful` / `aspirational` / `narrat.*contradict` 等詞（含中文對應詞）：**零命中**。Atlas 沒有一個方法家族是為「文件自證失敗」這類軟體工程release-readiness／feature-flagging 性質的問題設計的——這類問題更接近工程慣例（用註記／狀態碼標示「尚未就緒的能力」），而非 Atlas 目錄裡的認知規劃方法。

**誠實聲明**：本案不強套 Atlas §11.32 MCDA 或 §12.33 加權決策矩陣做正式加權計分。理由與 ADR-006 sub-decision (a) 的先例一致——MCDA 適合的是「多個真正互相競爭、需要操作者參與權重誘導」的架構級選項；本案三個選項的方向性差異已經足夠清楚（見下方比較表），對一個 severity: medium 的文件誠實性問題強行套用完整 MCDA 儀式，反而是不誠實的包裝，不是嚴謹。改採單純的「Options × Decision Drivers」方向性比較，並依任務要求在 Recommendation 段直接給出唯一建議，不留多選。

## Options Considered

| 面向 | (a) 為 §43 加註現況警語（推薦） | (b) 現在就設計 Financial Assumptions 方法 stub | (c) 從 Recipe 移除該節點 |
|---|---|---|---|
| **Correctness**（是否真正解掉自我矛盾） | 佳——文件對自己現狀誠實，`PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED` 何時會觸發變得可預期，不再是「文件自證失敗卻沒說」 | 佳（表面）——Recipe 變成端到端可執行，但為了消除一個矛盾而生產一份不確定會被使用到的 contract | 中——矛盾消失，但代價是刪掉一個本來就規劃要有的階段，讀者從此看不到這裡曾經有設計意圖 |
| **與「不做超前工程」原則一致性** | 高——零新增方法內容，純文件誠實化 | **低**——直接與 `MACHINE_READABLE_SPEC_PLAN.md:244` 已排除的情境同構（不知道會不會被驗證用到就搶著補內容），且 Business Mode 連 MVP 候選都不是 | 高——同樣零新增內容 |
| **與 Atlas §25 自身開發順序一致性** | 高——不搶跑；註記本身就是「等 Atlas 完工後解除」的條件式陳述 | **低**——跳過 Atlas 自訂的 Phase 0-3 基礎（Primitive/Method Contract schema 尚未定案）直接生產 Phase 4 內容 | 中性（不涉及） |
| **文件職責分離**（`MP:51-58`） | 高——不在 MP 裡新增任何 Method semantics，僅指出現況 | **低**——若把方法內容寫進 MP 本體會直接違反 §0.0.1；若寫進 Atlas 則不算違反此驅動因素但仍違反前兩項 | 高——不涉及 |
| **Migration 成本（diff 大小）** | 極低——單一 `.ai/proposals/` 提案，`change_class: missing_contract`，只在既有 code fence 後加一段 callout | 高——需設計完整 Method Contract（Atlas §9 schema：id/family/assumptions/evidence/gaps/stop conditions 等），且未來仍要與正式 finance domain pack 對齊，可能重工 | 中——需改寫已命名的旗艦 Recipe 本體，刪除節點並調整前後箭頭，字元異動範圍比 (a) 大 |
| **Reversibility** | 高——Atlas finance pack 未來做出來後，刪掉這段 callout 或改狀態即可，單一 commit `git revert` 可逆 | 中——stub 一旦被 `contract-backlog.yaml` 或其他 schema 引用，未來正式 finance domain pack 設計出來時可能需要重構掉這個提前拍板的版本 | 中——finance pack 做出來後要把節點名稱加回 Recipe，等於逆向工程 (a) 現在就能做到的事，多一輪編輯+ADR 流程 |
| **30-year 敘事完整性** | 高——階段名稱與順序完整保留，只多了誠實的現況標註 | 高 | **低**——階段消失，日後要復原時沒有人能從文件本身知道原本的順序位置（`Business Model → Strategy → Financial Assumptions → Scenario`），需要回挖 git history |

**Status Quo（不列入評分，理由同 ADR-002/005 慣例）**：文件持續以「可執行」的語氣敘述一條理論上會立即 BLOCKED 的 Recipe，任何人類或 AI 依 MP §43 字面操作 Business Planning Mode 都會在 `Financial Assumptions` 節點撞上未被文件自己預告的失敗，且無法從 §43 本身得知原因（要另外去 Grep Atlas 才能發現）——這正是 MRSP-2 已經點名的信任損害，且沒有任何維度優於其他三個選項。

## Recommendation

**採用 Option (a)：在 Master Plan §43 的 Recipe 區塊加註現況警語，明確標示 `Financial Assumptions` 節點目前會觸發 `PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED`，直到 Atlas finance domain pack（其自身 §25 Phase 4 範圍）補齊為止。不採用 (b)（現在設計 stub）與 (c)（移除節點）。**

**具體加註內容與位置**（供未來 `.ai/proposals/` 提案採用，本 ADR 本身不修改母文件）：插入點在 Recipe 程式碼區塊結束後、下一個分隔線之前，即 `MP:2171`（```` ``` ````收尾）與 `MP:2173`（`---`）之間，比照該章節既有的 `Method Resolution Rule` callout 樣式（`MP:2127-2133`）新增第二個 callout：

```markdown
> **現況限制（P1-CONFLICT-4 / ADR-008，登記日 2026-08-29）**
>
> 上列 Recipe 中的 `Financial Assumptions` 節點，其對應的 Atlas Finance Domain Pack
>（`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:3901`）目前僅有目錄宣告，
> 無任何方法內容。依本節 §Method Resolution Rule（本文件 L45-49）之規則，今日若實際
> 驅動本 Recipe 執行到此節點，Method Selection Engine 必須回傳：
>
> `PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED`
>
> 節點名稱予以保留（Finance domain pack 已列於 Atlas §25 開發優先順序之 Phase 4，
> 非文件寫錯），在該 domain pack 補齊前，本 Recipe 不具備端到端可執行性。詳見 ADR-008。
```

**治理歸屬**：此提案的 `change_class` 建議填 `missing_contract`（依 ADR-006 定義的 7 類值域），因為問題本質是「Recipe 指名的方法契約不存在」而非文字潤飾。此提案應在 ADR-006 本身被批准、`.ai/proposals/` 機制建立後才能正式送審——本 ADR 與 ADR-006 之間有此依賴順序，若操作者尚未批准 ADR-006，這段加註文字暫時只作為本 ADR 的建議附件保存。

**唯一風險必須明說**：此修法只讓自我矛盾變得誠實可見，**不解決**底層能力缺口——`Financial Assumptions` 方法本身仍然不存在，Business Planning Mode 一旦被實際使用仍會 BLOCKED。真正解決需要 Atlas finance domain pack 落地（Atlas 自己排定在其 Phase 4），這在時間與範疇上都不屬於本 ADR，也不屬於目前已選定的 Research Mode MVP 路徑（`MVP_VERTICAL_SLICE_PLAN.md:36`）。若操作者日後決定提前把 Business Planning Mode 排入某條 MVP 切片，必須回頭把 `finance.financial_assumptions`（依 ADR-005 Method ID Grammar Option B 的 bare 形式）從 Tier 2 backlog 提升優先序，而不是預設這則加註已經「解決」問題。

## Consequences

**正面**：MP §43 不再自我矛盾卻不自知；任何人類或 AI 開機讀到這條 Recipe 時能立即知道現況邊界，不需要自己 Grep Atlas 才能發現；零新增方法內容、零 Atlas 改動、不影響已選定的 Research Mode MVP 路徑；與 Atlas 自己公開的 §25 開發順序保持一致，不製造「文件說可以、實際上還在排隊」的二次矛盾。

**負面／需要接受的成本**：這段加註是永久提醒 MP §43 這個旗艦範例目前是「示意而非可執行」——對面向非工程角色的展示場景可能顯得不夠亮眼，但這是誠實的必要代價，且該章節既有的 `Method Resolution Rule` callout已經是同樣風格，不算新增突兀元素。此修法**不消除**底層能力缺口，只是不再隱藏它——若操作者誤讀為「P1-CONFLICT-4 已完全解決」，之後 Business Planning Mode 一旦被排入任何實作排程，仍需要單獨一輪工作補齊 finance domain pack，本 ADR 對此不作任何假設或承諾時程。

## Migration / Rollback

**Migration**：
1. 待操作者批准 ADR-006（`.ai/proposals/` 機制）後，開一個提案（建議編號依當時序號遞增，例如 `.ai/proposals/00N-annotate-business-planning-financial-assumptions-gap/PROPOSAL.md`），`change_class: missing_contract`，`target_document: AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`，`affected_line_ranges: ["L2171-L2173"]`，內容即上方 Recommendation 段給出的 callout 區塊。
2. 操作者核准後，依 ADR-006 定義流程用 `Edit` 套用、單一 commit、`.ai/proposals/` 資料夾永久保留。
3. 套用完成後，`.ai/research/phase-1/CONFLICT_REGISTER.yaml` 的 P1-CONFLICT-4 更新為 `RESOLVED_BY_HUMAN`，附本 ADR 編號與生效 commit（比照 ADR-005 Migration 段第 4 步的既有模式）。
4. 待 Phase 3 建立 `methods/registry/contract-backlog.yaml`（`MACHINE_READABLE_SPEC_PLAN.md` §2.7 已規劃但尚未建立）時，補一筆條目：`method_id: finance.financial_assumptions`, `contract_status: pending`, `tier: 2`, `note: 見 ADR-008，P1-CONFLICT-4；Business Planning Mode 非目前選定 MVP 切片`——這一步不阻塞本 ADR 的加註修法，屬於後續銜接，本 ADR 僅記錄建議、不代為建立該檔案。

**Rollback**：純文件加註、無 runtime 或 schema 耦合，`git revert` 對應 commit 即可完整還原，風險等級 Low。若操作者之後認為不需要這段加註（例如 Atlas finance domain pack 已補齊、節點恢復可執行），另開一個新提案將 callout 內容更新為完工狀態，或整段移除——同樣走 `.ai/proposals/` 流程，不直接盲改。

## Evidence

- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:43-49`（§Method Resolution Rule / `PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED`）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:51-58`（§0.0.1 文件職責分離表）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:2125-2171`（§43 Business Planning Mode 完整 Recipe，`Financial Assumptions` 於 L2160）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:2175-2196`（§44 Business Strategy Mode，範圍排除說明用）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:3871-3903`（`/domain-packs/` 目錄樹，`finance` 於 L3901）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:2677`（§12.11 Porter）、`:2723-2729`（§12.14 STP）、`:2733`（§12.15 Business Model Canvas）、`:1813-1820`（§11.27 Scenario Planning）、`:2611-2614`（§12.5 OKR）、`:4332-4333`（§25 Phase 1 核心方法清單含 PESTEL/SWOT）——證明 Recipe 其餘節點在 Atlas 有真實內容，僅 Financial Assumptions 是例外
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:4292-4401`（§25 開發優先順序，`Business` 於 Phase 4，L4375-4386/4384）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:715-727`（F14 可行性與經濟性）、`:2849-2863`（§12.24 TELOS）——經檢視後判定不適用於本案問題類型
- `.ai/research/phase-0/domain-inventory.yaml:121-123`（business domain pack，無「僅目錄宣告」註記）與 `:133-135`（finance domain pack，「僅目錄宣告，無方法內容」）
- `.ai/research/phase-1/CONFLICT_REGISTER.yaml:51-64`（P1-CONFLICT-4 原始登錄）
- `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md:242-252`（§4，明確排除一次性補齊全部 289 方法 contract 的方案）、`:277`（MRSP-2 原文）
- `docs/architecture/MVP_VERTICAL_SLICE_PLAN.md:15`（訂正證據 ID 為 P1-CONFLICT-4，獨立重跑 Grep 驗證）、`:27-28`（Recipe Selection Matrix，Business Mode 因本缺口被評 High 阻塞）、`:36`（最終選定 Research Mode 為 Phase 5 MVP 切片）
- `docs/adr/ADR-005-db-migration-recipe-and-method-id-grammar.md`（Method ID Grammar Option B 先例，供未來 `finance.financial_assumptions` 命名依循）
- `docs/adr/ADR-006-mother-doc-revision-flow-and-repo-layout.md`（`.ai/proposals/` 流程定義，本 ADR Migration 段依賴此機制；經 Glob 確認 `.ai/proposals/` 目錄截至本次任務尚未建立）
- Grep 全文獨立核對（本次任務執行，非沿用任務摘要）：`finance` 在 Atlas 全文僅命中一次（L3901）；`Financial Assumptions` 在專案內僅出現於 Master Plan 本體與三份下游分析文件（MVP_VERTICAL_SLICE_PLAN.md / MACHINE_READABLE_SPEC_PLAN.md / CONFLICT_REGISTER.yaml），Atlas 本體零命中；Atlas 全文對「documentation debt / self-consistency / spec-impl gap」等詞（含中文對應）零命中，確認無現成方法可套用。

**邊界確認**：本次任務全程僅執行 Read/Grep（唯讀），未對三母文件或任何既有檔案做任何修改，僅新建本檔案 `ADR-008-business-planning-recipe-method-gap.md`。
