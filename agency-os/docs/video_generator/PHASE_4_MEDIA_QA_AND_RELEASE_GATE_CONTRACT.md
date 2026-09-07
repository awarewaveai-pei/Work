# Phase 4 — 媒體 QA 與 Release Gate 契約

**狀態：設計基線；尚未建立 migration、未執行媒體分析、未阻擋既有出片或發布。**
**日期：2026-09-06**

## 已確認的現況

既有 Quick Engine status path 完成後會記錄 `media_assets`，見 `D:\Work\agency-os\docs\video_generator\CURRENT_BASELINE_AND_GAP_AUDIT.md:14-20,31-36`；它沒有 candidate、QA report、approved Release 或 delivery receipt 的資料模型。現有 WordPress route 直接把 HTTPS 影片 URL 寫進文章，Postiz route 回傳外部結果但不寫 durable delivery-attempt record，見同一盤點 `:33-36`。

目前影片服務可用 ffmpeg 產生輸出，但其字幕是依文字比例的 `drawtext`，不是已核對的語音時間碼，見 `PHASE_4_WHISPER_TRANSCRIPT_AND_CAPTION_CONTRACT.md:8-14`。所以不能從「renderer 回成功」推論黑畫面、靜音、音量、字幕同步、品牌、角色一致性或交付權利已通過。

Phase 2 已設計 immutable Release、artifact pin 與 external delivery receipt，但仍未實作，見 `PHASE_2_ASSET_RELEASE_REFERENCE_CONTRACT.md:22-50`。QA report 必須成為 Release 前的 evidence，不可由 WordPress、Postiz 或 renderer response 代替。

## 目標不變量

1. 每份 QA report 都指向同組織、特定 `media_assets.id`、版本與 checksum；任何後續素材替換都必須重新 QA。
2. 檢測器輸出是可稽核證據：包括 capability/version、rule profile、輸入雜湊、量測值、取樣策略、finding、時間碼與結論；不能只保存 `pass` 布林值。
3. Technical QA、editorial QA、rights review 與 release decision 是不同的可組裝能力；任何一個可替換，卻共享同一份 pinned candidate 與 Release gate。
4. `fail` 會阻擋 Release。`warn` 只有在有角色、理由、範圍、到期日與稽核記錄的 waiver 下才可通過；waiver 不是把 detector 靜音。
5. QA worker 只讀已授權的 artifact rendition；不接受前端 URL、不向 renderer 注入資料庫憑證，也不從 Postiz / WordPress 回推品質結論。

## Additive 資料契約

Phase 2 必須新增第八張表 `media_qa_reports`，並仍不改名或搬移 `media_assets`：

| 欄位 | 規則 |
|---|---|
| `id` / `organization_id` | UUID；組織必須與 candidate asset、Timeline / transcript / Release 一致。 |
| `candidate_asset_id` | `media_assets.id` FK (`RESTRICT`)；附 input version 與 checksum snapshot。 |
| `qa_kind` | `technical`、`caption`、`editorial`、`rights`；不同 kind 不可互相覆寫。 |
| `capability_id` / `capability_version` | 例如未來 `media.qa_technical`；僅 resolver 確認 ACTIVE 的 capability 可執行。 |
| `profile_id` / `profile_version` | 量測規則和閾值的不可變版本；按語言、輸出比例、產品 policy 選擇。 |
| `status` | `queued`、`running`、`passed`、`warned`、`failed`、`superseded`、`withdrawn`；terminal evidence 不可改寫。 |
| `report_json` / `report_sha256` | canonical findings、量測值、取樣窗口、人工結論與 evidence reference。 |
| `supersedes_report_id` / timestamps | 新 QA 取代舊 candidate 或規則版本時保留完整 lineage。 |

`media_releases` 建立時必須 pin 它要求的 QA report IDs 或其 canonical hash。`media_release_artifacts` 只可引用已通過對應 QA profile 的候選成片、字幕與封面；candidate 被重新轉檔、重新燒字或改 metadata 後，舊 report 失效且不得沿用。

## QA profile 與證據

### Technical QA

`media.qa_technical` 以讀取 pinned local/R2 rendition 的 worker 執行。每一條規則有穩定 rule ID、severity、檢測器版本、profile 版本、時間碼與可重跑 evidence；最少涵蓋：

| 規則群組 | 必要證據 | Gate 行為 |
|---|---|---|
| container / codec | stream 類型、codec、duration、dimensions、fps、pixel format、檔案大小 | 無音軌、非法輸出 profile 或 probe 失敗為 `fail`。 |
| duration / sync | render duration、音軌 duration、首尾空白、A/V drift、缺段 | 超過 profile 容忍值為 `fail` 或 `warn`，由規則明定。 |
| audio | silence windows、integrated loudness、true peak、clipping、channel layout | 量測值與 profile 閾值一併保存；不可只輸出「音量正常」。 |
| visual | sample frame timestamps、black-frame ratio、freeze-frame sequence、色彩／解析度／安全區 | 可重現的取樣策略與命中 frame 必須可查看。 |
| caption | approved transcript / rendition ID、cue range、reading speed、行數、safe-area、source segment reference | 缺 approved caption 或時序不符為 `fail`。 |
| integrity | asset checksum、probe command version、detector capability/profile version | 任一版本或 checksum 不相符，舊 report 不可被當成通過。 |

### Editorial 與權利 QA

`media.qa_editorial` 不是讓模型直接發布的判斷器。它產生可分配的 review task，包含 candidate version、Timeline、Script / Story Bible（若存在）、字幕、品牌 profile、rights metadata、finding 及 reviewer decision。它至少核對：敘事與 CTA、品牌與敏感內容、角色／場景連續性、字幕可讀性、素材授權、肖像／音樂／商標以及目的地政策。只有可追溯的人或受授權 policy engine 可以批准或提出 waiver。

## Release gate 狀態機

```text
candidate_created
  → technical_qa_required → technical_passed
  → caption_qa_required   → caption_passed
  → editorial_qa_required → editorial_approved
  → rights_qa_required    → rights_approved
  → release_approved → delivery_draft → delivered

任一 required QA failed → release_blocked
warned → waiver_pending → QA passed | release_blocked
candidate checksum/profile changed → candidate_created
```

Release creation service 必須先在 transaction / repository boundary 驗證「每個 required kind 都有同 candidate checksum、同 policy profile 的 passed report」，再產生 immutable Release。任何 report、waiver 或 asset 改動都不能讓既有已發布 Release 的 evidence 消失。

## 安全接線與驗收順序

1. 在 Phase 2 staging migration rehearsal 補 `media_qa_reports`、FK、tenant proof、referenced delete `409` 與 rollback/restore evidence；production migration 是獨立 High-risk gate。
2. 以合法、可拋棄的 fixture media 建立 technical-QA golden corpus：正常檔、無音軌、黑畫面、靜音、卡幀、錯誤比例、字幕超界、字幕過快與 checksum 變更。
3. 實作純 report schema / rule-profile validator，接著才建 worker adapter；worker 不可從 Next request 同步執行長時 ffmpeg / GPU 工作。
4. 先以 report-only mode 對 staging candidate 比對人工判斷，校準 profile；在 false-positive/false-negative 有證據前不升級成 hard gate。
5. 啟用 hard gate 前，測試 candidate 重轉、worker 重啟、report duplicate、waiver 到期、Release rollback、WordPress/Postiz draft/withdrawal 的完整串接。

## rollback

QA capability feature flag 預設關閉。report-only 問題時停止新的 QA worker / rule profile，保留既有 report 作稽核；尚未發布的 Release 可回到 `release_blocked` 或前一 approved candidate。不得為了回滾刪除 asset、QA report、waiver 或 delivery evidence。
