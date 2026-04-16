# 系統架構規格（完整自架 / 自託管優先）

## 適用範圍
本檔把既有決策落到可實作邊界，方向為「完整系統自架 / 自託管優先」：先可在單機驗證，再按職責拆分為多節點。

## 分層模型

### 1) Business Layer（業務層）
- **目的**：客戶可見的網站與 CRM 營運。
- **使用工具**：WordPress、FluentCRM（內部營運操作介面由 Next.js 控制台承接）。
- **屬於本層**：頁面內容、表單、名單流程、CRM 活動。
- **不應屬於本層**：跨系統編排、重試機制、隊列、SoR 狀態主權。

### 2) Orchestration Layer（編排層）
- **目的**：安全地協調流程、核准與跨工具串接。
- **使用工具**：Trigger.dev（durable workflow owner）、n8n（glue/ingress）。
- **屬於本層**：
  - Trigger.dev：長時任務、重試、核准等待、關鍵工作流狀態驅動。
  - n8n：webhook ingress、通知、輕量同步與整合。
- **不應屬於本層**：大量客製商業程式碼、未核准的直接生產資料異動。

### 3) Execution Layer（執行層）
- **目的**：執行可重複、可驗證的客製邏輯。
- **使用工具**：Node worker / webhook handlers。
- **屬於本層**：驗證、轉換、idempotent 任務執行、外部 API 封裝。
- **不應屬於本層**：流程主編排、人工臨時 SQL、生產手動熱修常態化。

### 4) AI Layer（AI 協作層）
- **目的**：開發、分析、落地實作加速。
- **使用工具**：Claude Code/CLI、Cursor。
- **屬於本層**：程式/文件生成、除錯、受控腳本執行。
- **不應屬於本層**：未核准直接動生產、保存明文機密、取代常駐執行服務。

### 5) Data Layer（資料層）
- **目的**：系統唯一真相（SoR）與耐久資料。
- **使用工具**：Supabase（SoR）、Redis（快取/隊列輔助）。
- **屬於本層**：租戶狀態、workflow 狀態、審計/操作紀錄、RLS 權限資料。
- **不應屬於本層**：流程編排職責、隨意人工直改生產資料。

### 6) Observability Layer（觀測層）
- **目的**：快速發現異常並支持回滾決策。
- **使用工具**：Sentry（現況 Cloud，可遷至自架）+ PostHog（建議自架）+ 基礎 metrics/log 聚合。
- **屬於本層**：錯誤事件、release 關聯、告警、事件分析、容量監控。
- **不應屬於本層**：業務主資料、流程主控。

### 7) Infra Layer（基礎設施層）
- **目的**：服務可用性、網路邊界與部署穩定。
- **使用工具**：Hetzner（建議多節點）、Docker/Compose、Nginx、Git/GitHub gate、物件儲存（MinIO）。
- **屬於本層**：容器生命週期、網路分區、TLS、備份/還原、健康檢查、儲存耐久策略。
- **不應屬於本層**：業務規則、未文件化臨時操作、明文密鑰入庫。

## 目前硬性邊界（與既有規格一致）
- Trigger.dev 是 durable workflow owner；n8n 只做 glue/ingress。
- Supabase 維持 SoR；WordPress/FluentCRM 維持業務層。
- 觀測層以完整能力為目標：Sentry/PostHog/metrics 可逐步轉為自架，不改資料與編排主權。
- 所有變更必須 staging-first + rollback-aware。

## 完整自架目標拓樸（建議）
- **Control/Edge 節點**：Nginx / TLS / WAF 邊界（可加 Cloudflare 邊緣，但核心仍自架）。
- **Internal Ops UI 節點**：Next.js 控制台（僅操作/可視化，不持有編排主權）。
- **Business 節點**：WordPress + FluentCRM + MariaDB。
- **Orchestration/Execution 節點**：Trigger.dev + n8n + Node worker + Redis。
- **Data 節點**：Supabase（Postgres/pgvector）+ 物件儲存（MinIO）。
- **Observability 節點**：Sentry / PostHog / metrics-log（依負載拆分）。
