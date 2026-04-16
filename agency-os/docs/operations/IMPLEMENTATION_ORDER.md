# 實作順序（完整自架、自託管優先）

## Phase 0 - 目標拓樸與容量定版（先做）

**目標**
- 先定義完整自架拓樸，避免做到一半再重構。

**具體任務**
- 定版節點角色：Edge、Business、Orchestration/Execution、Data、Observability。
- 定版核心資源：CPU/RAM/磁碟/備援策略（至少 N+1 思維）。
- 定版網路與安全邊界：公網入口、內網分段、SSH/管理面限制。

**驗收標準**
- 有一份可執行的節點與資源表。
- 有網段與埠開放清單。
- 有備份與還原責任表（誰、何時、如何驗證）。

**風險**
- 不先定版會導致後面每階段反覆重做。

---

## Phase 1 - 核心平面落地（可 24/7）

**目標**
- 先讓既有堆疊能 24/7 穩定重啟、可回滾、可追蹤。

**具體任務**
- 固定 compose 邊界、健康檢查、資源上限。
- 完成 WordPress / Trigger.dev / n8n / worker / Redis / 反代基本可用鏈路。
- 完成 Supabase 自託管切線（URL/key/vault）與基本 smoke。
- 完成備份與還原演練（至少一次）。
- 清除明文密鑰風險（僅 vault/env/secret manager）。

**驗收標準**
- 主機重開後核心服務可自動恢復。
- 至少一條流程可重跑且不產生重複副作用。
- 還原演練成功並有證據紀錄。
- Repo 追蹤檔無生效中的明文密鑰。

**風險**
- 手動熱修造成服務漂移。
- 有備份但未實測還原。

---

## Phase 2 - 編排與觀測完整化

**目標**
- 降低 silent failure，讓流程錯誤可定位、可重放。

**具體任務**
- 對齊 routing 邊界：Trigger（durable owner）/ n8n（glue），並完成 production-ready runbook。
- 擴大 Sentry 覆蓋到 worker 與整合錯誤。
- 建置 PostHog（建議自架）作事件分析。
- 建立 n8n -> worker -> Supabase correlation ID 串接。
- 建 dead-letter / failed-run 回補流程與操作手冊。

**驗收標準**
- 人工注入錯誤可觸發 Sentry 告警並可追到 run ID。
- failed run 可依 runbook 在 10 分鐘內安全重放。
- 無破壞既有 n8n 膠水流程。

**風險**
- 告警噪音過高。
- 僅單層觀測導致追因斷點。

---

## Phase 3 - 儲存與資料韌性擴充

**目標**
- 完整自架儲存層（結構化 + 物件）與災難復原能力。

**具體任務**
- 建置 MinIO（或同級 S3 相容）並完成權限策略。
- 完成 WordPress/worker 對物件儲存接線。
- 補齊跨節點備份、快照、還原演練（DB + object storage）。

**驗收標準**
- 檔案上傳/讀取/權限驗證通過。
- DB + object storage 還原演練可在時限內完成。

**風險**
- 未演練還原時，備份等於沒有。

---

## Phase 4 - 清楚拆分與擴展路徑

**目標**
- 不引入新平台前提下，先完成可拆分設計。

**具體任務**
- 公開/內網 network 分區（只保留必要對外入口）。
- 把重負載 handler 聚焦到 worker。
- 形成拆分計畫：先拆 worker+n8n，再拆 WordPress，Supabase 契約不變。
- 依 `NEXTJS_INTERNAL_OPS_CONSOLE_V1.md` 落地 Next.js 控制台 v1（先唯讀，再受控寫入）。

**驗收標準**
- 對外入口僅反代與必要 web 路由。
- worker 壓力上升不明顯拖累 WordPress 基線。
- 拆分不需重寫資料模型。
- Next.js v1 完成 DoD（租戶設定回寫、流程狀態可視、審計留痕）。

**風險**
- 8GB 資源互搶。
- 單機假設綁太死。
