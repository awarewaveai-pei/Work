# Video unify supervisor — Claude handoff (updated 2026-11-19 10:00, task closing)

續接語：影片工具融合監工已收尾（data.mjs 50/50，詳 WORKLOG 2026-11-19）。後續只剩 SOP §2 B 的未修項（B19、B21、B22、B24、B25）與待決 5 的 Remotion 封面模板，各自另開卡；不要從本 handoff 重做已完成列。回報一律繁中。建議模型：Opus 5.5。

## State (facts, verified 2026-11-19)
- main 最新：`3a749c449`（U11.2 ff376bde4、U11.3 882f8c69a、評分欄位修正 4e0c84203、auto_after_render 系統層推進 c0eb5553f→3a749c449）；next-admin 已部署 3a749c449（sg-deploy smoke all OK，rollback 快照 rollback-20261119-013245）。video-workbench 754efe007、video-service 0ad5d240b 未變。
- Integrate worktree `D:/Worktrees/Work/u-integrate`（detached）；W1 worktree `D:/Worktrees/Work/u11-entry-cleanup-c44098`（branch `claude/u11-entry-cleanup-c44098`，內容已全部進 main；移除前先 `cmd /c rmdir <wt>\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\node_modules`）。
- Supervisor：`data.mjs` → `node build.mjs && node check.mjs` → 發布到 https://claude.ai/artifact/44ZLNFx32ZtLhQniaM79S5（本帳號擁有；Gq8RK8udeJR2SGvmjKpQr2 是另一帳號的頁）。
- Soulful：16:9／4:5 封面已補（每支三張，最舊＝選中）；四則社群貼文排程台北 11/19 12:00（帶封面）；WordPress #7753 future 2026-11-19 04:00Z（曾被不明操作丟回收桶，已救回，操作者拍板排程）。
- U11.5 三級：第 1 級 Soulful 人工（11-18）過；第 3 級 AwareWave 一鍵到草稿（9:16、圖庫影片、上限 NT$1）：抓到 B20、B23 兩個根因並修好上線；成片後審片停在 B25（圖庫影片本身靜止）→ 換素材「從這裡繼續」→ 結果見 data.mjs U11.5；第 4 級話題全自動到 reviewed（u11-5-level4-verification.md）。
- 事實查證用：`timeout 60 ssh -p 58122 ubuntu@145.239.195.47 "sudo docker exec -i supabase-db psql -U postgres -d postgres"`；`media_production_projects`（lifecycle_stage／autonomy／last_error）、`social_posts`（state／scheduled_at）、`media_qa_reports`（candidate_asset_id／qa_kind／report_json）。

## 剩下（各自另開卡，不在 50 項內）
1. 待決 5：Remotion 封面模板（SOP §2 C／§2 D 1）。
2. B19 社群編輯頁時間選擇器時區；B21 話題預估漏配圖；B22 話題無金額上限；B24 自動推進每組織只取最舊 3 支；B25 圖庫匯入先跑 freezedetect。
3. `/handoff` 搬腳本歷史只有單元測試，沒在真瀏覽器跑過（U11.2 RISKS）。
