# Runbook: Postiz 社群發佈整合 — 日常維護與事件處置

> **Established**: 2026-06-22
> **SSOT**: `agency-os/docs/operations/POSTIZ_SOCIAL_PUBLISHING_PLAN.md`
> **Content engine SSOT**: `docs/wp-kadence-ai-seo-geo-content-engine.md §49`
> **Postiz UI**: `https://postiz.aware-wave.com` (admin: `awarewaveai@gmail.com`)
> **Infra（2026-08-31 更新）**: ks-aw-01 `145.239.195.47`（SSH `-p 58122`，`ubuntu@` + `sudo`）；port `127.0.0.1:4007`，public `https://postiz.aware-wave.com`。前任與舊 EU VPS 均已退場。
> **API key**: SG `/root/lobster-phase1/.env` → `POSTIZ_API_KEY`（64 chars），vault `POSTIZ_API_KEY`

---

## 1. 此 runbook 解什麼問題

| 場景 | 章節 |
|------|------|
| 哪個客戶的社群帳號連線狀態 | §2 連線狀態查看 |
| OAuth token 過期 → 整合顯示 disabled | §3 Token 過期重連 |
| 發文失敗：rate limit 429 | §4 Rate limit 處理 |
| POSTIZ_API_KEY 洩漏 / 需輪替 | §5 API Key 輪替 |
| Postiz 容器掛了 / 無回應 | §6 Postiz 服務故障 |
| 刪除測試草稿 / 清理 | §7 草稿清理 |
| 新增客戶社群帳號 | §8 新帳號 Onboard |

---

## 2. 連線狀態查看

### 2.1 快速健康 curl（從本機）

```bash
# 列出所有 Postiz 整合（disabled=true = token 過期或撤銷）
curl -s "https://postiz.aware-wave.com/api/public/v1/integrations" \
  -H "Authorization: $POSTIZ_API_KEY" | python3 -m json.tool
```

預期回應（正常）：
```json
[{ "id": "cmqe3jw960001p58nt0xohbi8", "name": "soulfulexpression.bsky.social",
   "identifier": "bluesky", "disabled": false, "profile": "soulfulexpression.bsky.social" }]
```

`disabled: true` → 見 §3。

### 2.2 看哪些客戶連接了哪些帳號（DB）

```bash
# 從 SG SSH 進去，用 Supabase REST 查
curl -s "https://supabase.aware-wave.com/rest/v1/social_postiz_connections?select=*" \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

或至 `app.aware-wave.com/ops/clients/[slug]` → **社群頻道** tab 查看。

連線以 org 為鍵（`client_id` = organizations.id）。內容工作室選的是 WordPress 站，route 用該站的 `wp_sites.organization_id` 找 org（`lib/content/social-org.ts`）；畫面顯示「此網站尚未綁定客戶組織」（HTTP 422）= 該站沒有 organization_id（env 設定的站一律如此）→ 在 DB 補上 organization_id 再試。

### 2.3 Admin UI

`app.aware-wave.com/ops/clients/[slug]` → 社群頻道 tab：
- 顯示所有 Postiz 整合（含 disabled 狀態）
- 可 connect / disconnect 客戶與整合的對應

---

## 3. Token 過期重連（OAuth integration disabled）

**症狀**：`/api/content/social-channels?clientId=xxx` 回傳 channel `status: "disabled"`；或發文時收到 401/403。

**根因**：各平台 OAuth refresh token 過期（週期：Instagram ≈ 60 天，Facebook ≈ 90 天，其他平台不等）。Bluesky App Password **不過期**，除非手動撤銷。

**處置步驟：**

1. 登入 `https://postiz.aware-wave.com`（email: `awarewaveai@gmail.com`）
2. 左側選單 **Settings → Integrations**
3. 找到顯示 ⚠️ 或 "Reconnect" 的整合 → 點 Reconnect → 重新授權 OAuth
4. 授權完成後，再次 curl `/public/v1/integrations` 確認 `disabled: false`
5. 如果是客戶帳號斷線，通知客戶提供新授權（或請客戶自行在 Postiz 重連）

**預防**：
- v2 待加：Trigger.dev 每週跑 `GET /integrations`，若有 `disabled: true` 發 Telegram 告警
- 目前：AO-RESUME 時手動 curl 確認（可加入 smoke check）

---

## 4. Rate Limit 處理

**Postiz API 限制**（實測 2026-06-22）：
```
x-ratelimit-limit: 30
x-ratelimit-reset: 3600 (秒)
```
即：每 60 分鐘最多 30 次 API call（含 upload + post）。

**單次發文消耗**：
- 無圖：1 call（POST /posts）
- 有圖：2 calls（POST /upload + POST /posts）
- 多平台（N 個 channel）：N × (1 or 2) calls（per-platform 串行）

**觸發 429 時**：
- `x-ratelimit-remaining` 降至 0 → 下一次呼叫回 429
- `route.ts` 的 `createSocialPost` 循環在 post 失敗時記錄 `status: "error"` + error 訊息回前端
- 前端 `postizPushResults` 顯示哪個 platform 被擋

**處置**：
1. 等 `x-ratelimit-reset` 秒數後重試（最多 60 分鐘）
2. 若急需：改用 Postiz UI 直接建貼文（不走 API）
3. v2 待加：backend queue + retry with exponential backoff

---

## 5. POSTIZ_API_KEY 輪替

**API Key 位置**：
- ks-aw-01：`/root/lobster-phase1/.env` → `POSTIZ_API_KEY`（next-admin compose 傳進容器；2026-10-15 前沒傳，next-admin 其實拿不到）
- Vault：`scripts/secrets-vault.ps1 -Action get -Name POSTIZ_API_KEY`（僅確認存在，輸出為遮罩；真值在本機 `mcp\user-env.ps1`）

**輪替步驟**：

```bash
# 1. 在 Postiz UI 產生新 key
# 登入 postiz.aware-wave.com → Settings → Developers → API Keys → Regenerate
# 複製新 key

# 2. 更新 ks-aw-01 .env
ssh -i ~/.ssh/id_ed25519 -p 58122 ubuntu@145.239.195.47
sudo -i
nano /root/lobster-phase1/.env
# 找 POSTIZ_API_KEY= → 貼新 key → 存檔

# 3. 重 build next-admin（讓新 key 進 container env），再確認容器裡真的是新 key 的開頭
/root/lobster-phase1/scripts/sg-deploy.sh next-admin
docker exec lobster-next-admin printenv POSTIZ_API_KEY | cut -c1-6
# 每日 backup-coverage 的 ids:postiz-integrations 列也會因 key 錯而 FAIL

# 4. 更新本機 vault
.\scripts\secrets-vault.ps1 -Action set -Name POSTIZ_API_KEY -Value '<新 key>'

# 5. 驗證
curl -si "https://postiz.aware-wave.com/api/public/v1/integrations" \
  -H "Authorization: <新 key>" | head -5
# 應回 HTTP/2 200
```

---

## 6. Postiz 服務故障

**症狀**：API 回 502 / 503 / 連線逾時。

**診斷（SSH ks-aw-01）**：
```bash
ssh -i ~/.ssh/id_ed25519 -p 58122 ubuntu@145.239.195.47
sudo -i

# 查容器狀態（postiz、temporal 有 healthcheck；healthy = 後端在聽、Temporal 的 namespace 已建）
cd /root/postiz
docker compose ps

# 查 log
docker compose logs --tail=50 postiz
docker compose logs --tail=50 temporal

# 重啟
docker compose restart postiz
```

**Postiz docker-compose 位置**：ks-aw-01 `/root/postiz/docker-compose.yml`；正本 repo `lobster-factory/infra/postiz/docker-compose.yml`。

**若重啟後仍 500**：
- 查 DB 連線（Postiz 使用獨立 `postiz` DB user，庫在 `supabase-db`）：`docker compose logs postiz | grep -i 'database\|connect\|error'`
- 後端起來但不送文：`docker exec postiz pm2 jlist`（backend／frontend／orchestrator 都要 online）；`docker exec temporal temporal task-queue describe --task-queue main --namespace default --address temporal:7233`（Pollers 下要有列）。

### 6.1 版本與升級（v2.25.1 起佇列是 Temporal）

- 只用 `lobster-factory/infra/postiz/upgrade-postiz.sh <repo 的 infra/postiz>` 改正在跑的 Postiz；先跑 `rehearse-postiz-upgrade.sh`（拋棄式副本：升級一次、強制回滾一次，兩次都要過；副本的 secret 全換、頻道停用、排隊貼文刪除，碰不到真帳號）。
- 正式機脫離 SSH 跑：`systemd-run --unit=postiz-upgrade --collect bash /root/Work/lobster-factory/infra/postiz/upgrade-postiz.sh /root/Work/lobster-factory/infra/postiz`，看 `/var/log/postiz-upgrade.log`。
- 腳本：一次只跑一個（flock）→ 有排隊中的貼文就不升（兩個方向都可能晚發或重發）→ compose 的 postiz 設定不准少或被改 → 先拉齊所有 image → 備份（compose、.env、dump `--create`、schema、頻道）→ 用新 image 的 Prisma 推 schema，資料遺失只准 `expected-data-loss.txt` 列的 → 套用 → 健康（Temporal＋搜尋屬性、worker 真的在 poll、missing-post workflow、pm2、帶 key 的 API、前端、頻道不變）→ 失敗就回滾（推過 schema 就還原資料庫；回滾中不理會中斷訊號），回滾也不健康 → exit 3＋endpoint-alert 告警。
- 開機：postiz 的 command 先等 Temporal 的 namespace（`postiz-boot/wait-for-temporal.js`）再啟動；開機檢查打 `/api/public/v1/is-connected`（401＝後端活著）。
- 換版本：先更新 `expected-data-loss.txt`（rehearsal 會印出新版本找到的清單），審過再跑。

**不可執行**：直接改 Postiz DB schema / 清空 posts table / 改 `.env` secrets（需 R0 審核）

---

## 7. 草稿清理

**刪除測試 draft（Postiz UI）**：
1. 登入 `https://postiz.aware-wave.com`
2. 左側 **Calendar** 或 **Posts** → 找 Draft
3. 點選 → Delete

**已知待清理**：
- `cmqo1wijz0005p58ncl1mtssr`（Gate C 測試 draft，2026-06-22）

**批量清理（API，謹慎使用）**：
```bash
# DELETE /public/v1/posts/:id（需確認正確 postId）
curl -X DELETE "https://postiz.aware-wave.com/api/public/v1/posts/cmqo1wijz0005p58ncl1mtssr" \
  -H "Authorization: $POSTIZ_API_KEY"
```

---

## 8. 新帳號 Onboard（新平台接入）

**前提**：平台 OAuth app 審核通過（Meta/LinkedIn/Reddit 需提交 → 見 Task 2，並行中）。

**步驟**：

1. **Postiz UI 連接新整合**：
   - 登入 `https://postiz.aware-wave.com` → Settings → Integrations → Add
   - 選平台 → OAuth 授權 → 完成
   - 記錄新整合的 `id`（curl `/public/v1/integrations` 取得）

2. **Admin UI 對應到客戶**：
   - `app.aware-wave.com/ops/clients/[slug]` → **社群頻道** tab
   - 點「連結」→ 選 Postiz 整合 → 儲存

3. **驗證**：
   - `GET /api/content/social-channels?clientId=<org_uuid>` 應回新 channel
   - ContentStudio → 載入帳號 → 確認出現

4. **Bluesky 特別**：使用 App Password（非 OAuth），在 Bluesky 設定 → App Passwords 產生，填入 Postiz Bluesky 連接表單。

5. **Facebook 粉專屬於另一個 FB 帳號**（例：Soulful 粉專在 Pei Huang 帳號，Postiz 只在另一個瀏覽器登入）：
   - 前提：該 FB 帳號是 Meta App `2998470257172880` 的管理員（`developers.facebook.com/apps/2998470257172880/roles/roles/` 狀態不能是「待確認」）。development mode 下非 app 角色的帳號授權不了。
   - 只要 state 存在 Redis 就能連，跟哪個瀏覽器發起無關：`connectSocialMedia` 只查 `login:<state>`（TTL 300 秒），code 換 token 不驗 state。
   - 做法：已登入 Postiz 的瀏覽器 `fetch('/api/integrations/social/facebook')` 產生 state → 主機 `redis-cli --scan --pattern 'login:*'` 找最新的 → 在粉專擁有者的瀏覽器開 `https://www.facebook.com/v20.0/dialog/oauth?client_id=…&redirect_uri=<encoded …/integrations/social/facebook>&state=<state>&scope=<facebook.provider.js 的 scopes>` → 一路繼續。callback 會被導到 `/auth`（未登入，不會消耗 code）→ 從主機 `/var/log/nginx/` grep `integrations/social/facebook?code` 取 code → 在已登入 Postiz 的瀏覽器開 `/integrations/social/facebook?code=<code>&state=<state>` → 選粉專 → Save。
   - state 過期就重新 fetch 一個，code 用新 state 帶過去即可（code 約 10 分鐘內有效、只能用一次）。
   - 驗證：`GET /public/v1/integrations` 出現該粉專且 `disabled:false`，再寫 `social_postiz_connections`。

---

## 9. 監控（現況與 v2 計畫）

### 現況（v1，人工）
- AO-RESUME 時可 curl `GET /integrations` 確認無 disabled
- 發文失敗在 ContentStudio UI 顯示 per-channel status

### v2 計畫（待實作）
- Trigger.dev 每週跑整合健康 check → Telegram 告警
- `x-ratelimit-remaining` 低於 5 時 server log warning
- 連線狀態寫入 `social_postiz_connections.status`（改為動態，目前固定 `'connected'`）

---

## 10. 快速指令速查

```bash
# 健康 check
curl -s "https://postiz.aware-wave.com/api/public/v1/integrations" -H "Authorization: $POSTIZ_API_KEY"

# 查客戶連線（本機 Supabase）
curl -s "https://supabase.aware-wave.com/rest/v1/social_postiz_connections" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" | python3 -m json.tool

# SSH ks-aw-01 查 Postiz container
ssh -i ~/.ssh/id_ed25519 -p 58122 ubuntu@145.239.195.47 "sudo sh -lc 'cd /root/postiz && docker compose ps'"

# 從 vault 取 key（確認存在）
.\scripts\secrets-vault.ps1 -Action get -Name POSTIZ_API_KEY   # 輸出為遮罩，僅供確認存在；真值在 mcp\user-env.ps1
```

---

_建立：2026-06-22（Task 6 — POSTIZ_SOCIAL_PUBLISHING_PLAN.md Task 6）_
