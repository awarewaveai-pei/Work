# Trigger.dev 自託管（本 repo 內 compose）

**官方文件**（版本變動快，部署前請再對一次）：<https://trigger.dev/docs/self-hosting>  
**本目錄**：`docker-compose.yml` + `.env.example`；**對外網域**由 `hetzner-phase1-core` 的 Nginx 反代（見 `../hetzner-phase1-core/nginx/trigger.conf`）。  
**本機 workflows**：`packages/workflows/trigger.config.ts` 的 `triggerUrl`／`project` 須與自架 dashboard 一致。

---

## 誰能做什麼（避免卡住還在等 Cursor）

| 誰 | 能做 |
|----|------|
| **你（或受權工程師）** | Hetzner **Web / Serial console**、`service ssh restart` 或 `systemctl restart ssh`、SSH 登入、編輯 `/etc/ssh/sshd_config`、`docker compose`、產生 secret、DNS、TLS |
| **本 repo／AI** | 維護 compose、nginx 片段、範本 env、操作順序文件；**無法**代你連進 VPS 或代按 Hetzner 主控台 |

若 **SSH 完全進不去**：請用 **Hetzner Cloud → 該 VPS → Console**（瀏覽器終端機）登入，**不要**等本機 `ssh` 自己好。

---

## 卡住時：先救 SSH（Console 內執行）

改過 `sshd_config` 後**一定要重啟 sshd**，否則 `PermitRootLogin` 等選項不會生效。

```bash
#擇一（依 OS）
systemctl restart ssh
#或
service ssh restart
```

**本機測試（Windows PowerShell）**（私鑰路徑請改成你的）：

```powershell
ssh -i "$env:USERPROFILE\.ssh\hetzner_trigger" root@<VPS_IP>
```

若仍失敗，在 **Console** 檢查：

```bash
ls -la /root/.ssh
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys
grep -E '^PermitRootLogin|^#PermitRootLogin' /etc/ssh/sshd_config
# 需要 root 金鑰登入時，應為：PermitRootLogin yes 或 prohibit-password（並確認用金鑰而非密碼）
```

確認 `authorized_keys` **內含你打算用的那把公鑰的一整行**（與本機對應私鑰成對）。改完再 `systemctl restart ssh` 一次。

---

## 正常啟動順序（SSH 已通之後）

### 0. 先決條件

- **DNS**：`trigger.aware-wave.com` 的 **A 記錄**指向該 VPS（或你實際終止 TLS 的那台）。  
- **TLS**：`trigger.conf` 目前為 **listen 80**；若對外要 **HTTPS**，須在 Nginx 前或 Nginx 上補證書（Let’s Encrypt 等）— 不在本 README 展開，但未上 TLS 時瀏覽器可能僅能用 `http://` 測試。  
- **Docker network `lobster-net`**：由 **phase1-core** 建立（`docker-compose.yml` 內 `name: lobster-net`）。**Trigger 的 compose 依賴 `lobster-net` 為 external**，故須先起 phase1（或手動 `docker network create lobster-net`，不建議與正式 compose 混用）。

### 1. 在 VPS 上取得 repo

依你慣用方式：`git clone`、或 `rsync`、或 CI 發版—**重點**是 VPS 上要有與本 repo 對齊的 `lobster-factory/infra/trigger` 與 `lobster-factory/infra/hetzner-phase1-core`。

### 2. 啟動 phase1-core（建立 `lobster-net` + Nginx 掛載 `trigger.conf`）

```bash
cd lobster-factory/infra/hetzner-phase1-core
cp .env.example .env
# 依 README 填好 .env 後：
docker compose --env-file .env up -d
```

### 3. 準備 Trigger 的 `.env`

```bash
cd ../trigger
cp .env.example .env
# 依 .env.example 註解，用 openssl 產生每個 secret，全部替換成強隨機值（勿提交 .env）
```

### 4. 啟動 Trigger stack

```bash
docker compose --env-file .env up -d
```

### 5. 驗證

```bash
docker compose ps
docker network ls | grep -E 'lobster|trigger'
```

在瀏覽器開 **你的公開 URL**（例如 `https://trigger.aware-wave.com`，視 TLS 是否已上就緒）。

### 6. 與 `packages/workflows` 對齊

1. 在 Trigger dashboard **建立帳號與 project**。  
2. 把 **project ref** 寫入 `lobster-factory/packages/workflows/trigger.config.ts` 的 `project`。  
3. 把 **TRIGGER_SECRET_KEY**（或當版儀表板顯示的 deploy key）放進本機／CI／`secrets-vault`（**勿**進 git）。  
4. 依官方文件部署 workflows，例如（實際指令以官方為準）：

```bash
cd lobster-factory/packages/workflows
# 範例：指向自架 API
set TRIGGER_API_URL=https://trigger.aware-wave.com
npx trigger.dev@latest deploy
```

---

## Docker provider 的 network 名稱

`docker-compose.yml` 內 **`DOCKER_NETWORK: trigger_trigger-net`** 對應 **預設 project 目錄名為 `trigger`** 時 Compose 產生的 bridge 網路名。若你使用 **`docker compose -p 其他名字`** 啟動，請用 `docker network ls` 查出實際名稱並改 `.env` 或 compose，否則 worker 起 task 容器時會找不到網路。

---

## 相關檔案

| 檔案 | 用途 |
|------|------|
| `docker-compose.yml` | Postgres、Redis、Electric、webapp、docker-provider |
| `.env.example` | 必填變數範本 |
| `../hetzner-phase1-core/nginx/trigger.conf` | `server_name` + 反代 `trigger-webapp:3030` |
| `../hetzner-phase1-core/docker-compose.yml` | `lobster-net`、掛載 `trigger.conf` |
| `../../packages/workflows/trigger.config.ts` | CLI／dev 連線的 `triggerUrl` 與 `project` |

**治理入口（agency-os）**：`hetzner-stack-rollout-index.md`、`hetzner-self-host-start-here.md`、`github-actions-trigger-prod-deploy.md`（路徑以 `agency-os/docs/operations/` 為準）。
