# Presign broker — minimal integration

> 搭配 [`REMOTE_PUT_ARTIFACTS.md`](REMOTE_PUT_ARTIFACTS.md)。Worker 不實作簽名演算法時，由**你的小服務**回 `puts` JSON。

## 靜態範例（本機／CI 一次性測試）

真實 URL 請換成你的 presigned PUT（時效通常很短）：

- JSON 形狀：[`templates/lobster/presign-response.success.example.json`](../../templates/lobster/presign-response.success.example.json)

設定：

```text
LOBSTER_ARTIFACTS_MODE=remote_put
LOBSTER_ARTIFACTS_PUT_DESCRIPTOR_JSON=<paste minified JSON>
```

（注意：shell 對引號／長度有限制，CI 宜用 env file 或 secret 注入。）

## HTTP broker（推薦形狀）

1. Worker `POST` 到 `LOBSTER_ARTIFACTS_PRESIGN_URL`，body 見 REMOTE_PUT。
2. 你的服務依 `workflowRunId` + `files[]` 產生 **每個檔一個** presigned PUT，回 200 + `puts` 物件。
3. 可選 `Authorization: Bearer`（`LOBSTER_ARTIFACTS_PRESIGN_TOKEN`）。

## 實作提示（不綁定雲）

- **Cloudflare R2**：S3 相容 API 產生 presigned PUT（官方 SDK 或 `aws4fetch`）。
- **AWS S3**：`@aws-sdk/s3-request-presigner` 或同級。
- **僅內網**：可用反向代理 + 短效 JWT 取代公開 bucket（仍要滿足 Worker 的 `PUT` 契約）。

## 失敗路徑

當 `files` 含 `error.txt` / `meta.json`（與可選 `stderr.excerpt.log`）時，同樣回對應鍵的 presigned URL；見 REMOTE_PUT 一節。
