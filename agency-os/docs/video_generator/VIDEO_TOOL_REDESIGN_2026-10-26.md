# 影片工具重新設計 — 2026-10-26

狀態：**設計草案，待操作者看過**。問題清單＝[`VIDEO_TOOL_OPERATOR_FINDINGS_2026-10-26.md`](VIDEO_TOOL_OPERATOR_FINDINGS_2026-10-26.md)；本檔＝怎麼改。前案 [`VIDEO_WORKBENCH_UX_RECONCILIATION_AUDIT_2026-09-10.md`](VIDEO_WORKBENCH_UX_RECONCILIATION_AUDIT_2026-09-10.md) 的「Required IA」與驗收閘照收，本檔把它落到操作者 2026-10-26 的三種自動化程度。
路徑縮寫：`NA/` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`，`DB/` = `lobster-factory/packages/db/`。

## 0. 決策

| # | 決策 | 理由一句 |
|---|---|---|
| D1 | **一支影片＝一個專案**，用既有 `media_production_projects`（`DB/migrations/0071_media_production_projects.sql`，prod 已有表、`NA/app/api/video/projects/route.ts` 已有 GET/POST/PATCH、零呼叫者）。客戶、腳本、模式、自動化程度、比例、成片、Release 全掛在專案上；網址 `/tools/video?project=<id>` | 客戶只選一次、關頁不丟、各步不再各自選租戶；表已存在＝不新造 |
| D2 | **三種自動化程度＝專案的一個欄位** `autonomy`：`guided`（每步參與）／`auto_after_render`（④ 之後自動）／`full_auto`（題目頁批量） | 操作者 2026-10-26 定義的三級 |
| D3 | **全自動不另建**：就是既有題目頁 `/tools/content/topics`（formats 勾 🎬）＋排程管線（AUTO_CONTENT P6／P7 已上線：`NA/lib/content/video/start.ts`、`finalize.ts`）。唯一新增：管線開影片時同時建專案列，讓手動與自動的影片在同一個清單看得到 | 零重工；`AUTO_CONTENT_EXECUTION_PLAN.md` I3／I4 已定一個時鐘、一個 finalize |
| D4 | **頁面分工**：`/tools/script-forge`＝寫（24 模組，唯一一份）；`/tools/video`＝做（專案）。影片頁第 1 步不再內嵌 24 模組，改「腳本從哪來」：腳本頁送來／腳本歷史／題目或文章／去腳本頁寫 | 兩頁不重複；寫跟做是兩種工作 |
| D5 | **使用者看到 5 步**：① 腳本 → ② 設定與費用 → ③ 生成與修圖 → ④ 審片（字幕＋QA 同一頁）→ ⑤ 發布。Timeline 驗證、營運不再是步驟：Timeline 進「進階證據」；成效進專案頁的分頁，有資料才顯示 | 現在 10 步裡 3 步是空殼或假步驟（⑤ 自動放行、⑦ 永遠 503、⑩ 0 筆） |
| D6 | **一個比例＝一個成片**（一列 `media_assets`、各自 checksum）；QA、Release、交付都以「成片」為單位；平台自動對比例：9:16→Reels／TikTok／Shorts，4:5→IG／FB 動態，16:9→YouTube／網站 | 現在兩比例都有做出來，但下游只認 16:9（findings M9） |
| D7 | **權利在取得素材當下記錄，不事後補**：AI 生圖＝自產（記模型與供應商）、Pexels＝Pexels License＋原始網址、使用者上傳＝上傳時勾「我有權使用」。版權 QA 讀這些紀錄 | 版權 QA 現在結構上不可能通過；也不能為了通過而假標 cleared（偵測器閉嘴＝最惡樣態） |
| D8 | **編輯 QA 讀專案的腳本**（渲染時腳本寫進成片 metadata） | 現在成片沒存腳本 → 永遠「缺腳本」 |
| D9 | **Remotion 不是模式，是加購的「片頭／廣告卡」**：專案裡多一個成片類型（6–22 秒） | 現在它跟快速影片搶同一個「模式」位置，但做的是不同東西 |
| D10 | **發布一律先成草稿**（紅線：WordPress／社群外部寫入 draft-first）；直接上線只在該網站 `publishMode=ai_review_auto` 且審查通過（AUTO_CONTENT D1／I5 同一條規則） | 不新增第二套發布規則 |

## 1. 三種自動化程度

| 程度 | 誰用 | ③ 生成之後 | 人在哪裡介入 |
|---|---|---|---|
| 每步參與 `guided` | 重要影片、客戶要審 | 停在每一步：修圖 → 審片（看字幕、改字幕、看 QA 原因）→ 選平台與文案 → 建草稿 | 每一步都有可編輯畫面（§3） |
| ④ 後自動 `auto_after_render` | 一般影片 | 渲染完自動：產字幕 → 跑 QA → 全過就建 Release → 依比例建各平台草稿 | ③ 修完圖按「生成並自動完成」；**任何一項沒過就停在那一步並通知**，不硬推 |
| 全自動 `full_auto` | 批量固定發 | 題目頁核准 → 排程管線自己寫腳本、做影片、嵌文章、建社群草稿／發布 | 題目頁核准；失敗的題目在題目頁重試 |

選擇位置：③ 生成頁底部兩顆鍵「生成，我要逐步審」「生成並自動完成」；專案預設值跟著客戶的網站設定。

## 2. 專案（資料）

- 沿用 `media_production_projects` 欄位：`organization_id`、`title`、`production_mode`、`lifecycle_stage`、`brief_json`、`active_story_bible_revision_id`、`active_candidate_asset_id`、`active_release_id`。
- 要加（一支 migration）：`autonomy`（D2）、`source`（`manual`｜`script_forge`｜`content_topic`）＋`source_ref`、`formats text[]`、`last_error text`；`brief_json` 存腳本全文（版本化：重新生成腳本＝新版本，舊版保留可切回）。
- `media_assets` 加 `media_project_id`（FK `media_production_projects`）。**不用**既有 `media_assets.project_id`：它 FK 到舊的 `projects` 表（`DB/migrations/0038_media_assets_reconcile.sql:29`，prod 101 列 0 列有值）。`active_candidate_asset_id` 改成「每比例一列」→ 用 `media_assets where media_project_id=… and is_current` 查。
- prod 那 4 列舊資料是 smoke 殘留（`VIDEO_TOOL_IA_REORG_2026-09-10.md` D4），migration 時封存為 `archived`。

## 3. 每一步「可編輯」的內容

| 步驟 | 畫面上能改什麼 |
|---|---|
| ① 腳本 | 每場的畫面描述、台詞、字幕；場景增刪排序；主平台版／各平台版並存，選一個當「這支影片用的版本」（findings M2、M3：平台規則讀 `NA/lib/social/limits.ts`） |
| ② 設定與費用 | 比例（多選）、素材來源、配音、風格、加購片頭卡；即時費用；不需再選客戶 |
| ③ 生成與修圖 | 每場：重新生成（每個比例都換、保證不同張）、上傳自己的、改這場的圖片描述再生；配音試聽；按「生成…」（§1） |
| ④ 審片 | 每個比例一個播放器；字幕逐句可改（改完重燒）；QA 四項：狀態、原因（中文）、怎麼修（例：缺授權→哪一場、按哪裡補） |
| ⑤ 發布 | 勾平台（只列已連上的頻道，來自社群產品）、每平台文案（AI 依平台規則寫、可改）、自動帶對的比例；WordPress 選網站與文章（清單，不填 ID）；建草稿或排程 |

## 4. 結果頁

- `/tools/video/projects`：全部影片（手動＋題目頁自動），依客戶篩選；每列：縮圖、標題、比例、狀態（生成中／待審／已建草稿／已發布／失敗）、來源、花費。取代進階頁的「生成記錄」。
- `/tools/video/projects/<id>`：每比例播放器＋下載、腳本版本、QA 結果、Release 與發到哪裡（連結）、成效（有資料才顯示）、費用明細；「繼續編輯」回到專案停的那一步。
- 生成中可以關頁：狀態在專案列上，回來從清單點進去就接著看。

## 5. 先決條件（不做這些，④ 後自動做不起來）

1. QA 四項要能真的通過：黑畫面誤報（已修、2026-10-26 已部署）、D7 權利紀錄、D8 腳本入成片、字幕來源（§6 D11）。
2. 一比例一成片（D6），QA／Release 逐成片。
3. Release 的社群草稿改走社群產品（`TASKS.md` 社群 V1 條目、AUTO_CONTENT P6.3 尚存的 `ReleaseDeliveryPanel.tsx:89` 舊路徑）。

## 6. 已決定

- **D11 字幕來源由「聲音是誰產生的」決定，不讓人選**（操作者 2026-10-26 同意「快速影片和短劇用腳本法，實拍才用 Whisper」）：
  - 走 video-service `/render`（快速影片、短劇；聲音＝我們用腳本台詞配音）→ 字幕＝腳本台詞＋配音時間點，渲染時一起產 SRT／VTT 與字幕 QA。
  - 走 `/footage-render`（實拍；聲音＝上傳素材裡的真人錄音，`apps/video-service/server.py:396-440` 無配音）→ Whisper。
  - 渲染時把 `captionSource: "script_tts" | "transcription"` 寫進成片 metadata；⑦ 讀它決定做法，不靠模式名稱猜。
- **配音時間點（2026-10-26 在正式 video-service 容器實測）**：
  - Edge（預設、免費；`NA/app/(shell)/tools/video/VideoStudio.tsx` `VOICE_MODELS` 前 4 項）：edge-tts 7.3.1 `Communicate(boundary=…)` 回傳每句（`SentenceBoundary`，例：第 1 句 0.10s 起、長 4.60s）與每詞（`WordBoundary`）時間；套件內建 `SubMaker.feed/get_srt`。現行 `pipeline.py:237-238` 用 `.save()` 把時間點丟掉，改成 `stream()` 收時間點即可。
  - OpenAI（付費選項）：openai 3.31.0 `audio.speech.create` 參數只有 input/model/voice/instructions/response_format/speed/stream_format，**不回時間點**。維持現行「每場長度準、場內按字數分配」（`pipeline.py:351-366`）；要更準需另呼叫轉錄 API（`transcriptions.create` 有 `timestamp_granularities`，按分鐘計費），不預設做。

## 7. 卡片

`V/`＝`NA/app/(shell)/tools/video/`。行號＝2026-10-26 main。每卡完成條件：卡上驗收＋`npx tsc --noEmit`（next-admin）綠；High 卡套 prod 前停。

### V1 專案骨架（依賴：無）
| 卡 | 檔案 | 做什麼 | 驗收 |
|---|---|---|---|
| V1.1 | `DB/migrations/<下一空號>_media_projects_v2.sql`＋`.down.sql` | §2 新欄（check 約束：autonomy∈guided/auto_after_render/full_auto 預設 guided；source∈manual/script_forge/content_topic 預設 manual）；`media_assets.media_project_id`＋索引；4 列 smoke 封存 `archived`。High：套 prod 前停 | `DB/tests/test_<號>_media_projects_v2.py`：up 後欄位與約束在、down 還原 |
| V1.2 | `NA/app/api/video/projects/route.ts:16-65` | GET 加 `?id=`（含該專案 assets）；POST／PATCH 收 autonomy／source／sourceRef／formats／brief；org 閘照舊（`:20`、`:59`） | `route.test.ts`：跨租戶 id 403；壞 autonomy 400 |
| V1.3 | `V/ScriptForge.tsx:492-493`、`NA/app/(shell)/tools/script-forge/ScriptForgePage.tsx:9-20`、刪 `V/script-handoff.ts` | 兩顆送影片鍵併一顆「送去做影片」：POST 專案（org＝`SF_BRAND_ORG`，source script_forge，brief 帶腳本）→ `/tools/video?project=<id>`；沒載入客戶＝顯示提示（同 `:59`）；刪 sessionStorage 交接 | `ScriptForgePage.render.test.tsx` 改：一顆鍵、無客戶時停用 |
| V1.4 | `V/VideoPipeline.tsx:31-200` | 讀 `?project=`；5 步（D5）；org 只來自專案：刪 `:129` 選單，`ReleaseDeliveryPanel.tsx:99`、`FootageEditor.tsx:96`、`ScriptForge.tsx:819` 收 org prop；第 1 步改「腳本從哪來」（專案腳本／腳本歷史／連 `/tools/script-forge`），刪 `:117-121` 內嵌；無專案＝建專案表單（客戶＋標題）；換步 PATCH `lifecycle_stage` | 瀏覽器：送出→不問客戶；重整頁面停在同一步 |
| V1.5 | `NA/app/api/video/render-draft/route.ts:174-200`、`NA/app/api/video/draft/route.ts`、`NA/lib/content/video/finalize.ts:80-95`、`NA/lib/content/blocks/video-pipeline.ts:148-235` | `recordParams.projectId` → `recordVideoAsset` 寫 `media_project_id`（只寫該 org 的專案） | `finalize.test.ts` 加一條：有 projectId → upsert 帶 media_project_id |

### V2 結果頁（依賴：V1）
| 卡 | 檔案 | 做什麼 | 驗收 |
|---|---|---|---|
| V2.1 | 新 `NA/app/(shell)/tools/video/projects/page.tsx`；`NA/app/sidebar-sections.ts` | 專案清單（§4）；側欄加入口 | 瀏覽器：清單看得到剛做的專案 |
| V2.2 | 新 `NA/app/(shell)/tools/video/projects/[id]/page.tsx` | 每比例播放器＋下載、腳本、QA（共用 `qa-findings-summary.ts`）、Release、費用、「繼續編輯」 | 瀏覽器：兩個比例都能播 |
| V2.3 | `V/VideoPipeline.tsx:157`、`V/VideoStudio.tsx:1495` | 渲染完不自動跳步，停在成片＋「下一步」；「可以關閉頁面」文字改指專案頁；進階頁「生成記錄」tab（`V/VideoStudio.tsx:167`）改連專案清單 | 瀏覽器：完成後畫面停在成片 |

### V3 腳本頁（依賴：無；與 V1 改不同檔，可並行，V3.4 除外）
| 卡 | 檔案 | 做什麼 | 驗收 |
|---|---|---|---|
| V3.1 | `V/ScriptForge.tsx:433,452,490-495` | 多平台版本並存（原版＋各平台版），選一版當「送出用」；每版可複製 | 瀏覽器：轉兩個平台後切回原版，送出的是原版 |
| V3.2 | `NA/lib/script-forge/modules.ts:287-289` | 平台改寫 prompt 帶 `NA/lib/social/limits.ts` 上限（不另抄數字，I2）；輸出加 `hashtags` | `modules` 測試：prompt 含該平台上限 |
| V3.3 | `V/ScriptForge.tsx:494` | 送社群帶 hashtags | 送社群草稿含 # |
| V3.4 | `V/ModeSelectStep.tsx:9`、`V/VideoStudio.tsx:1894` | Remotion 從「模式」移除，改第 2 步「加片頭卡（6–22 秒）」選項（D9）；說明照實寫。依賴 V1.4 | 瀏覽器：模式剩 3 種；勾片頭卡多一支成片 |

### V4 QA 真能過（依賴：V1）
| 卡 | 檔案 | 做什麼 | 驗收 |
|---|---|---|---|
| V4.1 | `NA/lib/content/blocks/video-pipeline.ts:148-235`；讀者 `NA/app/api/video/history/route.ts:57`、`NA/lib/studio/designs-list.ts:156`、`NA/lib/content/video/reconcile.ts:155`、`NA/app/api/video/[id]/route.ts:33-60` | D6：每比例一列；主列格式不變，其餘列 `metadata.variantOf`＝主列 id、`metadata.format`；列表讀者排除 variant；刪主列連 variant 一起走刪除閘 | `video-pipeline` 測試：兩比例 → 兩列各自 checksum；history 只回一列 |
| V4.2 | `NA/lib/content/video/qa-persistence.ts:55-80` | 技術 QA 逐比例列各寫一份（該列 checksum） | 測試：兩比例 → 兩份 technical |
| V4.3 | `apps/video-service/server.py:263`、`apps/video-service/quality.py:83-84`、`NA/lib/content/video/finalize.ts:101` | 技術 QA failed 不再整支丟掉：服務回成片＋failed 報告，finalize 照樣記成片與 failed QA（Codex 審查 F3） | video-service unittest：靜音片 → 回報 failed 而非例外；finalize 測試記 failed |
| V4.4 | `NA/app/api/video/render-draft/route.ts:174-200`、`NA/app/api/video/qa/editorial-rights/route.ts:52` | D8：腳本進 `metadata.script` | 編輯 QA 對有腳本的成片 passed |
| V4.5 | `NA/lib/content/blocks/video-pipeline.ts:300-370`、`NA/app/api/video/upload-asset/route.ts:131`、`NA/app/api/video/qa/editorial-rights/route.ts:57-82`、`NA/lib/content/video/editorial-rights-qa.ts` | D7：取得素材當下記來源（AI＝模型＋供應商、Pexels＝License＋原網址、上傳＝上傳者勾「有權使用」）；版權 QA 讀它 | 測試：三種來源各一 → passed；上傳未勾 → failed |
| V4.6 | `apps/video-service/pipeline.py:237-238,351-366`；`NA/lib/content/video/finalize.ts:101-108` | D11：Edge 用 `stream()`＋`SubMaker` 產每句時間；OpenAI 用每場比例時間；回傳 `captionCues`＋SRT/VTT；沿用 `persistAutomaticCaptionQa`；metadata 記 `captionSource` | video-service 測試：Edge 回 cues 數＝句數；字幕 QA passed |
| V4.7 | `V/CaptionsStep.tsx` | ⑦ 讀 `captionSource`：script_tts＝顯示並可改字幕（改完重燒）；transcription＝Whisper | 瀏覽器：快速影片不再要 Whisper |

### V5 發布（依賴：V4）
| 卡 | 檔案 | 做什麼 | 驗收 |
|---|---|---|---|
| V5.1 | `V/ReleaseDeliveryPanel.tsx:81-101` | 四項 QA 全過的比例列 → 一鍵建 Release；不顯示 SHA／UUID | 瀏覽器：無手填欄位 |
| V5.2 | `V/ReleaseDeliveryPanel.tsx:89`、`NA/lib/social/store.ts:592`、`NA/lib/social/write-posts.ts` | 社群：列該品牌已連頻道（勾選）；比例自動對平台（D6）；文案用 `writeSocialPosts`、可改；`savePost` 存草稿。刪舊 `/api/content/social-publish` 呼叫（該 route 待 `ClientHubTabs.tsx` 也遷完才刪，見 TASKS 社群 V1） | 測試：勾 YouTube＋IG → 兩草稿、16x9 與 4x5 |
| V5.3 | `V/ReleaseDeliveryPanel.tsx:101`、`NA/lib/content/video/embed-in-post.ts` | WordPress：選網站、選文章（清單）→ `embedVideoInPost`（帶 releaseId） | 瀏覽器：不填 ID 即可嵌入草稿文章 |

### V6 ④ 後自動（依賴：V4、V5）
| 卡 | 檔案 | 做什麼 | 驗收 |
|---|---|---|---|
| V6.1 | `NA/lib/schedules/jobs.ts:108`（同一時鐘，AUTO_CONTENT I3） | 新 job `video_project_advance`：autonomy＝auto_after_render 的專案每 5 分鐘推一步（finalize→字幕→QA→Release→社群草稿）；任一步沒過＝停、寫 `last_error`。High：自動化，預設關 | 狀態機測試：全過→release；一項 failed→停在 review 並有原因 |
| V6.2 | `V/VideoStudio.tsx`（生成鍵） | 兩顆鍵「生成，我要逐步審」「生成並自動完成」寫 autonomy | 瀏覽器：按自動完成後關頁，回專案頁看到草稿或原因 |

### V7 全自動接專案（依賴：V1、V2）
| 卡 | 檔案 | 做什麼 | 驗收 |
|---|---|---|---|
| V7.1 | `NA/lib/content/video/start.ts:46-85`、`NA/lib/content/topics/tick.ts:54` | 題目開影片時建專案（source content_topic、sourceRef＝題目 id、autonomy full_auto），projectId 進 recordParams | `tick` 測試：開影片 → 一列專案 |

## 8. 進度

狀態只在監工台 `agency-os/handoffs/2026-10-26-video-tool-supervisor/data.mjs`；`check.mjs` 驗本檔 §7 卡號與監工台一一對應。
