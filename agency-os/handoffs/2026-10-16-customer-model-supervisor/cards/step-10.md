# 第 10 項：客戶工作區——「我的產品」帶去買，「我的作品」每個門都看得到全部

**風險** Medium（客戶 UI、登記表）　**模型** 設計 Fable 5.1 已定；實作 Opus 5.5／`fullstack-engineer`　**前置** 第 8 項、8dc69f8ed（launcher 改 `heldDoors`）　**正本** ADR 018 §2 rule 3（door.nav）

## Decision（Fable 2026-10-30；操作者「你做決定」）
- 工作區＝portal `app/portal/launcher/page.tsx`，不進 WordPress（作品與權利都在 app DB，WP 讀不到；兩份清單＝兩個真相）。WP「我的帳號」只放入口（第 11 項，等 aware-wave-store 1.3.0 落地後做，避免同檔兩個 writer）。
- 不變量：「客戶看到的作品」只有一條路＝`DesignsGallery`（`app/(shell)/tools/designs/DesignsGallery.tsx`）＋ `/api/tools/designs`（`effectiveOrgId` 隔離，`app/api/tools/designs/route.ts:406`；PLATFORM_API，每個門可達 `lib/portal/doors.ts:56`）。design／studio／tarot／video 的成品全在 `media_assets`（`0011_ops_console_control_plane.sql:37` `organization_id not null`），所以同一元件四個門共用；不建聚合表、不另寫清單 API。
- 門上有沒有「我的作品」由登記表 `door.nav` 說（`staff: "tools/designs"`）；launcher 用既有 `doorHref(nav, "/tools/designs")`（`app/DoorContext.tsx`）推出連結。零新欄位。
- 尚未開通的卡片給「去了解」→ 商店（`lib/portal/hosts.ts` 新 `shopUrl()`＝`SHOP_URL` 或 `https://<baseDomain>/shop/`；`/shop/` 200 見 WORKLOG 2026-10-29 續15）。不做「申請試用」流程：試用＝員工贈送（第 4b-10 項），商店頁負責引導。
- 不做：social（貼文在 `social_posts`，門內行事曆／清單已是它的作品頁）、content（草稿＝門首頁 drafts 分頁，`ContentStudio.tsx:216`）不加頁；不改 `DesignsGallery` 的資料與篩選；不動 `MyAccountDoors.php`。

## Files
1. `lib/portal/products.ts`：studio／tarot／video 加 `door.nav`：`[{ path: "", name: <工作台名>, staff: "tools/<studio|tarot|video>" }, { path: "works", name: "我的作品", staff: "tools/designs" }]`（design 門已有 `""→tools/designs`，不動）。
2. 新 `app/studio/works/page.tsx`、`app/tarot/works/page.tsx`、`app/video/works/page.tsx`：`export const metadata = { title: "我的作品" }`，渲染 `<DesignsGallery />`；video 傳 `initialTab="videos"`。
3. `DesignsGallery.tsx:259,263`：加 `{ initialTab = "designs" }: { initialTab?: ActiveTab }`，`useState<ActiveTab>(initialTab)`。只此一處。
4. `app/(shell)/tools/studio/StudioWorkbench.tsx:1630,1833`：「查看 My Designs」由 `!onDoor` 改 `useDoorHref("/tools/designs")`（門上→`/works`，員工頁不變；`canvasHref` 已是此模式 `:392`）。`onDoor` 若無其他用途則刪。
5. `lib/portal/hosts.ts`：`shopUrl(env)`。
6. `app/portal/launcher/page.tsx`：卡片按鈕——已開通：`開啟`＋（`doorHref(door.nav ?? [], "/tools/designs")` 非 null 時）`我的作品`→`https://<productHost>/<path>`；尚未開通：`去了解`→`shopUrl()`；即將推出／讀取失敗：照 8dc69f8ed。說明句改「還沒買的產品可按「去了解」」。
7. `app/portal/launcher/__tests__/page.test.tsx`：tarot held → 含 `https://tarot.<base>/works` 的「我的作品」連結；content held → 無「我的作品」；content not held → `去了解` 指 shopUrl；讀取失敗 → 無任何 `href`。

## Acceptance
- `npx tsc --noEmit` 0；`npx vitest run lib/portal app/portal "app/(shell)/tools/designs" "app/(shell)/tools/studio"` 綠（`lib/portal/__tests__/products.test.ts:64` 自動驗三個 `works/page.tsx` 存在且 staff 頁對應）。
- 突變：拿掉 products.ts tarot 的 works nav → launcher 測試「我的作品」紅；還原綠。
- 真資料：暫時測試以 prod entitlements 畫 launcher（照 WORKLOG 2026-10-30 續11 做法，跑完即刪）：E2E-Verify 塔羅卡有「開啟」＋「我的作品」、內容行銷卡「去了解」。
- 上線後（03:00 自動部署）操作者用客戶帳號看 `studio.aware-wave.com/works`、`tarot…/works`、`video…/works`（影片分頁在前）；studio 工作台存檔後出現「查看 My Designs」連到 `/works`。

## Rollback
- revert 本 commit；無 DB、無 nginx 改動（`/works` 走既有門 rewrite `routeOnProductDoor`）。
