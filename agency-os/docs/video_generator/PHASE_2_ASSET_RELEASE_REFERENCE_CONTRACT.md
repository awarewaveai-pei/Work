# Phase 2 — 素材、引用與 Release 資料契約

**狀態：設計基線；尚未建立 migration、未部署、未寫入資料。**
**日期：2026-09-06**

## 已確認的現況

`media_assets` 已是唯一素材資料真相：UUID `id`、`organization_id`、storage/object/version/checksum 與來源欄位都已存在，見 `D:\Worktrees\media-video-phase0\lobster-factory\packages\db\migrations\0011_ops_console_control_plane.sql:35-54`。其 canonical shape 的相容性修復記錄在 `0038_media_assets_reconcile.sql:1-108`。

現有 `video_jobs` 不是 Release ledger。它是 service-role-only、約一小時 TTL 的進度表，migration 自己明確把 R2 與 `media_assets` 稱為 durable artifacts，見 `0047_video_jobs.sql:1-48`。目前 job 的 owner 是 `organization_id`，由 `0060_video_jobs_add_org.sql:1-65` 補上。

因此不得新建第二個「asset」表，也不得讓 Timeline 用 object URL 作真相；Timeline 已使用 `media_assets.id` UUID，但尚未有資料庫層的 source reference、version pin、delete protection、Release 或 delivery linkage。

## 目標不變量

1. 每一個 Timeline、字幕、剪輯計畫、QA 報告、Release 與發布紀錄引用的媒體，都能回溯到既有 `media_assets.id`、版本、雜湊與組織。
2. 有有效引用的素材不可 hard-delete；刪除必須被拒絕並回傳引用 ID。使用者要求移除時只能先 tombstone/withdraw，再依 retention policy 做實體刪除。
3. 一個 Release 是不可變的交付快照；WordPress/Postiz 都只引用 Release 產物，不能直接引用可變 draft 或 renderer job。
4. `video_jobs` 只管理 renderer attempt；Release 與 asset lineage 不依賴它的 TTL。
5. 跨組織的 asset ID 即使被猜到，也必須在 service boundary 與未來 RLS proof 一起被拒絕。

## 擬新增的 additive schema

| 表 | 主責 | 關鍵欄位 | 不可做的事 |
|---|---|---|---|
| `media_timeline_versions` | immutable Timeline document | `id`, `organization_id`, `timeline_id`, `version`, `schema_version`, `document_json`, `document_sha256`, `validation_state`, `created_at` | 不覆寫已驗證版本；不用 URL 取代 asset reference。 |
| `media_transcript_versions` | immutable machine or reviewed transcript | `id`, `organization_id`, `source_asset_id → media_assets.id RESTRICT`, `transcript_id`, `revision`, `state`, `document_json`, `document_sha256`, `parent_transcript_version_id`, `created_at` | 不覆寫原始 Whisper 結果；不可把暫存 job directory 當唯一紀錄。 |
| `media_caption_renditions` | re-creatable approved SRT/VTT/ASS artifact linkage | `id`, `organization_id`, `transcript_version_id`, `asset_id → media_assets.id RESTRICT`, `format`, `output_profile`, `checksum_sha256`, `generator_version`, `created_at` | 不把任一字幕檔當唯一真相；未批准 transcript 不可建立 Release 字幕。 |
| `media_qa_reports` | immutable technical/caption/editorial/rights evidence | `id`, `organization_id`, `candidate_asset_id → media_assets.id RESTRICT`, `qa_kind`, `capability_version`, `profile_version`, `status`, `report_json`, `report_sha256`, `supersedes_report_id`, `created_at` | 不以 boolean 取代 evidence；不可讓新的 asset version 沿用舊 report。 |
| `media_story_bible_versions` | immutable short-drama continuity document | `id`, `organization_id`, `series_id`, `episode_id`, `revision`, `state`, `document_json`, `document_sha256`, `parent_version_id`, `created_at` | 不覆寫角色錨點或用 URL / prompt 取代 asset identity。 |
| `media_edit_plan_versions` | immutable real-footage edit decision plan | `id`, `organization_id`, `edit_plan_id`, `revision`, `state`, `document_json`, `document_sha256`, `parent_version_id`, `created_at` | 不讓未驗證 source range 或可變 proxy 成為交付真相。 |
| `media_asset_references` | protect referenced `media_assets` | `id`, `organization_id`, `asset_id → media_assets.id RESTRICT`, `referrer_type`, `referrer_id`, `purpose`, `created_at` | 不允許無 owner、無 referrer 或跨 org reference。 |
| `media_releases` | immutable approved delivery snapshot | `id`, `organization_id`, `timeline_version_id`, `status`, `approved_by`, `approved_at`, `supersedes_release_id`, `created_at` | 不以 renderer job ID 當 Release；不可改寫已發布內容。 |
| `media_release_artifacts` | Release 的成片／字幕／封面 pin | `release_id → media_releases RESTRICT`, `asset_id → media_assets RESTRICT`, `role`, `checksum_sha256`, `created_at` | 不以 URL 做 primary relation；同一 role 的唯一性要由 constraint 保護。 |
| `media_delivery_attempts` | WordPress/Postiz external linkage | `release_id`, `channel`, `external_id`, `state`, `idempotency_key`, `attempted_at`, `error_code` | 不直接從 draft 發布；重試不可生成第二個外部貼文。 |

這些表全為 append/additive。`media_assets` 不改名、不搬資料、不刪欄位；既有 VideoStudio 在 feature flag 未啟用前維持原路徑。

## 版本與刪除規則

1. 新 Timeline revision 插入後，在同一 transaction 以 `media_asset_references` pin 所有 document 內的 asset UUID；asset 與 Timeline 的 `organization_id` 必須相同。
2. 轉錄或人工校對建立新的 `media_transcript_versions` revision；approved transcript 產生的 caption rendition 以 asset UUID、checksum 與 generator version pin 回其 transcript version。
3. 產生 Release 時，再將成片、approved 字幕、封面等產物 pin 到 `media_release_artifacts`；Release artifact 不可藉由修改 Timeline 或 transcript 移除。
4. delete API 先查 `media_asset_references`、`media_caption_renditions` 與 `media_release_artifacts`。任何命中都回傳 `409`，含可授權查看的 reference IDs；無命中才可進入 retention/tombstone workflow。
5. 回滾 Release 只把 delivery 的 active pointer 指回 `supersedes_release_id`；不刪既有成片、字幕或貼文證據。

## Migration 與驗收順序

1. 在受控 staging 做 schema inventory、owner/RLS 檢查、backup restore proof，確認 migration runner 是 `supabase_admin`；`0060_video_jobs_add_org.sql:31-39` 已證實 owner 不是 `postgres`。
2. 以 lock timeout 的 additive migration 建立十表、FK、check/unique/index 與 service-role policy；先不接任何 route。
3. 對 staging 跑 `BEGIN/ROLLBACK` rehearsal、query plan、兩組 tenant negative tests、referenced delete `409` test、release rollback test。
4. 實作 repository ports、Timeline resolver、durable executor 的 artifact finalization；只有上述通過後才能讓 Timeline 預檢轉為 render submission。
5. staging soak 與 restore test 全通過後，才提出 production deployment package；production migration 是 High-risk gate，另行核准。

## rollback

每一張新表可先保持 orphaned/read-only，不切換任何既有 route。若 staging 發現問題，停用新 feature flag、保留舊 `media_assets` 與 `video_jobs` 行為，並以 migration-specific down/recovery runbook 處理尚未被引用的新資料；絕不以刪掉現有 `media_assets` 作回滾。
