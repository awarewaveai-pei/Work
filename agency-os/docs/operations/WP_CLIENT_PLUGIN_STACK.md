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
> 所有站都有部落格 → CleanTalk ★ / Akismet ↩ 二選一覆蓋反垃圾。  
> **★** = 首選（catalog.ts 主 `slug`）；**↩** = 替代（catalog.ts `alternativeSlug`）；**†** = 選配（`required: false`，非強制）  
> 共 **16 個功能位**（快取/效能、圖片壓縮、反垃圾各算 1 位，含首選與替代）。

| 類別 | 外掛 | Free/Pro | WP.org Slug | 說明 |
|------|------|---------|-------------|------|
| **主題框架** | Kadence Theme | Free / Pro | `kadence` | 所有頁面基礎 |
| **主題框架** | Kadence Blocks | Free / Pro | `kadence-blocks` | 視覺區塊編輯器 |
| **安全** | Wordfence Security | Free / Pro | `wordfence` | 防火牆 + 惡意掃描 |
| **備份** | WPvivid Backup | Free / Pro | `wpvivid-backups-and-migration` | 連動 MainWP 管理 |
| **SEO** | Rank Math SEO | Free / Pro | `seo-by-rank-math` | SEO + Schema + 部落格文章結構化 |
| **SEO 跳轉** | Redirection | Free | `redirection` | 管理 301/302，改版必用 |
| **快取/效能** | LiteSpeed Cache ★ / WP Rocket ↩ | Free / PAID | `litespeed-cache` ★ / PAID | ★首選；非 LiteSpeed 主機改用 WP Rocket（見 §6.1） |
| **圖片壓縮** | ShortPixel ★ / Imagify ↩ | 免費額度/付費 | `shortpixel-image-optimiser` ★ / `imagify` | ★首選；搭快取一起啟用 |
| **SSL** | Really Simple SSL | Free | `really-simple-ssl` | 強制 HTTPS |
| **表單** | Fluent Forms | Free / Pro | `fluentform` | 聯絡、詢問、預約表單 |
| **SMTP 發信** | FluentSMTP | Free | `fluent-smtp` | 搭配 SMTP 供應商使用（見 §6.2） |
| **CRM / 名單** | FluentCRM | Free / Pro | `fluent-crm` | 訂閱名單、後續行銷自動化 |
| **反垃圾（★首選）** | CleanTalk | 付費訂閱 | PAID | 覆蓋表單 + 留言 + 註冊；替代：Akismet ↩ |
| **反垃圾（↩替代）** | Akismet | Free（需授權）| `akismet` | 僅覆蓋留言；CleanTalk 的精簡替代 |
| **分析追蹤** | GTM4WP | Free | `duracelltomi-google-tag-manager` | GA4 + Meta Pixel 皆透過 GTM 管理，不裝獨立追蹤外掛 |
| **內容結構** | Advanced Custom Fields (ACF) | Free / Pro | `advanced-custom-fields` | 自訂欄位，幾乎所有站都會用到 |
| **Cookie 同意** | Complianz † | Free / Pro | `complianz-gdpr` | 見決策樹 §4.1；† 選配非強制 |

> **catalog.ts 行為**：★ 為主 `slug`，若 `free: false` 則 `resolveInstallableSlugs` 改用 `alternativeSlug`（↩）自動安裝；† 表示 `required: false`，仍列入安裝清單但可略過。

---

## 二、電商模組

> 含電商的站型一律疊加此模組，完整一套，不因站型而縮減。  
> 共 **12 個功能位**（結帳優化 CartFlows ★ / FunnelKit ↩ 算 1 位）。

| 類別 | 外掛 | Free/Pro | WP.org Slug | 說明 |
|------|------|---------|-------------|------|
| **電商核心** | WooCommerce | Free | `woocommerce` | 所有電商功能基礎 |
| **商店美化** | Kadence Shop Kit | Pro | PAID | 商品頁、分類頁、購物車美化 |
| **訂單郵件** | Kadence WooCommerce Email Designer | Free / Pro | `kadence-woocommerce-email-designer` | 品牌化訂單通知郵件 |
| **台灣金流** | ECPay（綠界）| Free 外掛 | DIRECT | 信用卡 + 超商取貨付款；需從 ECPay 官方下載，非 WP.org |
| **國際金流** | WooCommerce Stripe Gateway | Free | `woocommerce-gateway-stripe` | 國際信用卡 |
| **發票/收據** | WooCommerce PDF Invoices & Packing Slips | Free / Pro | `woocommerce-pdf-invoices-packing-slips` | 自動產生 PDF 收據 |
| **收藏清單** | YITH WooCommerce Wishlist | Free / Pro | `yith-woocommerce-wishlist` | 商品願望清單 |
| **點數獎勵** | YITH WooCommerce Points and Rewards | Pro | PAID | 回頭客消費點數 |
| **商品評價** | Fluent Reviews for WooCommerce | Free / Pro | `fluent-reviews` | 照片評論、驗證購買 |
| **顏色/尺寸** | Variation Swatches for WooCommerce | Free / Pro | `variation-swatches-for-woocommerce` | 商品屬性色塊選擇 |
| **結帳優化** | CartFlows ★ / FunnelKit ↩ | Free / Pro | `cartflows` ★ / `funnel-builder` | ★首選；二選一，見 §6.3 |
| **棄車追回** | WooCommerce Cart Abandonment Recovery | Free | `woo-cart-abandonment-recovery` | CartFlows 套件內含 |

---

## 三、站型專屬模組

### 3.1 旅遊業（追加）

> 疊加在基礎全員之上；有電商再加電商模組。  
> 共 **5 個功能位**（預約系統、地圖路線各 1 位含替代）。

| 類別 | 外掛 | Free/Pro | WP.org Slug | 說明 |
|------|------|---------|-------------|------|
| **預約系統** | WP Travel Engine ★ / Amelia ↩ | Free/Pro / PAID | `wp-travel-engine` ★ / PAID | ★行程套裝首選；服務型預約改用 Amelia（見 §4.3） |
| **內容類型** | Custom Post Type UI (CPT UI) | Free | `custom-post-type-ui` | 建立「行程」「景點」自訂類型 |
| **相片集** | Modula Gallery | Free / Pro | `modula-best-grid-gallery` | 旅遊照片集、行程相冊 |
| **地圖路線** | WP Maps Pro ★ / Leaflet Maps ↩ | PAID / Free | PAID / `leaflet-map` ↩ | ★功能完整（付費）；無預算用 Leaflet 替代 |
| **多語系** | TranslatePress | Free / Pro | `translatepress-multilingual` | 有國際客源時必裝（見 §4.4） |

### 3.2 形象站 / 品牌站（追加）

> 疊加在基礎全員之上；有電商再加電商模組。  
> 共 **3 個功能位**（作品集展示含首選與替代）。

| 類別 | 外掛 | Free/Pro | WP.org Slug | 說明 |
|------|------|---------|-------------|------|
| **內容類型** | Custom Post Type UI (CPT UI) | Free | `custom-post-type-ui` | 建立「作品」「案例」自訂類型 |
| **作品集展示** | Modula ★ / FooGallery ↩ | Free / Pro | `modula-best-grid-gallery` ★ / `foogallery` | ★首選；視覺作品集、圖片展示 |
| **訂閱跳出** | Popup Maker | Free / Pro | `popup-maker` | 訂閱名單 / 聯絡跳出視窗 |

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
1. 在「三、站型專屬模組」新增 `### 3.X 新站型` 區塊，含 `WP.org Slug` 欄位
2. 在「五、組合速查矩陣」新增一行
3. 若有新決策邏輯，在「四、決策樹」新增區塊
4. 同步更新 `lib/wp-plugin-stack-catalog.ts`（機器可讀 SSOT），兩份不得分叉

新增或替換外掛：
1. 在對應表格中新增/修改該行，填寫正確 `WP.org Slug`（付費或非 WP.org 者標 `PAID` / `DIRECT`）
2. 同步更新 `lib/wp-plugin-stack-catalog.ts` 對應條目
3. 若需新首選 / 替代邏輯，更新 `★` / `↩` 標記與 `alternativeSlug` 欄位

移除外掛：
1. 在對應表格中刪除該行
2. 若有決策樹依賴，同步更新
3. 同步刪除 `lib/wp-plugin-stack-catalog.ts` 對應條目

> **Slug 維護責任**：`WP.org Slug` 欄為機器可讀 catalog 的唯一 slug 來源。  
> 外掛改名或 slug 異動時，務必兩份同步更新（MD + catalog.ts）。

---

## 八、自動化執行系統（本文件是 SSOT，下游消費者列表）

> 本文件（`WP_CLIENT_PLUGIN_STACK.md`）是**人類可讀的外掛清單真相**。  
> 所有自動化系統都從這裡衍生，不得繞過或自行另立清單。

### 8.1 兩層架構（Manifest = 容器，Catalog = 內容）

```
┌──────────────────────────────────────────────────────────────────┐
│ WP_CLIENT_PLUGIN_STACK.md（本文件，人類可讀 SSOT）                │
│   ↓ 手動同步（slug 維護責任見 §七）                                  │
│ lib/wp-plugin-stack-catalog.ts（機器可讀 mirror，36 entries）       │
└──────────────────────────────────────────────────────────────────┘
        ↓                                          ↓
┌─────────────────────────┐          ┌─────────────────────────────┐
│ Manifest 容器層          │          │ Catalog 內容層                │
│ packages/manifests/*.json│          │ resolveInstallableSlugs()     │
│                          │          │                               │
│ 職責：                    │          │ 職責：                          │
│ • install_theme (kadence)│          │ • 16 base + 站型/電商模組      │
│ • mainwp-child (運維)    │          │ • 動態組合（依站型）            │
│ • litespeed (主機條件)   │          │ • 過濾 free: false（付費跳過）  │
│ • postInstall hooks      │          │                               │
│ • verification           │          │ 觸發：                          │
│ • rollback strategy      │          │ • wp-install-plugins task     │
│                          │          │                               │
│ 觸發：                    │          │                               │
│ • apply-manifest task    │          │                               │
└─────────────────────────┘          └─────────────────────────────┘
        ↓                                          ↓
        └──────────────┬───────────────────────────┘
                       ↓
              SSH + wp-cli on target host
                       ↓
              Supabase package_install_runs
                       ↓
              /ops/clients/[slug] 顯示結果
```

**邊界規則（不得交叉）**：
- Manifest **不得**包含本文件 §一/二/三 列出的外掛 → 由 Catalog 統一處理
- Manifest **可以**包含「運維基礎設施」外掛（如 `mainwp-child`）— 這些不對使用者開放選擇
- Catalog **不得**包含主題（theme）或 postInstall 設定 → 由 Manifest 處理

### 8.2 下游消費者地圖

| 角色 | 檔案 | 用途 |
|------|------|------|
| **TypeScript SSOT mirror** | `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/wp-plugin-stack-catalog.ts` | 機器可讀外掛資料 + `resolvePluginStack` / `resolveInstallableSlugs` / `resolvePaidPlugins` |
| **OnboardWizard Step 2** | `lobster-factory/infra/.../app/onboard/OnboardWizard.tsx` | 操作員選站型 + 顯示外掛數量 |
| **BuildConsole** | `lobster-factory/infra/.../app/build/BuildConsole.tsx` | URL params 帶入後顯示綠色摘要 |
| **BuildRunRequest 合約** | `lobster-factory/infra/.../lib/build-console/contracts.ts` | `wpSiteType` / `hasEcommerce` / `pluginSlugs` 欄位 |
| **Trigger.dev 安裝 task** | `lobster-factory/packages/workflows/src/tasks/wp-install-plugins.ts` | 真正 SSH + wp-cli install 執行層 |
| **Trigger.dev 容器 task** | `lobster-factory/packages/workflows/src/trigger/apply-manifest.ts` | 主題 + postInstall + verification |
| **Orchestrator workflow** | `lobster-factory/packages/workflows/src/trigger/create-wp-site.ts` | 依序觸發 apply-manifest → wp-install-plugins |
| **客戶端顯示** | `lobster-factory/infra/.../app/ops/clients/[slug]/page.tsx` | 從 `package_install_runs` 讀取顯示安裝結果 |
| **同步驗證腳本** | `scripts/verify-wp-plugin-stack-sync.mjs` | 比對本文件 vs catalog.ts，計數與 slug 對齊 |

### 8.3 安裝來源（30 年穩定原則）

| 外掛類型 | 來源 | 操作員是否需介入 |
|---------|------|---------------|
| `free: true`（28 個）| WP.org → `wp plugin install <slug>` 自動下載 | ❌ 完全自動 |
| `free: false` + `alternativeSlug`（如 CleanTalk → Akismet、WP Maps Pro → Leaflet）| catalog 自動改用替代品 | ❌ 完全自動 |
| `free: false` 無替代（如 Kadence Shop Kit / ECPay / YITH Points）| WordPress 後台手動上傳 `.zip` | ✅ 操作員介入（見 §8.4）|

**為何不建私有 zip vault？**
- 30 年維護成本：vault 主機 / 授權密鑰加密 / 版權法律風險 / 帳號流轉
- WP 內建 Upload Plugin 已經是穩定 20+ 年的標準介面
- 付費外掛通常一個客戶站只裝 2-3 個，手動成本可接受
- `package_install_runs` + `operator_tasks` 已記錄需處理清單，遺漏風險低

### 8.4 付費外掛操作員 Runbook

當 `/ops/clients/[slug]` 顯示「⚠️ 需手動授權」清單時：

1. 取得授權 zip：
   - **Kadence Shop Kit**：Kadence Full Bundle 授權帳號 → My Account → Downloads
   - **ECPay Payment Gateway**：ECPay 商家後台 → 技術支援 → 外掛下載（DIRECT，無 WP.org）
   - **YITH Points and Rewards**：YITH 帳號 → My Licences → Download
2. 登入該客戶 WP 後台：`https://<client-domain>/wp-admin/plugin-install.php?tab=upload`
3. **Plugins → Add New → Upload Plugin** → 選 zip → Install Now → Activate
4. 回 `/ops/clients/[slug]`，確認該外掛已從「需手動授權」消失（下次 sync 自動更新）

### 8.5 漂移防護（drift prevention）

兩份不同步是最大風險。每次修改本文件 §一/二/三 後**必須**：

```powershell
# 1. 修改 catalog.ts 對應 entry（slug / alternativeSlug / module）
# 2. 跑同步驗證
node scripts/verify-wp-plugin-stack-sync.mjs
# Exit 0 = 對齊；Exit 1 = drift（列出差異）
```

CI 應掛此驗證為 build gate（待 V3 governance gates 整合）。

### 8.6 不可違反的紅線

1. 本文件之外**不得**有第二份「使用者外掛清單」
2. Manifest 加任何外掛前先問：這是運維基礎設施嗎？不是 → 加進本文件而非 Manifest
3. catalog.ts 改任何 slug → 立即同步本文件，反之亦然
4. 付費外掛永遠不嘗試 `wp plugin install`（會失敗污染 log）→ 由 `free: false` 自動跳過
5. 不得把授權密鑰或付費 zip URL 寫進 catalog.ts 或 git → 任何時候只在 vault / WP admin 手動處理

---

## Changelog

| 日期 | 變更說明 |
|------|---------|
| 2026-05-12 | 初版建立：基礎全員 + 電商模組 + 旅遊/形象模組 + 4 個決策樹 |
| 2026-05-12 | 品質修訂：所有表格加入 WP.org Slug 欄；★/↩/† 標記規範；Complianz 選配說明；§七補 slug 維護責任 |
| 2026-05-13 | 新增 §八 自動化執行系統：兩層架構 + 下游消費者地圖 + 安裝來源策略 + 付費外掛 Runbook + 漂移防護 + 紅線 |
