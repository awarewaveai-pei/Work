# 排程離開 Trigger：待決 1–5 與 C7 的決定

Mode: 直接決策（操作者 2026-10-25「你決定」全權委派），非 /decide 面板
Scope: `agency-os/handoffs/2026-10-25-schedules-off-trigger/`（R0-PLAN §6、監工台 data.mjs）
不變量（R0-PLAN §1）：①時鐘不與工人共用資源；②我們設定的每個時鐘在 `/ops/schedules` 一列，太久沒成功就推播；③安靜可區分「正常」與「告警壞了」。

| # | 問題 | 決定 | 理由（file:line／實測） | 回頭條件 |
|---|---|---|---|---|
| 1 | C5.3 GitHub 定時檢查要不要 token | **不要**：公開 API | repo 公開（`project_work_repo_public`）；`api.github.com/repos/awarewaveai-pei/Work` 未帶 token 200、`X-RateLimit-Remaining: 58`；排程 workflow 2 個 × 每 10 分 = 12 次／時 < 60 | repo 改私有，或排程 workflow > 4 個 |
| 2 | C8.1 主機外看守用什麼 | **GitHub Actions** `host-liveness-probe.yml` 每 5 分：TCP 58122＋直連 origin HTTPS（`--resolve`）；失敗＝GitHub 失敗信 | Cloudflare BFM 擋資料中心 IP（`lobster-factory/infra/netdata/README.md:46-48`），經 Cloudflare 永遠 403；origin 對非 CF 回 nginx 403＝主機與 nginx 在（實測 `origin443 403`，死位址 `000`）；不需新帳號、新密碼；網站掛而主機在＝主機 endpoint-alert 的事 | GitHub 排程延遲常 > 15 分，或需要電話等級告警 |
| 3 | C8.2 第二台主機 | **不加**（此時） | 主機掛的偵測＝#2；資料：每日備份＋R2 異地（`/ops/schedules` 備份群組，`backup_offsite_*`、`stack_backup`）；重建程序已有 `runbooks/KS-AW-01-HOST-SWITCH-RUNBOOK.md`、`runbooks/HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md`。第二台＝每個有狀態服務（Supabase、MainWP、Trigger、ClickHouse）都要複寫與切換，複雜度與故障面加倍。RPO ≤ 1 天（每日備份），RTO＝依搬機 runbook 重建 | 客戶合約要求 RTO < 1 天；或一年內主機整台不可用 ≥ 2 次；或還原演練實測 RTO 超過 1 天 |
| 4 | 網站備份狀態同步（主機推不上 GitHub） | **狀態留在主機、在主機判斷**：`sync-backup-status-from-mainwp.sh` 寫 `/var/lib/awarewave/backup-status/<slug>.json`，用 `phase4-checks.py --judge-backup-json`（3B–3D 同一份實作）判斷，警告 exit 1＝列紅＋推播；不再 commit；repo JSON 只留靜態設定；雲端週檢 3B–3D 改為「主機判斷」 | 腳本原前提「有 push 權的 checkout」（舊檔頭 :9-10）在 ks-aw-01 不成立（`work_deploy` 唯讀，續64）；給寫入權＝主機被入侵可直改公開 repo main；筆電拉回＝筆電依賴；app API＝新增對外面。判斷與資料同處＝不變量②的同一條路 | 雲端週檢需要逐筆備份歷史 |
| 5 | C6.2 狀態報告搬主機的做法 | **不搬**：C6 結案於 C6.1 清點 | 不變量②已由主機涵蓋：主機事故＝排程列（C4/C5）＋endpoint-alert＋Netdata Cloud（已 claim，email，續61）；筆電 11 支腳本是 AO-RESUME 的摘要視圖，4300 行搬過去＝重寫同一判斷第二份（零重工）；其中 Cloudflare／CI 兩支需筆電 vault 金鑰，搬了反而要把金鑰放上主機 | 出現「只有筆電報告看得到、主機排程與 Netdata 都看不到」的事故 |
| C7 | 7 把內部 API token 合一 | **不做**：卡片刪除 | 7 把同在 `/root/lobster-phase1/.env`、同一呼叫者（主機 cron）；合一不修任何故障，只省輪替次數，卻要動 7 個 auth route＋compose＋正式密碼（High）。分開的現況無害 | 需要定期輪替內部 token，或新增第 8 個同類呼叫者時順手合一 |
