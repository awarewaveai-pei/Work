---
slug: outbound-c16-2-handoff
created_utc: 2026-11-05T11:05:00Z
hint: "C16.2 fifth consistency measure running on host; finish = read result, clean test data, supervisor, WORKLOG"
---

**續接語**：「續做外聯 C16.2：讀 agency-os/handoffs/2026-11-05-outbound-c16-2-handoff.md，從 §0 第 1 步開始；完成 = 結果判定＋測試資料 0 殘留＋監工台與 WORKLOG 更新。建議模型：Opus 5.5」

## 0. 2026-11-06 更新（先讀這段；§1–§2 是 11-05 的舊狀態）
- 11-05 那次 200 封全部 `errors=40`、`firstError="The operation was aborted due to timeout"`＝無效（`agency-os/reports/outreach/c16-2-claim-consistency-2026-11-05.json`）。根因：免費 Gemini 每天每模型 500 次上限，用完後重試空等到 120 s 逾時。修正 b29c0aa31（已部署）：當天上限用完立刻回 `gemini_429_daily_quota`；route 加 `until` 固定樣本。
- 重量：主機 `/root/c162-daily.sh`，`/etc/cron.d/c162` 每天 08:30 UTC 跑 4 批（約 360 次呼叫，留額度給管線），`until=2026-11-04T23:59:59Z`。有錯的批隔天重跑，第 3 次照收。10 批收齊寫 `/root/c162/DONE` 並自刪 cron。預計 11-08 收齊。進度 `sudo cat /root/c162/log`。舊結果在 `/root/c162/old-2026-11-05/`。
- 已清：co_lead_inbox 520 列、co_search_cursors 17 列（0 殘留）。**未清**：289 筆名單與其信件、證據、profile（量測就是用這些信，量完才清）。
- 監工台已更新（C16.2 說明、Gemini、搜尋游標）。WORKLOG 已寫。

**剩下步驟**：
1. `sudo cat /root/c162/log /root/c162/DONE` → DONE 在就加總 10 批（rate = Σagreed／Σn），覆寫 `c16-2-claim-consistency-2026-11-08.json`（新檔）。
2. 照 §2 第 2 步判定；第 3 步只剩名單那部分（inbox／游標已清）。
3. data.mjs C16.2 改文字或 done；build／check／發布；WORKLOG 一則。

## 1. 現況（2026-11-05 11:00 UTC）
- 正式站 next-admin = 31e89c479（含外聯 1cf4e2274 以前全部）。外聯 AI：研究／事實核對／回信分類 = 免費 Gemini `gemini-3.5-flash-lite`（`NA/lib/outreach/ai-gemini.ts OUTREACH_JSON_MODEL`），OpenAI 平台帳戶額度用完（操作者選 Gemini，不儲值）；產信 AI 失敗會往下一階（81a1b43a0）。
- 事實核對 = 多數決 `checkClaimsVoted`（`NA/lib/outreach/claim-check.ts`），temperature 0。一致率工具量的就是它。
- 前四次量測（單次對單次，OpenAI）：0.89 / 0.92 / 0.87 / 0.93。第五次（多數決＋Gemini）一次跑 200 封的請求兩度被別的 session 部署打斷（exit 52）→ 改分批：route 收 `offset`（df77e2210），主機 `/root/c162-batches.sh` 11:20:43 UTC 開跑，10 批 × 20 封，每批結果 `/root/c162/batch-<offset>.json`，被打斷的批自動重試（最多 6 次，間隔 2 分），進度 `/root/c162/log`，全部完成寫 `/root/c162/DONE`。預計 2.5 小時以上（免費版約 5 次呼叫／分）。
  - 加總：各批 n、agreed、errors 相加，rate = Σagreed／Σn；disagreements 合併。
  - 若 DONE 已在但某批檔缺：看 log，對該 offset 單獨重跑（同指令，limit 20）。
- NA = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`。主機 `ssh -p 58122 ubuntu@145.239.195.47`；DB `sudo docker exec -i supabase-db psql -U postgres -At < file.sql`（SQL 用檔案傳，避免 `$$`/引號被 shell 吃掉）。

## 2. 待做
1. `sudo cat /root/c162/log /root/c162/DONE` → 10 批加總 n／agreed／rate／errors（firstError 取任一批）。存 `agency-os/reports/outreach/c16-2-claim-consistency-2026-11-05.json`。
2. rate ≥ 0.95 → `agency-os/handoffs/2026-10-31-outbound-os/data.mjs` C16.2 改 `done(…, <含報告的 commit 常數>)`；< 0.95 → 不改 done、照實回報（不調門檻）。
3. 清測試資料（一個交易）：`co_leads.notes='C16.2b REALTEST 2026-11-04'`（289 筆）的 co_sending_events、co_replies、co_messages、co_timeline_events、co_evidence、co_verified_emails（email like `peijingartstudio+c162b-%`）、co_leads；profile `c1620000-0000-4000-8000-000000000002`；co_lead_inbox（org `39ad4149-5044-4077-8d9a-b6b916de0e21`，created_at 2026-11-04 09:04:00–09:08:00 UTC，520 列）；該 org 的 co_search_cursors 全部（測試留下的游標，不清會讓日後同條件搜尋跳過已刪店家）。查 0 殘留。主信箱 daily_limit 已是 20（2026-11-05 讀回）。
4. data.mjs：NOW 列補「搜尋游標（同條件接著搜，b7598e8cc）」與「外聯 AI 改免費 Gemini（OpenAI 額度用完）」；`node build.mjs && node check.mjs`；發布監工台 https://claude.ai/artifact/DbH1HLUihZwAiBiJZGSD4t（同網址）。
5. WORKLOG 一則（worklog-insert-entry.py＋git-partial-worktree-commit.py stage）：C16.2 五次量測對照、多數決、Gemini 切換、OpenAI 額度事件（11-04 測試花 US$4.61 是主因）、清理、四行機械證據。

## 3. 給操作者
- 繁中、短、一次一件事。她付不起付費 AI（D25），OpenAI 不儲值。
- C16.4（寄 60 封到她 4 個信箱、她回約 10 封）等 C16.2 定案後才開始。
