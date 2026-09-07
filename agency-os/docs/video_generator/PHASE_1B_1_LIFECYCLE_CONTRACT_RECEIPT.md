# Phase 1B-1 — 影片工作生命週期契約實作收據

**狀態：隔離 worktree 已完成並測試；未合併、未部署、未執行資料庫 migration。**
**日期：2026-09-06**
**工作樹：** D:\Worktrees\media-video-phase0
**分支：** codex/media-video-phase0

## 交付內容

新增一份純函式、版本化的工作生命週期契約：

- D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\content\video\job-lifecycle.ts:1
- D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\content\video\__tests__\job-lifecycle.test.ts:1

狀態流程：

    queued → claimed → submitting → submitted → rendering → finalizing → succeeded
                                                         ↘ failed
    submitting/rendering/finalizing → unknown → reconciling → succeeded | failed | retry_queued
    retry_queued → claimed

契約的 fail-closed 規則：

1. queued 不可直接跳到 submitting，所以外部 renderer 呼叫前一定要先經過 claim。
2. unknown 不可直接重送；只能先進 reconciling，由未來的工作者查 renderer/R2 證據。
3. 只有 retry_queued 可再次被 claim。
4. succeeded、failed 是終態，不能重開。
5. 現行 running | done | error 只能單向映射為讀相容，不可把新生命週期壓回舊三態。

## 對既有系統的影響

此交付沒有匯入 route、沒有修改 video_jobs schema、沒有呼叫 renderer，也沒有變更 UI。它是 Phase 1B-2 migration、1B-3 durable executor 和 1B-5 VideoStudio adapter 的共同輸入契約。

現有反向順序缺口仍在 render-draft：renderer 已先提交，才建立本地 job，見
D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\video\render-draft\route.ts:142-195。

本次沒有用表面調換兩行的方式處理，因為未完成 idempotency、lease、unknown/reconcile 和 renderer acceptance 協定前，那樣仍不能安全重試。

## 驗證

在隔離 worktree 的 next-admin 執行：

    npm test -- job-lifecycle renderer-auth renderer-client-auth video-status-tenant reconcile-classify registry-video-blocks video-out-name pick-primary-output
    npm run typecheck
    git diff --check

結果：

- 8 個測試檔、57 個測試全數通過。
- TypeScript tsc --noEmit 通過。
- git diff --check 通過。

## 後續硬閘

進入 Phase 1B-2 前仍需：

1. 以受控 staging 連線確認實際的 Supabase migration runner、renderer 部署和 Trigger worker。
2. 對 video_jobs 做 lock-timeout migration rehearsal、RLS proof、查詢計畫與 rollback rehearsal。
3. 在 renderer 端先證明同一 idempotency key 絕不創造第二個渲染 attempt。
4. 以程序中斷測試驗證 unknown → reconciling，不能把不確定結果自動重送。
