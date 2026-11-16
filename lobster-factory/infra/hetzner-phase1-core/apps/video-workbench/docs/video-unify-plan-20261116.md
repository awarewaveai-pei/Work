# 舊影片工具 × 影音工作台 融合計畫（U 卡）— 2026-11-16 v4 定稿

讀者 = AI agent。事實附 `file:line`；行號以 checkout `779f4d164` 為準，開卡前 grep 一次。舊系統的行號本版逐一查過；新系統（工作台）的行號來自一次只讀盤點，抽查 24 處屬實，其餘開卡先 grep。標「未驗」＝沒有查到證據。
前綴：`NA` = `apps/next-admin`，`V/` = `NA/app/(shell)/tools/video/`，`API/` = `NA/app/api/video/`，`L/` = `NA/lib/content/video/`，`VW` = `apps/video-workbench`，`MIG/` = `lobster-factory/packages/db/migrations/`，`WB/` = `NA/app/video/(wb)/`（本計畫新增）。
硬規則：繁中、付費標 NT$（`TWD_RATE=32`）、不用下拉、不用中國公司模型、正本在伺服器、UI 只用 globals class＋theme token（零 hex）。

操作者前提（全部定案）：
1. 舊系統好用、確定可用、連著很多工具，有些比新的完善。
2. 新系統有舊的沒有的東西。
3. 舊的功能要完美融合進新系統，結果是一個工具。
4. 一開始就以無縫為目標。
5. 不喜歡進頁面先要建專案。
6. 生成頁直接出的片不自動變專案卡。
7. 腳本頁的功能、模組、流程不改；不是「可以永遠留在另一個網站」。
8. 影片送社群以新系統做法為準（每個社群各一版文案、自動配比例）。
9. 「送去做影片」改成開工作台的一集。
10. **融合＝併進新系統的功能，不是在新系統裡多放一個舊系統**（2026-11-16）。

## 融合規則

**一件事只有一條路。** 每件事以新系統做這件事的功能為主體；舊系統的能力以三種方式進來，舊畫面退場：
- **補**：新功能缺的選項，加在新功能上（例：鏡頭卡加「圖庫素材」）。
- **接**：舊後端當成新功能背後的供應商，跟 OpenAI、Replicate 同一層（例：舊渲染引擎變成一集的「快速輸出」）。
- **併**：兩邊資料是同一件事的，改成同一份（例：Story Bible 與製作聖經）。

新系統完全沒有對應功能的三件事（寫多場景腳本、審片、發布），舊元件直接成為新系統的那個功能，不重寫。

v3 的錯：把舊畫面各自放進側欄一頁，同一件事變兩條路（做片：集的步驟 vs 快速影片頁；專案：專案頁 vs 發布紀錄；字幕：字幕工具 vs 舊字幕步驟）。v4 全部收成一條。

## 0. 事實

舊系統：

| # | 事實 | 證據 |
|---|---|---|
| F1 | 舊的做片＝「草稿」：場景清單（旁白＋圖）→ 逐場重生／上傳替換／改旁白 → 送渲染。渲染在伺服器做：配音、燒字幕、片頭標題、一次可出 16x9／9x16／4x5、可帶 `projectId` | `V/VideoStudio.tsx:391-640,1331-1491`；`API/render-draft/route.ts:26-46` |
| F2 | 舊渲染只收自家 R2 與 Pexels 的素材網址；每張素材要帶簽過的來源 | `API/render-draft/route.ts:28,112-136` |
| F3 | 舊的素材來源有三種：AI 生圖（FLUX）、Pexels 圖片、Pexels 影片；每場景可加 AI 動態 | `API/draft/route.ts:18-41`；`L/video-cost.ts:40-48` |
| F4 | 舊流程 5 步只是編排；模式選擇、費用確認、先建專案表單都在編排層 | `V/VideoPipeline.tsx:136-186,203-225` |
| F5 | 舊實拍剪輯＝逐檔上傳、手填入出點、串接渲染，沒有 AI | `V/FootageEditor.tsx:43-61`；`API/footage/compile/route.ts:25`；`L/edit-plan-timeline.ts:14-19` |
| F6 | 舊片頭模板 5 個，長度 6–22 秒，有 logo 與背景音樂欄位 | `V/VideoStudio.tsx:1827-1907` |
| F7 | 舊字幕步驟：對已登記成片改字幕後重燒（每個比例）、主機或 OpenAI 轉錄且失敗自動改主機、客戶層級「音檔不可外送」開關、下載 SRT／VTT | `V/CaptionsStep.tsx:24-65,77-120,235,269-300` |
| F8 | 舊審片＝四項 QA＋「有權使用」；舊發布＝每比例核准、封面、社群草稿（每頻道一版文案、自動配比例）、WP 嵌入。兩個元件都只吃 `organizationId`、`projectId` 或資產 id | `V/QaStep.tsx:18`；`V/ReleaseDeliveryPanel.tsx:37,127-145,229,241-245` |
| F9 | 舊專案＝`media_production_projects`；送審鏈四表綁資產不綁專案；`source` 有 check constraint | `API/projects/route.ts:9-15,49-69`；`MIG/0065_media_production_persistence.sql`；`MIG/0138_media_projects_v2.sql:16-18` |
| F10 | 自動完成排程只認舊引擎的渲染工作，取專案全部影片逐支 QA→核准→社群草稿 | `L/project-advance-deps.ts:26-41`；`NA/lib/schedules/jobs.ts:142-163` |
| F11 | ScriptForge 24 個入口；接點由外層傳入（`onSendToVideo`、`saveSocialDraft`）；Story Bible 是不可變版本＋核准 | `V/ScriptForge.tsx:56-59,222-246,1086`；`API/story-bibles/route.ts:33-57` |
| F12 | 內容工具的文章配片直接打 `API/generate`，不經畫面 | `NA/app/(shell)/tools/content/ContentStudio.tsx:1686-1743` |
| F13 | 舊方案／點數／成效面板 33 行，讀 `API/billing`、`API/outcomes` | `V/MediaOperationsPanel.tsx:16-17` |

新系統：

| # | 事實 | 證據 |
|---|---|---|
| G1 | 一集＝鏡頭清單（畫面描述、旁白、秒數、圖、影片）。鏡頭卡能生成畫面、修這張、綁場景與角色；**不能**上傳或從素材庫換圖，**沒有**圖庫素材，**沒有**讓鏡頭變影片的按鈕 | `VW/scripts/projects-0.js:149,544-574,885-900`；`VW/shared/episode-spine.js:173-176` |
| G2 | 排成時間軸、照旁白逐句配音、用旁白產生字幕都已上線；配音不帶聲線設定，用預設 | `VW/scripts/tools-editor.js:936-967,969-992,1007-1032`；`VW/backend/speech.cjs:105-136` |
| G3 | 剪輯輸出在伺服器用 ffmpeg 做，是一個工作台任務；一次只出一個比例 | `VW/backend/editor-export.cjs:467-509`；`VW/scripts/editor-export-dialog.js:5-11,138-147` |
| G4 | 沒有一鍵串接：「工作流」只是把提示詞一行一行帶進生成頁 | `VW/scripts/workspaces.js:71,101-128` |
| G5 | 外部服務當供應商已有先例：片頭模板由後端送 Remotion 服務、輪詢、下載、驗證，包成一個工作台任務 | `VW/backend/remotion.cjs:85-139`；`VW/scripts/editor-panes/text.js:294-311` |
| G6 | 片頭模板只有 2 個，固定 5 秒，沒有 logo 與音樂欄位；與舊的重疊 2 個 | `VW/backend/remotion.cjs:11-29` |
| G7 | 字幕工具與剪輯器字幕面板已有：四個轉錄引擎、逐句改、翻譯、燒字幕、SRT／VTT。引擎失敗不自動改用別的 | `VW/scripts/tools-subtitles.js:97-115,322-440`；`VW/backend/transcribe.cjs:31-40,51` |
| G8 | 成片之後工作台自己沒有 QA、核准、社群草稿、WP 嵌入的畫面；只有一條連去 `/release` 的連結；第 11 步「送審」永遠顯示「選用」 | `VW/shared/jobs-view.js:13-22`；`VW/shared/episode-spine.js:286` |
| G9 | 用量只有一行固定文字「API · 依實際用量」 | `VW/index.html:55` |
| G10 | 網址匯入只收公開 HTTPS 的圖片（≤8 MB）；影片與音訊不能用網址匯入。已登記過的本機檔不會重複登記 | `VW/backend/api.cjs:1836-1843`；`VW/backend/product-inspect.cjs:4-46`；`VW/backend/main-system.cjs:144-145` |
| G11 | AI 導演只產純文字腳本，不能變成專案或鏡頭；AI 分鏡把大綱拆成鏡頭（含旁白） | `VW/backend/api.cjs:1686-1733`；`VW/scripts/projects-0.js:863-870` |
| G12 | 製作聖經（角色、場景、道具，含參考圖）存在工作台專案裡；角色頁另有一份 | `VW/scripts/projects-0.js:337,469`；`mv-mode-spec-20261114.md` §1 末段 |
| G13 | 殼用同源 frame 掛每個子頁，子頁經 `vw:v1` 通道呼叫殼；影片網域允許同源 frame；兩邊讀同一份主題與 `globals.css` | `VW/index.html:75-104`；`VW/shared/runtime.js:4-6,44,247-281`；`nginx/default.conf:565,681-693`；`VW/awarewave-files.txt:4`；`NA/app/layout.tsx:18-23` |

## 1. 不變量

1. **一件事一條路**：每件事在工具裡只有一個入口、一個畫面、一份資料。
2. **一集的鏡頭清單是做片的唯一模型**。舊的「草稿場景」不再存在；腳本、分鏡、生圖、換圖、配音、輸出都作用在鏡頭上。
3. **舊後端是供應商，不是平台**：從工作台叫用舊引擎一律包成工作台任務，結果是工作台的資產、任務紀錄、一集的步驟與成片（跟其他供應商一樣）。
4. **成片只有一種**：不論哪種輸出法，都出現在同一個成片區，走同一個審片與發布、同一條血統與過期判斷。
5. **不先建專案**；生成頁直接出的片不自動成卡；Postgres 專案列一律由系統建，連結只存一處（列的 `source='video_workbench'`＋`source_ref`）。
6. **專案清單只有一份**（專案頁）。沒有工作台集的舊專案以唯讀卡出現在同一份清單。
7. **聖經只有一份正本**：Postgres 的版本鏈。腳本頁與製作聖經是同一條鏈的兩個編輯面。
8. **一套樣式，可機械檢查**：零 hex 字面值、零自訂字體、零下拉；按鈕、輸入框、卡片的 computed style 全工具相同。
9. **功能不減損**：§3 每一列舊能力都有去處；腳本頁的 24 個入口與流程不變。
10. **價格只來自 `NA/lib/ai/cost-model.ts` 與 `L/video-cost.ts`**；按鈕上標 NT$。
11. **客戶音檔不外送**：設定為不可外送時，工作台後端擋下每一個把音檔送出主機的工作；查不到設定＝擋。
12. **`media_project_id` 只掛成片**，只做 `null → 本列`，限同組織；排程每個比例只取最新一支。

## 2. 決定（選了什麼｜代價）

- **D1 做片只留「一集」這一條路；舊的快速影片頁、草稿編輯、5 步流程全部退場。** 舊能力拆成三處進來：鏡頭卡補來源（D2）、輸出步驟接舊引擎（D3）、一鍵成片（D4）。代價：舊畫面 2,262 行的 `VideoStudio.tsx` 不再使用，要靠 §3 的對照表逐項驗收不漏。
- **D2 鏡頭卡補四樣**：換圖（素材庫或上傳）、圖庫素材（Pexels 圖片與影片）、讓這鏡動起來（圖生影片，用現有影片模型）、生圖模型可選（含 FLUX）。代價：鏡頭卡變大；圖庫素材要放寬網址匯入到 Pexels 的影片。
- **D3 舊渲染引擎＝第 9 步的「快速輸出」**，與「剪輯輸出」並列在同一個輸出步驟。它是一個工作台任務（寫法照片頭模板那個供應商，G5）：送鏡頭的圖與旁白，伺服器配音、燒字幕、加片頭標題，完成後成片回到工作台。代價：同一集有兩種輸出法，畫面不會完全一樣；快速輸出的聲線只有舊引擎支援的那幾個。
- **D4 「一鍵成片」＝補齊缺圖的鏡頭 → 快速輸出**，按之前顯示一次總價。代價：補圖階段要開著頁面（跟現在的批次生成一樣）；關掉再開會從缺的那幾張接著做。
- **D5 輸出多比例**：快速輸出與剪輯輸出的對話框都能複選比例，每個比例一個任務。代價：付費聲線的配音會依比例重算一次，對話框照實標價。
- **D6 自動完成跟著快速輸出走**（勾選後由既有排程做 QA→核准→社群草稿）。不擴到剪輯輸出。代價：剪輯輸出的成片要手動審片、發布。
- **D7 寫腳本＝ScriptForge 成為新系統的腳本功能**（新系統沒有多場景腳本工具，G11），同一個元件、去外框、換樣式。兩個接點：側欄「腳本」的「送去做影片」開新的一集；一集第 2 步的「寫腳本」把結果寫回這一集。AI 分鏡留著，定位是「只有大綱時」的另一種輸入。代價：影片產品有一個 React 頁，用契約與檢查器約束。
- **D8 審片與發布＝成片卡上的一個面板**（第 11、12 步開同一個面板）。內容是舊的 `QaStep`＋`ReleaseDeliveryPanel` 同一元件。舊字幕步驟不搬：它的功能併進字幕工具（D9）。代價：同 D7。
- **D9 字幕只留字幕工具與剪輯器字幕面板。** 補三樣：吃主系統成片的字幕並重燒（給快速輸出的成片改字幕用）、下載主系統存的 SRT／VTT、引擎失敗時給一顆「改用自家主機（免費）重試」。不做自動改用（工作台的規則是不默默換引擎）。代價：失敗時多按一下。
- **D10 片頭模板併進剪輯器**：補舊的 3 個模板、logo 與背景音樂欄位、可調長度。舊片頭頁退場。代價：無。
- **D11 實拍剪輯由多軌剪輯器取代**，不搬：舊的做法是剪輯器功能的子集（F5）。代價：無。
- **D12 聖經併成一條版本鏈**：製作聖經「存成核准版本」寫進 Story Bible 的版本鏈；製作聖經「套用核准版本」從鏈讀回；腳本頁的 Story Bible 模組本來就讀寫這條鏈，不用改。專案記住它用的是哪個系列。代價：兩邊欄位不完全相同，各自不認得的欄位原樣保留。
- **D13 專案清單合一**：舊專案（沒有工作台集的列）以唯讀卡列在專案頁；每張成片卡顯示它發布到哪、成效如何。舊專案清單與專案頁退場。代價：無。
- **D14 用量與方案放在殼右上那行文字的位置**，點開看方案、點數、成效。代價：無。
- **D15 「送社群」＝影片 API 新路由**，與社群工具共用同一個權限檢查與存檔函式；社群模組沒安裝時按鈕隱藏。代價：多一條路由。
- **D16 腳本歷史維持存在瀏覽器**；app 網域那一份在員工入口第一次開殼時用 `postMessage` 搬到影片網域。代價：歷史仍不跨裝置。
- **D17 內容工具的文章配片不動**（F12）；它產的片出現在歷史與作品。代價：舊引擎的全自動流程與工作台的一鍵成片是兩個入口、同一個引擎。
- **D18 不做**：用 vanilla 重寫腳本、審片、發布；工作台 state 搬 Postgres；第三套登入或主題；對客戶開放；AI 導演接專案（新系統自己的缺口，與融合無關）；角色頁與製作聖經合一（MV 規格的卡）。

## 3. 舊能力 → 新功能（逐項）

| 舊能力 | 證據 | 併進哪個新功能 | 方式 | 卡 |
|---|---|---|---|---|
| ScriptForge 24 個入口、腳本歷史、品牌語氣 | F11 | 側欄「腳本」＝新系統的腳本功能 | 同元件 | U3 |
| 送去做影片 | `V/ScriptForge.tsx:89-96` | 開新的一集（鏡頭與角色帶入） | 接 | U3 |
| （新接點）在一集裡寫腳本 | G11 | 第 2 步「寫腳本」，結果寫回這一集 | 接 | U3 |
| 送社群 | `V/ScriptForge.tsx:56-70` | 同一顆按鈕 | 新路由 | U3 |
| 草稿逐場重生 | `V/VideoStudio.tsx:501` | 鏡頭卡「生成畫面」（已有） | — | — |
| 草稿上傳替換、「有權使用」 | `V/VideoStudio.tsx:557,1377` | 鏡頭卡「換圖」 | 補 | U4 |
| 圖庫素材（Pexels 圖片／影片） | F3 | 鏡頭卡「圖庫素材」 | 補 | U4 |
| 每場景 AI 動態 | F3 | 鏡頭卡「讓這鏡動起來」 | 補 | U4 |
| FLUX 生圖 | F3 | 鏡頭生圖模型可選 | 補 | U4 |
| 草稿改旁白 | `V/VideoStudio.tsx:1331-1491` | 鏡頭卡「旁白」（已有） | — | — |
| 主題或文章直接出片 | `API/generate/route.ts:19-37` | 腳本頁或 AI 分鏡 → 一鍵成片 | 接 | U5 |
| 伺服器渲染：配音、燒字幕、片頭標題 | F1 | 第 9 步「快速輸出」 | 接 | U5 |
| 一次出多比例 | F1 | 輸出對話框複選比例（兩種輸出法都有） | 補 | U5 |
| 成本明細、費用確認 | `V/VideoStudio.tsx:238-243,1257`；`V/CostGateStep.tsx` | 快速輸出與一鍵成片的確認框 | 補 | U5 |
| 生成並自動完成 | `V/VideoStudio.tsx:599-632` | 快速輸出的選項 | 接 | U5 |
| 生成記錄、批次刪除 | `API/history`、`API/[id]` | 工作台「歷史紀錄」（快速輸出是工作台任務） | 接 | U5 |
| 模式選擇 | `V/ModeSelectStep.tsx` | 沒有模式：一集就是一集；片頭在剪輯器、實拍在剪輯器 | 退場 | U11 |
| 5 步流程、續做 | F4 | 一集的步驟列 | 退場 | U11 |
| 先建專案表單 | `V/VideoPipeline.tsx:203-225` | 沒有（前提 5） | 退場 | U11 |
| 四項 QA、「有權使用」 | F8 | 成片卡「審片與發布」面板上半（第 11 步） | 同元件 | U6 |
| 核准、封面、社群草稿、WP 嵌入 | F8 | 同一面板下半（第 12 步） | 同元件 | U6 |
| 專案頁全鏈（發布去向、成效） | `API/projects/route.ts:49-69` | 成片卡上的「發布到哪」；舊專案＝專案頁的唯讀卡 | 併 | U6 |
| 改字幕重燒（每比例） | F7 | 字幕工具（來源＝主系統成片） | 接 | U7 |
| 主機／OpenAI 轉錄 | F7 | 字幕工具（已有四引擎） | — | — |
| 失敗自動改主機 | F7 | 失敗時一顆「改用自家主機重試」 | 補 | U7 |
| 下載 SRT／VTT | F7 | 成片卡與字幕工具 | 補 | U7 |
| 音檔不可外送開關 | F7 | 工作台設定＋後端守衛 | 併 | U7 |
| Remotion 5 個模板 | F6 | 剪輯器片頭模板 | 補 | U8 |
| 時間軸 v1 檢查 | `V/TimelineValidationPanel.tsx` | 剪輯器「匯出時間軸 v1」（接上已有但沒人呼叫的路由） | 補 | U8 |
| 實拍素材剪輯 | F5 | 多軌剪輯器（已涵蓋） | 退場 | U11 |
| Story Bible、定裝照、連續性與一致性比對 | F11；`V/VideoStudio.tsx:473` | 一條版本鏈；一致性比對在第 3 步 | 併 | U9 |
| 方案／點數／成效 | F13 | 殼右上的用量 | 併 | U10 |
| 我的作品 | `NA/app/video/works/page.tsx` | 側欄「作品」 | 同元件 | U1 |
| 文章配片 | F12 | 不動 | — | — |

## 4. 卡片

共通：`npx tsc --noEmit`（動到 next-admin）＋`node tests/gate.cjs`（動到工作台）＋本卡點名的測試＋`/codex-review`。next-admin 推上 main 當晚 03:00 上線；工作台另行部署。兩邊都動的卡，上線順序＝next-admin 先、工作台後。員工門的舊頁在 U11 之前完全不動，所以每張卡都能單獨上線、單獨 revert。突變只做在標「突變」的守衛。
順序：U0、U1、U4、U7、U8、U10 互不相依。U2 在 U1 後。U3、U6 在 U2 後（U6 另需 U0）。U5 需 U0、U4。U9 需 U3。U11 最後。

**U0 專案列「建或取回」（後端；Medium；migration 先過 db-expert；critic Deep）**
- migration（開卡取號，現最新 0163）：`media_production_projects_source_check` 加 `'video_workbench'`；`unique index (organization_id, source_ref) where source = 'video_workbench'`。down 兩處（照 0138）。
- `L/projects.ts` 加 `ensureWorkbenchProject(db, org, sourceRef, title)`：查 → 沒有就 insert → 撞 23505 重查（寫法照 `NA/app/api/internal/video/workbench/assets/route.ts:245`）→ 標題不同就更新。
- `API/projects/route.ts`：`SOURCES` 加值（`:13`）；POST 在 `source==="video_workbench"` 時走它；收選填 `attachAssetIds`（≤50），只更新「同組織、影片、`media_project_id is null`」的資產；GET 加 `sourceRef` 篩選。
- `L/project-advance-deps.ts:37-41` 的 `rows()`：每個比例只留最新一支。
- 舊資料：既有列與資產不動。
- 測試：同一 `sourceRef` 兩次只有一列；`attachAssetIds` 只做 null→本列，**突變**：拿掉組織條件 → 變紅；`rows()` 同比例兩版只回新的，**突變**：拿掉去重 → 變紅。
- 回退：revert；migration 的 down 在沒有新值的列時可跑。

**U1 門頁機制＋側欄「作品」（Medium）**
- next-admin：`NA/app/video/` 分兩個 route group（網址不變）。`(door)` 放現有 layout 與頁面；`(wb)` 的 layout＝`ProductDoorShell` 加 `bare` 參數（保留開通檢查，不畫導覽與登出列），依 `VW/pages/projects.html:17-24` 的順序載入工作台子頁 script，不在殼內時導向 `/?open=<名字>`。`works/` 搬進 `(wb)`。`WB/workbench.ts` 提供 `useWorkbench()`。
- 工作台：`scripts/index-1.js:2-13,26-35` 的子頁清單改成「名字 → 來源」表；讀 `?open=`；側欄加「作品」。
- `products.ts:52` 的 `door.nav` 與登記表測試對門頁資料夾的規則未驗；Next 頁內載入工作台 runtime 沒有先例，本卡用「作品」實測並在頁內呼叫一次導覽。不通就停在這張，U3、U6 不開。
- 測試：`bare` 版面沒有導覽；直接開 `/works` 被導回殼；原生頁行為不變（`tests/sidebar-overlays.cjs`）。
- 回退：revert。

**U2 一套樣式（Medium）**
- `NA/components/tools/panel-primitives.ts` 補齊按鈕、輸入框、卡片、選項鈕，值只讀 token（先量工作台原生頁的 computed style；不是 token 的補成 token）。`V/ScriptForge.tsx:250-264` 的十個小元件、`StoryBibleWorkbench`、`QaStep`、`ReleaseDeliveryPanel`、`RightsCheckbox` 改用它。
- 去掉 `DM Serif Display`（52 處）、hex 字面值（`V/ScriptForge.tsx:266,309,1012`）、`<select>`（ScriptForge 7、QaStep 1）改按鈕組。`OrganizationPicker` 不改：門頁一律鎖定組織、不顯示。
- 檢查器 `WB/__tests__/style-contract.test.ts`：從 `(wb)` 的 import 圖算出用到的元件檔，斷言 0 hex、0 `fontFamily`、0 `<select`。另一支 Playwright 比對原生頁與門頁的按鈕、輸入框、卡片 computed style。
- 腳本頁外觀會變成工作台的樣子；模組、欄位、流程、文案不變，由 `ScriptForgePage.render.test.tsx`、`script-forge-errors.test.ts`、`release-panel*.test.tsx` 守。
- 回退：revert。

**U3 腳本＝新系統的腳本功能（Medium；新路由 → critic Deep）**
- `WB/script-forge/page.tsx`：`<ScriptForge sideMenu videoNeedsClient={false} …/>`；側欄加「腳本」。
- `V/video-handoff.ts` 加 `shotsFromScript(script)`（→ `shots[{id,text,seconds,line}]`，旁白沿用同檔 `stripStageDirections`）與 `charactersFromStoryBible(doc, refMap)`。
- 「送去做影片」→ `VideoWorkbench.spine.create({title, ratio, shots, characters, storyBibleSeries})` → 開到新的一集。工作台：`shared/episode-spine.js:57-78` 的專案形狀抽成 `newProject()`，與 `adopt` 共用；`shared/runtime.js` 加主頁動作 `spine-create`。
- 「在這一集寫腳本」：第 2 步加按鈕，帶 `?episode=` 開腳本頁；這時「送去做影片」的字改成「寫回這一集」，呼叫主頁動作 `spine-set-shots`（已有鏡頭時先確認「會取代現有鏡頭」）。
- 「送社群」：`NA/app/api/social/posts/route.ts:68-76` 的核心抽成 `lib/social` 的一個函式，原路由與新路由 `API/social-drafts/text/route.ts` 共用；社群沒安裝時不傳 `saveSocialDraft`（按鈕自動隱藏，`V/ScriptForge.tsx:59`）；`:69` 的連結改成社群門網址（`productHost`，`NA/lib/portal/hosts.ts:26`）。
- 測試：新路由「別組織的品牌被拒」，**突變**：拿掉權限檢查 → 變紅；`shotsFromScript` 不丟對白與畫面、去掉舞台指示；送去做影片 → 多一集、鏡頭數等於場景數；寫回這一集 → 集數不變、鏡頭被取代。
- 回退：revert。

**U4 鏡頭卡補齊（Medium）**
- 換圖：鏡頭卡加「換圖」，開現有素材選擇器（素材庫＋上傳，含「有權使用」勾選）；寫回走新主頁動作 `spine-set-shot`（沒有任務的步驟照 PJ 規格 `:37` 記一筆），不讓子頁直接改主線欄位。
- 圖庫素材：鏡頭卡加「圖庫素材」，填關鍵字 → 同源打 `API/regenerate-image`（`visual:"broll"`）取得 Pexels 素材網址 → 工作台匯入成素材 → `spine-set-shot`。工作台的網址匯入（`VW/backend/api.cjs:1836-1843`）改成共用函式，來源白名單加 Pexels 三個主機與自家 R2，並允許影片（上限另訂）。
- 讓這鏡動起來：有圖的鏡頭加按鈕，以該圖為首幀建影片任務（`target:"shot:<id>"`），完成後由既有 `settle` 寫 `shot.video`（`VW/shared/episode-spine.js:176`）。按鈕標每秒 NT$。
- 生圖模型可選：鏡頭的生成畫面可選圖片模型（清單來自 `/capabilities`，補 FLUX；`NA/public/editor-shared/image-models.js` 已在契約清單）。FLUX 走哪個供應商模組未驗。
- 測試：換圖後剪輯片段標示過期（`tests/pj4-stale.cjs` 的規則）；圖庫素材來源不在白名單被拒，**突變**：拿掉白名單 → 變紅；有圖的鏡頭生影片後 `shot.video` 有值。
- 回退：revert；已寫的 `shot.video` 留著，舊程式不讀。

**U5 快速輸出、多比例、一鍵成片（Large；分三個 commit；critic Deep）**
- commit 1（供應商）：新內部路由 `POST|GET /api/internal/video/workbench/quick-render`（Bearer `VW_INTERNAL_TOKEN`）。收 `{organizationId, sourceRef, title, scenes:[{narration, assetId}], ratio, tts, intro, autonomy}`；伺服器用資產 id 查網址與來源紀錄（不收客戶端網址，照 VD 規格的不變量）、`ensureWorkbenchProject`、送舊引擎渲染（把 `API/render-draft/route.ts` 的送渲染段抽成 `L/` 的函式，原路由改呼叫它）、`autonomy` 有值就寫列。GET 回狀態與成片的資產 id、網址、比例。
- commit 1：`VW/backend/quick-render.cjs`（照 `backend/remotion.cjs:85-139`）：送出、輪詢、下載成片進素材庫，並把本機檔對應到主系統已登記的那一列（不重複登記，`main-system.cjs:144-145`）。任務 `operation:"quick-render"`，`link` 的 `target:"output"`、`step:"export"`，所以歷史紀錄、成片區、血統、過期判斷都照舊運作。
- commit 2（畫面）：第 9 步「輸出」變成兩顆：「快速輸出」「剪輯輸出」。快速輸出對話框：比例複選（16:9、9:16、4:5）、聲線（舊引擎支援的，按鈕組）、片頭標題、自動完成、成本明細（伺服器用 `computeVideoCost` 算）。缺圖或缺旁白的鏡頭列出來，缺就不能送。剪輯輸出對話框的比例改成可複選，每個比例一個任務（`VW/scripts/editor-export-dialog.js:138-147`）。
- commit 3（一鍵成片）：一集頁一顆「一鍵成片」。確認框顯示總價（缺圖張數×單價＋快速輸出）。按下後記 `episode.autoRun`（主頁 runtime 寫），先跑既有批次生成（`VW/scripts/projects-0.js:885-900`），鏡頭都有圖就送快速輸出；頁面關掉再開，runtime 看到 `autoRun` 就接著做。
- 舊引擎對沒有旁白的場景、對每比例只給一組圖時怎麼處理未驗，commit 1 開工先讀 `L/` 的渲染入口再定對話框的限制。
- 測試：內部路由「別組織的資產 id 被拒」，**突變**：拿掉組織條件 → 變紅；假渲染服務下快速輸出完成 → 成片區多一支、歷史紀錄有任務、主系統只有一列；複選兩個比例 → 兩個任務；一鍵成片中途重開頁面會接著做，且已有圖的鏡頭不重生。
- 回退：三個 commit 各自 revert；已產的成片留著。

**U6 審片與發布併進成片（Medium）**
- `WB/review-release/page.tsx`：上半 `QaStep`、下半 `ReleaseDeliveryPanel`（鎖定組織、預帶影片），收 `project` 或 `asset`；`QaStep` 加選填 `initialAssetId`。`(door)/release` 改成導回殼並開這個面板。
- 工作台：成片卡與任務面板的「送審與投遞」（`VW/shared/jobs-view.js:13-22`）改成在殼內開面板；步驟列第 11 步改名「審片」、加第 12 步「發布」（`VW/scripts/projects-0.js:155`），都開同一個面板的對應段。開之前 `POST API/projects`（帶這一集已登記成片的資產 id）。兩步的狀態每次讀鏈（四項 QA 都過；有核准的 Release），取代 `episode-spine.js:286` 的固定「選用」。
- 成片卡加「發布到哪」：Release、投遞、成效（`API/projects?id=` 已回，`route.ts:54-69`）。
- 專案頁清單加舊專案的唯讀卡（`API/projects` 中沒有 `source_ref` 的列，標來源），點開看它的成片與同一個面板。
- 必留（前提 8）：每頻道一版文案且可各自改、AI 依平台各寫一版、自動配比例、超過上限提示（`V/ReleaseDeliveryPanel.tsx:127-139,229,241-245`）。
- 測試：勾兩個不同平台 → 兩份文案各自存成草稿；從一集開只列這一集的成片；舊資料：一筆 `source=manual` 的舊專案在專案頁看得到、成片能播、能核准。
- 回退：revert；連結回到 `/release`。

**U7 字幕與音檔（Medium；critic Deep）**
- 字幕工具加來源「主系統成片」：讀 `API/subtitles` 的字幕 → 逐句改 → 快速輸出的成片走 `API/captions/reburn`（包成工作台任務，寫法同 U5 的供應商），其他成片照舊燒字幕。成片卡加「改字幕」「下載 SRT／VTT」。
- 轉錄失敗且當下不是自家主機引擎時，錯誤訊息旁加「改用自家主機（免費）重試」。
- 音檔不外送：新 `GET /api/internal/video/workbench/audio-policy`（回 `externalAudioAllowed`，`L/transcription.ts:29-34`）；工作台後端在每個外送音檔的 operation 開始前檢查（開卡 grep 全列，至少 `VW/backend/transcribe.cjs:35,39`、`VW/backend/audio-tools.cjs:16,20`）；`/capabilities` 把這些列標成不可用；開關放在工作台設定，寫入沿用 `API/transcription/options` PATCH。
- 測試：不可外送時每個外送 operation 被拒且沒有對外請求、查詢失敗＝拒，**突變**：拿掉檢查 → 變紅；改一句字幕重燒後成片字幕更新。
- 回退：revert；舊派送路由照舊擋。

**U8 片頭模板與時間軸 v1（Low）**
- `VW/backend/remotion.cjs:11-29` 的模板表補 `pan-slide-text-left-3scenes`、`product-review-typewriter`、`photo-highlights-slides-zoom`；加 `logoUrl`、`audioUrl` 欄位與可調長度（欄位定義抄 `V/VideoStudio.tsx:1827-1907`）；文字面板表單跟著表產生。
- 剪輯器加「匯出時間軸 v1」：呼叫已有的 `/editor/timeline-v1`（`VW/backend/api.cjs:1571-1579`），結果送 `API/timeline/validate` 並顯示問題清單。
- 測試：五個模板各渲染一支（假服務）；長度非 5 秒可送。
- 回退：revert。

**U9 一本聖經（Medium；需 U3）**
- 專案加 `storyBibleSeries`（主頁 runtime 寫）。製作聖經卡加兩顆：「存成核准版本」（`POST API/story-bibles {organizationId, storyBible}`＋`[id]/approve`；不帶 `projectId`，因為那條路只收短劇專案，`route.ts:40-44`）、「套用核准版本」（讀最新核准版寫回製作聖經；定裝照經 U4 的網址匯入成為參考圖）。
- 製作聖經 ↔ Story Bible 文件的對照寫成 `L/story-bible.ts` 旁的一對純函式，兩邊不認得的欄位原樣保留；文件 schema 未驗，開卡先讀。
- 第 3 步加「一致性比對」（`API/story-bibles/visual-consistency-check`，輸入＝鏡頭圖＋核准版）。
- 測試：存成核准版 → 腳本頁的 Story Bible 清單看得到；套用後再存，不認得的欄位沒有掉。
- 回退：revert；版本不可變，留著。

**U10 用量與方案（Low）**
- `VW/index.html:55` 那行文字改成讀 `API/billing`；點開一個小面板：方案、點數、已用量、成效（`API/outcomes`）。內容對照 `V/MediaOperationsPanel.tsx` 逐項。
- 測試：有方案與沒方案兩種回應各顯示正確。
- 回退：revert。

**U11 收尾（Medium；兩個 commit）**
- 驗收表：§3 每一列在工作台實際走一遍，全部通過才進本卡。
- commit 1（入口）：`V/page.tsx` 與 `NA/app/(shell)/tools/script-forge/page.tsx` 改成「開啟影音工作台」。同一次點擊開殼，收到殼的就緒訊息後 `postMessage` 這台瀏覽器的 `sf_history`；殼只收來源在員工門清單內的訊息（`staffHosts`，`NA/lib/portal/hosts.ts:17`），併入影片網域的 `sf_history`（依 id 去重、上限 50）；原資料不刪。`NA/app/sidebar-sections.ts:61,63` 合成一項；`NA/app/(shell)/tools/theme/page.tsx:183` 改指它。
- commit 2（刪除）：§5 清單；`(door)/page.tsx` 導向 `/`；`products.ts:52,55` 與登記表測試；文件：`V/CONTEXT.md`、`creative-suite-plan-20261102.md` §4、`pj-project-spine-spec-20261106.md` §6。
- 測試：來源不在清單的訊息被丟棄，**突變**：拿掉來源檢查 → 變紅；刪除後 `tsc` 與登記表測試綠。
- 回退：兩個 commit 各自 revert。

## 5. 淘汰與保留

刪（U11）：`V/VideoPipeline.tsx`、`VideoTabs.tsx`、`VideoStudio.tsx`、`ModeSelectStep.tsx`、`CostGateStep.tsx`、`CaptionsStep.tsx`、`FootageEditor.tsx`、`TimelineValidationPanel.tsx`、`MediaOperationsPanel.tsx`、`V/projects/*`、`V/__tests__/CaptionsStep.render.test.tsx`、`NA/app/(shell)/tools/script-forge/ScriptForgePage.tsx`、`NA/app/(shell)/tools/seedstar/page.tsx`。
保留（成為新系統的功能）：`V/ScriptForge.tsx`、`StoryBibleWorkbench.tsx`、`OrganizationPicker.tsx`、`QaStep.tsx`、`ReleaseDeliveryPanel.tsx`、`RightsCheckbox.tsx`、`video-handoff.ts`、`qa-labels.ts`、其餘測試。
保留（後端）：全部 `API/*`、`L/*`、`NA/lib/script-forge/*`。刪畫面後沒有畫面呼叫的路由（`API/draft`、`footage/*`、`remotion-render`、`timeline/compile|submit` 等）不在本計畫刪，另案查呼叫者後清理。

## 6. 風險與回退

- 最大的一張是 U5。它把舊引擎包成工作台任務，風險在兩邊帳要對得上（一支成片在主系統只能有一列）；用測試守，並分三個 commit。
- D1 刪掉 `VideoStudio.tsx`：靠 §3 對照表與 U11 的驗收表防漏。員工門舊頁在 U11 之前不動，隨時可回到今天的狀態。
- 門頁內載入工作台 runtime 沒有先例（U1）：不通就停，腳本與審片發布改列為待重新設計，其餘卡（U0、U4、U5、U7、U8、U10）不受影響。
- U2 會改腳本頁的外觀（字體、按鈕、卡片、下拉變按鈕列），功能由既有測試守。
- U0 的 migration 與工作台部署屬 High，照 AGENTS §3 在執行當下取得同意。
- 舊成片不回填；第一次開審片與發布面板時補掛。
- 兩個渲染引擎並存（快速輸出用舊的、剪輯輸出用新的）是 D3 的已知代價；內容工具改接之前不會只剩一個。

## 7. 建議模型

- U0、U5 commit 1、U7、U3 的新路由：Opus 5.5＋critic Deep；U0 另過 db-expert。
- U1、U4、U5 commit 2–3、U9、U11 commit 1：Opus 5.5。
- U2：Opus 5.5 定 primitive 與檢查器，逐檔替換派 `fullstack-engineer`（Sonnet）或 Codex。
- U6、U8、U10、U11 commit 2：`fullstack-engineer`（Sonnet）。

## 8. 2026-11-16 操作者實走舊流程（腳本 → 快速影片 → 片頭 → 審片 → 發布）：逐項對照與補漏

來源：操作者 11 張截圖。每一列＝畫面上看得到的一個功能。「未驗」＝開卡先 grep，不存在就照「補」做。§3 沒列到的列標 **漏**，已歸卡。

| # | 舊畫面上的功能 | 新系統位置 | 狀態 | 卡 |
|---|---|---|---|---|
| 1 | 模式三選一（快速影片／短劇／實拍剪輯）、進設定前的費用粗估 | 沒有模式；費用在送出前的確認框 | 退場（D1、前提 5） | U11 |
| 2 | 「已從前製腳本帶入 N 個場景」、主題、文章內容 | 腳本頁「送去做影片」→ 一集的鏡頭 | 分支已做 | U3 |
| 3 | 語言（旁白語言） | 腳本決定旁白文字；聲線按鈕含繁中／English | 聲線已在 main | U5 commit 2 |
| 4 | **漏** 素材模式一次套用整支：真實影片（全圖庫影片，免費）／照片動畫（全圖庫照片，免費）／AI 生圖；以及「AI N 場＋圖庫補 N 場」的分配 | 一鍵成片確認框的「缺的畫面怎麼補」：AI 生圖／圖庫影片／圖庫照片（按鈕組）；分配沿用腳本每場的 visual 標記 | 待做 | U5 commit 3 |
| 5 | **漏（部分）** 生圖模型多家可選：FLUX 5 款、Ideogram、Google、OpenAI，各標單價 | 鏡頭「生成畫面」的模型按鈕組，單價標 NT$／張 | U4.4 未做（工作台 `backend/generation-policy.cjs:16` 只有一個 IMAGE_MODEL）；清單與單價來源＝`NA/public/editor-shared/image-models.js`＋`L/video-cost.ts` | U4.4 |
| 6 | **漏** AI 影片動態模型可選（Runway／Veo Fast／Veo／Luma，各標每場價與秒數），含「不要」 | 鏡頭「讓這鏡動起來」：現在自動挑一個（`VW/scripts/projects-0.js:56`）→ 改成列出可用的首幀模型讓人選，單價標 NT$／秒 | 待做 | U4.5（新項） |
| 7 | **漏** 視覺風格（影片風格／西方畫家／亞洲畫家／媒材／風格；電影感、紀錄片、商業攝影） | 工作台已有風格欄位（`VW/scripts/projects-0.js`、`storyboards-0.js`，未驗是否同一份清單）；清單以舊的為準併成一份 | 未驗 | U11 驗收表；缺就補在 U4.5 同一 commit |
| 8 | 配音：Edge 免費 4 聲線、OpenAI 聲線 | 快速輸出對話框聲線按鈕組（`L/video-cost.ts` DRAFT_VOICES） | 已在 main | U5 commit 2 |
| 9 | 輸出比例 16:9／9:16／4:5／全選 | 快速輸出與剪輯輸出的比例複選 | 已在 main；「全選」鈕未驗 | U5 commit 2 |
| 10 | 費用預覽、完整明細、「目前設定」摘要 | 快速輸出確認框（伺服器算） | 已在 main | U5 commit 2 |
| 11 | 生成進度四步、「可以關閉頁面」 | 工作台任務＋歷史紀錄（任務在伺服器） | 已有 | — |
| 12 | 片頭 5 模板、Logo、背景音樂、可調長度 | 剪輯器片頭模板 | 已上線 | U8 |
| 13 | **漏** 片頭：腳本帶入時文字欄位預填；背景圖旁的「AI 生圖」鈕；主標語字數上限顯示（20/20） | 剪輯器片頭表單：從這一集的標題／第一鏡預填；圖欄位接素材選擇器（含生成）；字數上限由欄位表提供 | 未驗 U8 是否已含 | U8.3（新項） |
| 14 | **壞** 片頭渲染很久沒結果 | 同一個 `lobster-remotion-service`，新舊共用 | 根因見下 | U8.4（新項） |
| 15 | 生成完成：播放、每比例下載、複製連結 | 成片卡（播放、下載已有）；**漏**「複製連結」 | 待做 | U6 補一顆（下次動成片卡時） |
| 16 | **壞** 同一支影片畫兩個播放器 | `V/VideoStudio.tsx:1557,1598` 同一個 `primaryUrl` | 隨檔案退場 | U11 |
| 17 | 影片專案頁：狀態、繼續編輯、腳本摺疊 | 專案頁的一集（鏡頭＝腳本） | 已有 | — |
| 18 | 審片 ⑦：選成片、下載 SRT／VTT、逐句改字幕、重燒（每個比例） | 字幕工具（來源＝主系統成片）、成片卡「改字幕」 | 已上線 | U7 |
| 19 | 審片 ⑧：四項 QA、繼續到 Release | 成片卡「審片」 | 已在 main | U6 |
| 20 | 發布：每比例核准、封面上傳（有權使用）、社群草稿（每頻道自動配比例）、嵌進網站文章（選站、建新草稿並嵌入、既有草稿嵌入） | 成片卡「發布」＝同一個 `ReleaseDeliveryPanel` | 已在 main | U6 |

新系統要守的事（由這次實走得出）：
- 價格一律 NT$：舊畫面的模型單價是 US$（截圖 `$0.003/張`、`$0.25/場`）；搬進工作台的每一個模型按鈕都走 `shared/paid-price.js`，不得出現 `$`。
- 不用下拉：舊畫面有「語言」「選擇要轉錄的影片素材」兩個下拉；新畫面一律按鈕組或清單。
- 選項不能少：#4–#7、#13 是 §3 漏列的選項，U11 驗收表以本節 20 列為準逐列實走。
- 渲染任務不能只活在服務記憶體（#14）：一個任務送出後，服務重啟、頁面關閉都要能得到「完成」或「失敗＋原因」，不得只剩逾時。

#14 根因（2026-11-16 14:04 台灣時間）：`lobster-remotion-service` 在 1920×1080 編碼開始後 Node 丟例外退出（stack：`@remotion/renderer/dist/render-media.js:336` `onFrameBuffer`），`RestartCount=1`、`OOMKilled=false`、容器記憶體上限 1 GiB；例外訊息那一行未取得。任務表在行程記憶體，重啟即失；舊頁輪詢寫死 15 分鐘（`V/VideoStudio.tsx:2009`）才報逾時。工作台片頭（U8）走同一服務。

## 9. 片頭接進主片（操作者 2026-11-16 定案；新需求，§3 沒有）

現況（file:line，checkout 868c6324a）：動態模板片頭渲染完要按「放到時間軸開頭」才進主片，之間沒有轉場（`VW/scripts/editor-panes/text.js:351-358`）；快速輸出只有黑底白字標題卡（`VW/backend/quick-render.cjs:57-60` → `video-service/pipeline.py:478,536-541`），場景以 concat 直接相接、各自淡入淡出（`pipeline.py:417-425,550`）；舊頁的模板片頭是另一支獨立成片。

操作者要的兩條路：(A) 選了片頭就自動變成一支、有轉場；(B) 編輯／重新生成 → 加入影片成為片頭。

不變量：
- 片頭是「這一集的設定」，只有一份：`episode.intro = { kind: "none"|"title"|"template", templateId?, fields?, seconds, transition: "none"|"crossfade"|"fade-black", transitionSeconds }`（主頁 runtime 寫）。A、B、剪輯器三處讀寫同一份，不各存各的。片尾 `episode.outro` 同形狀、同一套程式（結尾的呼籲卡），不另寫第二套。
- 一支片頭只渲染一次：以（templateId、fields、seconds、比例）為鍵，已有成品就重用，不重渲染、不重扣點；改了欄位才重做。
- 接合在伺服器做，一個比例一支成片：片頭 → 轉場 → 主片（→ 轉場 → 片尾）。字幕時間順延片頭長度（`video-service/captions.py:38-40` 已支援 `intro_s`）；片頭有配樂時，配樂在轉場內淡出、旁白從主片第一鏡開始。
- 換片頭不重生鏡頭：只重做接合，用同一批圖與配音；新成片是舊成片的新版本（血統照 PJ 規格），舊版保留。
- 片頭失敗不拖垮主片：片頭渲染失敗時任務停在「片頭失敗＋原因」，給兩顆「重試片頭」「不加片頭先出片」，不默默出一支沒片頭的片。
- 模板不支援所選比例時，送出前就列出來並擋下（可改選標題卡），不到渲染才失敗。
- 價格在送出前顯示 NT$（片頭渲染＋主片）；重用既有片頭時片頭那行顯示 NT$0。

做法（歸卡）：
- **U5.3（一鍵成片，原有）**：確認框加「片頭」「片尾」各一組按鈕（不要／標題卡／五個模板）與轉場按鈕組（無／交叉淡化／淡黑，預設交叉淡化 0.5 秒）；值寫 `episode.intro|outro`。
- **U5.4（新）自動接成一支**：快速輸出與一鍵成片讀 `episode.intro|outro`。kind=template 時先建 `remotion-template` 任務（或重用），完成後把片頭資產 id 連同轉場交給 quick-render；next-admin 內部路由收 `introAssetId`／`outroAssetId`／`transition`（只收資產 id，同組織，照既有守衛）；`video-service/pipeline.py` 的接合由 concat 改成：有轉場時以 xfade／acrossfade 接片頭與第一鏡（片尾同），其餘場景照舊 concat。剪輯輸出走同一份設定：輸出前把片頭放在 V1 開頭並套用轉場（用剪輯器既有轉場，`editor-export.cjs`）。
- **U5.5（新）成片卡「片頭」**：成片卡與一集頁顯示目前片頭（縮圖、模板名、長度、轉場）；三顆：「編輯」（開片頭表單，改完自動重渲染片頭）、「重新生成」（同欄位再渲染一次）、「加入這支影片」（只重做接合，出新版本）；沒有片頭的舊成片同樣可「加入」。
- **U8.5（新）剪輯器**：「放到時間軸開頭」之後自動在片頭與第一段之間加預設轉場，並把選擇寫回 `episode.intro`；片頭面板顯示目前這一集的片頭設定而不是空表單。
- 測試：選模板＋交叉淡化 → 一支成片、長度＝片頭＋主片−轉場、字幕第一句時間＝片頭長度−轉場；同欄位第二次輸出 → 片頭任務數不變；別組織的片頭資產 id 被拒（**突變**：拿掉組織條件 → 紅）；片頭失敗 → 任務停在可重試狀態、沒有成片；「加入這支影片」→ 鏡頭生成任務數不變、成片多一個版本。
- 相依：U5.3、U5.4 同一張對話框，一起做；U5.5 在 U5.4 後；U8.5 獨立。風險：動到 `video-service`（內容工具的文章配片也用它）→ 沒傳片頭參數時輸出必須逐位元組不變的路徑（concat），由既有測試守。

## 10. 計畫自審（2026-11-16，checkout 73bb8bc03）：矛盾與缺口

以本節為準；與前文衝突時本節勝。每條＝問題｜證據｜定案｜歸卡。

矛盾：
- X1 片頭在哪｜§3「模式選擇」列與「Remotion 5 個模板」列寫「片頭在剪輯器」，§9 讓快速輸出與一鍵成片也用模板｜以 §9 為準：片頭是一集的設定，三處共用｜U5.3–U5.5、U8.5。
- X2 U5 commit 3 的範圍｜§4 U5 commit 3 沒提片頭與「缺的畫面怎麼補」，§8 #4、§9 有｜commit 3＝一鍵成片＋§8 #4＋§9 的 U5.3、U5.4（同一張對話框，一次做）｜U5。
- X3 R2 匯入｜§4 U4 寫白名單含自家 R2、§4 U9 寫「定裝照經 U4 的網址匯入」；實作沒放 R2（`VW/backend/url-import.cjs:23-25`：工作台容器沒有 next-admin 的 R2 公開網址）｜U9 開卡第一步：由 `/capabilities` 的 mainSystem 回 R2 公開 base（單一來源＝`NA/lib/storage/r2.ts`），白名單由它產生；不在工作台另寫一份主機清單｜U9。
- X4 U8 已完成 vs 新項｜監工台 U8 曾標完成，§8、§9 加 U8.3、U8.5｜狀態以 `data.mjs` 為準（現為進行中）｜U8。

缺口：
- G1 「複製連結」沒有工作項｜§8 #15 寫「U6 補」，U6 已完成、監工台無此項｜併進 U5.5（同樣動成片卡）｜U5.5。
- G2 新項沒有模型與相依｜§7、§4「順序」行只到 U11 原項｜U5.3＋U5.4：Opus 5.5＋critic Deep（動 `video-service`）；U5.5 在 U5.4 後，Opus 5.5；U4.4＋U4.5 同一 commit，Opus 5.5；U8.3、U8.5：`fullstack-engineer`（Sonnet）；U8.5 需 U5.3 的 `episode.intro` 形狀先定｜—。
- G3 `video-service` 的部署路徑未寫｜它不是 `/root/lobster-phase1/docker-compose.yml` 的服務（repo `docker-compose.yml:725` 只以網址引用），`sg-deploy.sh:306-308` 不收；與 remotion-service 同類｜U5.4 的工人照 `agency-os/handoffs/2026-11-16-video-unify-supervisor/u8-4-deploy-steps.md` 的格式另寫一份步驟檔（先唯讀查線上 compose 標籤），部署由監工在操作者同意後做；內容工具的文章配片共用這個服務 → 上線後另送一支不帶片頭的片驗證輸出不變｜U5.4。
- G4 兩邊不同步的窗口｜next-admin 每晚 03:00 自動部署 main，工作台只能手動；§4 只寫「next-admin 先、工作台後」｜規則：一張卡若兩邊都動且工作台那一半還沒部署，併入 main 的同時放 `lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD`（`reason=` 一行），兩邊一起手動部署後再 `git rm`｜監工。
- G5 U11 刪除清單的外部引用｜`NA/app/video/(door)/page.tsx:1-2` import `VideoTabs`、`VideoPipeline`（§4 U11 已寫改成導向 `/`，要與刪除同一個 commit）；其餘刪除檔在 `tools/video/` 之外沒有 import（2026-11-16 grep）｜U11 commit 2 開工再 grep 一次｜U11。
- G6 腳本輸出語言是下拉｜`V/ScriptForge.tsx:35` 註解「工具列下拉設定」；U2 已把 `<select>` 改按鈕組，U11 驗收表（§8 #3）確認畫面上是按鈕｜U11。
- G7 瀏覽器實點未做｜兩次部署後只有 smoke 與片頭實送；§8 20 列未在正式站走過｜新監工第一步；發現的問題回寫監工台對應的卡｜U11.1。
- G8 `tests/gate.cjs` 測試清單是一整行｜每張動工作台的卡併入都衝突（2026-11-16 六次）｜改成一行一個；在沒有工人動工作台時單獨一個 commit｜監工。
- G9 遺留測試｜`tests/pj1-legacy-ui.cjs` 在 main 上逾時、不在 gate（U3、U6 回報）｜U11.1 修好或刪除，不留一支永遠紅的測試｜U11。
- G10 片尾與 D18｜§9 的 `episode.outro` 不在 D18 不做清單，不衝突；但片尾模板沿用片頭的五個，沒有專用模板｜不新增模板（不畫蛇添足）；操作者要專用片尾時另開卡｜—。

沒有發現的：資料遺失、隱私、扣款路徑上的矛盾（兩份 risk-triage 共 48 條＋第三批 6 條，現在修 0）。

## 11. 一路走到底（操作者 2026-11-16：「讓他可以一路走到底」）

舊系統：腳本 → 設定 → 生成 → 審片 → 發布（social／WordPress），每頁一顆「繼續 →」（`V/VideoPipeline.tsx` 5 步）。新系統各段都在（§8），但做完一步要自己找下一步。

不變量：
- 任何時候，一集只有一個「下一步」，由同一個純函式算出：`EpisodeSpine.nextAction(...)`（`VW/shared/episode-spine.js`）。它不自己判斷狀態，只讀既有 `stepStates` 的結果（步驟列用的同一份，U6 已讓第 11、12 步讀真實鏈），取第一個還沒完成的必要步驟，回 `{ key, label, target }`；不得出現第二套狀態判斷。一集頁頂、成片卡、任務完成通知三處都只顯示它回的那一顆，不各自判斷。
- 順序固定：沒有鏡頭 →「寫腳本」；有鏡頭缺畫面或沒有成片 →「一鍵成片」（顯示總價 NT$ 後才送）；有成片未審 →「審片」；四項 QA 都過、未核准或沒有草稿 →「發布」；已有社群草稿或 WordPress 嵌入 →「完成」（顯示發布到哪）。狀態不明（查不到主系統）＝不顯示下一步並說明原因，不猜。
- 不是精靈：步驟列與各工具照舊可自由進出；「下一步」只是多一顆主按鈕。
- 每一步完成後停在原地並亮出下一顆，不自動跳頁、不自動送出會花錢或會對外發表的動作（發布一律只到草稿，照舊）。

做法（歸卡）：
- **U6.4（新）**：`nextAction` ＋三處顯示；腳本頁「送去做影片」後落在新的一集、頁頂就是「一鍵成片」；審片面板四項都過時，面板內出現「繼續到發布」（同一面板下半，捲到位）；發布存成草稿後顯示「完成：N 個社群草稿／已嵌入〈文章名〉」與連結。需 U5.3（一鍵成片）先在。模型：Opus 5.5。
- **U11.5（新，驗收）**：用一支真的腳本在正式站從頭走到底：腳本頁寫 3 場 → 送去做影片 → 一鍵成片（含片頭、16:9＋9:16）→ 審片四項過 → 發布存一份社群草稿＋嵌進一篇 WordPress 草稿文章。全程只按畫面上的「下一步」；記錄點擊次數、總花費 NT$、每段耗時。走不通的地方回寫對應的卡。這條過了才做 U11 的入口切換與刪除。
- 測試（U6.4）：`nextAction` 對五種狀態各回對的一顆（純函式單元測試）；狀態不明回 null；三處顯示的是同一個結果（一個 Playwright：改變狀態後三處同時換）。
- 回退：revert；沒有資料變更。

## 12. 一鍵完成與全自動（操作者 2026-11-16）

操作者要的四級：(1) 腳本一鍵完成；(2) 腳本完成後進影片 → 影片一鍵完成 → 草稿；(3) 腳本 → 影片 → 草稿，一鍵；(4) 全自動：給任務 → 搜尋話題 → 生成 → 發布。§11 是人工逐步版，本節是同一條路的自動版。

既有事實（checkout 32bbd8195）：
- 自動等級欄位已在：`media_production_projects.autonomy` = guided｜auto_after_render｜full_auto（`API/projects/route.ts:13` 一帶 AUTONOMY）；快速輸出已收 `autonomy`（`NA/app/api/internal/video/workbench/quick-render/route.ts:71-72`）。
- 出片後自動往下已在伺服器：排程 `video_project_advance`（`NA/lib/schedules/jobs.ts:142-163`）→ `L/project-advance.ts:1-6`：render 完成 → QA → 每比例 Release → 社群草稿；任何一步不過就停、autonomy 退回 guided、`last_error` 寫原因。不需要頁面開著。
- 全自動已在內容工具：話題佇列 `NA/lib/content/topics/tick.ts:1-10`（到期的話題在每日上限內開工、審核、到日子發布）＋`make.ts:29-34`（文章＋`startVideoJob` 配片＋嵌入文章）＋`trending-sources.ts`（找話題）；自動發布只在「審核通過 且 該站設為 AI 審核自動發布」時發生（`tick.ts:6-10`）。這條在 §3 是「文章配片：不動」。

不變量：
- 一個執行器、一個停點，不做三顆各寫一套的按鈕：`episode.autoRun = { until: "script"|"video"|"drafts", budgetTwd }`。§11 的 `nextAction` 是人按；自動＝同一串動作由執行器依序觸發，到 `until` 停。兩者共用同一份步驟定義。
- 人按的一鍵最遠只到草稿（社群草稿、WordPress 草稿文章）。對外發布只有一條路：話題佇列＋站台的自動發布開關（既有守衛）。不新增第二個自動發布入口。
- 送出前顯示整趟預估 NT$（腳本＋缺的畫面＋配音＋輸出＋片頭）並要一個上限；實際花費到上限就停在當步、說明原因，不自動加碼。
- 任何一步失敗＝停在那一步＋原因，退回人工（沿用 `project-advance` 的行為）；不跳過、不降級重試到別的付費模型。
- 出片之前的步驟（補畫面）由工作台主頁 runtime 推動，頁面關掉會暫停、再開接著做（§4 U5 commit 3）；出片之後的步驟在伺服器。要「完全不用開頁面」＝第 4 級，走話題佇列。
- 結束或停下都通知（既有通知管道；管道未驗，開卡先查 `NA/lib/` 的通知模組），訊息含這一集的連結與停在哪一步。

做法（歸卡）：
- 第 1 級 **U3.5（新）**：腳本頁「主題 → 完整腳本」一顆（用該入口的預設模組與品牌語氣，產出後停在腳本頁可改）。腳本頁既有流程不變，只是多一顆。
- 第 2 級 **U5.3（原有，擴充）**：一鍵成片確認框加「做到哪裡停」按鈕組：成片／草稿（預設成片）。選草稿＝送出時 `autonomy: "auto_after_render"`，其後由既有排程做完 QA → Release → 社群草稿；WordPress 草稿嵌入若排程未含（未驗，開卡讀 `L/project-advance-deps.ts` 的 `drafts`），補在同一個 deps 內，不另寫流程。
- 第 3 級 **U3.6（新）**：腳本頁「一鍵到草稿」＝ U3.5 → `spine-create` → 第 2 級選草稿。只是把兩段接起來，沒有自己的邏輯。
- 第 4 級 **U6.5（新）**：不重做。工作台側欄加「自動排程」入口，顯示這個品牌話題佇列的狀態（排隊、進行中、已發布、停下的原因）並連到內容工具的設定；話題佇列出的片在專案頁以唯讀卡出現（U6.3 已有機制），加「接手編輯」把它開成一集（鏡頭＝該片的場景）。話題配片改走工作台的快速輸出供應商是另案（兩個引擎並存是 D3 已知代價）。
- 驗收 **U11.5（擴充）**：除人工走一趟外，第 3 級實跑一次（到草稿），第 4 級在測試站台實跑一個話題到「已排程」，核對花費與上限。
- 測試：`until` 三個值各停在對的地方；超過上限停在當步；出片後某項 QA 不過 → 停、autonomy 回 guided、有通知；人按的一鍵在任何設定下都不會呼叫發布（**突變**：把停點判斷拿掉 → 紅）。
