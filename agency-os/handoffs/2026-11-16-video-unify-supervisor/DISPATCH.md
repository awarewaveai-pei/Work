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
6. 部署：一批併完部署一次（`sg-deploy.sh`）；next-admin 每晚 03:00 也會自動上 main。

## 派下一張卡的 brief（`send_message` 給同線 session；每節都要有）

- 背景一段：repo `D:\Work`；計畫 `NEXT-PHASE-PLAN-20261119.md` §8 的哪一張；NA＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`、VW＝`.../apps/video-workbench/`；先讀 `CLAUDE.md`、`agency-os/AGENTS.md`；在自己的 worktree commit，不 push、不動 `main`、不改 `data.mjs`／`WORKLOG.md`／`TASKS.md`；部署不是它的事；回報操作者一律繁體中文；先 `git fetch && git rebase origin/main`（上一張已併入）。
- 任務一句 → 問題（`file:line`，派之前自己 grep 驗過）→ 已知事實 → 要做的（編號）→ 既有資料怎麼處理＋一個舊資料測試 → 不要做。
- 測試：只列點名的；照抄「不做無效益測試：只寫卡片／finding 點名的測試；突變只做在隱私／可見範圍／擦除／同意／擁有權的守衛，一個守衛一次。」
- 驗收指令（`npx tsc --noEmit`、受影響的 `npx vitest run <路徑>`、VW 用 `node tests/gate.cjs`；不跑全套）＋`/codex-review`。
- 回報格式：`FILES:`／`TESTS:`／`RISKS:` 三行加一句結論。

## 監工自己的 context

- 每次被工人叫醒：先讀本檔，再 `list_sessions {linked:true}`。一輪驗收做完、沒有進行中的動作時 `clear_session self`（本檔＋`data.mjs`＋git 就是全部狀態）。
- 2026-11-19 實走在正式站留下、未對外：題目 `d67e4a5a…`、社群草稿 `776dc9e4…`、空專案列 `81448cc0…`「一鍵腳本」。操作者說先留著的是 `E2E-Verify-0704` 站；她只用 Soulful 與 AwareWave。

## 已定且卡片要照做的

- N12：上限是硬保證（照最大值預留）；上限 < 整趟最大值不得起跑。計畫原寫「上限預設＝預估×2」作廢。
- 上線前閘是流程：批 0 標完成前不切 `ai_review_auto`。
- 對外發布與寄信：第一則 AwareWave 真發布前，監工在監工台留一行再做；Soulful 不開自動。
