# SF-G 建站步驟的共用骨架（步驟引擎＋API）

先讀：`COMMON-WP.md`、`SITE-FLOW-COMPLETION-PLAN.md` §0（I1–I6 全部）、§1-4、§2、§3 的 SF-G 列（`:136`）與 SF-B、SF-H、SF-I、SF-J 列（知道誰會接在你後面）。專案 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`（下稱 NA）。模型 Opus 5.5（完成後 `critic` Deep）。

## 目的
每個會動主機的建站步驟都走同一套：先給計畫、操作者確認才做、做完驗證、失敗還原、留紀錄。SF-H／SF-I 只填各步驟的內容，SF-J 只畫頁面；骨架在這張卡定死。

## 已知事實（第一批定下的）
- SF-B 已併入 main `4d504c0aa`：`NA/lib/site-flow/records.ts`（`ensureOrganization`、`ensureEnvironment`、`setEnvironmentStatus`）。環境列先以 `provisioning` 寫入，再標 `ready`／`failed`。
- migration `0175_site_flow.sql`（線4 分支 commit `441f1ea86`，尚未套用、尚未併入）：`environments` 的 `(site_id, environment_type)` 活列唯一索引；`ops_action_catalog` 七列 `site.preflight`、`site.create`、`site.wp_install`、`site.vhost`、`site.mainwp`、`site.bridge`、`site.open`，全部 `enabled=false`。你的程式以這七個 `action_key` 為準；測試用假 DB，不依賴它已套用。
- I6：`site.*` 不走 `NA/lib/ops-actions/record.ts` 的自動補列與「寫入失敗照做」。沒有 catalog 列就拒絕；`ops_action_runs` 寫不進去就不呼叫閘門。
- 主機端閘門動詞由 SF-E 做（線3，尚未完成）。本卡的 `gate-client.ts` 只定介面與轉接層，測試用假閘門；動詞名稱以 SITE-FLOW §1-3 為準。

## 要做
照 SITE-FLOW `:136` 的 SF-G 列，一項不少。另加第一批 RISKS 帶進來的兩項：
1. 中斷回收：步驟執行到一半程序死掉（03:00 自動部署重啟、OOM）時，`ops_action_runs` 會停在執行中、環境列停在 `provisioning`。骨架要能辨認「執行中但已超過該步驟的逾時」的 run，把它收尾成失敗（CAS，只收自己看到的那個狀態），之後同一步驟可以重新計畫、重跑。逾時值是每個步驟定義的一個欄位，不寫死在引擎。
2. 狀態由觀測算出：步驟「完成」只能由該步驟的觀測函式回答，不存布林。部分成功不得顯示為完成（SF-B 回報舊接口在 `.htaccess` 沒寫成功時仍標 ready）。

## 檔案
新：`NA/lib/site-flow/{types.ts, engine.ts, gate-client.ts}` 與 `__tests__`；`NA/app/api/ops/site-flow/[siteId]/route.ts`、`NA/app/api/ops/site-flow/[siteId]/[step]/route.ts`。不改 `records.ts` 的既有行為（要改先回報）；不改 `lib/ops-actions/record.ts`；不寫任何步驟的實作內容（SF-H、SF-I）；不做頁面（SF-J）。

## 驗收
- vitest（SITE-FLOW `:136` 點名的每一條都要有對應測試）：計畫雜湊不符 409；catalog 關 → 拒且留 run；沒有 catalog 列 → 拒，不自動補列；`ops_action_runs` 寫入失敗 → 假閘門的呼叫次數為 0；系統模式擋 → 留 run；verify 失敗 → 呼叫 rollback；非 owner／admin → 403；狀態全由觀測函式算出。
- 加：逾時的執行中 run 被收尾成失敗後可重跑；未逾時的不被動到；兩個請求同時收尾只有一個成功。
- 突變兩次（各一個守衛）：拿掉「沒有 catalog 列就拒絕」、拿掉「紀錄寫入失敗就不執行」→ 指名測試變紅 → 還原變綠。
- `npx tsc --noEmit` exit 0；`npx vitest run lib/site-flow app/api/ops/site-flow` 綠。

## 邊界
不套 migration、不連主機、不 push。commit 疊在 `origin/main` 上（不要疊在 `441f1ea86` 上：那個 commit 要等操作者同意才併入，你的程式必須在沒有它的 main 上型別檢查與測試都綠）。API 上線後按鈕由 catalog 擋著，所以本卡可以在 migration 套用後直接併入。
