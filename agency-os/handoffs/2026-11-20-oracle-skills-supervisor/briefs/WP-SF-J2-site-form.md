# SF-J2 建站表單補強與登記的唯一性

先讀：`COMMON-WP.md`、`SITE-FLOW-COMPLETION-PLAN.md` §1-4、§2。`NA`＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin`。整檔讀：`NA/lib/site-flow/{create-site,records,page-model}.ts`、`NA/app/api/ops/site-flow/route.ts`、`NA/app/(shell)/ops/sites/new/NewSiteForm.tsx`、`NA/lib/site-flow/steps/{shared,bridge}.ts`、`NA/app/api/ops/clients/` 下憑證相關的兩支 route（`credentials/route.ts`、`credentials/secret/route.ts`）、migration `lobster-factory/packages/db/migrations/0176_site_flow.sql`（照它的寫法）。模型 Opus 5.5＋`db-expert` 審 migration（完成後 `critic` 一輪）。

## 目的
三件第三批 RISKS，同一類問題：建站流程寫下的登記資料，現在可能被重複建立、被別的畫面改掉、或被同時寫入蓋掉。不變量：(1) 一個主機網站代號只對應一筆有效環境；(2) 建站流程產生的金鑰紀錄只能由建站流程改；(3) 環境的 `metadata` 不因並發寫入而丟欄位。

## 要做
1. 表單：用看得到的按鈕選「新客戶」或「既有客戶」。選既有客戶時用搜尋框找客戶（沿用既有的客戶搜尋 API 與元件，不用下拉），新網站掛在該客戶底下；選新客戶維持現在的行為。既有客戶的任何設定不被改動（舊資料測試）。SF-J 為避免誤併把「同名就併入」拿掉了，這張卡用明確選擇補回「替既有客戶加網站」。
2. 唯一性：migration（下一個空號，動手前先 `git ls-tree origin/main` 查最大號；只寫檔不套用，up 與 down 兩檔，獨立一個 commit）對 `environments` 加「有效列的 `metadata->>'host_slug'` 唯一」的部分唯一索引；up 先檢查現有資料沒有重複，有就拒絕。程式端：`create-site.ts` 遇到唯一性衝突（23505）時讀回既有列當作同一筆，不回 500；`ensureSite`、`ensureProject` 並發時同理。
3. 金鑰紀錄：建站流程產生的 `client_credentials` 列要能辨認來源（照 SF-I 實際寫入的欄位判斷，先讀 `steps/bridge.ts`）；客戶頁憑證分頁對這類列顯示「由建站流程管理」，兩支 route 拒絕修改與刪除（明確錯誤訊息），其他列行為不變。
4. `records.ts` 的 `ensureEnvironment` 寫 `metadata` 改成和 `steps/shared.ts` 同一種比對 `updated_at` 的寫法（抽成共用函式，兩處都用它，不各寫一份）。

## 驗收
- vitest：既有客戶加第二個網站成功且客戶設定不變；同一個網址並發送兩次只產生一筆；建站流程的金鑰列改不動、刪不掉，一般列照舊；並發寫 metadata 不丟 `bridge` 與 `host_slug`。
- 突變兩次：拿掉憑證 route 的來源檢查、把 metadata 寫入改回直接覆寫 → 指名測試變紅 → 還原變綠。
- migration：拋棄式 Postgres 跑 up → down → up；有重複資料時 up 拒絕；`db-expert` 審過。
- Playwright `--project sites`：新增一條「選既有客戶」的流程；既有 7 條仍過。
- `npx tsc --noEmit`；全套 `npx vitest run`。

## 邊界
兩個 commit：① 程式與測試（在沒有新索引的資料庫上也正確：先查再寫＋衝突讀回）；② 只有 migration 兩檔（監工在操作者同意後套用再併入）。不套 migration、不連主機、不 push。
