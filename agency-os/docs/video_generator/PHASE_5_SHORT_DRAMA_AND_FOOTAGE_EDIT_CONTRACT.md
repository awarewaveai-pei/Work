# Phase 5 — 短劇 Bible 與實拍剪輯計畫契約

**狀態：設計基線；尚未建立 migration、未接入 UI、未生成短劇或剪輯實拍素材。**
**日期：2026-09-06**

## 已確認的現況

既有 VideoStudio draft scene 只帶旁白、image prompt 與 visual strategy，沒有角色 Bible、分集狀態、鏡頭製作包或可編輯實拍 decision list，見 `CURRENT_BASELINE_AND_GAP_AUDIT.md:67-68`。Timeline v1 現在只在隔離 branch 提供結構預檢，不會產生 renderer request，見 `PHASE_3A_TIMELINE_V1_CONTRACT_RECEIPT.md:7-31`。

所以短劇與實拍不能各自發明 renderer payload 或直接交付；兩者必須成為可版本化的前製文件，再透過已驗證的 Timeline、QA、Release 和 delivery path 匯合。

## 目標不變量

1. 角色、地點、道具、聲線、服裝與風格參考使用 tenant-scoped `media_assets.id` UUID；不把 prompt、公開 URL 或模型輸出當身份真相。
2. 每個分集只有明確、可追溯的 state delta；新的 episode 不可暗中改寫先前 approved Bible。
3. 實拍 edit decision plan（EDP）只引用合法 source asset 的可證明時間範圍；切點、音訊、字幕與輸出 profile 都能被重現和驗證。
4. Story Bible 和 EDP 都不等於 Timeline、render job 或 Release。它們可以產生候選 Timeline，但必須經 Timeline validator、QA 與 approval。
5. 導演模型只提出候選資料；它不能自動解鎖角色 reference、花費 provider 額度、覆寫人工 approval 或直接發布。

## Additive 資料契約

Phase 2 的資料設計新增兩張 versioned document table；它們不複製 `media_assets`，所有 reference 都由 UUID FK / `media_asset_references` pin：

| 表 | 主責 | 關鍵欄位 | 不可做的事 |
|---|---|---|---|
| `media_story_bible_versions` | immutable series / episode continuity document | `id`, `organization_id`, `series_id`, `episode_id`, `revision`, `state`, `document_json`, `document_sha256`, `parent_version_id`, `created_at` | 不覆寫已批准角色錨點；不以 prompt / URL 代替素材 identity。 |
| `media_edit_plan_versions` | immutable real-footage EDP document | `id`, `organization_id`, `edit_plan_id`, `revision`, `state`, `document_json`, `document_sha256`, `parent_version_id`, `created_at` | 不引用未授權 asset 或超出 source duration 的 range；不把剪輯計畫直接當成成片。 |

### Story Bible v1 的最小內容

```text
series identity and organization
characters: stable character ID, role, approved reference-asset UUIDs, voice/style anchors
locations / props: stable ID, approved reference-asset UUIDs, rights notes
continuity: approved current state, episode state delta, prohibitions and unresolved threads
episode package: premise, target duration/profile, hook, beat list, shot requirements, approval state
provenance: planner capability/version, source artifact UUIDs, human approvals
```

角色 ID 是 production-document identity，不是 AI 圖的 object key，也不是人名文字。新 reference image、服裝或聲線改動建立新 Bible version，並在受影響的 episode package 中顯式標示 continuity review。

### Edit Decision Plan v1 的最小內容

```text
project identity and organization
sources: media_assets UUID, source checksum/version, proxy mapping and source duration
tracks: video/audio/caption/music with ordered decisions
decision: source asset UUID, inMs, outMs, destination startMs, transform, transition, gain, note
captions: approved transcript/caption rendition UUID and cue mapping
output: target profiles, frame rate, safe-area/style profile
provenance: editor / capability version, source artifact UUIDs, review approvals
```

每筆 source range 都必須滿足 `0 <= inMs < outMs <= sourceDurationMs`，同輸出 track 不可重疊，且 destination timing 必須 frame-aligned。這些是未來 EDP validator 的結構硬閘；asset ownership、rights、proxy integrity 和 source duration 由 Phase 2 repository resolver 驗證。

## Capability 邊界

| Capability | 輸入 | 輸出 | 不得做 |
|---|---|---|---|
| `media.story_bible_plan` | subject / series brief + authorized references | candidate Bible version | 不可建立 Release 或寫入先前 approved state。 |
| `media.story_bible_validate` | Bible version | structural / continuity findings | 不可自行接受角色變更。 |
| `media.edit_plan_create` | authorized footage / transcript / brief | candidate EDP version | 不可碰未授權來源或呼叫 renderer。 |
| `media.edit_plan_validate` | EDP version | source-range / timing / profile findings | 不可把 timeline-valid 視為 rights-valid。 |
| `media.timeline_plan` | approved Bible 或 EDP | candidate Timeline v1 | 不可跳過 Timeline / QA / Release gate。 |

這些 ID 只在 capability catalog 有 matching ACTIVE record、version、healthcheck、test 和 rollback entry 後才可執行；目前它們都只是規劃名稱。

## 安全接線順序

1. 完成 Phase 2 document tables、asset reference pin、ownership/RLS proof、delete protection 與 backup/restore rehearsal。
2. 建立 Bible / EDP pure schema validator，加入正向、跨組織 reference、超界 range、overlap、角色 state conflict 及 unknown-field fixtures。
3. 在 isolated staging 建立 review UI：差異檢視、asset provenance、caption mapping、human approval 和 explicit Timeline submit；不提供「直接 render」按鈕。
4. 將 approved Bible / EDP 轉成 Timeline v1，沿用 Phase 3 structural preflight，並在 artifact resolver、durable job、QA 和 Release 已完成後才送 renderer。
5. 以短劇多集 continuity、實拍多機素材、重剪、角色 reference 替換和撤回 Release 的 golden projects 跑 staging soak。

## rollback

兩個 production-mode capability 都預設關閉。停用時只禁止新的 candidate / Timeline submission；既有 Bible、EDP、Timeline、QA 和 Release evidence 保留可讀。既有 Quick Engine、手動 Remotion 和現行素材庫完全不依賴它們。
