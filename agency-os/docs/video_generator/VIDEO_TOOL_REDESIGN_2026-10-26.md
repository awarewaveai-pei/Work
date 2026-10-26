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
- 要加（一支 migration）：`autonomy`（D2）、`source`（`manual`｜`script_forge`｜`content_topic`＋來源 id）、`formats text[]`；`brief_json` 存腳本全文（版本化：重新生成腳本＝新版本，舊版保留可切回）。
- `media_assets.project_id` 欄位已存在（prod 欄位清單），渲染時填上；`active_candidate_asset_id` 改成「每比例一個」→ 用 `media_assets where project_id=… and is_current` 查，不再存單一欄。
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

1. QA 四項要能真的通過：黑畫面誤報（已修、2026-10-26 已部署）、D7 權利紀錄、D8 腳本入成片、字幕來源（§6 Q1）。
2. 一比例一成片（D6），QA／Release 逐成片。
3. Release 的社群草稿改走社群產品（`TASKS.md` 社群 V1 條目、AUTO_CONTENT P6.3 尚存的 `ReleaseDeliveryPanel.tsx:89` 舊路徑）。

## 6. 待操作者決定

- **Q1 快速影片的字幕從哪來？** 建議：直接用腳本台詞＋配音的時間點產字幕，不必跑 Whisper（台詞本來就是我們寫的；Whisper 留給實拍影片，那才需要聽寫）。代價：要先查配音服務能不能回傳每句的時間點（未查證）。另一案：維持 Whisper，但筆電要常開（現在是隨開隨用，④ 後自動做不到）。

## 7. 分階段（之後拆卡）

| 階段 | 內容 | 驗收（操作者能自己跑的一條） |
|---|---|---|
| R1 專案骨架 | migration（§2）、腳本頁「送去做影片」建專案帶客戶、影片頁讀 `?project=`、各步刪掉自己的租戶選單 | 腳本頁送出 → 影片頁不再問客戶；關頁再開回到同一步 |
| R2 結果頁 | §4 兩頁；③ 完成不再跳走，停在成片 | 做一支 → 清單看得到 → 點進去能播兩個比例 |
| R3 QA 真能過 | D6、D7、D8、Q1 | 一支 AI 生圖影片四項全綠 |
| R4 發布不填 JSON | §3 ⑤；走社群產品 | 勾 YouTube＋IG → 兩個草稿，各自正確比例 |
| R5 ④ 後自動 | §1 第二列 | 按「生成並自動完成」→ 不用再點就到「已建草稿」，或停在沒過的那步並說原因 |
| R6 全自動接專案 | 題目頁管線建專案列（D3） | 題目頁做的影片出現在結果頁 |
