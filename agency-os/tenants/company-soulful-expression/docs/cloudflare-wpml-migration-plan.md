# Claude Brief：Soulful Expression 網站、主機、Cloudflare、WordPress 多語架構整理

## 你的角色

請你扮演一位資深 WordPress / Cloudflare / VPS 架構顧問，幫我把目前的主機、網域、WordPress 多語網站、Cloudflare 快取與未來遷移計畫整理成可執行方案。

請用繁體中文回答，語氣直接、務實，重點是幫我做決策，不要只列選項。

---

## 1. 我的基本情況

### 主要品牌網站

主網域：

```text
soulfulexpression.org
```

網站主題：

```text
藝術治療 / Art Therapy
中英文內容
中文客群：台灣 / 華語圈
英文客群：國際市場
```

目前 `soulfulexpression.org` 是英文版網站。

未來我希望做成中英文網站，而且中英文內容結構要一模一樣：

```text
soulfulexpression.org/        英文
soulfulexpression.org/zh/     繁體中文
```

我會有非常多文章，希望每篇文章都有英文版和繁中版。

---

## 2. 網域與 Hostinger 狀況

`soulfulexpression.org` 目前在 Hostinger。

目前理解：

```text
網域還剩約 2 年
Hostinger 主機 11 月到期
Hostinger 未來網域續約可能變成約 US$80/年
```

我擔心被 Hostinger 綁住，但目前已確認：

```text
網域可以轉出
轉出不是換網址
soulfulexpression.org 仍然可以繼續使用
只是 registrar 從 Hostinger 換成 Cloudflare 或 Porkbun
```

我已有 Cloudflare 帳號，也在 Cloudflare 有另一個網域。

請幫我確認與規劃：

1. `soulfulexpression.org` 是否應該現在轉到 Cloudflare Registrar？
2. 還是先把 DNS 搬到 Cloudflare，等到期前再轉 registrar？
3. 如果現在轉到 Cloudflare，約要付多少？
4. 轉移後是否通常會保留剩餘 2 年，並再加 1 年？
5. 如果我想一次補到 10 年，應該什麼時候做最合理？

我的偏好：

```text
避免 Hostinger 未來 US$80/年續約
避免掉網域
避免網站中斷
最好把 DNS / Cloudflare 快取 / Registrar 集中管理
```

### 2.1 請特別檢查 Hostinger US$80/年到底包含什麼，以及 Cloudflare 是否有對應服務

Hostinger 未來顯示 `soulfulexpression.org` 續約可能變成約 **US$80/年**，這個價格看起來不像單純 `.org` 網域續約。請幫我特別檢查：這個 US$80 是否包含其他 Hostinger 加值服務，而不是只有 domain renewal。

請把 Hostinger 帳單 / subscription / domain add-ons 逐項拆開，確認是否包含以下項目：

```text
單純 .org domain renewal
Domain privacy / WHOIS privacy
Domain protection / ownership protection / domain lock 類加值保護
Email hosting / mailbox / business email
Email forwarding
SSL certificate / security add-on
Daily backup / backup add-on
CDN / performance add-on
Website builder / AI builder / marketing tools
Hosting renewal
Tax / VAT
多年期總額或平均價格顯示
```

請用表格輸出：

```text
Hostinger 項目
是否真的需要
Cloudflare 是否有對應功能
Cloudflare 是否免費 / 付費
如果 Cloudflare 沒有，應該用什麼替代方案
是否建議保留 / 關掉 / 轉移 / 不續約
```

請特別注意：Cloudflare Registrar 主要負責 **domain registration / DNS / CDN / security**，不等於 Hostinger hosting。不要把「網域轉到 Cloudflare」誤解成「所有 Hostinger 服務都會自動搬到 Cloudflare」。

請依照以下邏輯對應：

| Hostinger 可能服務 | Cloudflare 是否可取代 | 如果 Cloudflare 沒有，建議替代 |
|---|---|---|
| Domain registration / renewal | 可以，Cloudflare Registrar | 也可用 Porkbun |
| DNS management | 可以，Cloudflare DNS | 不需要 Hostinger DNS |
| WHOIS privacy | Cloudflare Registrar 通常會做資料保護 / redaction，但請確認 `.org` 實際顯示 | 若不夠，考慮 Porkbun 或其他 registrar |
| Domain lock / basic transfer protection | Cloudflare Registrar 有 registrar lock / transfer control，請確認可用設定 | 開 2FA、保護 Cloudflare 帳號 |
| Registry lock / premium domain protection | Cloudflare Free/一般 registrar 未必有 | 若需要企業級 registry lock，查 Cloudflare 是否支援或找專門 registrar |
| Web hosting | Cloudflare 不能取代一般 WordPress hosting | 用 Hetzner Finland / Singapore VPS |
| Email hosting / mailbox | Cloudflare Email Routing 只能收信轉寄，不是完整 mailbox | 用 Google Workspace / Zoho Mail / Proton / iCloud+ / Fastmail 等 |
| Transactional email | Cloudflare 不適合作為寄信服務 | 用 Resend / Postmark / Mailgun / SES / Brevo |
| SSL certificate | Cloudflare 可以處理邊緣 SSL，origin 可用 Let’s Encrypt | Hetzner 主機上仍要設定 origin SSL |
| CDN / performance add-on | Cloudflare CDN / Cache Rules / APO 可取代或更好 | WordPress 快取外掛搭配 Cloudflare |
| Backup add-on | Cloudflare 不能取代網站備份 | 用 restic / borg / Hetzner Storage Box / Backblaze B2 / Cloudflare R2 |
| Malware scanner / security add-on | Cloudflare 可提供 WAF / bot / rate limiting 的一部分 | WordPress 仍需 Wordfence / Patchstack / server hardening |
| Website builder | Cloudflare 不提供 Hostinger 式 builder | WordPress / Elementor / block editor 自行管理 |
| Hosting control panel | Cloudflare 不提供 hPanel 替代 | 用 Docker / Coolify / aaPanel / Plesk / 手動管理 |

請最後給我一個明確判斷：

```text
如果 Hostinger US$80 只是 .org domain renewal：建議轉出。
如果 Hostinger US$80 包含 email / backup / hosting / protection：請逐項判斷哪些可以用 Cloudflare 取代，哪些需要另外購買替代服務。
如果 Cloudflare 沒有對應功能：請告訴我要用哪個外部服務、預估月費/年費，以及是否真的必要。
```


### 2.2 請研究 Cloudflare 官方網域轉移教學，並整理成我的操作步驟

請你研究 Cloudflare 官方文件：

```text
https://developers.cloudflare.com/registrar/get-started/transfer-domain-to-cloudflare/?utm_source=chatgpt.com
```

請不要只摘要文件，請把它轉成我可以照做的 `soulfulexpression.org` 轉移檢查表。

請特別確認以下事項：

```text
Cloudflare 是否要求網域先加入 Cloudflare 並顯示 Active
是否必須先把 nameservers 改成 Cloudflare
Cloudflare Registrar 是否要求使用 Cloudflare authoritative DNS
轉移時是否需要 EPP / Auth code
Hostinger 端需要做哪些事：unlock domain、關閉 transfer lock、取得 auth code
轉移前是否要關閉 DNSSEC，或如何確認 DNSSEC 不會造成問題
Cloudflare 帳號是否需要 verified email 和付款方式
是否有 60 天限制：新註冊、剛轉移、剛改 registrant name / organization / email
轉移費用是否等於 Cloudflare at-cost 的一年續約費
轉入後是否通常會把目前到期日加 1 年
整個轉移流程通常多久
轉移期間網站和 email 是否會中斷
```

請根據文件幫我輸出：

```text
Step 0：轉移前準備
Step 1：在 Cloudflare 新增 soulfulexpression.org
Step 2：檢查與補齊 DNS records
Step 3：到 Hostinger 改 nameservers 到 Cloudflare
Step 4：等待 Cloudflare 顯示 Active
Step 5：在 Hostinger unlock domain 並取得 EPP/Auth code
Step 6：在 Cloudflare Registrar 發起 transfer
Step 7：確認付款金額與是否加 1 年
Step 8：等待轉移完成
Step 9：轉移完成後檢查 DNS、網站、email、SSL、Cloudflare cache
```

請特別提醒我哪些操作不能做：

```text
不要取消網域
不要刪除 Hostinger 的 domain
不要等到過期當天才轉
不要在 DNS records 未備份前改 nameserver
不要忽略 MX / SPF / DKIM / DMARC email records
不要把 Cloudflare Registrar 誤解成 hosting
不要以為轉移網域會自動搬網站檔案或 email mailbox
```

請最後幫我判斷：

```text
如果 soulfulexpression.org 還剩 2 年，現在轉到 Cloudflare 是否合理？
如果現在轉，預估要付多少？
是否通常會變成約 3 年有效期？
如果我想補到 10 年，應該在轉入後怎麼做？
```

請在回答中明確引用 Cloudflare 官方文件的重點，不要只靠猜測。



---

## 3. 目前 Hetzner 主機狀況

我目前有：

```text
Hetzner Finland CX32
Hetzner Singapore CX22
```

目前總成本大約：

```text
EU CX32 + SG CX22 = US$35–40/月
```

我覺得 Hetzner Singapore 很貴。

目前 Finland CX32 上已經跑：

```text
n8n
Supabase
ClickHouse / logs
Redis
其他工具
```

目前 RAM 約 60%。  
我已經有 swap。  
我也已經有設定定期清理 ClickHouse / logs / 其他暫存資料。

---

## 4. 未來想搬進去的東西

我想再搬：

```text
3 個 WordPress 網站
```

其中至少有：

```text
soulfulexpression.org
中英文 WPML / 多語文章
WooCommerce
預約系統
登入頁
付款頁
大量文章
```

所以 WordPress 不是單純靜態站。

---

## 5. Supabase 狀況

Supabase 會有正式客戶 / 會員資料。

因此它不是測試用途而已。

請幫我判斷：

```text
Supabase 是否應該和 WordPress 分開？
n8n 是否應該跟 Supabase 放一起？
ClickHouse / logs 是否應該跟 Supabase 放一起？
```

目前我傾向：

```text
不要讓 WordPress 外掛風險影響 Supabase 客戶資料
不要讓 WooCommerce / 預約 / 登入 / WordPress 攻擊拖垮 Supabase
```

---

## 6. 我正在考慮的主機架構

### 選項 A：全部放同一台，升級到 CX43

```text
Hetzner Finland CX43
├── 3 個 WordPress
├── n8n
├── Supabase
├── ClickHouse / logs
├── Redis
├── MariaDB / PostgreSQL
├── 反向代理
└── 備份 / 快取
```

優點：

```text
管理簡單
比兩台便宜
資源集中
```

缺點：

```text
一台掛掉全部掛
WordPress 風險和 Supabase 資料風險集中
備份、攻擊、更新都會互相影響
```

### 選項 B：分 2 台 EU 主機

```text
Hetzner Finland CX32
├── Supabase
├── n8n
├── ClickHouse / logs
├── Redis
└── 內部工具

Hetzner Finland CX32 或 CX43
├── 3 個 WordPress
├── MariaDB
├── Redis object cache
├── PHP-FPM
├── Nginx / Caddy / OpenLiteSpeed
└── WordPress 快取
```

優點：

```text
Supabase 正式資料和 WordPress 公開網站隔離
故障範圍比較小
安全性比較好
維護比較清楚
```

缺點：

```text
成本比一台高
多一台要管理
```

### 選項 C：保留 Singapore CX22

目前我不確定 SG CX22 是否值得保留。

SG 可能有用的情況：

```text
台灣訪客動態頁很慢
台灣需要登入 / 預約 / 付款低延遲
要亞洲節點
```

但如果只是文章 / 服務頁 / About / FAQ，Cloudflare 可能已經夠用。

請幫我判斷：

```text
SG CX22 要不要砍掉？
是不是改成 EU CX32 + EU CX43 比較合理？
```

---

## 7. Hetzner 方案理解

請注意：

```text
CX43 不是 CCX43
```

我之前看錯。

我想看的應該是：

```text
CX43 = shared vCPU，約 8 vCPU / 16GB RAM / 160GB SSD
CCX43 = dedicated vCPU，大型方案，太貴，不適合我現在
```

請你不要建議我上 CCX43，除非真的有必要。

---

## 8. Cloudflare 快取 / APO 狀況

我知道 Cloudflare APO 在 Free plan 是：

```text
US$5/月 / 每個 Cloudflare zone 或主網域
```

如果 3 個 WordPress 是 3 個不同主網域，可能要 3 組 APO：

```text
US$5 × 3 = US$15/月
```

如果是同一個主網域底下的子網域，通常算同一個 zone。

我也知道有免費替代方案：

```text
Cloudflare Free
+
Cache Rules / Cache Everything
+
WP-Cloudflare-Super-Page-Cache 或 Super Page Cache for Cloudflare
```

但是我的網站有：

```text
WooCommerce
預約系統
登入頁
付款頁
會員頁
```

所以不能隨便全站 Cache Everything。

必須排除：

```text
/wp-admin/*
/wp-login.php
/wp-json/*
/cart/*
/checkout/*
/my-account/*
/order-pay/*
/order-received/*
/booking/*
/appointment/*
/payment/*
/confirmation/*
登入後頁面
有 WooCommerce session / cart cookie 的使用者
```

請幫我判斷：

1. 主站是否值得買 APO？
2. 其他兩站是否先用免費快取方案？
3. 如果用免費快取方案，Cloudflare Cache Rules 應該怎麼設？
4. WooCommerce / 預約 / 付款 / 登入頁如何避免快取錯誤？
5. 是否建議先只買 `soulfulexpression.org` 一組 APO？

---

## 9. WordPress 多語策略

我希望中英文網站一模一樣。

目標：

```text
英文文章一篇
繁中也要有對應版本

英文頁面一頁
繁中也要有對應版本

英文分類
繁中也要有對應分類

英文選單
繁中也要有對應選單
```

目前偏好：

```text
WPML
English = master language
Traditional Chinese = translation
```

工作流：

```text
英文先寫
WPML 自動產生繁中初稿
再用 Claude AI 幫我修成自然繁體中文
最後人工確認再發布
```

我不想每篇文章從零寫兩次。

我想要：

```text
寫一次英文
自動翻譯
Claude 潤稿
人工確認
發布繁中
```

請幫我規劃：

1. WPML 是否最適合？
2. Polylang 是否比較省但管理大量文章會麻煩？
3. TranslatePress 是否不適合我的大量文章 / 一對一翻譯需求？
4. 如何設計翻譯工作流？
5. 如何避免未完成翻譯的中文頁被公開？
6. 如何確保 SEO / hreflang / sitemap 正確？

---

## 10. Claude AI 翻譯要求

請幫我建立一套繁中翻譯風格規則。

我的網站是藝術治療，不希望中文像機器翻譯。

中文語氣應該：

```text
自然
溫柔
清楚
有專業感
不要太學術
不要過度承諾療效
不要像直譯
適合台灣 / 華語讀者
```

常見詞彙要注意：

```text
healing
reflection
trauma-informed
grounding
containment
inner child
emotional regulation
expressive arts therapy
Book a Session
```

請幫我建立一份 prompt，之後每篇文章都可以貼給 Claude 使用。

---

## 11. 安全性要求

因為有 Supabase、n8n、WordPress、WooCommerce、會員資料，我希望安全性要做好。

請你把安全建議納入方案：

```text
n8n admin 不公開裸奔
Supabase Studio 不公開裸奔
Cloudflare Access / VPN / IP allowlist
WordPress admin 加強保護
定期備份
off-server backup
Docker containers 設 restart policy
重要服務設 resource limits
監控 RAM / swap / disk / OOM
ClickHouse retention
Postgres backup
MariaDB backup
WordPress files backup
```

尤其要注意：

```text
n8n 可能有很多 API keys / credentials
Supabase 有正式客戶/會員資料
WordPress 外掛可能有漏洞
WooCommerce / 預約 / 付款不能被錯誤快取
```

---

## 12. 我希望你輸出什麼

請你輸出一份完整建議，包含以下內容。

### 12.1 最終推薦架構

請明確告訴我選哪一個：

```text
一台 CX43 全部放一起
或
兩台 EU：CX32 + CX32
或
兩台 EU：CX32 + CX43
或
保留 SG CX22
或
刪掉 SG CX22
```

請給理由。

### 12.2 月費估算

請幫我估算：

```text
目前 EU32 + SG22 = US$35–40/月
改成 EU32 + EU32 大約多少？
改成 EU32 + EU43 大約多少？
改成單台 EU43 大約多少？
APO 如果只買主站是多少？
APO 如果 3 個站都買是多少？
Cloudflare Registrar .org 一年大約多少？
```

不用精準到小數，但要能做決策。

### 12.3 遷移順序

請提供步驟：

```text
Step 1：Cloudflare DNS
Step 2：Hetzner 主機架構
Step 3：WordPress 搬家
Step 4：WPML 多語
Step 5：Cloudflare 快取 / APO
Step 6：Hostinger 主機 11 月到期不續
Step 7：Hostinger 網域轉到 Cloudflare 或 Porkbun
```

### 12.4 Cloudflare 設定清單

請包含：

```text
DNS records
SSL/TLS 設定
Cache Rules
APO 是否開
WAF / security
Cloudflare Access
哪些頁面 bypass cache
哪些頁面可以 cache
```

### 12.5 WordPress 多站建議

請說明 3 個 WordPress 放同一台時：

```text
用 Docker 還是裸機？
Caddy / Nginx / OpenLiteSpeed 哪個適合？
每個站資料庫怎麼分？
Redis object cache 怎麼處理？
備份怎麼做？
WPML + WooCommerce + 預約系統要注意什麼？
```

### 12.6 Supabase / n8n 建議

請說明：

```text
Supabase 是否與 WordPress 分開？
n8n 放哪台？
ClickHouse/logs retention 怎麼設？
Supabase Studio 怎麼保護？
Postgres backup 怎麼做？
```

### 12.7 本週行動清單

請給我 7 天內可以完成的行動清單，例如：

```text
Day 1：備份現有服務
Day 2：Cloudflare 加 soulfulexpression.org
Day 3：決定主機方案
Day 4：架 WordPress 主機
Day 5：搬第一個 WordPress
Day 6：測 Cloudflare cache / APO
Day 7：測備份與還原
```

---

## 13. 最後請用一句話總結

請用這種格式結尾：

```text
以你現在有正式 Supabase 會員資料、3 個 WordPress、n8n 和 Cloudflare 需求，我建議採用 ________，因為 ________。
```
