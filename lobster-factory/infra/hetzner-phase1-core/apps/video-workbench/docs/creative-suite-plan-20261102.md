# AwareWave 影音工作台：總計畫（專業 media 工具）

更新：2026-11-02 v4（Asia/Taipei；v3 經 critic 審後修 1C／12M／10m，見 WORKLOG 11-02 續22）。本檔 = 排程、卡片、閘門、路線、架構不變量的唯一來源。需求逐項與最低驗收在 [`../handoff/Claude_Code_handoff_20261102.md`](../handoff/Claude_Code_handoff_20261102.md)（handoff）§1、§2、§4、§9，不重複；每卡驗收 = handoff 對應 § 每列最低驗收＋本檔該卡「驗收」欄。優先序：操作者最新訊息 > handoff > 本檔舊版（git）。讀者是 AI agent：只寫事實與決定。

## 0. 已定案

| 決定 | 來源 |
|---|---|
| 2D、3D 都要：模型、骨架、攝影機、燈光、動作重定向；3D 排 2D 之後（P5） | handoff §0，操作者 11-02 10:1x |
| 唯一工作副本 = repo `apps/video-workbench`；`D:\Video` 退場、Downloads 副本已刪（卡 0 後，操作者 11-02）；名字不叫 seedstar | 操作者 11-02；f0d1f58b1、0d02453cc |
| 先做好功能，最後接 video.aware-wave.com（P6，High） | 操作者 11-02 |
| handoff §2 全部有效（分鏡六檔不碰、4178 唯一入口、AwareWave tokens、不用中國模型、基本剪輯不強制付費 AI、保留原檔） | handoff §2 |
| 「先擺場景再生成」四項借 ArtCraft 流程，不用其程式／雲端／模型；落點 S3a＋P3（去背拼貼＝圖層）、S2（同場景多鏡）、P4（人偶擺姿）、P5（圖片轉 3D）；生成模型只用 `backend/generation-policy.cjs:7` 現行 OpenAI 路由 | 操作者 11-02 |
| **主系統契約沿用方式**：純契約檔直接 `import()` `../next-admin/lib/content/video/{asset-origin,platform-ratio,delivery-contract,caption-formats,timeline-v1}.ts`（只依賴 `node:crypto`；Node v24.14.0 type stripping 實測 `ratioFor("linkedin",["16x9"])`→`16x9`）；P6 容器 build context 含這些檔；**禁止複製一份** | 本檔 v4；AGENTS §0「不另建帳本／登入／素材庫」 |
| 引擎升級＝獨立卡（釘版＋checksum 改動），不夾帶 | 本檔 v4 |
| **圖片轉 3D（S4b，2026-11-03 操作者「好」）**：主力 Stability AI API（SPAR3D／SF3D，英國）＋本機 Stable Fast 3D（免費，RTX 5060 8 GB）；備援 Replicate TRELLIS（2026-11-03 改，沿用去背金鑰；原 fal TRELLIS.2）；**Meshy 停用**（營運實體疑在北京，adapter 保留不設預設）；綁骨／動作用 Blender（P5）＋S4b 補：生成模型 Rigify 自動人形骨架（非人形手動對位）、內建免費動作庫（CMU BVH）。卡排 P6 之後 | `docs/s4-image-to-3d-providers-20261103.md` |
| **路線 = C**（P0 2026-11-02）：合成類 ③ 不能載入自備字型，繁中顯示 NO GLYPH（上游 web.md:68），另 ① WebGPU 54 s device lost、WebGL2 0.47× 即時，⑤ 焦點出不了 iframe；剪輯類 ② 重開後素材離線。重評條件：上游支援使用者字型時，`node scripts/vendor-effectcraft.cjs` 後重跑 P0（engines/effectcraft/VERSION.json 改版＝獨立卡） | `docs/p0-effectcraft-gate-20261102.md` |
| **路線 = B（操作者 2026-11-06）**：FilmCraft、EffectCraft 做成「專業剪輯」「專業特效」入口，跟自製工具並存；先做專案主線。卡 PJ／FC／EC，規格 `docs/engine-route-plan-20261106.md` §9。重評結果：③ 字型、⑤ 焦點、② 重開素材都有解法（建置時編入繁中字型、工作台側按鍵監聽、`footage.relink`）；① 效能仍看顯示卡（內顯不行，RTX 5060 的 WebGPU 可用且沒再斷線）。FilmCraft main 有嵌入橋 `?host=parent`。建議 B：並存，FilmCraft 先；三條路線都先做「一支影片一條線」專案主線 | `docs/engine-route-plan-20261106.md`、`docs/p0-reeval-gates-20261106.md` |

## 1. 現況與缺口（2026-11-02 查證，`file:line`）

| 層 | 現況 | 缺口 → 卡 |
|---|---|---|
| 探測 | `backend/media-inspect.cjs:3-52`：regex 刮 `ffmpeg -i` stderr，只得 duration／寬高／rotation／有無音訊；**無 ffprobe**（`package.json:9` 只有 `ffmpeg-static` 5.3.0 = ffmpeg 6.1.1 essentials，含 xfade／loudnorm／ebur128／zscale／lut3d） | codec、fps 有理數、pix_fmt、色彩空間、音軌數；手機 HEVC Main10 MOV 在 headless Edge 解碼不可靠（`docs/follow-quality-20261102.md:29`）→ M1 |
| 資產身分 | `shared/models.js:2-12`：randomUUID＋url 字串；檔案 `.data/generated`（`backend/api.cjs:8`）；清單在 localStorage（`shared/adapters.js:9`，key `:11`）；任務 `.data/jobs.json`（`backend/api.cjs:10`） | 無內容雜湊、來源／模型／成本／父資產；**瀏覽器與伺服器兩個真相** → M1／M2 |
| 代理／縮圖／波形 | 無（grep 0 命中） | → M1 |
| 時間 | `backend/editor-export.cjs:35-60` 浮點秒（`:56-58`） | 有理時間＋整數影格（handoff §4.2）→ M3 |
| 剪輯 | 固定五軌 `scripts/tools-editor.js:23`；輸出 `editor-export.cjs:182`：libx264＋aac yuv420p、720p／1080p、eq／colorbalance／hue、`loudnorm=I=-16:TP=-1.5`（`:512`）、afade／amix、ass 字幕；轉場五種（`:72`：融接、淡入淡出、左右擦除、圓形裁切；實作 `:376-392`，無 xfade）；比例 `:5`（16:9、9:16、1:1、4:5、4:3） | 增刪軌、影格裁切、xfade、bt709 標記、4K → P2 |
| 字幕 | `backend/subtitle-burn.cjs:8` buildAss；主系統 `caption-formats.ts:34 toSrt`／`:39 toVtt`（`:19` 重疊即 throw；無匯入 parser） | 匯入 parser、重疊處理 → P2；動態／逐字 → P3 |
| 動畫合成／骨架／3D | 無 | P3／P4／P5 |
| 主系統治理鏈 | `../next-admin/lib/content/video/`：`asset-origin.ts:9-12`（`AssetOrigin` = ai_generated／pexels／upload，HMAC）、`timeline-v1.ts`（fps 白名單 `:8` 24／25／30／60；比例 profile `:9`；資產 ID = media_assets uuid `:39`；對齊 `:52` `(ms*fps)%1000===0`）、`platform-ratio.ts:5-18 RATIO_PREFERENCE`（只認 16x9／9x16／4x5，`:28`）、`delivery-contract.ts:3`（wordpress／postiz）、`caption-formats.ts`、`qa-*`、`release-*`、`reconcile.ts`、`job-store.ts`（`video_jobs` 1h TTL 進度表 `:10-11`、`:67`，**不是帳冊**）；表 `media_assets`（0007:40 建表 uuid＋`organization_id`／`workspace_id` NOT NULL＋`storage_key`→R2；0038:37 `checksum_sha256`；0138:21 formats 限 16x9／9x16／4x5；0065–0071）；發文 `postiz.ts:195 uploadVideo`／`:237 createSocialPost`；成本 `../next-admin/lib/ai/cost-model.ts:184`（`bg-remove` 0.011 USD）；QA 檢查碼 `../video-service/quality.py:20-96`（`container.*`、`audio.loudness` −30～−6 LUFS、`audio.true_peak` ≤ −1 dBTP、`caption.timing`）；轉錄 `transcription.ts:15`（`host` 本機 whisper，免費） | 工作台成果最後流進這條鏈（P6） |
| 引擎候選 | EffectCraft v0.20.0／FilmCraft v0.16.0（2026-11-01），alpha，每 3 天一版；Web：wasm ≈58 MB、WebGPU（WebGL2 回退）、單執行緒＋Worker、OPFS、4 GiB 上限、內建字型只有 Inter／Noto Serif／JetBrains Mono（**無 CJK**，不掃系統字型）（上游 `docs/web.md`） | P0 檢查項 |

## 2. 三條路線（P0 決定）

| 路線 | 條件 | 剪輯 P2 | 合成 P3 | 2D 骨架 P4 | 3D P5 |
|---|---|---|---|---|---|
| A 單引擎 | P0 合成類＋剪輯類硬閘全過 | EffectCraft | EffectCraft（2.5D 合成攝影機，不算 P5 交付；handoff `:151`） | Puppet＋控制器；骨骼鏈／IK 列缺口 | Blender 處理引擎＋瀏覽器檢視器（P5.0） |
| B 雙引擎 | 合成類全過、剪輯類任一不過 | FilmCraft（P2 開工再驗）；跨引擎交換 = 透明 PNG 序列＋獨立音訊，對齊 fps／起始影格／時長／alpha（handoff `:183`） | EffectCraft | 同 A | 同 A |
| C 自製延伸 | 合成類任一不過，或操作者否決 P0 | 現有五軌＋FFmpeg 延伸 | 自製 2D 合成器（fabric 圖層＋關鍵影格）＋Remotion 片頭／動態字幕模板，經 `../next-admin/lib/content/video/remotion-client.ts:7`（本機另起 remotion-service） | 自製樞紐階層＋FK | 同 A |

3D 模型／骨架／蒙皮／重定向不在兩個引擎內，P5 一律另有閘門。M1–M3 與路線無關，三條都要。

## 3. 媒體核心不變量（M1–M3 交付；之後每卡受其約束）

1. **資產 ID = uuid；內容雜湊另存 `checksum_sha256`**（欄名同 0038:37）。檔案目錄 `.data/media/<sha256>/`（`original.*`、`proxy.mp4`、`thumb/`、`waveform.json`、`probe.json`）只負責去重：同內容多筆資產共用目錄，各有自己的來源／權利。→ M1
2. **來源紀錄隨資產**：型別 = `AssetOrigin`（`asset-origin.ts:9-12`）＋工作台擴充 `{kind:"render"|"import", parentAssetId, prompt?, costUsd?}`；P6 寫入 `media_assets.metadata.rightsSources`（`asset-origin.ts:16-17`）。生成結果一律是資產，才能進時間軸。→ M2
3. **探測結構化**：`ffprobe -print_format json -show_streams -show_format`；保存 codec、`r_frame_rate`（有理數）、pix_fmt、color_primaries／transfer／space、rotation、音軌數／取樣率／聲道。regex 刮 stderr 全數移除。→ M1
4. **代理檔規則**：來源非瀏覽器可解（HEVC、10-bit、>1080p、非 yuv420p）→ 自動產 H.264 1080p／720p＋AAC 代理；預覽用代理，輸出用原檔。→ M1
5. **時間 = 有理數＋整數影格**：專案 fps 明示（含 29.97＝30000/1001）；片段起點／長度存 `{num, den}` 或影格數；浮點只在 UI 與 FFmpeg 參數邊界。**互通格式 = MediaTimelineV1**，匯出有損（`timeline-v1.ts:52` 量化到 ms 且 `(ms*fps)%1000===0`；`:8` fps 白名單），匯出時列出丟失。→ M3
6. **伺服器為唯一真相**：資產清單、專案、任務在伺服器帳冊（本機 `.data`；P6 → `media_assets`＋新任務帳冊，見 P6）；localStorage 降為快取。`backup.export／import`（`shared/runtime.js:407-413`）改走伺服器。→ M2
7. **任務**：冪等鍵、進度、取消、重試、失敗原因、保留紀錄（handoff `:43`）；沿用 submissionRejected／Unconfirmed 語義（`shared/runtime.js:188`）與 `contracts.d.ts:71-74` 拒絕碼。→ M2
8. **輸出驗證**（不信 HTTP 200）：① ffprobe 核對時長／fps／比例／音軌／色彩標記 ② 指定影格精確解碼（`-ss` 放輸入之後）比對影格編號圖樣 ③ `ebur128`／`astats` 證明音軌非靜音；檢查碼對齊 `quality.py:20-96`；結果寫回資產紀錄。→ M3
9. **AI 介面**：付費 AI 只在按鈕、按前顯示預估成本（`cost-model.ts`）、按後記實際成本；基本剪輯／動畫／骨架零付費依賴。→ S3a 驗收
10. **格式外層**：`{formatVersion, engine, engineVersion, nativeProjectRef, assets[], timebase, output, revision}`；原生專案另存（handoff `:236`）。→ M3

## 4. 卡片順序

一次一張卡；每卡 = 七段 → 做 → 四行證據（AGENTS §1）。測試走 `tests/isolated-server.cjs`，`tests/test-isolation.cjs` 機械守。模型欄依 AGENTS §5：想＝Fable，做＝Opus，卡寫死＝Codex `/codex-do`，純資料＝`data-filler`。

| # | 卡 | 做 | 驗收 | 模型 |
|---|---|---|---|---|
| 0 | 切 4178 到 repo | 確認埠持有程序與 `jobs.json` 無進行中任務 → 比對 Downloads 與 repo `.data` → 較新者進 repo `.data` → 停舊、`start.cmd` 起新。列出只在本機的檔（`assets/storyboards-data.json`＝受保護基線卻被 `.gitignore` 排除、`assets/image-*`、`runtime/`、`.data/`）；.data 由 Downloads 複製進來（82d19db9e），之後副本由操作者刪除 | 4178 出現「示範角色庫」（`pages/characters.html:24`，Downloads 版無）；jobs 筆數不少；素材庫、分鏡頁正常；`tests/startup.cjs` 過 | Opus |
| M1 | 媒體存放、探測、代理 | 釘 ffprobe（與 ffmpeg 同 build 6.1.1，checksum 入 `assets/vision/sources.json` 同式清單）＋`start.cmd` 安裝檢查；`backend/media-inspect.cjs` 換 ffprobe JSON；新增 `backend/media-store.cjs`（uuid＋sha256、目錄、代理、縮圖、波形）；輸出 ffprobe helper 供 P0 用 | 不變量 1／3／4：同一檔上傳兩次只存一份目錄、兩筆資產；probe.json 含 fps 有理數與色彩欄位；HEVC Main10 MOV 匯入後預覽可播、輸出用原檔；既有 33 測試綠＋`tests/media-store.cjs` | 設計 Fable；做 Opus |
| P0 | EffectCraft Web 閘門（**8 小時工時上限**） | 釘 release＋checksum＋授權於 `engines/effectcraft/VERSION.json`；放 `/engines/effectcraft/`，wasm MIME 正確；隔離資料；不接付費生成。素材：帶影格編號與音調的 MP4／MOV、PNG、兩路音訊、繁中 SRT | **合成類硬閘**（任一不過→C）：① 此筆電 Edge 1080p 預覽可操作且**有聲**（handoff `:291`） ③ **繁中字幕可顯示與輸出**（可載自有字型） ⑤ 嵌入工作區後側欄／Escape／焦點正常、關閉後 worker 釋放。**剪輯類硬閘**（任一不過→B）：② 匯入→多圖層→影格裁切→字幕→混音→保存→重開不丟→輸出 H.264＋AAC，M1 helper 核對 ④ 專案與媒體可匯出給工作台保存。**軟閘**：Puppet＋null 控制器小角色；egui 外觀可改程度；HEVC 解碼速度；4 GiB 下實拍片長。停止：時限到或無法繞過阻塞。交付：能力表、缺口、路線判定 | 做 Opus；判定 Fable。**操作者 11-01 說過先不要，開工前再問；否決→C** |
| M2 | 帳冊上伺服器 | 資產／專案／任務帳冊搬 `.data`（JSON 檔，P6 換表）；`AssetOrigin`＋擴充型別；舊 localStorage 資料遷移（保留原版、寫對照表）；`backup.export／import` 改走伺服器；任務欄位補冪等鍵／取消／重試／失敗原因 | 不變量 2／6／7：每筆資產有 origin；清掉 localStorage 後資產與專案清單仍完整；重送同冪等鍵不重跑；取消中任務狀態正確；`tests/media-ledger.cjs` | Opus |
| M3 | 時間型別、輸出驗證、格式外層 | `{num,den}`／影格型別＋UI 轉換；MediaTimelineV1 匯出器（列丟失）；輸出驗證三步（不變量 8）成共用 helper；專案外層格式；五軌編輯器改用此契約（存原版再轉） | 不變量 5／8／10：29.97 專案裁切重開不偏移；匯出 V1 通過 `timeline-v1.ts` 驗證並列出量化丟失；故意靜音輸出被判 fail；舊五軌專案轉換後未支援欄位列出；`tests/media-contract.cjs` | 設計 Fable；做 Opus |
| S3a＋S2 | 去背接入；同場景多鏡 | 去背同供應商同版本（`../next-admin/lib/studio/bg-remover.ts:12`，單價 `cost-model.ts:184`，按鈕顯示），經 `backend/` 轉發，結果為透明 PNG 資產（origin ai_generated）；場景標記＋專案分鏡「使用場景」欄＋景別（遠／中／近／俯／仰）→ 圖片編輯送場景圖＋角色圖＋鏡頭描述；順手清 Seedance 標籤（`scripts/templates-0.js:47,63,78,93,108,124`、`scripts/characters-0.js:441`；`storyboards-0.js` 受保護不動） | 不變量 9：去背按鈕顯示成本，按後記實際成本；版本常數與主系統一致測試；去背→素材庫→可當參考圖；一場景三鏡引用同一場景資產 ID，重生一鏡不影響他鏡 | Codex（卡已寫死） |
| P1 | 引擎接入與保存閉環 | A／B：adapter 只包驗證過的操作（載入、能力、匯入、開存、預覽、輸出、取消、釋放）；引擎檔釘版放 `engines/`；B 另做 PNG 序列＋音訊交換。C：五軌編輯器已在 M3 接契約，此卡補 Remotion 模板路徑 | 選素材建專案→編輯→保存→重開→輸出→成果成資產（含 origin render＋parentAssetId）；切回舊編輯器可用 | Opus |
| P2 | 完整剪輯（handoff §4.1–4.4） | 增刪軌、影格裁切、xfade 轉場、調色（曝光／對比／白平衡／飽和／LUT）＋bt709 標記、多路混音＋關鍵影格音量＋峰值表；響度目標可設定，預設沿用 `-16 LUFS`（`editor-export.cjs:512`）；字幕匯出沿用 `toSrt`／`toVtt`（重疊先合併或拆開），匯入 parser 新寫；五比例＋4K；投遞比例直接讀 `RATIO_PREFERENCE`，只做 `16:9`↔`16x9` 寫法轉換，**不另建預設表** | MOV／MP4＋圖片＋兩路音訊＋重疊字幕＋xfade 成片；M3 helper 三步核對；響度在目標 ±1 LU 且真峰值 ≤ −1 dBTP；B 路線此卡開工才驗 FilmCraft | Opus；子卡（xfade、字幕 parser）Codex |
| P3 | 2D 動畫合成（§4.5）＋S3b | 圖層、2D 變形、遮罩、遮罩合成、關鍵影格、曲線、受限表達式、少量特效、動態字幕（字詞時間來自 `transcription.ts:15` `host` 引擎，拿不到退回整句）、片頭模板；**拼貼 = 此工作區圖層**＋「匯出構圖→參考圖」 | 可改標題片頭含緩動、遮罩、混合、表達式；逐字高亮預覽與輸出同一影格；透明成果回時間軸再回來源修改 | 方向 Fable；做 Opus |
| P4 | 2D 角色骨架（§4.6）＋S1 | A 肢體綁定→B Puppet→C 骨骼鏈／IK／權重（能力表誠實）；**姿勢→匯出姿勢圖→圖片編輯附角色參考**，姿勢存角色下 | 身體／上臂／前臂／手掌揮手，保存重開可改；同角色兩姿勢各生成一次留比對截圖 | 方向 Fable；做 Opus |
| P5 | 3D＋S4 | **P5.0 閘門**：Blender 背景程序（`blender -b --python`）＋固定版本瀏覽器檢視器（three.js 類）；硬閘：GLB 進出不丟骨架權重；測試角色建骨→蒙皮→IK 擺姿→匯入動作重定向→渲染 RGBA 序列回剪輯；檢視器旋轉／鏡頭／燈光可操作可截圖。過→3D 工作區、Blender 任務（可取消、版本化）、渲染回時間軸；S4 圖片轉 3D 候選只有 **Meshy**（矽谷；開工前確認 API／價格／授權／GLB／資料處理地；Rodin 屬上海 Deemos，排除） | 角色綁定＋重定向動作，保存重開可改，渲染回專案；物件圖→GLB→指定角度截圖→生成頁。初版只支援驗證過格式 | P5.0 與設計 Fable；做 Opus |
| P6 | 上線 video.aware-wave.com（High） | compose 服務＋七項清單（AGENTS §0）；HttpAdapter 接主系統身分；**四項明寫**：① 資產帳冊 → `media_assets`（補 `organization_id`／`workspace_id`；`.data/media` → R2 `storage_key` 搬移腳本；`rightsSources` 寫入）② 任務帳冊 → 新表（`video_jobs` 是 1h TTL 進度表，不可用）③ 比例 1:1／4:3 需 migration 放寬 0138:21 與 `platform-ratio.ts:28`（**High**，另卡先過 db-expert）④ 許可走 `can(主體, feature_key, actor)`（ADR 017 §4）；成果走 QA→release→delivery（`delivery-contract.ts`）→ Postiz＋WordPress；`RATIO_PREFERENCE` 決定投遞比例；成本接 `cost-model.ts`；Host／Origin（`backend/api.cjs:442-446`）改設定；內部名稱 SeedStar→video-workbench；Blender headless 容器先量 CPU 渲染 | sg-deploy 綠、smoke 過；一支成品從工作台 → Postiz 草稿 **與** WordPress 草稿全鏈通；`media_assets` 列含 checksum 與 rightsSources | Fable 規劃；Opus 執行；等操作者 go |
| S4b | 圖片轉 3D 換供應商＋自動骨架 | 見 §0 圖片轉 3D 列：provider adapter（Stability API 主力、本機 SF3D 免費、Replicate TRELLIS 備援，Meshy 停用）；Blender Rigify 自動人形骨架；內建 CMU BVH 動作庫；一個 job id 只呼叫廠商一次 | 同 10 張圖三方式比品質定預設；人形模型自動綁骨＋套動作，保存重開可改 | Opus |
| RV | 影片模型接 Replicate | 見 `docs/replicate-video-models-plan-20261105.md`：NA `MOTION_MODELS` 抽成無 import 的 `next-admin/lib/ai/video-motion-models.ts`，VW 經 `awarewave-files.txt` 直接讀（不建第二份清單）；每個任務依 `settings.model` 選 sora-2（OpenAI）或 Runway／Veo／Luma（Replicate）；價格只讀 `cost-model.ts` `VIDEO_MOTION_RATES`；模型按鈕顯示價格、不用下拉 | 舊專案 `sora-2` 送出內容與改前相同；假 fetch 測送出欄位＝NA `buildInput`、重開續輪詢、取消；真打一次 Runway 5 秒（US$0.25）成品可播、帳冊與用量記 `runwayml/gen4-turbo` | Opus |
| RE | 引擎路線重評＋專案主線計畫 | 見 `docs/engine-route-plan-20261106.md`（R0 計畫）與 `docs/p0-reeval-gates-20261106.md`（差距表、五閘）：EffectCraft v0.21.1、FilmCraft main `46763a8` 各加繁中字型試建（補丁與腳本在 `docs/p0-reeval-evidence/`）；三條路線 A 取代／B 並存／C 自製補缺口各附 rollback；專案主線回答重評 handoff §2b 四問。不改正式程式、不部署 | 差距表、五閘證據、R0 計畫三份齊；操作者選路線後，才把該路線的卡加進本表 | Fable |
| PJ | 專案主線：一支影片一條線 | 見 `docs/engine-route-plan-20261106.md` §6、§9 PJ：專案頁的「集」＝一支影片，底下掛剪輯檔、步驟紀錄、成片；舊剪輯專案原樣收進專案頁；工具做完自動寫回；來源改了標示要重做。等卡 RV.4 結束才動 `scripts/projects-0.js` | 舊資料測試（筆數相同、每筆能開、輸出設定相同）；照 §6 答 1 的例子走完，每一步成品自動出現在下一步 | 設計 Fable；做 Opus |
| FC | 專業剪輯（FilmCraft 嵌入） | 見同檔 §9 FC.0–FC.4：建置鏈沿用 `scripts/craft-web-build/`；外框頁用上游嵌入橋 `?host=parent` 送檔、收存檔與輸出；輸出當成一筆已完成的任務，入帳與送審走現有路；主機靜態目錄＋nginx（High） | 送素材 → 存檔 → 重開 → 輸出 → 任務紀錄與主系統資產都有、帶來源紀錄 → 送審檢查過；瀏覽器下載零次；內顯電腦看到提醒 | 卡 FC.1 寫死可派；其餘 Opus；FC.4 等操作者 go |
| EC | 專業特效（EffectCraft 嵌入） | 見同檔 §9 EC：FC 驗收後才開；建置鏈同型，另補嵌入橋（照 `scripts/photocraft-pro/web-host-api.patch` 的做法）；頁面與入帳沿用 FC 的外框與路由 | 同 FC 的流程在 EffectCraft 走通；重開專案素材不離線 | Opus |
| MV | MV 模式：一首歌 → 完整 MV | 見 `docs/mv-mode-spec-20261114.md`（規格與卡 MV.1–MV.10）：`episode.song` 掛在一集上；人聲分離（已接的 ElevenLabs 列＋自家 CPU Demucs 列）、歌詞對時（自家 whisper）、每鏡綁道具、依段落粗剪免費；作曲沿用 `music.cjs`，唱歌對嘴 Hedra 付費按鈕標 NT$；角色特徵鎖定只在 `backend/character-lock.cjs` 一處注入。共用檔只加掛載行（該檔 §6） | 每卡各自驗收（該檔 §5 表）；到 MV.9 為止用上傳的歌可免費從歌走到粗剪 | 規格 Fable；做 Opus；MV.2／MV.10 卡寫死可派 |

## 5. 機械閘門（每卡）

分鏡六檔雜湊 `tests/storyboards-design-baseline.json`（`tests/storyboards-baseline.cjs` 驗，部署閘 `tests/gate.cjs` 跑；改受保護檔＝同一 commit 有意更新基準）；不連 4178、不用擷取圖 `tests/test-isolation.cjs`；側欄 `tests/sidebar-overlays.cjs`；外觀 `tests/appearance.cjs`；輸出三步核對（M3 後成共用 helper，M1 先有 ffprobe 版）；四行證據進 WORKLOG。

## 6. 延後

扣點／訂閱；WordPress **會員嵌入工具**（handoff `:244` 兩條流程中的嵌入；檔案交付在 P6）；跟拍遮擋重識別（`docs/follow-quality-20261102.md`）；FilmCraft（除非 B）；Blender 以外 3D 引擎比較（P5.0 不過才做）。

## 7. 參考

handoff `../handoff/Claude_Code_handoff_20261102.md`；`follow-quality-20261102.md`；EffectCraft https://github.com/storytold/effectcraft（`docs/web.md`、`docs/agents.md`）；FilmCraft https://github.com/storytold/filmcraft；ArtCraft https://github.com/storytold/artcraft；主系統媒體 LEGO `../next-admin/lib/content/video/`、`../video-service/quality.py`、ADR 017 §5。
