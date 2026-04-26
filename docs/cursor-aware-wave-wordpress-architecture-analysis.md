# aware-wave.com 架構文件 — 分析與建議調整

> **對照來源**：`docs/aware-wave-wordpress-architecture.md`（多模型彙整之「高流量 WooCommerce + Cloudflare 邊緣」建議稿）。  
> **本文角色**：不取代該檔；僅說明與**營運現況**的落差、可保留段落、建議另寫或改寫之處。  
> **現況假設（依營運者說明）**  
> - **新加坡（SG）**：WordPress、`api`、`app`（Next 管理端）  
> - **歐洲（EU）**：n8n、Supabase、Trigger.dev、Uptime Kuma  

---

## 1. 總體判斷

| 維度 | 判斷 |
|------|------|
| **區域分工** | 原文件「SG 承載使用者面向站點、EU 承載平台與自動化」與上述現況**方向一致**；但原架構圖**未畫出** SG 上的 **API**、**app**，EU 上亦**未標示 Uptime Kuma**，易讓讀者以為 SG 僅有 WP 三件套。 |
| **技術深度** | Cloudflare、快取 bypass、登入與 API rate limit、DB 不對公網等，可作**跨區共通檢查清單**。 |
| **實作綁定** | 文件內 **Docker Compose 範例（php-fpm + 容器內 TLS）**、**PHP-FPM pool 數字**、**商業外掛套餐** 屬「典型 Woo 商店」模板，**不應**未加註即等同 Aware Wave 單一真相；需與 monorepo（例如 `lobster-factory/infra/hetzner-phase1-core`）及**兩區實機**對照。 |

---

## 2. 原文件與現況對照

### 2.1 架構總覽圖

| 原文件 | 建議 |
|--------|------|
| SG：WordPress + MariaDB + Redis | 保留；若 **api / app** 與 WP **同主機或同叢集**，應在圖中**明確列出**，避免「只有 WP」。 |
| EU：n8n、Trigger、Supabase | 保留；應**補上 Uptime Kuma**（與你方 EU 部署一致）。 |
| 未體現跨區呼叫 | 建議加**虛線或註解**：app/api（SG）↔ Supabase／Trigger／n8n（EU）的**延遲、逾時、重試**為架構風險項，而非僅「未來搬機」一句話。 |

### 2.2 Cloudflare（第一節）

**適合保留**：Full (Strict)、Always HTTPS、WAF、關鍵路徑 rate limit、Woo 相關 **cache bypass**（若確有 Woo）。

**建議調整**：

- **Minify（HTML/CSS/JS）**：若 **app** 為 Next 等現代前端，邊緣 minify 有時會與框架產物衝突；建議寫明「**僅對靜態／WP 路徑啟用**」或與工程約定 Cache Rule 分區。
- **Turnstile / Bot Fight / Images / R2**：改為「**依專案已啟用清單**」勾稽，避免讀者以為全部已上線。

### 2.3 伺服器與 Compose（第二節）

**適合當參考**：MariaDB 記憶體上限、Redis `maxmemory`、slow query、json-file log 輪替等**原則**。

**建議調整**：

- 標題或開頭加一句：**「以下為 FPM + 容器 Nginx 之示意，非 Aware Wave SG/EU 實機 compose 正本。」**
- **PHP-FPM 小節**：若 SG WordPress 實際為 **Apache + mod_php**，應註明「FPM 段落僅在採 FPM 架構時適用」，否則易誤調參。
- **記憶體表（約 4GB）**：僅在「**該節點職責與文件假設一致**」時成立；SG 若同時跑 **WP + api + app**，需**重新加總**容器與程序上限，不可直接沿用「純 WP + DB + Redis」切法。

### 2.4 外掛與 WooCommerce（第三、四節）

**適合**：作為「若商業路線為 **WooCommerce + 付費效能外掛**」的選型備忘。

**建議調整**：

- 改標題語氣為「**選型參考（條件式）**」，避免「最終定案」在未採購／未上線時造成誤解。
- 若無 Woo，可註明「**整章可略**」或移至附錄。

### 2.5 監控（原第六節）

**適合**：Uptime 監控表中的公開 URL、REST smoke、與 Sentry 分層敘述。

**建議調整**：

- **Netdata**：寫成「**SG 節點 + EU 節點**（台數以實際為準）」，與兩區部署一致。
- **Uptime Kuma**：若實例在 EU，表中 URL 仍可監全球，但宜註明「**探測器所在區域**」以免與「使用者主要在亞洲」的 SLO 解讀混淆（必要時加第二探測或外部 SaaS）。
- **app 路徑**：若同時存在 **`app.aware-wave.com`** 與 **`aware-wave.com/admin`**，監控與告警應**刻意設計**，避免漏監或重複轟炸。

### 2.6 安全 Checklist（原第八節）

**適合**：DB/Redis 不對公網、UFW、SSH、swap、fail2ban 等。

**建議調整**：

- **兩區各一份**：同一條目在 SG、EU **分別勾選**（金鑰、patch、備份、日誌保留策略可能不同）。
- **Studio／管理後台**：若採 **nginx basic auth** 而非 Cloudflare Access，checklist 應寫成「**Access 或等效邊界**」，與實作一致即可。

### 2.7 評分與未來路徑（原第十節）

**建議**：主觀星級對工程決策幫助有限，可改為**取捨表**（複雜度、成本、延遲、合規、單點風險）。

**未來路徑**：「Supabase 搬區」類敘述在你們**已跨洲**的前提下，應連到**可量測指標**（例如特定 API P95、錯誤率、連線逾時率），再決定是否搬遷或讀副本，避免純口號式規劃。

---

## 3. 跨 SG–EU 的架構建議（補原文件不足）

1. **資料與一致性**  
   - 明確區分：**WP 庫（SG）**、**Supabase（EU）**、Trigger／n8n 狀態；各自 **RPO/RTO** 與還原演練分開寫。  
   - 文件內 **mysqldump → R2** 僅涵蓋典型 **WP DB**；**不**等同整體災備。

2. **應用程式逾時與重試**  
   - SG 的 **api / app** 呼叫 EU 服務時，預設逾時、重試、斷路（circuit breaker）與 idempotency 應在 API 設計層成文，並反映在監控儀表。

3. **機敏與合規**  
   - 兩區 **金鑰輪替、SSH、日誌留存、個資跨境**（若有歐盟使用者資料）建議獨立小節；原文件偏單機安全。

4. **成本與流量**  
   - 跨洲 egress 可能影響 Supabase／API 成本與延遲；若大量媒體走 R2/Images，與「API 在 SG、物件在 Cloudflare」的組合需在文件或附錄中**對齊計費模型**。

---

## 4. 建議的文件結構調整（針對 `aware-wave-wordpress-architecture.md`，供後續人工改寫）

1. **開頭加「文件狀態」**：現況部署（SG/EU 清單）+ 本文哪些章為「條件式（Woo / R2 / FPM）」。  
2. **架構圖**：補 **api、app（SG）**；補 **Uptime（EU）**；加跨區資料流註解。  
3. **Compose / PHP**：與實機分離，標為附錄或「參考模板」。  
4. **監控**：與實際 Kuma 位址、探測維度一致；必要時寫「亞洲使用者 SLO vs 探測機位於 EU」之取捨。  
5. **安全與備份**：擴充為**兩區 checklist** + **分系統備份還原**。  

---

## 5. 與 monorepo 的關係（提醒）

`lobster-factory/infra/hetzner-phase1-core` 等路徑可能描述**開發或單機整合**時的 compose；與**營運上 SG/EU 分拆**並存時，建議在架構文件中**明說**：「repo 為某環境正本；生產跨區以 runbook／基礎設施即程式另庫為準」，避免新成員只讀一份 doc 就假設單一 VPS。

---

_Last updated: analysis note; not auto-synced to other docs._
