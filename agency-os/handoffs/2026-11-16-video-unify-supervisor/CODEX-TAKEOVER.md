# Codex 接手：影片工具融合監工（U 卡）

續接語：「接手影片工具融合：讀 `D:\Work\agency-os\handoffs\2026-11-16-video-unify-supervisor\CODEX-TAKEOVER.md`，從 §3 表第一個未完成列開始；完成＝`data.mjs` 全部 done、每次部署經操作者當下同意。回報一律繁體中文。」

## 1. 正本（只讀這些）
- 做法：`lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/video-unify-plan-20261116.md`。優先序 §13＞§12＞§11＞§10＞§9＞§8＞§0–§7；派工順序只看 §13 表＋C1–C10。
- 狀態：`agency-os/handoffs/2026-11-16-video-unify-supervisor/data.mjs`（唯一狀態來源；`node build.mjs && node check.mjs`）。
- 規則：`agency-os/AGENTS.md`（你寫入 D:\Work 就負責 R0/R4 證據鏈；閘若未啟用，手動做 git log／驗證／commit 訊息含根因＋驗證）。
- 縮寫：NA=`lobster-factory/infra/hetzner-phase1-core/apps/next-admin`，VW=`.../apps/video-workbench`。

## 2. 硬規則
- 整合只在 `D:/Worktrees/Work/u-integrate`（detached）：`git fetch origin && git rebase origin/main` → `git cherry-pick <commit>` → 驗證 → `git push origin HEAD:main`。不在 `D:\Work` 操作（有別人的未提交改動）。
- 驗證：VW `node tests/gate.cjs`；NA `npx tsc --noEmit`＋受影響測試（`npx vitest run <檔>`）；一批併完跑一次 NA 全套 `npm test`。
- 不部署。部署（next-admin 手動、video-workbench、video-service）是 High，操作者當下說 go 才做；步驟檔格式見同資料夾 `u8-4-deploy-steps.md`。
- 兩邊（NA＋VW）都動的卡併入 main 時，同一個 commit 放 `lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD`（一行 `reason=...`），否則 03:00 自動部署只上 NA 一半。
- 畫面：價格只寫 NT$（VW 走 `shared/paid-price.js`）；不用下拉；零 hex、只用主題 token；文案繁中、不寫「我們」。
- 測試只寫卡點名的；突變只做在擁有權／可見範圍／隱私／同意／擦除守衛，一個守衛一次。
- 不改 `agency-os/WORKLOG.md`、`TASKS.md`（共享檔，只能經 `scripts/git-partial-worktree-commit.py stage`；留給 Claude 收尾）。
- 每併一張：`data.mjs` 該項 `todo(` → `done(id, 白話, commit)` → build＋check → commit（帶 pathspec）→ push。監工台頁面（claude.ai artifact `Gq8RK8udeJR2SGvmjKpQr2`）你無法發布；`supervisor.html` 照樣 build＋commit，Claude 回來再發布。
- 同一檔不得有兩個寫手：Claude 工人還在動的 worktree，你不碰。

## 3. 現況（2026-11-17 08:30）
| 項 | 狀態 | 位置 | 接手做法 |
|---|---|---|---|
| U3.5 | 已併 main `d4a254662` | — | — |
| U8.3 | 工人已 commit `767ad1e5d`，**未驗收** | `D:/Worktrees/Work/quirky-newton-e11f37` | 讀 `git show 767ad1e5d` → cherry-pick → gate → push → data.mjs |
| U4.4＋U4.5（＋B1 B2） | 未 commit，等 critic；15 檔改動 | `D:/Worktrees/Work/strange-morse-04e25d` | 工人若還活著讓它做完；若停了：讀 diff，照 plan §13 C9 補完，自己做 Deep review |
| U9 | 未 commit，27 檔改動 | `D:/Worktrees/Work/jolly-lamport-37c9e7` | 同上，照 plan §4 U9、§10 X3 |
| U5.3＋U5.4 | 未 commit，15 檔改動（含 `video-service`） | `D:/Worktrees/Work/eager-northcutt-4fe6a1` | 同上，照 plan §9、§12、§13 C2–C6；另寫 `u5-4-deploy-steps.md` |
| 其餘 todo | 未開始 | — | 照 §4 順序 |

判斷工人是否還在做：該 worktree 的檔案 mtime 最近 10 分鐘內有變＝還在做，別碰；否則視為停了，由你接手該 worktree（在那裡 commit，再 cherry-pick 到 u-integrate）。

## 4. 剩餘順序（plan §13 表）
1. 驗收 U8.3；接完 U4.4＋U4.5、U9、U5.3＋U5.4（上表）。
2. 批 2：U5.5（需 U5.4）、U8.5（需 U5.3）、U6.4（需 U5.3）。
3. 批 3：U3.6（需 U3.5、U5.3）、U6.5、U4.6（風格清單，plan §13 C10，需舊專案 `p.style` 舊資料測試）。
4. 批 4（驗收，需操作者登入的瀏覽器，**交回 Claude**）：U2.3、U11.1、U11.5。
5. 批 5：U11.2、U11.3（U11.5 過才做）。

## 5. U5.3 已定形的形狀（批 2、3 依此寫，不得另造）
```ts
type Transition = "none" | "crossfade" | "fade-black";
interface EpisodeBookend { kind: "none"|"title"|"template"; templateId?: string; fields?: Record<string,string>;
  references?: Record<string,{url:string;id?:string}>; seconds: number; transition: Transition; transitionSeconds: number; }
interface EpisodeAutoRun { until: "script"|"video"|"drafts"; budgetTwd: number; fill: "ai"|"stock-video"|"stock-photo";
  ratios: ("16:9"|"9:16"|"4:5")[]; tts: {provider:"edge"|"openai";voice:string}|null; embedSiteId: string|null;
  status: "running"|"stopped"|"done"; stop: {step:"fill"|"intro"|"outro"|"render";reason:string}|null; spentTwd: number; startedAt: string; }
```
寫入只走 runtime 主頁動作 `spine-set-bookends`（`VideoWorkbench.spine.setBookends`）與 `spine-set-auto-run`（`setAutoRun`），經 `EpisodeSpine.normalizeBookend`／`normalizeAutoRun`。`full_auto` 永不由人按的一鍵送出。

## 6. 回報（給操作者，繁中，極簡）
每完成一張：`項：… ｜ commit：… ｜ 測試：指令＋結果 ｜ 風險：… ｜ 白話：兩句`。卡住：說卡在哪（file:line）＋兩個方案各自代價，不硬做。要部署時停下問。
