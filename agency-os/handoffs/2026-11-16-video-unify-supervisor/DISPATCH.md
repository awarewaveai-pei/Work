# 下一階段派工表（監工用；狀態正本仍是 data.mjs）

續接語：我是影片下一階段的監工。讀本檔與 `NEXT-PHASE-PLAN-20261119.md` §8；用 `mcp__ccd_session_mgmt__list_sessions {linked:true}` 看四條線；工人交回就照「驗收」做，再派該線下一張。操作者 2026-11-19 授權：全部核准、要決定的事監工決定、不要問她；回報繁中、金額 NT$。

## 四條線（同線依序；一張卡一個 context）

| 線 | 模型 | 順序 | 第一張的 session |
|---|---|---|---|
| A 話題核心 | Opus 5.5 | N1 → N4 → N2（＋db-expert）→ N1b → N3（Sonnet）→ N5a → N5b → N6 → N9 → N8 → N10 | `local_4801e3e4-79f6-44b9-82b0-e572dfe358f1` |
| B 可見範圍與頁面 | Opus 5.5 | N15 → N16（Sonnet） | `local_27886a9e-2bc0-498d-adc3-7a89b5dfd4a2` |
| C 工作台 | Sonnet 5.5 | N13 → N14 → B26 → B25 → B1 → R1（Opus） | `local_056f64d2-cc3a-452f-a6e7-72483c1fa82d` |
| D 腳本頁與營運 | Opus 5.5 | N12 → N17（Sonnet）→ B24 → N7 → B19 → N18 | `local_b1704965-5082-4584-add7-9c23158f66ea` |

同線的卡動同一批檔，所以不並行；跨線若碰到同一檔，後併入的那張由監工在 cherry-pick 時解。

## 驗收（每張卡）

1. 讀工人的 FILES／TESTS／RISKS，再讀 diff（`git -C <worktree> diff main...HEAD`）；每個 `file:line` grep 驗真。
2. 在整合處重跑它點名的測試與 `npx tsc --noEmit`；有守衛的卡確認突變紀錄。
3. cherry-pick 進 `main`（pathspec；兩邊都動且工作台未部署 → 放 `DEPLOY_HOLD`）。
4. `data.mjs` 該項標 done＋commit → `node build.mjs && node check.mjs` → 發布同一網址。
5. `clear_session` 清掉那條線的 session，再 `send_message` 派下一張（brief 同格式）。
6. 部署：**不要每輪部署**（操作者 2026-11-19 19:10：「為什麼不多做一點再一起布署？花時間又燒 token」；當天七次部署＋七次 smoke 是浪費）。一天最多手動部署一次：計畫的一整批（批 0／1／2…）做完、或有東西非上線不可驗時才跑；其餘交給每晚 03:00 自動部署。Playwright smoke 只在手動部署後跑一次。有 migration 的卡併入 main 前先套 migration（03:00 的 migration 閘會擋）。長部署一律 `setsid nohup` 脫離 SSH。

## 派下一張卡的 brief（`send_message` 給同線 session；每節都要有）

- 背景一段：repo `D:\Work`；計畫 `NEXT-PHASE-PLAN-20261119.md` §8 的哪一張；NA＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`、VW＝`.../apps/video-workbench/`；先讀 `CLAUDE.md`、`agency-os/AGENTS.md`；在自己的 worktree commit，不 push、不動 `main`、不改 `data.mjs`／`WORKLOG.md`／`TASKS.md`；部署不是它的事；回報操作者一律繁體中文；先 `git fetch && git rebase origin/main`（上一張已併入）。
- 任務一句 → 問題（`file:line`，派之前自己 grep 驗過）→ 已知事實 → 要做的（編號）→ 既有資料怎麼處理＋一個舊資料測試 → 不要做。
- 測試：只列點名的；照抄「不做無效益測試：只寫卡片／finding 點名的測試；突變只做在隱私／可見範圍／擦除／同意／擁有權的守衛，一個守衛一次。」
- 驗收指令（`npx tsc --noEmit`、受影響的 `npx vitest run <路徑>`、VW 用 `node tests/gate.cjs`；不跑全套）＋`/codex-review`。
- 回報格式：`FILES:`／`TESTS:`／`RISKS:` 三行加一句結論。

## 監工自己的 context

- 每次被工人叫醒：先讀本檔，再 `list_sessions {linked:true}`。**不要 `clear_session self`**（操作者 2026-11-19 13:40 看到對話消失很火：「為什麼對話都沒了」）；context 滿了讓系統自動壓縮，本檔＋`data.mjs`＋git 仍是全部狀態，壓縮後重讀本檔即可。
- 2026-11-19 實走在正式站留下、未對外：題目 `d67e4a5a…`、社群草稿 `776dc9e4…`、空專案列 `81448cc0…`「一鍵腳本」。操作者說先留著的是 `E2E-Verify-0704` 站；她只用 Soulful 與 AwareWave。

## 工人回報的 RISKS（操作者 2026-11-19：「sessions 有 risks 你要看需不需要處理」）

- 每張卡驗收時逐條判：會出錯的貨（錯的影片／錢／可見範圍）、沒在瀏覽器看過的畫面、沒對真實服務跑過 → 監工當輪處理或實看；純理論、機率極低 → 記在監工台該項，不開卡。
- 工人的 Codex 審查最多兩輪；第三輪起只修「上限被繞過／資料遺失／測試紅」，其餘列 RISKS 後 commit。

## 已定且卡片要照做的

- N12：上限是硬保證（照最大值預留）；上限 < 整趟最大值不得起跑。計畫原寫「上限預設＝預估×2」作廢。
- 上線前閘是流程：批 0 標完成前不切 `ai_review_auto`。
- 對外發布與寄信：第一則 AwareWave 真發布前，監工在監工台留一行再做；Soulful 不開自動。
- B26（監工 2026-11-19 14:45 定案，回答工人的問題）：`outputStale` 只比 `editRevision`，快速輸出成片一律 false，所以**要新增**純函式（放 `episode-spine.js`）：拿最新成片 step 的 `from[{slot:"shot:<id>",key}]` 逐鏡頭與 `current(episode,"shot:<id>")` 用 `isStale` 比，任一變了＝成片過期；resume 時過期 → `attempt`＋1 並讓「成功但過期」的舊 job 不算已送，重送出片；停點面板加「鏡頭已換，會先重新出片再審」。「畫面凍結」是主系統審片擋的，工作台停點 step 先查清再掛。
- N2 交接：線 A 讀碑結論在 `C:\Users\user1115\AppData\Roaming\Claude\side-session-notes\local_ad3f6c23-9f15-4337-b3f8-3511404da6ba\N2-handoff.md`（付費呼叫點、預算樣板、dailyLimit 流向）；續做從派 db-expert 審 schema 開始。
- 2026-11-19 14:40 四條工人線都撞到訂閱 5 小時上限（18:00 台北重設）；N2、B26、B24、N18 都沒改檔、沒 commit。恢復後用同一份 brief 重派（brief 在各 session 第一則訊息）。
