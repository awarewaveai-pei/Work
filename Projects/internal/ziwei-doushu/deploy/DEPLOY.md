# Oracle 部署（oracle.aware-wave.com，ks-aw-01）

oracle 是 `sg-deploy.sh` 的一個 app：`oracle-web`。主機與 SSH 見 `agency-os/AGENTS.md` §0（登入 `ubuntu`，指令加 `sudo -n`）。部署屬 High，需操作者同意。

## 部署
```bash
/root/lobster-phase1/scripts/sg-deploy.sh oracle-web
```
- 流程（CI 閘 → `npm ci`／tsc／vitest → 快照 → build → up → healthy → smoke → 失敗自動還原）與旗標見 `lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh` 與 `agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md`。
- **不在每晚 03:00 自動部署內**：推上 `main` 不會上線，要手動跑上面那行。
- CI：`.github/workflows/oracle-web-ci.yml`（`check-ci-green.sh` 的 `app_workflows` 對照）。CI 未綠會被拒絕。
- 回滾：`/root/lobster-phase1/scripts/rollback-phase1.sh restore oracle-web`。

## 主機上的位置
- 原始碼（rsync 目的地）：`/root/lobster-phase1/apps/oracle-web/`；來源 `Projects/internal/ziwei-doushu/`（`sg-deploy.sh` `app_git_source_root`）。
- 容器設定：`/root/lobster-phase1/docker-compose.yml` 的 `oracle-web` 服務（機器本地；repo 對照檔 `lobster-factory/infra/hetzner-phase1-core/docker-compose.yml`）。改它用 `safe-infra-patch.sh compose`。
- 金鑰：`/root/lobster-phase1/apps/oracle-web/.env.production`（600；`OPENAI_API_KEY`、`OPENAI_MODEL_DEEP`）。不進 git、rsync 不動、不進映像（`.dockerignore`）。
- 對外：host nginx vhost → `127.0.0.1:3010`；`lobster-nginx` 以 `oracle-web:3000` 走 `lobster-net`（容器名不可改）。範本 `deploy/nginx/oracle.aware-wave.com.conf`。

## 上線後驗證（從外部）
```bash
curl -s https://oracle.aware-wave.com/zh-TW | grep -o '<title>[^<]*'            # 東西方命理
curl -s https://oracle.aware-wave.com/sitemap.xml | grep -c 'oracle.aware-wave' # = 頁數×語言
```
AI 解讀：`POST /api/interpret`，body `{ tier: "light", context: { systemId, locale, headline, facts[] } }`，每個 `SYSTEM_IDS` 各打一次應回 200 與 `text`。

## 注意
- `NEXT_PUBLIC_*` 在 build 時內嵌；網域預設值在 `lib/site.ts`。
- 付費牆：`/api/interpret` 的 `premium` 回 402；`light`／`deep` 放行；每日次數計量未接。
- 歷史：2026-11-20 前在 `/opt/oracle` 以獨立 compose 執行（`deploy/DEPLOY-SG.md`、`deploy/oracle-deploy.sh` 見 git 歷史）。
