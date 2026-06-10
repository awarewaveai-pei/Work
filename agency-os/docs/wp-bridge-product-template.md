# WP Bridge 商品建立範本（SSOT）

> 用 AwareWave WP Bridge `POST /product` 端點建 WooCommerce 商品的**填空範本**。
> 以後建任何商品（T-shirt / 馬克杯 / 海報 / 數位下載…）照這份填即可。
> 對應 plugin 版本：**v0.9.0+**（`createProduct` 支援完整 WC 可寫欄位集 + Kadence 積木描述）。
> 欄位定義正本：[`WooCommerce_REST_API_v3_Reference.md`](../reference/WooCommerce_REST_API_v3_Reference.md) §Product properties / §Product variation properties。
> 程式正本：`lobster-factory/packages/wp-bridge-plugin/includes/Product/ProductCreator.php`。

---

## 0. 兩種商品類型

| 類型 | `type` | 價格在哪 | 必填 |
|------|--------|----------|------|
| **簡單商品**（單一 SKU，例：一張海報） | `"simple"`（預設） | `regular_price` 在頂層 | `name` + `regular_price` |
| **可變商品**（色×尺寸等變體，例：T-shirt） | `"variable"` | 價格在**每個變體**上 | `name` + `attributes[]` + `variations[]` |

> 端點：`POST https://<站>/?rest_route=/aware-wave-bridge/v1/product`（Ed25519 簽章，scope=write）。
> 成功回 `201 {status:"committed", product_id, variation_ids[], variation_count, edit_url, permalink}`。
> 任何一步失敗 → 整顆商品 atomic rollback（不留半成品）。預設 `status:"draft"`（人審後才 publish）。

---

## 1. 描述用 Kadence 積木（重要）

商品**長描述**（`description`）有兩種填法，二擇一：

**(A) Kadence 積木（推薦）** — 傳 `blocks[]`，server 用同一套 BlockLibrary 組成 Kadence 積木標記（跟發文章 `POST /post` 同引擎）。**不要**自己手寫 `<!-- wp:kadence/... -->`。混用多種不同性質的積木讓描述更豐富（下面這份是 soulful product 7133 驗過的：40 個 Kadence 積木 / 12 種型別）：

```jsonc
"blocks": [
  { "type": "heading",   "text": "AwareWave Custom Tee", "level": 2 },
  { "type": "paragraph", "text": "100% 有機棉，環保水性墨印製。柔軟透氣、耐穿。" },
  { "type": "infobox",   "title": "Ethically Made", "text": "GOTS 有機棉認證，接單印製減少浪費。", "cta": "Our Story" },
  { "type": "heading",   "text": "特色", "level": 3 },
  { "type": "icon_list", "items": ["GOTS 有機棉認證", "環保水性墨", "Unisex 版型 XS–3XL", "白／黑兩色"] },
  { "type": "divider" },
  { "type": "heading",   "text": "規格", "level": 3 },
  { "type": "table",     "rows": [
      ["Attribute", "Detail"],
      ["Material", "100% organic ring-spun cotton"],
      ["Weight", "180 gsm"],
      ["Fit", "Unisex regular"]
  ] },
  { "type": "heading",   "text": "洗滌方式", "level": 3 },
  { "type": "list",      "items": ["冷水翻面機洗", "懸掛晾乾、勿烘", "印花處勿直接熨燙", "勿漂白"] },
  { "type": "heading",   "text": "FAQ", "level": 3 },
  { "type": "accordion", "panes": [
      { "title": "How do I choose my size?", "content": "Unisex regular fit，介於兩尺寸間建議放大一號。" },
      { "title": "Is the print durable?", "content": "水性 DTG 墨固色於布料，依指示清洗可耐久。" }
  ] },
  { "type": "tabs", "tabs": [
      { "title": "Shipping", "content": "接單印製，3–5 個工作天出貨，全球追蹤配送。" },
      { "title": "Returns",  "content": "客製品接單生產；30 天內印刷／材質瑕疵免費換貨。" }
  ] },
  { "type": "quote",   "text": "Wear your values. Every thread tells a story of conscious craft." },
  { "type": "spacer",  "height": 30 },
  { "type": "button",  "text": "View the full collection", "link": "https://soulfulexpression.org/shop" }
]
```

> tabs / accordion 標題用**英文**（slug 會去掉非 ASCII，中文標題會變空）。

可用積木型別（完整清單 + 範例見 `GET /blocks` 端點，自描述）：
`heading` `paragraph` `button` `list` `quote` `form` `image` `spacer` `divider` `icon_list` `table` `accordion` `tabs`(英文標題) `youtube` `infobox` `gallery`。

**(B) 純 HTML** — 傳 `description: "<p>...</p>"`。會被 WP 包成 core paragraph，**不是** Kadence 積木。除非有理由，否則用 (A)。

> `blocks[]` 存在時會覆蓋 `description` 字串。短描述 `short_description` 一律純 HTML（通常一兩句即可）。

---

## 2. 完整可變商品範本（T-shirt，每個欄位都填）

> 這就是 2026-06-10 真站驗過的 T-shirt（soulful product 7117）。複製改值即可。

```jsonc
{
  "type": "variable",
  "name": "AwareWave Custom Tee",
  "slug": "awarewave-custom-tee",              // 選填；省略則由 name 自動產生
  "status": "draft",                            // draft|pending|private|publish
  "featured": true,                             // 精選商品
  "catalog_visibility": "visible",              // visible|catalog|search|hidden
  "blocks": [ /* 見 §1，組 Kadence 描述 */ ],
  "short_description": "<p>有機棉客製 T-shirt，白／黑，XS–3XL。</p>",
  "sku": "AWB-TEE-PARENT",                      // 母商品 SKU（可變商品選填）
  "global_unique_id": "0712345678901",          // GTIN/UPC/EAN/ISBN（需 WC 9.2+）
  "tax_status": "taxable",                       // taxable|shipping|none
  "tax_class": "",                               // 空 = 標準稅率
  "manage_stock": false,                         // 母層庫存管理（變體可各自開）
  "stock_status": "instock",                     // instock|outofstock|onbackorder
  "backorders": "no",                            // no|notify|yes
  "sold_individually": false,                    // 一次只能買一件
  "weight": "0.2",                               // 單位依 WC 設定（kg/g…）
  "dimensions": { "length": "25", "width": "20", "height": "2" },
  "shipping_class": "",                          // slug；不存在會自動建立
  "reviews_allowed": true,
  "purchase_note": "感謝購買！冷水洗、懸掛晾乾。",   // 出貨後給客戶的備註
  "menu_order": 0,                               // 自訂排序
  "categories": ["Apparel", "T-Shirts"],         // 名稱；不存在自動建立
  "tags": ["organic", "custom", "unisex"],       // 名稱；不存在自動建立
  "brands": ["AwareWave"],                        // 需 WC Brands；無則自動略過
  "images": [                                     // 第一張=主圖，其餘=圖庫
    { "src": "https://.../front.jpg", "alt": "正面" },
    { "src": "https://.../back.jpg",  "alt": "背面" }
  ],
  "seo": {                                        // Rank Math
    "focus_keyword": "custom organic t-shirt",
    "title": "AwareWave Custom Tee — Organic Cotton",
    "description": "白與黑有機棉客製 T-shirt，XS 到 3XL。"
  },
  "meta_data": [                                  // 任意自訂 meta（WC 保留鍵會被擋）
    { "key": "awb_material", "value": "100% organic cotton" }
  ],

  "attributes": [
    { "name": "Color", "options": ["White", "Black"],
      "visible": true, "variation": true, "position": 0 },
    { "name": "Size",  "options": ["XS","S","M","L","XL","XXL","3XL"],
      "visible": true, "variation": true, "position": 1 }
  ],
  "default_attributes": [                          // 頁面預選的變體
    { "name": "Color", "option": "White" },
    { "name": "Size",  "option": "M" }
  ],

  "variations": [
    {
      "attributes": { "Color": "White", "Size": "XS" },  // key 必須對應上面 attributes 的名稱
      "sku": "AWB-TEE-W-XS",
      "regular_price": "22.00",
      "sale_price": "20.00",                       // 必須 < regular_price，否則 400
      "description": "White / XS — 有機棉客製 T-shirt。",
      "status": "publish",                          // 變體要 publish 才可選
      "manage_stock": true,
      "stock_quantity": 51,
      "stock_status": "instock",
      "backorders": "notify",
      "weight": "0.18",
      "dimensions": { "length": "25", "width": "20", "height": "2" },
      "tax_status": "taxable",
      "menu_order": 1,
      "global_unique_id": "0712345610001",
      "image": { "src": "https://.../white-xs.jpg", "alt": "白 XS" },  // 變體單張圖
      "meta_data": [ { "key": "awb_variation_color", "value": "White" } ]
    }
    // …其餘 13 個變體（White/Black × XS–3XL）。省略某欄則沿用 WC 預設。
    // 變體省略 regular_price 時，會用頂層 regular_price 當 fallback。
  ]
}
```

---

## 3. 完整簡單商品範本（例：海報，單一 SKU）

```jsonc
{
  "type": "simple",
  "name": "Soulful Print — A2 Poster",
  "status": "draft",
  "regular_price": "35.00",
  "sale_price": "29.00",
  "blocks": [ /* Kadence 描述，見 §1 */ ],
  "short_description": "<p>A2 微噴藝術海報，無酸紙。</p>",
  "sku": "SOUL-POSTER-A2",
  "tax_status": "taxable",
  "manage_stock": true,
  "stock_quantity": 100,
  "weight": "0.1",
  "dimensions": { "length": "60", "width": "42", "height": "0.1" },
  "categories": ["Prints"],
  "tags": ["wall-art", "a2"],
  "images": [ { "src": "https://.../poster.jpg", "alt": "海報" } ],
  "seo": { "focus_keyword": "a2 art poster", "title": "...", "description": "..." },
  "meta_data": [ { "key": "awb_paper", "value": "acid-free 250gsm" } ]
}
```

---

## 4. 規則與雷區（建之前看）

- **價格用字串**：`"22.00"` 不是 `22`。不接受科學記號（`1e3`）、不接受負數。
- **`sale_price` 必須 < `regular_price`**，否則回 `400 sale_price_not_below_regular`（WC 會默默丟棄 ≥ 的特價，所以擋在前面）。
- **可變商品母層不要填 `regular_price` 當真實售價**：母層沒有自己的價格，價在變體上。頂層 `regular_price` 只當「變體沒填價時的 fallback」。
- **變體 `attributes` 的 key** 必須對應母 `attributes[].name`（大小寫無妨，內部用 slug 比對）；打錯字 → `400 variation_attribute_unknown` + rollback。
- **SKU 唯一**：站內重複 → `409 sku_exists`；同一請求內重複 → `409 duplicate_sku_in_request`。
- **圖片** 傳 URL → server 自動 sideload 進媒體庫；URL 404 → 該圖略過（不報錯、不擋）。要重用既有附件用 `{ "id": 123 }`。
- **categories / tags / shipping_class / brands** 用「名稱／slug」，不存在會自動建立（brands 需 WC Brands 啟用，否則略過）。
- **`meta_data` 保留鍵被擋**：`_price` `_regular_price` `_sale_price` `_stock` `_sku` … 等 WC 內部鍵不可用 `meta_data` 寫（會被忽略），請用對應正式欄位。
- **預設 `status:"draft"`**：建完是草稿，人審後再 publish。不要讓 AI 自動 publish。

---

## 5. 驗收（建完確認）

1. 回應 `status:"committed"` + `product_id` + `variation_count` 等於你給的變體數。
2. 後台 `edit_url` 開啟：描述是 Kadence 積木（不是純 `<p>`）、變體表 14 列、主圖在、價格／庫存正確。
3. 失敗時回應 `reason` 看哪一關（對照 §4），改正重送（失敗不留半成品，可直接重建）。

---

_建立 2026-06-10；真站驗證 = soulful product 7117（變體 14、Kadence 描述 11 積木、全欄位填）。維護：欄位有增刪時同步 `ProductCreator.php` 與本檔。_
