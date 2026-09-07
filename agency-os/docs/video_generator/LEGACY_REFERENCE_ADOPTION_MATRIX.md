# 影片生成舊參考程式採用矩陣

**狀態：已核對，禁止執行舊主控。**
**建立：2026-09-06**
**適用範圍：** \`D:\Work\agency-os\docs\video_generator\` 中保留的 P7 參考程式，與現行 VideoStudio 的安全整合決策。

## 1. 不可跨越的界線

此資料夾不是正式執行入口。原 README 已明定直接發布與排程主控退役，社群只能經 Postiz，WordPress 只能經 wp-bridge 簽章流程，內容編排由 next-admin 的 draft-first 管線負責：

- \`D:\Work\agency-os\docs\video_generator\_archive_legacy_p7_2026-09-06\README.md:3-8\`
- \`D:\Work\agency-os\docs\video_generator\_archive_legacy_p7_2026-09-06\README.md:42-50\`

因此，以下檔案**不得**被加入 cron、systemd、Trigger 或 Next API 的執行鏈，也不得在本機、測試或正式環境直接執行。它們僅能作為需求與領域概念的歷史參考。

## 2. 採用判定

| 舊參考 | 已確認內容 | 判定 | 正式落點／理由 |
|---|---|---|---|
| \`full_pipeline_v3.py\` | 單一程序依序生成腳本、找／生圖片、TTS、以 MoviePy 合成、最後 ffmpeg 裁切多尺寸。依賴已停更式的 MoviePy 1.x API。 | **採領域概念；不移植程式** | 沿用「場景、旁白、素材、目標比例」的概念，轉成版本化 Timeline 與 renderer contract；Quick Engine 與 Remotion 是正式 renderer。舊程式直接把供應商、暫存檔、輸出與流程耦合，不能成為 LEGO。證據：\`full_pipeline_v3.py:29-38\`、\`:79-115\`、\`:239-314\`。 |
| \`full_pipeline_v3.py\` 的字幕 | 依每一段旁白整段顯示一張 PNG 字幕，沒有逐字時間碼、校對版本、SRT/VTT/ASS 或音畫同步驗證。 | **不可採用實作；作為缺口證據** | 由 Phase 4 以現有 faster-whisper 的逐字時間碼輸出，建立可編輯字幕資產與 QA gate。舊行為證據：\`full_pipeline_v3.py:250-275\`、\`:285-294\`。現有轉錄基礎：\`D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core\apps\meeting-service\lib\transcribe.py:127\`。 |
| \`full_pipeline_v3.py\` 的多尺寸輸出 | 先做一支基礎影片，再用 \`scale ... crop\` 重裁所有目標比例。 | **不採用** | 現有平台已支援每個比例的原生素材與輸出；新 Timeline 必須帶 profile，禁止退回硬裁切作為預設。舊實作證據：\`full_pipeline_v3.py:302-314\`；現行來源：\`D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\content\blocks\video-pipeline.ts:47-84\`。 |
| \`quality_control.py\` | 實際是文章 SEO／抄襲／內連／FAQ／Alt／標題 A/B；不檢查影片黑畫面、聲音、字幕、畫面或角色一致性。 | **不採用為影片 QA；可保留為網站內容治理參考** | 影片 QA 要另建可量測的 technical gate 與人工 editorial gate；不可把「文章品質」誤稱成「成片 QA」。證據：\`quality_control.py:13-196\`，尤其編排內容於 \`:169-196\`。 |
| \`topic_fetcher.py\` | Google Trends、Reddit、YouTube、新聞、GSC 等主題來源，直接操作舊 topics 表。 | **不納入影片核心** | 可日後由內容選題 LEGO 提供「經核准的題材」，但不讓影片製作模組直接抓外站或寫舊表。證據：\`topic_fetcher.py:24-163\`、\`setup.sql:7-27\`。 |
| \`growth.py\` | 電子報、更新舊 WordPress 文、競品監測、翻譯、Google Drive 備份等成長工作。 | **不納入影片核心** | 可在未來成效回饋／營運模組評估；不能與渲染、素材或 Release 耦合。證據：\`growth.py:19-210\`。 |
| \`config.py\` | 一個全域 Python 設定模組，以環境變數給舊腳本讀取。 | **不移植；遵循秘密管理原則** | 正式服務各自有 deployment configuration；不能建新的全域設定真相。可沿用「密鑰不可進 Git」原則。證據：\`config.py:7-20\`、\`_archive_legacy_p7_2026-09-06/README.md:31-40\`。 |
| \`setup.sql\` | 舊 \`topics\`、\`publish_log\`、\`cost_log\`、\`ab_tests\` 與 view，沒有組織隔離、資產引用、Release、版本、審批或回滾模型。 | **嚴禁執行；只保留歷史資料模型線索** | Phase 2 在現有 schema/migrations 上設計資產引用與 Release；不得建立平行資料真相。證據：\`setup.sql:7-77\`。 |
| 舊直接發布主控 | README 指定 publisher/master controller/cron 已退役。 | **永久禁止重啟** | 社群發布由 Postiz；WordPress 發布由 wp-bridge；影片平台只產出受審核 Release 和交付意圖。證據：\`_archive_legacy_p7_2026-09-06/README.md:3-8\`、\`_archive_legacy_p7_2026-09-06/README.md:42-50\`。 |

## 3. 現行正式能力的對接點

| LEGO 能力 | 現行可用對接點 | 尚未做的正式部分 |
|---|---|---|
| \`media.render_quick\` | \`app/api/video/render-draft/route.ts:2\` 提交現有 Quick Engine；\`lib/content/video/job-store.ts:7-12\` 將進度票存於 \`video_jobs\`。 | Phase 1B：提交前 durable intent、冪等鍵、原子認領與 renderer acknowledgement。 |
| \`media.render_remotion\` | Remotion service 已有 \`dynamic-slideshow\` 資料驅動模板：\`apps/remotion-service/src/server.ts:44-64\`、\`Root.tsx:118-128\`。 | Phase 3：Timeline v1 驗證後才可作正式「導演模式」輸入。 |
| 資產目錄資料域（尚無 public capability） | 成片目前以 \`media_assets\` 做 upsert；R2 對帳可修復可歸屬的孤兒：\`video-pipeline.ts:133-225\`、\`video/reconcile.ts:5-66\`。 | Phase 2：資產版本、引用、Release 與安全刪除；不可把資料域誤註冊成 capability。 |
| \`media.transcribe_local\` | 本機 meeting service 具 \`faster-whisper large-v3\` 轉錄入口：\`apps/meeting-service/lib/transcribe.py:127\`。 | Phase 4：影片匯入、字幕資產、人工校對、SRT/VTT/ASS 與同步 QA。 |
| \`media.qa_technical\` | 無現成正式 media QA gate。 | Phase 4：ffprobe、黑畫面、靜音／音量、時長、比例、字幕安全區與可重跑結果。 |
| \`media.delivery_website\` | 現有 \`app/api/video/embed-to-wp/route.ts:10\`。 | Phase 6：Release 外部 ID、草稿、替換及回滾紀錄。 |
| \`media.delivery_social\` | 現有社群發布路由與 Postiz 選擇格式；舊 README 也確認 Postiz 是唯一社群路徑：\`_archive_legacy_p7_2026-09-06/README.md:48\`。 | Phase 6：先完成尚未架好的 Postiz integration，再接 Release 交付與成效事件。 |

## 4. 實作順序與安全門

1. **先完成 Phase 1B 設計與驗收案例**：修正 Quick Engine 工作在建立持久 job 前就送出的原子性缺口。不得先接 Whisper 或 Timeline。
2. **再做 Phase 2 資產／Release／引用資料層**：任何刪除必須先查引用；任何交付只能指定已通過 QA 的 Release。
3. **再做 Timeline v1 和 Remotion 正式模式**：Timeline 是跨 renderer 的輸入契約，不放 renderer-specific 內部欄位。
4. **接 Whisper 與 QA**：轉錄產物先成為可版本化、可校對的資產，再由 QA gate 消費。
5. **最後接短劇、實拍、Postiz 與商業模式**：每個能力都經 capability registry、版本化資料契約、權限和費用政策進入平台。

每一階段均須在隔離 worktree 完成測試與變更包，經 staging 驗收、回滾演練與部署前新鮮備份確認後，才可改動正式環境。

## 5. 檢查結果

- 本次僅讀取歷史檔與現行原始碼，未執行任何 Python 主控、SQL、發布、排程、DB migration 或遠端寫入。
- 此矩陣使舊系統保留其需求價值，同時避免產生第二套發布、資料庫或工作流真相。
