# WP_CLIENT_PLUGIN_STACK.md

> **Owner File** — WordPress 客戶站外掛標準堆疊（選型 + 組合邏輯）。  
> **不涵蓋**：更新流程 → [`WP_MANAGED_UPDATES.md`](WP_MANAGED_UPDATES.md)；交付模式 → [`WORDPRESS_CLIENT_DELIVERY_MODELS.md`](WORDPRESS_CLIENT_DELIVERY_MODELS.md)。  
> **Last updated**: 2026-07-02  
> **讀者**：營運者、AI 代理、協作工程師

---

## 如何使用

```
新案開工 → 基礎全員（必裝，含維運層）
  + 有電商？           → 疊加「電商模組」
  + POD/客製商品電商？  → 疊加「電商模組」+「POD 模組」→ manifest wc-custom
  + 旅遊業？           → 疊加「旅遊模組」
  + 形象/品牌站？       → 疊加「形象模組」

單一站可同時疊加多個模組（如：旅遊 + 電商）
```

---

## 外掛生態系授權建議（先讀）

| 生態系 | 核心外掛 | 授權策略 |
|--------|---------|---------|
| **Kadence** | Theme、Blocks、Shop Kit、Email Designer | 買 Kadence Full Bundle（一次含全部） |
| **Fluent** | Forms、SMTP、CRM、Reviews | 買 Fluent Forms + CRM Pro Bundle；SMTP 永久免費 |
| **WooCommerce** | Points & Rewards、Product Add-Ons | WooCommerce.com 官方購買（per-site 授權） |
| **WordPressIT** | 所有付費 zip 統一由此訂閱取得；zip 放到 VPS `/opt/lobster-plugins/` | 見 §8.4 |

> 以上授權為 per-site 或 unlimited site，開案前確認授權數量。

---

## 一、維運層（manifest 自動裝，所有站）

> 由 manifest step runner 負責，**不經由** `wp plugin install` 安裝。  
> installSource: `manifest` — 安裝時機早於 catalog 內容層。

| 類別 | 外掛 | installSource | 說明 |
|------|------|--------------|------|
| **管理整合** | mainwp-child | manifest | MainWP Dashboard 連線必要；所有 4 個 manifest 均含此 step |
| **AwareWave 整合** | AwareWave WP Bridge | release-url | 從 `awarewaveai-pei/aware-wave-wp-bridge` tag→Action 取得；Phase 1 接線中 |

---

## 二、基礎全員必裝（所有站）

> 所有站型（旅遊、形象、電商）全部必裝，無例外。  
> 共 **16 個功能位**（維運層 2 個在 §一，不重複計算）。  
> **★** = catalog 主 `slug`；**↩** = 替代 `alternativeSlug`（free:false 時自動改用）；**†** = 選配（`required: false`）

| 類別 | 外掛 | installSource | WP.org Slug | 說明 |
|------|------|--------------|-------------|------|
| **主題框架** | Kadence Theme | wporg | `kadence` | 所有頁面基礎（旅遊站排除，改用 TravelWP） |
| **主題框架** | Kadence Blocks | wporg | `kadence-blocks` | 視覺區塊編輯器（旅遊站排除，改用 Elementor） |
| **安全** | Wordfence Security | wporg | `wordfence` | 防火牆 + 惡意掃描 |
| **備份** | WPvivid Backup | wporg | `wpvivid-backups-and-migration` | 連動 MainWP 管理 |
| **SEO** | Rank Math SEO | wporg | `seo-by-rank-math` | SEO + Schema + 部落格結構化 |
| **SEO 跳轉** | Redirection | wporg | `redirection` | 管理 301/302，改版必用 |
| **快取/效能** | LiteSpeed Cache ★ | wporg | `litespeed-cache` | 條件安裝（`is_litespeed` 主機才裝）；非 LiteSpeed 主機需另行處理 |
| **圖片壓縮** | ShortPixel ★ | wporg | `shortpixel-image-optimiser` | 搭快取一起啟用 |
| **SSL** | Really Simple SSL | wporg | `really-simple-ssl` | 強制 HTTPS |
| **表單** | Fluent Forms | wporg | `fluentform` | 聯絡、詢問、預約表單 |
| **SMTP 發信** | FluentSMTP | wporg | `fluent-smtp` | 搭配 SMTP 供應商（見 §6.2） |
| **CRM / 名單** | FluentCRM | wporg | `fluent-crm` | 訂閱名單、後續行銷自動化 |
| **反垃圾（★首選）** | CleanTalk ★ → Akismet ↩ | manual-zip / wporg | PAID → `akismet` | 付費首選；替代品 Akismet 自動裝 |
| **分析追蹤** | GTM4WP | wporg | `duracelltomi-google-tag-manager` | GA4 + Meta Pixel 皆透過 GTM 管理 |
| **內容結構** | Advanced Custom Fields (ACF) | wporg | `advanced-custom-fields` | 自訂欄位，幾乎所有站都會用到 |
| **Cookie 同意** | Complianz † | wporg | `complianz-gdpr` | 見決策樹 §4.1；† 選配非強制 |

---

## 三、電商模組（wc-core + wc-custom）

> 含電商的站型一律疊加此模組，完整一套，不因站型而縮減。  
> 共 **13 個功能位**。

| 類別 | 外掛 | installSource | WP.org Slug | 說明 |
|------|------|--------------|-------------|------|
| **電商核心** | WooCommerce | wporg | `woocommerce` | 所有電商功能基礎 |
| **商店美化** | Kadence Shop Kit | manual-zip | PAID | 商品頁、分類頁、購物車美化；WordPressIT |
| **訂單郵件** | Kadence Email Designer | wporg | `kadence-woocommerce-email-designer` | 品牌化 WooCommerce 系統通知信（訂單/出貨/退款）；與 FluentCRM 互補，非競爭 |
| **台灣金流** | ECPay（綠界）| manual-zip | PAID | 信用卡 + 超商取貨付款；WordPressIT |
| **國際金流** | WooCommerce Stripe Gateway | wporg | `woocommerce-gateway-stripe` | 國際信用卡（含 Google Pay / Apple Pay）|
| **國際金流** | PayPal Payments | wporg | `woocommerce-paypal-payments` | PayPal 國際付款 |
| **發票/收據** | WooCommerce PDF Invoices & Packing Slips | wporg | `woocommerce-pdf-invoices-packing-slips` | 自動產生 PDF 收據 |
| **收藏清單** | WooCommerce Wishlist | wporg | `ti-woocommerce-wishlist` | ThemeIsle 官方，免費，無 YITH 依賴 |
| **點數獎勵** | WooCommerce Points and Rewards | manual-zip | PAID | WooCommerce 官方出品；WordPressIT |
| **商品評價** | Fluent Reviews for WooCommerce | wporg | `fluent-reviews` | 照片評論、驗證購買 |
| **顏色/尺寸** | Variation Swatches for WooCommerce | wporg | `variation-swatches-for-woocommerce` | 商品屬性色塊選擇 |
| **結帳優化** | CartFlows ★ | wporg | `cartflows` | 結帳漏斗優化 |
| **棄車追回** | Cart Abandonment Recovery | wporg | `woo-cart-abandonment-recovery` | CartFlows 套件內含 |

---

## 四、POD 模組（wc-custom 專屬）

> 僅限 POD（Print on Demand）/客製商品電商。manifest slug = `wc-custom`。  
> 共 **1 個功能位**。

| 類別 | 外掛 | installSource | WP.org Slug | 說明 |
|------|------|--------------|-------------|------|
| **商品附加/上傳** | WooCommerce Product Add-Ons | manual-zip | PAID | 客戶於結帳上傳設計圖；WordPressIT |

---

## 五、站型專屬模組

### 5.1 旅遊業（追加）

> 疊加在基礎全員之上；manifest slug = `wp-tourism`（獨立 manifest，裝 TravelWP 主題而非 Kadence）。  
> 旅遊站**不安裝** Kadence Theme + Kadence Blocks（catalog `excludeForModules: ["tourism"]`）。  
> 共 **7 個功能位**。

| 類別 | 外掛 | installSource | WP.org Slug | 說明 |
|------|------|--------------|-------------|------|
| **主題** | TravelWP Theme（Physcode，$35） | manual-zip | `travelwp` | 旅遊業專屬主題，內建行程展示 + WooCommerce 預約整合；zip 放 `/opt/lobster-plugins/travelwp.zip` |
| **頁面建構** | Elementor | wporg | `elementor` | TravelWP 使用 Elementor 建構版型（取代 Kadence Blocks） |
| **預約金流** | WooCommerce | wporg | `woocommerce` | TravelWP 透過 WooCommerce 處理行程付款 / 預約 |
| **內容類型** | Custom Post Type UI (CPT UI) | wporg | `custom-post-type-ui` | 建立「行程」「景點」自訂類型 |
| **相片集** | Modula Gallery | wporg | `modula-best-grid-gallery` | 旅遊照片集、行程相冊 |
| **地圖路線** | WP Maps Pro ★ → Leaflet ↩ | manual-zip / wporg | PAID → `leaflet-map` | 付費首選；無預算用 Leaflet 替代（自動） |
| **多語系** | TranslatePress † | wporg | `translatepress-multilingual` | 有國際客源時選裝；† 選配 |

### 5.2 形象站 / 品牌站（追加）

> 疊加在基礎全員之上；manifest slug = `wp-business`。  
> 共 **3 個功能位**。

| 類別 | 外掛 | installSource | WP.org Slug | 說明 |
|------|------|--------------|-------------|------|
| **內容類型** | Custom Post Type UI (CPT UI) | wporg | `custom-post-type-ui` | 建立「作品」「案例」自訂類型 |
| **作品集展示** | Modula Gallery ★ | wporg | `modula-best-grid-gallery` | 視覺作品集、圖片展示 |
| **訂閱跳出** | Popup Maker | wporg | `popup-maker` | 訂閱名單 / 聯絡跳出視窗 |

---

## 六、組合速查矩陣

| 站型 | manifest slug | 維運層 | 基礎全員 | 電商 | POD | 旅遊 | 形象 | 合計 |
|------|-------------|:------:|:-------:|:---:|:---:|:----:|:----:|:----:|
| 名片站 | wp-basic | ✅ | ✅ | — | — | — | — | 18 |
| 品牌+CRM | wp-business | ✅ | ✅ | — | — | — | ✅ | 21 |
| 觀光/預約 | wp-tourism | ✅ | ✅（−Kadence 2） | — | — | ✅ | — | 23 |
| 標準電商 | wc-core | ✅ | ✅ | ✅ | — | — | — | 31 |
| POD 電商 | wc-custom | ✅ | ✅ | ✅ | ✅ | — | — | 32 |

> 合計含維運層（2）+ 基礎（16）+ 模組，選配（†）和條件（✴ LiteSpeed）均計入。

---

## 七、決策樹

### 7.1 Cookie / 隱私同意（Complianz）

```
客戶有歐美流量目標？  ── 是 ──→ 裝 Complianz（必裝）
       │
       否
       │
客戶有放 Meta Pixel 或 Google Ads？ ── 是 ──→ 裝 Complianz（建議）
       │
       否
       │
純台灣本地客群 ──→ 暫不裝（需要時補裝，不影響現有功能）
```

### 7.2 金流組合

```
客戶服務地區？
  ├─ 台灣為主  ──→ ECPay（必裝）+ Stripe + PayPal（選配）
  ├─ 國際為主  ──→ Stripe + PayPal（必裝）+ ECPay（選配）
  └─ 台灣+國際 ──→ ECPay + Stripe + PayPal 都裝

注意：Google Pay / Apple Pay 走 Stripe 原生支援，不需另裝外掛。
LINE Pay（台灣）走 ECPay 支援，不需另裝外掛。
```

> 新商家申請 ECPay 需審核時間（約 3–5 個工作天），開案時提早處理。

### 7.3 旅遊預約系統

所有旅遊站一律使用 TravelWP 主題（manifest `wp-tourism`）+ WooCommerce，預約功能由主題原生提供。

```
有線上預約需求？
  ├─ 是 ──→ TravelWP + WooCommerce（標準旅遊模組，已含蓋行程/付款）
  └─ 否（純資訊展示）──→ TravelWP 主題仍裝；停用 WooCommerce checkout；CPT UI + ACF 展示即可
```

### 7.4 多語系

```
客戶有國際訪客目標？
  ├─ 是 ──→ TranslatePress（Free 基礎版支援 2 語系）
  └─ 否 ──→ 不裝（不要為「萬一」預裝翻譯外掛，增加頁面重量）
```

---

## 八、注意事項

### 8.1 快取外掛選擇

LiteSpeed Cache 是**條件安裝**（`condition: "is_litespeed"`）：

| 主機環境 | 快取方案 |
|---------|---------|
| Hetzner（AwareWave 自架，Nginx）| 不裝 LiteSpeed Cache；用 Nginx FastCGI Cache 或 Cloudflare |
| LiteSpeed 主機（如 Hostinger）| LiteSpeed Cache（manifest 自動裝）|

### 8.2 SMTP 發信供應商

FluentSMTP 本身不提供郵件發送能力，需搭配 SMTP 供應商：

| 用量 | 建議供應商 |
|------|----------|
| 低量（< 300 封/天） | Gmail SMTP（免費，需 App Password） |
| 中量（< 3,000 封/天） | Brevo（前 Sendinblue）免費方案 |
| 高量 / 電商 | Postmark 或 Amazon SES（付費，deliverability 最佳） |

### 8.3 已知衝突 / 注意

| 情境 | 注意事項 |
|------|---------|
| TranslatePress + WPML | 二選一，不可同時啟用 |
| Wordfence + 其他防火牆外掛 | 只啟用一個防火牆層 |
| WooCommerce PDF Invoices | 注意台灣電子發票法規（ECPay 另有電子發票方案）|
| WooCommerce Wishlist | 選用 ti-woocommerce-wishlist（免費），不用 YITH（相容性疑慮）|
| Points & Rewards | 選用 woocommerce-points-and-rewards（WooCommerce 官方），不用 YITH |

### 8.4 安裝順序建議

```
1. 維運層：manifest 自動裝（mainwp-child、litespeed 條件）
2. [非旅遊站] Kadence Theme + Blocks
   [旅遊站]   TravelWP 主題（manifest wp-tourism 自動裝）+ Elementor
3. Really Simple SSL（先強制 HTTPS）
4. Wordfence（先建立安全基礎）
5. WPvivid（先有備份才繼續）
6. Rank Math SEO + Redirection
7. Fluent Forms + FluentSMTP（設定好 SMTP 供應商）
8. FluentCRM
9. ShortPixel
10. GTM4WP（設定 GA4 容器）
11. CleanTalk（zip）或 Akismet（自動替代）
12. Complianz（依決策樹）
13. ACF
---- 站型模組 ----
14. 旅遊 / 形象 專屬模組
---- 電商模組（若需要）----
15. WooCommerce → Kadence Shop Kit（zip）→ ECPay（zip）→ Stripe → PayPal → 其他電商外掛
---- POD 模組（若需要）----
16. WooCommerce Product Add-Ons（zip）
```

---

## 九、擴充說明

新增站型（如：餐飲、房地產、醫療）：
1. 在「五、站型專屬模組」新增 `### 5.X 新站型` 區塊
2. 在「六、組合速查矩陣」新增一行
3. 若有新決策邏輯，在「七、決策樹」新增區塊
4. 同步更新 `lib/wp-plugin-stack-catalog.ts`（機器可讀 SSOT），兩份不得分叉

新增或替換外掛：
1. 在對應表格中新增/修改，填寫正確 `WP.org Slug` 和 `installSource`
2. 同步更新 `lib/wp-plugin-stack-catalog.ts` 對應條目

---

## 十、自動化執行系統

### 10.1 兩層架構（Manifest = 容器，Catalog = 內容）

```
┌──────────────────────────────────────────────────────────────────┐
│ WP_CLIENT_PLUGIN_STACK.md（本文件，人類可讀 SSOT）                  │
│   ↓ 手動同步（slug 維護責任見 §九）                                    │
│ lib/wp-plugin-stack-catalog.ts（機器可讀 mirror，42 entries）        │
└──────────────────────────────────────────────────────────────────┘
        ↓                                          ↓
┌─────────────────────────┐          ┌─────────────────────────────┐
│ Manifest 容器層           │          │ Catalog 內容層                │
│ packages/manifests/*.json│          │ resolveInstallableSlugsForPacks()│
│                          │          │ resolvePaidPluginsForPacks()  │
│ 職責：                    │          │                               │
│ • install_theme          │          │ 職責：                          │
│   (kadence/travelwp)     │          │ • 18 base + 站型/電商/POD 模組 │
│ • mainwp-child (維運)    │          │ • excludeForModules 過濾旅遊站  │
│ • litespeed (主機條件)   │          │ • 動態組合（依 packs）           │
│ • postInstall hooks      │          │ • 跳過 manifest/release-url   │
│ • verification           │          │   來源（不重複安裝）             │
│ • rollback strategy      │          │                               │
└─────────────────────────┘          └─────────────────────────────┘
        ↓                                          ↓
        └──────────────┬───────────────────────────┘
                       ↓
              SSH + wp-cli on target host
                       ↓
              Supabase package_install_runs
```

### 10.2 installSource 類型

| installSource | 數量 | 說明 | 操作員介入 |
|--------------|:----:|------|:--------:|
| `manifest` | 1 | manifest step runner 安裝（mainwp-child） | ❌ 全自動 |
| `release-url` | 1 | GitHub release zip 自動取得（wp-bridge，Phase 1）| ❌ 全自動（Phase 1 完成後）|
| `wporg` | 33 | WP.org → `wp plugin install <slug>` | ❌ 全自動 |
| `manual-zip` + `alternativeSlug` | 2 | 付費首選，但有免費替代；替代品自動裝 | ❌ 全自動（裝替代）|
| `manual-zip` 無替代 | 5 | 必須上傳 zip；見 §10.3 | ✅ 需操作員 |

> **5 個需操作員手動上傳的 zip**：TravelWP Theme、Kadence Shop Kit、ECPay（綠界）、WooCommerce Points and Rewards、WooCommerce Product Add-Ons

### 10.3 付費 zip 交付 Runbook

所有付費 zip 統一放在 VPS `/opt/lobster-plugins/`（SG + EU 各一份）：

```bash
# 檔案命名規則（與 catalog slug 一致）
/opt/lobster-plugins/travelwp.zip                        # 旅遊站主題，physcode.com $35
/opt/lobster-plugins/kadence-shop-kit.zip
/opt/lobster-plugins/ecpay-payment-gateway.zip
/opt/lobster-plugins/woocommerce-points-and-rewards.zip
/opt/lobster-plugins/woocommerce-product-addons.zip
```

**操作流程（WordPressIT）**：
1. WordPressIT 帳號 → 下載 zip
2. 整理成以上命名後告知工程師 → SFTP 上傳至 SG + EU VPS `/opt/lobster-plugins/`
3. 安裝任務會自動從此路徑取 zip

**當 `/ops/clients/[slug]` 顯示「⚠ 需手動上傳」時**：代表 VPS zip 尚未就位，請先完成步驟 1-2。

### 10.4 下游消費者地圖

| 角色 | 檔案 | 用途 |
|------|------|------|
| **TypeScript SSOT mirror** | `lobster-factory/infra/.../lib/wp-plugin-stack-catalog.ts` | 機器可讀外掛資料 + resolve 函式 |
| **OnboardWizard Step 2** | `lobster-factory/infra/.../app/onboard/OnboardWizard.tsx` | 操作員選站型 + 顯示外掛數量 |
| **BuildConsole** | `lobster-factory/infra/.../app/build/BuildConsole.tsx` | URL params 帶入後顯示綠色摘要 |
| **BuildRunRequest 合約** | `lobster-factory/infra/.../lib/build-console/contracts.ts` | `packageSlug` / `pluginSlugs` 欄位 |
| **Trigger.dev 安裝 task** | `lobster-factory/packages/workflows/src/tasks/wp-install-plugins.ts` | SSH + wp-cli install 執行層 |
| **Trigger.dev 容器 task** | `lobster-factory/packages/workflows/src/trigger/apply-manifest.ts` | 主題 + postInstall + verification |
| **Orchestrator workflow** | `lobster-factory/packages/workflows/src/trigger/create-wp-site.ts` | 依序觸發 apply-manifest → wp-install-plugins |

### 10.5 漂移防護

兩份不同步是最大風險。每次修改本文件 §二/三/四/五 後**必須**同步更新 `lib/wp-plugin-stack-catalog.ts`。

### 10.6 不可違反的紅線

1. 本文件之外**不得**有第二份「使用者外掛清單」
2. Manifest 加任何外掛前先問：這是運維基礎設施嗎？不是 → 加進本文件而非 Manifest
3. catalog.ts 改任何 slug → 立即同步本文件，反之亦然
4. 付費外掛永遠不嘗試 `wp plugin install`（會失敗污染 log）→ 由 `free: false` + `installSource` 自動處理
5. **不得**使用 YITH 系列外掛（相容性疑慮）→ 改用 WooCommerce 官方或 ThemeIsle 替代

---

## Changelog

| 日期 | 變更說明 |
|------|---------|
| 2026-05-12 | 初版建立：基礎全員 + 電商模組 + 旅遊/形象模組 + 4 個決策樹 |
| 2026-05-12 | 品質修訂：所有表格加入 WP.org Slug 欄；★/↩/† 標記規範；Complianz 選配說明 |
| 2026-06-29 | 全面同步 catalog.ts（Phase 0 完成後）：新增維運層（mainwp-child/wp-bridge）；新增 installSource 欄位；新增 POD 模組；電商 12→13（+PayPal）；基礎 16→18；YITH 全部替換為 WooCommerce 官方/ThemeIsle；zip 交付改為 VPS /opt/lobster-plugins/；組合矩陣加 POD 電商欄；catalog entries 36→40 |
| 2026-07-02 | 旅遊站切換 TravelWP 主題：移除 WP Travel Engine + Amelia；加 TravelWP（manual-zip）+ Elementor + WooCommerce；新增 manifest `wp-tourism`；Kadence+KadenceBlocks 加 `excludeForModules: ["tourism"]`；決策樹 §7.3 改寫；catalog entries 40→42 |
