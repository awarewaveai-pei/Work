# 下一步行動（完整自架版本）

## Priority 1 - 先消除文件矛盾（立即）
1. 以 `MCP_TOOL_ROUTING_SPEC.md` 為主，固定「Trigger durable owner / n8n glue」語意。
2. 在本次新增文件中維持同一邊界，避免任何主權漂移敘述。
3. 對照 `TASKS.md` 與 `TOOLS_DELIVERY_TRACEABILITY.md`，避免兩套進度表。

## Priority 2 - 完整自架拓樸定版（本週）
1. 定義 5 個平面節點：Edge、Business、Orchestration/Execution、Data、Observability。
2. 定義每節點 CPU/RAM/磁碟與備援策略（不以最低成本為前提）。
3. 定義內外網邊界與埠規則，完成一版網路圖。

## Priority 3 - 核心服務全自架可用
1. 完成 `reverse-proxy`、`wordpress`、`mariadb`、`n8n`、`worker`、`redis` 健康檢查。
2. 完成 Trigger.dev 自託管上線與 workflow 基本驗證。
3. 完成 WordPress DB/媒體與運行設定備份 + 還原演練。

## Priority 4 - 觀測與儲存完整化
1. 補齊 Sentry 覆蓋到 worker 與整合錯誤。
2. 自架 PostHog（事件與 funnel）並建立基礎儀表板。
3. 自架 MinIO（物件儲存）並完成權限與備援測試。

## Priority 5 - 進入可擴展狀態
1. 串接 correlation ID（n8n/Trigger -> worker -> Supabase）。
2. 完成 failed run 回補 runbook（不重複副作用）。
3. 形成「先拆 orchestration/execution，再拆 business」的正式拆分計畫。
4. 依 `NEXTJS_INTERNAL_OPS_CONSOLE_V1.md` 啟動 Next.js 控制台 v1（先唯讀頁，再受控寫入）。

## 立即可跑命令
- `powershell -ExecutionPolicy Bypass -File .\\scripts\\verify-build-gates.ps1`
- `powershell -ExecutionPolicy Bypass -File .\\scripts\\system-health-check.ps1`
- `docker compose -f lobster-factory/infra/hetzner-phase1-core/docker-compose.recommended-ai-native.yml config`
