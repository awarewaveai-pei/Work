# Risk triage U2 U5 U8 U10（2026-11-16）

來源：四個工人 session 最後回報的 RISKS／限制／沒跑；oracle `60a36316`（U2）、`6615d7f6`（U5）、`47906dad`（U10）、`a712f492`（U8，只在 worktree，見 #23）；commit `3a3ad4565` `2f26d7dac` `a878b713a` `2f0b08bb8`。
程式碼證據以 `D:/Work` origin/main `2a82fcc10` 為準；路徑前綴：`NA/` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`，`VW/` = `.../apps/video-workbench/`，`VS/` = `.../apps/video-service/`，`PLAN` = `VW/docs/video-unify-plan-20261116.md`。
正式環境 2026-11-16 用 ssh 唯讀查：`organizations` 分組計數、`docker exec printenv`。

結果：現在修 0 條｜某張卡會處理 5 條｜不用處理 18 條。

| # | 卡 | risk | 證據 | 分類 | 要做什麼 |
|---|---|---|---|---|---|
| 1 | U10 | (a) 子組織登入時，面板用 session 組織查方案，不是計費組織，會顯示 free／0 點 | 屬實：`VW/scripts/usage-panel.js:6,10` 讀 `capabilities.mainSystem.organizationId`（`VW/backend/api.cjs:1481` 是工作台的 `orgId`）；計費組織在 `NA/app/api/video/workbench/session/route.ts:38`。**只影響顯示**：扣錢用 `billingOrgId`（`VW/backend/api.cjs:249`、`VW/backend/main-system.cjs:260,331`）。正式庫子組織＝0（`organizations` 有 parent 的 0 列；customer 7、internal 1） | 不用處理 | 目前沒有人會遇到。等第一個子組織建立時再修：`/capabilities` 多回 `req.vwIdentity.billingOrgId`（`api.cjs:1481`），面板改用它查；`NA/app/api/video/billing/route.ts:16` 的 `assertOrgAccess` 也要讓客戶讀得到自己的計費組織。這樣「顯示的帳＝扣錢的帳」這一類問題就一起關掉 |
| 2 | U10 | Codex F2：開機時 capabilities 還沒到，用量列不更新（已修） | `VW/scripts/usage-panel.js:63` 先 `await loadCapabilities()` | 不用處理 | 已修 |
| 3 | U10 | 計畫要「已用量」，面板沒有 | PLAN:227 要求；`NA/app/api/video/billing/route.ts:37` 回應本來就沒這個欄位，工人沒有自己推算 | 不用處理 | 沒有資料來源，不編數字是對的 |
| 4 | U10 | 沒連主系統時，按鈕仍顯示「API · 依實際用量」 | `VW/scripts/usage-panel.js:4,21` | 不用處理 | 照設計（本機版） |
| 5 | U10 | 工人用 `verify-clear.ps1` 解 commit 閘，沒寫 WORKLOG／BUGHUNT 證據行 | origin/main 的 `agency-os/WORKLOG.md` 目前沒有任何 video-unify 條目 | 不用處理 | 監工收工時統一補；AO-CLOSE 的 `verify-closeout-completeness.ps1` 會擋，不會漏 |
| 6 | U5 | (b) 超過 200 MB 的影片鏡頭會被收下，要等渲染服務下載時才失敗 | 屬實：`NA/app/api/internal/video/workbench/quick-render/route.ts:89` 只檢查 mime；`VS/server.py:65,189` 上限 200 MB（正式容器 `printenv RENDER_MAX_ASSET_MB`＝200）。**不會多扣錢**：下載在配音之前（`VS/server.py:316-336`）；送出時的 `recordUse` 只記一列用量、不扣點（`NA/lib/entitlements/can.ts:166-172`） | 某張卡會處理 | U5 commit 2（PLAN:191「缺圖或缺旁白的鏡頭列出來，缺就不能送」）：同一份清單把 >200 MB 的鏡頭也列出來、擋住不送 |
| 7 | U5 | Codex F2：渲染服務一次只做一支，工作台 20 分鐘就判失敗（已修） | `VW/backend/quick-render.cjs:16` 改 55 分鐘 | 不用處理 | 已修 |
| 8 | U5 | (c) 工作台重啟會中斷執行中的快速輸出；工人說重送會再扣一次付費聲線 | 中斷屬實：`VW/backend/api.cjs:311-315` 把沒有 `providerId` 的任務標成失敗。**「再扣一次」不成立**：`recordUse` 不扣客戶點數（`NA/lib/entitlements/can.ts:166-172`），重送只多花我們自己的 OpenAI 配音費。片子不會丟：主系統的對帳排程會補登記（`NA/lib/content/video/reconcile.ts`） | 不用處理 | 跟片頭模板、重燒字幕現在的做法一樣。只要記得：快速輸出跑著時不要部署工作台 |
| 9 | U5 | 多比例加自動完成時，排程只看最新那張進度票，可能提早往下推 | 工人回報；commit 1 只送一個比例（`route.ts:109` `formats:[p.ratio]`） | 某張卡會處理 | U5 commit 2／3（PLAN:191-192 比例複選、一鍵成片） |
| 10 | U5 | 下載程式跟 `remotion.cjs` 重複一份 | 工人回報（當時 U8 在改同一個檔） | 不用處理 | 不影響行為 |
| 11 | U2 | (d) 樣式檢查器豁免 `OrganizationPicker`，但腳本頁沒選客戶時會顯示它（內含 `<select>`） | 屬實：`NA/app/video/(wb)/__tests__/style-contract.test.ts:24` 豁免；`NA/app/(shell)/tools/video/ScriptForge.tsx:865` 在 `!SF_BRAND_ORG` 時顯示。**現在還看不到**：`NA/app/video/(wb)/` 只有 `layout.tsx`、`workbench.ts`、`works/`，腳本頁還沒掛進工作台 | 某張卡會處理 | U3（PLAN:172 把 ScriptForge 掛進工作台）：要用工作台連線的組織設定 `SF_BRAND_ORG`，讓選擇器不出現（PLAN:166「門頁一律鎖定組織、不顯示」），並刪掉 `style-contract.test.ts:24` 的豁免，交給檢查器守。U3 正在做，監工要把這一行轉給它 |
| 12 | U2 | (d) Playwright 畫面比對沒跑（計畫 PLAN:167 要求） | commit `3a3ad4565` 寫明沒跑；改用檢查器逐條比對 CSS | 某張卡會處理 | U11 驗收表（PLAN:232）在工作台實際走一遍時一起看 |
| 13 | U2 | 檢查器比對工作台 CSS 的那段，在主機部署時會跳過 | 工人說「只在本機和 CI 跑」**不完全對**：next-admin 的 CI 只跑 typecheck（`.github/workflows/next-admin-typecheck.yml:63`），沒有跑 vitest；sg-deploy 的 `npm test` 環境裡沒有工作台資料夾。所以 CSS 比對只在本機跑；hex／字型／`<select>` 的檢查在部署時照跑 | 不用處理 | 比對只防「工作台改了 `projects.css` 而 primitive 沒跟上」；以後動 `projects.css` 時在本機跑一次就好 |
| 14 | U2 | 外觀變動：導覽鈕多邊框、場景表頭變淺、客戶按鈕會換行、`/tools/designs` 影片黑邊變灰 | 工人回報 | 不用處理 | 只是外觀，都改用 theme token |
| 15 | U2 | 動態預覽暗底用 `color-mix(…, black)`，不是 token | 工人回報 | 不用處理 | 只是外觀 |
| 16 | U2 | 工作台自己的 `.btn` padding 不一致（`tools.css` 11/18、`projects.css` 10/14） | 工人回報；本卡以 `projects.css` 為準 | 不用處理 | 工作台原本就這樣，不是這張卡造成的 |
| 17 | U2 | Codex F2：`cardStyle` 多一個 `.panel` 沒有的 padding（已修） | commit `3a3ad4565`：padding 改由各呼叫端給，檢查器加屬性集合比對 | 不用處理 | 已修 |
| 18 | U8 | 3 張圖＋logo＋音樂整包送出上限 3.5 MB，一般相片或整首歌會被擋 | 屬實：`VW/backend/remotion.cjs:80,140-141`（2026-11-02 就有的上限，對應 `apps/remotion-service/src/server.ts:19` 的 4 MB）；音樂整檔轉 base64（`VW/backend/api.cjs` `audioReference`）。在收單時就回 413，什麼都還沒做、不花錢 | 不用處理 | 錯誤訊息清楚。若要能用整首歌：送出前把音樂切到片長、圖片縮到輸出尺寸（只改 `api.cjs` 的 `mediaReference`）；要做的話併進現有卡，不另開 |
| 19 | U8 | 模板長度下限是猜的，非預設長度沒有實際渲染過 | 長度不對的成片會被輸出驗證擋下、任務失敗，不會交出去（`VW/backend/media-inspect.cjs:162-165`，`api.cjs:692`）；Remotion 是自家服務，不按次收費 | 不用處理 | 最壞情況是任務失敗 |
| 20 | U8 | 背景音樂沒有經過 `audio-policy` 的外送檢查 | 音樂只送到自家的 Remotion 服務（正式容器 `REMOTION_SERVICE_URL`＝自家子網域，程式在 `apps/remotion-service/`），沒有送去外部 AI | 不用處理 | 聲音沒有離開我們的伺服器 |
| 21 | U8 | 時間軸 v1 匯出對話框沒有常駐測試，只用一次性 playwright 看過 | 工人回報 | 某張卡會處理 | U11 驗收表（PLAN:232）實際點一遍 |
| 22 | U8 | (e) gate 在 worktree 因為缺 `opencc-js` 失敗 | 只是環境問題：`VW/package.json:10` 有列這個套件；main 上 `video-workbench — deploy gate` CI 第 43811477485 次（2026-11-16T05:37Z，已含 U8）成功；部署 smoke 全過（`2a82fcc10`） | 不用處理 | 不是程式問題 |
| 23 | U8 | Codex 兩項（靜音也通過、短音樂剪短影片）已修，但審查紀錄沒進 main | 已修：`VW/backend/remotion.cjs:142`（`audible`）、`api.cjs` 改 `-t`。紀錄只在 `D:/Worktrees/Work/reverent-goldwasser-fd865d/agency-os/reports/oracle/2026-11-16-review-a712f492.md` | 不用處理 | 清 worktree 前，監工把這份紀錄複製進 main 的 `agency-os/reports/oracle/` |
