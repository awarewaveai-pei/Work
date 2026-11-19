# 卡片 B26 第二段「續跑後不得拿舊成片往下走」

共通規則：repo `D:\Work`，在自己的 worktree 分支工作。先讀 `CLAUDE.md`、`agency-os/AGENTS.md`。先 `git fetch origin && git rebase origin/main`。在自己的 worktree commit，不 push、不動 `main`、不改 `data.mjs`／`WORKLOG.md`／`TASKS.md`；部署不是你的事；回報操作者一律繁體中文。NA＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`、VW＝`lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/`。

背景：B26 第一段已上線（`19c12980a`＋`16cea8fb9`：VW `shared/episode-spine.js` 的 `shotsSwapped`／`cutOutdated`，續跑時鏡頭已換就先重新出片）。當時留下兩個要改主系統才補得上的空窗，監工判定屬「可能把錯的影片送出去」，要補。B1 兩段已在 main：`NA/lib/content/video/ratio-rows.ts` 是「這個專案每比例最新一支」的唯一規則。

## 兩個空窗（先讀程式確認，各自寫出 file:line 再動手）
A. 按「從這裡繼續」時，工作台先叫主系統接續（VW `scripts/projects-0.js` 約 1473 行 `serverRun(p, run, "resume", budget)`），新的出片還沒送出；主系統的自動推進（`NA/lib/content/video/advance-auto-projects.ts` → `project-advance.ts`，每 5 分鐘）若剛好跑到，會拿舊成片去審片、核准、建草稿。
B. 社群草稿每個專案只建一次（`NA/lib/content/video/project-advance-deps.ts:59-67`，`brief.autoDrafts` 有值就回「社群草稿先前已建立」）；草稿已用舊成片建好、後面才停下，換圖重出片後不會重建，草稿裡還是舊影片。

## 要做
不變量：自動推進往下走時用的成片，必須是這一輪 run 最新出的那支。
1. A：resume 請求多帶一個欄位（例如 `rerender: true`，由 `EpisodeSpine.cutOutdated(e)` 決定）。主系統收到後把該專案標成「等新成片」（沿用既有欄位：`lifecycle_stage` 退回 `produce`，並在 `brief_json.autoBudget` 或同層記一個「resume 之後才算」的時間點），自動推進的 `renderState`／`rows` 只認這個時間點之後的成片；沒有新成片就回 `waiting`（B24 已讓 waiting 不佔名額）。
2. B：`autoDrafts` 記下建草稿時用的成片（asset id 或 checksum）。之後成片換了（`ratio-rows.ts` 回的列與記下的不同）→ 重建：把舊草稿的媒體換成新成片，或撤掉舊草稿重建（看 `lib/social/store.ts` 既有能力，選動作最少且不留孤兒草稿的做法，寫明理由）。已經發布出去的貼文不動，只在專案 `last_error`／通知寫明「已發布的貼文用的是舊版影片」。
3. 兩處都要重入安全（同一輪跑兩次不重複建、不重複撤）。

## 既有資料
既有 `autoDrafts` 沒有成片紀錄 → 視為未知，不主動重建（避免把正式站現有草稿全部重做）；之後再出新片才比對。舊資料測試一支：舊格式 `autoDrafts:{at,count}` 的專案推進 → 不重建、不報錯。

## 不要做
不改審片規則、不改 `episode-spine.js` 的 `stepStates`、不加 DB 欄位（用 `brief_json`）、不動 B1 的比例選擇。

## 測試
A 一支（resume 宣告重出片後、新片未到 → 自動推進回 waiting，不審舊片）；B 兩支（成片換了 → 草稿指向新片且只做一次；已發布的不動）；舊資料一支。突變一次：拿掉 A 的時間點條件 → A 測試紅（對外發布守衛）。
不做無效益測試：只寫卡片／finding 點名的測試；突變只做在隱私／可見範圍／擦除／同意／擁有權／對外發布的守衛，一個守衛一次。

## 驗收
NA `npx tsc --noEmit`（`.next/types` 有 6 個舊產物錯誤，忽略）、`npx vitest run lib/content/video app/api/video app/api/internal/video lib/social`；VW `node tests/gate.cjs`；`/codex-review` 最多兩輪。

## 回報
`FILES:`／`TESTS:`／`RISKS:` 三行加一句結論。
