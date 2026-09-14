# 決策：Airtable 一次性完整移轉至 Supabase

**日期：** 2026-09-14  
**狀態：** 執行規格
**首選：** Airtable API + deterministic ETL + 外部 raw snapshot + Supabase relational canonical model

## Context

- Airtable 之後停用；不做長期雙向同步。
- 來源有 60 張表、中文欄位、linked records、lookup、rollup、formula、附件。
- 最高優先：不遺失資料、不錯置語義、可重跑、可驗證、可回滾。

## Decision

```text
MASTER_PLAN + AIRTABLE_LIVE
        ↓
Airtable API full extract
        ↓
External immutable JSON/JSONL snapshot
        ↓
Audit + approved mapping
        ↓
Local staging/test
        ↓
Supabase migrations + canonical write
        ↓
Field/record/relation validation
        ↓
Airtable freeze + retire
```

## Use

- Airtable API：唯一 extraction source。
- 外部 JSON/JSONL：完整 raw source、重跑與稽核證據。
- Local staging：轉換、測試、dry-run。
- Supabase：只保存核准的正式 relational model。
- AI：只分析當前 scope，產生 mapping／SQL 候選；不決定語義、不決定 schema、不批准寫入。

## Do not use

本次不使用或建立：

- Airtable Wrapper foreign tables
- raw landing／mirror／grid／alias／temporary views
- Whalesync、n8n、Zapier、Airbyte、雙向 sync、Webhook
- CSV 直匯
- AI 自動建表或自動批准 mapping

上述工具只作研究比較，不是執行依賴。

## Source extract contract

每張 Airtable table 必須保存：

- `table_id`、table name
- `field_id`、field name、type、options
- `record_id`
- raw value、display value
- linked record IDs
- formula／lookup／rollup definition 與 result
- attachment metadata；附件需下載保存
- page／offset、error、timestamp、checksum

Airtable API 每頁最多 100 records；必須處理 offset、429、retry 與 page manifest。空值欄位可能不出現在 record JSON，不能據此判定欄位不存在。[^1]

## Mapping contract

每個 field 狀態只能是：

`canonical_field | localization | relationship | computed_definition | source_archive_only | approved_exception`

每個非空 field 必須有：

- source `field_id`
- target 或 archive-only 決策
- transform rule
- relationship rule
- validation rule
- approval／mapping version

AI context 只包含當前 scope 的必要 metadata、dependency、最小樣本；完整 snapshot 不進 prompt。未使用資料不進 canonical tables。

## Lookup／formula／rollup

1. 保存原始 definition 與 result 到外部 snapshot。
2. 找出底層 linked record 與 target field。
3. one-to-many → FK；many-to-many → junction。
4. lookup → JOIN／derived read model。
5. rollup → SQL aggregate／materialized result（依核准需求）。
6. formula → SQL expression 或 archive-only（逐欄決定）。
7. 底層 link 不完整或語義不明 → FAIL，不能猜、不能丟。
8. Airtable result 與 Supabase result 逐筆比較。

## Gates

### G1 — Extract PASS

60/60 tables、metadata、records、attachments、checksums 完整；Supabase application write = 0。

### G2 — Mapping PASS

所有非空 fields 有 target 或 approved exception；ERD、dependency、轉換規則完成。

### G3 — Dry-run PASS

逐表、逐欄、逐筆、逐關聯差異為 0 個未解釋問題。

### G4 — Cutover PASS

backup、migration、write、validation、restore 全 PASS，才 freeze／停用 Airtable。

## Hard fail

- source page／record 遺失
- field ID 被 name 取代
- 未映射非空 field
- 未批准 exception
- FK／linked record 失敗
- lookup／formula／rollup 無決策
- 附件遺失
- checksum／筆數異常
- migration history drift

## Why not alternatives

| 方案 | 結論 |
|---|---|
| Wrapper | 唯讀；資料仍在 Airtable，不適合一次性移轉。[^2] |
| Whalesync | 適合持續 table sync，不適合本次 canonical remodelling。[^3] |
| Connex pattern | 採用 stable ID、unique、UPSERT、cursor、retry；不採用其持續 sync 目標。[^4] |
| AT Migrator | 可作 sandbox baseline；供應商宣稱必須由本案 validator 驗證。[^5] |
| n8n | 可作 workflow 參考；不作 migration engine。[^6] |
| CSV／直接 API load | 只作最後已核准模型的 load，不作 mapping。[^7] |

## Acceptance

- source snapshot 可完整重建來源。
- canonical target 每個欄位都有來源證據。
- 每個 record、linked ID、附件可追溯。
- 中文與英文內容不互相覆蓋。
- source／mapping／canonical／audit 可互相追溯。
- 可從同一 snapshot 重跑並得到相同結果。
- RLS、API、read model、restore 全部 PASS。

## Sources

[^1]: [Airtable Web API](https://support.airtable.com/articles/6292134965-getting-started-with-airtable-s-web-api)
[^2]: [Supabase Airtable Wrapper](https://supabase.com/docs/guides/database/extensions/wrappers/airtable)
[^3]: [Whalesync: Airtable and Supabase](https://www.whalesync.com/blog/how-to-connect-airtable-and-supabase)
[^4]: [Connex: Airtable to Supabase migration plan](https://connex.digital/blog/airtable-to-supabase-sync-new-rows-updates-backfill-a-practical-migration-plan/)
[^5]: [AT Migrator](https://www.atmigrator.com/)
[^6]: [n8n Airtable to Postgres workflow](https://n8n.io/workflows/4772-automated-airtable-to-postgres-migration-with-n8n/)
[^7]: [Supabase import data](https://supabase.com/docs/guides/database/import-data)
