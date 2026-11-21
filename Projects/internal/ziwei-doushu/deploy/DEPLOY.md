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

## 對外資料介面 v1
- `GET /api/v1/systems`：全部系統與輸入規格（欄位、範圍、繁中英文說明、範例）；`GET /api/v1/systems/{id}` 單一系統。
- `POST /api/v1/systems/{id}`，body `{ input, locale? }` → `{ apiVersion, system, data, context }`；只給確定性結果，不含 AI 解讀。
- 錯誤 `{ error, detail }`：400 輸入錯（逐項列出）、404 未知系統、429 限流（附 `Retry-After`）、500 計算失敗（不含內部細節）。
- 用到「今天」的系統（八字、每日運勢、合婚、易經、塔羅每日一牌、占星、吠陀）日期必填，伺服器不代填。
- 限流（`lib/http/rateLimit.ts`）：每來源位址每分鐘 v1 60 次、`/api/astrology*`與`/api/vedic` 合計 60 次、`/api/interpret` 10 次。來源位址只信 nginx 設的 `X-Real-IP`。計數在單一行程記憶體：多副本各算各的，重啟歸零。
- CORS：`/api/v1/*` 對任意來源開放 GET／POST／OPTIONS，不帶憑證。
- 沒有帳號、沒有計量；日後要收費時走 `can()`，與 oracle 的帳號卡一起做。
- 新增系統：實作 `DivinationSystem`（含 `input` 規格）並在 `lib/divination/index.ts` 註冊，REST 與文件自動出現。
- 部署煙霧測試含 `/api/v1/systems`（`sg-deploy.sh` oracle-web 段）。

## MCP 端點（AI 助理工具）
- 網址：`https://oracle.aware-wave.com/api/mcp`，MCP Streamable HTTP、無狀態、無需金鑰。在 Claude／ChatGPT 等加「自訂連接器／遠端 MCP 伺服器」填此網址即可。
- 工具：每個已註冊系統一個（名稱＝系統 id，參數＝ v1 的 `input` 欄位攤平＋選填 `locale`），外加 `list_systems`（各系統範例輸入）。工具與 JSON Schema 由 `lib/divination/input.ts` 的規格轉出（`lib/mcp/schema.ts`），新增系統自動出現。
- 回傳：`content` 一段事實純文字（`lib/mcp/text.ts`）＋ `structuredContent: { data, context }`；只給確定性結果，不含 AI 解讀。輸入錯誤回 `isError: true` 並逐項列出。
- 協定：手寫最小集合（`initialize`、`ping`、`tools/list`、`tools/call`），版本 2025-11-25／2025-06-18／2025-03-26；不開 SSE（GET／DELETE 回 405）；帶 `Origin` 必須同源，否則 403。
- 限流沿用 v1 額度（每來源每分鐘 60 次，另計 `mcp`）；body 上限同 v1。
- 部署煙霧測試 POST 一次 `initialize`（`sg-deploy.sh` oracle-web 段）。手動驗：
```bash
curl -s https://oracle.aware-wave.com/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 300
```

## 注意
- `NEXT_PUBLIC_*` 在 build 時內嵌；網域預設值在 `lib/site.ts`。
- 付費牆：`/api/interpret` 的 `premium` 回 402；`light`／`deep` 放行；每日次數計量未接。
- 歷史：2026-11-20 前在 `/opt/oracle` 以獨立 compose 執行（`deploy/DEPLOY-SG.md`、`deploy/oracle-deploy.sh` 見 git 歷史）。
