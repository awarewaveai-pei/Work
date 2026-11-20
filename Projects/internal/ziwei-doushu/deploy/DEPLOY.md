# Oracle 部署（oracle.aware-wave.com，ks-aw-01）

主機與 SSH 見 `agency-os/AGENTS.md` §0（登入帳號 `ubuntu`，指令加 `sudo -n`）。部署屬 High，需操作者同意。舊 SG 主機的首次架站步驟在 git 歷史（`deploy/DEPLOY-SG.md`，2026-11-20 前）。

## 主機現況（2026-11-20 實查）
- 目錄 `/opt/oracle/Projects/internal/ziwei-doushu/`：**不是 git 目錄**，由部署腳本 rsync 寫入。
- 機器本地檔（不進 git、部署不覆蓋）：`.env.production`（600；`OPENAI_API_KEY`、`OPENAI_MODEL_DEEP`）、`docker-compose.override.yml`（`env_file`）、`docker-compose.yml`。
- 容器 `oracle-web`，`127.0.0.1:3010` → host nginx vhost `oracle.aware-wave.com`。
- 不在 `sg-deploy.sh` 的 app 清單，也沒有夜間自動部署：推上 `main` 不會上線。

## 部署（一條指令，脫離 SSH 執行）
```bash
ssh -p 58122 ubuntu@145.239.195.47 'sudo -n bash -c "git -C /root/Work fetch -q origin main && git -C /root/Work show origin/main:Projects/internal/ziwei-doushu/deploy/oracle-deploy.sh > /tmp/oracle-deploy.run.sh && setsid nohup bash /tmp/oracle-deploy.run.sh > /tmp/oracle-deploy.out 2>&1 < /dev/null &"'
```
- SSH 會掛到逾時才回，屬正常；用 `sudo tail /tmp/oracle-deploy.out` 看進度，結尾 `deployed commit=<sha>` 即成功。
- 先試跑不改動：把腳本從本機餵進去 `ssh … 'sudo -n bash -s -- --dry-run' < deploy/oracle-deploy.sh`。
- 流程、不變量與回滾寫在 `deploy/oracle-deploy.sh` 檔頭。失敗會自動還原並經 `notify.sh` 通知；備份在 `/opt/oracle/backups/src-*.tgz`（留 5 份）與映像 `oracle-web:rollback`。
- 記錄：`/opt/oracle/logs/oracle-deploy-*.log`。

## 上線後驗證（從外部）
```bash
curl -s https://oracle.aware-wave.com/zh-TW | grep -o '<title>[^<]*'          # 東西方命理
curl -s https://oracle.aware-wave.com/sitemap.xml | grep -c 'oracle.aware-wave' # = 頁數×語言
```
AI 解讀：`POST /api/interpret`，body `{ tier: "light", context: { systemId, locale, headline, facts[] } }`，每個 `SYSTEM_IDS` 各打一次應回 200 與 `text`。

## 改容器設定或 nginx
- `docker-compose.yml`：repo 與主機不同時部署腳本會停；用 `/root/lobster-phase1/scripts/safe-infra-patch.sh` 改主機那份。
- nginx vhost 範本：`deploy/nginx/oracle.aware-wave.com.conf`；主機上改用 `safe-infra-patch.sh host-nginx`。

## 注意
- `NEXT_PUBLIC_*` 在 build 時內嵌；網域預設值在 `lib/site.ts`。
- `.dockerignore` 排除 `.env*`：金鑰只在執行期由 compose `env_file` 注入。
- 付費牆：`/api/interpret` 的 `premium` 回 402；`light`／`deep` 放行；每日次數計量未接。
