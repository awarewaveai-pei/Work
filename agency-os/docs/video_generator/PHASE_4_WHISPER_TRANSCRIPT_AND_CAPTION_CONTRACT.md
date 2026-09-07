# Phase 4 — Whisper 逐字稿、字幕與審片契約

**狀態：設計基線；尚未建立 migration、未接入 VideoStudio、未部署、未轉錄任何影片。**
**日期：2026-09-06**

## 已確認的現況

本機既有的 Whisper worker 是會議服務，不是 VideoStudio 的字幕來源。它以 `faster-whisper` 轉錄，固定傳入 `word_timestamps=True`，並保留每段的 `id`、`start`、`end`、`text`、`avg_logprob` 與 `no_speech_prob`，見 `D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core\apps\meeting-service\lib\transcribe.py:127-171`。同一 worker 已可輸出 SRT，見 `transcribe.py:174-181`。

會議 pipeline 將原始 transcript JSON、SRT、合併文字與 hallucination 統計各自寫到 job directory，見 `D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core\apps\meeting-service\pipeline.py:124-143`。這證明本機能力存在，卻沒有提供多租戶素材歸屬、不可變版本、人工字幕修訂或影片 Release linkage。

現有影片服務沒有呼叫 Whisper。它把旁白按字數切分、按字數比例分配顯示秒數，再以 ffmpeg `drawtext` 燒入影片，見 `D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core\apps\video-service\pipeline.py:303-412`。因此它的字幕不是語音辨識時間碼，也不能當作實拍影片或輸出影片的審片證據。

Phase 2 已指定 `media_assets.id` 為唯一素材真相，並規劃以 immutable Timeline、Release 與 asset reference pin 建立交付鏈，見 `PHASE_2_ASSET_RELEASE_REFERENCE_CONTRACT.md:7-42`。本契約必須建立在那個資料邊界上；不得另建平行素材真相或以 job directory 當長期紀錄。

## 目標不變量

1. 每份逐字稿都明確指向同組織、特定版本與雜湊的音訊或影片 `media_assets.id`；不可只指向可變 URL 或暫存檔。
2. Whisper 原始結果不可被人工校對覆寫。校對後字幕是新 revision，保留 editor、理由與完整差異。
3. 每個可交付字幕格式（SRT、VTT、ASS）都可再生，並可追溯至 approved transcript revision、輸出 profile 與 renderer 版本。
4. 低信心、無聲機率、語言辨識、幻覺檢查、時序與字幕可讀性都產生可審核訊號；未通過硬閘的結果不可進入 Release。
5. 轉錄、校對、字幕衍生、QA、renderer 與發布都走 durable lifecycle；Next.js request、會議 job directory 和 renderer request 不得充當 durable ledger。
6. 每次讀取與 mutation 都先檢查 organization ownership；外部 ID、URL、Caption cue ID 都不具跨租戶授權意義。

## Transcript v1 資料契約

### 不可變來源版本

未來 additive schema 以 `media_transcript_versions` 保存原始或已批准的逐字稿版本；它不是第二個 asset table。建議欄位如下：

| 欄位 | 規則 |
|---|---|
| `id` | UUID，逐字稿版本主鍵。 |
| `organization_id` | 必須等於來源 `media_assets.organization_id`，並由 FK / repository ownership proof 驗證。 |
| `source_asset_id` | `media_assets.id` UUID；來源必須有可讀音軌及被 pin 的 checksum/version。 |
| `transcript_revision` | 同一 logical transcript 單調遞增，不覆寫既有 revision。 |
| `state` | `machine_generated`、`needs_review`、`approved`、`superseded`、`withdrawn`；只有 `approved` 可派生 Release 字幕。 |
| `engine` | capability ID、實作版本、model、backend、模型語言、設定雜湊；例如未來 `media.transcribe_local`，但未登錄 ACTIVE 前不可執行。 |
| `source_duration_ms` | 由可讀來源 preflight 確認的整數毫秒，不能由前端自行宣告。 |
| `document_json` / `document_sha256` | canonical transcript document 和雜湊，作為 immutable integrity proof。 |
| `parent_transcript_version_id` | 人工校對或重新辨識的父版本；原始機器結果不被覆寫。 |
| `created_by` / `approved_by` / timestamps | 說明人或系統身分與狀態轉換時間。 |

canonical document 的 segment 必含：

```json
{
  "schemaVersion": "1.0.0",
  "transcriptId": "tr_<UUID>",
  "organizationId": "<media_assets organization UUID>",
  "sourceAssetId": "<media_assets.id UUID>",
  "sourceDurationMs": 123456,
  "language": { "code": "zh", "probability": 0.98 },
  "segments": [
    {
      "id": "seg_000001",
      "startMs": 120,
      "endMs": 2380,
      "text": "已校對的文字",
      "recognition": { "avgLogprob": -0.12, "noSpeechProb": 0.01 },
      "reviewState": "approved"
    }
  ]
}
```

`seg_*` 是 **該 transcript revision 內** 的穩定 opaque ID，不能被誤當成 `media_assets.id`、資料庫 UUID 或跨 revision 相同文字的全域身份。它讓 Timeline caption track 能清楚引用已批准 transcript 的 segment，而 source media、transcript version 和 Release artifact 仍使用 UUID FK。

### 校對與字幕衍生

人工改字、拆／合 cue、改時間碼或標示說話者時，建立 child transcript version 或 caption revision；不可更新 machine-generated JSON。每次 revision 都記錄 `editor_id`、reason code、parent ID、document hash 與 review result。

`media_caption_renditions` 是未來可重建的 derived artifact relation，至少包含 `transcript_version_id`、`format`（`srt`/`vtt`/`ass`）、`output_profile`、style version、asset UUID、checksum 與 generator capability/version。SRT/VTT/ASS 不得是唯一真相；source transcript 是真相，rendition 是可替換產物。

## 驗證與 QA 閘

| 類型 | 硬閘／訊號 | 失敗處置 |
|---|---|---|
| 來源 | 來源 asset 在同組織、可讀、有音軌、duration/checksum/version 可證明 | 拒絕 job；不呼叫 Whisper。 |
| 結構 | `0 <= startMs < endMs <= sourceDurationMs`、segment ID 唯一、時序單調；任何重疊必須有明確標記與 policy | `failed_structure`，不可生成字幕。 |
| 可信度 | 低 `avgLogprob`、高 `noSpeechProb`、低 language probability 與 hallucination signal 都標成 review finding | `needs_review`；不可自動批准。 |
| 字幕 | cue 時長、每行字數、閱讀速度、safe-area、斷行與輸出比例依 profile 規範驗證 | 產生 finding；須由規則或人工修正。 |
| 音畫同步 | 用已批准 transcript 的 timestamps 對出片音軌作 duration、首尾、漂移與缺段檢查 | 失敗時阻擋 Release。 |
| 編輯審片 | 人工核對角色名、專有名詞、敏感內容、品牌語氣、劇情連續性與可讀性 | 人工 approval 是 Release 的必要條件。 |

數值閾值（例如最低 confidence、最大 reading speed、safe-area）不寫死於前端或 Whisper adapter。它們須作為有版本的 QA profile，在 tenant / product policy 下受治理，並把實際 profile ID 與結果 pin 到 QA report。這避免不同語言、短劇、教學和實拍素材被同一個未校準門檻錯誤拒絕。

## 安全接線順序

1. 先完成 Phase 2 的 additive schema、RLS / ownership proof、asset reference pin、Release 與安全刪除測試；production migration 仍是獨立 High-risk gate。
2. 建立 `media.transcribe_local` 的 capability contract、ACTIVE registry record、版本、healthcheck、resource limit、retry taxonomy 與 rollback entry；catalog resolver 必須 fail-closed。
3. 把會議服務的 `transcribe()` / `write_srt()` 包在 worker adapter；可重用經驗，不複製 Whisper 邏輯，也不得從 Next route 直接執行 GPU 工作。
4. durable job claim 後由 worker 以 tenant-scoped source asset rendition 進行 preflight、轉錄、原始 transcript artifact finalization、QA 與 human-review task 建立。
5. approval 後才產生 SRT/VTT/ASS rendition，並讓 Timeline / Remotion / ffmpeg adapter 讀取 approved、pinned caption artifact；現有 `drawtext` 比例切分不得被假稱為 Whisper 字幕。
6. 以 staging 的短片、長片、無音軌、低音量、混合語言、人工更正與中斷重試案例驗證，再提出 production 接線與 canary package。

## 刻意未做的事

本文件沒有改動 `apps/video-service/pipeline.py`、會議服務、VideoStudio UI、Timeline validator、資料庫、R2、Remotion、WordPress、Postiz 或生產環境。沒有宣稱目前影片可自動產生 Whisper 字幕，也沒有以 SRT 檔案輸出取代 Release / QA 審核。


## rollback

在 Phase 2 migration 前，此設計沒有 runtime side effect。之後每一個 feature flag 預設關閉：停用 `media.transcribe_local` 只停止新 job，既有 VideoStudio 出片維持原行為；已建立的 transcript / caption artifact / QA report 保留作稽核證據，Release active pointer 只可回到前一個 approved release，不刪除已交付產物。
