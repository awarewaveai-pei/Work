# P0 重評：EffectCraft／FilmCraft 差距表與五閘（2026-11-06）

起因與範圍：`agency-os/handoffs/2026-11-05-effectcraft-filmcraft-reeval.md`。路線比較與建議在 [`engine-route-plan-20261106.md`](engine-route-plan-20261106.md)；本檔只放事實。前一輪：[`p0-effectcraft-gate-20261102.md`](p0-effectcraft-gate-20261102.md)（v0.20.0，判路線 C）。讀者是 AI agent。

標記：**（測）**＝本輪在這台筆電實跑；**（文）**＝上游文件宣稱、本輪沒測。上游路徑相對於各自 repo 根目錄，行號對下表釘的 commit。

## 1. 上游現況與試建版本

| | EffectCraft | FilmCraft |
|---|---|---|
| repo／授權 | `storytold/effectcraft`，MIT OR Apache-2.0（`README.md:385`；GitHub API 標 Apache-2.0） | `storytold/filmcraft`，MIT OR Apache-2.0（`README.md:466`） |
| 最新 release | v0.21.1，2026-11-05；`effectcraft-web-0.21.1.zip` sha256 `6006eb82bc87878453b01050bbdb9185d9c62b0ffa80749c17578728874f5faa`（上游 `SHA256SUMS.txt`） | v0.17.1，2026-11-05；`filmcraft-web-0.17.1.zip` sha256 `4449a9823adfd5b8996348c74abbb84e856c46480f9d06f85e07b277150a4e4f` |
| main（2026-11-05） | `1786c24523a5`（tag 之後 123 commits） | `46763a85d977`（tag 之後 97 commits；含嵌入橋 #3341） |
| 發版節奏 | 10-31 v0.19.0 → 11-01 v0.20.0 → 11-03 v0.21.0 → 11-05 v0.21.1 | 10-31 v0.15.0 → 11-01 v0.16.0 → 11-03 v0.17.0 → 11-05 v0.17.1 |
| 成熟度（上游自評） | alpha；功能約 91%、可用於正式製作約 45%（`README.md:248-250`）；「不建議用於正式客戶工作」（`README.md:235-236`） | alpha；功能約 86%、可用於正式製作約 56%（`README.md:296-299`） |
| **本輪試建釘的 commit** | tag v0.21.1 = `df4cc0932803f6183151083a5dfdd175f9d0a4ca` | main `46763a85d9777d3a60c2a557f359d988296d6a44`（嵌入橋只在 main，還沒進 release） |
| 補丁 | `p0-reeval-evidence/effectcraft-tc-fonts.patch`（1 檔 +4 −1） | `p0-reeval-evidence/filmcraft-tc-fonts.patch`（2 檔 +2 −2） |
| 產物 | wasm 69,795,691 B（gzip −9：31,881,718 B），sha256 `65b0ca03…0a5c37` | wasm 57,733,194 B（gzip −9：29,470,220 B），sha256 `12bb7834…9dc0f3` |
| 建置 | WSL Ubuntu、Rust 1.99.1、`cargo xtask web`、wasm-bindgen 0.2.129；520 秒 | 同左；`CRAFT_FONTS_DIR`＋`CRAFT_FONTS_REQUIRED=1`；478 秒 |

重現：`p0-reeval-evidence/prep.sh`（釘版＋套補丁）→ `build-one.sh effectcraft|filmcraft`。完整檔案雜湊在 `p0-reeval-evidence/*-dist.SHA256SUMS`。原始碼與產物留在 WSL `~/awarewave/{effectcraft-src,filmcraft-src,craft-fonts-video}`，不進 repo。

**字型機制跟 VectorCraft 不一樣**（handoff 的假設要修正）：
- VectorCraft 是執行時抓字型，改 `crates/text/web-fonts.txt` 一份清單就好（`scripts/vectorcraft-pro/web-fonts.patch`）。這兩個引擎都**沒有**這個檔。
- EffectCraft：字型用 `include_bytes!` 編進 wasm（`crates/text/src/fonts.rs:21-27`）。`add_font_data`（`fonts.rs:359`）存在，但整個 repo 沒有任何非測試程式呼叫它，所以網頁版仍不能載入自備字型（`docs/web.md:68` 沒變）。補丁＝把 Noto Sans TC、Noto Serif TC 加進內建清單。編進去的好處：每個 worker 都是獨立的引擎實例（`docs/web.md:101-106`），內建字型每個實例都有。
- FilmCraft：經 craft-fonts 在建置時嵌入（`crates/text/build.rs:10-13`），網頁版只留 BIZ UDPGothic（日文字形）與 Noto Sans Thai（`build.rs:50-52`）。補丁＝`wasm_keeps` 多留兩個 TC 字型，fallback 排序讓 TC 排在日文字型前（`crates/text/src/fonts.rs:581`）。
- 字型檔沿用 VectorCraft 已釘的來源與 sha256（`scripts/vectorcraft-pro/PIN.json` 的 Noto Sans TC `5bab0cb3…`、Noto Serif TC `63515eb0…`，OFL-1.1）。

## 2. 功能差距表

需求列＝`handoff/Claude_Code_handoff_20261102.md` §4（括號是該檔行號）。「自製」＝目前 video.aware-wave.com 上的工具。

| 需求 | EffectCraft | FilmCraft | 自製 |
|---|---|---|---|
| 多軌剪輯（:114） | 部分：圖層式時間軸，不是軌道式剪輯（`README.md:102-103`）（文） | 有：多軌、patch／target、sync lock（`README.md:88`）；本輪 3 影片軌＋3 音軌實排（測，`results/fc-main.json` `place.*`） | 有：影片 8＋音訊 8＋文字 4，合計上限 16（`shared/editor-model.js:4-7`） |
| 影格精確裁切（:115） | 有：`layer.addItem {in,out}`、`edit.splitLayer`（測，`results/ec-main.json` `SRT n.io`） | 有：整數 tick 時間（`README.md:92`）；razor 在第 180 格切一刀（測，`razor.f180`） | 有：整數影格（`shared/timebase.js`）；分割 `scripts/tools-editor.js:1638`、入出點 `:1595` |
| 時間軸編排：ripple／roll／slip／slide、三點剪輯、巢狀、吸附、undo（:116） | 沒有（不是剪輯器） | 有：全部（`README.md:90-93`）（文） | 部分：分割、ripple 刪除（`tools-editor.js:1666`）、關閉空隙（`:1479`）、複製（`:1629`）、undo／redo（`:1304`）。**沒有** roll／slip／slide、三點剪輯、巢狀序列（grep 0 命中） |
| 轉場（:117） | 部分：序列圖層重疊轉場參數（`docs/agents.md:255`）（文） | 有：約 30 種（`README.md:145`）；cross dissolve 套用成功（測，`transition`） | 部分：7 種、只在主影片軌（`editor-model.js:90-98`、`tools-editor.js:346`） |
| 調色（:118） | 有：Curves、Levels、Lumetri 類面板、Apply Color LUT（`README.md:131`、`docs/effects.md:417`）（文） | 有：基本校正、曲線、色輪、HSL 二級、暈影、示波器（`README.md:115-120,130`）；讀 `.cube` LUT（`docs/file-format-parity.md:32`）（文） | 部分：曝光／對比／色溫／飽和＋LUT（`editor-model.js:132-150`）、內建濾鏡（`backend/editor-export.cjs:14` 起）；預覽是近似（`tools-editor.js:406`）。**沒有**曲線、色輪、示波器 |
| 一般字幕：SRT 匯入／匯出／燒錄（:126） | **沒有**匯入：`addFile(zh.srt)` 只進檔案表，不成字幕（測，`import.srt`；`docs/file-format-parity.md:34`） | 有：SRT／VTT／SCC 匯入匯出＋燒錄（`README.md:172`）；SRT 匯入成 3 句、時間正確，輸出燒錄＋SRT sidecar（測，`captions.list`、`3-filmcraft-ui-t4-zh.jpg`） | 有：SRT／VTT 解析（`shared/subtitle-parse.js:30`）、重疊合併與匯出（`backend/subtitle-export.cjs:23,38`）、燒錄（`backend/subtitle-burn.cjs`） |
| 動態字幕（:127） | 有：文字 animator＋range selector（`README.md:112-113`）（文） | 部分：逐字時間有（`docs/transcripts.md:11`），逐字動畫沒找到證據 | 有：逐字出現／逐字高亮／放大進場（`shared/compositor.js:16`）；字詞時間是估的（`compositor.js:508`） |
| 片頭動畫（:128） | 有（合成本身就是） | 部分：圖形範本 `.fcgt`（`docs/graphics.md:215`）（文） | 有：Remotion 範本（`backend/remotion.cjs`、`tools-editor.js:1326`）＋動畫合成片頭範本 |
| 音訊混合（:132-136） | 部分：音訊圖層＋音訊特效（`README.md:136`）；輸出 −10.6 LUFS，**沒有**響度正規化（測） | 有：混音器、EQ、動態、限制器、automation、BS.1770 響度表（`README.md:160-164`）；`loudnessLufs:-16` 輸出實量 −16.0 LUFS（測） | 部分：音量關鍵影格（`editor-export.cjs:285`）、淡入淡出（`:649`）、多路混音（`:661`）、響度正規化到 −16 LUFS（`:663`）。**沒有** EQ、音訊特效、混音器 |
| 圖層、2D 變形、父子（:142-143） | 有：38 種混合模式、parenting（`README.md:102-103`）（文） | 部分：每個片段有 Motion／Opacity、26 種混合（`README.md:146`）；沒有父子 | 有：6 種圖層、7 種混合、父子（`compositor.js:7,10,477`） |
| 遮罩、遮罩合成（:144-145） | 有：鋼筆遮罩、羽化、track matte（`README.md:103,109-111`）（文） | 部分：`masks.add`（`docs/gaps.md:319-326`）、Track Matte 特效（`README.md:145`）（文） | 有：矩形／橢圓／路徑遮罩＋羽化（`compositor.js:34,851-854`）、alpha／亮度 matte（`:14`） |
| 關鍵影格、曲線（:146-147） | 有：Graph Editor（`README.md:104-106`）（文） | 有：值與速度曲線（`README.md:147`）（文） | 有：6 種緩動含自訂 Bezier（`compositor.js:11-13,43`） |
| 表達式（:148） | 有：JavaScript 表達式（`README.md:114-115`）（文） | **沒有**（README、gaps、graphics grep 0 命中） | 有：受限語法、13 個函式、步數上限（`compositor.js:124-127`） |
| 視覺特效（:149） | 有：308 個（`README.md:130`）（文） | 有：90 多個（`README.md:145`）（文） | 部分：4 個（模糊、發光、色彩、陰影；`compositor.js:18-23`） |
| 2D 綁定 A 肢體／B Puppet（:155-163） | 有：Puppet pin＋null 控制器（`README.md:120-122`、`docs/agents.md:720`；11-02 實測過） | 沒有 | 有（`shared/rig.js:676-711`；控制釘只有位移，沒有旋轉／縮放 `:704-709`） |
| 2D 綁定 C 骨骼鏈／IK／權重（:165-169） | **沒有**（gaps、agents grep 0 命中） | 沒有 | 有：FK、兩節 IK、FABRIK、權重筆刷（`rig.js:712-741`） |
| 3D 模型／骨架／重定向（§0） | 部分：只有 3D 合成（攝影機、燈光；`README.md:146-149`），不能匯入模型 | 沒有 | 有：GLB、擺姿、攝影機、燈光、重定向、Blender 渲染（`scripts/tools-3d.js:1-6`） |
| 保存後重開仍可編輯（:181） | 部分：重開後 5 個素材全部離線，要呼叫一次 `footage.relink`（測，§3 ②） | 有：重開素材全部在線（測，§3 ②） | 有（伺服器帳冊，卡 M2） |
| 輸出比例五種（:184） | 有：合成尺寸自訂 | 有：序列尺寸自訂（`file.newSequence {width,height}`） | 有（`editor-export.cjs:7-12`） |
| 輸出 H.264＋AAC（:185） | 有（測，§3 ④） | 有（測，§3 ④） | 有：720p／1080p／4K（`editor-model.js:152`、`editor-export.cjs:699,713`）；伺服器 FFmpeg，用原檔 |
| 繁中文字（顯示與輸出） | 補丁後有（測）；原版沒有 | 補丁後有（測）；原版是日文字形 fallback | 有 |
| 介面語言繁中 | 有 `zh-hant`（`docs/localization-parity.md:3,13`）（文） | **沒有**：只有簡中，繁中地區直接用英文（`crates/ui-egui/src/i18n.rs:177-178`） | 有 |
| 外觀套 AwareWave 主題 | 沒有：egui 畫布，只有內建深色／淺色（11-02 實測） | 沒有：同左 | 有 |
| 素材庫／來源紀錄／送審 | 沒有對外橋；輸出是瀏覽器下載＋`readFile`（測） | 有嵌入橋：存檔與輸出以 `postMessage` 交給父頁（測，§3 ④） | 有：`rightsSources`／`parentAssetIds`（`backend/main-system.cjs:136-147`）、送審文字（`backend/release-text.cjs`） |
| 大檔與長片 | 素材全進 wasm 記憶體，上限 4 GiB（`docs/web.md:64`）（文） | 檔案以 File handle 分塊讀，不整檔載入（`docs/web.md:66-80`）；但嵌入橋每檔上限 512 MiB（`packaging/web/README.md:87`）（文） | 伺服器處理，代理檔預覽、原檔輸出（卡 M1） |
| 不用下拉選單（操作者 UI 規則） | 不符：引擎自己的 egui 介面有下拉 | 不符：同左（`3-filmcraft-ui-t4-zh.jpg`） | 符合 |

結論（只看功能有無）：
- **剪輯**：FilmCraft 明顯比自製完整（修剪工具、轉場數量、調色、混音器）。
- **特效合成**：EffectCraft 明顯比自製完整（308 個特效、Graph Editor、JS 表達式）。
- **骨架 IK／權重、3D 模型、AI 工具、送審鏈**：只有自製有，兩個引擎都沒有。
- 兩個引擎都拿不到 AwareWave 主題，介面有下拉；FilmCraft 介面沒有繁中。

## 3. 五閘（2026-11-06，這台筆電 LAPTOP-R7I86OR5）

環境：Edge（Playwright `msedge`、headless）；隔離工作台伺服器（`tests/isolated-server.cjs`）＋同源代理，引擎在 `/__trial/<引擎>/`；4178 沒碰。腳本 `p0-reeval-evidence/harness/`、原始結果 `p0-reeval-evidence/results/`。測試素材沿用 11-02 的 `%TEMP%\ecp0\fx\`（帶影格編號的 MP4、HEVC 10-bit MOV、PNG、兩路 WAV、繁中 SRT），不在 repo。

**這台筆電有兩張顯示卡，瀏覽器預設用弱的那張**（`harness/gpuinfo.cjs`、`gpuinfo2.cjs`）：
- 預設：WebGL2 與 WebGPU 都給 Intel UHD（`ANGLE (Intel, Intel(R) UHD Graphics…)`、WebGPU adapter `intel gen-12lp`），即使要求 `high-performance` 也一樣。
- 加 `--force_high_performance_gpu`：兩者都換成 NVIDIA RTX 5060 Laptop（`nvidia blackwell`）。
- 所以 11-02 的 WebGPU 54 秒斷線是發生在 Intel 內顯上，操作者自己的 Edge 也在同一張卡，才會一起當掉。本輪的 WebGPU 測試只在 NVIDIA 上跑，沒有碰 Intel 的 WebGPU。

| 閘 | EffectCraft v0.21.1＋TC 補丁 | FilmCraft main `46763a8`＋TC 補丁 |
|---|---|---|
| ③ 字型 | **過（需建置補丁）**。`text.fonts` 列出 `Noto Sans TC:bundled`、`Noto Serif TC:bundled`。輸出第 120 格：黃色標題「覺知波：繁體中文標題「嘸」測試」＋明體字幕「他說：「今天，天氣很好。」」全部正確（`1-effectcraft-export-f120-zh.jpg`）。「嘸」是 Big5 才有的字，日文字型沒有，證明用的是 TC 字型。輸出在 worker 裡渲染，字型也在 | **過（需建置補丁）**。`fonts.list` 含 Noto Sans TC、Noto Serif TC。輸出第 120 格同樣正確，字幕由 SRT 匯入後燒錄（`2-filmcraft-export-f120-zh.jpg`）。介面的素材名、時間軸字幕也顯示繁中（`3-filmcraft-ui-t4-zh.jpg`） |
| ① 效能：Intel 內顯、不開 WebGPU（＝這台筆電預設、最差情況） | **不過**。合成秒數÷實際秒數：簡單片（1 支 1080p H.264＋1 個標題）Full 0.40、Half 0.99、Quarter 0.99；完整測試片（2 支影片含 HEVC 10-bit、PNG、2 路聲音、標題、3 句字幕）Full 0.23、Half 0.40、Quarter 0.59（`results/effectcraft-perf.json`） | **不過**。聲音即時（播放頭 0.88–0.95 倍速，跟音訊時鐘），但畫面 8 秒只顯示 2–3 格（約 0.3 fps，99% 掉格），簡單片也一樣（`results/filmcraft-perf.json`） |
| ① 效能：NVIDIA RTX 5060、WebGPU（＝有獨立顯卡的桌機／筆電的判讀） | **部分**。簡單片 Full 0.67、Half 0.98；完整測試片 Full 0.28、Half 0.47、Quarter 0.29。15 秒閒置＋約 50 秒播放＋73 秒連續播放，**沒有** device lost。瓶頸在 CPU 端（單執行緒 wasm 解碼與文字圖層），顯卡再好也只到這裡（`results/effectcraft-perf-webgpu.json`） | **部分**。簡單片顯示 20.5 fps（30 fps 的 69%）；完整測試片有 HEVC 10-bit 疊加時 11.4 fps（44%），HEVC 段結束後 24 fps（82%）。介面 64 fps。74 秒連續播放**沒有** device lost（`results/filmcraft-perf-webgpu.json`） |
| ⑤ 焦點（嵌入工作台） | 原樣**不過**：點進引擎後 Escape、Tab 都留在 iframe。**工作台這邊加一段就過**：同源 iframe 的 `contentWindow` 上掛 `keydown` 監聽，按 F6 把焦點交回側欄，再按 Enter 側欄有反應。不用改引擎。側欄在引擎開著時可點；移除 iframe 後 Documents 23→8、JS heap 回到開啟前（`results/effectcraft-embed.json`、`5-effectcraft-embedded-in-workbench.jpg`） | 同左，結果相同（`results/filmcraft-embed.json`、`4-filmcraft-embedded-in-workbench.jpg`） |
| ② 重開素材 | **原樣不過，一個指令可解**。存檔 206,797 B；重新載入後 7 個檔都在 OPFS，`file.open` 成功、`comp.info` 前後相同，但 `footage.missing` 仍列 5 個全部離線（上游的 bug 還在；`docs/web.md:97` 宣稱會註冊）。重新 `addFile` 同名檔沒用；對其中一個呼叫 `footage.relink` 就 5 個一起連回（`relinked:[1,2,3,4,5]`），之後輸出正常 | **過**。重新載入後 `restoredMedia: 6`，`openProject` 回 `missingMedia: 0`，`media.findMissing` 空。嵌入橋模式依設計不還原任何東西：只送專案時素材顯示 missing，父頁再送一次素材就自動變 online（`results/fc-host.json` `reopen.*`；會多出重複的素材項，送的順序開工時要定） |
| ④ 輸出與交回工作台 | **過**。H.264 1920×1080、30/1、300 格＋AAC 48 kHz 立體聲、10.005 秒；平均音量 −13 dB（有聲）；第 120 格畫面寫「120」＝影格對齊。耗時 161 秒（當時另一個測試同時在跑；11-02 單跑是 91 秒）。交回方式：瀏覽器下載事件＋`effectcraft.readFile`；**沒有嵌入橋**（v0.21.1 與 main 的 `packaging/web/README.md` 都沒有 `host=parent`） | **過，而且有正式的嵌入橋**。輸出規格同左，−16.0 LUFS（`loudnessLufs:-16` 準確）、78 秒（3.8 fps）、另出 SRT sidecar。`?host=parent`：`filmcraft:ready`（契約版本 1）→ 父頁用 `filmcraft:open` 送位元組 → Save As 與輸出都以 `filmcraft:save` 交回父頁（`host.fcproj` 12,115 B `saveAs:true`；`host-out.mp4` 159,379 B `saveAs:false`，ffprobe 確認 h264＋aac）；瀏覽器下載次數 0 |

跟 11-02 比：
- ③ 字型：當時不過 → 現在兩個引擎都可以用幾行建置補丁解掉。上游本身沒有改。
- ⑤ 焦點：當時不過 → 工作台側一段監聽可解（11-02 記為「沒有測」的那個做法）。
- ② 重開：EffectCraft 的 bug 還在，但一個 `footage.relink` 可解；FilmCraft 沒這個問題。
- ① 效能：還是最大的問題，而且取決於使用者的顯示卡。沒有獨立顯卡（或瀏覽器沒被設成用獨立顯卡）時，FilmCraft 的畫面幾乎不動、EffectCraft 只有簡單合成能半解析度即時。

本輪沒測、照實列出：
- 有頭模式（真的開視窗）的聲音與手感。headless 下 EffectCraft `audio.played` 一直是 0（11-02 的 G7 仍未驗）。
- Intel 內顯上的 WebGPU：沒有重跑。11-02 那次讓操作者的 Edge 當掉，這次只查了 adapter 名稱。
- 真人鍵盤中文輸入法。VectorCraft 的經驗是 headless 打不進 egui（`scripts/vectorcraft-pro/README.md:62`）。
- 一般桌機沒有實機，「有獨立顯卡」那一列是用這台的 RTX 5060 代表。
- 長片、4K、超過 512 MiB 的素材。
- FilmCraft 的 `filmcraft-cli` 在 Linux 主機上無頭輸出（`docs/agents.md:64,124`）：這是「瀏覽器剪、伺服器用原檔輸出」的可能做法，沒試。
- 差距表標（文）的格子。
