# W2 資料表＋ingest route＋/ops/systems 頁（Opus 5.5）

先讀 `COMMON.md`、PLAN §2、§3、§6。App 根 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。

做：
1. `lobster-factory/packages/db/migrations/0174_systems_control_center.sql`＋`.down.sql`：`systems`、`system_phases`、`system_features`（定義投影，可 upsert）、`system_updates`（`event_key` unique；`system_id` 可空；append-only trigger 照 `0166_vendor_invoices.sql:31-38`）。四表 enable RLS 不建 policy＋`revoke all … from anon, authenticated`（照 `0166:29`）。索引：`system_updates(system_id, occurred_at desc)`、`(event_type)`。**只寫檔，不套。**
2. `app/api/internal/systems/ingest/route.ts`：Bearer `SYSTEMS_INGEST_TOKEN`，照 `app/api/internal/schedules/run-due/route.ts:37-40`（自己的 token、timingSafeEqual）。zod（或專案既有驗證方式）驗契約 2；body 上限 5MB；registry 投影 upsert＋events on conflict do nothing。
3. `lib/systems/projection.ts`：從事件算每系統狀態（status／priority 最新 status_change；接續卡＝最新有效 handoff，next 缺席沿用、blocker 只由 blocker_cleared 清）；功能狀態＝最新 feature_update／migration／review 投影；完成度＝verified ÷（非 cancelled 功能），無功能＝「尚未盤點」。純函式。
4. `app/(shell)/ops/systems/page.tsx`（總覽：卡片列表＋篩選按鈕，**不用下拉**）＋`[slug]/page.tsx`（概覽／功能／紀錄／接續卡）＋`error.tsx`。只用 globals 既有 class＋主題 token，零 hex。授權照 `app/(shell)/ops/system-modes/page.tsx` 的 owner／admin 判定；非授權 → 拒。頁面寫入只有 server action 寫 `status_change`／`review` 事件（source=user）。
5. 顯示最後成功 import_run 時間與 gaps 數。

測試（vitest，只寫這些）：projection 純函式（接續卡沿用／清除、完成度、尚未盤點、verified 只來自 review）；ingest 驗 token（無／錯 → 401）、重送同 event_key 不重複、壞 schema 400；頁面與 server action 對非 owner 拒（一次突變：拔守衛→紅→還原）。

檔案：上述路徑＋`lib/systems/`。側欄加入口若需改共用 nav 檔，只加一行並在 RISKS 註明。不碰 registry.json、匯入器。
