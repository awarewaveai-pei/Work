# HCI-30 C6 + 蒐集器管線：Task 1（決策類任務）裁決

> **Mode: 直接決策，非 /decide 面板**（`fullstack-engineer`/架構師身分主筆，無多代理辯論 transcript；理由：使用者本輪明確要求由主 agent 決策而非委外面板，且四項裁決皆有既有 ADR/契約可直接引用，非需要多方拉鋸的開放式權衡）。
>
> 2026-09-17。操作者本輪明確全權授權（"需要決定的事都你決定"），非 STOP 類任務不再逐項確認；本檔即是該授權下的裁決記錄，供未來稽核與 Task 2+ 執行者引用。讀者是接手的 agent，不是敘事讀者。
> 對應 [`HCI_C6_REAL_LOGIN_PLAN.md`](../../../Projects/internal/hci30/docs/HCI_C6_REAL_LOGIN_PLAN.md) Task 1、[`HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md`](../../../Projects/internal/hci30/docs/HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md) Task 0/Task 1。

## 裁決 1（C6-1A）：跨子網域身分傳遞

**選定**：短效、單次可兌換的簽章 handoff token。Portal 於 `requireClientOrg()` 驗證通過後核發（`lib/tenant-guard.ts:146-154`），HCI 端兌換後自建 session，不共用 cookie。

| 方案 | 淘汰理由 |
|---|---|
| 共享 session store（跨庫共讀） | 違反 `HCI_TENANT_ORGANIZATION_ADAPTER_CONTRACT.md:21`「不得互查對方 DB」；兩側資料庫本非同一顆（HCI 獨立 `postgres:15.8`） |
| Cookie domain 設為 `.aware-wave.com` | 爆炸半徑過大——任何未來子網域（含被入侵的）都能讀/偽造該 cookie；且會動到 portal 自身登入的 cookie 格式，波及與本次無關的既有系統 |

**選中理由**：與 ADR-0009 契約「簽章/版本化的 API/event adapter」精神一致；單次+短效使 R1（session 劫持）blast radius 降到最低；可撤銷（撤 Task 5 簽章金鑰即讓所有既發 handoff 失效）。

## 裁決 2（C6-1B）：Tenant/Role provisioning 模型

**選定**：延伸既有 per-tenant `NOLOGIN` Postgres role 模型（`0001_wave1_synthetic_up.sql:278-291`），runtime `CREATE ROLE` 於 idempotent provisioning transaction 內執行，`hci.current_tenant_id()` 定義不變。

| 方案 | 淘汰理由 |
|---|---|
| 推翻 CLOSED 機制，改 `SET LOCAL app.tenant_id` + RLS 判斷式 | 需要新 ADR 正式推翻 `API_CONTRACT_STANDARD.md:15-17` 的 CLOSED 決議；牽動每一張表的既有 RLS policy 與全部既有負向測試——爆炸半徑違反最小化原則，且屬於「破壞性 migration」類 High-risk STOP，不會因為換了模型就繞過 |

**選中理由**：零重工——不動既有 migrations 0001-0019、不用重跑既有負向測試；相容既定 CLOSED 契約。R2（角色數量成長）以「只在真實 provisioning 時建立，不預先批量分配」+ Task 10 監控角色數量緩解，不靠切換架構解決。R7（grant chain 遺漏）要求 Task 3 驗收條件必須含完整 grant chain 真跑通過測試。

**下一步**：Task 2（db-expert 審查具體 DDL）現在解除阻塞。**注意**：Task 2 本身只做設計審查（`HCI_C6_REAL_LOGIN_PLAN.md` 明訂「不執行任何 DDL」），實際 migration 檔案與 provisioning endpoint 屬於 Task 3——Task 3 是身分/RLS 邊界的實質異動，即使本輪操作者已全權授權，仍是 AGENTS.md §3 明訂的 High-risk STOP，執行前需操作者對「這一項」單獨再次確認。

## 裁決 3（Collector-Task0）：真人資料紅線覆核

**簽核**：本管線全程僅限組織實體，任何自然人研究對象一律排除——**維持既有 ADR-011 §決策10 的既定範圍，非新判斷**。操作者本輪的全權授權涵蓋「照既定範圍繼續建置」，**不涵蓋**「擴大到自然人」——後者需要獨立的合法依據（lawful basis/consent）審查與新 ADR，任何任務不得繞過本條逕自新增 person-linked seed/person_id 欄位/自然人查詢入口。

## 裁決 4（Collector-Task1）：REJECTED 保存期限

**選定**：REJECTED 僅標記 `admission_state`，資料 retain-forever，不建新抹除機制。列為已知系統性債務，與現有同類已接受債務並列追蹤（`ADR-0026` gate 3 `DSR-CLAIM-DELETE-01`、`ADR-0018` gate 5 `hci.record_erasure()`——皆因「Source/SourceSnapshot 零抹除機制」BLOCKED）。

| 方案 | 淘汰理由 |
|---|---|
| 新建 Source/SourceSnapshot 專屬抹除原語（新 ADR + migration） | 範圍蔓延——這是獨立於「讓蒐集管線動起來」的另一個專案；且會產生「REJECTED 可刪、ACCEPTED/ACTIVE 不可刪」的不一致特例，比照既有系統債務一併追蹤才是一致的做法，不是為單一 feature 開後門 |

**選中理由**：不變量是「Source/SourceSnapshot 目前系統性不可抹除」——這件事在 REJECTED 之外的狀態也成立且已被接受為已知債務，套用同一不變量比造一個只管 REJECTED 的特例更誠實、更零重工。觸發重新評估條件：客戶合約要求刪除、法規變更，或未來 Wave 4 `hci.record_erasure()` 落地時一併收斂。已寫入 `agency-os/TASKS.md`。

**下一步**：Task 2（`hci.sources`/`source_snapshots` migration）解除阻塞，非身分/RLS 邊界異動（既有 per-tenant RLS policy 沿用不變），本輪可直接執行不需另外 STOP 確認。
