# Runbook: Trigger.dev Deploy — Cloudflare Bot Fight Mode Bypass

## 症狀（Symptoms）

Deploy 在 `=== Deploy (trigger v4) ===` 之後卡住或失敗，log 出現下列任一訊息：

```
Just a moment...
403
error: managed challenge
cType: 'managed'
```

或 `managed-index-controller` 的 Docker build 步驟（`#16 [indexer 2/2] RUN node /app/node_modules/...`）停止回應。

---

## 根因（Root Cause）

### 完整根因鏈

1. `trigger deploy` CLI 呼叫 `localBuildImage()`（`trigger.dev/dist/esm/deploy/buildImage.js`）
2. `localBuildImage()` 在 line 365 硬碼：
   ```js
   `TRIGGER_API_URL=${apiUrl}`
   ```
   其中 `apiUrl` = server 回報的 `https://trigger.aware-wave.com`
3. Containerfile 的 indexer stage 透過 `ARG TRIGGER_API_URL` + `ENV` 繼承此值
4. `RUN node managed-index-controller.mjs` 對 `https://trigger.aware-wave.com/api/v1/projects/.../envvars` 發出 HTTP 請求
5. Cloudflare Bot Fight Mode 偵測到 Docker build 內的自動化請求 → 回傳 403 managed challenge
6. Deploy 失敗

### 為什麼 `build.env.TRIGGER_API_URL` 無效

`trigger.config.ts` 的 `build.env` 設定**不**會傳遞至 `localBuildImage()` 的 `buildEnvVars`（trigger.dev 4.4.6 確認）。`build.env` 只影響 syncEnvVars 的 deploy-time sync，不影響 Docker `--build-arg`。

---

## 修正（Fix）

### 永久修正（已內建於 `scripts/lobster-trigger-deploy.ps1`）

Deploy script 在每次 `npm install` 後自動執行 sed patch：

```bash
sed -i 's|TRIGGER_API_URL=\${apiUrl}|TRIGGER_API_URL=http://127.0.0.1:8030|g' \
  ./node_modules/trigger.dev/dist/esm/deploy/buildImage.js
```

搭配 `--network=host`，Docker build 的 indexer RUN step 直接到達 VPS 本地 port 8030，完全繞過 Cloudflare。

**搭配條件（三個缺一不可）：**

| 條件 | 作用 |
|------|------|
| sed patch `TRIGGER_API_URL=http://127.0.0.1:8030` | Docker build 的 indexer 呼叫 VPS 本地，而非 public URL |
| `--network=host` in `trigger deploy` command | Docker build RUN step 可到達 host 的 127.0.0.1:8030 |
| `NODE_OPTIONS=--dns-result-order=ipv4first` | CLI 本身的 auth 呼叫走 IPv4，符合 Cloudflare WAF skip 規則 |

### 手動修復步驟（若 deploy 在非 VPS 環境執行失敗）

```bash
# SSH into EU VPS
ssh -i ~/.ssh/hetzner_trigger root@204.168.175.41

# Navigate to workflows
cd /root/Work/lobster-factory/packages/workflows

# npm install (重置 node_modules)
npm install

# 手動套用 sed patch
sed -i 's|TRIGGER_API_URL=\${apiUrl}|TRIGGER_API_URL=http://127.0.0.1:8030|g' \
  ./node_modules/trigger.dev/dist/esm/deploy/buildImage.js

# 確認 patch 成功
grep "TRIGGER_API_URL=" ./node_modules/trigger.dev/dist/esm/deploy/buildImage.js | grep "127.0.0.1"
# 應輸出一行：TRIGGER_API_URL=http://127.0.0.1:8030

# 重新 deploy
export TRIGGER_ACCESS_TOKEN='tr_pat_...'
export TRIGGER_API_URL=http://127.0.0.1:8030
export NODE_OPTIONS='--dns-result-order=ipv4first'
./node_modules/.bin/trigger deploy --api-url http://127.0.0.1:8030 --network=host
```

---

## 驗證（Verification）

成功的 deploy log 應包含：

```
=== Patch buildImage.js (bypass Cloudflare for indexer) ===
  buildImage.js patched: TRIGGER_API_URL -> http://127.0.0.1:8030

=== Deploy (trigger v4) ===
◇  Found 13 env vars to sync
◒  Building version YYYYMMDD.N (local)
◓  Building version ... #16 [indexer 2/2] RUN node /app/node_modules/...
◇  Successfully deployed version YYYYMMDD.N (local build)
└  Version YYYYMMDD.N deployed with 10 detected tasks
```

**失敗指標**：`#16` 步驟出現 `Just a moment` 或 `403` → sed patch 未套用，或 `--network=host` 未傳入。

---

## 版本升級後的注意事項

每次 `trigger.dev` npm 版本升版後需確認：

```bash
grep -n "TRIGGER_API_URL=" \
  ./node_modules/trigger.dev/dist/esm/deploy/buildImage.js
```

若 pattern 變更（例如從 `${apiUrl}` 改為其他寫法），需同步更新 `scripts/lobster-trigger-deploy.ps1` 的 sed 指令。

---

## 相關檔案

| 檔案 | 用途 |
|------|------|
| `scripts/lobster-trigger-deploy.ps1` | 唯一正確的 deploy 入口，含 sed patch |
| `lobster-factory/packages/workflows/trigger.config.ts` | syncEnvVars 設定（不影響 Docker build-arg）|
| `lobster-factory/infra/trigger/README.md` §7a | PAT 金鑰說明 |
| `.claude/agents/trigger-deploy-agent.md` | Agent dispatch 指引 |

---

## 歷史

- **2026-05-21**：根因確認 + sed patch 方案落地；version 20260521.4 / 20260521.5 成功 deploy 驗證
  - commit `c19da17`（sed patch + trigger.config.ts 清理）
  - commit `89350b6`（trigger.dev 4.4.4→4.4.6 升版，0 vulnerabilities）
