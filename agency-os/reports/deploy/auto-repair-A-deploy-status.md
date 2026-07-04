# Auto-Repair A 升級 — 部署狀態與一次性動作

> 建立：2026-07-04 · 對象：任何要確認「這批改動上線了沒」的人（含未來的 AI session）
> 範圍：commits `e3a8320`（A1/A3/A2 主體）+ `d9c452e`（db-expert 折入）+ `56ee8de`（critic 折入），皆在 `main`。

## TL;DR

- **程式碼部署 = 全自動，你不用做任何事。** SG 主機每 4 小時自動偵測 `main` 變更並部署（含測試/健康檢查/smoke/自動回滾），完成後 Telegram 通知。
- **唯一一次性人工動作 = 在 EU Supabase apply migration `0058`。** 不做也不會壞（app fail-open），只是 storm 關聯功能不啟動。
- **自動修復執行器預設全關**，要開再設兩個 env。

---

## 1. 程式碼部署（自動，無需動作）

機制：`lobster-factory/infra/hetzner-phase1-core/scripts/auto-deploy-next-admin.sh`
- SG cron：`0 3,7,11,15,19,23 * * *`（UTC，每 4 小時）
- 偵測 `origin/main` 對 next-admin / nginx / docker-compose 的 drift
- 有 drift → 跑 `sg-deploy.sh next-admin`：`npm test` gate → docker healthcheck → HTTP smoke → **smoke 失敗自動 `rollback-phase1.sh restore`**
- 結果 POST `/api/webhooks/deploy` + Slack + Telegram（成功/失敗都通知）

**驗收方式**：下一個整點 tick 後看 Telegram 是否收到「✅ 後台自動部署成功 — SG next-admin」。
或到 `/ops/repairs` 待處理佇列看是否出現 `deploy` 來源的成功事件。

手動覆寫（僅在自動部署失敗、Telegram 收到 ❌ 時才需要，通常不用）：
```bash
ssh root@5.223.93.113 "cd /root/lobster-phase1 && ./scripts/sg-deploy.sh next-admin"
```

## 2. DB migration（一次性人工，刻意不自動）

為什麼人工：自動對 prod DB 跑 migration 是 AGENTS.md 紅線（最高風險）。

| migration | 需要手動 apply？ | 不 apply 的後果 |
|---|---|---|
| `0057_seed_wp_maintenance_action.sql` | 否（route self-seed 備援，首次跑 wp-update 自動補 catalog row） | 無 |
| `0058_ops_incidents_parent_incident.sql` | **是** | storm 關聯靜默不啟動（app fail-open，不報錯、不掉事故） |

`0058` apply（在能連 EU Supabase 的機器上，用 Postgres owner 連線）：
```bash
psql "$EU_SUPABASE_DB_URL" -f lobster-factory/packages/db/migrations/0058_ops_incidents_parent_incident.sql
```
內含 `NOTIFY pgrst, 'reload schema';` 與 `lock_timeout=3s` 守衛——apply 後 PostgREST 立即看到新欄位，且不會卡住 ingest。
回滾：`lobster-factory/packages/db/scripts/0058_ops_incidents_parent_incident_down.sql`（soft-drop，含 cache reload）。

## 3. 自動修復執行器（預設 OFF，要開再設）

A2 的容器自癒**預設完全不動作**。確認要啟用時，在 SG next-admin env 設：
```
AUTO_REMEDIATE_ENABLED=true
AUTO_REMEDIATE_SERVICE_WHITELIST=next-admin        # 逗號分隔的 compose service 名；空白 = 全不動
```
安全設計：即使開了，也只會對「白名單內 + precheck 實證 unhealthy + 30 分鐘冷卻未觸發」的 SG 平台容器做單次 `docker compose restart`，失敗留人工，不重複盲踢。

---

## 尚未自動化的邊界（未來的自動化前沿）

`0058` 的人工 apply 是目前唯一的手動環節。要讓它也自動，需要一套「安全的 migration 自動套用」設計——僅限**新增/冪等**類 migration 自動跑、破壞性 migration 一律擋——這本身是 High-risk 專案，需獨立 R0 提案 + 明示批准後才動工，不在本批範圍。
