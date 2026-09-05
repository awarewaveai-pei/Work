# Composable AI Commerce OS
## Commerce & Marketplace Connectors

> 商店與 Marketplace 的 Connector Roadmap；平台名稱不是功能，Capability 才是。

# 1. Direct Commerce

```text
WooCommerce
Shopify
SHOPLINE
CYBERBIZ
91APP
Magento / Adobe Commerce
BigCommerce
Custom Headless
```

# 2. Global Marketplaces

```text
Amazon
eBay
Etsy
Walmart Marketplace
TikTok Shop
Temu
```

# 3. Asia

```text
Shopee
Lazada
Rakuten
Coupang
Qoo10
Yahoo Shopping
Naver Smart Store
```

# 4. Taiwan

```text
Shopee Taiwan
Coupang Taiwan
momo
PChome
露天
SHOPLINE
CYBERBIZ
91APP
```

# 5. Latin America

```text
Mercado Libre
```

# 6. B2B / Specialty

```text
Alibaba.com
Faire
Ankorstore
Zalando
Reverb
StockX
GOAT
```

# 7. Standard Commerce Capabilities

```text
commerce.customer.read
commerce.orders.list
commerce.order.read
commerce.products.read
commerce.inventory.read
commerce.fulfillment.read
commerce.fulfillment.write
commerce.refund.write
commerce.promotions
commerce.finance
marketplace.listings
marketplace.health
marketplace.messages
```

# 8. Implementation Order

1. WooCommerce
2. Shopify
3. Shopee Taiwan
4. SHOPLINE
5. Amazon
6. Etsy
7. eBay
8. Walmart
9. TikTok Shop
10. Lazada / Rakuten / Mercado Libre

# 9. Rule

任何平台 Connector 都只能實作它真正支援的 capabilities；不以 `platform == X` 讓 Core 猜功能。
