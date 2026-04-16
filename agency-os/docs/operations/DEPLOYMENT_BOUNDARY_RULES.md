# 佈署邊界規則（與 Routing Spec 對齊）

## n8n 可以做
- 接 webhook、整理 payload、做通知與輕量同步。
- 呼叫 worker/API 作為流程節點。
- 執行低風險、可快速回復的整合流程。

## n8n 不應該做
- 長時重試型關鍵流程主編排。
- 未核准的生產資料結構異動。
- 高風險部署放行。

## Trigger.dev 可以做（durable owner）
- 長時任務、重試、等待核准、關鍵工作流狀態機。
- 生產級高風險流程（必須帶 approval + rollback）。

## Trigger.dev 不應該做
- 取代 n8n 的單純 ingress/通知膠水工作。
- 繞過 SoR 寫入規範與審計欄位。

## Node worker 可以做
- 驗證、轉換、執行可重複的客製邏輯。
- 呼叫外部 API（含 idempotency/retry）。
- 將結果安全寫回 Supabase。

## Node worker 不應該做
- 充當流程控制台或人工操作入口。
- 執行未文件化的生產 SQL。

## Next.js 控制台可以做
- 顯示租戶狀態、流程狀態、審計資訊。
- 透過受控 API 觸發允許的 staging 操作。

## Next.js 控制台不應該做
- 直接持有或使用 service_role 進行客戶端寫入。
- 直接繞過 Trigger/n8n 主權去操作關鍵流程。

## Claude Code / CLI 可以做
- 產碼、改文件、診斷、生成 runbook / 腳本。
- 本機或 staging 受控檢查。

## Claude Code / CLI 絕對不能直接做
- 在 repo/docs/chat 保存明文機密。
- 未核准的破壞性生產操作。
- 跳過 staging 與 rollback 閘道。

## 生產變更政策
- **先 staging，後 production**：禁止直接上 production。
- **必須核准**：DB migration、公開路由異動、憑證輪替、不可逆資料操作。
- **人類在迴路**：最終 production deploy、rollback 決策、安全事件處置、客戶影響流程停用。

## 安全變更固定流程
1. 分支實作。
2. staging 驗證。
3. 留證據（run ID / report / log）。
4. 核准。
5. 生產部署。
6. 監看與可回滾窗口。
