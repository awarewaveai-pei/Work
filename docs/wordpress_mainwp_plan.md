# WordPress 跨主機架站與 MainWP 集中維運計畫書

## 1. 計畫目標

本計畫目標是建立一套適合接案使用的 WordPress 架站與維護流程。

核心方向：

- 客戶網站不綁定特定主機
- 客戶可以使用 Hostinger、DreamHost、Namecheap、SiteGround、Cloudways、VPS 或其他支援 WordPress 的主機
- 只要客戶網站可以安裝 WordPress 外掛，就可以接入 MainWP 管理
- 你的管理中心集中放在自己的主機上
- 不一開始把自己變成主機商
- 需要進階功能時，再使用 VPS、自架工具或雲端服務

簡單說：

```text
客戶網站 = 可以放在任何 WordPress 主機
你的管理端 = MainWP Dashboard
客戶網站端 = MainWP Child
```

### 1.1 本計畫固定決策（不可混淆）

本案已定案如下：

```text
MainWP Dashboard 固定部署在 EU（Hetzner EU）
MainWP Child 固定安裝在每個客戶自己的 WordPress
```

禁止錯誤理解：

```text
❌ 不會把所有客戶的 MainWP Child 裝在你的 SG/EU 主機上
❌ 不會由你的單一主機替代客戶站的 Child
```

正確理解：

```text
✅ Dashboard 在 EU（你的控制台）
✅ Child 在客戶站（被管理端）
```

---

## 2. 最終架構

### 2.1 管理中心

你的管理中心固定放在 Hetzner EU server（本案定案，不使用 SG 作為 MainWP Dashboard 主站）。

```text
Hetzner EU / 管理主機
├─ mainwp.aware-wave.com
│  └─ MainWP Dashboard
├─ n8n.aware-wave.com
├─ uptime.aware-wave.com
├─ trigger.aware-wave.com
├─ supabase.aware-wave.com（視需求）
└─ 其他後台工具
```

其中最重要的是：

```text
MainWP Dashboard = WordPress 維運總部
```

補充：

```text
SG 可做其他服務或備援節點
但 MainWP Dashboard 主站以 EU 為唯一操作入口
```

---

### 2.2 客戶網站

客戶網站可以放在任何支援 WordPress 的主機。

```text
客戶網站 A：Hostinger
└─ WordPress + MainWP Child

客戶網站 B：DreamHost
└─ WordPress + MainWP Child

客戶網站 C：SiteGround
└─ WordPress + MainWP Child

客戶網站 D：Cloudways
└─ WordPress + MainWP Child

客戶網站 E：客戶自己的 VPS
└─ WordPress + MainWP Child
```

重點：

```text
主機不是核心限制
WordPress + MainWP Child 才是接入條件
```

---

## 3. 工具分工

### 3.1 MainWP

MainWP 是用來集中管理多個 WordPress 網站的工具。

它不是主機，也不是 CloudPanel。

```text
MainWP = 管 WordPress
CloudPanel = 在 VPS 上開 WordPress
```

MainWP 分成兩個部分：

| 元件 | 放哪裡 | 功能 |
|---|---|---|
| MainWP Dashboard | Hetzner EU（固定） | 集中管理所有網站 |
| MainWP Child | 每個客戶 WordPress | 讓 Dashboard 可以連線管理 |

---

### 3.2 MainWP Dashboard

MainWP Dashboard 是你的主控站。

建議位置：

```text
mainwp.aware-wave.com
```

它本身是一個 WordPress 網站，裡面安裝 MainWP Dashboard 外掛。

用途：

- 查看所有客戶網站狀態
- 查看哪些網站需要更新
- 管理 WordPress 核心更新
- 管理外掛更新
- 管理主題更新
- 批次安裝外掛
- 批次啟用 / 停用外掛
- 管理備份流程
- 檢查網站狀態
- 作為維護服務的核心後台

---

### 3.3 MainWP Child

MainWP Child 安裝在每一個客戶的 WordPress 裡。

例如：

```text
client-a.com
└─ WordPress
   └─ MainWP Child
```

安裝後，MainWP Dashboard 才能連線管理該網站。

---

### 3.4 CloudPanel

CloudPanel 只在使用 VPS 時需要。

用途：

- 在 VPS 上建立 WordPress
- 管理 PHP
- 管理 Nginx
- 管理資料庫
- 管理 SSL
- 建立網站目錄

如果客戶網站放在 Hostinger、DreamHost、SiteGround、Namecheap、Cloudways 這類主機，通常不需要 CloudPanel。

簡單記：

```text
客戶用代管主機 → 不需要 CloudPanel
客戶用 VPS → 可以考慮 CloudPanel
```

---

### 3.5 n8n

n8n 用於自動化流程。

適合進階客戶或你自己的內部流程。

用途：

- 表單通知
- CRM 同步
- Email 自動化
- Google Sheet / Notion 同步
- Webhook
- 客戶資料處理
- Slack 通知
- AI workflow

n8n 不屬於基本架站服務，應列為加值服務。

---

### 3.6 Uptime Kuma

Uptime Kuma 用於網站監控。

用途：

- 監控客戶網站是否正常
- 網站掛掉時通知你
- 可串接 Slack
- 可作為維護方案的一部分

適合所有維護客戶。

---

### 3.7 Slack

Slack 作為通知中心。

可接收：

- Uptime Kuma 掛站通知
- n8n 自動化通知
- MainWP 維護提醒
- Sentry 錯誤通知
- Server 異常通知

---

## 4. 客戶主機策略

客戶不一定使用 Hostinger。

你的服務應該定義為：

```text
WordPress 架站 + 跨主機集中維護服務
```

而不是：

```text
Hostinger 架站服務
```

---

### 4.1 可支援的主機類型

| 主機類型 | 是否支援 MainWP | 備註 |
|---|---|---|
| Hostinger | 可以 | 適合一般客戶 |
| DreamHost | 可以 | 適合普通 WordPress |
| Namecheap EasyWP | 可以 | 適合簡單站 |
| SiteGround | 可以 | 適合正式公司站 |
| Cloudways | 可以 | 適合進階客戶 |
| 客戶自有 VPS | 可以 | 適合高階案 |
| WordPress.com 商業方案 | 視方案 | 必須能裝外掛 |
| Wix / Squarespace / Webflow | 不適用 | 不是 WordPress |

---

### 4.2 客戶主機最低條件

客戶主機需要符合：

- 可安裝 WordPress
- 可安裝外掛
- 可安裝 MainWP Child
- PHP 版本不要太舊
- WordPress 版本不要太舊
- 可正常使用 HTTPS
- 主機防火牆不阻擋 MainWP 連線
- 最好有基本備份功能
- 最好可手動匯出網站檔案與資料庫

如果客戶主機無法安裝外掛，就不能接入 MainWP。

---

## 5. 客戶服務分級

### 5.1 基本架站方案

適合：

- 形象網站
- 個人品牌網站
- 小公司官網
- 藝術治療網站
- 作品集網站
- Landing Page
- 簡單部落格

主機建議：

- Hostinger
- DreamHost
- Namecheap EasyWP
- 其他一般 WordPress 主機

提供內容：

- WordPress 安裝
- 主題設定
- 基本頁面製作
- 基本 SEO
- SSL 設定
- MainWP Child 安裝
- 交付後可加購維護

---

### 5.2 基本維護方案

適合：

- 小型形象網站
- 個人品牌網站
- 小公司官網
- 低流量 WordPress

提供內容：

- 接入 MainWP
- 每月更新 WordPress / 外掛 / 主題
- 批次處理低風險更新
- 基本網站狀態檢查
- 基本備份檢查
- Uptime Kuma 監控
- 異常通知

---

### 5.3 進階維護方案

適合：

- 電商網站
- 預約網站
- 會員網站
- 有表單流程的網站
- 有金流的網站
- 重要商業網站

提供內容：

- 更頻繁備份
- 更新前檢查
- 重要外掛人工處理
- WooCommerce 檢查
- 表單測試
- 結帳流程測試
- Uptime Kuma 監控
- Slack 異常通知
- 必要時建立 staging 測試站

---

### 5.4 客製自動化方案

適合：

- 需要 CRM 的客戶
- 需要自動寄信的客戶
- 需要表單同步的客戶
- 需要 Google Sheet / Notion / Slack 整合的客戶
- 需要 API 串接的客戶
- 需要 AI workflow 的客戶

可使用工具：

- n8n
- Supabase
- Trigger.dev
- Slack
- Sentry
- Uptime Kuma

這類應另外報價，不應包在基本維護裡。

---

## 6. MainWP 更新策略

MainWP 可以讓更新變快，但不保證更新不會弄壞網站。

正確觀念：

```text
MainWP = 集中執行更新
備份 / 測試 / 分批更新 = 降低風險
```

---

### 6.1 可以批次更新的項目

以下屬於相對低風險，可用 MainWP 批次更新：

- SEO 外掛小更新
- 表單外掛小更新
- 圖片壓縮外掛
- 一般工具外掛
- 安全修補
- 小版本 bug fix
- 非核心功能外掛

---

### 6.2 不建議直接批次更新的項目

以下屬於高風險，不建議無腦批次更新：

- WooCommerce
- 付款外掛
- 預約外掛
- 會員外掛
- Elementor
- Bricks
- Divi
- 多語系外掛
- 快取外掛
- 主題大版本更新
- WordPress 核心大版本更新
- PHP 版本升級

這些項目應單獨處理。

---

## 7. 標準維護 SOP

每週或每月執行一次。

```text
1. 登入 MainWP Dashboard
2. 查看所有網站狀態
3. 查看哪些網站需要更新
4. 確認備份狀態
5. 批次更新低風險外掛
6. 高風險外掛單獨處理
7. 更新後檢查網站首頁
8. 檢查主要頁面
9. 檢查表單是否正常
10. 電商網站檢查商品頁 / 購物車 / 結帳頁
11. 記錄維護結果
```

---

## 8. 備份策略

不要只依賴主機商備份。

建議分成兩層：

```text
主機備份 = 整台主機出事時使用
WordPress 備份 = 單一網站出問題時使用
```

---

### 8.1 主機備份

適用情境：

- 整台 server 壞掉
- VPS 系統出問題
- 主機層災難還原

但不適合用來還原單一客戶網站，因為可能影響同一台主機上的其他網站。

---

### 8.2 WordPress 單站備份

適用情境：

- 某個網站更新外掛後壞掉
- 某個網站被誤刪內容
- 某個網站資料庫出錯
- 某個網站需要回復到前一天

建議每個維護客戶都要有單站備份策略。

---

## 9. 帳號歸屬建議

### 9.1 最推薦：客戶自己買主機

流程：

```text
客戶自己註冊主機
客戶自己付款
你取得管理權限
你幫他架站與維護
```

優點：

- 主機費由客戶承擔
- 責任清楚
- 客戶擁有自己的資產
- 未來交接容易
- 你不需要一開始承擔主機商責任

---

### 9.2 不建議初期大量代管客戶主機

如果所有客戶都放在你的主機帳號下，你會變成主機商。

風險：

- 主機出事責任在你
- 多個客戶互相影響
- 排查問題更困難
- 客戶搬家更麻煩
- 成本與責任容易不清楚

初期不建議這樣做。

---

## 10. 客戶網站接入流程

標準流程：

```text
1. 確認客戶主機可安裝 WordPress 外掛
2. 建立或登入客戶 WordPress
3. 安裝必要主題與外掛
4. 安裝 MainWP Child
5. 回到你的 MainWP Dashboard
6. Add New Site
7. 輸入客戶網站網址與連線資訊
8. 測試連線
9. 加入維護清單
10. 設定 Uptime Kuma 監控
```

---

## 11. 主機選擇建議

### 11.1 一般客戶

可選：

- Hostinger
- DreamHost
- Namecheap EasyWP

適合：

- 小公司官網
- 個人品牌
- 形象網站
- 作品集
- Landing Page
- 簡單網站

---

### 11.2 正式公司客戶

可選：

- Hostinger Business
- SiteGround
- Cloudways

適合：

- 正式公司官網
- 中小企業網站
- 較重視穩定性的客戶

---

### 11.3 電商 / 高階客戶

可選：

- Cloudways
- Hetzner VPS
- Vultr
- DigitalOcean
- 客戶自己的獨立 VPS

適合：

- WooCommerce
- 會員網站
- 預約網站
- 高流量網站
- 客製 API
- 需要 n8n / Supabase / Trigger.dev 整合的案子

---

## 12. 風險與處理方式

### 12.1 MainWP 更新弄壞網站

風險：

- 外掛衝突
- 主題相容性問題
- WooCommerce 異常
- 結帳流程壞掉
- 頁面編輯器版面跑掉

處理方式：

- 更新前確認備份
- 低風險外掛批次更新
- 高風險外掛單獨更新
- 重要網站先測試
- 電商網站檢查結帳流程

---

### 12.2 客戶主機限制

風險：

- 主機不能安裝外掛
- 防火牆擋 MainWP
- PHP 版本過舊
- 主機效能太差
- 備份功能不足

處理方式：

- 接案前確認主機條件
- 不符合條件時建議更換主機
- 或改為只做網站，不提供維護

---

### 12.3 來源不明外掛

風險：

- 被植入後門
- 無法正常更新
- 相容性不可控
- 客戶網站被入侵
- SEO 被植入垃圾連結

處理方式：

- 客戶案避免使用 nulled / 無授權外掛
- 電商 / 金流 / 預約 / 安全外掛必須使用正版或官方免費版
- 不把來源不明外掛放進標準模板

---

## 13. 階段執行計畫

### 第一階段：建立 MainWP 管理中心

```text
1. 建立 mainwp.aware-wave.com
2. 安裝 WordPress
3. 安裝 MainWP Dashboard
4. 設定安全登入
5. 設定備份
6. 建立基本維護流程
```

---

### 第二階段：接入第一個測試網站

```text
1. 選一個測試 WordPress
2. 安裝 MainWP Child
3. 接入 MainWP Dashboard
4. 測試更新外掛
5. 測試網站狀態檢查
6. 測試備份流程
```

---

### 第三階段：接入客戶網站

```text
1. 確認客戶主機符合條件
2. 安裝 MainWP Child
3. 接入 MainWP Dashboard
4. 設定 Uptime Kuma 監控
5. 加入維護清單
6. 建立維護紀錄
```

---

### 第四階段：建立維護產品

整理成三種服務：

```text
基本維護
進階維護
客製自動化
```

讓客戶清楚知道：

```text
架站費 ≠ 維護費
主機費 ≠ 維護費
自動化費 ≠ 基本維護費
```

---

## 14. 最終結論

你的最佳策略是：

```text
客戶網站不綁特定主機
只要是支援 WordPress 外掛的主機即可
每個客戶 WordPress 安裝 MainWP Child
你的 MainWP Dashboard 放在自己的管理主機
用 MainWP 集中管理所有客戶網站
Uptime Kuma / Slack / n8n 作為維運加值服務
高階客戶再使用 Cloudways / VPS / CloudPanel
```

最短記法：

```text
客戶主機 = 放客戶網站
MainWP Child = 裝在客戶 WordPress
MainWP Dashboard = 你的管理總部
Hetzner EU = 放你的管理工具
CloudPanel = 只有 VPS 案才需要
```

你的服務定位應該是：

```text
WordPress 架站 + 跨主機集中維護服務
```

而不是：

```text
某一家主機商的架站服務
```

---

## 15. MainWP 控制平面安全基線（必做）

目標：避免 MainWP Dashboard 成為單點風險。

### 15.1 管理面保護

- MainWP Dashboard 只允許專用管理帳號登入，不與日常帳號混用
- 強制啟用 MFA（至少 TOTP）
- 啟用 Cloudflare WAF + rate limit（特別是 wp-login / xmlrpc）
- 僅允許 HTTPS，禁止弱 TLS 與明文轉送
- 若可行，限制後台登入來源 IP（固定辦公/家用 IP）

### 15.2 網路與權限分層

建議分成三層，降低橫向入侵風險：

```text
Tier A（控制平面）：mainwp.aware-wave.com
Tier B（監控/通知）：uptime + alerting bridge
Tier C（自動化）：n8n + trigger
```

原則：

- MainWP 不直接承擔不必要的 webhook 處理
- 自動化工具被打穿時，不應直接取得 MainWP 管理權限
- 每一層使用不同憑證與最小權限 API key

---

## 16. 維護 SLO、RPO/RTO 與回滾機制（必做）

### 16.1 服務目標（SLO）

建議先定義最低可交付門檻：

- 監控可達率：99.9%（以月計）
- 備份成功率：99%（以月計）
- 重大異常（P1）告警送達率：99%

### 16.2 備份與還原目標（RPO/RTO）

分級建議：

| 方案 | RPO | RTO |
|---|---|---|
| 基本維護 | 24 小時 | 4 小時 |
| 進階維護 / 電商 | 1 小時（或每日多次） | 1 小時 |

### 16.3 更新與回滾閉環

每次更新都走同一閉環：

```text
分群（低/高風險）
→ 更新前備份
→ 分批更新
→ 健康檢查（首頁/關鍵頁/表單/結帳）
→ 失敗即回滾
→ 記錄維護結果
```

禁止「全部網站一次更新後再看有沒有壞」。

---

## 17. 客戶責任邊界（RACI）

避免責任不清，至少定義下表：

| 項目 | 客戶（Owner） | 你（維運） |
|---|---|---|
| 主機帳單與續費 | R | C |
| 網域所有權與續費 | R | C |
| DNS 權限 | R | C |
| WordPress 更新與維護 | C | R |
| 外掛授權合法性 | R | C |
| 維護操作與紀錄 | C | R |
| 資安事件應變（技術） | C | R |
| 商務決策（停機公告/賠償） | R | C |

R = Responsible，C = Consulted。

---

## 18. 外掛/主題供應鏈政策

### 18.1 三層清單

- Allow list：已驗證可用
- Review queue：新工具先審核
- Block list：禁用（來源不明、長期不維護、有重大漏洞）

### 18.2 汰換規則

- 超過 12 個月無維護更新，列入替換評估
- 關鍵外掛（金流、會員、預約、安全）需正版或官方免費版
- 發現來源不明外掛，優先下架與風險通報

---

## 19. 告警分級與通知路由

### 19.1 分級

- P1：站點不可用、結帳失效、重大資安事件
- P2：功能降級、部分頁面異常
- P3：一般警示、非即時影響

### 19.2 路由

```text
P1：Slack 即時 + 升級通知（Telegram/電話）
P2：Slack 頻道 + 值班處理
P3：日報/週報彙整
```

### 19.3 去噪

- 同事件去重
- 冷卻時間（cooldown）
- 每週回顧誤報率，持續調整閾值

---

## 20. 操作介面與日常路徑（你問的「操作介面在哪裡」）

### 20.1 主要操作介面

```text
MainWP 主控後台：
https://mainwp.aware-wave.com/wp-admin/
```

你日常主要在這裡做：

- Sites（網站總覽）
- Updates（核心/外掛/主題更新）
- Backups（備份狀態）
- Security / Settings（安全與系統設定）

### 20.2 其他輔助介面

```text
Uptime Kuma：
https://uptime.aware-wave.com

n8n：
https://n8n.aware-wave.com

Slack：
維運告警頻道（建議固定 #ops-alerts）
```

### 20.3 實務建議

- 你每天主要看 MainWP + Uptime Kuma
- n8n 用於「流程自動化」而不是每日手動巡檢
- Slack 是通知入口，不是操作入口

---

## 21. 每個客戶分開更新 SOP（你的預設模式）

你要求的是「每個客戶網站分開更新」，以下定為標準流程。

### 21.1 更新原則

```text
一次只更新一個客戶
更新後先驗證再換下一個客戶
高風險外掛永遠單獨處理
```

### 21.2 MainWP 後台操作路徑

主要入口：

```text
https://mainwp.aware-wave.com/wp-admin/
```

兩種做法（都可以）：

1. `MainWP -> Sites -> [客戶站點]`  
   只在該客戶站頁面更新 Core / Plugins / Themes

2. `MainWP -> Updates -> Site filter（單一客戶）`  
   在篩選後清單做 Bulk update（只作用該客戶）

### 21.3 單一客戶更新步驟（固定 8 步）

```text
1. 選定客戶（今天只做一位）
2. 確認該客戶最新備份可還原
3. 在 MainWP 篩到該客戶站
4. 先更新低風險項目（小版本/工具型外掛）
5. 高風險項目（Woo/金流/會員/Builder）單獨更新
6. 更新後驗證首頁、關鍵頁、表單（電商加測購物車/結帳）
7. 有異常立即回滾該客戶站
8. 記錄維護結果（完成/異常/回滾）
```

### 21.4 更新完成判定（DoD）

至少符合：

- 站點可開啟（首頁 200）
- 主要頁面可讀
- 表單可送出
- 電商站可加入購物車與進入結帳頁
- 無新增重大錯誤告警（Uptime / Slack）

---

## 22. 客戶端安裝 MainWP Child（完整指引）

本節定義「客戶網站如何接入 MainWP」的標準安裝與驗收流程。

### 22.1 先決條件（客戶端）

客戶網站需符合：

- 已是可登入的 WordPress 後台
- 可安裝外掛（有管理員權限）
- 網站可 HTTPS 連線
- 主機未封鎖必要 outbound 請求

### 22.2 客戶端安裝步驟（在客戶 WordPress 後台）

```text
1. 登入客戶網站 wp-admin
2. Plugins -> Add New
3. 搜尋「MainWP Child」
4. Install Now
5. Activate
6. 進入 MainWP Child 設定頁
7. 記下站點 URL（確認與正式網址一致）
```

### 22.3 在你的 MainWP Dashboard 接入客戶站

在 `mainwp.aware-wave.com`：

```text
1. MainWP -> Sites -> Add New Site
2. 輸入客戶網站 URL
3. 輸入客戶站管理帳號資訊（或依 MainWP 連線方式）
4. 測試連線
5. 成功後加入客戶分組（Tag/Client）
6. 儲存
```

### 22.4 接入後立即做的 5 個驗收

```text
1. MainWP 顯示該站 Online
2. 可讀取該站可更新項目
3. 可成功執行一次低風險外掛更新（測試用）
4. Uptime Kuma 已建立該站監控
5. 該站已加入維護清單（含責任人與頻率）
```

### 22.5 常見失敗與排除

- 連線失敗：先確認客戶站網址是否正確（www/非 www）
- 驗證失敗：重設客戶站管理員密碼再重試
- 被防火牆擋：請主機商放行相關流量
- 外掛無法啟用：檢查 PHP 版本與權限

---

## 23. 客戶分組與命名規範（避免日後混亂）

建議用統一 Tag / Group 命名：

```text
client:<slug>        例：client:soulful
tier:basic|pro       例：tier:pro
risk:low|high        例：risk:high
type:corp|shop|blog  例：type:shop
```

用途：

- 快速篩選單一客戶更新
- 高風險客戶先人工處理
- 可直接對應報價方案與 SLA

---

## 24. 一頁版日常操作（給你自己與團隊）

每天/每週就照這張做：

```text
入口：mainwp.aware-wave.com/wp-admin

1. 看 Uptime 告警
2. 挑 1 位客戶（分開更新）
3. 先備份可還原
4. 低風險更新
5. 高風險單獨更新
6. 驗證核心流程
7. 記錄結果
8. 下一位客戶
```

這樣可保證：

- 不會一次炸全部客戶
- 出問題時可精準回滾
- 維護品質可稽核、可交付、可長期擴張

---

## 25. 部署紀錄（EU Hetzner — 2026-05-09）

### 25.1 部署完成狀態

| 項目 | 狀態 | 細節 |
|------|------|------|
| Docker Compose | ✅ | `/root/mainwp/docker-compose.yml` — `wordpress:6.7-apache` + `mysql:8.0` |
| 容器狀態 | ✅ | `mainwp-web` Up, `mainwp-db` Up (healthy) |
| 內部端口 | ✅ | `127.0.0.1:8090:80`（僅本機可達） |
| WordPress 安裝 | ✅ | 核心安裝完成，管理員 `awmainwp` |
| MainWP Dashboard | ✅ | 版本 6.0.12，已激活，唯一外掛 |
| nginx vhost | ✅ | `/etc/nginx/sites-enabled/mainwp.aware-wave.com`（HTTP-only，等 DNS） |
| 速率限制 | ✅ | `wp-login.php` 5r/m，`wp-admin/` 30r/m |
| xmlrpc.php | ✅ | nginx 層完全封鎖 |
| fail2ban | ✅ | `wordpress-nginx` jail 監控 nginx access.log，8 次觸發 |
| DISABLE_WP_CRON | ✅ | 由 host crontab `*/5 * * * *` 替代 |
| DISALLOW_FILE_EDIT | ✅ | wp-config 層強制 |
| FORCE_SSL_ADMIN | ✅ | wp-config 層強制，X-Forwarded-Proto pass-through |
| Uptime Kuma | ✅ | Monitor ID 22：`MainWP Dashboard (EU)` — 60s 間隔 |
| 備份腳本 | ✅ | `/root/mainwp/scripts/migrate-to-vps.sh` |

### 25.2 資安強化清單

- `DISALLOW_FILE_EDIT` = true（禁止後台直接編輯檔案）
- `WP_DEBUG` = false（不暴露錯誤訊息）
- `DISABLE_WP_CRON` = true（host cron 替代，避免偽造 HTTP 觸發）
- `WP_AUTO_UPDATE_CORE` = 'minor'（小版本自動更新）
- `WP_POST_REVISIONS` = 3（限制版本數量）
- xmlrpc.php → nginx 403 封鎖
- `wp-login.php` → fail2ban + nginx rate-limit 雙層保護
- `wp-admin/` → nginx rate-limit 保護
- 容器資源限制：web 256M/0.25 CPU，db 384M/0.25 CPU
- 容器日誌 JSON file driver，max 10m×3 輪轉

### 25.3 待操作（需操作者介入）

**Step 1 — 在 Cloudflare 新增 DNS A 記錄：**

```
mainwp.aware-wave.com → 204.168.175.41 (EU Hetzner)
Proxy: DNS only (灰雲)，等 SSL 建立後可開橘雲
TTL: Auto
```

**Step 2 — DNS 傳播後 SSH 至 EU，執行 certbot expand：**

> 🚨 `204.168.175.41` 已刪除退租；此步驟若尚未執行過，只連 ks-aw-01 `145.239.195.47`（SSH `-p 58122 ubuntu@` + `sudo`）。

```bash
ssh root@204.168.175.41
certbot --expand \
  -d supabase.aware-wave.com \
  -d n8n.aware-wave.com \
  -d studio.aware-wave.com \
  -d trigger.aware-wave.com \
  -d uptime.aware-wave.com \
  -d mainwp.aware-wave.com \
  --nginx --non-interactive --agree-tos
```

certbot 會自動更新 `/etc/nginx/sites-enabled/mainwp.aware-wave.com`，加上 SSL 區塊。

**Step 3 — 驗證 SSL 後開啟搜尋引擎索引：**

```bash
docker exec mainwp-web wp option update blog_public 1 --allow-root
```

**Step 4 — 在 MainWP Dashboard 後台完成初始化：**

- 登入 `https://mainwp.aware-wave.com/wp-admin`（帳號：`awmainwp`，密碼見 vault/`.env`）
- 完成 MainWP 設定精靈
- 新增第一個客戶網站（安裝 MainWP Child 外掛）

### 25.4 備份與還原

備份腳本：`/root/mainwp/scripts/migrate-to-vps.sh backup`
輸出：`/root/mainwp/backups/mainwp-db-<timestamp>.sql` + `mainwp-files-<timestamp>.tar.gz`

還原：`/root/mainwp/scripts/migrate-to-vps.sh restore <db.sql> <files.tar.gz>`

### 25.5 Email（FluentSMTP）設定 <2026-05-09>

**狀態：運作中 ✅**

| 欄位 | 值 |
|------|-----|
| Plugin | FluentSMTP 2.2.95 |
| Provider | Generic SMTP (`smtp` key → `Smtp` handler) |
| Host | `smtp.resend.com` |
| Port | `587` (STARTTLS；465 被 EU VPS 封鎖) |
| 認證 | username=`resend` / password=Resend API key |
| Sender | `noreply@aware-wave.com` |
| Force from email | yes |

**Resend 域名驗證（aware-wave.com）**：
- Domain ID: `54f1cc8b-b4c0-44a4-a94d-a383509b5fea`
- Cloudflare DNS 新增：DKIM TXT (`resend._domainkey`) + SPF MX (`send`) + SPF TXT (`send`)
- 狀態：`verified` ✅

**關鍵修正紀錄**：`provider_settings` 內必須有 `"provider" => "smtp"`，否則 FluentSMTP Factory 會嘗試建立空字串類別（`ReflectionException: Class "" does not exist`）。
