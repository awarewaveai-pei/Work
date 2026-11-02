# AwareWave 影音工作台：總計畫與卡片順序

更新：2026-11-02（Asia/Taipei）。狀態：規劃。本檔 = **排程、卡片、閘門、路線** 的唯一來源；需求逐項解釋與最低驗收在 [`../handoff/Claude_Code_handoff_20261102.md`](../handoff/Claude_Code_handoff_20261102.md)（下稱 handoff）§1、§2、§4、§9，不在此重複。優先序：操作者最新訊息 > handoff 本階段範圍 > 本檔舊版（git 歷史）。

## 0. 已定案，不再討論

| 決定 | 來源 | 影響 |
|---|---|---|
| 2D、3D 都要：模型、骨架、攝影機、燈光、動作重定向 | handoff §0（操作者 2026-11-02 10:00 改回；handoff 內文相關段已同步） | 3D 自成階段 P5，排在 2D 骨架之後；圖片轉 3D（S4）併入 P5；3D 攝影機與燈光依路線落在 P3 或 P5 |
| 原始碼在 repo `apps/video-workbench`，不叫 seedstar | 操作者 2026-11-02；commit f0d1f58b1、0d02453cc | handoff §3.1 的 `D:\Video` 開發位置與「不建 git」已失效；`D:\Video` 與 Downloads 副本已退場，**只在 repo 改**。 |
| 先做好功能頁，最後才接 video.aware-wave.com | 操作者 2026-11-02 | 部署與接入是最後一張卡（P6），High |
| 【分鏡靈感】六檔不碰；4178 唯一入口；外觀讀 AwareWave tokens；不用中國模型；基本剪輯／動畫不強制付費 AI；自用不扣點 | handoff §2 | 每張卡的共同約束 |
| 先擺場景再生成（四項） | 操作者 2026-11-02 | 併入 P3、P4、P5，見 §4 |

## 1. 現況（2026-11-02 查證）

- 程式：repo 版 = 交付包原始碼 + 畫面去 SeedStar 字樣 + 33 個測試全綠（WORKLOG 2026-11-02 續8、續15）+ 今日搬入的人物跟拍修正（`docs/follow-quality-20261102.md`，三支程式與 `tests/follow-identity.cjs`；四個 follow 測試通過）。
- **4178 現在跑的是 `C:\Users\user1115\Downloads\SeedStar_AwareWave_20261102_完整最新版\SeedStar-app`**（handoff §3.1），不是 repo 版。切換是卡 0。
- 編輯器：自製五軌 `scripts/tools-editor.js:23`，輸出 `backend/editor-export.cjs:182`（FFmpeg）。不是任何外部引擎。
- 主系統可沿用：AI 去背 `../next-admin/lib/studio/bg-remover.ts:35`（Replicate，版本釘死）、fabric 畫布 `../next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx`、Remotion 渲染服務 `../remotion-service`、圖片模型 GPT Image／Nano Banana／FLUX（`../next-admin/lib/tarot/image-gen.ts`）。工作台目前只接 OpenAI（README「本機 OpenAI adapter」）。
- 引擎候選實況（GitHub 2026-11-02）：EffectCraft 首 commit 2026-10-01、v0.19.0（10-31）、自評可做正式工作約 45%；FilmCraft v0.15.0、約 56%；兩者每 3 天一版、Linux 最少測。Web 版（`docs/web.md`）：wasm 約 58 MB、WebGPU（WebGL2 回退）、每 instance 單執行緒＋Web Worker、OPFS／IndexedDB 儲存、記憶體上限 4 GiB、**只內建 Inter／Noto Serif／JetBrains Mono 字型**、解碼為軟體解碼。這些是 P0 的檢查項，不是結論。

## 2. 三條路線（P0 決定走哪條）

| 路線 | 條件 | 剪輯 P2 | 動畫合成 P3 | 2D 骨架 P4 | 3D P5 |
|---|---|---|---|---|---|
| A 單引擎 | EffectCraft Web 通過 P0 全部閘門 | EffectCraft | EffectCraft（含其 3D 攝影機與燈光） | EffectCraft Puppet＋控制器；骨骼鏈／IK 缺口另列 | Blender 處理引擎＋瀏覽器檢視器（P5.0 閘門） |
| B 雙引擎 | EffectCraft 合成通過、剪輯手感或輸出不過 | FilmCraft（P2 開工時再驗） | EffectCraft | 同 A | 同 A |
| C 自製延伸 | EffectCraft Web 任一硬閘不過（見 P0） | 延伸現有五軌＋FFmpeg：多軌增刪、影格裁切、轉場、調色、字幕軌 | 自製 2D 合成器（fabric 圖層＋關鍵影格）＋ Remotion 片頭／動態字幕模板 | 自製樞紐階層＋FK；IK／網格列缺口 | 同 A（3D 攝影機與燈光在 P5 檢視器內做） |

3D 模型、骨架、蒙皮、IK、動作重定向在三條路線都不是 EffectCraft／FilmCraft 的能力（兩者只有 3D 攝影機與燈光），所以 P5 一律另有引擎閘門。路線 C 不是失敗，是「不被 alpha 引擎綁住」；它交付 handoff §4.1–4.4 全部、§4.5 部分（表達式、豐富特效缺）、§4.6 的 A 層。任一路線都不承諾一次到位；每張卡交付明確標「已完成／限制／下一項」（handoff §9）。

## 3. 卡片順序

一次一張卡。每張卡 = 開工前七段（AGENTS §1）→ 做 → REALTEST／REVIEW／BUGHUNT／WORKLOG 四行。測試一律走 `tests/isolated-server.cjs`（自己的埠、暫存資料），不碰 4178（`tests/test-isolation.cjs` 機械守）。

### 卡 0：執行位置切換與基線（先做，半天內）

- 做：確認 4178 持有程序與 `jobs.json` 無進行中任務 → 比對 Downloads（現在跑的）與 repo 兩份 `.data`（筆數、檔案引用）→ 較新的複製進 repo `.data`（gitignored）→ 停舊程序、由 repo `start.cmd` 啟動 → 瀏覽器同網址，localStorage 延續。Downloads 副本只留作復原點，不再改。
- 驗收：4178 畫面出現「示範角色庫」（repo 版才有）；`jobs.json` 筆數不少於切換前；既有素材庫可開；分鏡靈感頁正常；`tests/startup.cjs` 通過。
- 不做：不殺所有 node.exe、不清瀏覽器資料（handoff §3.3）。
- 建議模型：Opus 5.5。

### 卡 P0：EffectCraft Web 可行性閘門（有時限，結果決定路線）

操作者 2026-11-01 曾說這個試驗「先不要」；handoff（11-02）把它列為 P0，以 handoff 為準，開工前仍先問一次。

- 做：釘死一個 release（版本、commit、檔案 checksum、授權存進 `engines/effectcraft/VERSION.json`）；Web 成品放工作台伺服器 `/engines/effectcraft/`，`.wasm` 正確 MIME；只在隔離測試資料跑；**不接付費生成**。
- 同一組測試素材：帶影格編號與音調的 MP4／MOV、PNG、兩路音訊、繁中 SRT。
- 硬閘（任一不過 → 路線 C）：
  1. 這台筆電的 Edge 能啟動（WebGPU 或 WebGL2 回退）且 1080p 預覽可操作。
  2. 匯入 → 多圖層排列 → 影格精確裁切 → 字幕 → 混音 → 保存 → 關閉重開不丟編輯 → 真實輸出 H.264＋AAC，獨立用 FFmpeg 解碼核對影格與音軌。
  3. **繁中字幕能正確顯示與輸出**（內建字型無 CJK；要能載入自有字型，否則 §4.3 全部做不到）。
  4. 專案與媒體能匯出到工作台（不只 `saveToBrowser`），由工作台保存／重開。
  5. 嵌在工作台工作區內：側欄、Escape、返回、焦點回復正常；關閉工作區後 worker／記憶體釋放。
- 軟閘（記錄，不決定路線）：Puppet 控制釘＋null 控制器父子階層小角色（§4.6 A／B 層）；egui 畫布能改到多接近 AwareWave 外觀；HEVC Main10 MOV 的解碼速度；4 GiB 上限下她的實拍片長度。
- 停止條件：全套跑完一次，或遇到無法在 P0 範圍內繞過的阻塞。到點就寫結論，不加碼修引擎。
- 交付：能力表（可用／限制／不可用）、缺口與根因、路線 A／B／C 判定、版本與 checksum。
- 建議模型：做 Opus 5.5；判定路線 Fable 5.1。

### 卡 S3a＋S2：不依賴引擎的生成側兩張（P0 判定後、P1 開工前）

- **S3a 去背接入**：工作台「去白底」旁加「AI 去背」，呼叫主系統同一供應商同一版本（`bg-remover.ts` 的 Replicate 版本），本機階段經 `backend/` 轉發、成本進既有任務紀錄；結果為透明 PNG 存素材庫。驗收：自有測試圖去背 → 素材庫可見 → 可當參考圖。
- **S2 同一個場景拍好幾鏡**：素材可標記為「場景」；專案頁分鏡（`scripts/projects-0.js`）加「使用場景」欄位與景別（遠／中／近／俯／仰）；每鏡用圖片編輯送「場景圖＋角色參考圖＋鏡頭描述」；同場景鏡頭並排比對。驗收：一場景三鏡皆引用同一場景素材 ID；重生一鏡不影響其他；草稿還原後引用仍在。畫面明示一致性取決於模型。
- 建議模型：Opus 5.5。

### 卡 P1：引擎接入與保存閉環（路線 A／B）或 自製編輯器資料契約（路線 C）

- 共同：專案外層格式（格式版本、引擎與版本、原生專案引用、素材 ID、幀率／有理時間、輸出設定、修改版本）；新舊編輯器並存、各自格式、舊五軌專案先保存原版再轉；成果回素材庫並記來源專案版本（handoff §6.3、§4.7）。
- A／B：adapter 只包驗證過的操作（載入、能力、匯入、開／存、預覽、輸出、取消、釋放）；引擎檔釘版本放 `engines/`。
- 驗收：選素材建專案 → 編輯 → 保存 → 重開 → 輸出 → 成果回素材庫；切回舊編輯器入口可用。
- 建議模型：Opus 5.5。

### 卡 P2：完整影片剪輯（handoff §4.1–4.4）

多軌增刪、影格裁切、時間軸編排、轉場、調色、字幕（SRT 進出＋燒錄）、混音、五種比例。路線 B 在此卡開工時才驗 FilmCraft，一樣走 P0 式閘門。驗收：MOV／MP4＋圖片＋兩路音訊＋字幕＋轉場成短片，獨立解碼核對。建議模型：Opus 5.5（可拆子卡派 Codex）。

### 卡 P3：2D 動畫與合成（handoff §4.5）＋ S3b 去背拼貼

圖層、2D 變形、遮罩、遮罩合成、關鍵影格、曲線、受限表達式、少量特效、動態字幕、片頭。**S3b「去背後 2D 拼貼成構圖」就是這個工作區的圖層操作**（移動、縮放、旋轉、上下層）加「匯出構圖為圖片 → 帶入生成當參考圖」，不另做第二個畫布。驗收：可改標題的片頭含緩動、遮罩、混合、一個表達式，輸出透明成果回時間軸再回來源修改。建議模型：方向 Fable；做 Opus 5.5。

### 卡 P4：2D 角色與骨架（handoff §4.6）＋ S1 姿勢參考

A 層肢體綁定 → B 層 Puppet 網格 → C 層骨骼鏈／IK／權重（能力表誠實標缺口）。**S1「人偶擺姿勢再換成角色」= 這裡的綁定角色擺好姿勢後「匯出姿勢圖 → 帶入圖片編輯，附角色參考圖」**；姿勢存在角色底下可重用。驗收：身體／上臂／前臂／手掌角色做揮手，保存重開可改；同一角色兩個姿勢各生成一次並留截圖比對。建議模型：方向 Fable；做 Opus 5.5。

### 卡 P5：3D 模型、骨架、攝影機、燈光、動作重定向（handoff §0）＋ S4 圖片轉 3D

- **P5.0 閘門（先做，有時限，同 P0 格式）**：Blender 以背景程序（`blender -b --python`）當處理引擎、瀏覽器內用固定版本的開源 3D 檢視器（three.js 類）顯示與擺位。硬閘：GLB 進出不丟骨架與權重；一個自有或合法測試角色能在本機完成骨架建立、蒙皮、IK 擺姿勢、匯入一段動作並重定向到另一骨架、渲染成帶 alpha 的影格序列回剪輯；檢視器內旋轉／移動／縮放／鏡頭／燈光可操作並能截圖。不過 → 列缺口與替代（例如只做檢視與擺位、骨架留 Blender 內操作），不硬做。
- 做：3D 工作區（檢視器＋鏡頭＋燈光＋物件擺位）→ 骨架與動作（Blender 任務：建骨、權重、IK／FK、姿勢、動作匯入、重定向；任務可取消、可失敗、結果版本化）→ 渲染回時間軸（RGBA 序列＋獨立音訊，同 P3 交換格式）。
- **S4「圖片轉 3D 物件再擺位置」= 此工作區的匯入來源之一**：供應商候選 Meshy、Rodin（開工第一步確認 API、價格、授權、輸出 GLB；不用 Hunyuan 3D、Tripo 等中國模型）→ GLB 進檢視器擺位 → 截圖帶入生成或拼貼。
- 驗收：測試角色完成綁定與一段重定向動作，保存重開可改姿勢與曲線，渲染回影片專案；一張自有物件圖轉 GLB、擺到指定角度截圖、帶入生成頁。初版只支援驗證過的格式（GLB；FBX／BVH 逐項公布），不把相容性當既成事實。
- 限制：Blender 是本機桌面依賴，網頁內不能直接操作它；網頁內的骨架操作走檢視器＋命令橋接。上線（P6）時 Blender 要以 headless 容器跑在 ks-aw-01，CPU 渲染慢，先量再承諾。
- 建議模型：P5.0 判定與工作區設計 Fable 5.1；Blender 任務腳本與檢視器 Opus 5.5。

### 卡 P6：上線到 video.aware-wave.com（High，等操作者 go）

- 工作台成為 ks-aw-01 compose 服務（AGENTS §0 七項：test gate／healthcheck／smoke／rollback／notification／typecheck／`products.ts` 登記列）；`shared/adapters.js` HttpAdapter 接主系統身分、R2 儲存、任務 worker；Host／Origin 限制（`backend/api.cjs:442`）改為設定；`contracts.d.ts` 已寫的「拒絕碼只能在未送供應商前回」由主機端遵守。
- 程式內部名稱（`window.SeedStar`、`/api/seedstar`、next-admin `tools/seedstar`、`AWAREWAVE_SEEDSTAR_URL`）在此卡一起改為 video-workbench。
- WordPress 兩用途（會員進工具、成果交付）另開卡，不借此卡部署。
- 建議模型：Fable 規劃；Opus 5.5 執行。

## 4. 四項「先擺場景再生成」的落點

| 項 | 落點 | 原因 |
|---|---|---|
| 去背後 2D 拼貼 | S3a 去背接入（早做）＋ S3b 在 P3 合成工作區 | 拼貼畫布 = 合成圖層，不做兩套 |
| 同場景多鏡 | S2，獨立卡 | 純生成側，不依賴引擎 |
| 人偶擺姿勢換角色 | P4 的綁定角色＋「姿勢→參考圖→生成」 | 姿勢編輯器 = 骨架控制器，不做兩套 |
| 圖片轉 3D 擺位置 | P5 的匯入來源（S4） | 需要 P5 的 3D 檢視器，不另做 |

借的是 ArtCraft（https://github.com/storytold/artcraft）的流程；不用其程式、雲端或模型清單（多為中國模型）。模型只用 GPT Image、Nano Banana、FLUX；Replicate 上的 Runway 做動態。

## 5. 每張卡的共同閘門（摘 handoff §9，機械化部分）

- 分鏡六檔 SHA-256 不變：`tests/storyboards-design-baseline.json`（`tests/generator-deep-actions.cjs` 驗）。
- 測試不連 4178、不用擷取圖：`tests/test-isolation.cjs`。
- 輸出要獨立解碼核對影格與音軌，不信 HTTP 200。
- 側欄／Escape／焦點：`tests/sidebar-overlays.cjs`。
- 外觀：`tests/appearance.cjs`。
- 每卡四行證據進 `agency-os/WORKLOG.md`；跨模型審查依 AGENTS §4。

## 6. 風險與對策

- **引擎 alpha**：每 3 天一版、API 會變 → 釘版本與 checksum，升級是獨立卡；P0 有時限與硬閘；路線 C 永遠存在。
- **外觀**：egui 畫布吃不到 CSS tokens → P0 軟閘量化差距；不過就只把它當「專業工作區」、外殼維持 AwareWave，不假裝整合完成。
- **繁中字型**：P0 硬閘 3。
- **資料分歧**：三份 `.data`／兩份程式 → 卡 0 收斂成一份，之後只有 repo。
- **額度**：每卡小而完整；同一問題同法失敗兩次就停（AGENTS §5）。
- **跟拍重識別**：`docs/follow-quality-20261102.md` 說明本次只是降低錯認；提高實拍連續正確跟隨是獨立後續卡，不混進上面任何一張。

- **3D 是最大的未知**：引擎不在 EffectCraft／FilmCraft 內；Blender 橋接是桌面依賴、上線要 headless 容器 → P5.0 獨立閘門，排在 2D 全部驗收之後，不讓它拖住剪輯與 2D。

## 7. 延後（不排期，不刪需求）

平台扣點與訂閱；WordPress 嵌入與交付；跟拍遮擋後重識別；FilmCraft（除非 P0 判為路線 B）；Blender 以外的 3D 引擎比較（只在 P5.0 不過時做）。

## 8. 參考

- handoff：`../handoff/Claude_Code_handoff_20261102.md`
- 跟拍修正：`follow-quality-20261102.md`
- EffectCraft：https://github.com/storytold/effectcraft（`docs/web.md`、`docs/agents.md`）
- FilmCraft：https://github.com/storytold/filmcraft
- ArtCraft：https://github.com/storytold/artcraft
- 舊版本檔（含 3D 階段原文）：`git log -- docs/creative-suite-plan-20261102.md`

上游文件描述的是引擎能力，不等於本工作台已實作或已通過整合測試。
