# WP_CLIENT_PLUGIN_STACK.md

> **Owner File** — WordPress 客戶站外掛標準堆疊（選型 + 組合邏輯）。  
> **不涵蓋**：更新流程 → [`WP_MANAGED_UPDATES.md`](WP_MANAGED_UPDATES.md)；交付模式 → [`WORDPRESS_CLIENT_DELIVERY_MODELS.md`](WORDPRESS_CLIENT_DELIVERY_MODELS.md)。  
> **Last updated**: 2026-05-12  
> **讀者**：營運者、AI 代理、協作工程師

---

## 如何使用

```
新案開工 → 基礎全員（必裝）
  + 有電商？     → 疊加「電商模組」
  + 旅遊業？     → 疊加「旅遊模組」
  + 形象/品牌站？→ 疊加「形象模組」
  + 一般電商？   → 基礎 + 電商模組（無站型模組）

單一站可同時疊加多個模組（如：旅遊 + 電商）
```

---

## 外掛生態系授權建議（先讀）

| 生態系 | 核心外掛 | 授權策略 |
|--------|---------|---------|
| **Kadence** | Theme、Blocks、Shop Kit、Email Designer | 買 Kadence Full Bundle（一次含全部） |
| **Fluent** | Forms、SMTP、CRM、Reviews | 買 Fluent Forms + CRM Pro Bundle；SMTP 永久免費 |
| **YITH** | Wishlist、Points & Rewards | 評估 YITH Club（多外掛一次授權） |

> 以上授權為 per-site 或 unlimited site，開案前確認授權數量。

---

## 一、基礎全員必裝

> 所有站型（旅遊、形象、電商）全部必裝，無例外。  
> 所有站都有部落格 → Akismet / CleanTalk 二選一皆覆蓋留言反垃圾。

| 類別 | 外掛 | Free/Pro | 說明 |
|------|------|---------|------|
| **主題框架** | Kadence Theme | Free / Pro | 所有頁面基礎 |
| **主題框架** | Kadence Blocks | Free / Pro | 視覺區塊編輯器 |
| **安全** | Wordfence Security | Free / Pro | 防火牆 + 惡意掃描 |
| **備份** | WPvivid Backup | Free / Pro | 連動 MainWP 管理 |
| **SEO** | Rank Math SEO | Free / Pro | SEO + Schema + 部落格文章結構化 |
| **SEO 跳轉** | Redirection | Free | 管理 301/302，改版必用 |
| **快取/效能** | LiteSpeed Cache 或 WP Rocket | Free / 付費 | 見注意事項 §6.1 |
| **圖片壓縮** | ShortPixel 或 Imagify | 免費額度/付費 | 搭快取一起啟用 |
| **SSL** | Really Simple SSL | Free | 強制 HTTPS |
| **表單** | Fluent Forms | Free / Pro | 聯絡、詢問、預約表單 |
| **SMTP 發信** | FluentSMTP | Free | 搭配 SMTP 供應商使用（見 §6.2） |
| **CRM / 名單** | FluentCRM | Free / Pro | 訂閱名單、後續行銷自動化 |
| **反垃圾（首選）** | CleanTalk | 付費訂閱 | 覆蓋表單 + 留言 + 註冊，推薦 |
| **反垃圾（預算替代）** | Akismet | Free（需授權）| 僅覆蓋留言，CleanTalk 的精簡替代 |
| **分析追蹤** | GTM4WP | Free | 安裝 Google Tag Manager；GA4 + Meta Pixel 皆透過 GTM 管理，不裝獨立追蹤外掛 |
| **內容結構** | Advanced Custom Fields (ACF) | Free / Pro | 自訂欄位，幾乎所有站都會用到 |
| **Cookie 同意** | Complianz | Free / Pro | 見決策樹 §4.1 |

---

## 二、電商模組

> 含電商的站型一律疊加此模組，完整一套，不因站型而縮減。

| 類別 | 外掛 | Free/Pro | 說明 |
|------|------|---------|------|
| **電商核心** | WooCommerce | Free | 所有電商功能基礎 |
| **商店美化** | Kadence Shop Kit | Pro | 商品頁、分類頁、購物車美化 |
| **訂單郵件** | Kadence WooCommerce Email Designer | Free / Pro | 品牌化訂單通知郵件 |
| **台灣金流** | ECPay（綠界）| Free 外掛 | 信用卡 + 超商取貨付款 |
| **國際金流** | WooCommerce Stripe Gateway | Free | 國際信用卡 |
| **發票/收據** | WooCommerce PDF Invoices & Packing Slips | Free / Pro | 自動產生 PDF 收據 |
| **收藏清單** | YITH WooCommerce Wishlist | Free / Pro | 商品願望清單 |
| **點數獎勵** | YITH WooCommerce Points and Rewards | Pro | 回頭客消費點數 |
| **商品評價** | Fluent Reviews for WooCommerce | Free / Pro | 照片評論、驗證購買 |
| **顏色/尺寸** | Variation Swatches for WooCommerce | Free / Pro | 商品屬性色塊選擇 |
| **結帳優化** | CartFlows 或 FunnelKit | Free / Pro | 結帳漏斗（二選一，見 §6.3） |
| **棄車追回** | WooCommerce Cart Abandonment Recovery | Free | CartFlows 套件內含 |

---

## 三、站型專屬模組

### 3.1 旅遊業（追加）

> 疊加在基礎全員之上；有電商再加電商模組。

| 類別 | 外掛 | Free/Pro | 說明 |
|------|------|---------|------|
| **預約系統** | WP Travel Engine 或 Amelia | Free/Pro / Pro | 行程套裝預約（見 §4.3） |
| **內容類型** | Custom Post Type UI (CPT UI) | Free | 建立「行程」「景點」自訂類型 |
| **相片集** | Modula Gallery | Free / Pro | 旅遊照片集、行程相冊 |
| **地圖路線** | WP Maps Pro 或 Leaflet Maps | 付費 / Free | 行程地圖、景點標記 |
| **多語系** | TranslatePress | Free / Pro | 有國際客源時必裝（見 §4.4） |

### 3.2 形象站 / 品牌站（追加）

> 疊加在基礎全員之上；有電商再加電商模組。

| 類別 | 外掛 | Free/Pro | 說明 |
|------|------|---------|------|
| **內容類型** | Custom Post Type UI (CPT UI) | Free | 建立「作品」「案例」自訂類型 |
| **作品集展示** | Modula 或 FooGallery | Free / Pro | 視覺作品集、圖片展示 |
| **訂閱跳出** | Popup Maker | Free / Pro | 訂閱名單 / 聯絡跳出視窗 |

---

## 四、決策樹

### 4.1 Cookie / 隱私同意（Complianz）

```
客戶有歐美流量目標？  ── 是 ──→ 裝 Complianz（必裝）
       │
       否
       │
客戶有放 Meta Pixel 或 Google Ads？ ── 是 ──→ 裝 Complianz（建議）
       │
       否
       │
純台灣本地客群 ──→ 暫不裝（需要時補裝，Complianz 不影響現有功能）
```

### 4.2 金流組合

```
客戶服務地區？
  ├─ 台灣為主 ──→ ECPay（必裝）+ Stripe（選配，接受國際卡）
  ├─ 國際為主 ──→ Stripe（必裝）+ ECPay（選配）
  └─ 台灣 + 國際 ──→ ECPay + Stripe 都裝
```

> 新商家申請 ECPay 需審核時間（約 3–5 個工作天），開案時提早處理。

### 4.3 旅遊預約系統

```
需求類型？
  ├─ 行程套裝 / 多日遊 ──→ WP Travel Engine（Free 基礎功能夠用，Pro 加進階篩選）
  ├─ 單次預約 / 服務型 ──→ Amelia（Pro，含行事曆 + 付款整合）
  └─ 純資訊展示（不含線上預約）──→ 不裝預約系統，CPT UI + ACF 展示行程資訊即可
```

### 4.4 多語系

```
客戶有國際訪客目標？
  ├─ 是 ──→ TranslatePress（Free 基礎版支援 2 語系；Pro 無限語系）
  └─ 否 ──→ 不裝（不要為「萬一」預裝翻譯外掛，會增加頁面重量）
```

---

## 五、組合速查矩陣

| 站型 | 基礎全員 | 電商模組 | 旅遊模組 | 形象模組 |
|------|:-------:|:-------:|:-------:|:-------:|
| 旅遊（無電商） | ✅ | — | ✅ | — |
| 旅遊（含電商） | ✅ | ✅ | ✅ | — |
| 形象（無電商） | ✅ | — | — | ✅ |
| 形象（含電商） | ✅ | ✅ | — | ✅ |
| 一般電商 | ✅ | ✅ | — | — |

---

## 六、注意事項

### 6.1 快取外掛選擇

| 主機環境 | 建議快取外掛 |
|---------|------------|
| Hostinger（LiteSpeed 伺服器） | **LiteSpeed Cache**（免費，整合最佳） |
| 其他主機（Apache / Nginx） | **WP Rocket**（付費，設定最省事） |
| Cloudflare 前置 | 兩者皆需關閉 HTML 快取衝突選項 |

### 6.2 SMTP 發信供應商

FluentSMTP 本身不提供郵件發送能力，需搭配 SMTP 供應商：

| 用量 | 建議供應商 |
|------|----------|
| 低量（< 300 封/天） | Gmail SMTP（免費，需 App Password） |
| 中量（< 3,000 封/天） | Brevo（前 Sendinblue）免費方案 |
| 高量 / 電商 | Postmark 或 Amazon SES（付費，deliverability 最佳） |

### 6.3 CartFlows vs FunnelKit

兩者功能重疊，**只選一個**：

- **CartFlows**：較輕量，免費版含棄車追回，適合大多數電商
- **FunnelKit**：功能更完整（含 CRM），但學習曲線較高

### 6.4 已知衝突 / 注意

| 情境 | 注意事項 |
|------|---------|
| CartFlows + FunnelKit | 二選一，不可同時啟用 |
| TranslatePress + WPML | 二選一，不可同時啟用 |
| WP Rocket + LiteSpeed Cache | 同主機只啟用一個快取外掛 |
| Wordfence + 其他防火牆外掛 | 只啟用一個防火牆層 |
| WooCommerce PDF Invoices | 注意台灣電子發票法規（ECPay 另有電子發票方案） |

### 6.5 MainWP 管理整合

所有客戶站安裝的外掛應在 MainWP Dashboard 同步登記：

- 外掛更新流程 → [`WP_MANAGED_UPDATES.md`](WP_MANAGED_UPDATES.md)
- 備份狀態確認 → WPvivid + MainWP 整合
- 更新波次設定 → `tenants/<client>/core/wp-update-config.json`

### 6.6 新案安裝建議順序

```
1. Kadence Theme + Blocks
2. Really Simple SSL（先強制 HTTPS）
3. Wordfence（先建立安全基礎）
4. WPvivid（先有備份才繼續）
5. Rank Math SEO + Redirection
6. Fluent Forms + FluentSMTP（設定好 SMTP 供應商）
7. FluentCRM
8. LiteSpeed Cache / WP Rocket（效能外掛最後設定避免干擾其他外掛啟動）
9. ShortPixel / Imagify
10. GTM4WP（設定 GA4 容器）
11. CleanTalk 或 Akismet
12. Complianz（依決策樹）
13. ACF
---- 站型模組 ----
14. 旅遊 / 形象 專屬模組
---- 電商模組（若需要）----
15. WooCommerce → Kadence Shop Kit → 金流 → 其他電商外掛
```

---

## 七、擴充說明

新增站型（如：餐飲、房地產、醫療）：
1. 在「三、站型專屬模組」新增 `### 3.X 新站型` 區塊
2. 在「五、組合速查矩陣」新增一行
3. 若有新決策邏輯，在「四、決策樹」新增區塊

移除外掛：
1. 在對應表格中刪除該行
2. 若有決策樹依賴，同步更新

---

## Changelog

| 日期 | 變更說明 |
|------|---------|
| 2026-05-12 | 初版建立：基礎全員 + 電商模組 + 旅遊/形象模組 + 4 個決策樹 |
