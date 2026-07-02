# 旅遊業客戶部署完整流程

> **適用**：`wp-tourism` 套件（base + tourism packs）  
> **Hosting**：Cloudways（客戶自有帳號）  
> **主題**：TravelWP（Physcode, $35 一次性）  
> **建立日期**：2026-07-02

---

## §0 前提確認清單

在任何動作開始前，確認以下均就緒：

| 項目 | 負責方 | 狀態 |
|------|--------|------|
| 客戶已決定使用 Cloudways | 客戶 | ⬜ |
| 客戶已有自己的域名 | 客戶 | ⬜ |
| Paid plugin zips 已上傳至 EU+SG VPS `/opt/lobster-plugins/` | 我們 | ⬜ |
| 客戶提供 Cloudways SSH 存取（或由我們開帳號） | 協商 | ⬜ |
| 客戶提供聯絡信箱（用於 FluentSMTP / Rank Math） | 客戶 | ⬜ |
| 客戶提供 Google Maps API key（用於 Advanced Google Maps） | 客戶 | ⬜ |
| 客戶 Logo 或品牌色（若有） | 客戶 | ⬜ |

---

## §1 Paid Plugin 上傳（我們的 VPS）

**觸發詞**：「上傳 paid plugins 到 VPS」

上傳目的地：EU `204.168.175.41` + SG `5.223.93.113` → `/opt/lobster-plugins/`

需要上傳的 tourism 相關 zips（來自 `D:\Work\_paid-plugins\`）：

| 本機資料夾 | 上傳後檔名 |
|-----------|-----------|
| `travelwp/` | `travelwp.zip` |
| `elementor-pro/` | `elementor-pro.zip` |
| `elementor-pro-activator/` | `elementor-pro-activator.zip` |
| `advanced-google-maps/` | `advanced-google-maps.zip` |
| `advanced-coupons/` | `advanced-coupons-for-woocommerce.zip` |
| `translatepress-business.zip`（如需多語） | `translatepress-multilingual.zip` |

> **注意**：`translatepress-business.zip` 是付費版，上傳時改名為 `translatepress-multilingual.zip`。

---

## §2 Cloudways 帳號設定

由客戶自行在 [cloudways.com](https://cloudways.com) 開帳號。

**建議方案**：Medium - $54/月（4GB RAM，Unlimited Sites，Most Popular）  
低流量早期可從 Small $28/月 開始，隨後升級不影響網站。

**我需要客戶提供**：
- Cloudways Server IP
- SSH username / private key
- Application name（等同 WordPress 安裝路徑）

---

## §3 WordPress 安裝

Cloudways 提供 1-click WordPress 安裝，透過 Dashboard 操作：

1. Applications → Add Application → WordPress  
2. 選好 PHP 版本（≥8.2），設定 app name（例：`mongolian-travel`）  
3. 記下：
   - WordPress admin URL（`https://<temp-domain>/wp-admin`）
   - WordPress admin 帳密

---

## §4 Free Plugin 批次安裝（WP-CLI）

SSH 進 Cloudways，進入 WordPress 根目錄：

```bash
# 典型路徑（依 app name 而異）
cd /home/master/applications/<app-name>/public_html

# Base + Tourism 免費 plugins 一次裝
wp plugin install \
  wordfence \
  wpvivid-backups-and-migration \
  migrate-guru \
  seo-by-rank-math \
  redirection \
  shortpixel-image-optimiser \
  really-simple-ssl \
  fluentform \
  fluent-smtp \
  fluent-crm \
  akismet \
  duracelltomi-google-tag-manager \
  advanced-custom-fields \
  complianz-gdpr \
  elementor \
  woocommerce \
  custom-post-type-ui \
  modula-best-grid-gallery \
  breeze \
  --activate
```

> **Breeze** = Cloudways 原生 cache plugin，直接 WP.org 安裝。  
> **akismet** = cleantalk-spam-protect 的免費替代（↩ fallback）。

---

## §5 Paid Plugin 安裝（從我們的 VPS）

SSH 進 Cloudways，透過 wget/curl 從我們 VPS 下載 paid zips：

```bash
# 切到 WP 根目錄
cd /home/master/applications/<app-name>/public_html

# 從 SG VPS 下載（替換 IP 為 5.223.93.113）
VPS="http://5.223.93.113"

# TravelWP 主題
wget ${VPS}/opt/lobster-plugins/travelwp.zip -O /tmp/travelwp.zip
wp theme install /tmp/travelwp.zip --activate

# Elementor Pro
wget ${VPS}/opt/lobster-plugins/elementor-pro.zip -O /tmp/elementor-pro.zip
wp plugin install /tmp/elementor-pro.zip --activate

# Elementor Pro Activator
wget ${VPS}/opt/lobster-plugins/elementor-pro-activator.zip -O /tmp/elementor-pro-activator.zip
wp plugin install /tmp/elementor-pro-activator.zip --activate

# Advanced Google Maps
wget ${VPS}/opt/lobster-plugins/advanced-google-maps.zip -O /tmp/advanced-google-maps.zip
wp plugin install /tmp/advanced-google-maps.zip --activate

# Advanced Coupons for WooCommerce
wget ${VPS}/opt/lobster-plugins/advanced-coupons-for-woocommerce.zip -O /tmp/advanced-coupons.zip
wp plugin install /tmp/advanced-coupons.zip --activate

# [選配] TranslatePress Business（若需多語言）
wget ${VPS}/opt/lobster-plugins/translatepress-multilingual.zip -O /tmp/translatepress.zip
wp plugin install /tmp/translatepress.zip --activate
wget ${VPS}/opt/lobster-plugins/translatepress-add-on-seo-pack.zip -O /tmp/tp-seo.zip
wp plugin install /tmp/tp-seo.zip --activate

# 清理 tmp
rm /tmp/*.zip
```

---

## §6 Plugin 總清單（wp-tourism）

### 來自 WP.org（免費，WP-CLI 自動安裝）

| Plugin | 說明 |
|--------|------|
| wordfence | 防火牆 + 惡意軟件掃描 |
| wpvivid-backups-and-migration | 備份 |
| migrate-guru | Cloudways staging→live 遷移 |
| seo-by-rank-math | SEO |
| redirection | 301 重定向管理 |
| shortpixel-image-optimiser | 圖片壓縮（需 API key） |
| really-simple-ssl | SSL 強制 HTTPS |
| fluentform | 表單 |
| fluent-smtp | 郵件發送 |
| fluent-crm | CRM |
| akismet | 反垃圾留言 |
| duracelltomi-google-tag-manager | GTM |
| advanced-custom-fields | ACF 自訂欄位 |
| complianz-gdpr | GDPR 同意（選配）|
| elementor | Page builder 基礎 |
| woocommerce | 預約 booking 引擎 |
| custom-post-type-ui | 自訂文章類型（旅遊行程）|
| modula-best-grid-gallery | 相冊 |
| breeze | Cloudways cache |

### 來自 VPS `/opt/lobster-plugins/`（付費，手動安裝）

| Plugin | 來源 | 必要？ |
|--------|------|--------|
| travelwp | WordPressIT / Physcode | ✅ 必要 |
| elementor-pro | WordPressIT | ✅ 必要 |
| elementor-pro-activator | WordPressIT bundle | ✅ 必要 |
| advanced-google-maps | WordPressIT | ✅ 必要 |
| advanced-coupons-for-woocommerce | WordPressIT | ✅ 必要 |
| translatepress-multilingual | WordPressIT | ⬜ 選配（多語言時加）|
| translatepress-add-on-seo-pack | WordPressIT | ⬜ 選配（配合上一個）|

### 特殊安裝方式

| Plugin | 安裝方式 |
|--------|---------|
| mainwp-child | Manifest 步驟安裝（加入 MainWP 時）|
| aware-wave-wp-bridge | GitHub Release 下載（AO 自動化橋接）|

---

## §7 TravelWP 主題設定

TravelWP 是專為旅遊業設計的 WooCommerce 主題，主要設定：

1. **Appearance → TravelWP Options**
   - 上傳客戶 Logo
   - 設定主色 / 配色
   - 選擇 Header layout

2. **TravelWP → Tours CPT**（Custom Post Types）
   - 建立「行程」文章類型
   - 設定 Tour 欄位：行程天數、出發地、目的地、價格

3. **WooCommerce → Products**
   - 每個行程 = 一個 WooCommerce product
   - Product type: Simple product 或 Variable（不同日期/人數）

4. **Elementor** 
   - 用 Elementor 設計首頁、行程列表頁、單一行程頁
   - TravelWP 提供 Elementor 專用 widgets（Tour 搜尋框、行程卡片等）

---

## §8 Essential Plugin 設定

### FluentSMTP（郵件）
```
設定 → 選 Resend（或客戶自有 SMTP）
From Email: 客戶信箱
From Name: 旅行社名稱
```

### Rank Math SEO
```
General Settings → Site Title: 旅行社名稱
Schema Type: LocalBusiness
Focus Keyword: 蒙古旅遊 / 蒙古自由行（依客戶市場）
```

### Wordfence
```
基礎設定 → 啟用 Login Security
登入 URL 改為自訂路徑（非 /wp-admin）
```

### ShortPixel
```
Settings → API Key: 客戶自行申請免費 API（100 images/月免費）
或使用我們的共用 API key（需客戶確認）
```

### Advanced Google Maps
```
Settings → Google Maps API Key: 客戶提供
建立地圖：顯示旅行社所在地 + 主要行程目的地
```

### Breeze（Cloudways Cache）
```
Cloudways Dashboard → Manage → Varnish Cache → Enable
WordPress Dashboard → Breeze → Settings → 全部開啟
```

---

## §9 WooCommerce 預約設定

TravelWP 使用 WooCommerce 作為預約引擎（無需另外安裝 booking plugin）：

1. WooCommerce → Settings → 貨幣：MNT（蒙古圖格里克）或 USD
2. Payments：
   - Stripe（信用卡，國際客）
   - PayPal（選配）
   - 銀行轉帳（本地客）
3. 每個行程設定出發日期 → 可用 WooCommerce 的 Variable Products 或 bookings

---

## §10 多語言設定（選配）

**僅在客戶需要多語言時安裝 TranslatePress：**

情境：蒙古語 + 英語（吸引國際旅客）

```
TranslatePress → Settings
Default Language: 蒙古語（mn）
Additional Language: 英語（en）
翻譯方式: AI 自動翻譯 → 人工校對
SEO Pack Addon: 每種語言獨立 URL (/en/tours)
```

---

## §11 Migrate Guru（Staging → Cloudways 遷移）

若客戶先在我們的 staging 伺服器建站，完成後遷移至 Cloudways：

1. 在 staging 安裝 Migrate Guru
2. Migrate Guru → Migrate → 選 Cloudways
3. 輸入 Cloudways SFTP credentials
4. Migrate Guru 直接 server-to-server pull（不下載到本機）
5. 遷移完成後在 Cloudways 調整域名

---

## §12 DNS 指向

客戶在自己的域名商（GoDaddy / Namecheap / Cloudflare 等）設定：

```
A 記錄:  @ → Cloudways 伺服器 IP
A 記錄: www → 同一個 IP
```

Cloudways Dashboard → Application → SSL → 申請 Let's Encrypt 免費 SSL

---

## §13 MainWP 納管（選配）

若我們幫客戶代管，將此網站加入 MainWP：

1. 先安裝 `mainwp-child`（透過 manifest 步驟或手動）
2. EU MainWP Dashboard → Add Child Site
3. 輸入客戶 WordPress URL + mainwp-child token
4. 完成後可透過 MainWP 批次更新、備份監控

> **注意**：WP Rocket 是 SiteGround 客戶用的，Cloudways 客戶用 Breeze，不裝 WP Rocket。

---

## §14 收工 Checklist

部署完成後逐項確認：

- [ ] 首頁正常顯示（TravelWP 主題）
- [ ] 行程頁面可瀏覽
- [ ] WooCommerce 結帳流程正常（測試訂單）
- [ ] FluentSMTP 寄件測試成功
- [ ] Wordfence 啟用
- [ ] Breeze cache 啟用
- [ ] SSL 憑證安裝完成（https 正常）
- [ ] Google Maps 正常顯示（需 API key）
- [ ] ShortPixel 壓縮啟用
- [ ] Rank Math SEO 基礎設定完成
- [ ] 備份設定完成（WPvivid 排程）
- [ ] 客戶已收到 WordPress admin 帳密
- [ ] 客戶已收到 Cloudways 帳密
- [ ] WORKLOG 記錄完成

---

## §15 收費參考

| 服務 | 說明 | 建議收費 |
|------|------|---------|
| 建站 | 全套安裝設定（本文件流程）| 依規模 |
| 月管（基礎） | 備份監控 + plugin 更新 + 小修改 | NT$3,000–5,000/月 |
| 月管（含內容） | 基礎 + 發文（文字） | NT$6,000–10,000/月 |
| 月管（含行銷） | 內容 + 社群 + 冷拜訪 | NT$15,000–25,000/月 |
| 月管（含剪片） | 行銷 + 影片剪輯 | NT$25,000–40,000/月 |
| Cloudways 代管費用 | Medium $54/月 代墊 | 成本加收 10–20% |

---

## §16 快速參考指令

```bash
# SSH 進 Cloudways
ssh master@<cloudways-server-ip> -p 22 -i ~/.ssh/<keyfile>

# 確認 WP 版本
wp core version

# 確認已安裝的 plugins
wp plugin list

# 手動清 Breeze cache
wp cache flush

# 確認 SSL
curl -I https://<客戶域名>
```

---

*SSOT：本文件。Plugin 清單以 `wp-plugin-stack-catalog.ts` 為程式 SSOT，本文件為操作程序 SSOT。*
