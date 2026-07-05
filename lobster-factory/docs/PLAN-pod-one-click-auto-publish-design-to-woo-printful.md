# PLAN — POD 一鍵自動上架:設計圖 → Woo + Printful(多款 T-shirt × 多色全自動)

> **一句話**:操作者**只做設計圖**,按**一個按鈕**,系統自動 ①合成全部商品圖(白背/模特/平拍,分長短袖)→ ②壓 <100KB 進圖庫 → ③建好 WooCommerce 草稿商品(**3 款 T-shirt × 各 4 色 × 5 尺寸**)→ ④AI 文案 → ⑤Printful 建品綁定設計稿待履約。**終點 = WP draft**,人工 review 後按 publish 開賣。
>
> **狀態**:規劃中 · **建立** 2026-06-20 · **SSOT**:本檔
> **前置研究**:已完成(三款 Printful 資料、對接機制、現況盤點皆實機查證,見 §2 / §9 / §10)
> **相關**:今日已修的 publish 選圖器(WORKLOG 2026-06-20 `fix(publish)`)、A1 native 建品、`PLAN-tarot-pod-image-output-pipeline-plus.md`

---

## §0 TL;DR + 終極流程

```
操作者:畫一張設計圖(png)
   │
   ▼ 按「🚀 一鍵上架」
┌─────────────────────────────────────────────────────────────┐
│ 系統全自動:                                                   │
│ 1. 印刷檔(upscale 設計圖 → R2 png,履約用)                     │
│ 2. 批次合成商品圖(全部 <100KB,存 My Designs):                │
│      · 白背商品圖 ×1   (featured 主圖)                         │
│      · 模特穿衣圖 ×2   (短袖款用短袖模特;長袖款用長袖模特)     │
│      · 帶道具平拍 ×1                                           │
│      (設計圖原稿本身也可當 gallery 一張)                       │
│ 3. AI 文案(SEO/RankMath)                                      │
│ 4. 對每一款 T-shirt(3 款)各建 1 個 Woo 草稿商品:              │
│      featured + gallery 順序、4 色 × 5 尺寸 = 20 變體/款       │
│ 5. 對每一款在 Printful native 建品:                           │
│      每色用 hex 對到 catalog variant_id、傳同一張設計稿 png    │
└─────────────────────────────────────────────────────────────┘
   │
   ▼
產出:3 個 WP 草稿商品(圖文齊全、Printful 履約已綁)
   │
   ▼ 操作者最後一關
後台 review 一眼 → 按 publish 開賣(✋ 開賣 + 扣款送印是人工,金流紅線)
```

**做得到嗎?做得到。** 6 步骨架(印刷檔→商品圖→平拍→文案→Woo→Printful)的串接器 `runAll` **已經存在**([PublishWizard.tsx:392](../infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/publish/PublishWizard.tsx))。本 plan = 把它從「單款 + 2 張普通圖」升級成「多款 + 批次精緻 mockup + hex 多色對接」。

---

## §1 願景與使用者目標

- **操作者心智模型**:我只負責「設計」(畫圖案),其餘交給系統。一鍵 = 一個可上架的商品草稿。
- **不要**:手動切 tab 生模特圖、手動存圖、手動跨頁挑圖、手動對接 Printful 型號、手動傳設計稿。
- **可接受**:最後在 WP 後台 review 一眼(換掉偶爾的爛 AI 圖)再開賣 —— 這是品質與金流的安全網,不是負擔。

---

## §2 現況盤點(已有什麼 — 全部實機/讀碼驗證)

| 能力 | 現況 | 證據(file:line) |
|---|---|---|
| 一鍵串 6 步 | ✅ `runAll`:印刷檔→productimage→flatlay→文案→建 Woo→Printful native | `PublishWizard.tsx:392` |
| 選圖器分類 + 設主圖 | ✅ 今日修:設計圖區/商品照區、★設主圖、`?group` 解洗版 | WORKLOG 2026-06-20 `fix(publish)` |
| Printful native 建品 | ✅ `createSyncProductOnNative`:一次建品+綁變體+上傳印刷檔 | `print-provider.ts:286` |
| 對接「哪個產品」 | ✅ 用 catalog **variant_id**(數字),非型號/名稱 | `print-provider.ts:346` `variant_id: v.catalogVariantId` |
| 傳 artwork(設計稿) | ✅ 傳 **URL**(`files:[{type:"front",url}]`),Printful 自下載 | `print-provider.ts:348` |
| external_id 履約掛鉤 | ✅ sync_product.external_id=Woo product id;sync_variant.external_id=Woo SKU | `print-provider.ts:341,345` |
| Woo 建品 + gallery | ✅ 第一張=featured、其餘=gallery、自動 sideload 到 WP media、張數無上限 | `ProductCreator.php:138` |
| 圖壓 <100KB | ✅ productimage `toProductImage`~100KB;存圖 `toWebpOptimized` 50-100KB | `route.ts:204` / designs route `toWebpOptimized` |
| mockup 工具(模特/平拍/Printful) | ✅ 三 tab 控制項齊全(族裔/姿勢/場景/四角裝飾/情緒…) | `MockupStudio.tsx:257` |
| mockup 產出進圖庫 | ✅ 存 My Designs,`source="mockup"`/`"printful-mockup"` | `MockupStudio.tsx:540,556` / `StudioWorkbench.tsx:448` |

---

## §3 缺口分析(要補什麼)

| # | 缺口 | 現況(寫死/限制) | 要改成 |
|---|---|---|---|
| G1 | **批次合成** | mockup 工具一次只能一個 mode(model/flat/printful) `MockupStudio.tsx:257` | 一鍵同時生 白背+2模特+平拍,**分長短袖** |
| G2 | **款式寫死** | `getCatalogVariants(71, …)` 只一款 `route.ts:506` | 可配置多款(本案 3 款) |
| G3 | **顏色寫死 + 比對方式** | `POD_COLORS=["White","Black"]` `pod-product.ts:10`;`getCatalogVariants` 用**顏色名精確比對** `print-provider.ts:135-139` | 每款各自色集、**改用 hex(`color_code`)比對** |
| G4 | **runAll 單款 + 2 張普通圖** | 生 productimage(純圖案)+flatlay(純色平拍),只建 1 個 Woo 商品 `PublishWizard.tsx:392` | 生批次精緻圖、**loop 多款**各建 1 商品 |
| G5 | **品質把關** | 全自動無人挑圖 | 每類多生候選/失敗自動重生 + draft 安全網 |

---

## §4 規格定案

### §4.1 三款 T-shirt(已查 Printful catalog,hex 100% 精確對應)

| 款式 | Printful ID | 袖長 | 4 色(你的 hex → Printful 色名) | 尺寸 |
|---|---|---|---|---|
| **Gildan 2400** Unisex Long Sleeve | **57** | **長袖** | `#080808` Black · `#213b21` Forest Green · `#9b969c` Sport Grey · `#ffffff` White | S/M/L/XL/2XL |
| **Stanley/Stella STTU169** Organic Cotton Creator 2.0 | **456** | 短袖 | `#cfcbc8` Heather Grey · `#112537` French Navy · `#111111` Black · `#ffffff` White | S/M/L/XL/2XL |
| **Gildan 5000** Classic Tee | **438** | 短袖 | `#fffefa` White · `#c4c0be` Sport Grey · `#1a2330` Navy · `#141313` Black | S/M/L/XL/2XL |

> Printful 變體欄位含 `color_code`(hex);三款的「灰」名稱不同(Sport Grey / Heather Grey)且同名 hex 還不同 → **必須用 hex 比對,不可用顏色名**。

### §4.2 商品圖組成(每款的 WP gallery)

| 順序 | 圖 | 來源 | 備註 |
|---|---|---|---|
| 1(featured 主圖) | 白背商品圖 | mockup 平拍 tab(白底) | <100KB |
| 2 | 模特穿衣圖 A | mockup 模特 tab | **長袖款用長袖模特** |
| 3 | 模特穿衣圖 B | mockup 模特 tab | 不同姿勢/場景 |
| 4 | 帶道具平拍 | mockup 平拍 tab + 四角裝飾 | |
| 5(可選) | 設計圖原稿 | Studio/Canvas | gallery 最後一張 |

### §4.3 對接 Printful(機制定案)

- **產品**:用 catalog **product_id**(57/456/438),非名稱/型號。
- **變體**:每色用 **hex 比對** `color_code` → 拿 `variant_id`(每尺寸一個)。
- **artwork**:傳 R2 的設計稿 png **URL**(`files:[{type:"front",url}]`),三款共用同一張印刷檔(`printFileUrl`)。
- **履約掛鉤**:sync_product.external_id = Woo product id;sync_variant.external_id = Woo SKU。

### §4.4 金流紅線(不可違反)

- 一鍵**只跑到 WP draft + Printful 建品(未 confirm)**。
- **不自動**:Woo publish 開賣、Printful confirm/charge/送印。這些一律人工。
- 對齊既有決策:A2 confirm/charge 從未建(`project_pod_a2_fulfillment_deferred`)。

---

## §5 架構設計

### §5.1 新增 SSOT:產品 + 顏色配置

新檔 `lib/studio/pod-catalog-config.ts`(取代 `POD_COLORS` 寫死 + `route.ts:506` 的 `71`):

```ts
export interface PodColor { hex: string; label: string; }          // 顏色用 hex 當 key
export interface PodProductModel {
  catalogProductId: number;       // Printful catalog product id (57/456/438)
  slug: string;                   // "gildan-2400" 等,Woo 商品/SKU 用
  displayName: string;
  sleeve: "long" | "short";       // 驅動模特圖 prompt 分長短袖
  colors: PodColor[];             // 該款要賣的色(hex)
  sizes: string[];                // ["S","M","L","XL","2XL"]
}
export const POD_PRODUCT_MODELS: PodProductModel[] = [ /* 3 款,見 §4.1 */ ];
```

### §5.2 資料流(一鍵)

```
designUrl(設計圖)
  → upscale → printFileUrl(R2,履約用,所有款共用)
  → batchMockup(designUrl, sleeve) → { whiteBg, model[2], propFlat } 各壓<100KB 存 R2
  → AI copy
  → for each model in POD_PRODUCT_MODELS:
       gallery = [whiteBg(對應袖長), modelA, modelB, propFlat, designUrl]
       woo = createWooProduct({ model, colors(hex→Woo attr), sizes, gallery, copy })
       variants = model.colors × sizes → hex 比對 catalog variant_id
       pfcreate({ catalogProductId: model.catalogProductId, variants, printFileUrl, externalId: woo.id })
```

### §5.3 改動點對照

| 模組 | 改法 |
|---|---|
| `lib/studio/pod-catalog-config.ts`(新) | 3 款 × 色 × 尺寸 SSOT |
| `lib/studio/print-provider.ts` `getCatalogVariants` | 顏色名比對 → **hex(`color_code`)比對**;入參帶 productId + hex[] |
| `lib/studio/pod-product.ts` | `POD_COLORS` → 從 config 取;Woo 變體/attribute/描述按款的色集 |
| `app/api/tools/publish/route.ts` `pfcreate` | 移除寫死 `71`/`["White","Black"]`;loop 多款 |
| 批次合成 `lib/studio/batch-mockup.ts`(新) + mockup API | 一次生 白背+2模特+平拍,分長短袖,各壓<100KB 存 designs |
| `app/tools/publish/PublishWizard.tsx` `runAll` | 接批次合成 + loop 多款建 Woo/Printful + 進度/候選 UI |

---

## §6 分階段實作(每階段獨立可驗、可 rollback)

### Phase 0 — 規格 SSOT 化(低風險,先做)
- **任務**:建 `pod-catalog-config.ts`(§5.1),3 款資料。
- **檔案**:新 `lib/studio/pod-catalog-config.ts`。
- **驗證**:`tsc`;單元測試 config 形狀;**REALTEST**:對 3 款 catalogProductId 各打 Printful API 確認 hex 色實際有貨(沿用本研究 probe 手法)。
- **DoD**:config 通過、3 款 12 色 hex 全部在 Printful 實際可解析到 variant。

### Phase 1 — Printful 對接改 hex + 多款(中風險,動履約對接)
- **任務**:`getCatalogVariants` 改 hex 比對;`pfcreate` 去寫死、loop 多款。
- **檔案**:`print-provider.ts`、`app/api/tools/publish/route.ts`。
- **驗證**:`tsc` + critic;**REALTEST**:對 3 款各跑一次 native 建品(測試 external_id,**不 confirm**),確認每色 variant 正確綁定、設計稿 URL 上傳成功;Printful native store 後台檢查無錯。
- **紅線**:只到 draft 建品,不 confirm/charge。
- **DoD**:3 款 native product 建成、每款 20 變體各綁對 variant_id + 同一設計稿。

### Phase 2 — 批次合成引擎(中風險,新功能 + 成本)
- **任務**:`batch-mockup.ts` — 給(designUrl, sleeve)一次生 白背+2模特+平拍,分長短袖 prompt,各壓<100KB 存 designs(source="mockup")。每類失敗自動重生 1 次。
- **檔案**:新 `lib/studio/batch-mockup.ts` + mockup 生成 API route;複用 `mockup-prompt.ts` 既有 prompt 積木(模特/平拍/四角裝飾/情緒)。
- **驗證**:`tsc` + critic;**REALTEST**:對一張設計圖跑批次,產出 4 張圖、確認長短袖模特正確、全部<100KB、存進 designs `?group=mockup` 撈得到。
- **DoD**:一呼叫 → 4 張合格圖進圖庫。

### Phase 3 — 串進 runAll 一鍵 + 品質把關(整合)
- **任務**:`runAll` 改:設計圖→印刷檔→批次合成→組 gallery→loop 3 款建 Woo+Printful;進度 UI 顯示每款狀態;爛圖在 draft 換(不阻斷)。
- **檔案**:`PublishWizard.tsx`。
- **驗證**:`tsc` + critic;**REALTEST**:Chrome MCP 真機跑一次完整一鍵,產出 3 個 Woo draft(圖文齊全)+ 3 個 Printful native product;逐項檢查。
- **DoD**:一個設計圖 + 一鍵 → 3 款草稿全綠。

### Phase 4 — 端到端真單驗證(上線前最後關)
- **任務**:對 1 款做 P4 真實試單(操作者在 draft publish 一個 → 下一筆真單 → Printful 履約路徑驗證)。
- **驗證**:**REALTEST**:真實 Woo 訂單 → Printful draft order 用 SKU 解析正確 variant + 設計稿。
- **紅線**:confirm/charge 仍人工。
- **DoD**:一筆真單在 Printful 正確落到對應 variant + 印刷檔。

---

## §7 風險與紅線

| 風險 | 緩解 |
|---|---|
| **AI 模特圖品質波動**(手/臉變形) | 終點是 draft(人工 review 換圖);每類多生候選/失敗重生;長短袖正確 prompt |
| **金流**(自動扣款送印) | 🔴 紅線:一鍵止於 draft + native 建品(未 confirm);開賣/charge 人工 |
| **多款 = 商品爆炸**(1 設計→3 商品×20 變體=60) | 每款獨立建、失敗不連坐;進度 UI 逐款回報;成本透明告知 |
| **長短袖混淆** | config `sleeve` 欄位驅動模特 prompt;Phase 2 REALTEST 專測 |
| **顏色對接錯**(同名 Sport Grey hex 不同) | 一律用 hex(`color_code`)比對,不用顏色名;Phase 1 REALTEST 逐色驗 |
| **成本/時間**(每次多張 AI 生圖 + 3 款) | 告知操作者單次成本;批次可設「先生 1 款預覽再續」選項(可選) |

---

## §8 驗證策略(貫穿)

每個 Phase 完成 = R0 四動作:**REALTEST_EVIDENCE**(真打 Printful API / Chrome 真機)+ **REVIEW_DONE**(critic)+ **BUGHUNT_DONE**(跨檔 grep)+ **WORKLOG**。
Printful 對接類驗證一律「真打 API 看回傳」,不可只讀碼推論(本研究即用 SSH→容器 node fetch 手法,可複用)。

---

## §9 開放問題(待操作者拍板,blocks Phase 0)

1. **Gildan 2400 是長袖** —— 確認故意?(你 URL 自選 long-sleeve)。是 → config `sleeve:"long"` + 長袖模特圖。
2. **顏色以 §4.1 的每款 4 色(含 Forest Green/French Navy/Navy)為準?** —— 與早前「只白灰黑」不同,確認以這份 hex 為準。
3. **一個設計圖是否一律上全部 3 款?** —— 或一鍵時可勾「這次上哪幾款」。預設:全上 3 款。
4. **灰色**:2400/5000 用 Sport Grey、STTU169 用 Heather Grey(各款 hex 已定),確認接受各款原生灰。

---

## §10 附錄

### §10.1 Printful API 對接細節(已驗證)
- 建品:`POST /store/products`,body = `{ sync_product:{name,external_id,thumbnail}, sync_variants:[{external_id,variant_id,retail_price,files:[{type:"front",url}]}] }`(`print-provider.ts:338`)。
- native store env:`PRINTFUL_NATIVE_STORE_ID`(`print-provider.ts:302`)。
- catalog 變體:`GET /v2/catalog-products/{id}/catalog-variants`,每變體含 `color`、`color_code`(hex)、`size`、`image`。
- 冪等:同 external_id 不重建(`print-provider.ts:310`)。

### §10.2 關鍵檔案清單
- `app/tools/publish/PublishWizard.tsx` — 一鍵 UI + runAll
- `app/api/tools/publish/route.ts` — upscale/productimage/flatlay/copy/create/pfcreate
- `lib/studio/print-provider.ts` — Printful 對接(createSyncProductOnNative/getCatalogVariants)
- `lib/studio/pod-product.ts` — Woo 商品 payload(POD_COLORS/buildVariantPlan)
- `lib/studio/printful-catalog.ts` — catalog 查詢 + 顏色挑選(pickVariantByColor/GREY_RE)
- `lib/studio/mockup-prompt.ts` — 模特/平拍/裝飾 prompt 積木(批次合成複用)
- `app/tools/mockup/MockupStudio.tsx` — mockup 工具(model/flat/printful)
- `packages/wp-bridge-plugin/includes/Product/ProductCreator.php` — WP 建品 + featured/gallery sideload

### §10.3 決策摘要(本研究結論,可 promote 成 ADR)
- **方法一(WP 先 → Printful 後)** 為唯一框架:Printful 不收自製 mockup(官方),自製圖只能上 WP gallery;混合(自製+Printful 制式)也走這條(Printful 制式圖經 mockup generator API 當一張圖進 gallery)。
- **對接用 hex,不用顏色名**:跨款顏色名不一致、同名 hex 不同。
- **金流止於 draft**:開賣/charge 人工。
