---
proposal_id: "026"
slug: "method-id-grammar-fix-atlas-l4256"
status: DRAFT
target_document: "AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md"
target_baseline_hash: "a47424f96bf6f88023b9870d4112ab1f607e9b424236693572d6a5558d2804a1"
affected_line_ranges: ["L4256-4258"]
related_open_questions: ["OQ-12"]
change_class: "semantic correction"
authored_by: "Claude"
approved_by: null
approved_at: null
approval_note: null
applied_commit: null
---

## PROPOSED_CHANGE

Method Atlas §24.1「Method 不可就地覆寫」的範例區塊（L4256-4258）三行修正：

1. 拿掉 `method.` 前綴。
2. 補回遺漏的 `family:` 欄位（原範例連 family 都沒寫）。
3. 版本號改用獨立的 `version:` 欄位遞增，取代原本把版本號塞進 ID 字串尾巴（`.v1` / `.v2` / `.v3`）的寫法。

## RATIONALE

`docs/adr/ADR-005-db-migration-recipe-and-method-id-grammar.md` Sub-decision (b) 核對 Method 機器可讀 ID 在三母文件的 7 處出現時，特別標註 L4256-4258 這處範例（`method.swot.v1` / `method.swot.v2` / `method.swot.v3`）是「三套已知文法之外的**第四種寫法**」——不只帶了 `method.` 前綴，還**遺漏了 family 段**，且把版本號直接塞進 ID 字串尾巴（`.v1`/`.v2`/`.v3`），與 Atlas 自己在 §9 LEGO Contract 的正式機讀契約（`id: root_cause.fishbone` / `version: 1.0.0` / `family: root_cause` 三個獨立欄位）完全不同構型。

ADR-005 選擇 **Option B（`<family>.<name>` bare 形式，版本另用獨立欄位）**，Recommendation 第 2 條明文對此處的修法：「修正 Atlas:4256-58 拿掉前綴並補回遺漏的 family 段（改為 `id: strategy.swot` + `version:` 欄位遞增，取代原本把版本號塞進 ID 字串尾巴的寫法）」。family 定為 `strategy`（而非留白或另猜），依據是 Master Plan §8.4 既有的正確用法 `execute_method(strategy.swot)`（MP:745，ADR-005 證據表已列，7 處出現中唯一與 SWOT 直接對應的 family 值）。

本次是三個相關修正一次到位（同一段範例、同一個根因），而非三個獨立提案：前綴移除與 family 補齊是同一句「改用 bare 形式」決策的兩面，版本欄位分離則是同一決策裡「版本不進 ID」的直接後果——三者拆開會讓讀者看到中間態（例如只拿掉前綴但仍缺 family、或仍把版號留在 ID 尾巴），比一次修正到位更容易誤導。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md`

## AFFECTED_SECTIONS

§24.1 Method 不可就地覆寫（L4253-4261，本提案修改範例區塊本身 L4256-4258；緊接的說明句「舊 Workflow 仍能 replay。」L4261 不動）

## DEPENDENCIES

與 `025-method-id-grammar-fix-atlas-l50`（同一份 ADR Sub-decision (b) 的另一個站點）修改不同行區間，互不重疊，可獨立套用，無先後順序要求。與 `023`/`024`（DB Migration Recipe 提案）分屬 ADR-005 兩個獨立子決定，互不依賴。

## COMPATIBILITY

範例格式從三行純字串（`text` fenced block）改為三組 `id`/`family`/`version` 欄位（同樣是 `text` fenced block，非強制解析的 YAML schema），與 Atlas §9 LEGO Contract 既有的欄位命名（`id` / `family` / `version`）一致，不新增欄位名稱。不影響 Master Plan 任何既有用法（ADR-005 Recommendation 第 2 條明文：「Master Plan 全部既有用法不需改動」）。§24.1 本身要傳達的概念——「Method 不可就地覆寫，舊版本必須保留供舊 Workflow replay」——修正後更清楚：三組範例的 `id: strategy.swot` 保持不變、只有 `version:` 遞增，直接展示「同一個 ID、多個不可變版本並存」這個概念，比原本三個各自獨立的字串（`method.swot.v1` 等）更精確傳達「ID 不變、版本變」的重點。

## MIGRATION

`Edit` 工具以 L4256-4258 現有逐字內容為 `old_string` 做精確字串替換；套用後重算 Atlas sha256。

## ROLLBACK

三母文件在 git 有 hash-anchored baseline，`git revert` 對應 commit 即可完整還原，風險等級 Low（純文件變更，無 runtime 副作用）。

## EVIDENCE

- `docs/adr/ADR-005-db-migration-recipe-and-method-id-grammar.md` Sub-decision (b)（L119-154 完整證據表，L125「Atlas §24.1 30 年演進策略 | Atlas:4256-4258 | method.swot.v1/v2/v3 | 敘述性範例，且遺漏 family 段（連 family 都沒寫，是三套文法之外的第四種寫法）」）與 Recommendation 第 2 條（L166，逐字給出修法：「改為 `id: strategy.swot` + `version:` 欄位遞增」）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:4256-4258`（本提案修改對象，現況逐字已於下方 Diff 引用）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:989-991`（Atlas §9 LEGO Contract，`id`/`version`/`family` 三個獨立欄位的正式機讀契約範式，本提案套用的欄位命名依此對齊）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:745`（`execute_method(strategy.swot)`，本提案 family 值 `strategy` 的依據）
- `.ai/research/phase-0/open-questions.yaml` OQ-12（status: RESOLVED_BY_HUMAN，`proposed_adr` 指向 ADR-005）
- `.ai/research/cross-review/CODEX_REVIEW.md` CDX-4（獨立交叉驗證，與 ADR-005 核對結果一致）

## Diff

### Original

Method Atlas L4256-4258（逐字）：

```text
method.swot.v1
method.swot.v2
method.swot.v3
```

### Proposed

```text
id: strategy.swot
family: strategy
version: 1.0.0

id: strategy.swot
family: strategy
version: 2.0.0

id: strategy.swot
family: strategy
version: 3.0.0
```

### Reason

三行字串改為三組欄位化範例，一次修正 ADR-005 核對出的三個相關問題：

1. **拿掉 `method.` 前綴**——改用 Option B 選定的 `<family>.<name>` bare 形式，`id: strategy.swot`。
2. **補回遺漏的 `family: strategy` 欄位**——原範例是三套已知文法之外「連 family 都沒寫」的第四種寫法；family 值 `strategy` 依據 Master Plan §8.4 既有的正確用法 `execute_method(strategy.swot)`。
3. **版本號改用獨立 `version:` 欄位遞增**（`1.0.0` → `2.0.0` → `3.0.0`），取代原本塞進 ID 字串尾巴的 `.v1`/`.v2`/`.v3`——`id: strategy.swot` 三組範例保持完全相同，只有 `version:` 遞增，直接對應 Atlas §9 LEGO Contract 的欄位範式（`id` / `version` / `family` 三個獨立欄位），也更精確傳達本節「Method 不可就地覆寫、ID 不變但版本疊加、舊版本保留供舊 Workflow replay」的概念。
