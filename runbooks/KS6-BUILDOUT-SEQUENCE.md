# KS-6 裝機順序索引

> **這份文件只有一個功能：告訴你「做到哪一步，該開哪份文件」。**
> **刻意不重複寫任何事實內容**——規格、價格、步驟細節都只存在來源文件裡一份。這是為了不重演 2026-08-19 抓到的坑：TASKS.md 跟 Google 日曆事件各自抄了一份決策內容的摘要，改了決策文件卻沒同步過去，兩處各自跟原文兜不起來。這份文件因為不重複內容，不可能跟其他文件矛盾。
>
> 如果某個階段的文件連結失效，代表來源文件被搬動了——去 `agency-os/TASKS.md` 的 soulful 搬站區塊找最新位置，不要在這裡猜測補內容。

---

## 整體藍圖：這台機要扛三件事，不是只有 soulful

買這台機的完整理由是**同時解開三條卡住的線**（見 [`2026-08-18` Context 段](../agency-os/reports/decisions/2026-08-18-dedicated-host-purchase-timing.md)）：

| 順序 | 做什麼 | 為什麼排這裡 |
|---|---|---|
| **第一段（11/12 前）** | soulful 搬遷 + Chatwoot 上線 | soulful 有硬死線；Chatwoot 是零風險 greenfield，順便拿來試機底層 |
| **第二段（11/20 起）** | **EU + SG 兩台雲端整併退役**（六服務，兩週一台）| 無外部死線，但**其中 Supabase 搬遷是明確 High-risk 項目**——Pre-mortem 分析認定「跟 soulful 死線擠在同一窗口」是本決策最大的失敗模式（兩件風險屬性不同的事互相拖累），故刻意分開，不是往後排代表不重要 |

**兩段都是必做項，順序本身是風險控管的結果，不是優先序判斷。** 第一段完成 ≠ 任務結束，第二段才是「整併」這個詞真正的內容。

---

## 買之前

| 要確認什麼 | 開哪份 |
|---|---|
| 為什麼是這個規格（128GB ECC / 16C32T / 2TB）| [`2026-08-17-dedicated-host-spec-upgrade.md`](../agency-os/reports/decisions/2026-08-17-dedicated-host-spec-upgrade.md) |
| 為什麼現在買、選月租 | [`2026-08-18-dedicated-host-purchase-timing.md`](../agency-os/reports/decisions/2026-08-18-dedicated-host-purchase-timing.md) |

## P1 — 下單當下

[`2026-08-18-dedicated-host-purchase-timing.md`](../agency-os/reports/decisions/2026-08-18-dedicated-host-purchase-timing.md) 的 **P1 表**：規格逐項核對、選 1-month commitment、無貨時的次選路徑。

## P2 — OS + RAID1 + 硬化

- 同文件 **P2 表**（含 P2.1–P2.10 全部子項）
- [`SERVER-SECURITY-BREACH-RESPONSE-PLAYBOOK.md`](SERVER-SECURITY-BREACH-RESPONSE-PLAYBOOK.md) §8（Docker/UFW 繞過修法）+ §10（上線前檢查清單）
- [`KS6-SELF-HOSTED-STACK-HARDENING-CHECKLIST.md`](KS6-SELF-HOSTED-STACK-HARDENING-CHECKLIST.md) 「通用主機層」節

## P3 / P4 — 備份 + 還原演練

- 同文件 **P3 / P4 表**
- [`BACKUP_RESTORE_PROOF.md`](../agency-os/tenants/company-soulful-expression/core/BACKUP_RESTORE_PROOF.md)（既有 Drill #1 記錄，Drill #2 比照格式記錄）

## P5 — Chatwoot 先上（試機）

- 同文件 **P5 表**
- [`KS6-SELF-HOSTED-STACK-HARDENING-CHECKLIST.md`](KS6-SELF-HOSTED-STACK-HARDENING-CHECKLIST.md) 「Chatwoot」節

## P6 — 監控接上

- 同文件 **P6 表**
- `scripts/check-clickhouse-health.ps1`（2026-08-19 已加無 TTL 表 / 孤兒表偵測，若 ClickHouse 之後搬上這台機，確認腳本的 EU IP 參數要改指向新機）

## P7 — soulful 建置 + 切換前驗證

- 同文件 **P7 表**
- [`SITE_MIGRATION_RUNBOOK.md`](../agency-os/tenants/company-soulful-expression/core/SITE_MIGRATION_RUNBOOK.md) §3–§5
- [`SITE_CODE_MANIFEST.md`](../agency-os/tenants/company-soulful-expression/core/SITE_CODE_MANIFEST.md)（外掛/版本清單）
- [`KS6-SELF-HOSTED-STACK-HARDENING-CHECKLIST.md`](KS6-SELF-HOSTED-STACK-HARDENING-CHECKLIST.md) 「WordPress + WooCommerce」+「MainWP」節

## P8 — 正式切換

- 同文件 **P8 表**
- [`SITE_MIGRATION_RUNBOOK.md`](../agency-os/tenants/company-soulful-expression/core/SITE_MIGRATION_RUNBOOK.md) §6（回滾）
- [`KS6-SELF-HOSTED-STACK-HARDENING-CHECKLIST.md`](KS6-SELF-HOSTED-STACK-HARDENING-CHECKLIST.md) 「Cloudflare / 切換相關」節——**切換前必查 zone SSL 模式是 Full (Strict)**

## 切換完成 14 天無事故後

- `SITE_MIGRATION_RUNBOOK.md` 可標記「已完成，存檔參考」（歸檔非刪除，留給下次搬其他站當範本）
- **第一段結束，緊接著排第二段——不是「之後有空再說」**：在 TASKS.md 把 11/20 起的六個服務逐一列成具名待辦，寫進日曆，避免「範圍閘」變成無限期拖延（08-18 決策文件 Pre-mortem 明確警告過這個失敗模式）

---

## 第二段：2026-11-20 起 — EU + SG 整併退役（六服務，兩週一台）

| 要確認什麼 | 開哪份 |
|---|---|
| 整體順序、Chatwoot 為何先行、單台+RAID1+R2 為何夠用、HA 為何延後 | [`HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md`](HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md) §0b |
| 六服務清單與現況（Supabase / Trigger.dev / n8n / Postiz / MainWP / Uptime Kuma，SG：next-admin 等）| [`AWAREWAVE_STACK_QUICKREF.md`](../agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md)（**2026-08-19 已知有 4 個容器未列在表格裡，搬遷前先重新 `docker ps` 核對，不要照表操課漏掉**）|
| 每個服務搬遷的災難還原/回滾指令 | 同 DR runbook §4 |
| 上機前總檢查（含這次新增的防火牆/密碼/TTL 等項）| 同 DR runbook §7 |
| **Supabase 搬遷專屬**（六服務裡風險最高、需操作者本人在線）| §4/§5 對應段落；搬遷當下比照 P8 的 go-ahead 規則，不得無人值守執行 |
| ClickHouse 若隨 Trigger.dev 一起搬 | [`KS6-SELF-HOSTED-STACK-HARDENING-CHECKLIST.md`](KS6-SELF-HOSTED-STACK-HARDENING-CHECKLIST.md) ClickHouse 節——**先修 `override.xml` 產生源設定再搬，不要先搬上去再說**（2026-08-19 在 EU 上實測驗證過這個坑，同一套修法要複製到新機）|
| 退雲端後的驗收 | 兩台雲端主機（EU cpx32 + SG）確認已無流量、可安全關閉；帳單確認只剩一台在計費 |

---

## 貫穿全程

- [`agency-os/TASKS.md`](../agency-os/TASKS.md) soulful 搬站區塊——單一進度入口，做完一步在那裡打勾
- `agency-os/WORKLOG.md`——每階段驗證完寫一筆，含 REALTEST/REVIEW/BUGHUNT 三項證據

---

_建立 2026-08-19。維護規則：**只改連結，不要在這裡加事實內容**。若發現這裡的敘述跟來源文件的說法不一致，代表這份文件被寫壞了，刪掉重寫成純連結，不要修內容讓它跟來源看起來一致。_
