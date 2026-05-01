# Singapore Phase1 VPS — Docker 實際分工（單一正文）

**Host**：`wordpress-ubuntu-4gb-sin-1`（`5.223.93.113`）。  
**目的**：避免「同一個 repo compose」在 SG 被誤解成單一 `docker compose up` 全起，或誤刪 **EU DNS**（`204.168.175.41`）記錄。

## 與 EU 的邊界（DNS）

| IP | 角色 |
|----|------|
| **SG `5.223.93.113`** | **apex WordPress**、`www`、`api`、`app`（對外行銷站 + `node-api` + `next-admin`） |
| **EU `204.168.175.41`** | **`supabase`、`studio`、`n8n`、`trigger`、`uptime`** 等平台／自動化／觀測入口 |

Cloudflare **勿刪除**指向 EU 的 A 記錄（會直接打斷平台）。詳見 **`CLOUDFLARE_HETZNER_PHASE1.md`**、`SERVICE_CREDENTIALS_MAP.md`。

## SG 上「雙目錄」由來（營運現況）

部分部署曾將同一套 compose **拆成兩個 docker compose project**，以避免容器名稱衝突並分段維護：

| 目錄（例） | Project 名稱（例） | 典型容器 |
|-----------|-------------------|----------|
| `/root/lobster-phase1/` | `lobster-phase1` | `lobster-nginx`、`lobster-redis`、`lobster-node-api`、`lobster-wordpress-db` |
| `/root/Work/lobster-factory/infra/hetzner-phase1-core/` | `hetzner-phase1-core` | `lobster-wordpress`、`lobster-next-admin` |

兩者共用 **`lobster-net`**（external bridge），因此 **`wordpress-db`** 與 **`wordpress`** 仍可互相解析。

**禁忌**：在任一目錄對「完整版」`docker-compose.yml` 盲目執行 `docker compose up -d`（未指定服務／未讀 runbook），可能造成 **重複建立同名容器／volume**。

## n8n／staging／observability（SG 應卸載）

- **n8n**：對外公開 **`https://n8n.aware-wave.com`** 以 **EU** 為準時，SG **不要**長跑第二套 n8n。repo 內 **`lobster-factory/infra/hetzner-phase1-core/docker-compose.yml`** 已將 **`n8n` 標為 profile `local-n8n`**；Work 樹上的 compose 亦應同步（可用 **`scripts/patch-compose-n8n-profile.py`**）。
- **staging compose**：若已不再需要 SG staging，應 **`docker compose … down -v`** 並將 `docker-compose.staging.yml` **更名封存**，避免誤啟。
- **Loki／Grafana／Promtail**：若改以 Netdata Cloud／EU 工具為主，可在 SG **`docker compose -f docker-compose.observability.yml down -v`**；若仍要保留本機 log stack，請另開維護 Owner（勿與本檔雙寫長操作）。

## 長期收斂（建議）

目標應為 **單一目錄、單一 compose project**（或 **profiles** 明確），消除雙目錄分叉；在此之前，任何變更前先 **`docker compose ls`**、**`docker ps`**，並在 **`WORKLOG`** 留一句驗證方式。

## Related

- `lobster-factory/infra/hetzner-phase1-core/README.md`
- **Trigger workflow CLI deploy（registry、EU SSH、筆電 tunnel）**：操作正文單一 Owner → [`../../../lobster-factory/infra/trigger/README.md`](../../../lobster-factory/infra/trigger/README.md)（此檔不複製指令，避免漂移）。
- `mcp/SERVICE_CREDENTIALS_MAP.md`
- `agency-os/docs/operations/CLOUDFLARE_HETZNER_PHASE1.md`
