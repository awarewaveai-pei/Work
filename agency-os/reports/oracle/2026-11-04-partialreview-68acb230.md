# codex-oracle review -- 2026-11-04 11:00:22 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/warm-leads.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/warm-leads.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/fake-warm-db.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 3 on captureWarmLead FluentCRM skip. Invariant: a capture (key = Meta source_url 'meta:leadgen/<id>', else consent source like 'meta_lead_ad_csv:<form>') is applied to FluentCRM at most once on success; it is recorded on the fluentcrm_synced timeline event metadata.capture and the skip queries that (PostgREST JSON path eq metadata->>capture), not consent_source (which KEEP_STATUS leads never update). A failed tag top-up on an already-synced lead keeps fluentcrm_sync_status synced. Verify only this; return no findings if none are real.
- exit: 0 | elapsed: 100674ms | answer: 2025B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/fake-warm-db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/warm-leads.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/warm-leads.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `source_url` 相同就跳過，會把「聯絡人已同步」誤判成「這次 capture 的表單標籤已同步」
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/warm-leads.ts:128
  confidence  -> CONFIRMED
  scenario    -> webhook 首次建立名單但 FluentCRM 同步失敗；人工同步路徑隨後將 `fluentcrm_sync_status` 設為 `synced`，其事件未記錄 `metadata.capture`（app/api/outreach/leads/sync-fluentcrm/route.ts:78-80）。同一 webhook 重送時，`source_url` 相同使此處直接跳過，表單標籤始終未補上。
  why missed  -> `source_url` 證明名單來源，不能證明該次 FluentCRM 同步成功；新增條件把兩者視為同一件事。

FINDING 2: 成功事件寫入失敗仍回報成功，CSV 重匯時會再次套用同一 capture
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/warm-leads.ts:152
  confidence  -> CONFIRMED
  scenario    -> FluentCRM upsert 與名單狀態更新成功，但時間軸 insert 回傳資料庫錯誤；`timeline()` 只記錄錯誤（warm-leads.ts:68-70），函式仍回報 `synced`。同一 CSV 再次匯入時查不到 `metadata.capture`，再次呼叫 FluentCRM。
  why missed  -> 既有時間軸寫入容許失敗；這次改動卻開始依賴該事件作為唯一的 CSV 去重紀錄。

FINDING 3: 表單名稱暫時讀取失敗後，成功 capture 會永久略過該表單標籤
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/meta-leads.ts:39
  confidence  -> CONFIRMED
  scenario    -> Graph 表單名稱請求逾時，`formName()` 回傳 `null`（meta-leads.ts:40-51）；capture 只同步來源標籤，仍記錄成功事件。之後表單名稱可讀時，相同 webhook 由 `warm-leads.ts:128` 跳過，缺少的表單標籤不會補上。
  why missed  -> 上游把表單名稱讀取失敗視為可忽略，但新去重規則將這次不完整的標籤同步視為已完成。

TOTAL: 3 findings
