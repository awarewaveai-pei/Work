# ED 線風險盤點 2026-11-15

- 基準：origin/main `c26cafd1b`。本機 D:\Work HEAD 是 `779f4d164`（落後 2、領先 0）。
- 路徑：相對於 `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/`（以下簡稱 VW），另有註明者除外。
- 來源：
  - progress-*.md
  - WORKLOG 2026-11-10～11-15
  - 42 份 ED 相關 partialreview，共 94 項 finding：85 項已修，9 項未修（見 R6、R9–R14）
- 正式站狀態（2026-11-15 用 SSH 唯讀查）：
  - video-workbench 的 image 是 9 小時前建置的
  - 容器內 `/app/vendor/fonts` 有 14 個檔，node_modules 裡有 opencc-js
  - 主機下載 NotoSerifCJKtc-Bold.otf（25.5 MB）只花 1.39 秒

## 要處理（依嚴重度排序）

| 編號 | 風險 | 證據 | 狀態 | 理由 | 建議做法（不變量）／檔案歸屬 |
|---|---|---|---|---|---|
| R1 | main 上的 video-workbench CI deploy gate 從 11-14 起連續失敗，原因是 `backend.cjs` 找不到 `opencc-js` | `gh run list`：從 b80ec92ca（11-14 00:31Z）到 c26cafd1b，連續 25 次 failure。log：`Cannot find package 'opencc-js' imported from next-admin/lib/ai/to-traditional.ts`。起因是 263a16450。WORKLOG 11-14 續4「範圍外發現」報過，但沒有 commit 修它 | 已處理（900e69496，CI run 43782056585 綠） | CI 一直是紅的，新的回歸混在裡面就看不出來。正式站不受影響：sg-deploy 的 gate 在 image 裡跑，image 裡有 opencc-js，9 小時前也部署成功 | 不變量：CI 跑 gate 時解析 node_modules 的方式要和 image 相同。做法二選一：(a) CI 也裝 awarewave-files 從 next-admin 拉進來的套件；(b) CI 直接在建好的 image 裡跑 gate，跟 sg-deploy.sh:388-398 一樣。檔案：`.github/workflows/video-workbench-ci.yml`。歸屬：繁體字幕卡（transcribe-traditional），或由監工指派 |
| R2 | 乾淨的 checkout 跑 `vendor-fonts.cjs` 會失敗，gate 紅 5 項（export-glyphs、editor-fonts、cover、cover-ai、cover-ai-api），因為缺 NotoSerifCJKtc-Bold.otf | `scripts/vendor-fonts.cjs:14-25`：每次嘗試限 300 秒下載整個檔，最多 3 次。筆電實測 GitHub raw 只有 24.5 KB/s（curl 20 秒收到 491,520／25,520,284 bytes），下載完約需 1,040 秒，一定逾時。scratchpad 重現：`The operation was aborted due to timeout`，exit=1，總計 15 分 15 秒（3×300 秒加重試等待）。ed-accept 為什麼缺這個檔（2026-11-15 補查）：ed-accept 裡另外 12 個字型檔的 mtime 都是 21:24:01，同一秒。照 24.5 KB/s 不可能在一秒內下載 113 MB，所以這些檔是從 D:\Work 複製過去的。D:\Work 的 Serif-Bold 在 21:35:29 才出現（ED.9 session 的紀錄：先跑出 `ls: cannot access 'vendor/fonts/NotoSerifCJKtc-Bold.otf'` 和 `aborted due to timeout`，之後才補上）。所以 21:24 複製時，來源就缺這一個檔；接著在 ed-accept 跑 vendor-fonts 只需要補這一個檔，卻撞上逾時。ed-accept 的這個檔在 21:54:32 補上。結論：**不是腳本判斷錯誤**。腳本只在 bytes 和 sha256 都對時才略過已存在的檔（:10、:47），而且整檔下載完才寫 `.tmp` 再 rename（:58-59），不會留下半個檔；兩邊都沒有殘留的 `.tmp`。**也不是偶發**：網路慢時這是必然結果。ED.4 的乾淨 worktree 已經不在 `git worktree list` 裡，無法核對它的字型是下載的還是複製的。D:\Work 在 21:35 之前為什麼缺這個檔，查不到原因：sources.json 從 f8ffef30d 起就列了這個檔，跟對齊前的備份 `moved-14` 也相同 | 已處理（f6e2f1f03，vendor-fonts-download 6 PASS） | 擋住本機驗收和乾淨的 worktree。**主機 Docker 建置平常遇不到**，原因有三：主機實測 1.4 秒就下載完；字型在獨立的 image 層，只有 sources.json 或 vendor-fonts.cjs 改動、或 build cache 被清掉時才會重新下載；主機上找不到 prune cron。主機要遇到，得同時符合「必須重抓」和「GitHub 對主機也變慢到 <85 KB/s」兩個條件，這時 build 會失敗，但舊容器照常運作（sg-deploy 在 build 失敗時會中止）。字型在 image 的獨立層（Dockerfile:28-30），只有 sources.json 或 vendor-fonts.cjs 改動時才重新下載。CI 走 actions/cache。另外 c26cafd1b 讓 `start.cmd` 每次啟動都跑 vendor-fonts：缺檔又遇到慢網路時，本機會無法啟動 | 不變量：逾時看「多久沒收到資料」，不看整個檔的總時間；用 Range 續傳，保留已下載的部分。檔案：`scripts/vendor-fonts.cjs`。歸屬：字型卡（ed-9-list，local_d2ced6c8）。這張卡的 c26cafd1b 沒動下載邏輯，只改了 start.cmd（WORKLOG 續24 C4），所以**目前沒有人在修這個問題** |
| R3 | 拆除 `D:\Worktrees\ed-accept` 時，可能連主工作區的 runtime 和 node_modules 一起刪掉 | ed-accept 裡有 4 個連結指向 D:\Work：`VW/node_modules`（153 MB）、`VW/runtime`（910 MB，含 blender）、`VW/.awarewave`、`next-admin/node_modules`（872 MB）。ed-accept 的 HEAD 從 c4d803dea 變成 6bdcb612a，表示現在有 session 在用它 | 已處理（監工拆 6 個 junction 後移除 worktree，主工作區完好） | 遞迴刪除的工具碰到 junction，可能會刪掉目標資料夾的內容。runtime 被刪的話，要重新下載 blender | 先逐一拆掉連結（`cmd /c rmdir <link>`，不加 /s），確認 4 個都不在了，再執行 `git worktree remove`。歸屬：監工（ed-accept 是監工建的）。拆之前先確認沒有 session 正在使用 |
| R4 | ED.13：Agent 的付費卡片按「前往確認」只會切換到對應分頁，付費結果不會回到 Agent 對話 | `scripts/editor-agent.js:36` 是按鈕。`:184-193` 的 `edAgentPaid` 只呼叫 `edAction("pane:…")`。另見 progress-ed13.md:3 | 已處理（65d53dc7e，ed13-agent-ui 12 PASS） | 這是功能缺口，扣錢和資料都沒有錯：付費仍要在分頁按確認，結果會進時間軸 | 不變量：付費動作完成時發一個帶 turn id 的事件，Agent 收到後把結果寫回那個回合；按鈕和 Agent 共用同一個事件。檔案：`scripts/editor-agent.js`，以及各付費分頁的完成點（subtitles.js、fillers.js）。歸屬：ED.13 |
| R5 | ED.6：環境音 a006／a007／a008 可能聽得出人聲字句，而且已經放上正式站曲庫 | `assets/audio-library.json:502,519,536` 的 note 還是「待人工試聽」。WORKLOG 11-13 續5 已部署這 106 個檔 | 已處理（操作者試聽「不刪 不換」，e1ab77119） | 客戶的影片背景可能出現聽得懂的字句。授權是 CC0，沒有授權問題 | 不變量：曲庫裡標「待驗」的項目不出現在分頁，驗完才出現。或者用本機 whisper 對這 3 個檔做逐字辨識，辨識出字就換成備選。檔案：`assets/audio-library.json`、`scripts/editor-panes/audio.js`。歸屬：ED.6。操作者用的試聽頁已經有了：`.data/library/試聽清單.html`（WORKLOG 續23） |
| R6 | 剪輯器頂列的比例按鈕取得焦點後按 Space，觸發的是播放，比例不會變 | 全域快捷鍵只排除 `input,textarea,select,[contenteditable],dialog`（`scripts/tools-editor.js:3245`），所以 Space 會變成 play（`:3312`）。來源：Codex 4623fa0c | 已處理（fdd3ad61e，ed1 8／ed2 21 PASS） | 用鍵盤操作會出錯，用滑鼠不受影響 | 不變量：焦點在任何可操作的控制項上（button、[role=button]）時，全域快捷鍵不攔截按鍵。檔案：`scripts/tools-editor.js`。歸屬：ED.1.5 |
| R26 | AI 生成的影片（`/generated/<uuid>.mp4`）沒有伺服器縮圖，素材卡會改用 `<video preload=metadata #t=0.1>` 抽第一格 | `backend/api.cjs:350,672,696`：生成結果只回 `/generated/` 網址，沒有經過 media-store，所以沒有 thumbUrl（media-store.cjs:172 才會產生 thumb.jpg）。`shared/assets-ui.js:45-50` 的 mediaFile 只認 thumbUrl 或 `/media/<sha256>/`；`:64-68` 找不到縮圖就改放 video | 已處理（25bcd169d＋d03041df5，r26-generated-thumb 進 gate） | 外觀和效能問題：每張生成影片的卡片都要向伺服器要一次影片 metadata；如果第 0.1 秒是黑畫面，卡片就是黑的（社群工具 11-14 續3 遇過同一類問題）。不扣錢、不掉資料 | 不變量：每支存下來的影片都在寫入的那一個地方產生 thumb.jpg（生成結果也走 media-store 的 ingest，或在 api.cjs:350 那一處補產縮圖）。檔案：`backend/api.cjs`、`backend/media-store.cjs`。歸屬：ED.4（素材卡）或 media-store 負責人 |

## 不用處理

| 編號 | 風險 | 證據 | 狀態 | 理由 |
|---|---|---|---|---|
| R7 | ED.12.3：AI 畫質增強的來源檔上限 20MB（用 data URI 傳），repo 裡沒有短效的簽名 GET 網址 | `backend/video-enhance.cjs:5-6,14,40,55`。VW backend 搜尋 presign 0 筆。next-admin 只有 `presignPut`（`lib/storage/r2-s3`） | 不用處理 | 這是產品限制，不是 bug：頁面上寫了上限（`scripts/editor-panes/effects.js:115`），超過的來源會被擋下並說明原因；只有成功才扣錢（video-enhance.cjs:4）。要放寬時再開卡，做 R2 presign GET，讓 Topaz 直接讀網址 |
| R8 | ED.6：國風配樂 0 首 | `assets/audio-library.json:14` 有 guofeng_fusion 這個曲風，但沒有任何曲子 | 不用處理 | 曲風按鈕依實際曲數產生，0 首就不顯示（`scripts/editor-panes/audio.js:242-244`）。這是內容缺口，介面不會壞 |
| R9 | 離線發行包只帶 sources.json，沒帶字型檔，所以離線狀態下首次啟動無法安裝 | `scripts/package.cjs:18`。來源：Codex 114be317 F1。WORKLOG 續24 列為剩餘風險 | 不用處理 | 和 vendor/ffprobe 是同一個模式；目前沒有離線發行的需求 |
| R10 | 標價檢查器只比對全域數量，新增一個沒標價的付費呼叫時，不一定會失敗 | `tests/paid-price.cjs:107-111`。來源：Codex a90139f8。WORKLOG:1260 決定不修 | 不用處理 | 已經決定不修。而且伺服器在送出前會先估價，不會多扣錢 |
| R11 | ED.10：整片辨識分段處理時，如果第 2 段失敗，第 1 段的供應商費用由我們吸收 | WORKLOG 11-10 續2 的剩餘風險 | 不用處理 | 客戶不會被多扣；我們最多損失一段的辨識費 |
| R12 | Gemini 已經計費但沒有回圖時，系統記了成本，卻把點數全額退給客戶 | `next-admin/lib/tarot/image-gen.ts:667`。來源：Codex 845c8eb8。WORKLOG:1557 駁回 | 不用處理 | 設計如此，成本由我們吸收 |
| R13 | 4 項刻意不修：(1) FilmCraft 從第 6–8 步開啟時 editIntent 不作用（tools-0.js:606）；(2) 影片比鏡頭秒數短時，後面的內容會提前（tools-editor.js:948）；(3)「怎麼做的」會列出已被換下的舊圖（episode-spine.js:171）；(4) 本機 SF3D 忙碌時仍被預選（image-to-3d.cjs:48） | Codex cc75d732、a0c7a768、0af2c00e F2。WORKLOG:1883、1857、1659 | 不用處理 | 各卡都已決定不採用：(1)(2) 依規格 §8 C4，(3) 只影響外觀，(4) 只影響筆電 |
| R27 | 779f4d164 沒有經過 Codex 審查，只有書面自審（ORACLE_WAIVED 寫在 commit message 裡） | `git show --stat 779f4d164`：只改 `scripts/tools-editor.js`，2 行新增、6 行刪除。`edMediaFile` 原本有自己的一份同規則程式碼，現在改成直接呼叫 `VideoWorkbench.mediaFile`（assets-ui.js:45-50）。commit 說明也寫了：assets-ui.js 在 pages/tools.html:37 同步載入，比 tools-boot.js 早 | 不用處理 | 這次改動只是讓兩份相同的規則變成一份，沒有改行為；乾淨 worktree 跑 gate 和 5 個指名測試全綠。依 AGENTS.md §4，Codex 額度用完時，「書面自審＋測試」是允許的替代做法 |
| R14 | 主機辨識的逾時沒有把 next-admin 共用同一個 whisper worker 時的排隊時間算進去 | `backend/api.cjs:1040-1046`。來源：Codex c09c1a0b F2。WORKLOG:1692 | 不用處理 | 已經決定不修；逾時只會讓任務失敗，不會扣錢 |

## 已處理

| 編號 | 風險 | 證據 |
|---|---|---|
| R15 | 本機 main 和 origin 分岔（ED.11 的 e4135cd7e 等） | WORKLOG 11-15 續13／續14：16:56 已對齊 origin，備份在 `refs/heads/backup/local-main-20261115-165651`。現在只落後 2、領先 0，直接 fast-forward 就好。結構性原因是 D:\Work 永遠有未提交的改動，所以 `git pull --rebase` 跑不了；`scripts/lib/git-safe-ops.ps1:421` 的提示也因此無效。這記在續14 C3，不屬於 ED 的卡 |
| R16 | 預覽缺轉場曲線、文字動畫、文字底色、八種字幕樣式（ED.5、ED.7-8、ED.10 畫面） | WORKLOG 11-12 續15（ED.5.3＋ED.7.3＋ED.10.4，tests/preview-parity.cjs） |
| R17 | 預覽和輸出的字型對應不同；Arial 裡的中文字級對不上 | c26cafd1b（WORKLOG 續24 C2：`edCjkRuns`、`edHasGlyph`） |
| R18 | ed10-subtitles-ui 的「開始整片辨識（免費）」按鈕失敗 | c26cafd1b 的 REALTEST：ed10-subtitles-ui 8 項全綠 |
| R19 | ED.12.3：去背會共用還在執行的 prediction，造成重複扣點 | WORKLOG 11-13 續6：`backend/replicate-run.cjs` 的 takeOver 只接手 failed／cancelled 的任務 |
| R20 | ED.12.3：4K 估價沒有實測 | WORKLOG 11-13 續4：實測 2 units，和估價的 2 units 相同 |
| R21 | ED.6：nginx `/library/` 和 106 個檔還沒部署 | WORKLOG 11-13 續5（和 Codex a63faac4 F1 是同一件事） |
| R22 | ED.10：規格 §1.3 的介面說明還沒貼上 | `docs/editor-parity-spec-20261106.md:30-33` |
| R23 | ED.3：tools-engine-host 的 `tool` race | 203bc3084（WORKLOG 11-10 續12，TDZ） |
| R24 | Codex 40aa5608（★ 用 Unicode 範圍判斷）、4c768d0d（音訊搜尋 3 項） | c26cafd1b 的 `tools-editor.js:1692 edHasGlyph`；6bdcb612a 的 `audio.js`（`edAudRedraw`、`isComposing`） |
| R25 | 其餘 ED 相關的 Codex finding（85 項） | 各卡下一輪報告的 context 欄或 WORKLOG 寫了「已修」，再對照 origin/main 的程式碼確認 |

## 附註

- 盤點期間，hook 回報本 session 改動了 audio.js、tools-editor.js、preview-parity.cjs 等檔。這是誤判：本 session 只寫了 scratchpad 和本檔。那些改動屬於 54da1baf、85e41064、4f9b6fad、924b8aea 這幾個 session，而且已經進了 origin（6bdcb612a、c26cafd1b）。
- R12–R14 依 WORKLOG 判斷。主機狀態只有 R1、R2 用 SSH 唯讀實際查過。
