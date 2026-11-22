# W9 「立即更新」「新增系統」後端（Opus 5.5）

先讀 `COMMON.md`（契約 3）、PLAN §2／§6（隔離不變量）。App 根 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。操作者 2026-11-22 決定兩顆按鈕都做。

做：
1. `lobster-factory/packages/db/migrations/0175_systems_user_requests.sql`＋`.down.sql`：只改 `system_updates.event_type` 的 check，加 `refresh_request`、`system_proposed`。照 0174 慣例（lock_timeout、ledger 由 apply 腳本寫）。down 在有這兩種列時拒絕。**只寫檔不套**。
2. `lib/systems/contract.ts`：使用者事件型別加這兩種與 payload 驗證；`store.ts` 加 `requestRefresh`、`proposeSystem`、`readPending`（契約 3）。投影忽略這兩種（不影響任何系統狀態）。
3. `app/api/internal/systems/pending/route.ts`：GET，Bearer token 照 ingest route 同寫法（timingSafeEqual、token 未設全拒）；回契約 3 JSON。
4. 匯入器 `scripts/systems-import.py` 加 `--if-requested`：先 GET pending，`refresh` 為 false 就印一行 exit 0（不 fetch git）；true 才照常匯入（最後一批的 import_run 自然讓 pending 變 false）。網路錯誤＝exit 1、不動 state。
5. `cron.d/systems-import` 加一行 `*/5 * * * *`，job key `systems_import_requested`，命令 `python3 …/systems-import.py --if-requested`（04:30 那行不動）；同一把鎖，所以兩行不會同時跑。`lib/schedules/host-jobs.ts` 補這個 key。
6. 待登記交給 agent：照 `scripts/check-capacity-health.ps1` 的模式寫 `scripts/check-systems-proposals.ps1`：ssh 唯讀查 pending 的 proposals（照 `scripts/apply-db-migration.mjs` 的 ubuntu＋sudo docker exec psql 路徑，60 秒 timeout）→ `agency-os/reports/status/systems-proposals-LATEST.json`；非空時接進 `scripts/lib/smoke-status-digest.ps1` 的 blockers，一行「/ops/systems 有 N 個待登記系統：<名稱…>，請寫進 agency-os/systems/registry.json」。查詢失敗＝blind spot，不是 blocker。照 capacity 怎麼被 AO-RESUME 呼叫就怎麼接。
7. 測試（只寫這些）：contract 兩種 payload 驗證；`readPending` 的 refresh 判定（比最新 import_run 新才算）與 proposals 名稱比對；pending route 無／錯 token 401；匯入器 `--if-requested` 在 false 時不碰 git、true 時照常；digest 對非空 proposals 產 blocker。跑 next-admin 全套 vitest、tsc、匯入器測試、`bash scripts/test-hooks.sh`（若 digest 屬閘相關）皆綠。

檔案：上述路徑。不碰頁面 UI（W10）、registry.json。
