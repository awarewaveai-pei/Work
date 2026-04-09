# Agency-OS Rules 使用說明

這份說明教你怎麼在日常工作中使用 `.cursor/rules`。

## 一句話版本

- 開工：直接開聊，或打 `AO-RESUME`
- 收工：打 `AO-CLOSE`
- 文件大改後：讓系統跑 `doc-sync + health-check + guard`

## 你現在有的規則（精簡索引）

- `00-session-bootstrap.mdc` — 新對話：昨日回顧 + 今日計畫 + 確認事項
- `10-memory-maintenance.mdc` — 里程碑／長對話：寫回 `memory`
- `20-doc-sync-closeout.mdc` — 改治理文件：doc-sync + health
- `30-resume-keyword.mdc` — `AO-RESUME`：讀檔 + 固定續接格式
- `40-shutdown-closeout.mdc` — `AO-CLOSE`：收工 + 閘道 + 日結格式（**單關鍵字即授權**代理寫 **`WORKLOG`** **`- AUTO_TASK_DONE:`**；**`apply-closeout-task-checkmarks`**）
- `50-operator-autopilot.mdc` — Autopilot 模式約定
- `60-beginner-operation-format.mdc` — 小白操作（路徑／動作／預期）
- `62-progress-heartbeat-15min.mdc` — 長任務 15 分鐘心跳
- **`63-cursor-core-identity-risk.mdc`** — **企業級**：身分、風險分級、紅線（與 AO／00／30／40 衝突時以後者為準）
- **`64-architecture-mcp-routing.mdc`** — **企業級**：架構分層、MCP 路由（細節以 `MCP_TOOL_ROUTING_SPEC` + `cursor-mcp-and-plugin-inventory` 為準）
- **`65-build-standards-data-state.mdc`** — **企業級**：DB／狀態機／結構（**globs**：supabase、sql、migrations、apps、packages）
- **`66-skills-observability-protocol.mdc`** — **企業級**：Skills、可觀測性、與 62 心跳搭配

**索引頁（給人看／賣方說明）**：`docs/operations/cursor-enterprise-rules-index.md`  
**溯源包（多模型產出）**：`../docs/spec/raw/Cursor  Rules for AI/`（monorepo 根；請以本目錄 `63`–`66` 為部署正本）  
**僅開 monorepo 根工作區時**：Cursor 通常只載入 `../.cursor/rules/` — 修改本目錄 `63`–`66` 後請將**同四檔複製覆蓋**至該路徑，與 `README-部署說明.md` § Monorepo 根工作區一致。

## 每天建議流程

1. 開工時輸入 `AO-RESUME`
2. 完成任務過程中照常對話
3. 有改 `docs/`、`tenants/`、規則或治理檔時，確認有跑 closeout 流程
4. 關機前輸入 `AO-CLOSE`

## 常用關鍵字

- `AO-RESUME`：開工續接（強制先讀記憶與任務檔）
- `AO-CLOSE`：收工總結（今日完成/未完成/連動檢查/明日優先）

## 你會看到的固定輸出

- 開工：
  - `Yesterday Recap`
  - `Today Plan`
  - `Confirm`
- 收工：
  - `今日完成`
  - `今日未完成`
  - `連動檢查`
  - `明日優先`

## 異常時怎麼判斷

- 如果回覆沒先出現開工摘要，請直接重打 `AO-RESUME`
- 如果收工沒跑檢查，請重打 `AO-CLOSE`
- 如果 `連動檢查` 顯示 FAIL，先修復再結束當日工作

## 手動檢查命令（必要時）

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doc-sync-automation.ps1 -AutoDetect
powershell -ExecutionPolicy Bypass -File .\scripts\system-health-check.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\system-guard.ps1 -Mode manual
```

## 維護規則時的原則

- 一個規則只做一件事（避免互相覆蓋）
- 改規則後要同步檢查：
  - `AGENTS.md`
  - `docs/change-impact-map.json`
  - `docs/CHANGE_IMPACT_MATRIX.md`
