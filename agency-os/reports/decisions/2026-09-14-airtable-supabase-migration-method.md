# 決策：Art Therapy Library 的 Airtable → Supabase 遷移方法

**日期：** 2026-09-14  
**模式：** implementation + architecture review（直接決策，非 /decide 面板）  
**信心值：** 0.86 — 方案由官方 API／Supabase／PostgreSQL 文件及本案已知失敗模式交叉驗證；仍需以實際 Airtable 權限與附件規模做一次小型驗證。  
**範圍：** Art Therapy Library；上次盤點為 60 張 Airtable 表、中文欄位大量、曾發生欄位與資料缺失；Supabase application schema 已清空。

## TL;DR（30 秒快讀）

**建議：** 採用「自建、可重跑、可驗證的 deterministic ETL」，而不是一鍵匯入、Wrapper-only、n8n 或 AI 自動 mapping。

**正確架構：** 先讀 master plan 與 Airtable API 完整資料 → 外部不可變 raw JSON snapshot → deterministic mapping → Supabase relational canonical tables → 差異驗證。

**核心決定：** 原始 JSON 要立即完整保存；但 JSON 只作為 immutable source/landing，不作為網站與研究的正式資料模型。

**Pre-mortem 主要風險：** 不是 API 失敗，而是把「API 回傳沒有該欄位」誤判為「來源欄位不存在」；Airtable API 會省略空值欄位，因此必須用 metadata API 加上統計驗證。

**切換條件：** 若未來只需要單向、無語義轉換的定期複製，才考慮 Airbyte 等 replication 工具；本次一次性高完整性遷移不符合這個條件。

## 背景與問題定義

這不是單純的 CSV 搬運。來源同時包含中文 authoring、英文資料、linked records、lookup、rollup、formula、附件與不同語義層級的欄位。上次失敗的根因是過早建立目標表、以顯示名稱猜 mapping、把來源資料與 canonical model 混在一起，造成看似有資料但內容與欄位不完整。

Airtable Web API 每次最多回傳 100 筆，超過時必須使用 offset 逐頁讀取；API 也有每個 base 每秒 5 requests 的速率限制。更重要的是，API 回傳會省略空值欄位，所以「JSON 中沒有 key」不能直接解釋為「Airtable 沒有這個欄位」。[^1]

## 候選方案

### C1：自建 deterministic ETL（首選）

建立一個有明確版本、checkpoint、重試、checksum、mapping registry 與驗證報告的遷移程式。它先完整讀取 Airtable metadata 與 records，再把原始 payload 保存到 raw archive／landing，最後依人工核准的 mapping 轉成 relational canonical model。

### C2：Supabase Airtable Wrapper + SQL

Supabase Wrapper 可把 Airtable 查詢成 Postgres foreign table，但官方明確列為 read-only，且不支援 query pushdown；資料仍在 Airtable，不是已經保存到 Supabase。它適合作為比對或低頻查詢，不適合作為本次完整快照與一次性遷移的唯一引擎。[^2]

### C3：Airbyte／通用 replication connector

適合把資料按排程複製到目的地，降低自建 transport 的工作量。但 connector 解決的是搬運與同步，不會替這個 base 判斷中文欄位的語義、canonical entity、localization、lookup／formula 的正確去向。若使用 C3，也只能作 transport layer，mapping 與驗證仍需自建。

### C4：n8n／低程式碼 workflow

適合小量流程、通知、人工審批與後續增量 webhook。把 60 表、分頁、速率限制、重跑、FK 順序、逐欄完整性都塞進 workflow，會讓邏輯難測、難回滾、難審查；不適合當本次核心 migration engine。

### C5：CSV／Dashboard／直接 Supabase API 匯入

適合簡單、已經完成 schema 的資料載入，不適合未知語義的來源。Supabase 官方列出 CSV、pgloader、COPY 與 API 等匯入選項，但這些是 transport/load mechanism，不是 Airtable semantic migration system。[^3]

## 建議

### 首選：C1 自建 deterministic ETL + raw landing + relational canonical

這是唯一同時滿足「資料先完整保存」與「正式資料模型不被 Airtable UI 結構綁死」的方案。

第一層是 immutable source archive：保存 Airtable metadata、raw record payload、display value、field ID、record ID、linked IDs、附件 metadata、snapshot manifest 與 checksum。這份 raw archive 放在 Supabase 以外的受保護版本化位置，不在 audit 階段建立 Supabase raw landing、mirror table 或臨時 view；如此不會把尚未核准的來源結構誤變成 application schema。

第三層才是 canonical relational model。只有經過 mapping review 的資料才進入正式 entities、localizations、junctions 與 publication/read models。PostgreSQL 文件也指出 JSON 與 relational 可以共存；JSON 適合結構仍在變動的文件，但文件結構應可預期，且整個 JSON row 更新會取得整列 row lock，因此不應把可獨立維護的核心關係永久塞進一個大 JSON 文件。[^4]

### 為何不選其他方案

| 候選 | 不選原因 | 何時可選 |
|---|---|---|
| C2 Wrapper-only | 唯讀、資料不在 Supabase、不能產生完整 immutable snapshot；還有查詢與欄位型別限制 | 只需即時查詢 Airtable，或做 migration 前後比對 |
| C3 Airbyte | 解決 transport，不解決本案最危險的語義 mapping 與完整性驗證 | 已有穩定 schema，需求變成無語義轉換的定期同步 |
| C4 n8n | 流程可視化但不適合承擔大量 field-level deterministic transformation 與可重現測試 | 作為通知、審批、webhook 或低量增量觸發 |
| C5 CSV／直接 API load | 容易丟失 field ID、linked record 語義、formula／lookup provenance；無法自動判斷目的模型 | mapping 已核准且只是最後的 bulk load |

## 權衡矩陣

分數 1–10；分數越高越好。資料完整性、可回復性與語義正確性為本案最高權重。

| 維度 | C1 ETL | C2 Wrapper | C3 Airbyte | C4 n8n | C5 直匯 | 權重 |
|---|---:|---:|---:|---:|---:|---:|
| 原始資料完整保存 | 10 | 4 | 7 | 6 | 5 | ★★★ |
| 欄位語義 mapping | 10 | 2 | 3 | 4 | 2 | ★★★ |
| linked／formula 可驗證性 | 9 | 4 | 5 | 5 | 3 | ★★★ |
| 可重跑與 checkpoint | 9 | 3 | 8 | 5 | 3 | ★★ |
| 回滾與 forensic trace | 10 | 3 | 7 | 4 | 3 | ★★★ |
| 初始建置速度 | 6 | 7 | 8 | 8 | 9 | ★ |
| 長期維運複雜度 | 7 | 8 | 7 | 5 | 8 | ★★ |
| 鎖定風險 | 9 | 6 | 6 | 5 | 9 | ★★ |
| **加權判定** | **首選** | 不足 | 次選 | 不足 | 不足 | |

## 具體實作藍圖

### P1：只讀取來源並保存 raw

先讀取並解析 master plan，建立本次執行的規則、範圍、禁止事項與 acceptance criteria；再使用 Airtable metadata API 取得全部 table／field definitions，對每一張表用 table ID 分頁抓 records。每頁都寫入外部 snapshot 並記錄 request、offset、page number、record count；遇到 429 依官方限制退避，不以部分成功當成功。空值欄位的判讀以 metadata 與實際統計為準，不能只看 record JSON。[^1]

raw record 的最小 envelope：

```json
{
  "snapshot_id": "generated-at-runtime",
  "base_id": "app...",
  "table_id": "tbl...",
  "record_id": "rec...",
  "fields_by_id": {},
  "retrieved_at": "timestamp",
  "source_payload_sha256": "..."
}
```

附件必須另行下載到版本化 archive 或保存可驗證的 attachment metadata；不能只保存會過期的 URL 而宣稱附件完成。

### P2：雙來源完整性驗證

在任何 mapping 前，同時對照兩份輸入：master plan 定義「應如何建模與驗收」，Airtable snapshot 定義「實際存在什麼資料」。產出 source report：每張表 fields 數、records 數、每欄非空數、record ID 唯一性、頁面數、API errors、附件數、checksum，以及每個 plan-required entity／relationship 是否有來源證據。報告必須能回答「Airtable 有什麼、plan 要求什麼、兩者差在哪裡」，而不是只回答「程式成功跑完」。

### P3：mapping contract

mapping 由 field ID 指向 target，不由顯示名稱直接指向 target。每一欄指定：來源、目的、轉換、是否保留 raw、是否建立 relationship、是否為 computed definition、驗證 SQL、決策者與版本。AI 只能產生候選與找異常，不能自行批准語義。

### P4：先在本機／隔離環境重跑

Schema DDL、mapping code 與 validation code 先在本機 Postgres／Supabase branch 執行。Supabase 官方建議 schema 變更由 migrations 管理，避免直接改 remote database 導致 migration history drift。[^5]

### P5：dry-run 與 approval

dry-run 不寫正式 canonical tables，輸出逐表、逐欄、逐筆、逐關聯差異。任何未映射非空欄位、record ID 對不上、FK 失敗、附件 checksum 失敗或 source／target 筆數異常都阻擋。

### P6：正式寫入

先 backup，再用版本化 migration 建 schema，最後在可觀測 transaction／批次中寫 entities、localizations、relationships 與 provenance。完成後只以驗證報告判斷成功，不以 Dashboard 看起來有幾列判斷成功。

## Pre-mortem 分析

### 18 個月後的失敗情境

平台表面上已經上線，但使用者發現部分中文欄位空白、lookup 值和 Airtable 不一致、附件連結失效，研究者無法重建當初的資料版本。團隊回頭看時，raw archive 只有最後一次簡化匯出，沒有 field metadata、empty-field profile、attachment checksum 或每次 mapping 版本。

### 根本原因

團隊把「匯入程式成功完成」當作「來源資料已完整保存」，沒有把 source completeness 當成硬性 gate。

### 早期預警信號

- API records 的欄位數低於 metadata 定義，但沒有人解釋空值欄位省略問題。
- source snapshot 沒有 per-field non-empty profile。
- mapping report 只有欄位名稱，沒有 field ID。
- dry-run 只比較 table row count，沒有比較非空欄位與 linked IDs。

### 緩解

把 metadata completeness、field-level non-empty count、record-level provenance、attachment checksum 與 mapping version 設為必過 gate；任一缺失都停止正式寫入。

## 風險登記冊

| 風險 | 可能性 | 嚴重性 | 緩解 |
|---|---|---|---|
| API 省略空值造成誤判 | high | critical | metadata + field profile + explicit empty semantics |
| 分頁／429 導致部分資料 | med | critical | offset checkpoint、5 req/sec throttle、page manifest、重跑 |
| 同名欄位覆蓋 | high | critical | 全程使用 field ID；保留 name 僅作顯示 |
| formula／lookup 被當成原始欄位 | high | high | 保存 definition、source dependencies、display result 三者 |
| linked record 轉換失敗 | med | critical | source record map、FK preflight、失敗即阻擋 |
| 附件 URL 過期 | med | high | 下載或受控 archive + checksum，不只保存 URL |
| mapping AI 自動猜錯 | high | critical | AI 僅候選；人工 approval；未決定欄位 hard fail |
| remote schema drift | med | high | local migration、branch reset、CI／migration status |

## 可觀測性與驗收

### 必須達到

- source table completeness：100% metadata tables 有 snapshot
- source record completeness：每個 record ID 恰好出現一次，除非來源本身重複並有報告
- field completeness：所有 metadata fields 有非空統計與決策狀態
- mapping completeness：所有非空 field 有 approved target 或 approved exception
- relationship completeness：所有 linked IDs 可解析或列入阻擋報告
- content equality：raw source 與 canonical transform 的逐欄比對通過
- recovery：從 source snapshot 重跑可得到相同 mapping／結果 checksum

### 回滾條件

任何一項 completeness 低於 100%、出現未批准 exception、source checksum 改變、FK error、附件驗證失敗或 migration history drift，立即停止並回到上一個已驗證版本。

## 決策複審

- P1 完成後：複核實際 table／field／record／attachment 統計。
- P2 完成後：複核 source completeness，不討論 canonical schema。
- P3 完成後：複核 mapping 與 ERD，再決定是否建立 V2 schema。
- 第一次正式寫入後 7 天：抽樣重跑與資料差異檢查。
- 正式上線後 30／90 天：檢查內容缺漏、查詢、編輯、發布與 restore drill。

## 最終結論

本案最好的方法不是找一個「自動把 Airtable 變成 Supabase」的按鈕，而是：**每次執行先同時讀取 master plan 與 Airtable；用 Airtable API 做完整、可驗證的 source capture；用外部 raw JSON 保護所有原始內容；用 deterministic、版本化 mapping 產生正式 relational Supabase model；用硬性差異驗證阻止任何不完整寫入。**

這個方案的額外程式工作比直匯多，但它直接針對本案曾發生的錯誤：欄位覆蓋、中文內容遺失、關係失真、formula／lookup 混淆與無法追溯。這些風險不是換一個 AI model 或 connector 就會消失。

## Sources

[^1]: Airtable Help Center, [Getting started with Airtable's Web API](https://support.airtable.com/articles/6292134965-getting-started-with-airtable-s-web-api). Pagination、100 records/page、5 requests/sec、空值欄位省略。
[^2]: Supabase, [Airtable Wrapper](https://supabase.com/docs/guides/database/extensions/wrappers/airtable). Read-only、foreign table、型別映射、無 query pushdown 與限制。
[^3]: Supabase, [Import data into Supabase](https://supabase.com/docs/guides/database/import-data). CSV、pgloader、COPY、API 等 load methods 與 production import 注意事項。
[^4]: PostgreSQL, [JSON Types](https://www.postgresql.org/docs/17/datatype-json.html). JSON／relational 共存、結構可預期、整列 row lock 與 JSONB 使用取捨。
[^5]: Supabase, [Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations). Remote schema 應由 migration 管理，避免 migration history drift。
