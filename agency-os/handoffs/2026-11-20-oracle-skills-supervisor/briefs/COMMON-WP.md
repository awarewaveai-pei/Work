# 算命站 WordPress 階段：共用規則（每張卡先讀；引擎卡另讀 `COMMON.md`）

- 身份與紀律：`agency-os/AGENTS.md` §1（全能規劃師＋頂尖工程師；不補丁、不畫蛇添足；每個發現附 `file:line`，不寫「可能是」）。
- 設計正本（先讀與自己卡相關的節，不重述）：產品 `briefs/ORACLE-WP-SPEC.md`；平台 `briefs/SITE-FLOW-COMPLETION-PLAN.md`；派工 `WP-PLAN.md`。卡片與正本衝突時停下回報，不自己選。
- 已定、不要再提出的：同網域內嵌框；引擎不改名；每日信用 FluentCRM「寄自訂信給聯絡人」；寄信經 FluentSMTP→Resend，寄件網域 `oracle.aware-wave.com`；私人合盤（不邀請、不通知）；不登記 `products.ts`。
- 開工：自己的 worktree `git fetch origin && git reset --hard origin/main`；只動卡片「檔案」節列的檔；卡片外發現問題寫進 RISKS，不順手改。
- 套件：引擎在專案目錄 `npm ci`；next-admin 在 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin` `npm ci`。不建 junction 連到別處的 `node_modules`。
- Git：commit 帶 pathspec、留在 detached HEAD；不 push、不動 `main`、不改 `agency-os/WORKLOG.md`／`TASKS.md`／本資料夾的 `data.mjs`；不部署、不連主機、不套 migration、不改任何 `.env*`。
- 測試：不做無效益測試：只寫卡片／finding 點名的測試；突變只做在隱私／可見範圍／擦除／同意／擁有權的守衛，一個守衛一次。產物放 `$env:TEMP` 或 session scratchpad，不進 repo。
- 驗收必跑：改 `.ts/.tsx` → 該專案 `npx tsc --noEmit`＋`npx vitest run <受影響路徑>`（不跑全套）；next-admin 新增或搬動 API route、頁面、或寫到系統模式／權限相關字串時，另跑結構檢查 `npx vitest run lib/portal lib/system-modes`（SF-G 併入後這兩處紅過）；改 `.sh` → `bash -n`＋卡片指定的測試腳本；改 `.php` → `php -l`。跑完把 `tsconfig.tsbuildinfo`、`next-env.d.ts` 還原（`git show HEAD:<檔> > <檔>`）。
- 審查：完成後派一個 `critic`（卡片寫 Deep 的用 Deep），Critical／Major 修完才回報。Codex 額度到 2026-11-24 前不可用，RISKS 寫明。
- 本機服務：只關自己開的 PID／port；禁止 `taskkill /IM node.exe`；dev server 用 `.claude/launch.json` 的預覽，不用 Bash 起。
- Context：要改的檔整檔讀，其餘 grep；大輸出導檔。接近上限時先把進度寫進自己 worktree 的 `HANDOFF-<卡號>.md`（不 commit）再讓系統壓縮；壓縮後重讀本檔、自己的卡與該檔續做。一張卡做完就停，不自己接下一張；監工會用訊息派下一張或清空 session。
- 回報（繁體中文，只要這四行）：`FILES:`（含 commit sha）／`TESTS:`（指令＋結果）／`RISKS:`（每條一行；沒有寫「無」）／一句結論。回報操作者一律繁體中文。
