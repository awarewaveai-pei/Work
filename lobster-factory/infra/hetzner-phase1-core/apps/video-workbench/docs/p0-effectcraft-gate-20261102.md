# P0 EffectCraft Web 閘門（2026-11-02）

EffectCraft v0.20.0（commit `720c6711`）· zip sha256 `24189ed0dc8e9b5ed893dbd65b27f4f130ce5294b4a4f6b4cd506746f916c13e`（= 上游 SHA256SUMS.txt）· Edge（Playwright `msedge`，headless，`--disable-features=WebGPU,WebGPUService --disable-webgpu` + init script 隱藏 `navigator.gpu` → 引擎 `info().backend = "Gl"`；URL `?empty&nosw&nogpuworkers`）· 筆電 LAPTOP-R7I86OR5 · 2026-11-02

驅動腳本與原始輸出在 `%TEMP%\ecp0\`（run/*.cjs、out/*.json、out/p0.ecproj、out/p0_out*.mp4），不進 repo。隔離 server = `tests/isolated-server.cjs`（port 0、暫存 data dir）；4178 未碰。

## 硬閘

| 閘 | 結果 | 證據 |
|---|---|---|
| ① WebGPU（Edge 預設） | FAIL | 前一輪（14:11 被終止）：載入後約 54 s WebGPU device lost，GPU reset 連帶讓操作者自己的 Edge 分頁當掉。那輪另外跑過帶 unsafe-WebGPU flag 的 adapter probe：可能是原因之一，無對照組可排除（依規則不重試）。本輪三個 session 全程不開 WebGPU，console 0 筆 lost／context lost |
| ① WebGL2（host 強制） | FAIL | 1080p Full：實際播 6 s 只前進 2.83 s comp 時間（0.47×即時）；Half：4.17 s／6 s（0.69×）。`ui.inspect` UI fps 61。聲音：`ui.playback status` 只有開頭 0.5 s 有 `audio:true`（−7 dBFS），之後 `audio:false`、−48 dB；`info().audio` = `{state:"running", backend:"worklet", posted:35488, played:0, underruns:0}`。限制：headless 可能沒有音訊輸出裝置，`played:0` 不一定代表有頭模式也沒聲音 |
| ③ 繁中文字＋SRT（預覽＋輸出） | FAIL | `addFile(NotoSansTC-VF.ttf)` 成功存進檔案表，但 `text.fonts {rescan:true}` 還是只有 Inter／JetBrains Mono／Noto Serif（全部 `bundled`），沒有任何 `user` 字型 → 引擎不能載入自備字型。預覽 `render.frame` t=1 s 的標題和字幕全部顯示「NO GLYPH」方框：`p0-evidence/1-preview-title-cjk-noglyph.png`、`2-preview-srt-cjk-noglyph.png`；輸出檔同樣是方框：`4-export-relinked-f30-89-90-210.png`。SRT 檔可以 addFile，但不會出現在 Project（沒有 SRT 匯入器） |
| ⑤ 嵌入工作台 | FAIL | 從工作台 `/` 用 iframe 開 `/engines/effectcraft/web/index.html`，父頁 `crossOriginIsolated=false`，iframe 內 `coi=false`、`backend Gl`，引擎仍能載入並執行（`comp.new`＋`layer.newSolid` ok）→ **不需要整個工作台加 COOP/COEP**。側欄 `#toolsNav`／`#projectsNav` 可點，active 會切換。worker 2→0；DOM Documents 23→9；JS heap 7.46 MB→4.85 MB（開前 4.96 MB）。**失敗原因**：滑鼠點進引擎後按 Escape，`document.activeElement` 仍是 `ec`（iframe）；按 Tab 也還是 `ec`，焦點出不來，只能靠滑鼠點父頁。另一個做法：因為是同源 iframe，host 可以在 contentWindow 掛 keydown 監聽；沒有測 |
| ② 剪輯全流程 | FAIL | 匯入 MP4／HEVC10 MOV／PNG／2×WAV ok（582 ms）；多圖層 ok；用 `layer.addItem {in:0,out:3.0}` 在第 90 格精確裁切 ok（`comp.info` mov out=3）；字幕用 `layer.newText` 每段一層，再以 `time.set`＋`edit.splitLayer`＋`edit.clear` 剪到 SRT 時間（0.5–2.5／3–5／6–8.5 s，`comp.info` 確認）；`saveToBrowser` 206,760 B；重新載入頁面後 `file.open` ok，`comp.info` 前後一樣。**但重開後 5 個素材全部離線**（`footage.missing` 列出 /src.mp4…/a880.wav，路徑相同、檔案也在檔案表），輸出變成黑畫面＋靜音（−91 dB，`3-export-after-reopen-black.png`）。worker 和 `?noworkers` 兩種方式都重現。另外試一次 `footage.relink`×5 後才能正常輸出：h264 1920×1080 30/1、300 格、aac 48 kHz 2ch、10.005 s；`verifyOutput` 的 duration／fps／size／audio／audible 全過；`frames` 用整格比對不過（PSNR 24.6，原因是整段都有「NO GLYPH」標題蓋在畫面上），裁掉標題區（y≥300）後：f165 對 f165 = 34.5 dB（Y 38.0），f165 對 f166 = 22.1 dB → 影格對齊正確；色度 V 29.6 偏低，可能是色彩矩陣轉換。880 Hz 過 highpass 後仍有 −19.5 dB → 兩路音訊都有混進去 |
| ④ 交回工作台 | PASS | `.ecproj`：`effectcraft.readFile("/p0.ecproj")` 回傳 Uint8Array（206,760 B），存檔時也會觸發下載；輸出檔 = 瀏覽器 download 事件（MP4），工作台可以直接存。格式 = EffectCraft 專案 JSON，素材只記錄檔案表路徑（`/src.mp4`），不內嵌；交回時素材要另外帶，而且有上面 ② 的離線問題 |

## 軟閘（數字）

| 項目 | 數字 |
|---|---|
| Puppet＋null 控制器 | 3 個 pin ok（`puppet.addPin`）；`paths.pointsFollowNulls` 自動建 3 個 null；再建一個 `Ctrl` null 當父層，`prop.set position [840,460]` 後網格確實變形（`deformChanged=true`）。`5-puppet-null-ctrl-t1.png`、`6-ui-dark-puppet-ctrl.png` |
| egui 外觀對 AwareWave tokens | 部分：`prefs.appearance` = `theme` dark/light、`brightness`、`uiScale`、`useGradients`、標籤色；`ui.set {theme}` 回 ok。沒有自訂色票／token 載入介面 → 只能選內建主題，對不上 tokens |
| HEVC 10-bit 解碼 | `render.frame` 480×270 連續 60 格（含 PNG 編碼往返）：HEVC10 MOV 4.0 fps，H.264 MP4 4.1 fps → 解碼不是瓶頸，瓶頸在 CPU 渲染（WebGL2 路徑全部 CPU） |
| 4 GiB 上限可放的實拍長度 | 推估，未實測：素材 bytes 會放進 wasm 記憶體（web.md「media reads … add_bytes」），快取再占 512+256 MB，每支開著的影片另占 ≤384 MB → 單檔約 ≤2.5 GiB；以 17 Mbps 1080p30 手機片換算約 20 分鐘 |
| 載入時間 | `effectcraftLoad` wasmMs 215／readyMs 301（本機 server，已有快取） |
| 輸出時間 | 10 s 1080p H.264：worker 28 s（但是黑畫面）；`?noworkers` relink 後 91 s |

## 能力表（對照計畫 §4）

| 卡 | 能力 | 狀態 | 上游依據 |
|---|---|---|---|
| P2 | 多軌圖層、影格精確裁切 | 有 | `layer.addItem {in,out}`、`edit.splitLayer`（engine.commands） |
| P2 | xfade 轉場 | 部分（有序列轉場參數，未測） | agents.md:255 `sequence, overlap, transition` |
| P2 | 調色＋LUT | 未測 | — |
| P2 | 多路混音＋關鍵影格音量 | 部分（混音有；音量關鍵影格未測，`prop.set` 可設） | agents.md:141 |
| P2 | 字幕匯入 SRT／VTT | 缺 | file-format-parity.md:34 只有 `.aecap`；engine 沒有 srt 指令 |
| P2 | 繁中字型 | 缺（瀏覽器只有內建 3 套字型） | web.md:68 |
| P2 | 重開專案保持素材連結 | 缺（重開後全部離線，要手動 relink） | web.md:97 宣稱 stored media 會註冊；實測不成立 |
| P2 | H.264＋AAC 輸出 | 有 | `renderQueue.add {format:h264, audio:on}` |
| P3 | 圖層／2D 變形／遮罩／關鍵影格／表達式 | 有（指令都在，未逐一測） | agents.md:141-155、`layer.addMask`、`prop.setExpression` |
| P3 | 動態字幕（逐字） | 部分（文字動畫有；中文字型缺） | `layer.addTextAnimator`、web.md:68 |
| P3 | 即時預覽 1080p | 缺（WebGL2 只有 0.47×） | web.md:284「WebGL2 … everything renders on the CPU」 |
| P4 | Puppet＋null 控制器 | 有 | `puppet.*`、`paths.pointsFollowNulls` |
| P4 | 骨骼鏈／IK／權重 | 缺 | gaps.md（無對應項） |

## 缺口

- G1 WebGPU 會讓筆電 GPU reset，連帶讓操作者的 Edge 掛掉 → 不能用；WebGL2 只能 CPU 渲染，1080p 播不到即時。
- G2 不能載入自備字型（web.md:68），繁中顯示「NO GLYPH」。
- G3 沒有 SRT／VTT 匯入；字幕得由 host 轉成文字圖層，再用 split＋clear 剪時間。
- G4 重開 `.ecproj` 後素材全部離線，要逐一 `footage.relink`，否則輸出黑畫面＋靜音；引擎沒有錯誤提示，render 照樣回 `Done`。
- G5 嵌入時焦點出不了 iframe：Escape／Tab 都留在引擎裡。
- G6 主題只有內建 dark/light＋亮度，不能套 AwareWave tokens。
- G7 headless 下 `audio.played=0`，有頭模式有沒有聲音未驗。

ROUTE: **C**。合成類 ①（WebGL2 播不到即時、聲音沒有持續）、③（不能載入繁中字型）、⑤（焦點出不了 iframe）都 FAIL；剪輯類 ② 也 FAIL（重開後素材離線）。
