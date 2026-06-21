# PLAN — POD 每色 Printful 官方 mockup + WooCommerce 變體圖 + 顏色色塊

> **接續規格**(2026-06-20)。修正方向:操作者要的是 **Printful 標準**——商品頁顏色**色塊**,點下去**衣服+模特整個換成該色**(每色一套 Printful 官方 mockup),不是自製 AI 平拍。
>
> **取代**:Phase 2-3 的自製 AI 批次合成(`batch-mockup.ts` + runAll genMockup,已部署 a383ed73 但方向錯)。**已上線的 Phase 0-1b 多款多色 hex 對接不變**(那是對的)。
>
> **關鍵**:所需後端**系統全齊,不用改 wp-bridge plugin**。

## §1 為什麼這是對的方向(操作者原話)

> 「有外掛會出現顏色色塊選項,點選色塊,衣服的顏色會變色,模特也是,Printful 就是這樣」

= Printful Mockup Generator 對**每個顏色 variant** 生官方 mockup(faithful 真實該色衣服 + 真模特),設成 WooCommerce 該色的**變體圖**;顏色 attribute 顯示**色塊**,點選 → WooCommerce 內建換主圖。

## §2 系統已有的(全部驗證過,file:line)

| 能力 | 現況 | 證據 |
|---|---|---|
| Printful 每色官方 mockup | `generateMockupBySpec(設計圖, {productId, variantId, …})` → mockups (Flat/Lifestyle 真模特/Ghost) | `lib/studio/printful-mockup.ts:365` |
| mockup route variantId override | `POST /api/tools/studio/mockup` 接 `variantId`(覆寫 catalog 預設)→ 生**指定顏色**的 mockup | `app/api/tools/studio/mockup/route.ts:83` |
| 每色 catalog variant_id | Phase 1b hex 對接已對好(`getCatalogVariants(productId, [hex])` 回每色 variant) | `print-provider.ts` getCatalogVariants |
| **WooCommerce 變體圖** | ProductCreator `variations[].image` → `WC_Product_Variation::set_image_id` | `ProductCreator.php:459-468` |
| 選色換主圖 | WooCommerce 內建(變體有 image → 選該變體自動換主圖) | WC core |

## §3 缺口(要做的,全在 next-admin,**不碰 plugin**)

| # | 缺口 | 改哪 |
|---|---|---|
| G1 | mockup route 用 **hex** 找每色 variantId(現在只接 white/grey/black 或顯式 variantId) | `mockup/route.ts`:加 `colorHex?`,內部 `getCatalogVariants(productId,[hex])` → 該色 M variant → override variantId |
| G2 | runAll:**每色**呼叫 mockup route(逐色,各 <120s)拿每色 mockup URL(取 Flat 或 Lifestyle view) | `PublishWizard.tsx` runAll:取代 genMockup 自製 AI 段 |
| G3 | create payload **每色變體帶 image** | `pod-product.ts` `buildPodProductPayload`:`variations[].image = colorMockups[printfulColor]`;入參加 `colorMockups: Record<printfulColor, url>` |
| G4 | route create 把每色 mockup map 傳進 buildPodProductPayload | `route.ts` create action |
| G5 | gallery 也放每色 mockup(商品頁 gallery 顯示每色 + 模特) | runAll gallery 組裝 |

## §4 客戶站前端(操作者一次性設定,非 code)

**顏色色塊(swatch)** = WooCommerce 前端顯示方式,需主題/外掛:
- Kadence 主題:內建 variation swatches(WooCommerce → 商品 → 屬性 → Color 設為 swatch + 填 hex)
- 或裝 **Variation Swatches** 外掛(免費),Color attribute 每個 term 設 hex 色塊
- 設好後:商品頁 Color 顯示色塊,點選 → WooCommerce 換成該色變體圖(§3 G3 設的)

> 變體圖換主圖是 WC **內建**;色塊只是把下拉換成色塊顯示。先有變體圖(G3),色塊是錦上添花。

## §5 實作順序(每步獨立可驗)

1. **G1** mockup route 加 colorHex → REALTEST:對 3 款各色 hex 打 route,確認回該色 mockup(Printful CDN URL)
2. **G3** pod-product variations[].image → vitest:colorMockups map → 每色變體帶對應 image
3. **G2+G4+G5** runAll 每色 mockup + create 傳 map + gallery → tsc + critic
4. 真機:一鍵 → 3 款各色 Printful mockup + Woo 變體圖 + draft
5. 客戶站:設 Color swatch(§4)+ 真機選色換圖驗證
6. sg-deploy + wp-bridge **不用發版**(variation image 既有)

## §6 清理(自製 AI 那版)

- `batch-mockup.ts` + `batch-mockup.test.ts`:保留(mockup 工具未來自製任意色可用)或刪(YAGNI)— 由實作者決定
- `mockup-prompt.ts` `color: GarmentColor → string` 擴展:保留(向後相容 + 自製任意色)
- runAll 的 genMockup(自製 AI):**換成** §3 的每色 Printful mockup
- 金流紅線不變:止於 draft

## §7 風險

| 風險 | 緩解 |
|---|---|
| 每色 mockup 4 色 × ~30-60s = 2-4 分鐘/款 | 逐色 client 呼叫(各 <120s route 限);progress n/4;失敗該色 fallback 設計圖 |
| 綠/海軍藍 variant 不在 mockup generator 支援列 | G1 REALTEST 逐色驗;不支援的色 fallback(該色用白底 mockup 或設計圖) |
| Printful mockup 是制式樣式(非自製 AI 模特) | 這正是操作者要的(Printful 官方 faithful);自製 AI 工具仍在(手動補) |
| 客戶站沒裝 swatch 外掛 | 變體圖仍可用(WC 下拉選色換圖);色塊是顯示升級,§4 說明 |
