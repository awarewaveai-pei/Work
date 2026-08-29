# ADR-009: Plane / Workspace / Module 命名分層與 Localization 目錄正本化

Status: ACCEPTED（2026-08-29，操作者明示授權 Claude 行使架構師裁決權，見 ADR-001 同款範圍聲明：ADR 決策定案 ≠ 母文件已編輯，套用仍須走 ADR-006 `.ai/proposals/` 流程，該流程 APPROVED 僅操作者可推進）。**Module 層建議之生效前提**：本 ADR Sub-decision (a)/(b) 的 Module/Localization 落點沿用 `REPOSITORY_ARCHITECTURE.md`（Phase 2 Round 2 交付物，`Status: PROPOSED`，非本輪 ADR，不強行套用 ADR 二元決策格式）——該文件本身待 Phase 3/4 執行時自然生效，本 ADR 不代其裁決，僅聲明「一旦它被採用，本 ADR 的落點建議與其一致」，避免兩份文件互相矛盾
Date: 2026-08-29
Related: P1-DUP-2、P1-DUP-5（`.ai/research/phase-1/DUPLICATION_REGISTER.yaml`）、`docs/architecture/REPOSITORY_ARCHITECTURE.md`（PROPOSED，尚未 ACCEPTED，但本 ADR 的結論刻意與其保持一致，不重新發明程式碼層分解）

## Context

Phase 1 Duplication Register 登記了兩個 severity: medium 的重複定義，兩者性質相同——**命名/結構正本化問題，沒有真正的邏輯矛盾**（不像 P1-CONFLICT-1/2/3/4 或 P1-DUP-1/3 那樣涉及安全語意或資料完整性的取捨）。合併成一份 ADR 是因為兩者都可以用「補一張對照表 + 指定唯一正本」解決，不需要 P1-DUP-1（DB Migration）那種業界標準查證與 15 步序列重寫的重量級處理。

**(a) P1-DUP-2**：同一個系統被 Plane（MP §4）／Workspace（MP §77）／Module（MP §80）三套互不對應的分解方式描述，三份文件從未有一句話說明它們是同一件事的三種切法。

**(b) P1-DUP-5**：Localization 模組在 Master Plan §81 與（Phase 1 register 聲稱的）Method Atlas §122 用不相容的目錄/檔案結構各自定義一次。

本 ADR 對 (b) 做逐字查證時，發現 register 對 Atlas 端的引用本身無法驗證存在（詳見 Sub-decision (b) 的 Evidence 小節）——這是本 ADR 過程中新增的發現，不是任務原始描述的一部分，依 R4「聲稱即驗證」原則如實記錄，不因為任務描述已經寫好就照抄。

## Decision Drivers

- **不強行製造假的一對一對應**：Plane/Workspace/Module 若有些項目本來就沒有對應，要明說「無對應」，不得為了表格好看硬湊。
- **與已提出但尚未 ACCEPTED 的 `REPOSITORY_ARCHITECTURE.md` 保持一致**：該文件已經對 Module 層（bounded context）與 Localization 落點做過一輪驗證式分析，本 ADR 的職責是把「命名對照」這一層補齊，不是推翻或重做那份分析。
- **最小爆炸半徑**：兩個決定都優先選「加一個對照表/指標句」而非「大改三份文件既有內容」。
- **單一事實來源、其餘只能引用**：與 ADR-005/ADR-006 一致的不變量——同一件事只能有一處定義為準。
- **聲稱即驗證（R4）**：任何 file:line 引用必須自己 Read/Grep 核對過，不得因為上游文件（Phase 1 register 或 REPOSITORY_ARCHITECTURE.md）已經這樣寫就直接沿用。

## Sub-decision (a): Plane / Workspace / Module 命名分層 — Options Considered

### 已核對的完整證據

實際逐字讀完三處後，數量與 register 的概略描述有落差，且發現一個 register 沒指出的額外細節（§27 的標題本身不是 §4 正式清單的成員）：

| 站點 | file:line | 內容（逐字/逐項核對） |
|---|---|---|
| MP §4 總體架構（Plane 圖） | `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:361-402` | **12 個 Plane**（非 register 概述的「9-10 個」）：EXPERIENCE / HUMAN COLLABORATION / STAKEHOLDER INTELLIGENCE / GLOBAL JURISDICTION & COMPLIANCE / DECISION / COMPUTATION / COGNITIVE / KNOWLEDGE / ARTIFACT / CONTROL / DATA / PLATFORM PLANE，逐一列出見下方對照表 |
| MP §77 UI 工作空間 | `...Master_Plan_v1.md:3051-3086` | **6 個正式 Workspace**（Canvas/Knowledge/Data Lab/Workflow Lab/Artifact Studio/Decision Room，MP:3057-3079）+ 1 個明文標記「可再加入」的非正式項目 Intelligence Council（MP:3081-3085，本身就不是 6 大之一） |
| MP §80 程式碼目錄 | `...Master_Plan_v1.md:3175-3297` | **22 個 `/modules/*` 目錄**（非 register 概述的「20 個」），逐項：canvas/knowledge/research/business/learning/brainstorm/analytics/simulation/optimization/decision/stakeholders/artifact/authorship/jurisdiction/compliance/privacy/localization/accessibility/trade/tax/legal/standards（MP:3188-3210） |

**Register 引用的具體 drift 例證，逐一核對屬實，且比 register 描述更嚴重（有 4 個不同名字，不是 3 個）**：

| 站點 | file:line | 名稱 |
|---|---|---|
| MP §4 Plane 圖 | `MP:382-384` | `COMPUTATION PLANE`（描述：Python / R / SQL / Stats / ML / Causal） |
| MP §27 section 標題 | `MP:1688` | `Data Science Plane`——**這個名字不在 §4 的 12 個正式 Plane 清單裡**，內容（MP:1690-1706）也不是重列一次 COMPUTATION PLANE 的定義，而是一段 AI→Analysis Planner→Trusted Compute Engine 流程圖。它看起來像第 13 個 Plane，實際上不是，是命名層級混淆的直接證據 |
| MP §28 section 標題 + 程式碼路徑 | `MP:1710`, `MP:1715` | `Data Lab` / `/modules/analytics/` |
| MP §77 Workspace 清單 | `MP:3065` | `Data Lab`（與 §28 同名，但 §77 是 UI workspace，§28 是「確切模組」，兩者字面相同卻是不同分層，容易被誤讀成同一個定義） |
| MP §80 程式碼目錄 | `MP:3195` | `/modules/analytics` |
| `REPOSITORY_ARCHITECTURE.md`（Module 層已提出的正本） | `REPOSITORY_ARCHITECTURE.md:131` | `/modules/data-science/*`——已將 analytics 與 simulation 合併改名，是這條線未來的目標名稱 |

同一個「用可信任計算做資料科學」的能力，六個站點出現四種拼法（`COMPUTATION PLANE` / `Data Science Plane` / `Data Lab` / `analytics` / 未來的 `data-science`），且沒有一處寫「這些是同一件事」。

### Option (i) — 挑一個詞當正本，其餘降級為別名

**拒絕**。三層不是同義詞的三種寫法，而是**三個不同的抽象層**，語意不能互相取代：

- Plane（MP §4）是架構/信任邊界宣告層——例如 `GLOBAL JURISDICTION & COMPLIANCE PLANE` 的實質是「任何 Capability 執行前都必須先通過 Trust Fabric」（MP:418）這句橫切規則，不是一個使用者會點開的東西。
- Workspace（MP §77）是 UI/IA 層——6 個使用者看得到的容器；多數 Plane（EXPERIENCE / GLOBAL JURISDICTION & COMPLIANCE / COGNITIVE / CONTROL 的非組裝部分 / DATA / PLATFORM）根本沒有對應的 Workspace，因為使用者不需要也不應該直接操作它們。
- Module（MP §80）是程式碼 bounded-context 層——`REPOSITORY_ARCHITECTURE.md` 已經獨立驗證過這層，結果是 9 個原本在 `/modules/*` 的合規類目錄應該搬到 `/platform/trust-fabric/*`（因為它們是強制關卡不是使用者可選功能，`REPOSITORY_ARCHITECTURE.md:66-68`），`decision`／`artifact` 應該併入 `/core/domain`（`REPOSITORY_ARCHITECTURE.md:63-64`）。

若把三層硬壓成一個詞，等於要嘛把架構宣告寫死成資料夾名（未來 UI 文案一改，程式碼路徑也要跟著改的假耦合），要嘛把已經驗證過的程式碼邊界又拉回未驗證的敘事層。兩者都是倒退。

### Option (ii) — 三層抽象各自定名，補一張跨層對照表（推薦）

明確定義：

- **Plane**（MP §4 為唯一正本，內容不需要改）＝架構/信任邊界宣告層，變動頻率最低，不隨 UI 文案或程式碼重構變動。
- **Workspace**（MP §77 為唯一正本）＝ Experience Plane 內部對「人類可見功能」的二次分解，是 Plane 的**子集**（只有 6 個 Plane 有對應 Workspace），不是與 Plane 平行的另一套系統分解。
- **Module**（MP §80 為 v1 歷史快照；`REPOSITORY_ARCHITECTURE.md` 的 Proposed Directory Tree 為程式碼層現行目標正本，一旦該文件被 ACCEPTED 即生效）＝程式碼 bounded-context 層，變動頻率最高。

### 對照表（本 ADR 的核心產出，逐一核對，非猜測）

| Plane（MP §4） | Workspace（MP §77） | Module — MP §80 原始清單 | Module 現況（`REPOSITORY_ARCHITECTURE.md` 驗證後） | 對應程度 |
|---|---|---|---|---|
| EXPERIENCE PLANE | 無單一對應（Workspace 全體都是 Experience Plane 內部細分） | 無 | `/apps`（RA:90，非 `/modules`） | 容器關係，非同層對應 |
| HUMAN COLLABORATION PLANE | Canvas（MP:3057-3059） | canvas, brainstorm | 兩者保留為 vertical（RA:56,124,58,129） | 完整三層對應 |
| STAKEHOLDER INTELLIGENCE PLANE | Intelligence Council（MP:3081-3085，非正式六大之一） | stakeholders | 保留為 vertical（RA:59,130） | 對應，但 Workspace 端本身非正式項目 |
| GLOBAL JURISDICTION & COMPLIANCE PLANE | 無對應 Workspace | jurisdiction, compliance, privacy, localization, accessibility, trade, tax, legal, standards（9 項） | **全部移出 `/modules`**，改列 `/platform/trust-fabric/*`（RA:66-68,209-218）——強制關卡，非使用者可選功能 | 無 Workspace；Module 定位本身被 RA 推翻 |
| DECISION PLANE | Decision Room（MP:3077-3079） | decision, optimization | decision **應移除**併入 `/core/domain/decision`（RA:63,111）；optimization 拆為業務包裝與求解器兩處（RA:62,140,178） | Workspace 對應；Module 端已知需修正 |
| COMPUTATION PLANE（§27 又稱「Data Science Plane」，非 §4 正式名） | Data Lab（MP:3065-3067；§28 亦稱 Data Lab，MP:1710） | analytics, simulation | 合併為 `/modules/data-science/*`（RA:60-61,131-141） | 完整對應，但六站點四種拼法（見上方 drift 表） |
| COGNITIVE PLANE | 無對應 Workspace | 無 | 屬於 `/cognitive/*` 頂層命名空間（Atlas §17；RA:144-161），不在 `/modules` 下 | 無 Workspace 亦無 Module |
| KNOWLEDGE PLANE | Knowledge（MP:3061-3063） | knowledge | 保留為 engine，schema 移至 `/core/domain/knowledge`（RA:30,57,104,125） | 完整三層對應 |
| ARTIFACT PLANE | Artifact Studio（MP:3073-3075） | artifact, authorship | artifact **應移除**併入 `/core/domain/artifact`（RA:64,105）；authorship 保留（RA:65,142） | Workspace 對應；Module 端部分已知需修正 |
| CONTROL PLANE | Workflow Lab（MP:3069-3071，僅覆蓋「LEGO 組裝」，Policy/Identity/Version/Consent 無對應） | 無 | Workflow/Policy/Identity 為 Shared Kernel（`/core/domain/*`，RA:33-36,107-110）；Workflow engine 在 `/platform/workflow`（RA:181） | 僅部分 Workspace 對應，無 Module |
| DATA PLANE | 無對應 Workspace | 無 | 對應頂層 `/data`（MP:3267-3273；RA:220-226） | 無 Workspace 亦無 Module |
| PLATFORM PLANE | 無對應 Workspace | 無 | 對應頂層 `/platform`、`/security`（MP:3275-3288；RA:180-233） | 無 Workspace 亦無 Module |

**誠實結論**：12 個 Plane 裡，只有 4 個（Human Collaboration / Stakeholder Intelligence / Computation / Knowledge）有真正撐到程式碼層都還存在的完整三層對應；其餘 8 個要嘛從一開始就沒有 Workspace（因為使用者不該直接操作），要嘛 Module 端已經被 `REPOSITORY_ARCHITECTURE.md` 驗證後判定應該搬家或消失（併入 kernel/platform）。這不是缺陷——這正是「三層是不同抽象層、不是同一分解的三個别名」的證據：如果三者真的是同一件事，理應永遠 1:1；它們不是。

### Status Quo（不作為對照組）

三套分解並存且無對照表，讀者/實作者得自己拼湊，未來重構容易把同一概念誤判成三個不同的東西重複建設（register 原文 consequence，MP/register:46 逐字屬實）。不列入比較矩陣評分。

### 比較矩陣

| 面向 | Option (i)（單一詞正本） | Option (ii)（三層抽象＋對照表，推薦） |
|---|---|---|
| **Correctness** | 差——三層本質不同，強行合一會製造假耦合或丟失已驗證的 Module 邊界 | **佳**——如實反映三個不同變動頻率、不同讀者的分解 |
| **Maintainability** | 差——UI 文案變動會被誤認為要求代碼路徑跟著變 | **佳**——三層各自獨立演進，只靠對照表銜接 |
| **Migration 成本** | 高——要嘛改 §4/§77 措辭，要嘛推翻 `REPOSITORY_ARCHITECTURE.md` 已驗證的 Module 邊界 | **低**——新增 1 個對照表 + 1 段定義 + 修正 1 個誤導性標題（§27） |
| **Complexity** | 表面低，實際上把三種變動速率混在一起，隱藏複雜度（呼應 ADR-006(b) 對 Status Quo 的同一批評） | **低**——分層講清楚後，讀者一次就懂為何有些 Plane 沒有 Module |

## Sub-decision (b): Localization 目錄正本化 — Options Considered

### 已核對的完整證據（含一項未預期的引用查證失敗）

MP 端引用逐字核對屬實：

| 站點 | file:line | 內容 |
|---|---|---|
| MP §81 配置路徑 | `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:3344-3349` | `/config/localization/{locale.yaml, currencies.yaml, timezones.yaml, units.yaml, accessibility.yaml}`（5 個扁平檔案，逐字確認） |

Atlas 端引用**查證失敗**——這是本 ADR 過程中新發現，任務原始描述沿用了 register 的說法，但獨立核對後無法成立：

- Register 聲稱：「Atlas §122 Localization Architecture，行 4918，`/modules/localization/{locale, language, currency, timezone, calendar, units, address, formatting}/`（8 個子目錄）」。
- 實測：`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md` 全文件僅 **4618 行**（`wc -l` 實測），章節僅到 **§30「最終定義」**（`Atlas:4556`）——不存在 §122，行號 4918 超出檔案總長度，物理上不可能有內容。
- 額外用關鍵字全文搜尋 `localization` / `locale` / `currency` / `timezone` / `calendar` / `address` / `formatting` / 地區 / 語系 / 幣別，Atlas 全文找不到任何一處符合「8 個子目錄、無檔案」的目錄樹定義。與 localization 相關的僅有四個真實但性質不同的站點：
  1. `Atlas:216-236`（§5.2 Local/Jurisdiction Packs）——扁平清單，混合法規與 i18n 概念，非目錄樹。
  2. `Atlas:940-964`（F23 全球管轄／合規／在地化）——工具用途表，「Localization Review」只是表格裡的一列（`Atlas:949`），不是架構定義。
  3. `Atlas:3156-3178`（§12.43 在地化檢查／本地化審查）——QA 檢查清單（Language/Date/Timezone/Currency/Number Format/Units/Address/Name/Phone/Tax/UI Layout/Accessibility/Content Expectations，`Atlas:3161-3175`），是審查項目不是目錄結構。
  4. `Atlas:3861-4019`（§17 確切工程路徑）——Atlas 真正的程式碼路徑正本，其中僅有 `/packs/language/`（`Atlas:3985`，單一葉節點）與 `/lenses/accessibility`（`Atlas:3914`）、`/profiles/accessibility`（`Atlas:3940`）兩個單一葉節點，**沒有** locale/currency/timezone/calendar/units/address/formatting 的 8 子目錄分解。

**判定**：P1-DUP-5 的 Atlas 端引用在目前文件中不可驗證存在，屬於 Phase 1 register 的**引用錯誤**（很可能是產出當下的行號/章節號推測失準——`ADR_INDEX.md:22-23` 本身已誠實揭露「本輪未逐條由第二人重新驗證每一個 file:line」，這正是那個已知風險的一個實例）。更值得注意的是，`REPOSITORY_ARCHITECTURE.md:68` 在提出 `/platform/trust-fabric/localization/` 方案時，只是引用了 `DUPLICATION_REGISTER.yaml` 的這個條目，**沒有再往上游對 Atlas 原文做二次查證**——即一個未經驗證的引用被下游文件當作既定事實繼續往下建構。本 ADR 在此把這條鏈截斷：不再以「Atlas 定義了 8 個子目錄」作為決策理由，改用下方獨立的工程判斷。

**這不影響 MP 端問題的真實性**：`/config/localization/`（MP §81，5 檔案）與 `REPOSITORY_ARCHITECTURE.md` 已提出的 `/platform/trust-fabric/localization/`（8 目錄）兩者路徑、粒度確實不同，需要本 ADR 裁決哪個是正本——只是裁決理由不能再說「因為 Atlas 這樣定義」，必須用獨立的工程理由站得住腳。

### Option A — 維持 MP §81 `/config/localization/`（5 扁平檔案）

**拒絕**。與 `REPOSITORY_ARCHITECTURE.md` 已提出的方向衝突：該文件的 `/infra/config-as-code`（`RA:283`）已明講 MP §81 整個配置路徑家族（含 localization）要整批移入 `/infra/config-as-code`，`/config/` 作為獨立頂層根目錄本身在提案的樹裡已不存在（`RA:87-289` 全樹搜尋，無 `/config` 頂層項目）。維持現狀等於忽略已經做過的驗證工作。且 `accessibility.yaml` 被塞進 localization 底下是概念錯置——無障礙是合規/信任議題，不是語言/地區議題，兩者要求的驗收標準完全不同（WCAG 檢核 vs 翻譯正確性）。

### Option B — 採用 register 聲稱的 Atlas 版本 `/modules/localization/`（8 子目錄）

**拒絕**，理由與 Option A 不同：不是內容不好，是**引用來源不可驗證**（見上方 Evidence）。且即使暫時忽略引用問題，`/modules/localization/` 這個根路徑本身也與 `REPOSITORY_ARCHITECTURE.md` 已提出的方向矛盾——該文件已將全部 9 個合規類目錄（含 localization）判定為「強制關卡，非使用者可選 vertical」而移出 `/modules`（`RA:66-68`）。採用 Option B 等於同時採信一個查無實據的引用、又走一條已經被獨立分析否決的路徑。

### Option C — 採用 `REPOSITORY_ARCHITECTURE.md` 已提出的 `/platform/trust-fabric/localization/`，8 個子目錄，accessibility 移為同層兄弟（推薦）

不依賴不可驗證的 Atlas 引用，改用獨立工程理由：

1. **根路徑**：`/platform/trust-fabric/`（`RA:209`）而非 `/config` 或 `/modules`——因為 localization 與其八個同層兄弟（jurisdiction/compliance/privacy/legal/accessibility/trade/tax/standards，`RA:210-218`）性質相同：都是「Capability 執行前的強制檢查」，不是使用者自選功能，也不是單純部署期靜態設定。`RA:283` 已確認 MP §81 整個 `/config/*` 家族併入 `/infra/config-as-code`（部署期靜態值），與 `/platform/trust-fabric/*`（執行期引擎/規則結構）是兩個不同層次——這與 `REPOSITORY_ARCHITECTURE.md` 既有的「目錄層 vs 實作層」分工模式（`RA:76-83`，`/methods/registry` vs `/cognitive/methods`）一致，不是新發明的分法。
2. **粒度**：目錄制（每個關注點一個子目錄）優於扁平檔案制——因為同層 8 個兄弟目錄全部是目錄而非檔案，localization 若維持扁平檔案會是樹裡唯一的例外，破壞一致性；且目錄制對「一個關注點未來需要多個規則檔」（例如 `currency/` 底下未來可能同時要放 `codes.yaml`、`display-format.yaml`、`rounding-rules.yaml`）有擴充空間，扁平單檔沒有。
3. **項目集合（兩份清單的並集，逐項有理由，不是照抄任一方）**：
   - `locale`、`currency`、`timezone`、`units`——MP §81 已驗證存在（`MP:3345,3346,3347,3348`），保留，改為目錄制。
   - `language`——與 `locale`（地區+語言組合，如 `zh-TW`）是不同關注點：語言本身的排版/字型/文字方向（例如 CJK 直式、RTL）不隨地區設定變化，獨立成項有實際工程理由，不依賴 Atlas 引用。
   - `calendar`——與 `timezone` 不同：時區是 UTC 偏移，曆法是計曆系統（陽曆/農曆/佛曆/伊斯蘭曆），MP 完全沒有觸及這塊，但一個宣稱「全球、跨政府層級」（Atlas:8 定位聲明）的系統若要支援政府/宗教相關情境，曆法是真實需求。
   - `address`——地址格式慣例（門牌順序、郵遞區號位置）因國而異，與 `units`（度量衡）是不同關注點，i18n 領域慣例上一向分開處理（例如 Google libaddressinput 的做法）。
   - `formatting`——數字/日期分組與顯示格式規則，與「幣別代碼本身」（`currency`）是不同關注點：`currency/` 定義「這個地區用什麼貨幣」，`formatting/` 定義「數字怎麼分組、日期怎麼排列」，兩者實際實作時通常是不同的規則檔。
   - `accessibility`——**移出** localization，理由見下。
4. **Accessibility 移為 `/platform/trust-fabric/` 同層兄弟，而非 localization 底下的子項**（採 `RA:215` 已提出的位置）：MP §81 把它塞進 localization 純屬歷史巧合（可能因為早期草稿把「支援多語系使用者」與「支援身心障礙使用者」都歸類為「讓更多人能用」）,但兩者的驗收標準、負責團隊、法規依據（WCAG vs 翻譯品質）完全不同，且 Atlas 自己也在兩個不相關的地方（`/lenses/accessibility`、`/profiles/accessibility`，`Atlas:3914,3940`）把 accessibility 當獨立關注點處理，從未把它掛在 localization 底下——這反而支持「accessibility 不屬於 localization」的判斷，即使 localization 本身那組 8 子目錄的 Atlas 引用查無實據。

### Status Quo（不作為對照組）

兩份不相容定義同時存在，未來兩個依不同文件實作的團隊會蓋出不相容的目錄結構（register consequence，`DUPLICATION_REGISTER.yaml:91`，屬實）。不列入比較矩陣評分。

### 比較矩陣

| 面向 | Option A（維持 MP `/config/localization/`） | Option B（採信 Atlas `/modules/localization/`） | Option C（`/platform/trust-fabric/localization/`，推薦） |
|---|---|---|---|
| **Correctness** | 差——accessibility 概念錯置未修正 | **不可用**——引用來源查無實據 | **佳**——獨立工程理由 + 與已提出的信任邊界分工一致 |
| **Maintainability** | 差——與 `RA:283` 的 `/infra/config-as-code` 方向衝突 | 差——與 `RA:66-68` 的 module→trust-fabric 遷移方向衝突 | **佳**——與 `REPOSITORY_ARCHITECTURE.md` 全樹一致，不需要之後再改一次 |
| **Migration 成本** | 低（不動）但留著錯置的 accessibility | 中，且建立在不存在的引用上，等於白做 | **低**——`REPOSITORY_ARCHITECTURE.md` 已經畫好目標，本 ADR 只是正式追認並補上獨立理由 |
| **Complexity** | 低 | 中（多一個查無實據的正本要事後解釋） | **低**——與既有 trust-fabric 8 個兄弟目錄同構，讀者不需要學一個特例 |

## Method Used

- **Evidence Triangulation**（呼應 Atlas `evidence.triangulation`，ADR-005 同樣用過）：MP 三處站點互相核對建立 Sub-decision (a) 的對照表；Sub-decision (b) 則是內部證據（Atlas 全文關鍵字搜尋 + 行數/章節上限核對）與外部證據（`REPOSITORY_ARCHITECTURE.md` 已獨立提出的方向 + 標準 i18n/l10n 領域慣例）交叉比對後才下結論。
- **輕量 Root Cause 觀察**（非正式 Fishbone，因為問題本身夠簡單不需要完整方法）：Atlas 引用查證失敗的根因判定為「Phase 1 產出時行號/章節號推測失準，未經第二人複核」——`ADR_INDEX.md:22-23` 的既有誠實聲明本身就是這個根因的獨立佐證，不是本 ADR 憑空猜測。
- **Options Comparison**：兩個子決定都用 Correctness/Maintainability/Migration/Complexity 四軸，與 ADR-005/ADR-006 一致的比較框架。本 ADR 刻意不做正式 MCDA 權重誘導——依任務要求，這類已有清楚工程答案的低風險項目應維持直接、不刻意製造複雜度。

## Recommendation

**(a) Plane / Workspace / Module**：採 Option (ii)。三層分別維持各自正本（Plane＝MP §4 不變；Workspace＝MP §77 不變；Module＝MP §80 降級為 v1 歷史快照，`REPOSITORY_ARCHITECTURE.md` 為程式碼層現行目標正本，待其 ACCEPTED 後生效）。具體待執行的最小編輯集（供 Phase 2 走 ADR-006 的 `.ai/proposals/` 流程套用，本 ADR 本身不觸碰母文件）：

1. 在 MP §4 結尾（`MP:419` 之後、`MP:420` 分隔線前）新增一段定義：Plane/Workspace/Module 三層關係的一句話說明（見本 ADR「Option (ii)」段落內容，可直接引用）。
2. 新增一個小節（建議編號 `§80.1` 或附錄形式）收錄本 ADR 的 12 列跨層對照表，並在 §4 Plane 圖結尾與 §77 Workspace 清單結尾各加一句指標句「跨層命名對照見 §80.1」（同 ADR-005 對 Atlas 三處序列圖採用的「一句話指向唯一正本」模式）。
3. 修正 `MP:1688` 標題，從「27. Data Science Plane」改為不再暗示第 13 個 Plane 的名稱（例如「27. Data Science 執行流程（對應 §4 COMPUTATION PLANE）」），並在標題下加一句回指 §4。
4. 在 MP §80 開頭加一句指標句：「程式碼層現行正本見 `REPOSITORY_ARCHITECTURE.md`；本清單為 v1 歷史快照」——沿用 ADR-006(b) 已經定案的「路徑移出母規格、母文件只留一句話指標」模式，不重新設計。

**(b) Localization**：採 Option C。正本路徑 = `/platform/trust-fabric/localization/{locale, language, currency, timezone, calendar, units, address, formatting}/`（8 個子目錄，目錄制非扁平檔案），與 `REPOSITORY_ARCHITECTURE.md:209-218` 的既有提案一致。`accessibility` 移為 `/platform/trust-fabric/accessibility/` 同層兄弟（`RA:215`），不再是 localization 子項。MP §81 的 `localization:` 區塊（`MP:3344-3349`）比照 (a) 的模式，改為一句指標句指向 `REPOSITORY_ARCHITECTURE.md`，保留區塊本身作為 v1 歷史快照不刪除。

**未在本 ADR 範圍內解決、明確列為後續追蹤項（不得誤讀為已解決）**：

1. **翻譯字串缺失時的 fallback 語言規則**——MP 與 Atlas 兩邊都沒有定義，這是內容缺口不是命名問題，本 ADR 不設計，留待 Phase 2/3 另開項目。
2. **Atlas:62-64 的強制產品規則從未被連結到任何在地化操作章節**——「翻譯或介面語言變更，不得改變...歷史 Workflow 的可重播性」（`Atlas:64`）是一條真實存在的強制規則，但查證後發現 Atlas 根本沒有一個統一的「Localization 架構」章節可以連結（見上方 Evidence，最接近的是 `Atlas:940-964` F23 與 `Atlas:3156-3178` §12.43，兩者都沒提到 replay 可重播性）。建議：未來記錄 `/platform/trust-fabric/localization/` 實際行為的章節（不論落在哪份母文件）應包含一句回指 `Atlas:64`，但**完整的 replay-safety 機制設計不在本 ADR 範圍內**，避免 scope creep。
3. **Phase 1 register 引用錯誤本身的訂正**——`DUPLICATION_REGISTER.yaml` P1-DUP-5 對 Atlas 端的引用（`§122`、行 4918）應予訂正或加註「未能驗證」，`REPOSITORY_ARCHITECTURE.md:68` 因沿用同一引用也應加註來源已改為獨立工程理由（見本 ADR Option C）。本 ADR 依任務邊界不直接修改這兩份檔案，僅在此明確記錄，供操作者決定是否另開小任務處理。

## Consequences

**正面**：Plane/Workspace/Module 三層第一次有明確定義與可查驗的對照表，未來重構不會再把同一概念誤判成三個不同的東西；「Data Science」這條線六個站點的命名分歧被記錄且有收斂路徑。Localization 有了與整棵 `REPOSITORY_ARCHITECTURE.md` 目標樹一致的單一正本，accessibility 的概念錯置一併修正；過程中額外揪出一條「未驗證引用被下游文件沿用」的鏈並截斷，避免它繼續被第三份文件引用而變成看似有多方佐證的假共識。

**負面／需要接受的成本**：MP 需要新增一個對照表小節與若干指標句（非破壞性新增，不刪除既有內容）；`REPOSITORY_ARCHITECTURE.md` 本身仍是 PROPOSED 狀態，本 ADR 的 Module 層建議要等它被 ACCEPTED 才真正生效，在那之前 MP §80 仍是唯一可執行的程式碼層描述；三個列為後續追蹤項的缺口（fallback 語言、replay-safety 連結、register 引用訂正）都還沒解決，需要在 TASKS 或後續 ADR 中明確追蹤，不能被本 ADR 的「已處理」感覺蓋過去。

## Migration / Rollback

**執行順序建議**：
1. 先確認 `REPOSITORY_ARCHITECTURE.md` 是否/何時轉為 ACCEPTED——(a) 的 Module 層指標句與 (b) 的正本路徑都依賴它。
2. 待 (1) 確認後，依 ADR-006 的 `.ai/proposals/<NNN>-<slug>/` 流程，對 MP §4、§27、§77、§80、§81 各開一個 proposal（`change_class: duplication_removal` 或 `boundary_clarification`），逐一套用本 ADR「Recommendation」段列出的最小編輯集。
3. 全部套用後，將 `.ai/research/phase-1/DUPLICATION_REGISTER.yaml` 的 P1-DUP-2、P1-DUP-5 更新為 `RESOLVED_BY_HUMAN`，附本 ADR 編號、生效日期，並在該處補註 P1-DUP-5 原 Atlas 端引用已於本 ADR 查證為不可驗證。

**Rollback**：三母文件在 git 有 hash-anchored baseline，`git revert` 對應 commit 即可完整還原，風險等級 Low（純文件變更，無 runtime 副作用），與 ADR-005/ADR-006 相同。

## Evidence

**Sub-decision (a)**：
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:361-419`（§4 Plane 圖與 Trust Fabric）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:1688-1723`（§27 Data Science Plane、§28 Data Lab）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:3051-3086`（§77 UI 工作空間）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:3175-3297`（§80 程式碼目錄）
- `docs/architecture/REPOSITORY_ARCHITECTURE.md:20-90,104-142,171-233`（Bounded Context Analysis 表 + Proposed Directory Tree 相關區段）
- `.ai/research/phase-1/DUPLICATION_REGISTER.yaml:28-46`（P1-DUP-2 原文）

**Sub-decision (b)**：
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:3301-3350`（§81 配置路徑，含 localization 區塊 3344-3349）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:14-64`（中文優先規範，含 62-64 的 replay-safety 強制規則）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:216-236`（§5.2 Local/Jurisdiction Packs）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:940-964`（F23）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:3156-3178`（§12.43 在地化檢查）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:3861-4019`（§17 確切工程路徑，含 3914/3940/3985 三個相關葉節點）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:4556-4618`（§30 最終定義 + 文件結尾，證明檔案總長度與章節上限，反證 §122/行 4918 不存在；`wc -l` 實測 4618 行）
- `docs/architecture/REPOSITORY_ARCHITECTURE.md:66-68,209-218,279-283,340-341`（localization/accessibility 落點決策與其推翻的方案 3 根因分析）
- `.ai/research/phase-1/DUPLICATION_REGISTER.yaml:77-91`（P1-DUP-5 原文，含本 ADR 判定為不可驗證的 Atlas 端引用）
- `.ai/research/phase-0/document-inventory.yaml:42-44`（確認全專案僅此一份 Atlas 檔案，排除「引用的是另一個版本」的可能性）
- `docs/adr/ADR_INDEX.md:22-23`（既有的引用未經第二人複核之誠實揭露，作為本次查證失敗根因判定的獨立佐證）

**邊界確認**：本次任務全程僅執行 Read/Grep（唯讀），未對三母文件、`REPOSITORY_ARCHITECTURE.md`、`DUPLICATION_REGISTER.yaml` 或任何其他既有檔案做任何修改，僅新增本檔案。
