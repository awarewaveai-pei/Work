# POD Fast + Correct Flow Plan

## 目的

這份文件重新定義 POD 系統的主線流程。

目標不是迎合某個既有想法，而是選擇：

```text
最快
正確
可驗證
可回滾
可對帳
可長期維運
```

新的推薦主線：

```text
AI 生成圖片
→ 產生印刷檔
→ AI 生成商品文案 / SEO / tags
→ 建 WooCommerce 商品
→ Woo product / variation meta 存完整 POD 履約資料
→ 客人付款
→ Woo webhook 通知 app.aware-wave.com
→ app 直接用 Printful Orders API 建 draft order
→ 人工確認或未來 auto-confirm
→ Printful fulfill
→ tracking 回寫 WooCommerce
```

核心修正：

```text
不要把 Printful sync product / pfcreate 當必要主線。
```

對 AI 動態商品來說，更直接的主線是：

```text
WooCommerce 商品保存完整履約資料
下單時直接用 Printful Orders API 從 catalog variant + print file 建 order
```

官方依據（已查）：

```text
Printful API v2 docs 支援從 catalog source 建 order item：
catalog_variant_id + placements + layers[].url

Printful draft order 不會扣款、不會送印。
要進入履約必須另外呼叫 order confirmation endpoint。

Manual Order / API store 是 Printful 官方給 custom integration / API workflow 用的 store type。
```

參考：

```text
https://developers.printful.com/docs/v2-beta/
https://help.printful.com/hc/en-us/articles/23581702148764-How-do-I-create-and-use-a-manual-order-API-store
https://help.printful.com/hc/en-us/articles/360014066619-How-do-the-import-order-settings-for-my-integration-work
```

---

## 一句話架構

```text
WooCommerce = 店面與付款
app.aware-wave.com = 控制面與履約腦
Printful = 印刷與出貨
Cloudflare R2 = 設計圖 / 印刷檔儲存
```

WordPress plugin 不直接保存 Printful API key。

Printful API key 只放在 app.aware-wave.com server 端。

---

## End-to-End 流程

### 1. AI 生成 artwork

使用者在 Studio / Tarot / Design tool 生成圖。

輸入：

```text
prompt
style
subject
reference images
product type
aspect ratio
```

輸出：

```text
artwork_url
artwork_asset_id
prompt
model
width
height
created_at
```

保存位置：

```text
Cloudflare R2
media_assets
My Designs
```

重點：

```text
圖片不能只活在 browser memory。
必須有穩定 URL，之後上架、印刷、重試、對帳都會用到。
```

---

### 2. 產生印刷檔

從 artwork 產生 Printful 可用的 print file。

可能步驟：

```text
去背
裁切 / contain / fit
放大
色彩處理
透明 PNG
輸出尺寸檢查
```

輸入：

```text
artwork_url
product_spec
placement
target_width_px
target_height_px
dpi
```

輸出：

```text
print_file_url
print_file_asset_id
placement = front
technique = dtg
width_px
height_px
dpi
faithful = true/false
```

保存位置：

```text
Cloudflare R2
media_assets
```

注意：

```text
mockup 圖與 print file 不同。
mockup 是給商品頁看的圖。
print file 是給 Printful 印刷用的檔。
```

去背印刷檔規則：

```text
去背後的透明 PNG 不是 zip 給 Printful。
也不是 multipart upload 給 Printful。

正確方式：
1. 產生透明 PNG print file
2. 存到 R2/CDN
3. 取得穩定公開 HTTPS URL
4. 在 Printful order item 的 placement layer 裡引用這個 URL
```

URL 要求：

```text
必須是公開可抓取的 HTTPS URL
不能需要登入
不能短期過期
Content-Type 建議正確，例如 image/png
檔案要符合 Printful 尺寸 / 透明背景 / placement 規格
```

---

### 3. AI 生成商品文案 / SEO / tags

AI 根據 artwork prompt、商品類型、品牌風格，生成 WooCommerce 商品內容。

輸入：

```text
artwork prompt
product type
brand = Soulful Expression
focus keyword hint optional
audience / vibe optional
```

輸出：

```text
product_title
short_description
long_description_blocks
bullets
seo_title
meta_description
focus_keyword
tags
categories
```

目前 `/tools/publish` 已有：

```text
generateProductCopy
RankMath SEO report
SEO/GEO/AEO panel
AI fix
```

目標：

```text
文案可人工 review。
Woo 商品先建 draft，不自動 publish。
```

---

### 4. 選定 Printful catalog variant

系統根據商品類型、顏色、尺寸，選出 Printful catalog variant。

例：

```text
Product: Bella + Canvas 3001
Placement: front
Technique: dtg
Colors: White / Black
Sizes: S / M / L / XL / 2XL
```

每個 Woo variation 必須知道自己的 Printful catalog variant：

```text
White / S  → printful_catalog_variant_id
White / M  → printful_catalog_variant_id
Black / S  → printful_catalog_variant_id
Black / M  → printful_catalog_variant_id
```

輸出：

```text
VariantPlan[]
```

每個 VariantPlan：

```text
sku
color
size
retail_price
production_cost
printful_catalog_product_id
printful_catalog_variant_id
placement
technique
print_file_url
```

注意：

```text
這一步是長期穩定的核心。
不要只靠 SKU 字串猜商品。
每個 variation 都要有明確 catalog_variant_id。
```

---

### 5. 建 WooCommerce product / variable product

app.aware-wave.com 透過 wp-bridge 在 WooCommerce 建商品。

商品狀態：

```text
draft
```

原因：

```text
先人工 review 商品頁、圖片、價格、文案。
不要一建就公開開賣。
```

Woo product 包含：

```text
title
description
short_description
images / mockups
categories
tags
RankMath SEO meta
attributes: Color, Size
variations
```

每個 variation 包含：

```text
sku
color
size
regular_price
status = publish
```

注意：

```text
Parent product 可以是 draft。
Variation 通常需要 publish 才能在 Woo 中被選取。
```

---

### 6. 寫入 Woo POD 履約資料

這是新主線最重要的一步。

WooCommerce 不只是商品展示，它也要保存履約所需的資料。

Parent product meta：

```text
_ao_pod_enabled = yes
_ao_print_provider = printful
_ao_fulfillment_mode = printful_orders_api
_ao_artwork_url
_ao_artwork_asset_id
_ao_print_file_url
_ao_print_file_asset_id
_ao_printful_catalog_product_id
_ao_product_type = tshirt
_ao_default_placement = front
_ao_default_technique = dtg
_ao_retail_base_price
_ao_retail_plus_price
_ao_currency = USD
```

Variation meta：

```text
_ao_pod_enabled = yes
_ao_print_provider = printful
_ao_fulfillment_mode = printful_orders_api
_ao_printful_catalog_variant_id
_ao_printful_catalog_product_id
_ao_print_file_url
_ao_print_file_asset_id
_ao_placement = front
_ao_technique = dtg
_ao_retail_price
_ao_production_cost
_ao_color
_ao_size
```

為什麼要存 meta：

```text
訂單履約時不用猜。
debug 時可查。
對帳時可查。
未來換供應商時可做 migration。
```

自動化如何知道要傳哪張 PNG 給 Printful：

```text
不是下單時猜。
不是用 AI 臨時判斷。
不是靠商品名稱推測。
不是靠 Printful 自己找圖。

答案是在「上架那一刻」就把圖片和 Woo variation 綁死。
```

每一個 Woo variation 都要保存自己的 fulfillment recipe：

```text
variation_id
→ printful_catalog_variant_id
→ print_file_url
→ placement
→ technique
→ layer position
```

例：

```text
商品：Soulful Lotus Tee
設計印刷檔：https://cdn.aware-wave.com/designs/lotus-front.png
商品規格：Bella 3001
顏色尺寸：White / M
印刷位置：front
```

Woo variation meta：

```text
variation_id = 9001
sku = POD-LOTUS-W-M
_ao_printful_catalog_variant_id = 4012
_ao_print_file_url = https://cdn.aware-wave.com/designs/lotus-front.png
_ao_placement = front
_ao_technique = dtg
_ao_layer_position = {"width":10,"height":10,"top":3,"left":1}
_ao_color = White
_ao_size = M
```

客人下單後，Woo order line item 會帶：

```text
product_id
variation_id
sku
quantity
```

履約自動化流程：

```text
收到 Woo order
→ 讀 line item variation_id
→ 查該 variation 的 _ao_print_file_url
→ 查該 variation 的 _ao_printful_catalog_variant_id
→ 查 placement / technique / position
→ 組 Printful order item
→ 建 Printful draft order
```

所以核心 mapping 是：

```text
variation_id → Woo variation meta → print_file_url
```

如果同一個商品有正面與背面兩張印刷檔，則 variation meta 可以存一個 JSON recipe：

```json
{
  "provider": "printful",
  "mode": "printful_orders_api",
  "catalog_variant_id": 4012,
  "placements": [
    {
      "placement": "front",
      "technique": "dtg",
      "print_file_url": "https://cdn.aware-wave.com/designs/lotus-front.png",
      "position": { "width": 10, "height": 10, "top": 3, "left": 1 }
    },
    {
      "placement": "back",
      "technique": "dtg",
      "print_file_url": "https://cdn.aware-wave.com/designs/lotus-back.png",
      "position": { "width": 10, "height": 10, "top": 3, "left": 1 }
    }
  ]
}
```

轉成 Printful order item：

```json
{
  "source": "catalog",
  "catalog_variant_id": 4012,
  "quantity": 1,
  "placements": [
    {
      "placement": "front",
      "technique": "dtg",
      "layers": [
        {
          "type": "file",
          "url": "https://cdn.aware-wave.com/designs/lotus-front.png",
          "position": { "width": 10, "height": 10, "top": 3, "left": 1 }
        }
      ]
    },
    {
      "placement": "back",
      "technique": "dtg",
      "layers": [
        {
          "type": "file",
          "url": "https://cdn.aware-wave.com/designs/lotus-back.png",
          "position": { "width": 10, "height": 10, "top": 3, "left": 1 }
        }
      ]
    }
  ]
}
```

結論：

```text
自動化靠「Woo variation meta 裡的履約配方」知道要傳哪張圖。
只要 variation_id 能查到 recipe，就不需要猜圖。
```

---

### 6A. Printful 運費成本 → WooCommerce 運費設計

運費不能由 WooCommerce 自己猜。

也不能等客人付款後才 pending 再去問 Printful。

正確主線：

```text
Printful = 真實履約運費成本來源
WooCommerce = checkout 顯示與收款的運費規則
```

也就是：

```text
先查 Printful shipping rates / calculator
→ 轉成 WooCommerce shipping zones
→ 每個 zone 設 flat rate / shipping class cost
→ 客人在 checkout 當下就看到運費
→ paid order 才進 Printful fulfillment
```

官方依據：

```text
Printful shipping rates:
https://www.printful.com/shipping

Printful shipping regions:
https://help.printful.com/hc/en-us/articles/360014010840-Which-countries-apply-to-which-Printful-shipping-regions

Printful API v2 shipping rates:
https://developers.printful.com/docs/v2-beta/

WooCommerce shipping zones:
https://woocommerce.com/document/setting-up-shipping-zones/

WooCommerce flat rate shipping:
https://woocommerce.com/document/flat-rate-shipping/

WooCommerce shipping classes:
https://woocommerce.com/document/product-shipping-classes/
```

#### 6A.1 運費決策

MVP 不走「下單後 pending 算運費」。

MVP 採：

```text
Printful flat rates → WooCommerce flat rate formulas
```

原因：

```text
1. checkout 穩定
2. 客人付款前就知道運費
3. 不依賴即時 carrier rate 成功與否
4. 避免 Printful dynamic rates 每小時變動造成 checkout / 實際扣款不一致
5. WooCommerce 原生支援 zones + flat rate + shipping class
```

Printful API v2 文件提醒：

```text
shipping rates endpoint 是即時計算，
會受 fulfillment facility / carrier / 商品 / 數量 / 收件資料影響。
即使每日下載也可能與實際 charge 有 mismatch。

如果要做固定運費，Printful 建議可使用 flat rates CSV / shipping rates overview。
```

所以我們的設計是：

```text
客人看到的運費 = 我們基於 Printful 成本設計的固定表
Printful 實際 charge = 履約成本
差額 = 毛利模型需要吸收 / 校正
```

#### 6A.2 Printful shipping regions 對應 WooCommerce zones

Printful 目前用 shipping regions 來計算運費。

WooCommerce 要照 Printful region 建 zones，不要自己任意切國家。

建議 WooCommerce zones：

```text
1. POD - USA
2. POD - Europe
3. POD - UK
4. POD - EFTA States
5. POD - Canada
6. POD - Australia / New Zealand
7. POD - Japan
8. POD - Brazil
9. POD - Worldwide
```

排序原則：

```text
越精準的 zone 放越前面。
Rest of the world / Worldwide 放最後。
沒有把握履約或毛利的地區，可以先不開。
```

#### 6A.3 MVP 商品類別：Shirts

第一階段若只賣 T-shirt，先只需要一個 shipping class：

```text
shipping_class = pod-shirt
printful_shipping_category = shirts
```

Printful Shirts 官方 flat rate 範例：

```text
Category: Shirts
Products: T-shirts, tank tops, 3/4 sleeve shirts, long sleeve shirts, polo shirts, crop tops

Region                  Single product   Additional product
USA                     4.75             2.20
Europe                  4.79             1.45
UK                      4.59             1.50
EFTA States             9.99             1.10
Canada                  8.29             1.95
Australia / New Zealand 7.69             1.40
Japan                   4.75             2.00
Brazil                  11.99            6.00
Worldwide               11.99            6.00
```

注意：

```text
這些是 Printful 成本基準，不一定等於客人付款金額。
正式上線前要再跑一次 Printful shipping page / CSV / API 檢查。
```

#### 6A.4 WooCommerce flat rate formula

WooCommerce flat rate 支援 `[qty]`。

對 Printful「首件 + 追加件」模型，WooCommerce formula 可用：

```text
single + (additional * ([qty] - 1))
```

Shirts → `pod-shirt` 建議公式：

```text
POD - USA:
4.75 + (2.20 * ([qty] - 1))

POD - Europe:
4.79 + (1.45 * ([qty] - 1))

POD - UK:
4.59 + (1.50 * ([qty] - 1))

POD - EFTA States:
9.99 + (1.10 * ([qty] - 1))

POD - Canada:
8.29 + (1.95 * ([qty] - 1))

POD - Australia / New Zealand:
7.69 + (1.40 * ([qty] - 1))

POD - Japan:
4.75 + (2.00 * ([qty] - 1))

POD - Brazil:
11.99 + (6.00 * ([qty] - 1))

POD - Worldwide:
11.99 + (6.00 * ([qty] - 1))
```

若想把運費做成品牌價格，而不是 100% pass-through：

```text
customer_shipping = Printful_cost + buffer
```

buffer 建議：

```text
0.50 - 2.00 USD
```

目的：

```text
吸收 Printful rate 小幅變動
吸收匯率 / 稅務 / payment fee 的小差額
避免實際履約時運費倒貼
```

#### 6A.5 商品上架時必須指定 shipping class

每個 Woo product / variation 都要指定：

```text
shipping_class = pod-shirt
```

並且 meta 保存：

```text
_ao_printful_shipping_category = shirts
_ao_shipping_class = pod-shirt
_ao_shipping_cost_source = printful_flat_rates
_ao_shipping_rate_version = 2026-06-17
```

目前 wp-bridge 已支援：

```text
product.shipping_class
```

而且 shipping class slug 不存在時會 auto-create。

所以 `/tools/publish` 建 Woo 商品時，payload 必須包含：

```json
{
  "shipping_class": "pod-shirt",
  "meta_data": [
    { "key": "_ao_printful_shipping_category", "value": "shirts" },
    { "key": "_ao_shipping_class", "value": "pod-shirt" },
    { "key": "_ao_shipping_cost_source", "value": "printful_flat_rates" },
    { "key": "_ao_shipping_rate_version", "value": "2026-06-17" }
  ]
}
```

變體若未來有不同商品類別，也要在 variation 層保存：

```text
pod-shirt
pod-hoodie
pod-mug
pod-poster
```

#### 6A.6 WooCommerce 要新增的運費設定能力

目前現有系統可做到：

```text
建 Woo product
指定 product shipping_class
自動建立 shipping class term
```

但還缺：

```text
自動建立 / 更新 WooCommerce shipping zones
自動加入 flat_rate method
自動設定 method cost / class_cost
自動設定 zone locations
```

WooCommerce REST API 有對應端點：

```text
GET/POST/PUT /wp-json/wc/v3/shipping/zones
GET/POST/PUT /wp-json/wc/v3/shipping/zones/{zone_id}/locations
GET/POST/PUT /wp-json/wc/v3/shipping/zones/{zone_id}/methods
GET /wp-json/wc/v3/shipping_methods/flat_rate
```

下一步工程：

```text
新增 Woo shipping config writer
或擴充 wp-bridge plugin 新增 shipping settings route
```

建議 route：

```text
POST /wp-json/awarewave/v1/woo/shipping-profile
```

輸入：

```json
{
  "profile": "printful-shirts-v1",
  "currency": "USD",
  "classes": [
    { "slug": "pod-shirt", "name": "POD Shirt" }
  ],
  "zones": [
    {
      "name": "POD - USA",
      "locations": [{ "type": "country", "code": "US" }],
      "methods": [
        {
          "method_id": "flat_rate",
          "title": "Standard shipping",
          "tax_status": "none",
          "cost": "0",
          "class_costs": {
            "pod-shirt": "4.75 + (2.20 * ([qty] - 1))"
          },
          "calculation_type": "class"
        }
      ]
    }
  ]
}
```

驗證要求：

```text
1. shipping class 存在
2. zone locations 正確
3. flat_rate method enabled
4. class cost 寫入後 read-back
5. checkout 測試 1 件 / 2 件
6. USA / Canada / UK / Worldwide 各測一筆地址
```

#### 6A.7 上線策略

MVP 開放地區：

```text
USA
Canada
UK
Europe
Australia / New Zealand
Japan
```

MVP 可暫停：

```text
Brazil
Worldwide
```

原因：

```text
成本較高
跨境稅費 / 海關 / delivery time 風險較高
先不要讓未知地區吃掉毛利
```

正式上線前必測：

```text
1. Woo checkout 1 件 shirt 到 USA
2. Woo checkout 2 件 shirt 到 USA
3. Woo checkout 1 件 shirt 到 Canada
4. Woo checkout 1 件 shirt 到 UK
5. Woo checkout 1 件 shirt 到 Germany / France
6. Woo checkout 1 件 shirt 到 Australia
7. 不支援國家是否正確顯示 no shipping available
```

#### 6A.8 長期維護

每月或每次 Printful 公告改價時：

```text
下載 / 查 Printful shipping rates
比對目前 Woo zone formulas
產生 diff report
若成本上升超過 buffer，自動提醒
人工批准後更新 Woo shipping profile
```

保存版本：

```text
shipping_rate_version
source_url
fetched_at
category
region
single_product
additional_product
woo_zone_id
woo_method_instance_id
active_from
active_to
```

核心原則：

```text
Printful 是成本真相。
WooCommerce 是客人付款規則。
兩者要定期對帳，不要混在一起。
```

---

### 7. 客人付款

客人在 WooCommerce checkout 完成付款。

Woo order status 變成：

```text
processing
```

或某些情況：

```text
completed
```

只有 paid status 才能進履約。

不處理：

```text
pending
on-hold
failed
cancelled
refunded
```

---

### 8. Woo webhook 通知 app.aware-wave.com

WooCommerce webhook：

```text
Topic: Order updated
Delivery URL: https://app.aware-wave.com/api/webhooks/woo-order
Secret: WC_WEBHOOK_SECRET
```

app 端安全閘：

```text
POD_AUTO_FULFILL_ENABLED 必須為 true
HMAC signature 必須正確
order status 必須 processing/completed
line item 必須是 POD item
```

如果 kill switch 關閉：

```text
回 200 ignored
不建立任何 Printful order
```

---

### 9. 從 Woo order line items 讀履約資料

每個 Woo line item 要解析：

```text
product_id
variation_id
sku
quantity
shipping recipient
```

然後讀 variation meta：

```text
_ao_printful_catalog_variant_id
_ao_print_file_url
_ao_placement
_ao_technique
_ao_production_cost
```

如果 line item 沒有 POD meta：

```text
視為非 POD 商品
不送 Printful
```

如果訂單混合 POD + 非 POD：

```text
只送 POD line items
非 POD 由其他流程處理
```

如果 POD line 缺必要 meta：

```text
整張 Printful draft order 不建立
記錄錯誤
等待人工修復
```

---

### 10. 用 Printful Orders API 建 draft order

app.aware-wave.com 呼叫 Printful Orders API。

不要依賴 Printful sync product。

每個 item 直接從 catalog source 建立：

```text
catalog_variant_id
quantity
placement
technique
file url
```

去背印刷檔如何一起包給 Printful：

```text
把透明 PNG print_file_url 放進：
items[].placements[].layers[].url
```

也就是：

```text
catalog_variant_id = 要印哪個 Printful 商品變體，例如 Bella 3001 Black / M
placement = 印在哪裡，例如 front
technique = 印刷方式，例如 dtg
layers[].url = 去背後的透明 PNG 印刷檔 URL
```

概念 payload：

```json
{
  "recipient": {
    "name": "Customer Name",
    "address1": "Address",
    "city": "City",
    "state_code": "CA",
    "country_code": "US",
    "zip": "90001",
    "email": "customer@example.com"
  },
  "items": [
    {
      "quantity": 1,
      "catalog_variant_id": 4011,
      "source": "catalog",
      "placements": [
        {
          "placement": "front",
          "technique": "dtg",
          "layers": [
            {
              "type": "file",
              "url": "https://cdn.example.com/print-file.png"
            }
          ]
        }
      ]
    }
  ]
}
```

多印刷位置範例：

```json
{
  "items": [
    {
      "quantity": 1,
      "catalog_variant_id": 4011,
      "source": "catalog",
      "placements": [
        {
          "placement": "front",
          "technique": "dtg",
          "layers": [
            {
              "type": "file",
              "url": "https://cdn.example.com/front-transparent-print.png"
            }
          ]
        },
        {
          "placement": "back",
          "technique": "dtg",
          "layers": [
            {
              "type": "file",
              "url": "https://cdn.example.com/back-transparent-print.png"
            }
          ]
        }
      ]
    }
  ]
}
```

Printful draft order 特性：

```text
不扣款
不送印
不進 fulfillment
可檢查成本
可檢查地址
可人工 review
```

紅線：

```text
建立 draft order 可以驗證 payload、圖檔 URL、placement、成本計算。
但不可呼叫 confirm endpoint。
不可加任何會立即送印的 confirm=true / confirm=1 參數。
confirm = 扣款 + 送印，必須另行批准。
```

仍需 REALTEST 驗證：

```text
雖然官方文件支持這個 payload 方向，
但我們仍需用自己的 Printful token / store / R2 圖檔做一筆 draft-only probe，
確認：

1. token scope 可用
2. store type 可用
3. catalog_variant_id 正確
4. placement / technique 名稱正確
5. R2/CDN 透明 PNG 可被 Printful 抓取
6. draft order 不扣款、不送印
```

REALTEST 結果（2026-06-17，draft-only probe）：

```text
Store:
Printful native/API store = 18324409

Catalog:
Bella + Canvas 3001
White / M catalog_variant_id = 4012
placement = front
technique = dtg

File URL:
使用公開透明 PNG URL 測試 layers[].url。
第一次官方 sample URL 被 Printful 判為 invalid URL。
第二次 Wikimedia PNG 被 Printful 成功抓取，但因圖片比例 1.33 與 position 1.00 不符而拒絕。
第三次把 position 調成 10 × 7.5（比例 1.33）後成功。

Create:
POST /v2/orders
response HTTP 200
printful_order_id = 162937879
status = draft
store_id = 18324409
order_item source = catalog
catalog_variant_id = 4012
costs.calculation_status = calculating

Safety:
未呼叫 confirmation endpoint。
未 confirm。
未扣款。
未送印。
測完立刻 DELETE /v2/orders/162937879。
delete response HTTP 204。
```

實測結論：

```text
Printful Orders API direct draft 主線成立。

Printful 確實接受：
catalog_variant_id + placement + technique + layers[].url

Printful 也會實際抓取圖片 URL，並檢查圖片比例與 position 比例。

所以正式實作時，print file pipeline 必須保存：
1. print_file_url
2. placement
3. technique
4. print area width / height
5. layer position width / height / top / left
6. 圖片比例與 position 比例一致
```

---

### 11. 建立 fulfillment record

每次 Woo order 觸發履約，都要在 app DB 建一筆紀錄。

建議資料：

```text
id
woo_order_id
woo_order_number
woo_status
print_provider = printful
printful_order_id
status = draft_created / failed / confirmed / shipped
recipient_snapshot
items_snapshot
cost_snapshot
attempt_count
last_error
created_at
updated_at
```

目的：

```text
防重複
可重試
可查錯
可對帳
可做 dashboard
```

冪等規則：

```text
同一 woo_order_id 只能建立一張 active Printful draft/confirmed order。
```

---

### 12. 人工確認或 auto-confirm

初期：

```text
只建 draft order。
人到 Printful dashboard 或 app dashboard 檢查後 confirm。
```

中期：

```text
app 內提供 Approve / Confirm 按鈕。
```

長期：

```text
auto-confirm
```

auto-confirm 必須具備：

```text
每日金額上限
每日訂單數上限
單筆金額上限
地址驗證
成本/毛利檢查
print file 可抓取檢查
kill switch
錯誤告警
```

不可一開始就直接 auto-confirm。

原因：

```text
confirm = 扣款 + 送印。
這是金流與實體出貨紅線。
```

---

### 13. Printful fulfill

Printful confirm 後開始：

```text
檔案處理
印刷
品管
包裝
出貨
```

Printful 可能狀態：

```text
draft
pending
failed
on_hold
inprocess
fulfilled
cancelled
```

系統要能處理：

```text
地址錯誤
付款方式缺失
檔案不合格
缺貨
被放 on hold
取消
退款
```

---

### 14. Tracking 回寫 WooCommerce

Printful 出貨後，需要把 tracking 回 Woo。

來源：

```text
Printful webhook
或定期 polling Printful shipments endpoint
```

Printful 會怎麼回 tracking：

```text
Printful 不會在 create draft order 時立刻給 tracking。
tracking 只會在訂單 confirm 後，Printful 真的處理並產生 shipment 時出現。

主要來源有兩種：

1. Webhook：例如 shipment_sent / shipment_delivered
2. API polling：GET order shipments endpoint
```

Printful v2 webhook 的 shipment payload 會包含：

```text
type = shipment_sent / shipment_delivered / shipment_returned / shipment_canceled / ...
occurred_at
store_id
data.shipment.id
data.shipment.status
data.shipment.tracking_number
data.shipment.tracking_url
data.shipment.created_at
data.shipment.ship_date
data.shipment.shipped_at
data.shipment.delivered_at
data.order.id
data.order.external_id
```

Printful shipments endpoint 也會回：

```text
shipment_status
shipped_at
delivery_status
delivered_at
departure_address
tracking_number
tracking_url
tracking_events[]
estimated_delivery
shipment_items[]
```

官方依據：

```text
Printful API v2 docs:
- Webhook v2 events include shipment_sent / shipment_delivered / shipment_returned / shipment_canceled
- shipment webhook sample includes tracking_number and tracking_url
- shipments response includes tracking_number, tracking_url, tracking_events, shipped_at, delivered_at

https://developers.printful.com/docs/v2-beta/
```

建議主線：

```text
以 Printful webhook 為主。
以 polling shipments endpoint 作為補償修復。
```

原因：

```text
Webhook 可即時回寫。
Polling 可修復 webhook 遺失、重送失敗、或系統停機期間漏掉的事件。
```

Webhook 收到後的 mapping：

```text
Printful webhook data.order.external_id
→ 對應 Woo order id
→ 找 fulfillment record
→ 寫 tracking 到 Woo
```

如果 `data.order.external_id` 是我們建立 draft order 時填入的 Woo order id：

```text
Woo order id = data.order.external_id
```

就不需要猜是哪張 Woo 訂單。

回寫 Woo：

```text
order note
tracking number
tracking URL
carrier
shipment status
```

如果 Woo 有 shipment tracking plugin：

```text
寫 plugin 對應 meta
```

同時更新 fulfillment record：

```text
status = shipped
tracking_number
tracking_url
shipped_at
delivered_at
delivery_status
printful_shipment_id
```

Woo order note 範例：

```text
Printful shipped this order.
Carrier tracking: {tracking_number}
Tracking URL: {tracking_url}
Shipment ID: {printful_shipment_id}
```

冪等規則：

```text
同一個 printful_shipment_id + tracking_number 只回寫 Woo 一次。
Webhook 重送時不可重複新增相同 tracking note。
```

注意：

```text
一張 Printful order 可能拆成多個 shipments。
所以 fulfillment record 不應只存單一 tracking_number。
建議存 fulfillment_shipments[] 或獨立 fulfillment_shipments table。
```

---

## 為什麼不把 pfcreate 當主線

目前 `/tools/publish` 已有：

```text
pfcreate
createSyncProductOnNative
Printful native sync product
sync_variant external_id = Woo SKU
```

這條路不是錯。

但對 AI 動態商品來說，它多了一層：

```text
Woo product
→ Printful sync product
→ Printful order
```

更快更直接的是：

```text
Woo product
→ Printful order from catalog source
```

減少：

```text
同步狀態
sync product id
sync variant id
SKU join failure
Printful native product 清理問題
重建 / 改名 / 重試不一致
```

保留 pfcreate 的合理用途：

```text
需要在 Printful dashboard 預先看到商品
需要用 Printful 的 product/mockup 管理
需要批量管理已發布的 Printful product
```

但它不應是 AI POD 自動履約的必要條件。

---

## 與 Printful 官方 WooCommerce plugin 的比較

### 官方 plugin 路線

```text
Printful 建商品
→ 推到 Woo
→ Woo Processing order 自動匯入 Printful
→ Printful 自動 fulfill / tracking 回寫
```

優點：

```text
最省工程
官方維護
tracking 回寫現成
shipping rate 現成
```

缺點：

```text
商品建立流程偏 Printful dashboard
AI 動態 artwork / 文案 / mockup 自動化較不自由
大量自動商品上架控制較弱
客製資料與對帳資料不在我們控制面
```

### Custom Orders API 路線

```text
AI 建商品到 Woo
→ Woo meta 保存履約資料
→ 下單時 app 呼叫 Printful Orders API
→ tracking 自己回寫
```

優點：

```text
最適合 AI 自動生成商品
控制權完整
供應商可替換
資料可對帳
流程可逐步自動化
```

缺點：

```text
工程量較大
tracking / shipping / retry / dashboard 要自己做
```

推薦：

```text
主線採 Custom Orders API。
保留官方 plugin 作為參考或 fallback，不當核心依賴。
```

---

## 新主線的工程階段

### Phase 0: Printful shipping profile → WooCommerce shipping zones

```text
目標：先把 Printful 運費成本轉成 WooCommerce checkout 可收款的固定運費規則。
```

內容：

```text
建立 pod-shirt shipping class
建立 WooCommerce shipping zones 對應 Printful shipping regions
每個 zone 加 flat_rate method
用 Printful Shirts single/additional rate 寫 class_cost formula
商品 publish 時自動帶 shipping_class = pod-shirt
保存 _ao_printful_shipping_category / _ao_shipping_rate_version
```

缺口：

```text
目前 wp-bridge 可在建商品時指定 shipping_class。
但還沒有 endpoint 可自動建立 / 更新 WooCommerce shipping zones。
```

下一步：

```text
新增 Woo shipping config writer
或擴充 wp-bridge:
POST /wp-json/awarewave/v1/woo/shipping-profile
```

驗證：

```text
checkout 測 USA / Canada / UK / Europe / Australia 1 件與 2 件。
確認 Woo 顯示運費與 PLAN 中 Printful-based formula 一致。
```

---

### Phase 1: Woo POD meta

```text
目標：/tools/publish 建 Woo product 時，寫完整 parent + variation meta。
```

內容：

```text
擴充 buildPodProductPayload()
加入 catalog_variant_id
加入 print_file_url
加入 placement / technique
加入 production_cost
加入 fulfillment_mode = printful_orders_api
補 pod-product tests
```

---

### Phase 2: Woo order line meta reader

```text
目標：webhook 收到 order 後，能讀出每個 variation 的 POD meta。
```

內容：

```text
新增 Woo read client 或 wp-bridge read route
用 variation_id 讀 meta
組成 Printful order items
缺資料 fail-loud
```

---

### Phase 3: Printful Orders API direct draft

```text
目標：不用 sync product，直接用 catalog source 建 Printful draft order。
```

內容：

```text
新增 createDraftOrderFromCatalog()
payload 使用 catalog_variant_id + placements + print_file_url
保留 draft-only
補測試
實測一筆 draft order
```

---

### Phase 4: Fulfillment records

```text
目標：所有履約都有狀態、錯誤、重試紀錄。
```

內容：

```text
DB table
idempotency by woo_order_id
attempt log
status transitions
admin dashboard
manual retry
```

---

### Phase 5: Tracking 回寫

```text
目標：Printful 出貨後，tracking 回 Woo。
```

內容：

```text
Printful webhook or polling
Woo order note
tracking meta
customer notification policy
```

---

### Phase 6: Confirm 送印

```text
目標：從 draft 進入 fulfillment。
```

先做：

```text
manual confirm button
```

再做：

```text
auto-confirm with limits
```

必須有：

```text
kill switch
daily cap
single-order cap
profit check
address check
file check
alerting
```

---

## 最終推薦

最快又正確的 POD 主線：

```text
AI 生成圖片
→ R2 保存 artwork
→ 產生 print file
→ AI 生成商品資料
→ 建 Woo draft product
→ 寫完整 POD meta
→ 人工 review 後 publish
→ Woo paid order webhook
→ app 直接建 Printful draft order from catalog source
→ 人工 confirm
→ Printful fulfill
→ tracking 回寫 Woo
```

這條路的重點：

```text
少一層 sync product
少一組同步錯誤
資料留在 Woo meta 與 app DB
Printful API key 留在 app server
高風險送印動作先人工確認
未來可自動化
未來可換供應商
```

這才是快又正確，而且能往 30 年穩跑演進的流程。
