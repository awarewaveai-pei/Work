# Artifacts lifecycle policy（Lobster Factory — Phase 1）

> **A9 補強（政策層）**：與技術實作 [`LOCAL_ARTIFACTS_SINK.md`](LOCAL_ARTIFACTS_SINK.md)、[`REMOTE_PUT_ARTIFACTS.md`](REMOTE_PUT_ARTIFACTS.md) 搭配。  
> IAM 邊界見 [`ARTIFACTS_IAM_BOUNDARY.md`](ARTIFACTS_IAM_BOUNDARY.md)；機器可驗證 baseline 見 `policies/artifacts/artifacts-governance-baseline.json`。

## 1) 我們在存什麼

- `apply-manifest` 相關：**完整 stdout/stderr**（或失敗時的 error 摘要）、**meta.json**（trigger、run id、時間）。
- DB 欄位 **`logs_ref` / `output_snapshot.logsRef`**：穩定**邏輯鍵**或你自訂前綴；**不一定是**公開 URL。

## 2) 模式與責任

| 模式 | 儲存位置 | 營運責任 |
|------|----------|----------|
| `local` | `agency-os/reports/artifacts/lobster/...` 或自訂 `LOBSTER_ARTIFACTS_BASE_DIR` | 備份、磁碟配額、存取權（檔案系統 ACL） |
| `remote_put` | R2/S3 等（presigned PUT） | presign 服務可用性、bucket 政策、**物件過期**與版本策略 |
| off | 不落地全文 log | 僅依 DB 內 tail；除錯能力較弱 |

## 3) 留存與刪除（原則）

- **預設建議**：staging 除錯 log **30–90 天**後可刪或轉冷儲存（依合約與法遵調整）。
- **含客戶資料或 PII**：不得無限期放在公開可讀 bucket；需加密與存取審核。
- **刪除前**：若牽涉爭議或 SLA，先與客戶範圍／法律顧問對齊（對齊 Agency 合規文件）。

## 4) 存取控管

- **本機目錄**：僅開發者與受控 CI；勿同步到公開雲碟。
- **Presigned URL**：單次或短時效；勿寫入版本庫；rotate 外洩的 signing 金鑰。
- **DB `logs_ref`**：僅內部營運／支援可解析；對客戶報告用**去敏**摘要。

## 5) 與 rollback / 失敗的關係

- **Rollback** 腳本與 DB `failed` 狀態**不依賴** artifact 永久保存；artifact 用於**事後鑑識**與重現。
- 失敗路徑仍應盡量寫入 `error.txt` / `stderr.excerpt`（local 或 remote_put 對應檔名見 REMOTE_PUT 文件）。

## 6) 下一步（實作層 backlog）

- Bucket lifecycle 規則（Cloudflare R2 / AWS S3）與 IaC 註解。
- 多租戶 prefix 強制（`orgId/runId/`）與 presign broker 驗證。
- 可選：將 `logs_ref` 與內部 ticket 單號綁定，便於搜尋。

## 7) 自動檢查與稽核（A9 baseline）

- 結構與政策驗證：
  - `node scripts/validate-artifacts-governance.mjs`
- 稽核報告產生（落到 `agency-os/reports/operations/`）：
  - `node scripts/audit-artifacts-governance.mjs`

## 8) 供應商策略（避免早鎖死）

- 目前採 **portable single provider**：主供應商 `cloudflare_r2`，相容 `aws_s3`。
- 判斷原則：先維持單一路徑降維運成本；若客戶或合規要求再切換 broker + IaC。
- 規格固定於：`policies/artifacts/artifacts-governance-baseline.json`。
- 轉換手冊：`docs/operations/R2_TO_S3_MIGRATION_RUNBOOK.md`（AWS-ready，切換不改 workflow contract）。
