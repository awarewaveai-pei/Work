---
proposal_id: "011"
slug: "cas-path-tenant-scoped-mp"
status: APPROVED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L2570-2584"]
related_open_questions: []
change_class: "semantic correction"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: null
---

## PROPOSED_CHANGE

Master Plan §58「Immutable-first」的 Content-addressed path grammar，從全域路徑 `/objects/sha256/aa/bb/<hash>` 改為 Tenant-scoped 路徑 `/objects/<tenant_id>/sha256/aa/bb/<hash>`（預設規則），並補一句說明僅限明確核准的內容類別可落入 `_global` 例外池。

## RATIONALE

`docs/adr/ADR-003-tenant-model-and-cas-isolation.md`（ACCEPTED 2026-08-29）Context 段 P1-CONFLICT-2（L10-13）逐字驗證：Master Plan §58（L2580, L2582-2584）寫死「所有檔案 Content-addressed」且路徑 `/objects/sha256/aa/bb/<hash>` 全程沒有 `tenant_id`/`project_id` 區段，同一份文件 §1.5（L268-274）卻宣稱 Tenant Isolation 是最外層爆炸半徑邊界——「一個實體上把所有 tenant 的 bytes 合併儲存的儲存層，不可能同時是平台最根本的安全邊界」（ADR-003 原文）。ADR 額外指出一個未被處理的 CAS side-channel：「instant upload」（內容已存在則秒傳）會洩漏「某個其他 tenant 已持有相同內容」這個事實給上傳者（同 2011 年消費雲端儲存 dedup-timing 揭露事故同一類別）。

Sub-decision (b)（L57-85 完整選項比較表）評估四個選項後，Recommendation item (b)（L103）裁決：「Adopt **Option A（tenant-scoped CAS namespace）as the default rule**, with **Option C's narrow, explicitly-enumerated global pool** as the only sanctioned exception. Reject Option B outright... Reject Status Quo: it is the conflict.」本提案是這個裁決在 §58 的具體文字落地，屬於「semantic correction」——原文字本身（全域路徑）與同文件另一段（§1.5 Tenant Isolation 主張）語意衝突，修正對象是既有錯誤/不完整的既有文字，不是填補一個此前完全空白的欄位。

Tenant-scoped 路徑的精確 grammar（`aa`/`bb` shard 推導規則、`_global` sentinel 語法）已由 Phase 3 編譯為機讀正本 `specs/artifact/cas-path.schema.yaml`；本提案母文件文字只需與該 schema 的預設形式（`/objects/<tenant_id>/sha256/<shard_1>/<shard_2>/<hash>`）保持字面一致，不重複定義驗證規則本身。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`

## AFFECTED_SECTIONS

§58 Immutable-first（L2570-2584）

## DEPENDENCIES

- 依賴 `specs/artifact/cas-path.schema.yaml` 已存在（已建，ADR-003 Sub-decision (b) Option A + Option C 例外池的機讀編譯正本，含 `tenant_segment`/`cas_path`/`global_pool_promotion` 完整驗證規則）——本提案只更新母文件的敘事級路徑範例，不重複貼出完整 pattern/regex，讀者查精確驗證規則請見該檔。
- 與 `010-tenant-domain-model-object-mp` 同源自 ADR-003（分別是 Sub-decision (a) 與 (b) 的落地），但修改的行區間不重疊（L330-357 vs L2570-2584），可各自獨立套用，無強制同批次要求；建議一併審閱以避免母文件在 `<tenant_id>` 這個詞出現在 §58、但 §3 Domain Model 清單尚未收錄 Tenant 物件的短暫敘事不一致窗口。
- 與 `012-blast-radius-chain-reconciliation-mp` 無直接依賴（分屬 Sub-decision (b) 與 (c)）。

## COMPATIBILITY

不影響任何既有 schema、policy 或 recipe 檔案——`specs/artifact/cas-path.schema.yaml` 是獨立建成的機讀正本，其 `verification.note` 明載「No mother document or ADR was modified to produce this file」，即該 schema 從一開始就是以「MP §58 全域路徑已被 SUPERSEDED」為前提設計（見該檔 `source_of_truth_for` 第一行標注 `SUPERSEDED`）。Phase 3 尚無任何程式碼消費 §58 這段敘事文字本身（實際驗證邏輯掛在 schema 檔案），本提案純粹是讓母文件敘事追上已經編譯完成的機讀正本，不引入新的執行行為。

## MIGRATION

`Edit` 工具精確字串替換；套用後重新計算 Master Plan sha256 並更新 `.ai/research/phase-0/document-hashes.yaml`。

## ROLLBACK

`git revert` 對應 commit 即可完整還原成全域路徑原文。Phase 3 尚無程式碼直接解析 §58 這段文字（實際驗證邏輯在 `specs/artifact/cas-path.schema.yaml`，不因母文件敘事回滾而改變），回滾零下游風險。

## EVIDENCE

- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md:10-13`（P1-CONFLICT-2 Context，全域路徑 vs Tenant Isolation 衝突的完整論證，含 CAS side-channel）
- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md:57-85`（Sub-decision (b) 四選項完整比較表）
- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md:81`（Sensitivity point：Option B 為何被淘汰）
- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md:103`（Recommendation item (b)，裁決 Option A 為預設規則 + Option C 為唯一例外）
- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md:117`（Migration / Rollback pre-launch gate，兩個 real-test 要求）
- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md:122`（Evidence 段對 MP §58 L2570-2584 的行號引用）
- `specs/artifact/cas-path.schema.yaml:9-20`（該檔 description 逐字重述 P1-CONFLICT-2 並標注 MP §58 為 SUPERSEDED）
- `specs/artifact/cas-path.schema.yaml:130-145`（`cas_path.path` 的預設形式與 pattern，本提案母文件範例逐字對齊此形狀）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:2570-2584`（本次任務實讀，確認現況為全域路徑，無 tenant 區段）

## Diff

### Original

Master Plan §58（L2570-2584，逐字）：

````text
# 58. Immutable-first

原始資料不得直接覆蓋。

```text
Version 1
Version 2
Version 3
```

所有檔案 Content-addressed。

```text
/objects/sha256/aa/bb/<hash>
```
````

### Proposed

````text
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
````

### Reason

把全域 CAS 路徑改為 Tenant-scoped 預設 + 窄範圍全域例外池，是 `ADR-003` Sub-decision (b) 已批准的 Recommendation item (b)（Option A 為預設、Option C 為唯一例外、Option B 與 Status Quo 皆已否決）的逐字落地，不是本提案的新裁決。母文件只保留敘事級路徑範例，精確驗證規則指向已建成的 `specs/artifact/cas-path.schema.yaml`，避免兩處各自維護一份可能漂移的 grammar。
