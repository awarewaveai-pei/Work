---
slug: outbound-c16-2-handoff
created_utc: 2026-11-05T11:05:00Z
hint: "C16.2 fifth consistency measure running on host; finish = read result, clean test data, supervisor, WORKLOG"
---

**續接語**：「續做外聯 C16.2：讀 agency-os/handoffs/2026-11-05-outbound-c16-2-handoff.md，從 §2 第 1 步開始；完成 = 結果判定＋測試資料 0 殘留＋監工台與 WORKLOG 更新。建議模型：Opus 5.5」

## 1. 現況（2026-11-05 11:00 UTC）
- 正式站 next-admin = 31e89c479（含外聯 1cf4e2274 以前全部）。外聯 AI：研究／事實核對／回信分類 = 免費 Gemini `gemini-3.5-flash-lite`（`NA/lib/outreach/ai-gemini.ts OUTREACH_JSON_MODEL`），OpenAI 平台帳戶額度用完（操作者選 Gemini，不儲值）；產信 AI 失敗會往下一階（81a1b43a0）。
- 事實核對 = 多數決 `checkClaimsVoted`（`NA/lib/outreach/claim-check.ts`），temperature 0。一致率工具量的就是它。
- 前四次量測（單次對單次，OpenAI）：0.89 / 0.92 / 0.87 / 0.93。第五次（多數決＋Gemini）**正在主機背景跑**：10:27:55 UTC 開始，免費版限流 → 約 5 次呼叫／分 → 預計 ~13:00 UTC 完成。
  - 輸出：`/root/c162-final.out`（JSON），結束碼＋時間：`/root/c162-final.exit`，開始：`/root/c162-final.start`。
  - 若 `.exit` 非 0 或 `.out` 空／ok:false：多半是中途有人 sg-deploy 重啟容器 → 挑沒人部署的時段重跑（指令同上一輪，見 WORKLOG 2026-11-05 或 git log 1cf4e2274 訊息）。
- NA = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`。主機 `ssh -p 58122 ubuntu@145.239.195.47`；DB `sudo docker exec -i supabase-db psql -U postgres -At < file.sql`（SQL 用檔案傳，避免 `$$`/引號被 shell 吃掉）。

## 2. 待做
1. `sudo cat /root/c162-final.exit /root/c162-final.out` → 摘 n／agreed／rate／errors／firstError。存 `agency-os/reports/outreach/c16-2-claim-consistency-2026-11-05.json`。
2. rate ≥ 0.95 → `agency-os/handoffs/2026-10-31-outbound-os/data.mjs` C16.2 改 `done(…, <含報告的 commit 常數>)`；< 0.95 → 不改 done、照實回報（不調門檻）。
3. 清測試資料（一個交易）：`co_leads.notes='C16.2b REALTEST 2026-11-04'`（289 筆）的 co_sending_events、co_replies、co_messages、co_timeline_events、co_evidence、co_verified_emails（email like `peijingartstudio+c162b-%`）、co_leads；profile `c1620000-0000-4000-8000-000000000002`；co_lead_inbox（org `39ad4149-5044-4077-8d9a-b6b916de0e21`，created_at 2026-11-04 09:04:00–09:08:00 UTC，520 列）；該 org 的 co_search_cursors 全部（測試留下的游標，不清會讓日後同條件搜尋跳過已刪店家）。查 0 殘留。主信箱 daily_limit 已是 20（2026-11-05 讀回）。
4. data.mjs：NOW 列補「搜尋游標（同條件接著搜，b7598e8cc）」與「外聯 AI 改免費 Gemini（OpenAI 額度用完）」；`node build.mjs && node check.mjs`；發布監工台 https://claude.ai/artifact/DbH1HLUihZwAiBiJZGSD4t（同網址）。
5. WORKLOG 一則（worklog-insert-entry.py＋git-partial-worktree-commit.py stage）：C16.2 五次量測對照、多數決、Gemini 切換、OpenAI 額度事件（11-04 測試花 US$4.61 是主因）、清理、四行機械證據。

## 3. 給操作者
- 繁中、短、一次一件事。她付不起付費 AI（D25），OpenAI 不儲值。
- C16.4（寄 60 封到她 4 個信箱、她回約 10 封）等 C16.2 定案後才開始。
