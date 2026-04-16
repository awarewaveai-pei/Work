# 工具責任矩陣（完整自架優先，與 Routing Spec 一致）

| 工具 | 目前角色 | 允許範圍 | 不建議範圍 | 未來演進 |
|---|---|---|---|---|
| WordPress | 業務交付執行面 | 內容、頁面、客戶可見站點操作 | 系統編排、workflow 狀態主權 | 維持業務層 runtime |
| FluentCRM | CRM 引擎 | 名單、活動、自動化 CRM 流程 | 跨系統控制面、SoR 主權 | 隨業務增長擴充，不改層級 |
| n8n | 膠水編排（ingress） | webhook ingress、通知、輕量同步、第三方整合 | 長時重試核心流程、關鍵部署編排 | 維持 glue 角色；不升格 durable owner |
| Next.js 控制台（Internal Ops） | 內部操作介面層 | 租戶總覽、流程狀態可視化、受控 staging 觸發、審計檢視 | 直接繞過 API 寫 SoR、取代 Trigger/n8n 編排 | 依 `NEXTJS_INTERNAL_OPS_CONSOLE_V1.md` 從 v1 漸進擴充 |
| Node worker | 執行層 | 客製邏輯、資料轉換、外部 API 封裝、idempotent handlers | 取代流程編排、直接人工 SQL 生產操作 | 擴充為可觀測、可重試的執行服務 |
| Claude Code / CLI | AI 實作支援 | 程式/文件生成、診斷、runbook、受控腳本 | 未核准直接改生產、保存機密 | 補齊維運自動化與檢查腳本 |
| Cursor | IDE 實作控制層 | 本機開發、審查、重構、文件實作 | 生產控制台、排程主控 | 維持工程控制介面 |
| Supabase | SoR | 結構化資料、RLS、workflow 狀態持久化 | 取代編排引擎、日常人工直改生產 | 擴充 schema/RLS/讀寫擴展 |
| Sentry（Cloud 或自架） | 觀測層 | 錯誤追蹤、告警、release 關聯 | 取代分析平台、保存業務主資料 | 目標可遷至自架觀測叢集 |
| Trigger.dev（現況待上線） | Durable workflow owner（規格主權） | 長時任務、重試、核准等待、關鍵流程編排 | 用 n8n 取代其高風險核心責任 | 完成自託管後承接高複雜流程 |
| PostHog（建議自架） | 產品分析層 | funnel、event、feature flag（非 SoR） | 取代錯誤追蹤、保存交易主資料 | 成為產品/流程優化觀測基礎 |
| MinIO（建議自架） | 物件儲存層 | 檔案、附件、S3 相容儲存 | 取代結構化資料庫 | 與備份/還原演練整合 |

## 實務護欄
- 流程主權：**Trigger.dev（規格）**。
- 膠水整合：**n8n**。
- 執行邏輯：**Node worker**。
- 資料真相：**Supabase**。
- AI 工具僅作實作助手，不是 runtime 控制平面。
- 完整系統自架時，仍不得改變以上主權分工。
