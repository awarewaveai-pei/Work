# AO-RESUME 小白地圖 + 名詞詞典（看懂報告 → 學成專家）

> **用途**：AO-RESUME 報告（§0–§8）裡的術語、機器、縮寫，在這裡一次查清楚。
> 報告本身用「雙層敘述」——保留專業術語 + 附白話；想深入就來這查全名與出處。
> **這份是靜態參考**：只在系統架構變動時更新，不是每天讀。報告 §0 末尾的 `📖` 連結指到這裡。
>
> 維護：架構/服務/術語有變 → 同 PR 更新本檔（R4 聲稱即驗證）。

---

## 1. 系統地圖：哪台機器跑什麼

> 「機器邊界不可混用」是鐵律——SG 與 EU 各司其職，CLAUDE.md / AGENTS.md §伺服器邊界 為 SSOT。

| 代號 | 是什麼 | 位置 / IP | 跑什麼（主要） |
|------|--------|-----------|----------------|
| **SG** | Singapore VPS（新加坡主機）| `5.223.93.113` | next-admin（Ops Dashboard）、Repair Center、endpoint-alert 告警器、sg-deploy 部署目標 |
| **EU** | Europe VPS（歐洲主機）| `204.168.175.41` | MainWP（客戶站管理）、n8n（自動化）、Trigger.dev（工作流）、Supabase、Uptime Kuma（公網監控）|
| **app.aware-wave.com** | 企業佈建 App（一鍵架站）| 跑在 SG next-admin | onboarding 表單 → 建站引擎；5 階段藍圖見 `APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md` |
| **客戶站** | 客戶的 WordPress 網站 | 各自主機（如 Hostinger）| 經 MainWP 集中管理備份/更新；目前試點 Soulful Expression |
| **lobster-factory（龍蝦工廠）** | 接案/佈建的程式碼工廠 | repo 目錄 | clients / infra / packages / workflows |

**版本鎖定**：ClickHouse（一種列式資料庫，column-oriented DB，用於分析）鎖 `25.7.x`，**禁升** latest / 24.x。

---

## 2. 名詞詞典（英文全名 + 中文 + 作用）

### 安全 / 防護
| 縮寫 | 全名 | 中文 + 作用 |
|------|------|-------------|
| **LLAR** | Limit Login Attempts Reloaded | WordPress 外掛，限制登入嘗試次數（server-side 防爆破）。**取代 CF WAF 擋 wp-login**，因為使用者全球旅行，CF 地理規則會把她自己鎖在外。|
| **CF / Cloudflare** | Cloudflare | CDN + 防火牆服務。`rules=0` by-design = 故意清空 WAF 規則（改用 LLAR）。`bot=ON` = Bot 防護開著。|
| **WAF** | Web Application Firewall | 網站應用防火牆，過濾惡意請求（如 scanner 掃 `/.env`）。|
| **fail2ban** | — | 偵測異常登入/請求 → 自動封 IP 的伺服器工具。|
| **xmlrpc** | XML-RPC | WordPress 舊遠端介面，常被攻擊，通常關閉。|

### 監控 / 可觀測性（Observability）
| 名稱 | 全名 | 作用 |
|------|------|------|
| **Sentry** | — | 程式錯誤追蹤（error tracking）；程式爆例外會在這報。|
| **Uptime Kuma** | — | 公網可達性監控（網站還活著嗎）。|
| **Netdata** | — | 主機資源即時監控（CPU/RAM/磁碟）。|
| **Grafana / Loki** | — | 儀表板（Grafana）+ 日誌彙整（Loki）。|
| **PostHog** | — | 產品分析（funnel / 轉換率 / feature flag）。|
| **smoke test** | 冒煙測試 | 最基本「還能跑嗎」檢查（n8n / repair / 客戶站健康）。|

### 自動化 / 部署
| 名稱 | 全名 | 作用 |
|------|------|------|
| **n8n** | — | 自架的工作流自動化（visual workflow automation），跑在 EU。|
| **Trigger.dev** | — | 程式碼定義的背景工作流引擎。`tr_pat_*`=CLI 部署用；`tr_prod_*`=runtime 用，**不可互換**。|
| **MainWP** | — | 集中管理多個 WordPress 站的 Dashboard（備份/更新），跑在 EU。|
| **WPvivid** | — | WordPress 備份外掛，配合 MainWP。|
| **Supabase** | — | 開源 Firebase 替代品（Postgres + Auth + Storage + Edge Functions）。|
| **sg-deploy** | — | SG 部署腳本，內建 test gate → healthcheck → smoke → 失敗自動 rollback。**勿直接 git pull 部署**。|
| **drift** | 漂移 | repo 與線上實機不一致（部署落後）。`/check-drift` 檢查。|

### AO 生命週期（AwareWave Ops）
| 名稱 | 作用 |
|------|------|
| **AO-RESUME** | 開工：讀狀態檔 → 輸出 AO-RESUME 報告（§0–§8，本檔服務的對象）。|
| **AO-CLOSE** | 收工：寫 WORKLOG/memory → 跑 health gate（要求 100%）。|
| **health gate** | 健康閘：system-health-check 的分數門檻，未達標 AO-CLOSE 會擋。|
| **gap window** | 上次收工 → 這次開工之間的時間區間（用來抓未處理的外部信號）。|
| **handoff packet** | 跨 session 交接包，放 `agency-os/handoffs/`，AO-RESUME §8 會 inline。|
| **WORKLOG** | 工作日誌，記根因/步驟/驗證，是「30 秒故障手冊」。|
| **VBC** | Verify Before Conclude（先查證再下結論）——說「X 壞了/缺了」前先查是否有替代方案接手。|
| **REALTEST_EVIDENCE** | 真實測試證據行（R0 四動作之一），證明改動真的 invoke 過。|

### 報告燈號 / 狀態
| 符號 | 意思 |
|------|------|
| 🟢 | 健康（health ≥99% 且無 fresh 告警）|
| 🟡 | 注意（有 WARN 或 health 95–99%）|
| 🔴 | 危險（health <95% 或有 critical / fresh incident）|
| `skip:http401` | 該項跳過，因 HTTP 401 Unauthorized（token 過期）；通常非緊急 |
| `is_fresh=true` | 外部信號確實落在本輪 gap，未處理過 |
| `by-design` | 刻意設計如此，不是 bug（如 CF rules=0）|

---

## 3. 怎麼讀一份 AO-RESUME 報告（小白動線）

1. **§0 TL;DR** — 讀這一行就知道「整體好不好 + 今天該做啥」。燈號🟢就放心。
2. **§1 系統快照** — 想知道細節健不健康。WARN 旁邊一定有白話「要不要擔心」。
3. **§2 外部信號** — 有沒有人/系統在 gap 期間丟訊息/告警。0 = 安靜，正常。
4. **§3 已完成 / §4 進度** — 上次做了什麼、現在進行到哪。
5. **§5 待辦** — 所有未完成事項，按 project 分群。
6. **§6 阻塞與風險** — **有什麼卡住／有風險**（診斷）。空 = 系統沒卡點。
7. **§7 需你決策 / 期限** — **這節是給「你」的**：要你拍板的事 + 快到期的死線。空 = 你今天沒被卡。
8. **§8 下一步** — 建議的第一個具體動作 + 推薦工具。

**學成專家的路**：每次看到不懂的術語 → 查這份 → 下次就懂。報告保留術語（不只白話）就是為了讓你逐次累積，而不是永遠依賴翻譯。

---

## 4. 指令控制台：「我想做 X → 下什麼」

> 你**不需要記任何觸發詞或工具名**——直接用白話跟 Claude 講要做什麼即可，Claude 會自己選工具。下表是讓你知道「系統能幫你做哪些事」的全貌。`/xxx` 是 slash command（斜線指令）。

| 我想做… | 用什麼 | 風險 |
|---------|--------|------|
| 看系統健不健康 | `/health`（不健康再 `/sync-check`）| 安全 |
| 看今天有哪些待辦 | `/tasks` | 安全 |
| 回顧今天做了什麼 | `/recap` | 安全 |
| 查 gap 期間的告警／Slack／Telegram | `/signals` | 安全 |
| 看某客戶站狀態 | `/client-status <客戶代號>` | 安全 |
| 幫客戶站備份＋安全更新 | `/wp-maintenance`（完會自動跑 `/playwright client`）| 中 |
| 跑瀏覽器測試／截圖／效能 | `/playwright smoke`｜`qa`｜`screenshot <url>`｜`perf` | 安全 |
| 部署上線 | `/check-drift` → `/verify` → （確認）→ `/sg-deploy` | **高**（需你點頭）|
| 技術選型 / A vs B / 架構決策 | `/decide` | 安全 |
| 找 bug / 一直報錯 | 跟 Claude 說「diagnose this」 | 安全 |
| 重啟 VPS | `/ks-aw-01-reboot` | **高**（需你點頭）|
| 開工（出狀態報告）| 說「AO-RESUME」或打招呼 | 安全 |
| 收工（寫日誌＋健康閘）| 說「收工／晚安／bye／done」 | 安全 |

> **風險分級**：安全＝Claude 直接做；中＝先說計畫再做；**高＝停下等你明示 go-ahead**（部署/重啟/金流/資料庫不可逆操作）。

---

## 5. 出事了怎麼辦：症狀 → 急救手冊（runbook）

> 看到紅燈🔴或下列症狀，直接叫 Claude「讀 <runbook 名>」或描述症狀，它會自動 triage。手冊全在 repo 根的 `runbooks/`。

| 症狀 | 對應 runbook |
|------|-------------|
| 網站 502 / 很慢 / 記憶體爆（OOM）/ 容器一直重啟 | `HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md` |
| 不明高 CPU / 可疑程序 / 疑似挖礦入侵 | `HETZNER-SERVER-SECURITY-INCIDENT-CRYPTO-MINER.md` |
| 帳密外洩 / 未授權存取 / 安全事件 | `SERVER-SECURITY-BREACH-RESPONSE-PLAYBOOK.md` |
| Telegram bot 不回話 / 指令沒反應 | `COMMAND_PLANE_TELEGRAM_SILENCE_RUNBOOK.md` |
| 被掃描攻擊 / DDoS / 要設防火牆規則 | `CLOUDFLARE-WAF-SETUP.md` |
| Trigger.dev 部署失敗 | `TRIGGER-DEPLOY-CLOUDFLARE-BFM.md` |
| 監控（Uptime Kuma）誤報 / 壞了 | `UPTIME-KUMA-MONITOR-FIX.md` |
| VPS 該重啟但 16 小時沒處理 | `VPS-AUTO-REBOOT-RUNBOOK.md` |

**原則**：你不必自己讀 runbook 動手——描述症狀給 Claude，它讀手冊、先 triage、危險操作會先問你。

---

## 6. 系統自動幫你做的事（你**不用管**的）

> 知道「什麼是自動的」跟知道「什麼要你做」一樣重要——才不會瞎操心已經有人顧的事。

| 自動任務 | 頻率 | 你要做的 |
|---------|------|---------|
| SG + EU 全站備份 | 每日（cron）| 無；AO-RESUME §1 會報備份年齡 |
| EU 客戶站備份狀態同步 | 每日 01:11 UTC | 無；防 Phase4 假警報 |
| VPS 自動重啟（記憶體釋放）| 每日 20:00 UTC | 無；<16h verdict🟢 自動處理 |
| 開工自動健檢（health + smoke + 外部信號 + Cloudflare）| 每次 AO-RESUME | 無；結果直接進報告 §1/§2 |
| Auto-Repair 巡檢（Phase 4）| 每週五 14:00 | 無；異常才會 surface |
| 月度系統/Supabase/治理巡檢 | 每 30 天 | 無；結果進報告 §1 |
| 雲端 4 routines + 3 層告警看門狗 | 持續 | 無；壞了會告警 |

**心法**：報告沒提到的＝系統默默在顧。你只要管報告 **§6（阻塞與風險）**、**§7（需你決策／期限）**、**§8（下一步）** 點名的事。

---

_建立：2026-06-09。SSOT：本檔（系統地圖 + 詞典 + 控制台 + 急救 + 自動化清單）。報告格式 SSOT：`CLAUDE.md` + `agency-os/AGENTS.md` 與現行 `ao-resume.ps1` 流程。指令/ runbook 變動時同 PR 更新本檔（R4）。_
