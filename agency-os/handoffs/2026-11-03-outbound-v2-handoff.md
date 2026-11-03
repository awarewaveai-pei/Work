---
slug: outbound-v2-handoff
created_utc: 2026-11-03T01:30:00Z
hint: "外聯 v2 交接給另一個 Claude 帳號；取代 2026-11-02-1424-outbound-v2-handoff.md"
---

**續接語**：「續做外聯系統 v2：讀 $WORK_ROOT/agency-os/handoffs/2026-11-03-outbound-v2-handoff.md，先做 §1（重生並發布監工台給操作者），再從 §4 第一個可做項開始；完成 = data.mjs 的 todo 全部 done。建議模型：Opus 5.5」

## 1. 第一件事：重生並發布監工台（操作者要看）
監工台網址 https://claude.ai/artifact/DbH1HLUihZwAiBiJZGSD4t（操作者帳號；2026-11-03 v26）。**不發新網址**；DzhhxdrEmZmMdBppq7EsE3 停用。
1. `cd $WORK_ROOT/agency-os/handoffs/2026-10-31-outbound-os && node build.mjs && node check.mjs`（check 必須印 `ok: 17 cards, 77 items ... (63 done) ... page fresh`）。
2. Artifact `action:"read"` 讀上面網址一次 → publish `file_path=<上面目錄>/supervisor.html`＋`url=<上面網址>`。
3. 之後每次改 `data.mjs`：`node build.mjs && node check.mjs` → 同 2。check 紅 = 先修資料（done 項要 commit 常數；卡全 done 時卡 status 要 `done` 並帶 `commit:`）。

## 2. 現況（2026-11-03）
- 正式站 next-admin = `a16e069b3`（11-03；之前 12f2de50e）（`/root/lobster-phase1/.deployed-commit`）；migration 0152–0155 已套。
- 寄信：**不買次網域（D26）**。awarewaveai@gmail.com 歸 org `awarewave-ops`（39ad4149-…），`send_mode=draft`、`auto_draft=true`、`daily_limit=20`。管線每 10 分：研究→產信→（人在佇列頁核准）→建 Gmail 草稿→到期追蹤草稿；人按寄出。永不自動寄（I10；`send-adapter.ts` 只讀 `send_mode=auto`）。
- 驗證（D25 修訂）：`self_published:` 且 MX 列（provider=mx_syntax）非 invalid → 免驗；其餘用免費額度 Reoon→ZeroBounce→Hunter（`mailbox-verify.ts verifyWithFallback`）。Hunter、Reoon 金鑰已裝（`scripts/outreach-verifier-keys.ps1`，user-env → 代理商 connector＋vault）；ZeroBounce 未申請。
- 產信改背景跑（202＋輪詢，`823a43307`），不再 524。
- 每張卡證據：`agency-os/WORKLOG.md` 2026-11-02 續11–48、2026-11-03 續1–3（grep `外聯`）。

## 3. 規則與合約
- SPEC：`agency-os/docs/Outbound_OS_Engineering_Spec/Outbound_OS_Engineering_Spec.md`（I1–I10、D1–D26）；卡細節：`agency-os/handoffs/2026-10-31-outbound-os/R0-PLAN.md` §6。
- 監工台唯一資料源：`data.mjs`（`todo(...)`／`done(..., <commit 常數>)`）。

## 4. 剩下 11 項（data.mjs `todo`；C13.4、C7.3 7d4f98f44、C12.3 a16e069b3 已完成）
| 項 | 誰 | 怎麼做 |
|---|---|---|
| C5.5 | 等第一封真信寄出 | 首封 sent 後，到期追蹤由管線建草稿 → 查 Gmail 該草稿 threadId = 首封 thread |
| C14.3 | 操作者 | Meta App `leads_retrieval`＋頁面訂閱 leadgen（頁面訂閱可用 user-env 的 `META_PAGE_TOKEN_*` 代做，先問） |
| C11.1／C11.4／C8.5／C15.4 | 延後（D26） | 買次網域＋Workspace 才做；C15.4 另需 sampled profile（同服務人工核准滿 50 封） |
| C6.4 | 停放 | 操作者 11-02：aware-wave.com bridge 不接回 app |
| C9.1／C9.2 | 等資料 | 100 個名單走過研究後 |
| C16.2／C16.4 | 等資料 | 寄滿 200 封／2 週 |
- 操作者待辦（提醒一次）：Gmail 草稿匣刪測試草稿「WuSheng 療癒模組與線上體驗的交流」（收件 peijingartstudio）。

## 5. 做事方式（已驗證可用）
- 真測要登入身分：Claude in Chrome 開 `https://app.aware-wave.com/tools/outreach`，`javascript_tool` 以 `fetch('/api/outreach/...')` 呼叫（操作者 session）；不要在本機複製正式金鑰。
- 手動跑一輪同步／管線：`ssh -p 58122 ubuntu@145.239.195.47`，`sudo` 讀 `/root/lobster-phase1/.env` 的 `OUTREACH_SYNC_TOKEN`（`sed -n s/^OUTREACH_SYNC_TOKEN=//p | tail -1`）→ `curl -X POST -H "Authorization: Bearer …" http://127.0.0.1:3002/api/internal/outreach/gmail-sync`；回應含 `pipeline`／`send`。
- DB 讀寫：`ssh … "sudo docker exec supabase-db psql -U postgres -At -c …"`；migration 只用 `node scripts/apply-db-migration.mjs <n>`（首行 `# CONFIRMED-HIGH-RISK:`），DDL 後 `notify pgrst, 'reload schema'`。
- 測試名單：manual 建立是 `status=new`，管線只吃 `qualified`；個資告知需 `self_published:`（操作者自己信箱可設 `self_published:operator-provided-test-<日期>`）；測完先刪 `co_sending_events` 再刪 lead，查 0 殘留。
- 部署：本機 `npm test`（`tools/seedstar` 2 個失敗＝他 session 未追蹤檔，非本線）→ `/check-drift` → `ssh … 'sudo /root/lobster-phase1/scripts/sg-deploy.sh next-admin'`；需要就馬上部署。
- 審查：Claude 寫 → `scripts/codex-oracle.ps1 -Mode review -Path …`（>2 檔）；artifact 進 `agency-os/reports/oracle/`。
- Commit：WORKLOG 只經 `scripts/worklog-insert-entry.py` + `scripts/git-partial-worktree-commit.py stage`；其他檔 pathspec；commit 前 `scripts/verify-clear.ps1` 單獨跑；private-index commit 與 push 分開。
- 金鑰：user-env 在 `$WORK_ROOT/mcp/user-env.ps1`；`C:\Users\user1115\AWARE_WAVE_CREDENTIALS.md` 不准刪、不印內容（只驗長度／格式）。

## 6. 地雷
- Hook「another session is editing <video-workbench…>」多為誤報（他 session 同時寫）；commit 前 `git diff --cached --stat` 確認只有自己的檔。
- Python 字串寫 `\b` 會變退格字元（WORKLOG 曾中招）→ 用 raw string。
- `co_verified_emails` 一 org+email 一列（upsert）；免驗只認 MX 列，任何驗證商舊結果都要重驗。
- 不要重提 SPEC 已否決：canvas、n8n、開信追蹤、抓 IG／FB／LinkedIn、買名單、對個人消費者寄冷信、自架 SMTP 探測。
- 給操作者：繁中、短、一次一件事；不跟她要金鑰；付費服務她不付（D25）。
