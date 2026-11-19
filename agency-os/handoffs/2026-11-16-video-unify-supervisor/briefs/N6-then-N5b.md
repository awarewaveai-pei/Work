# 線 A：先 N6「已審核題目的發布鈕」，再 N5b「文章改嵌 YouTube 連結」（兩張依序做、各自一個 commit）

共通規則：repo `D:\Work`，在自己的 worktree 分支工作。先讀 `CLAUDE.md`、`agency-os/AGENTS.md`。先 `git fetch origin && git rebase origin/main`（N5a 分步發布 `fd6eb2c13` 已在 main）。在自己的 worktree commit，不 push、不動 `main`、不改 `data.mjs`／`WORKLOG.md`／`TASKS.md`；部署與套 migration 不是你的事；回報操作者一律繁體中文。NA＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。兩張都動 `lib/content/topics/make.ts`，所以排在同一條線依序做，不並行。

計畫：`agency-os/handoffs/2026-11-16-video-unify-supervisor/NEXT-PHASE-PLAN-20261119.md` §8 批 1 的 N6、N5b，§9 發布安全，§11 O1（已定：加發布鈕，有人按才發，記下誰按的）、O4（驗收＝AwareWave 第一則真發布，YouTube 先設不公開）。

---

## 第一張 N6（High）

任務：人工審核的網站，題目到「已審核」後多一顆「發布」，按一次就照 N5a 的同一串發出去（YouTube → 文章 → 其他社群）；旁邊列出各草稿的連結。有人按才發，並記下誰、何時按的。

問題（file:line 監工 grep 驗過）：
- `app/(shell)/tools/content/topics/TopicsBoard.tsx:77` `reviewed: [["redo", "退回重做"]]`：已審核的題目只有退回。
- `lib/content/topics/make.ts:271` 發布的門：`if (!autoPublishes(site.defaults)) throw new MakeError("網站已改成人工審核…")`；`:413` deps 的 `autoPublishes`。
- N5a 的分步流程在 `lib/content/topics/publish-steps.ts:59` `publishSteps`，tick 把題目推到 `publishing`。
- API：`app/api/content/topics/[id]/route.ts`（核准／退回／重試的 PATCH）、`[id]/start/`（立即開始，可照它的寫法）。
- N16 的「下一步」純函式 `lib/content/topics/lanes.ts` `nextStep`：reviewed 目前回「看草稿」。

要做：
1. 門改成「網站是自動發布，**或**這個題目有人按了發布」：題目上記 `artifacts.publish.requestedBy / requestedAt`（或 N5a 已有的結構旁，先讀 `publish-steps.ts`），`make.ts:271` 與 tick 判斷都讀它。沒有人按、站也沒開自動 → 絕不發布（守衛）。
2. API：新動作 `publish`（放 `[id]/route.ts` 的 PATCH 或新 `[id]/publish/route.ts`，照 `start/` 的權限寫法）：只有員工與該品牌的編輯以上能按（沿用該路由既有角色檢查；客戶唯讀角色不行）；狀態必須是 reviewed；用 version 搶，按兩次只生效一次。
3. UI：TopicsBoard reviewed 列主按鈕「發布」，旁邊列草稿連結（文章 `artifacts.article.wp_edit_url`、社群草稿連結）；按之前出確認（寫明會發到哪幾個地方、YouTube 公開或不公開）。`lanes.ts` `nextStep` 對 reviewed 回「發布」。工作台「自動排程」頁同一顆（它用同一個 `nextStep`）。
4. N1b 的必附段落檢查、N1 的審片閘都在發布前照跑（不要繞過）。

既有資料：既有 reviewed 題目沒有 requestedBy → 不會自己發；按了才發。舊資料測試一支。

不要做：不替任何站開自動發布；不對正式站發任何東西（測試全用假 deps）；不改 N5a 的步驟順序。

測試：突變一次——拿掉「自動或有人按」判斷 → 「沒人點頭的站不得發布」紅（對外發布守衛）；權限測試（唯讀角色 403）；按兩次只發一次；舊資料案。

---

## 第二張 N5b（Medium）

任務：(a) 發布時把文章裡的影片檔換成 YouTube 連結；沒連 YouTube 的站維持現在的做法。(b) 一鍵成片重新出片後，網站草稿文章裡嵌的舊影片也要換成新的（B26 第二段留下的缺口）。

問題：
- `lib/content/video/embed-in-post.ts`：`embedVideoInPost` 用 `once` 防重複，沒有「換掉已嵌入的影片」的能力。
- N5a：YouTube 上線後才發文章，`artifacts.publish.youtube.url` 已有連結，但文章內嵌的還是 R2 的 `.mp4`。
- B26 第二段（`7decd94ad`）：社群草稿會換片（`lib/content/video/draft-refresh.ts`），但網站草稿（`project-advance-deps.ts` 的 `autoEmbedded`）只建一次，換片後不更新。

要做：
1. `embed-in-post.ts` 加 `swapEmbeddedVideo(identity, { siteId, postId, fromUrl, to })`：`to` 可以是另一支 `.mp4`（含 sha256／releaseId）或 YouTube 網址（改成 YouTube 嵌入區塊）；走同一條通道（有 WP Bridge 的站走 Bridge，照檔內既有 `writePost`／`readPost`）；找不到 `fromUrl` 就不動並回報；重跑不重複（冪等）；只改草稿或待審文章，已發布文章的規則照檔內既有的 `DRAFT_ONLY_REFUSAL`／`BRIDGE_LIVE_REFUSAL`——(a) 的情境是「發布文章的那一步之前先換」，所以文章仍是草稿。
2. (a) 接進 N5a 的文章那一步：有 `publish.youtube.url` → 先 swap 成 YouTube 再發布；發布後文章含 YouTube 網址、不含 `.mp4`。
3. (b) 接進 B26 第二段的換片流程：`autoEmbedded` 記下嵌入時用的成片（照 `autoDrafts` 的寫法），成片換了且文章仍是草稿 → swap 成新片；已發布的不動，通知寫明。
4. 回執（`recordDeliveryReceipt`）照 N14 的語意記。

既有資料：既有 `autoEmbedded` 沒有成片紀錄 → 視為未知，不主動改（同 B26 第二段的規則）。舊資料測試一支。

不要做：不改審片、不改社群草稿換片（已做）、不加 DB 欄位。

測試：swap 成 YouTube、swap 成新 mp4、找不到來源不動、重跑冪等、已發布文章不改；(a)(b) 各一支整合；舊資料案。本卡沒有新守衛，不做突變。

---

## 兩張共通

不做無效益測試：只寫卡片／finding 點名的測試；突變只做在隱私／可見範圍／擦除／同意／擁有權／對外發布的守衛，一個守衛一次。

驗收指令（每張各跑一次）：NA `npx tsc --noEmit`（`.next/types` 有 6 個舊產物錯誤，忽略）、**全套 `npm test`**（本機有兩支與本卡無關的紅：`lib/portal/__tests__/products.test.ts`、`staff-tools.test.ts`，來自 `D:\Work` 另一條線未提交的目錄；在你的 worktree 應該是綠的）；`/codex-review` 每張最多兩輪，第三輪起只修「未點頭就發布／重複發布／測試紅」。

回報：每張一段 `FILES:`／`TESTS:`／`RISKS:`，兩張都做完再一起回報（兩個 commit）。
