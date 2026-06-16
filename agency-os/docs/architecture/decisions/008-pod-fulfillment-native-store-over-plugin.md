# ADR 008: POD 履約走 Native store（不走 Printful WooCommerce 外掛）

- 狀態：已接受
- 日期：2026-06-16

## 脈絡

POD 履約有兩條路：(A) 客戶站裝官方 **Printful WooCommerce 外掛** → 連 platform store（外掛自動同步 + 出貨，綁 WooCommerce）；(B) **app 自建 native API store**（A1 一鍵建品 + A2 接 Woo 訂單建草稿，程式化集中控管）。

約束：① 會持續接更多 POD 客戶 ② 目前 WooCommerce，未來可能多平台（Shopify 等）③ app.aware-wave.com 是操作台、不賣東西。soulful 已用 A 路外掛且運作正常（platform store `18314943`）。2026-06-16 真實 SKU 實測證實 A2 打 native store `18324409` 對 platform-store SKU 全 miss（`502 Sync variant not found`，零草稿零金流）= 兩店兩機制衝突。

## 決策

**新 POD 客戶一律走 B（native store + app A1/A2），不裝 Printful 外掛；既有外掛客戶（soulful）不遷移。** 多平台以 adapter 模式擴充（見 `multi-platform-delivery-architecture.md`）。

## 後果

- 正面：一個後台管全部客戶；平台無關（換平台只補 adapter，履約共用）；集中控管出貨與對帳。
- 負面／代價：須自維護履約碼；真自動扣款送印需先建 confirm 步驟（🔴 金流紅線，未建）；A2 route 目前無 server log（觀察性待補）。
- 需跟進文件／腳本：
  - `docs/operations/POD_FULFILLMENT_PLAYBOOK_native-over-plugin.md`（SOP SSOT）
  - `docs/architecture/multi-platform-delivery-architecture.md`（adapter 總則）
  - `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/woo-order/route.ts`、`lib/studio/woo-webhook.ts`、`lib/studio/print-provider.ts`
  - `agency-os/WORKLOG.md` 2026-06-16 `ops(pod-a2)`
