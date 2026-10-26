# Claude 雲端排程監控與警報 Runbook / Claude Routine Watchdog & Alerts

> **一句話 / TL;DR**：4 個 Anthropic 雲端排程（每日/週報/月報/Phase4 健檢）會自動產生報告並 push 到 `awarewaveai-pei/Work`。本系統用**三層獨立警報**確保任何一個排程默默壞掉時你一定會知道——即使你沒開電腦。
>
> **Established**: 2026-06-06 （排程 source drift 事件後建立）
> **Pattern owner**: `runbooks/ADD-PERIODIC-HEALTH-CHECK.md`（本機檢查的通用模式）
> **相關記憶**: `feedback_operator_zero_memory_automation.md`（零負擔自動化原則）

---

## 1. 背景 / Why this exists

2026-06-06 發現：Phase4/週報/月報三個雲端排程的 `sources` 漂移到一個**已刪除的公開舊倉庫** `peijingartstudio-pei/Work`（而非正式私有倉庫 `awarewaveai-pei/Work`）。後果：報告默默停止更新數週，**沒有任何機制偵測到**。本 runbook 記錄修復 + 三層防止復發的警報系統。

---

## 2. 被監控的 4 個雲端排程 / The 4 routines

文件 SSOT：`agency-os/automation/claude-routines/*.md`。實際設定在 Anthropic cloud（`https://claude.ai/code/routines`）。

| 排程 / Routine | Trigger ID | cron (UTC) | 產出報告 / Output | 正確來源倉庫 |
|---|---|---|---|---|
| DailyBriefing | `trig_01XoSCqJQu6DDKVJw6Lvobpd` | `0 0 * * *` | `agency-os/memory/daily/YYYY-MM-DD.md` | awarewaveai-pei/Work |
| WeeklyReview | `trig_01WanBfvAZvx5TR8xAXjxKVp` | `0 1 * * 1` | `agency-os/reports/weekly/weekly-automation-LATEST.md` | awarewaveai-pei/Work |
| MonthlyReview | `trig_01GWG3NQSPm7SbRdJAN25QdM` | `0 1 1 * *` | `agency-os/reports/monthly/monthly-review-LATEST.md` | awarewaveai-pei/Work |
| Phase4Weekly | `trig_01JyFw78ZkgwQzpyXXaX1F2K` | `0 6 * * 5` | `agency-os/reports/repair-center/phase4-LATEST.md` | awarewaveai-pei/Work |

> ⚠️ **每個 routine 的 `session_context.sources` 必須是 `https://github.com/awarewaveai-pei/Work`。** 漂移到別的倉庫 = 報告 push 到錯地方 = 本系統會告警。

---

## 3. 三層警報架構 / The 3 alert legs

設計原則：**任一層壞掉或你沒開機，另外兩層仍會通知**。

| 層 / Leg | 何時觸發 | 在哪 | 檔案 |
|---|---|---|---|
| **① 開工 AO-RESUME** | 你開機開工時 | 本機 | `scripts/check-routine-freshness.ps1` → `agency-os/reports/status/routine-freshness-LATEST.md` |
| **② 收工健檢 §11** | AO-CLOSE health gate | 本機 | `scripts/system-health-check.ps1` §11 |
| **③ Telegram／Slack（always-on）** | 每天 07:17 UTC，狀態變化時推播 | **ks-aw-01（永遠在線）** | `scripts/routine-output-watchdog.sh` + 主機 cron |

### Layer ③ 細節（ks-aw-01 always-on）
- **Host**: `ks-aw-01`（SSH `ubuntu@145.239.195.47 -p 58122`）；透過 `/root/lobster-phase1/scripts/notify.sh` 讀主機設定並通知 Telegram／Slack。
- **腳本**: `/root/Work/scripts/routine-output-watchdog.sh`（在 repo，git pull 自動部署）。
- **cron**: 正本 `lobster-factory/infra/hetzner-phase1-core/scripts/cron.d/awarewave-schedules` 的 `routine_watchdog` 行；經 `cron-run.sh` 記錄結果，以 `LC_ALL=C.UTF-8 bash /root/Work/scripts/routine-output-watchdog.sh` 執行。Git 權限是 0644，不能依賴主機手動 chmod。
- **偵測**: `git log -1 --format=%ct origin/main -- <報告路徑>` 讀報告最後更新日（純讀、不動 working tree）。逾期門檻：Phase4=8d、週報=9d、月報=35d。
- **去重**: state 檔 `/root/.routine-watchdog-state`，只在「狀態變化」（壞掉 or 恢復）時推播，不每天洗版。送出 HTTP 200 才前進 state（失敗下次重試）。

---

## 4. ⚠️ 編碼陷阱（重要，動 watchdog 前必讀）/ The CJK encoding trap

**Telegram 訊息是中英雙語。** SG 的非互動 cron/ssh bash 在做字串操作（參數展開、echo）時會**破壞多位元組 UTF-8**（中文變亂碼，英文沒事）。`LC_ALL` 在腳本內 export 太晚（lexer 啟動時已鎖定）。

**解法（已實作，勿改回 bash 字串）**：
1. 雙語模板以 **base64 嵌在腳本**（原始碼純 ASCII，整條 Windows→git→SG 鏈無法搞爛）。
2. Runtime `base64 -d` 解到**檔案**；動態的「受影響清單」用 **`LC_ALL=C awk` byte 模式** 插入（純 ASCII，CJK 行原樣複製不解碼）。
3. `curl --data-urlencode "text@檔案"` 直接讀檔案送 → bash 全程不碰中文字串 → 位元組原封不動到 Telegram。

> **驗證陷阱**：透過 `ssh → PowerShell → base64 decode` 顯示中文會 **誤顯示成亂碼**（PowerShell 顯示路徑問題，非真實資料）。**正確驗證法**：在 SG 上 `... | python3 -c "import sys;sys.stdin.buffer.read().decode('utf-8');print('OK')"` 或 `od -An -tx1`（e2 9a a0=⚠️、e6 8e 92=排）。實際 Telegram 才是真相。

**改模板步驟**：把新文字寫成 UTF-8 檔 → `base64 -w0` → 換掉腳本裡 `WARN_B64=` / `REC_B64=` → 部署 → SG 上 python 驗 UTF-8 → 真送一封確認手機顯示。

---

## 5. 常見故障排除 / Troubleshooting

| 症狀 | 原因 | 處置 |
|---|---|---|
| 某報告 LATEST 沒更新 / Telegram 告警「report MISSING/stale」 | routine source 漂移 / 被 disable / GitHub 授權失效 / 崩潰 | `claude.ai/code/routines` 確認該 routine 啟用 + source = awarewaveai-pei/Work |
| `RemoteTrigger run` 回 `github_repo_access_denied` | 手動觸發路徑的 GitHub 授權失效（**排程路徑不受影響**，DailyBriefing 排程持續成功為證）| 到 `claude.ai/code/routines` re-authorize GitHub（可選；排程照跑）|
| Telegram 只有英文、中文亂碼 | bash 碰了 CJK 字串（違反 §4）| 確認用檔案式送信（base64→檔案→`text@檔案`），勿用 bash 變數帶中文 |
| watchdog 每天洗版 | state 檔邏輯壞 / 被刪 | 檢查 `/root/.routine-watchdog-state`；正常只在狀態變化時送 |
| watchdog 沒送但報告確實舊 | cron 沒跑 / git fetch 失敗 / 缺 Telegram creds | `cat /var/log/routine-watchdog.log`；`grep watchdog /etc/cron.d/awarewave-schedules`（2026-10-24 起 root crontab 已併入此檔；`/ops/schedules` 也顯示上次結果）；確認 `/root/lobster-phase1/.env` 有 token |

**exit 126**：先查 `/var/log/routine-watchdog.log` 的 Permission denied 與腳本權限。直接執行 0644 腳本會失敗；應使用上列 bash 呼叫。安裝器的 `--check` 與實際安裝都會拒絕無執行權限的直接呼叫。正式套用需先批准，再走 `install-host-schedules.sh` 的備份／安裝／rollback 流程。

**手動測試（ks-aw-01，需具備既有主機權限）**：

2026-10-26：主機紀錄確認直接呼叫 watchdog 遇到 Permission denied／exit 126；本次 bash 修正尚未套用正式機。安裝前檢查涵蓋現有 `[VAR=value ...] [bash|sh|python3] /absolute/path` 寫法，不解析任意 shell 命令；主機套用後仍須實跑並核對 `/var/lib/awarewave/jobs/routine_watchdog.json`。

```bash
LC_ALL=C.UTF-8 bash /root/Work/scripts/routine-output-watchdog.sh --dry-run
```

---

## 6. 新增/移除被監控的 routine / Add or remove a routine

三處要同步（SSOT 鏡像，否則漂移）：
1. `scripts/routine-output-watchdog.sh` — `keys` / `rpath` / `maxage` / `rname` 陣列（Layer ③）
2. `scripts/check-routine-freshness.ps1` — `$routines` 陣列（Layer ①）
3. `scripts/system-health-check.ps1` §11 — `$routineOutputs` 陣列（Layer ②）

新增 routine 本身：用 `/schedule`（schedule skill）或 `claude.ai/code/routines`；**source 務必設 awarewaveai-pei/Work**。

---

## 7. Rollback

- **Layer ③**：移除 cron（刪 repo `lobster-factory/infra/hetzner-phase1-core/scripts/cron.d/awarewave-schedules` 的 watchdog 行 → 主機跑 `install-host-schedules.sh`）+ `rm /root/.routine-watchdog-state`。腳本在 repo，`git revert` 對應 commit。
- **Layer ① / ②**：`git revert` `check-routine-freshness.ps1` / `system-health-check.ps1` §11 的 commit；移除 ao-resume.ps1 的 routine-freshness 區塊。
- **routine source 改錯**：每次改前已 `RemoteTrigger get` 存原 config；`RemoteTrigger update` 回原值即復原。

---

## 8. 永逸缺口 / Known gap

目前**沒有機制比對「雲端 routine 實際 sources == 文件 SSOT」**。Layer ③ 偵測的是「報告有沒有更新」（症狀），不是「source 設定對不對」（根因）。要補根因檢查需 `RemoteTrigger list`（僅 Claude session 內可用，無法落地本機 cron）。建議：AO-RESUME 時 Claude 偶爾 `RemoteTrigger list` 驗所有 routine 的 source。

---

## Related
- `runbooks/ADD-PERIODIC-HEALTH-CHECK.md` — 本機 AO-RESUME 檢查的通用模式
- `agency-os/automation/claude-routines/*.md` — 各 routine 的 prompt/cron SSOT
- `agency-os/WORKLOG.md` 2026-06-06 — 修復事件根因 + 四動作驗證
- `.claude/projects/d--Work/memory/feedback_operator_zero_memory_automation.md` — 零負擔自動化設計原則
