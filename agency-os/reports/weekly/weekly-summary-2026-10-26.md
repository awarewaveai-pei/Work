# Weekly Summary 2026-10-26

> Period: 2026-10-20 → 2026-10-26 | Generated: 2026-10-26 01:10 UTC by remote-weekly-agent

---

## Completed this week

### Nginx / Infrastructure (2026-10-25~26)
- **7-door Cookie 400 修復上線**：app／social／tarot／studio／video／design／portal 全部入口補 `large_client_header_buffers 4 32k`；safe-infra-patch 套用，7-door public probe 全 307/200，Chrome 驗證通過（WORKLOG 2026-10-25 續83；2026-10-26 續9）
- **Postiz nginx `client_max_body_size 500m`**：addVideo 上傳 413 修復，YouTube 影片可上傳（WORKLOG 2026-10-26 續4）
- **GitHub Actions host liveness probe**：每 5 分 TCP+HTTPS origin 存活探針，失敗發 email（`host-liveness-probe.yml`，WORKLOG 2026-10-25 續84）

### 控制面 RLS 收窄 (2026-10-26)
- **0136 套 prod**：21 張控制面表成員只剩 SELECT；`current_clerk_org_id_from_jwt` 不再信 `user_metadata.org_id`（Codex 寫 + Claude 審，WORKLOG 2026-10-26 續7）
- **0137 套 prod**：`partner_referrals` 成員只剩 SELECT（WORKLOG 2026-10-26 續8）
- **next-admin 寫入路徑不退回 anon client**：`getSupabaseServerClient` fallback 移除，缺鍵回 503（WORKLOG 2026-10-26 續3）
- **成員寫入盤點完成**：22 張表全關（0134 organizations、0135 profiles、0136 × 21、0137 partner_referrals），只剩 sales_leads

### 全自動內容管線 P7（影片真發）(2026-10-26)
- **P7.0**：Postiz YouTube OAuth 從 AI-agent 類型換成網頁應用程式，redirect_uri 修復（WORKLOG 2026-10-26 續1）
- **P7**：AW YouTube 頻道真實發布「差點放棄的那一夜」（16x9，14.3MB；`https://youtube.com/watch?v=vAXUle_HI38`，WORKLOG 2026-10-26 續4）
- **P6 Soulful YouTube 發布**：生成 51 秒影片，發布到 Soulful Expression 頻道（`https://youtube.com/watch?v=HKMc7sTumvI`，費用 US$0.03，WORKLOG 2026-10-26 續6）
- **監工台 61 項 60 done**（剩 P4.4）

### 排程離開 Trigger 全完成 (2026-10-25)
- **C2.2–C2.5**：三個每日 cron 手動首跑，Trigger 完全不再有排程任務，`TaskSchedule` 0 列（WORKLOG 2026-10-25 續82）
- **C4.6⑦**：第一則每日排程報告送達 Slack #ops-incidents「共 44 個排程，4 個需要注意」
- **C8.1 host-liveness-probe** + **C5.3 report-host-schedules**（#1、#2 決策）
- **#4 備份狀態改主機判斷**：`phase4-checks.py --judge-backup-json` 判備份狀態，不再 commit BACKUP_AUTO_STATUS.json（WORKLOG 2026-10-25 續84）
- **監工台待決 0**，C2.5 `59ebd2e9f` 清除所有排程相關引用

### Social / 付款 / 授權 (2026-10-24~25)
- **0128 credit pack + wp-bridge 0.18.3**：點數包使用權無期末（WORKLOG 2026-10-26 續9）
- **ADR 017 4c seller**：4c-4 推送 `38a8198fb`；0133 `seller_sites` 套 prod（WORKLOG 2026-10-25 續68、70）
- **客戶模型監工台**：4b-9/4b-10 新增，Keygen CE 納入，Version 42 重發（WORKLOG 2026-10-25 續81）
- **Social C27/C28 drift 檢查**：正式機缺 8 個 META_* env var，已記錄，等操作者 go（WORKLOG 2026-10-25 續46）
- **Social accounts claim 端點部署**（next-admin `3dc138272`，WORKLOG 2026-10-26 續2）

### git 治理 (2026-10-26)
- **pre-commit mass-delete 守衛**：任何 commit 不得刪超過 HEAD 一半 tracked 檔（`scripts/githooks/pre-commit`；4 案測試；`bootstrap-mcp-machine.ps1:79-82` 新機自動設定）（WORKLOG 2026-10-26 續10）
- **空樹 commit 事故復原**：本地 `cbb63162f` 未推送，以 stash + mixed reset 取回，109 份已完成文件以 `483679655` 推送（WORKLOG 2026-10-26 續10、11）

### 其他 (2026-10-22~23)
- **Haiku 4.5 → 5.5**：next-admin `6406dcc28`，thinking 預設關 `2bede23d4`（2026-10-22）
- **塔羅 RWS 78 張雙審修正**；主角三鈕；動物自然每張牌動作；AI Models 頁（2026-10-23）
- **AO-CLOSE index scope 修正**：gate 只檢查本 session 要 commit 的內容（`tests/ao-close-index-scope.test.ps1` 11/11；2026-10-23）

---

## Open tasks

### A ⏰ 有外部時鐘
- `【≈2026-11-01】` 員工逐工具權限：看 7 天「本來會擋」紀錄，再決定要不要開始擋（程式 2026-10-25 03:00 上線；卡在操作者勾工具並等記錄）
- `【≈2026-11-06 觸發】` aware-wave.com DMARC 升級第三階段（p=quarantine → p=reject）

### B 🔒 卡在你
- Soulful 搬站收尾：網域轉 Cloudflare Registrar（無硬死線，付到 2028）
- Social 平台 V1：G5 Postiz 升級；正式機缺 8 個 META_* env var → `safe-infra-patch.sh compose`（High，等 go）
- Postiz Task 2 OAuth app 審核：Meta IG+FB / Reddit / LinkedIn
- ADR 017 待決 2：Postiz AGPL-3.0 律師確認（擋買斷第 5 步）
- ADR 017 待決 4：白牌憑證走 Cloudflare for SaaS 還是 on-demand ACME（擋第 9 步）
- `awmainwp` 帳號名外洩（320 次針對性嘗試），改名或加 2FA
- `SUPABASE_SERVICE_ROLE_KEY` 疑似印出（WORKLOG 2026-10-26 續6 疏失）→ 建議輪替

### C 🔒 卡在外部
- Cognitive OS P2 研究線：操作者定門檻後才能做 Project 工作流
- Cognitive OS P4：報告核准角色與來源搜尋規模 → 操作者決定
- Soulful AI 自動回覆：考試閘已上，剩部署→匯入→考試→操作者按「自動」

### D–G ▶️ 可直接做
- `【D 安全】` collection 事件不走 `upsertIncidentAtomic`（`lib/collect/report-store.ts:166`，2026-10-23 開）
- `【D 安全】` next-admin 快取 `video/[id] DELETE` 無引用檢查
- `【E 治理】` 主機 nginx `hci.aware-wave.com` 區塊漂移（覆蓋會讓 hci 站下線）
- `【F 產品】` 社群 V1 C23+；META_* env 等 go-ahead
- `【F 產品】` ADR 017 順序 1–7：第一個方案列、4b 對帳報表、4c-2 next-admin
- `【F 產品】` AUTOCONTENT-GAP：「搜集熱搜」與「提案題目」兩步未接排程（handoff `2026-10-26-autocontent-gap.md`；先申請 YouTube Data API key）
- `【F 產品】` 危機訊息 0104 上線後實測（真人接手中情境）
- `【G 基建】` MainWP E2E（next-admin DEPLOY_HOLD 解除後）
- `【G 基建】` Cognitive OS run lock 只增不刪
- `【H 已知風險】` `/api/video/regenerate-image` 502 根因未查（需操作者付費重現）
- `【H 已知風險】` Mockup Studio 功能異常（卡操作者給 F12 screenshot）
- `【H 已知風險】` Canvas 編輯器 Redo + 生成填色 + 群組等驗證債（卡操作者瀏覽器實測）

---

## System health

> Source: `reports/status/integrated-status-LATEST.md` (generated 2026-10-26 05:46) + WORKLOG

| 項目 | 狀態 |
|------|------|
| ks-aw-01 主機 | 健康；nginx 7-door Cookie 修復後所有入口 200/307 正常 |
| next-admin prod | `3dc138272`（2026-10-26 部署），healthy |
| Supabase DB | 22 張控制面表成員只剩 SELECT，0137 applied；寫入路徑 fallback 已移除 |
| 整體 health | 99.7%（319/320），唯一失敗為 AO-CLOSE archive 已完成 TASKS 引用問題，非服務失敗 |
| Trigger.dev | 排程完全移出；prod worker 20261025.3 正常；主機 cron 接手全部定時工作 |
| host liveness probe | GitHub Actions `host-liveness-probe.yml` 已啟用，TCP+HTTPS 每 5 分鐘 |
| 備份 | `company-soulful-expression` 3B/3C/3D PASS（2026-10-25 距上次 6 天），主機 `/var/lib/awarewave/backup-status/` 建立 |
| YouTube | AW + Soulful 各一支影片已公開發布，oembed 200 確認 |
| Social | 7 門 Cookie 修復，social.aware-wave.com 登入頁正常；8 個 META_* env 在正式機缺漏，自動回覆 OFF |
| git pre-commit | mass-delete 守衛上線（`scripts/githooks/pre-commit`），本機 core.hooksPath 設定 |

---

## Risks & blockers

| 等級 | 項目 | 說明 |
|------|------|------|
| 🔴 高 | `SUPABASE_SERVICE_ROLE_KEY` 疑似印出（2026-10-26 續6） | 建議操作者評估輪替 |
| 🔴 高 | 員工逐工具權限 11-01 截點 | 須操作者在 `/ops/staff` 勾工具；7 天紀錄後才能決定是否開始擋 |
| 🟠 中 | DMARC 第三階段 11-06 觸發 | 零未解釋失敗才改；rua 報表確認中 |
| 🟠 中 | Social 正式機缺 8 個 META_* env | C27/C28 自動回覆/廣告寫入前必補（High，等 go） |
| 🟠 中 | AUTOCONTENT-GAP：搜集熱搜未接排程 | 操作者需申請 YouTube Data API key；handoff 已備妥 |
| 🟡 低 | ADR 017 多個待決（律師、白牌憑證）| 擋買斷第 5、9 步 |
| 🟡 低 | collection 事件不走 `upsertIncidentAtomic` | 重複事件不重開、fingerprint 會互蓋 |
| 🟡 低 | Soulful domain 轉 CF Registrar | 無硬死線，操作者手動執行 |

---

## Memory highlights

- **排程架構徹底換軌**：Trigger.dev 不再有任何 cron；主機 `cron-run.sh` 接手全部定時工作；GitHub Actions 接手存活探針；備份狀態改主機本地判斷。
- **RLS 收窄完成**：22 張控制面表成員寫入全關，只剩 `sales_leads`；`current_clerk_org_id_from_jwt` 不再信任 client 傳入的 `user_metadata.org_id`。
- **全自動內容 P7 閉環**：pipeline 從素材→腳本→渲染→社群發布全程自動，首次真實發布到 YouTube（AW + Soulful 各一）。
- **員工逐工具權限（ADR 019）**：`STAFF_TOOLS_MODE=log`（只記錄），11-01 七天紀錄後決定是否改 `enforce`；提醒已建。
- **ADR 017 客戶怎麼來**：4c seller sites 進行中（0133 已套 prod）；4b 對帳報表已設計；買斷授權方向確定為 Keygen CE (FCL)。
- **git 治理**：pre-commit mass-delete 守衛已上線；共享檔案走私有 index 機制已穩定；AO-CLOSE index scope 修正確保不拉入其他 session 內容。
- **SUPABASE_SERVICE_ROLE_KEY 印出事件**（WORKLOG 2026-10-26 續6）：sed 遮罩太短造成；建議操作者評估是否輪替。
