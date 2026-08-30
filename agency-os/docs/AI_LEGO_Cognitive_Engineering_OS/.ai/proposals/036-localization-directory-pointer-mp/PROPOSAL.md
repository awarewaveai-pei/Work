---
proposal_id: "036"
slug: "localization-directory-pointer-mp"
status: DRAFT
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L3344-3350"]
related_open_questions: []
change_class: "duplication removal"
authored_by: "Claude"
approved_by: null
approved_at: null
approval_note: null
applied_commit: null
---

## PROPOSED_CHANGE

Master Plan §81 配置路徑的 `localization:` 區塊（`L3344-3349`，5 個扁平檔案）**保留原樣不刪除**，僅在該行內加一句行內標註「v1 歷史快照」；並在整個 `/config/` code fence 結束後（`L3350` 之後）新增一段說明，指向 `docs/architecture/REPOSITORY_ARCHITECTURE.md` 已提出的 `/platform/trust-fabric/localization/{locale, language, currency, timezone, calendar, units, address, formatting}/`（8 個子目錄）為程式碼層現行正本，並註明 `accessibility` 已移為同層兄弟、不再是 localization 子項。§81 其餘子區塊（deployment/ai/privacy/compute/licensing/storage/jurisdiction/legal/compliance）不在本 ADR 範圍內，維持原樣不動。

## RATIONALE

`docs/adr/ADR-009-nomenclature-and-directory-canonicalization.md`（ACCEPTED，2026-08-29）Sub-decision (b) 對 P1-DUP-5 逐字查證後發現：Phase 1 register 聲稱的 Atlas 端引用（§122，行 4918）**查無實據**——Atlas 全文僅 4618 行、章節僅到 §30，該引用不可能存在（ADR-009:110-120）。ADR 因此不採信 Atlas 引用，改用獨立工程理由裁決 Option C：正本路徑改為 `/platform/trust-fabric/localization/`（8 個目錄制子目錄），理由是 localization 與其 8 個同層兄弟（jurisdiction/compliance/privacy/legal/accessibility/trade/tax/standards）性質相同，都是「Capability 執行前的強制檢查」，且 `REPOSITORY_ARCHITECTURE.md:283` 已確認 MP §81 整個 `/config/*` 家族併入 `/infra/config-as-code`（部署期靜態值），與 `/platform/trust-fabric/*`（執行期引擎/規則結構）是兩個不同層次（ADR-009:132-145）。`accessibility` 移出 localization 是因為兩者驗收標準（WCAG vs 翻譯品質）與負責團隊完全不同（ADR-009:144-145）。ADR Recommendation 明確指定治理模式：「MP §81 的 `localization:` 區塊（`MP:3344-3349`）比照 (a) 的模式，改為一句指標句指向 `REPOSITORY_ARCHITECTURE.md`，保留區塊本身作為 v1 歷史快照不刪除」（ADR-009:175）——與 §80（本 ADR 另一項最小編輯集，見 `035-code-layer-repository-architecture-pointer-mp`）採用完全相同的「路徑移出母規格、母文件只留一句話指標」模式（ADR-006(b) 已定案，ADR-009:173,175 皆明文引用不重新設計）。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`

## AFFECTED_SECTIONS

- §81 配置路徑，`localization:` 子區塊（`L3344-3349`）＋ code fence 結尾後新增說明段落（`L3350` 之後）

## DEPENDENCIES

- 依賴 `ADR-009` 已 ACCEPTED（已確認：`docs/adr/ADR-009-nomenclature-and-directory-canonicalization.md:3`）。
- **新增說明段落引用 `docs/architecture/REPOSITORY_ARCHITECTURE.md` 的 `/platform/trust-fabric/localization/` 與 `/platform/trust-fabric/accessibility/` 為程式碼層現行正本。該文件目前 `Status: PROPOSED`，尚未 ACCEPTED**（已核對：`docs/architecture/REPOSITORY_ARCHITECTURE.md:2`，2026-08-30 讀取）。與 `035` 同一性質的風險：本提案的說明段落是陳述句而非條件句，若 `REPOSITORY_ARCHITECTURE.md` 最終未被採用或 `RA:209-218` 的 trust-fabric 目錄結構有變動，本段文字會需要跟著修訂。ADR-009 已明文承認同一前提（ADR-009:187,192）。**操作者核准本提案前應與 `035` 一併考慮**：是否要等 `REPOSITORY_ARCHITECTURE.md` 先轉為 ACCEPTED 再套用，或接受指標句先行、目標文件狀態隨後追上的順序。
- 不依賴 Sub-decision (a) 的任何提案（`032`/`033`/`034`/`035`），可獨立套用；主題（localization 目錄正本化）與 Sub-decision (a)（Plane/Workspace/Module 命名分層）是兩個獨立問題，僅同屬 ADR-009 一份文件。

## COMPATIBILITY

不影響任何 schema、policy、recipe 檔案。§81 既有 `localization:` 5 檔案清單本身不刪除、不改寫內容，僅加一句行內標註 + 段後說明；§81 其餘子區塊（jurisdiction/legal/compliance 等）完全不動，避免範圍蔓延超出本 ADR 裁決範圍。

## MIGRATION

套用時使用 `Edit` 工具做精確字串插入（行內標註 + code fence 後新增段落），不使用 `sed` 等可能誤傷周邊 YAML 縮排的工具；套用後重新計算 Master Plan sha256 並更新 `.ai/research/phase-0/document-hashes.yaml`（若該登記檔存在）。**建議套用前先確認 `docs/architecture/REPOSITORY_ARCHITECTURE.md` 的 `Status:` 欄位現況**（見 DEPENDENCIES），可與 `035` 同批次決定是否等待其 ACCEPTED。

## ROLLBACK

`git revert` 對應 commit 即可完整移除行內標註與說明段落，還原 §81 `localization:` 區塊原始樣貌（5 檔案、無標註、無段後說明）。純新增文字、無 runtime 副作用，回滾風險 Low，與 ADR-009 Migration/Rollback 段落一致（ADR-009:196）。

## EVIDENCE

- `docs/adr/ADR-009-nomenclature-and-directory-canonicalization.md:100-158,175`（Sub-decision (b) 全段：Atlas 引用查證失敗、Option A/B/C 比較矩陣、Recommendation 原文）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:3301-3352`（§81 現況全文，2026-08-30 直接 Read 核對）
- `docs/architecture/REPOSITORY_ARCHITECTURE.md:1-2,209-218,279-283`（現況 `Status: PROPOSED`；`/platform/trust-fabric/localization/` 與 `/platform/trust-fabric/accessibility/` 提案內容、`/config/*` 併入 `/infra/config-as-code` 的判定，2026-08-30 直接 Read 核對）

## Diff

### Original

`L3338-3352` 逐字：

````text
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
````

### Proposed

````text
    compliance/
        obligations.yaml
        controls.yaml
        sector-packs.yaml
        market-entry.yaml

    localization/          # v1 歷史快照，現行正本見下方說明
        locale.yaml
        currencies.yaml
        timezones.yaml
        units.yaml
        accessibility.yaml
```

**Localization 目錄正本化**（ADR-009 Sub-decision (b)，2026-08-29 ACCEPTED）：上方 `localization:` 區塊（5 個扁平檔案）為 v1 歷史快照，不再是程式碼層唯一依據。程式碼層現行正本見 `docs/architecture/REPOSITORY_ARCHITECTURE.md` 的 `/platform/trust-fabric/localization/{locale, language, currency, timezone, calendar, units, address, formatting}/`（8 個子目錄，目錄制非扁平檔案）；`accessibility` 已移為 `/platform/trust-fabric/accessibility/` 同層兄弟，不再是 localization 子項（概念錯置已修正：無障礙的驗收標準與負責團隊與語言/地區在地化不同）。

---
````

### Reason

比照 §80（`035` 提案）採用的同一種「路徑移出母規格、母文件只留一句話指標」模式（ADR-006(b) 已定案），把 §81 `localization:` 區塊從「唯一敘事」降級為「v1 歷史快照 + 指向現行正本」，同時修正 `accessibility` 錯置於 localization 底下的概念問題。不刪除既有 5 檔案清單本身，僅新增行內標註與段後說明，滿足 ADR-009「保留區塊本身作為 v1 歷史快照不刪除」的明文要求（ADR-009:175）。
