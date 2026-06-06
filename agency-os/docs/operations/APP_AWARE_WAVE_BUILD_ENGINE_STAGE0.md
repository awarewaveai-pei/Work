# app.aware-wave 建站引擎 — Stage 0 診斷 + 活化 Runbook

> **用途**：把 onboarding「觸發建站」從「假成功、不生站」變成「真的長出可登入 staging WP」。本檔含**完整診斷**（已完成）+ **turnkey 活化步驟**（下一步點火）。
> **狀態**：✅ 診斷完成 + ✅ code 接線/回寫已 commit（`847a6389`）｜⏳ **活化未執行**（finicky prod Trigger.dev redeploy，留專注時段做）。
> **建立**：2026-06-06。相關：[`APP_AWARE_WAVE_ONBOARDING_IA_PLAN.md`](APP_AWARE_WAVE_ONBOARDING_IA_PLAN.md)、[`APP_AWARE_WAVE_CURRENT_STATE.md`](APP_AWARE_WAVE_CURRENT_STATE.md)。

---

## 1. 診斷結論（已坐實，DB + code 證據）

**引擎沒壞、也不是沒做完——是「沒接線 + 不回寫狀態」。**

| 事實 | 證據 |
|---|---|
| 真實建站的手 **provision-staging 完整且已證明能用** | SG WP 容器有 3 個活 staging 站（`fresh-brew-coffee` curl **200** + wp-config.php）；205 行無 placeholder（SSH→mkdir→CREATE DB→wp core download/config/install→theme→plugin）|
| intake 自動 pipeline **沒接到那隻手** | `create-wp-site.ts:117`「intentionally placeholder」；EU Trigger.dev `.env` 無 `LOBSTER_HOSTING_ADAPTER` → `resolveStagingProvisioning` 走 `none`/idle，不呼叫 provision-staging |
| **狀態不回寫** | `create-wp-site` 0 次寫 `ops_action_runs` → run 永卡 `dispatched`（dispatcher 設完就結束）|
| 契約相符（本來就設計來搭配）| adapter 送 `{organizationId,siteId,siteName,manifestSlug,pluginSlugs}` = provision-staging 收的；回 `{environmentId,wpRootPath,stagingSiteUrl,wpAdminUrl}` = adapter 要的；token 同一把 `LOBSTER_HOSTING_API_TOKEN` |
| 你 6/5 的 intake 卡 `spec_generated` | DB；那是 trigger-build 對你表單的**另一個**失敗（加固版 retry 會顯精確錯）|

## 2. 已完成（code，commit `847a6389`，重 deploy 才生效）
- **A1** `trigger.config.ts` syncEnvVars 加 `LOBSTER_HOSTING_ADAPTER/PROVIDER_BASE_URL/PROVISION_PATH/API_TOKEN`。
- **B** `create-wp-site.ts` 加 `markActionRunTerminal()` → 跑完/失敗回寫 `ops_action_runs.status`（gated 於 `LOBSTER_ENABLE_DB_WRITES`，best-effort 不 throw，用 dispatcher 傳的 `_dispatchedFromActionRunId`）。

## 3. 活化 Runbook（turnkey，下一步點火）

> ⚠️ **High-risk**：會重 deploy prod Trigger.dev + 開真實佈建（為新 run 建真 staging 站）。**finicky**：Trigger.dev deploy 有 BFM workaround + buildImage patch（見 `trigger.config.ts` 註解 + `scripts/lobster-trigger-deploy.ps1` + `trigger-deploy-agent`）。**逐步、可回滾、先一筆 test。**

**步驟（依序）：**
1. **vault 加值**（`scripts/secrets-vault.ps1 -Action set`）：
   - `LOBSTER_HOSTING_ADAPTER` = `http_json`
   - `LOBSTER_HOSTING_PROVIDER_BASE_URL` = `https://app.aware-wave.com`（provision-staging 所在）
   - `LOBSTER_HOSTING_PROVISION_PATH` = `/api/internal/hosting/provision-staging`
   - `LOBSTER_ENABLE_DB_WRITES` = `true`
   - `LOBSTER_HOSTING_API_TOKEN` = （已在 next-admin，確認 vault 也有）
   - **先不設** `LOBSTER_MANIFEST_EXECUTION_MODE=apply`（縮爆炸半徑；provision-staging 自己已裝 theme+plugin）。
2. **確認 `scripts/lobster-trigger-deploy.ps1` 的 env-export 清單含上述 `LOBSTER_HOSTING_*` + `LOBSTER_ENABLE_DB_WRITES`**（syncEnvVars 只推 process.env 有的 key）→ 缺則補進 export 清單。
3. **SG next-admin 設 `STAGING_BASE_URL`**（目前空 → staging URL 畸形）= `https://aware-wave.com/staging`（docker-compose env / SG .env），重啟 next-admin。
4. **重 deploy workflows 到 EU Trigger.dev**：用 `trigger-deploy-agent`（需 `TRIGGER_DEPLOY_PAT` tr_pat_，vault 已有）跑 `scripts/lobster-trigger-deploy.ps1`。確認 deploy 綠（這步會 type-check A1+B）。
5. **實測一筆**：後台跑一筆 intake（或直接 trigger-build 一筆 test）→ 觀察：
   - `intake_forms.status` → building
   - `ops_action_runs.status` → dispatched → **completed**（B 生效）
   - SG WP 容器 `/var/www/html/staging/<slug>/` 出現 + curl **200**
6. **C 修 intake 入口**：用加固版 handler 重試你 6/5 的表單 → 看精確錯 → 對症修 `trigger-build/route.ts`。

**驗證（R0 四動作）**：實測（步驟 5 的 DB + curl）；deploy 綠（type-check）；critic 讀回 A1+B；WORKLOG 記 DB 前後狀態。

**Rollback**：vault 移除 `LOBSTER_HOSTING_ADAPTER`（即回 mock/idle，不再建真站）；Trigger.dev 重 deploy 前一版；A1+B `git revert`；test 站 `rm -rf /staging/<slug>/` + drop DB。**全可逆。**

---

## 4. 為什麼分這裡停（給未來的我/操作者）
診斷 + 接線 code 已完成且 commit；活化是「重 deploy finicky 的 prod Trigger.dev + 開真實佈建」= High-risk，不在馬拉松尾端盲衝。本 runbook 已 turnkey，專注時段照步驟 1→6 即可點火。
