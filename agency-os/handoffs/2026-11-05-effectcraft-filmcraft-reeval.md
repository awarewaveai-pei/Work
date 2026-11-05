# EffectCraft／FilmCraft 重新評估：要不要嵌入影音工作台

> 給另一個帳號的 Fable 5.1 session。零記憶也能直接開工。回報操作者一律繁體中文。
> 續接語：`續做 EffectCraft／FilmCraft 重評：讀 agency-os/handoffs/2026-11-05-effectcraft-filmcraft-reeval.md，從 §3 第 1 步開始；完成＝§4 四項產出。建議模型：Fable 5.1`

## 1. 操作者的問題（2026-11-05 原話）

「當時我說要有 EffectCraft 和 FilmCraft 的完整功能（https://github.com/storytold/effectcraft 、https://github.com/storytold/filmcraft 、https://github.com/storytold ），但是在 https://video.aware-wave.com/ 我卻沒有看到。」

## 2. 已查證的事實（使用前請再 grep 一次）

**原始需求**（`lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/handoff/Claude_Code_handoff_20261102.md`）
- `:33`：功能要真的能操作，不是把網址加進選單就算完成。引擎數量屬於工程選擇。
- `:87`：交接時尚未完成的項目：FilmCraft 整合、EffectCraft 整合。
- `:189-210`：兩者的分工與 JS 控制介面。`window.effectcraft.*`、`window.filmcraft.*`。
- `:284-305`：P0 閘的規則。先試 EffectCraft；有缺口才評估 FilmCraft。

**P0 判定（2026-11-02）＝路線 C，不嵌入引擎，延伸自製編輯器**
- 證據檔：`apps/video-workbench/docs/p0-effectcraft-gate-20261102.md`、`docs/creative-suite-plan-20261102.md:17`。
- 沒過的四個閘：
  1. ③ 不能載入自備字型，繁中顯示 NO GLYPH（上游 `docs/web.md:68`）。
  2. ① 這台筆電的 WebGPU 約 54 秒就 device lost，WebGL2 只有 0.47 倍即時。
  3. ⑤ 嵌入後焦點出不了 iframe。
  4. ② 專案重開後素材離線。
- 計畫寫明的重評條件：上游支援使用者字型時重跑 P0。
- FilmCraft 從沒試過，原本只排在路線 B 才試。
- 監工台卡 P0／P1 的記錄：`agency-os/handoffs/2026-11-02-video-workbench-supervisor/data.mjs:78-87,124`。

**現在站上有的（全部是自製）**
- 五軌剪輯擴充：軌道增減、影格精度、轉場、調色＋LUT、4K、混音 −16 LUFS、SRT／VTT。
- Remotion 片頭。
- 2D 動畫合成。
- 2D 角色骨架：FK／IK。
- 3D：Blender 4.5.9。
- 這些功能**沒有**和 EffectCraft／FilmCraft 的完整功能逐項對照過。

**新事實：值得重評的理由**
- 同家族的 VectorCraft 已在 2026-11-05 嵌入 app，網址 `/tools/vector-pro`。
- 中文字型的解法在 `scripts/vectorcraft-pro/web-fonts.patch`：它改上游 `crates/text/web-fonts.txt`，配合 `storytold/craft-fonts` 加入 Noto Sans／Serif TC、HK 等 51 個字型。
- 建置管線是 `scripts/vectorcraft-pro/{build.sh,build.ps1,PIN.json,README.md}`，見 `README.md:24-43`。
- 另有 setTheme／addFont 的 host API patch。
- EffectCraft／FilmCraft 很可能共用同一個 text crate，閘 ③ 可能同樣解得掉。
- 閘 ① 只在這台筆電驗過，一般桌機要另外驗。

**不可破壞的現況**
- 影音工作台已上線（video.aware-wave.com）。
- 送審需要四份 QA：
  - 成品登記時由工作紀錄帶 title／script／字幕時間軸（P6.13，commit `1aaa139d5`，`apps/video-workbench/backend/release-text.cjs`）。
  - 上傳時記 `rightsConfirmed`。
- 任何嵌入方案都必須沿用同一個素材庫與來源紀錄（handoff `:305`），不可另起孤立素材庫。
- 另一個 session 正在做卡 RV（Replicate 影片模型），碰到的檔是 `generation-policy.cjs`、`projects-0.js` 等，不要同時改這些檔。

## 2b. 操作者的第二個問題：功能像一堆零件（2026-11-05）

操作者原話：「目前有些功能不錯，但是好像只是零件一樣。」她舉的例子是工作台的「應用工具」頁，這一頁就是一張工具目錄。每張卡各自是一個「輸入 → 輸出」的單一工具，大致分成五組：

- **剪輯成片**：
  - 影片剪輯：多支素材 → 成片
  - 動畫合成：圖層 → 透明影片／參考圖
  - 角色綁定：分層角色 → 可動畫角色／姿勢圖
  - 3D：GLB／圖片 → 3D 場景 → 透明影片／參考圖
  - 智能短影音：長影片 → 多支 9:16
  - 人物跟拍：影片＋點選人物 → 9:16
  - 字幕與逐字稿：影片／音檔 → 字幕檔
- **畫質修復**：畫質增強；影音增強與消除字幕
- **聲音**：去配樂・重配音效；配音生成；音樂生成；音軌分離
- **品牌與合規**：浮水印；CTA 按鈕；肖像權保護
- **生成前置**：圖片局部編輯；影片轉深度影片

問題所在（請先自己在 video.aware-wave.com 或程式裡驗證這幾點）：
- 工具之間只靠素材庫交換檔案。做完一步，使用者要自己回素材庫找出成品，再丟進下一個工具。
- 沒有「這支影片的專案」能把腳本、分鏡、生成、合成、剪輯、字幕、修復、品牌、送審串成一條線。
- 改了前面的步驟，後面不會跟著更新，也看不出某個成品是用哪些步驟做出來的。
- EffectCraft／FilmCraft 是一整套工作環境，正好對應這個缺口。所以這個問題和「要不要嵌入引擎」是同一個決定，不要拆開處理。

計畫必須另外回答以下幾點，不論最後選哪條路線：
1. 一支影片從腳本到送審的完整流程長什麼樣。請用一個具體例子一步一步走，例如「30 秒商品短片」。每一步寫明用哪個工具、成品自動流到哪裡、使用者要按什麼。
2. 現有每個工具要變成流程裡的哪一步，或是保留為獨立工具。逐項列出上面的工具清單。
3. 前一步改了，後一步怎麼得知並重做。成品的來源紀錄已經有 `rightsSources` 與 `parentAssetIds`（`apps/video-workbench/backend/main-system.cjs` `ingest()`，約 :140-150`）可以接著用。
4. 這個專案容器跟現有的「專案」頁（`scripts/projects-0.js`）、剪輯專案（`shared/editor-model.js`）是什麼關係，要合併還是取代。不可同時存在兩套專案概念。

## 3. 要做的

1. **讀上游現況。** 兩個 repo 的 README、`docs/web.md`、授權、最新 release／commit，記下版本與 checksum。
2. **做功能差距表。** 逐條對照 handoff 需求，比較 EffectCraft、FilmCraft、現有自製編輯器三者。每格要寫「有／沒有／部分」並附證據：上游檔案行號，或本 repo 的 file:line。
3. **本機試建。** 照 vectorcraft-pro 的做法，建出帶繁中字型的 EffectCraft 與 FilmCraft 網頁版，重跑 P0 五閘：
   - 字型
   - 效能：分「這台筆電」和「一般桌機」兩種判讀
   - 焦點
   - 重開素材
   - 輸出

   每閘都留截圖或數字。試建產物放 WSL 或 scratch，不把大檔放進 repo。
4. **寫 R0 七段計畫**，放在 `apps/video-workbench/docs/`。比較三條路線，每條都附 rollback：
   - A：嵌入取代自製剪輯
   - B：雙引擎並存
   - C：維持自製並補缺口

   計畫必須說清楚素材庫、送審（release-text）、權利紀錄、主題怎麼接。

## 4. 產出（完成的定義）

1. 差距表。
2. 五閘證據。
3. R0 計畫，內含 §2b 的四個回答。
4. 監工台更新：
   - 在 `agency-os/handoffs/2026-11-02-video-workbench-supervisor/data.mjs` 加一張卡，並在 OPEN 加一項「選哪個路線」。
   - 跑 `node build.mjs && node check.mjs`，然後重新發布到 https://claude.ai/artifact/YRsAwgH1cVEtcSLdCPWzCs 。另一個帳號若沒有這個 artifact 的編輯權，就只更新 data.mjs／supervisor.html，請操作者回這邊發布。

全部 commit 到 main：pathspec commit；WORKLOG 走 `scripts/git-partial-worktree-commit.py`。

## 5. 邊界

- 不改正式程式、不部署。路線由操作者選定後才開工。
- 規則全文見 `agency-os/AGENTS.md`。重點：
  - main 直推，不開 branch。
  - 共享工作目錄只動自己的檔。
  - 不用中國公司的 AI 模型。
  - UI 不用下拉選單。
  - 給操作者的文字用白話繁中，一句講一件事，先舉例。
