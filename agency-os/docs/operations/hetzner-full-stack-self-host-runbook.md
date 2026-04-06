# Hetzner 全棧自託管 Runbook（Agency / Lobster 對齊版）

## 我能幫你做到哪裡、哪裡一定要你（或外包）動手

| 誰 | 能做什麼 |
|----|-----------|
| **本 repo / 助理** | 架構對齊、`MCP_TOOL_ROUTING_SPEC` 分工、分階段清單、`.env` 欄位規劃、與你現有腳本/治理文件的銜接說明 |
| **你或受權工程師** | Hetzner 開機、SSH、防火牆、DNS、TLS 憑證、所有 **secret** 的產生與存放、實際 `docker compose up`、還原演練 |
| **無法遠端代辦的原因** | 需要你的帳號憑證、網域、法遵邊界；誤設會導致資料外洩或生產事故，必須由責任人執行 |

## 單一索引（安裝順序 × 平面 × 倉庫連動）

- **主檔（牽一髮動全身）**：[**`hetzner-stack-rollout-index.md`**](hetzner-stack-rollout-index.md) — 第一階段 10 項／第二階段 4 項、Data／Execution／Delivery／Control／Infra 對照、**目前進度表**、與本 runbook／`hetzner-phase1-core` compose 的落點。修改堆疊定義或優先序時 **先改主檔**，再依 **`docs/CHANGE_IMPACT_MATRIX.md`** 該列同步。

---

## 目標堆疊（與規格一致）

1. **Supabase（自架）** — System of record（Postgres + Auth + Storage + API）；啟用 **pgvector**（RAG）。  
2. **Redis** — 佇列／鎖／快取；**Trigger.dev 自架**時幾乎必備。  
3. **物件儲存（S3 相容）** — 例如 **MinIO**；常與 Supabase Storage 或 artifact 備份搭配。  
4. **Trigger.dev（自架）** — 長流程、重試、核准等待。  
5. **n8n** — Webhook、通知、輕量同步（不取代控制面）。  
6. **WordPress** — 交付 runtime（建議 **staging / production** 分離）。  
7. **Nginx（或 Traefik / Caddy）** — 對外 TLS 與反代。  
8. **Node API** — RAG（檢索、組 context、呼叫模型）與複雜整合；程式需你方從 monorepo 部署策略帶上。  
9. **Embedding / LLM** — 雲端 API 或自架推理服務（視「資料是否出境」決定）。

**官方參考（以最新版為準，部署前請再對一次文件）：**

- Supabase 自架：<https://supabase.com/docs/guides/self-hosting>  
- Trigger.dev 自架：請自 Trigger 官方文件「Self-hosting」章節（版本變動快，連結以官網為準）。  
- n8n Docker：<https://docs.n8n.io/hosting/installation/docker/>  

---

## 建議分階段（降低一次爆掉風險）

### 階段 0 — 決策與邊界（1 次定案）

- [ ] 讀 **Phase 1 compose 長期營運**：`lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md`（RPO/RTO、映像釘選、還原與汰換）＋ **`MAINTENANCE_CALENDAR.md`**（週／月／季／年勾選）。  
- [ ] 資料是否必須留在自管機房（影響 **LLM / embedding 用雲端或自架**）。  
- [ ] 網域規劃：`api.`、`db.` 不建議對外公開管理埠；僅 `app.` / `n8n.` / `wp.` 等經由 **443**。  
- [ ] **備份 RPO/RTO**（Postgres + 物件儲存 + WordPress 檔案）。  
- [ ] Secret 存放：本機 vault / 1Password / Hetzner 不存明文於 repo（與 `docs/operations/security-secrets-policy.md` 對齊）。

### 階段 1 — Hetzner 主機與網路基礎

- [ ] 建立 VPS（建議生產與測試 **分機** 或至少 **分 compose 專案**）。  
- [ ] SSH key、停用密碼登入、`ufw`/雲防火牆只開 **22（限來源 IP）/ 80 / 443**。  
- [ ] 安裝 **Docker Engine + Compose plugin**。  
- [ ] DNS A/AAAA 指到主機；**Let’s Encrypt**（或 Hetzner 憑證流程）。

### 階段 2 — 核心資料層

- [ ] 部署 **Supabase 自架**（跟官方 docker-compose，勿自創精簡版上生產）。  
- [ ] Postgres 啟用擴充：**`vector`（pgvector）**。  
- [ ] 設定 **S3 相容儲存**（MinIO 或相容服務）供 Storage / 備份使用。  
- [ ] **每日自動備份** Postgres（加密、異地或第二區域）；**還原演練**至少做一次。

### 階段 3 — 編排層

- [ ] 部署 **Redis**（持久化與密碼/ACl 視官方建議）。  
- [ ] 部署 **Trigger.dev（自架）** 並接上同一 Postgres/Redis 依官方要求。  
- [ ] 部署 **n8n**（資料庫用 Postgres 獨立 schema 或獨立 DB；定期備份）。

### 階段 4 — 交付層（WordPress）

- [ ] Staging / Production **分資料庫或分 prefix**；禁止在 production 試外掛（與 playbook 一致）。  
- [ ] 反代與快取策略；**WP 檔案與 DB** 納入備份。

### 階段 5 — 應用與 RAG

- [ ] 部署 **Node API**（向量查詢、租戶隔離、呼叫 embedding/LLM）。  
- [ ] 表設計：`documents`、`chunks`、`embeddings`（維度與模型鎖版）；**RLS** 與服務角色分離。  
- [ ] 將 Trigger / n8n 的 webhook URL 改為你的正式網域與 **HTTPS**。

### 階段 6 — 觀測與放行

- [ ] 日誌匯集（至少主機 + 容器 stdout）、磁碟與 DB 連線監控。  
- [ ] 對照 `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`：**長流程走 Trigger、膠水走 n8n、狀態寫回 Supabase**。  
- [ ] 安全檢核：管理介面 **不對 0.0.0.0 開 admin**、JWT/KEY **輪替流程**。

---

## 環境變數心智模型（勿把真值貼進 repo）

以下僅為「要準備哪些類型的變數」，實際名稱以各產品官方 `.env.example` 為準：

- **Supabase**：`JWT_SECRET`、`ANON_KEY`、`SERVICE_ROLE_KEY`、Postgres 連線、Storage 的 S3 endpoint/KEY。  
- **Trigger**：與官方 self-host 模板一致之 DB、Redis、加密金鑰。  
- **n8n**：`N8N_ENCRYPTION_KEY`、DB URL、Webhook URL。  
- **MinIO**：`MINIO_ROOT_USER`、`MINIO_ROOT_PASSWORD`、bucket 名稱。  
- **WordPress**：DB、 salts、S3 offload（若使用）。  
- **Node API**：Supabase **service role** 或 **限定 RLS 的 server policy**（優先最小權限）、embedding API key。

詳見本目錄旁 `hetzner-self-host.env.example`（僅佔位符）。

---

## 與「長期專業」直接相關的禁忌

- 不要把 **Trigger 長流程** 改成只在 n8n 裡「拉長節點鏈」— 違反你們工具邊界。  
- 不要把 **WordPress** 當 SoR 寫審批狀態— 規格要求寫回 **Supabase**。  
- 不要在未做 **還原演練** 前對外宣告上線完成。

---

## 下一步（若你要我繼續在 repo 內具體化）

可再開議題（擇一即可）：  
1. 為 **Node API + pgvector** 補一份 **schema 草稿與 RAG API 契約**（不含密鑰）。  
2. 為 **租戶隔離** 對照 `agency-command-center-v1` 補 **RLS 檢查清單**。  
3. 與現有 **`scripts/system-health-check.ps1`** 對齊，增加「自架端點探測」範本（僅 dev/staging）。

---

## Related

- **`hetzner-stack-rollout-index.md`**（Phase A/B、平面、連動索引）  
- **Phase 1 compose（Nginx + Redis + n8n + WordPress + Node API + Next Admin，不含 Supabase）**：`lobster-factory/infra/hetzner-phase1-core/README.md`；**長期營運契約**：`lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md`；**維護日曆**：`lobster-factory/infra/hetzner-phase1-core/MAINTENANCE_CALENDAR.md`；**備份範例**：`lobster-factory/infra/hetzner-phase1-core/scripts/backup-phase1.sh`
- `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`  
- `agency-os/docs/operations/security-secrets-policy.md`  
- `agency-os/docs/operations/supabase-self-hosted-cutover-checklist.md`（Cloud → 自架或自架換機時）  
- `agency-os/docs/architecture/agency-command-center-v1.md`  

## Related Documents (Auto-Synced)
- `docs/operations/hetzner-stack-rollout-index.md`

_Last synced: 2026-04-06 07:34:04 UTC_

