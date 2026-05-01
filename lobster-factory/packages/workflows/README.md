# `@lobster-factory/workflows`

Trigger.dev v4 **task package**（與 monorepo 其餘棧解耦；僅此目錄 + `trigger.config.ts`）。

## 唯一正文（勿在他處複製長流程）

- **自託管 Compose、registry、EU／SG 邊界、Windows 筆電 tunnel、`docker login`、PostHog、`deploy` 指令** → **[`../../infra/trigger/README.md`](../../infra/trigger/README.md)**

## 本目錄

- **`trigger.config.ts`**：`project` ref、`triggerUrl`、`syncEnvVars`（PostHog，見上文 Owner）。
- **`src/trigger/`**：任務與 orchestration 程式碼。

CI 僅 **validate** workflows 套件，**不**自動 deploy — 見 `agency-os/docs/operations/github-actions-trigger-prod-deploy.md`。
