# Runbook: Trigger.dev 正式環境 run 全部卡在 queued

## 症狀
- `/ops/schedules`「Trigger 名額檢查」（`trigger_slots_check`，`hetzner-phase1-core/scripts/check-trigger-slots.sh`，每 10 分）變紅並推播；輸出在主機 `/var/log/trigger-slots.log`（`STUCK (<env>): <run> <task> <status>`）。
- 或按鈕啟動的 Trigger 工作（建站、塔羅批次、研究抓取）一直排隊。2026-10-25 起 Trigger 已無定時工作，所有時鐘在主機 cron。
- Trigger MCP `list_runs`（prod，`proj_6c4f24492a705729fc2c`）：新 run 全是 `queued`，近 24h 0 個 `completed`。
- 容器全 healthy；webapp log 只有 `POST /engine/v1/worker-actions/dequeue 200 ... 10000 ms`（長輪詢空手而回）。重啟容器**無效**（名額記在 Redis）。

## 根因（2026-10-25 首例）
環境並發上限 = `concurrency`(5) × `concurrencyBurstFactor`(2) = 10。Redis set `…:env:<env>:currentConcurrency` 被 10 個**不在跑**的 run 占滿（DB `TaskRun.status`=PENDING／DEQUEUED，snapshot `QUEUED`／`PENDING_EXECUTING`）→ engine 不再出隊。名額漏掉後不會自己回收（6–8 月就漏了 4 格沒人發現）。

## 診斷（唯讀）
```bash
ssh -p 58122 -i ~/.ssh/id_ed25519 ubuntu@145.239.195.47
R="sudo docker exec trigger-redis redis-cli"
K=$($R --scan --pattern 'engine:runqueue:*:env:*:currentConcurrency' | grep -v ':queue:' | head -1 | sed 's/:currentConcurrency$//')
$R scard "$K:currentConcurrency"; $R get "$K:concurrency"; $R get "$K:concurrencyBurstFactor"
$R smembers "$K:currentConcurrency"   # 拿這些 id 去 trigger-postgres 查 TaskRun.status
```
`scard` = 上限且成員在 DB 不是 EXECUTING → 本症。

## 修正
透過 engine 取消（會正確釋放名額；**不要**直接 `SREM` Redis）。外網 API 被 Cloudflare 擋（error 1010），所以在主機打本機 `127.0.0.1:8030`：
1. 匯出要取消的 run：trigger-postgres `select "friendlyId" from "TaskRun" where status in ('PENDING','DEQUEUED') and "createdAt" < now();`
   積壓的都是排程巡檢，下次排程會重做；取消而非補跑，避免幾個月前的舊 run 被執行。
2. 每個 id：`curl -X POST -H "Authorization: Bearer <tr_prod_ token>" http://127.0.0.1:8030/api/v2/runs/<friendlyId>/cancel`（token = `TRIGGER_ACCESS_TOKEN`，從本機 stdin 傳入、寫 600 暫存 header 檔，不放命令列）。先取消 1 個確認 `scard` 減 1，再批次（`xargs -P 8`；1461 個約 2 分鐘）。
3. 驗：`scard` 歸 0；`list_runs` 出現 `completed`；`powershell -File scripts/check-site-watch-health.ps1` 四探針 PASS。

## 歷史
- 2026-10-25：首例，WORKLOG 2026-10-25 同日條目（停擺 2026-10-23 18:05 → 2026-10-25 04:47 UTC，取消 1462 個）。
