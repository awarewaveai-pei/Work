# 綜合進度報告（單檔總覽）

> **用途**：每天想「一次看完」待辦、工廠主線、續接記憶、今日日記與附錄時，開這裡指到的**產出檔**即可。  
> **原則**：狀態仍只維護在各「單一真實來源」；本報告由腳本**拼裝**，不重複手動維護勾選。

## 你要開哪個檔？

| 檔案 | 說明 |
|------|------|
| **`reports/status/integrated-status-LATEST.md`** | 永遠指向**最近一次**產生的完整綜合報告（建議書籤這個）。 |
| `reports/status/integrated-status-YYYYMMDD-HHmmss.md` | 帶時間戳的歷史快照，方便對照某天。 |

## 怎麼產生／更新？

在 `agency-os` 目錄執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\generate-integrated-status-report.ps1
```

或在 **monorepo 根** `<WORK_ROOT>` 下（腳本會解析至 `agency-os`）：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\generate-integrated-status-report.ps1
```

可選參數：`-WorkspaceRoot "<WORK_ROOT>\agency-os"`（在 `agency-os` 內執行時通常會自動推斷）。

## 報告裡每一節對應什麼？（與「一句話記法」對齊）

| 報告章節 | 對應真實來源 | 你記的分類 |
|----------|----------------|------------|
| §1–2 `TASKS.md - Next / Backlog` | `TASKS.md` 未勾選項 | 待辦狀態 · 全公司 |
| §3 Lobster checklist open items | `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md`（A～C，不含 D 儀表勾選） | 待辦狀態 · 工廠 |
| §4 `CONVERSATION_MEMORY` excerpts | `memory/CONVERSATION_MEMORY.md`（Next / Today / Remaining / Tomorrow） | 今天從哪接 |
| §5 `memory/daily/…` | 當日 `memory/daily/YYYY-MM-DD.md`（過長會截斷） | 今日細節 |
| §6–7 | `LAST_SYSTEM_STATUS.md`、`WORKLOG.md` 尾端（約末 60 行，避免整檔載入過慢） | 狀態／日誌附錄 |

報告標題列為英文是為了讓 Windows PowerShell 腳本**不需 UTF-8 BOM** 也能穩定執行；**內文條目**仍來自 UTF-8 來源檔，可為中文。

## 與其他「一頁」的關係

- **`docs/overview/EXECUTION_DASHBOARD.md`**：儀表板與 Gate、每日路徑（仍建議每天先掃一眼）。
- **`docs/overview/REMOTE_WORKSTATION_STARTUP.md`**：雙機／換機開工順序與 AO-RESUME 30 秒自檢（開工事件單一真相）；**新機 §1.5**、**例行 §2**、**§2.5 日內 Git**（checkpoint / 收工 push）；**`scripts/ao-resume.ps1`（預設）**涵蓋 fetch／behind 時 ff-only pull、`npm ci`（需時）、閘道、**Strict** 稽核，exit 0 後再打 **`AO-RESUME`** 讀檔（與儀表板 §4 一致）。
- **`docs/operations/end-of-day-checklist.md`**：AO-CLOSE 收工流程（收工事件單一真相）。
- **本頁 + `integrated-status-LATEST.md`**：要把「待辦 + 工廠 + 記憶 + 今日」**塞進同一視窗**時用。

## Related

- `docs/overview/EXECUTION_DASHBOARD.md`
- `TASKS.md`
- `../lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md`（monorepo 路徑）

_Last updated: manual doc; report body is script-generated._

## Related Documents (Auto-Synced)
- `automation/REGISTER_WEEKLY_SYSTEM_REVIEW_TASK.ps1`
- `docs/overview/EXECUTION_DASHBOARD.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`

_Last synced: 2026-04-09 05:26:05 UTC_

