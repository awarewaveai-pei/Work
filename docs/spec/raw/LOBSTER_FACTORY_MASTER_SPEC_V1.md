# **Lobster Factory Master Spec v1 — 第 1 部分**

副標：**一人跨國 AI 公司 / Agency OS / Client OS / WordPress Factory / Content Factory / Ops Factory 總規格**

這一份先處理最根本的東西：

1. 你到底在建什麼  
2. 系統的總目標與邊界  
3. 全部模組怎麼分層  
4. 哪些可以自動，哪些不能自動  
5. 多租戶、權限、安全、資料隔離怎麼設計  
6. 你的平台應該長成什麼樣子

下一部分我會接著給你：

* **第 2 部分：各 domain 的 workflow spec**  
* **第 3 部分：Supabase schema / agent spec / governance / rollout / roadmap**

---

> **📌 規格原文維護**  
> **四份整合入口**：[`company-os-four-sources-integration.md`](../../../agency-os/docs/overview/company-os-four-sources-integration.md)｜[`README-four-sources-maintenance.md`](README-four-sources-maintenance.md)  
> **按需對照**：系統介紹 [`agency-os-complete-system-introduction.md`](../../../agency-os/docs/overview/agency-os-complete-system-introduction.md)｜總控 [`agency-command-center-v1.md`](../../../agency-os/docs/architecture/agency-command-center-v1.md)｜龍蝦 routing [`MCP_TOOL_ROUTING_SPEC.md`](../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md)  
> **本檔大段（第 1 部分）**：§0 定義 → §1 總目標 → §2 邊界 → §3 三 OS → §4–5 架構 → §6 多租戶 → §7 權限 → §8 自動化等級 → §9 HITL → §10 技術棧…（後續章請於檔內搜尋標題）

---

# **0\. 先定義：你不是在做自動化，你是在做一間可複製的公司**

你要建的，不是單純「自動化很多事」的系統。  
你要建的是一個：

## **AI-native Operating Company**

也就是：

* 你自己的公司能靠這套系統運作  
* 客戶公司的營運也能掛在這套系統上  
* 同一套核心平台，可以複製到不同國家、不同產業、不同客戶  
* 每次接新客戶，不是重做一次，而是套用模板、流程、規則、agent、package  
* 公司不是靠你本人手工維持，而是靠一套有記憶、有決策、有執行、有回饋的系統持續跑

所以這個系統的本質不是「網站自動生成器」，而是：

## **Lobster Factory \= Company-as-a-System**

---

# **1\. 系統總目標**

你的平台最終要做到 8 件事：

## **1.1 自動獲客與接案**

包含：

* 線索蒐集  
* 網站表單/廣告/社群進件  
* 自動分類 lead  
* 自動初步估價  
* 自動預約會議  
* 自動建立客戶資料夾與案件

## **1.2 自動交付數位產品與服務**

包含：

* WordPress / WooCommerce 建站  
* SEO 內容  
* 社群內容  
* 廣告素材  
* 教學文件  
* SOP  
* 客服流程  
* CRM 流程  
* 營運報表

## **1.3 自動營運**

包含：

* 任務分派  
* 行事曆排程  
* 客服分流  
* 續約提醒  
* 錯誤告警  
* KPI 追蹤  
* 每週/每月報告

## **1.4 自動優化**

包含：

* 內容成效分析  
* funnel 優化  
* SEO 迭代  
* prompt/template 版本更新  
* A/B 測試  
* 錯誤修復後驗證  
* 無效策略淘汰

## **1.5 自動知識化**

包含：

* 自動產 SOP  
* 自動產教學文  
* 自動產教學影片  
* 自動更新操作手冊  
* 把每次成功案例沉澱成模板

## **1.6 自動治理**

包含：

* 權限控制  
* 審批流程  
* 審計記錄  
* 回滾能力  
* feature flag  
* secret 管理  
* 多租戶隔離

## **1.7 自動商業化**

包含：

* 自動報價  
* 自動收款  
* 自動續約  
* 自動 upsell / cross-sell  
* 客戶分級  
* ROI 追蹤  
* 利潤分析

## **1.8 自動進化**

包含：

* 根據結果調整流程  
* 根據錯誤調整 runbook  
* 根據收入調整資源投入  
* 根據成效升級模板/agent/內容策略  
* 逐步減少人工參與

---

# **2\. 系統邊界**

這很重要。  
你必須先知道什麼事情屬於這個系統，什麼不屬於。

## **2.1 這個系統負責的範圍**

### **A. 你公司內部**

* 客戶管理  
* 專案管理  
* 建站交付  
* 內容工廠  
* 行銷工廠  
* 客服工廠  
* 報表與續約  
* 財務流程管理  
* 稅務資料整理  
* 合約與法務流程管理  
* 知識管理  
* 自動修復與維運

### **B. 客戶公司**

* 官網/電商站  
* SEO 內容  
* 社群排程  
* 基礎 CRM  
* 客服聊天  
* FAQ / SOP / 教學內容  
* 基本報表  
* 基礎自動化流程

## **2.2 這個系統不直接承諾全自動的範圍**

以下類別必須設為 **human-in-the-loop**：

* 法律定稿  
* 合約最終送出  
* 稅務申報最終送件  
* 高風險客服決策（退款糾紛、法律威脅、醫療、金融）  
* production 重大更新  
* 金流/訂閱/退款最終執行  
* 大額支出  
* 客戶帳號刪除  
* DB schema destructive migration  
* SEO 大規模內容替換  
* 品牌形象重大變更

這裡的原則是：

## **可自動準備，不可無限制自動裁決**

---

# **3\. 平台角色：你不是只做 Agency OS，而是三個 OS 疊在一起**

你的平台本質上是三層操作系統：

## **3.1 Agency OS**

給你自己公司用的

處理：

* 客戶  
* 專案  
* 任務  
* 報價  
* 交付  
* 維運  
* KPI  
* 收款  
* 續約  
* SOP  
* 內部 agent 管理

## **3.2 Client OS**

給客戶公司用的

處理：

* 官網  
* 訂單  
* lead  
* 客服  
* 內容  
* 社群  
* FAQ  
* 行事曆  
* 教學  
* 基本報表

## **3.3 Factory OS**

真正讓你形成規模優勢的核心層

處理：

* 模板  
* manifests  
* packages  
* reusable workflows  
* agents  
* prompt systems  
* playbooks  
* deployment pipeline  
* evaluation system  
* learning loop

這三層不能混在一起。  
你要設計成：

* Agency OS 管理「生意」  
* Client OS 管理「客戶營運」  
* Factory OS 管理「複製能力」

---

# **4\. 頂層架構**

先給你最重要的總圖。

┌─────────────────────────────────────────────────────────┐  
│                    LOBSTER FACTORY                      │  
├─────────────────────────────────────────────────────────┤  
│ 1\. CONTROL PLANE                                        │  
│ orgs / tenants / roles / permissions / billing / flags │  
│ audit / approvals / secrets / contracts / policies     │  
├─────────────────────────────────────────────────────────┤  
│ 2\. EXECUTION PLANE                                      │  
│ n8n / Temporal / MCP Agents / GitHub Actions / WP CLI  │  
│ AI jobs / publish jobs / deploy jobs / recovery jobs   │  
├─────────────────────────────────────────────────────────┤  
│ 3\. DATA PLANE                                           │  
│ Supabase Postgres / Storage / vectors / assets / logs  │  
│ brand data / clients / sites / prompts / artifacts     │  
├─────────────────────────────────────────────────────────┤  
│ 4\. OBSERVABILITY PLANE                                  │  
│ Sentry / run logs / traces / analytics / alerts        │  
│ failures / health / SLA / rollback states              │  
├─────────────────────────────────────────────────────────┤  
│ 5\. DECISION PLANE                                       │  
│ KPI evaluator / scoring engine / AI strategy engine    │  
│ prioritization / experiment planner / optimizer        │  
├─────────────────────────────────────────────────────────┤  
│ 6\. DELIVERY PLANE                                       │  
│ WP sites / content channels / social / LINE / YouTube  │  
│ client portals / docs / training center / reports      │  
└─────────────────────────────────────────────────────────┘

---

# **5\. 每一層的責任**

## **5.1 Control Plane**

這層是大腦外殼。  
不負責做事，但負責決定誰能做什麼。

它管理：

* 公司  
* 客戶  
* 使用者  
* 權限  
* 功能開關  
* 方案與計費  
* 審批  
* 合約狀態  
* 安全政策  
* 秘密管理  
* 審計軌跡

### **核心原則**

任何高風險行為，都不能繞過 Control Plane。

---

## **5.2 Execution Plane**

這層是手腳。  
負責真的去執行流程。

包含：

* 自動建立網站  
* 安裝外掛  
* 發內容  
* 上傳影片  
* 回覆客服  
* 建立報表  
* 發通知  
* 建 issue  
* 跑測試  
* 修復 staging  
* 產影片  
* 建文件

### **核心原則**

Execution 只負責執行，不負責亂決策。

---

## **5.3 Data Plane**

這層是記憶。

儲存：

* 客戶資料  
* 網站資料  
* 品牌規範  
* 內容資產  
* SEO 資料  
* 客服紀錄  
* 銷售漏斗  
* 收入成本  
* 法務文件  
* 教學素材  
* 流程歷史  
* agent 執行記錄  
* 決策紀錄

### **核心原則**

所有重要行為都要有資料化痕跡。

---

## **5.4 Observability Plane**

這層是眼睛與神經系統。

觀察：

* 哪裡失敗  
* 哪裡慢  
* 哪裡掉轉換  
* 哪個 agent 出錯  
* 哪個流程異常  
* 哪個客戶不賺錢  
* 哪個發佈導致壞掉

### **核心原則**

看不見的系統，不能自動進化。

---

## **5.5 Decision Plane**

這層才是龍蝦工廠的靈魂。

它不是單純 chatbot。  
它是你的：

* AI COO  
* AI PM  
* AI analyst  
* AI optimizer  
* AI traffic allocator  
* AI triage layer

它會看：

* 收入  
* 成本  
* 轉換  
* 錯誤率  
* SEO 排名  
* 內容成效  
* 客服量  
* 交付延遲  
* churn 風險

然後決定：

* 哪些流程加碼  
* 哪些流程停掉  
* 哪個 prompt 升版  
* 哪個客戶應該 upsell  
* 哪個問題要優先修  
* 哪個站適合推出新 package  
* 哪些服務不能再免費做

### **核心原則**

沒有 Decision Plane，就只是自動化堆疊，不是龍蝦工廠。

---

# **6\. 多租戶模型**

你未來一定會遇到兩種租戶，不先定義一定出事。

## **6.1 Tenant 類型**

### **Tenant A：你的公司**

用途：

* 管理所有客戶  
* 管理所有內部人員  
* 管理模板、workflow、agents、packages、playbooks  
* 管理收費與整體 KPI

### **Tenant B：客戶公司**

用途：

* 管理自己的網站、內容、客服、資料、使用者、報表  
* 只能看自己的資料  
* 可以使用被授權的 factory capabilities

---

## **6.2 Tenant 隔離原則**

所有資料必須最少帶這兩個欄位：

* `organization_id`  
* `workspace_id` 或 `client_id`

對部分跨客戶共享資產，再加：

* `scope_type`：global / agency / client / site  
* `scope_id`

### **範例**

* 全域模板：global  
* 你公司專用 SOP：agency  
* 客戶品牌規範：client  
* 某個網站專用內容：site

---

## **6.3 共享與隔離**

### **可以共享**

* 系統內核  
* agent framework  
* package registry  
* manifests schema  
* workflow engine  
* 部分通用 prompt  
* 共用 runbook  
* 共用 plugin package 定義

### **不可共享**

* 客戶私有資料  
* 客戶對話紀錄  
* 客戶財務資料  
* 客戶訂單資料  
* 客戶名單  
* 客戶品牌素材  
* 客戶 secrets  
* 客戶法務/合約內容

---

# **7\. 權限模型**

你不能只做 admin/user 兩層。  
你至少要做 **五層權限設計**。

## **7.1 身份層**

一個使用者可以同時屬於多個 organization。

例如：

* 你本人同時屬於 agency tenant 與多個客戶 tenant  
* 客戶 marketing manager 屬於 client tenant  
* 外包 designer 只屬於某個 client project

---

## **7.2 角色層**

標準角色建議：

### **Agency 角色**

* agency\_owner  
* agency\_admin  
* strategist  
* developer  
* operator  
* seo\_manager  
* content\_manager  
* sales\_manager  
* finance\_manager  
* support\_manager  
* legal\_reviewer

### **Client 角色**

* client\_owner  
* client\_admin  
* client\_marketer  
* client\_sales  
* client\_support  
* client\_editor  
* client\_finance  
* client\_viewer

---

## **7.3 資源層**

權限不能只看角色，還要看資源。

資源類型至少有：

* site  
* workflow  
* content\_asset  
* lead  
* contact  
* invoice  
* report  
* contract  
* support\_ticket  
* automation  
* secret\_reference  
* prompt\_template  
* experiment  
* deployment

---

## **7.4 動作層**

每個資源要定義動作：

* read  
* create  
* update  
* delete  
* approve  
* publish  
* deploy  
* execute  
* rollback  
* export  
* bill  
* view\_logs  
* manage\_secrets  
* manage\_roles

---

## **7.5 風險層**

同一個動作，風險等級不同，要求不同。

### **low risk**

* 草稿內容生成  
* 內部筆記更新  
* staging 測試

### **medium risk**

* 發社群內容  
* 改 email campaign  
* 更新 FAQ  
* 啟用某些自動化

### **high risk**

* production deploy  
* 金流設定  
* 刪除資料  
* 退款  
* 合約送出  
* 稅務提交  
* 大規模 SEO 更新  
* secrets 讀取  
* 角色變更

### **規則**

high risk 一律需要：

* 明確權限  
* 審計紀錄  
* 必要時雙重確認或人工審批

---

# **8\. 自動化等級模型**

這一段非常重要。  
因為很多人失敗，是因為把所有事情都想成「全自動」。

你應該把所有能力切成 5 級。

## **Level 0：Manual**

完全手動。  
只記錄，不自動。

適用：

* 新國家法律流程  
* 新稅制  
* 高風險糾紛  
* 首次 enterprise 客戶定價

---

## **Level 1：Assist**

AI 幫你準備，但不自動送出。

適用：

* 合約草稿  
* 稅務整理  
* 法務摘要  
* 客服草稿  
* SEO outline  
* 教學影片腳本

---

## **Level 2：Semi-auto**

AI 準備 \+ 人工批准 \+ 系統執行。

適用：

* 文章發布  
* 客服高價值回覆  
* 客戶提案  
* YouTube 上架  
* 新站 launch  
* production deploy

---

## **Level 3：Auto with guardrails**

在既定規則下自動執行，出事自動停。

適用：

* 例行社群排程  
* FAQ 回覆  
* 內部報表  
* SEO refresh  
* staging rebuild  
* 低風險資料同步

---

## **Level 4：Self-optimizing**

可在明確 KPI 下自動嘗試、比較、保留勝者。

適用：

* email subject A/B  
* CTA 文案測試  
* 內容模板變體  
* landing page element testing  
* 社群發文時段  
* FAQ 回覆版本優化

---

## **Level 5：Autonomous strategic loop**

系統自己看結果、提出策略、排優先順序、控制資源投入。  
但這一級仍然不應該無限權限。

適用：

* 哪些客戶該 upsell  
* 哪些服務該停掉  
* 哪些關鍵字要加碼  
* 哪些流程需要重構  
* 哪些 content pipeline 該升版  
* 哪些 agent 該 rollback

---

# **9\. 哪些模組一定要 human-in-the-loop**

下面這份你之後要直接寫進系統政策。

## **9.1 法務**

只能自動：

* 蒐集資料  
* 產草稿  
* 摘要條款  
* 比對版本

不能直接自動：

* 最終法律判斷  
* 最終送件  
* 訴訟應對  
* 具有法律承諾的對外聲明

---

## **9.2 稅務**

只能自動：

* 整理憑證  
* 分類收入支出  
* 生成草稿表單  
* 提醒截止日  
* 匯出給會計

不能直接自動：

* 最終申報  
* 主動提交政府系統  
* 自動解釋法律風險  
* 自行判定灰色地帶稅務策略

---

## **9.3 財務**

只能自動：

* 收款提醒  
* 對帳建議  
* MRR/ARR 報表  
* 客戶分級  
* 續約提醒

不能直接自動：

* 任意退款  
* 自動付款給外部供應商  
* 大額轉帳  
* 改動帳務認列規則

---

## **9.4 客服**

可以自動：

* FAQ  
* 物流查詢  
* 基本訂單狀態  
* 低風險售前問答  
* 知識庫引導

必須轉人工：

* 退款糾紛  
* 法律威脅  
* 醫療/金融/敏感領域  
* 情緒激烈  
* 高價客戶流失風險  
* 索賠  
* 人身安全  
* 品牌公關危機

---

## **9.5 建站與部署**

可以自動：

* staging 建立  
* manifest 安裝  
* plugin/theme 啟用  
* smoke tests  
* 備份  
* 快取清理  
* 報告產生

不能直接自動：

* production 大規模升級  
* DB destructive migration  
* payment gateway 直接切換  
* checkout 改版直接上 production  
* 沒備份就改 permalink / checkout / payment

---

# **10\. 你的技術堆疊定位**

你現在已有的與建議補上的，要明確定位，不然會互相踩到。

## **10.1 Cursor \+ MCP**

定位：**開發與 agent 操作介面**

用途：

* 產 code  
* 讀 repo  
* 跑工具  
* agent 執行任務  
* 修 bug  
* 產 runbook  
* 開 PR

不是：

* 長期 workflow engine  
* 主資料庫  
* 審計中心

---

## **10.2 Supabase**

定位：**主資料與權限底座**

用途：

* Postgres  
* Auth  
* RLS  
* Storage  
* API  
* Realtime  
* tenant data  
* artifacts metadata  
* logs index  
* workflow state snapshots

不是：

* 主要 CI/CD  
* 長流程編排器

---

## **10.3 n8n**

定位：**整合型自動化**

用途：

* webhook  
* SaaS 互連  
* 通知  
* 表單  
* CRM 同步  
* social posting  
* content publishing  
* chat routing  
* reminder flows

不是：

* 所有關鍵長流程的唯一來源  
* 複雜補償交易的大腦

---

## **10.4 Temporal**

定位：**durable workflow 核心**

用途：

* onboarding  
* 一鍵建站  
* launch flow  
* 回滾流程  
* 多步驟有狀態的長任務  
* human approval 等待  
* 補償流程  
* recovery orchestration

不是：

* 內容編輯器  
* CRM  
* 即時聊天 UI

---

## **10.5 GitHub**

定位：**程式碼、版本、CI/CD、模板倉庫**

用途：

* repos  
* manifests  
* installer scripts  
* prompts registry  
* policy files  
* GitHub Actions  
* PR review  
* release notes  
* changelog  
* docs

不是：

* secrets 主倉  
* 客戶資料主倉

---

## **10.6 Replicate**

定位：**模型執行供應層**

用途：

* 影像生成  
* 影片/語音/其他模型推論  
* 某些多媒體生成任務

不是：

* 整體決策層  
* 客戶資料庫  
* 知識庫本身

---

## **10.7 Sentry**

定位：**錯誤與追蹤中心**

用途：

* 收錯  
* 收 trace  
* issue 建立  
* 版本相關性  
* release regression  
* 自動修復前置上下文

不是：

* 永久商業報表引擎

---

## **10.8 Cloudflare**

定位：**邊緣與保護層**

用途：

* DNS  
* WAF  
* Workers  
* object delivery  
* R2  
* webhook ingress  
* Zero Trust  
* routing

不是：

* 業務主資料庫

---

## **10.9 PostHog**

定位：**成長分析與 feature flags**

用途：

* 事件分析  
* funnel  
* flags  
* experiments  
* rollout  
* behavior analytics

不是：

* 核心財務帳本

---

# **11\. 工廠化核心：Factory Registry**

這是你整個系統能不能規模化的關鍵。  
沒有這一層，你只是在接案，不是在造工廠。

你需要建立一個 **Factory Registry**，裡面至少有 8 類物件。

## **11.1 Packages**

例如：

* wc-core  
* wc-loyalty  
* wc-crm  
* wc-membership  
* seo-starter  
* support-bot-basic  
* yt-content-pack  
* local-leadgen-pack

## **11.2 Manifests**

定義：

* 安裝哪些東西  
* 順序  
* 條件  
* 依賴  
* 驗證規則  
* rollback 提示

## **11.3 Templates**

例如：

* 電商首頁模板  
* 商品頁模板  
* 服務型官網模板  
* lead magnet funnel 模板  
* FAQ 模板  
* 售後教學模板

## **11.4 Prompt Packs**

例如：

* SEO prompt pack  
* support prompt pack  
* sales prompt pack  
* onboarding prompt pack  
* finance reminder prompt pack

## **11.5 Playbooks**

例如：

* new client onboarding  
* site go-live checklist  
* refund escalation  
* SEO refresh cycle  
* content production cycle  
* bug triage and repair

## **11.6 Agents**

例如：

* site-builder-agent  
* seo-agent  
* content-agent  
* support-agent  
* sales-agent  
* report-agent  
* repair-agent  
* knowledge-agent

## **11.7 Policies**

例如：

* approval-policy  
* deployment-policy  
* refund-policy  
* legal-escalation-policy  
* production-guardrail-policy

## **11.8 Evaluators**

例如：

* SEO evaluator  
* content quality evaluator  
* chatbot hallucination evaluator  
* landing page conversion evaluator  
* deployment health evaluator

---

# **12\. 你的公司要有兩種產品**

這個地方很多人會漏掉。

你未來不能只賣「代做」。  
你應該同時有兩種產品線。

## **12.1 Service Product**

對客戶看起來是服務：

* 建站服務  
* SEO 代營運  
* 社群代管  
* 客服 bot 導入  
* 自動化導入  
* 教學影片生成  
* CRM 流程建置

## **12.2 System Product**

對內和對外實際上是產品：

* Agency OS  
* Client OS  
* Package library  
* manifests  
* content pipeline  
* training pipeline  
* chatbot core  
* reporting core

這樣你才能：

* 服務越做越便宜  
* 交付越來越快  
* 客單價越來越高  
* 專案知識沉澱成產品能力

---

# **13\. 收益模型設計原則**

你說要一人跨國公司，不能只靠一次性專案收入。

你至少要有四層收入。

## **13.1 Setup fee**

* 建站  
* 初始導入  
* 資料整理  
* 品牌/流程設定  
* bot 訓練  
* 初始 SEO 架構

## **13.2 Monthly retainer**

* 維運  
* 內容  
* SEO  
* 客服  
* 報表  
* 小型改版  
* 安全維護  
* 自動化維護

## **13.3 Usage-based**

* 生成篇數  
* 圖片數  
* 影片數  
* chatbot 對話量  
* 額外流程執行量  
* 額外 landing pages  
* 額外 funnel

## **13.4 Performance / value-based**

* SEO 成果分潤  
* leads 成果  
* CRO 成果  
* funnel 改善成效  
* 商務成長服務

### **核心規則**

低價值重複工作應該被產品化；  
高價值判斷工作應該被高價保留。

---

# **14\. 你公司的工作單位：不是專案，而是 Run**

這是系統化的關鍵。

你應該把所有工作都建模成「Run」。

## **14.1 Run 的定義**

任何一次：

* workflow 執行  
* agent 執行  
* 發佈  
* 部署  
* 報表生成  
* 內容生成  
* SEO refresh  
* 教學影片生成  
* bug 修復

都叫一個 Run。

## **14.2 每個 Run 必須有**

* run\_id  
* tenant\_id  
* project\_id  
* flow\_type  
* trigger\_type  
* input snapshot  
* artifacts produced  
* model/tool versions  
* status  
* approver  
* execution logs  
* cost  
* outcome metrics  
* rollback relation

### **為什麼這重要**

因為沒有 Run，你就無法：

* 審計  
* 回溯  
* 計成本  
* 分析 ROI  
* 自動學習  
* 做失敗補救  
* 比較版本成效

---

# **15\. 決策層設計：Decision Engine 的完整定位**

你剛剛特別想要「像龍蝦工廠那樣」。  
那這裡就是核心。

Decision Engine 不直接寫程式、不直接上線、不直接改帳務。  
它做的是：

## **15.1 Intake**

讀取：

* revenue  
* margin  
* run success rate  
* SEO 排名變動  
* customer support burden  
* client satisfaction  
* deployment regressions  
* churn risk  
* content performance  
* experiment results

## **15.2 Diagnose**

分析：

* 問題在哪  
* 影響多大  
* 根因可能是什麼  
* 可採取的行動有哪些  
* 哪一個行動的 ROI 最好

## **15.3 Prioritize**

排序：

* 先修 bug 還是先做內容  
* 哪個客戶先處理  
* 哪種服務要加碼  
* 哪種流程該停止  
* 哪個模板要退版  
* 哪個 package 值得產品化

## **15.4 Plan**

輸出一個可執行計畫：

* action type  
* target  
* expected outcome  
* guardrails  
* approval requirement  
* fallback plan

## **15.5 Dispatch**

交給：

* n8n  
* Temporal  
* GitHub Actions  
* MCP agent  
* human approval queue

---

# **16\. 決策不是自由 AI，必須是受控 AI**

Decision Engine 必須遵守四層限制：

## **16.1 Policy constraints**

例如：

* 不可直接部署 production  
* 不可直接讀 secrets 原文  
* 不可自行發退款  
* 不可越權讀跨 tenant 資料

## **16.2 Budget constraints**

例如：

* 本月內容生成成本上限  
* 每日影像生成額度  
* 每客戶 agent 運算額度  
* 修 bug 自動嘗試次數上限

## **16.3 Scope constraints**

例如：

* 只能處理被指派的 tenant  
* 只能操作白名單 workflows  
* 只能修改指定 repo 或 branch

## **16.4 Approval constraints**

例如：

* high-risk 行動需人工  
* 涉及品牌大改需客戶批准  
* 涉及收費/退款需財務批准

---

# **17\. 成長閉環：什麼叫真正的「進化」**

很多人說進化，其實只是多跑幾次 prompt。  
你要的進化，應該是這六步：

## **17.1 Produce**

執行一個版本：

* prompt v3  
* funnel v2  
* chatbot policy v4  
* homepage template v6

## **17.2 Measure**

量測成效：

* CTR  
* conversion  
* ranking  
* reply satisfaction  
* refund reduction  
* support resolution time  
* revenue delta

## **17.3 Evaluate**

判斷：

* 比舊版本好嗎  
* 在哪些客戶/產業好  
* 風險有沒有升高  
* 成本有沒有增加過頭

## **17.4 Decide**

決定：

* retain  
* rollback  
* fork  
* scale  
* retire

## **17.5 Document**

把結論寫回：

* prompt registry  
* runbook  
* playbook  
* policy notes  
* evaluator config

## **17.6 Propagate**

把好的變更逐步擴散：

* 先 internal  
* 再 beta 客戶  
* 再 standard 客戶  
* 再全量 rollout

這才叫進化。  
不是「AI 亂改自己」。

---

# **18\. 你的平台一定要有的六種資料視圖**

未來做 dashboard 時，至少要有這六種視圖。

## **18.1 Agency View**

你公司總覽：

* MRR  
* active clients  
* open issues  
* failed runs  
* top profitable packages  
* churn risk  
* deployment health

## **18.2 Client View**

單一客戶總覽：

* sites  
* leads  
* content pipeline  
* support volume  
* monthly performance  
* pending approvals  
* billing status

## **18.3 Site View**

單站總覽：

* stack  
* package versions  
* deploy history  
* SEO status  
* CWV / health  
* plugin status  
* incident history

## **18.4 Workflow View**

流程總覽：

* last run  
* success rate  
* average duration  
* failure causes  
* artifacts produced  
* cost per run

## **18.5 Agent View**

agent 總覽：

* version  
* tasks completed  
* failure rate  
* average review score  
* cost  
* promoted / deprecated state

## **18.6 Experiment View**

實驗總覽：

* hypothesis  
* variant  
* metric  
* winner  
* confidence  
* rollout stage

---

# **19\. 這一版的最重要結論**

到這裡，你應該把整個系統理解成：

## **不是：**

「幾個 AI 工具串起來」

## **而是：**

「一個有治理、有記憶、有工廠化能力、有決策、有回饋的 AI 公司底座」

而你的成功關鍵，不在於模型多強，而在於這幾件事有沒有做對：

* tenant 隔離  
* 權限與審計  
* workflows 分層  
* run 模型  
* human-in-the-loop 邊界  
* package/template/prompt/agent registry  
* decision engine 的受控設計  
* versioning 與 rollout  
* learning loop  
* 錯誤可觀測與回滾

---

# **20\. 下一部分會接什麼**

下一部分我會直接進入可開發等級，寫：

# **Lobster Factory Master Spec v1 — 第 2 部分**

內容會包含：

* 建站 domain spec  
* SEO / content domain spec  
* social / YouTube domain spec  
* 客服 domain spec  
* sales / CRM domain spec  
* 財務 / 稅務 / 法務 domain spec  
* 教學影片生成 domain spec  
* debug / repair / self-healing domain spec  
* 每個 domain 的 triggers / inputs / outputs / approvals / KPIs / failure handling

好，直接接續。

# **Lobster Factory Master Spec v1 — 第 2 部分**

副標：**各 domain 的 workflow spec / triggers / inputs / outputs / approvals / KPIs / failure handling**

這一部分開始進入真正可開發的層級。  
我會把你要的核心 domain 拆開，一個一個定義：

1. WordPress / WooCommerce 建站工廠  
2. SEO / Content 工廠  
3. Social / YouTube 工廠  
4. 客服與聊天機器人工廠  
5. Sales / CRM 工廠  
6. 財務 / 稅務 / 法務工廠  
7. 教學文件 / 教學影片工廠  
8. Debug / Repair / Self-healing 工廠

每個 domain 我都用同一種規格寫：

* 目標  
* 邊界  
* 核心物件  
* 觸發器  
* 工作流  
* 輸入 / 輸出  
* 人工審批點  
* KPIs  
* 失敗處理  
* 自動化等級  
* 與其他 domain 的依賴

---

# **1\. WordPress / WooCommerce Factory Spec**

這是你整個商業模型最重要的交付核心。  
目標不是「做網站」，而是：

## **把網站交付標準化成可重複執行的工廠流程**

---

## **1.1 目標**

交付以下類型站點：

* 公司形象站  
* 服務型 lead gen 站  
* WooCommerce 電商站  
* 會員站  
* CRM / automation 導向站  
* SEO 導向內容站

你目前的預設主力是：

* **Kadence**  
* **WooCommerce**  
* **FluentCRM**  
* **Fluent Forms**  
* **Rank Math**  
* **CartFlows**  
* **FluentSMTP**  
* **Google Site Kit**  
* **LiteSpeed Cache（conditional）**

---

## **1.2 邊界**

### **本 domain 負責**

* staging 建立  
* WordPress 安裝  
* manifests / packages 安裝  
* theme / plugin 啟用  
* 基本設定  
* demo/content template 套用  
* QA smoke tests  
* launch checklist  
* handover package

### **本 domain 不直接負責**

* 品牌策略本身  
* 長期 SEO 成效  
* 客服內容  
* 法律文件定稿  
* 廣告投放成效

---

## **1.3 核心物件**

* `site`  
* `environment`（staging / production）  
* `package`  
* `manifest`  
* `deployment_run`  
* `site_template`  
* `plugin_set`  
* `theme_config`  
* `launch_checklist`  
* `site_health_snapshot`

---

## **1.4 觸發器**

### **事件型觸發**

* 新客戶成交  
* 新專案建立  
* 站點升級請求  
* package 加購  
* 版本升級請求  
* repair run 需要重建 staging

### **手動觸發**

* 內部 operator 點擊「Create staging」  
* 客戶批准「Launch」  
* developer 點擊「Rebuild site from manifest」

### **排程觸發**

* 每週健康檢查  
* 每月外掛版本掃描  
* staging 定期同步生產配置摘要

---

## **1.5 標準建站流程**

## **Flow A：Create New Staging**

### **步驟**

1. 建立 `site` 記錄  
2. 建立 `environment=staging`  
3. 分配 domain / subdomain  
4. 建立 hosting 資源  
5. 一鍵安裝 WordPress  
6. 驗證 `wp-config.php`、DB、登入頁  
7. 建立初始 site health snapshot

### **輸入**

* client\_id  
* project\_id  
* site\_type  
* hosting target  
* domain/subdomain policy  
* locale  
* package preset

### **輸出**

* staging URL  
* WP admin URL  
* environment record  
* credentials reference  
* provisioning log

### **失敗點**

* hosting 建立失敗  
* DNS 未完成  
* WP 安裝失敗  
* SSL 未就緒

### **失敗處理**

* retry 可重試步驟  
* 若 DNS/SSL 未完成，進入 waiting state  
* 超過 SLA 轉 operator queue

---

## **Flow B：Apply Manifest / Package Install**

這是你的工廠核心。

### **步驟**

1. 解析 manifest  
2. 驗證 target 為 staging/new site  
3. 驗證 WP root  
4. 備份當前狀態快照  
5. 安裝 theme  
6. 安裝 plugin set  
7. 啟用 plugin/theme  
8. 執行 post-install hooks  
9. 寫入 site config  
10. 執行 smoke tests  
11. 產生 install report

### **典型 manifest 範例**

* `wc-core`  
* `wc-loyalty`  
* `wc-crm`  
* `wc-membership`  
* `seo-starter`  
* `support-bot-basic`

### **輸入**

* wp\_root  
* manifest\_id  
* package version  
* environment=staging  
* optional overrides

### **輸出**

* installed components  
* version map  
* site config state  
* test results  
* install artifacts/logs

### **保護規則**

* production 預設禁止直接跑 installer  
* 只有 allowlist package 可執行  
* manifest 必須有 schema version  
* manifest 必須宣告 dependencies / conflicts

### **失敗處理**

* 單 plugin install fail → rollback 該步驟  
* 核心 install fail → restore backup snapshot  
* smoke test fail → environment 標記為 blocked

---

## **Flow C：Configure Business Layer**

這一步是把站點變成能營運，而不是只有能開。

### **包含**

* WooCommerce 基本設定  
* 稅別/貨幣/時區  
* 付款方式  
* 運送規則  
* SMTP 設定  
* Search Console / GA / Site Kit  
* Rank Math setup  
* FluentCRM / Fluent Forms 基礎設定  
* legal pages scaffold  
* 基本頁面建立

### **輸入**

* business profile  
* currency  
* shipping policy  
* payment methods  
* email sender data  
* analytics credentials  
* tax config profile

### **輸出**

* business-ready staging  
* integration checklist  
* missing dependency list

### **人工審批**

* payment gateway 最終 live key 啟用  
* 稅務規則確認  
* legal pages 定稿

---

## **Flow D：Content / Template Application**

### **步驟**

1. 選擇 site template  
2. 套用 Kadence layout/template  
3. 建立首頁/服務頁/商品頁/FAQ/聯絡頁  
4. 套用品牌色與字體  
5. 匯入預設 blocks  
6. 建立 reusable design system tokens

### **輸入**

* site\_template\_id  
* brand profile  
* page map  
* locale  
* content starter pack

### **輸出**

* rendered staging pages  
* design token config  
* page inventory

### **失敗處理**

* template mismatch → fallback default template  
* missing assets → placeholder \+ asset request queue

---

## **Flow E：QA & Launch Readiness**

### **必測**

* 前台可訪問  
* 管理後台可登入  
* 表單送出  
* Email 通知  
* 購物車  
* checkout  
* 付款測試  
* 訂單狀態流轉  
* 基本 SEO meta  
* 手機版檢查  
* CWV/性能基線  
* 權限檢查

### **輸出**

* QA report  
* blockers  
* warnings  
* launch score  
* approved / blocked status

### **KPI**

* build lead time  
* first-pass QA success rate  
* launch blocker count  
* rollback rate  
* client acceptance time

---

## **Flow F：Production Launch**

### **步驟**

1. 最終備份  
2. production preflight checklist  
3. DNS / SSL 確認  
4. minimal delta deploy  
5. cache purge  
6. smoke tests  
7. observability watch window  
8. launch confirmation  
9. handover start

### **必須人工批准**

* 正式上線  
* payment live key  
* domain 切換  
* final legal/tax setup

### **失敗處理**

* smoke test fail → rollback  
* payment fail → emergency hold  
* order creation fail → rollback \+ incident

---

## **1.6 KPIs**

* Time to staging  
* Time to launch  
* QA pass rate  
* Rollback frequency  
* Plugin conflict rate  
* Launch incident rate  
* Cost per site delivered  
* % sites delivered from templates vs custom

---

## **1.7 自動化等級建議**

* Create staging：Level 3  
* Install manifest：Level 3  
* Business config scaffold：Level 2  
* Launch：Level 2  
* Production upgrade：Level 2  
* Destructive migration：Level 1

---

## **1.8 與其他 domain 的依賴**

* 依賴 CRM domain 提供 client/project data  
* 依賴 finance domain 提供 billing/payment readiness  
* 依賴 legal domain 提供 legal page drafts  
* 依賴 content domain 提供 starter content  
* 依賴 repair domain 提供 rollback/recovery

---

# **2\. SEO / Content Factory Spec**

這個 domain 的目標不是單純生文章。  
而是建立：

## **從需求 → 內容 → 發布 → 追蹤 → 優化 → 知識沉澱 的閉環**

---

## **2.1 目標**

交付內容類型：

* SEO 文章  
* 服務頁文案  
* 商品頁文案  
* FAQ  
* 類別頁 SEO  
* EDM 內容  
* lead magnet  
* social snippets  
* YouTube 腳本來源稿

---

## **2.2 邊界**

### **本 domain 負責**

* keyword clustering  
* content brief  
* outline generation  
* draft generation  
* image suggestion/generation  
* internal link suggestions  
* publish formatting  
* refresh cycle  
* quality evaluation

### **不直接負責**

* 廣告投放  
* 法務最終核准  
* 品牌重大重塑  
* 技術 SEO 基礎建站設定

---

## **2.3 核心物件**

* `keyword_cluster`  
* `content_brief`  
* `content_asset`  
* `content_version`  
* `editorial_calendar`  
* `brand_guideline`  
* `seo_evaluation`  
* `publish_run`  
* `refresh_run`

---

## **2.4 觸發器**

* 新網站完成  
* 新 keyword cluster 建立  
* 新產品上架  
* 排名下降  
* 流量下降  
* 客戶要求新內容  
* 定期 refresh 排程  
* 新促銷活動

---

## **2.5 標準內容流程**

## **Flow A：Keyword Intake & Planning**

### **步驟**

1. 匯入關鍵字池  
2. 做 clustering  
3. 對應 search intent  
4. 對應 buyer stage  
5. 分配 page type  
6. 排 editorial priority

### **輸入**

* seed keywords  
* business type  
* target market  
* locale/language  
* competitor notes  
* existing site pages

### **輸出**

* keyword clusters  
* content map  
* priority scores  
* proposed page/article list

### **KPI**

* cluster coverage  
* search intent match quality  
* publishing backlog size

---

## **Flow B：Brief Generation**

### **步驟**

1. 讀品牌規範  
2. 讀 SEO 規則  
3. 讀客戶市場資訊  
4. 生 brief  
5. 列出必答問題  
6. 列出 CTA / internal links / schema suggestions

### **輸入**

* cluster  
* content type  
* target persona  
* tone profile  
* product/service info

### **輸出**

* content brief  
* outline proposal  
* CTA plan  
* entity/FAQ suggestions

### **人工審批**

* 高價值商業頁建議人工確認  
* 法律、醫療、金融等高風險主題須人工審稿

---

## **Flow C：Draft Generation**

### **步驟**

1. 套用 prompt pack  
2. 產出首稿  
3. 產 FAQ、meta、slug、excerpt  
4. 產 image prompts / visual suggestions  
5. 產 internal links suggestions  
6. 產 structured data suggestions

### **輸出**

* article draft  
* page draft  
* meta package  
* asset request  
* publish payload

### **版本管理**

每次都要保存：

* prompt version  
* model version  
* evaluator version  
* content template version

---

## **Flow D：Evaluation & Revision**

### **評估維度**

* intent match  
* readability  
* brand voice match  
* factuality risk  
* duplication risk  
* CTA clarity  
* internal link quality  
* SEO completeness  
* compliance risk

### **輸出**

* quality score  
* revision suggestions  
* pass / revise / human-review-required

### **自動策略**

* 分數高於閾值 → 可自動排程發布  
* 分數中間 → 自動修訂一輪  
* 分數低 / 風險高 → 丟人工審核

---

## **Flow E：Publishing**

### **步驟**

1. 套版到 WP block/template  
2. 插入 meta  
3. 插入 internal links  
4. 插入 image/assets  
5. 建立草稿或直接排程  
6. 提交 publish run

### **輸出**

* WordPress draft/post/page  
* publish URL  
* revision history  
* publish artifact

### **注意**

直接發佈到 production 的權限建議只有 Level 2 / 3，視內容類型決定。

---

## **Flow F：Refresh / Optimization Loop**

### **觸發條件**

* 排名下降  
* CTR 下降  
* 流量下降  
* 商品/服務更新  
* 舊內容超時

### **步驟**

1. 拉現有內容與表現  
2. 產 refresh diagnosis  
3. 產新版內容  
4. 比對差異  
5. 上 staging/draft  
6. 發布  
7. 追蹤效果

### **KPI**

* publish frequency  
* indexed rate  
* CTR uplift  
* ranking uplift  
* refresh win rate  
* content ROI  
* assisted conversions

---

## **2.6 失敗處理**

* brief 缺資料 → 發 content intake request  
* draft 品質低 → auto revise 1\~2 次  
* 評估失敗 → human review  
* WP publish 失敗 → retry / queue  
* duplicate risk 高 → block publish  
* factual risk 高 → require review

---

## **2.7 自動化等級**

* keyword clustering：Level 3  
* brief generation：Level 3  
* low-risk blog draft：Level 3  
* money page copy：Level 2  
* compliance-heavy topic：Level 1\~2  
* refresh loop：Level 4

---

## **2.8 依賴**

* 依賴 Client OS 的 brand profile  
* 依賴 PostHog / SEO data 做績效回饋  
* 依賴 WP factory 提供頁面結構  
* 依賴 Decision Engine 做優先排序

---

# **3\. Social / YouTube Factory Spec**

你的社群與 YouTube 不能當成獨立創作，而要當成內容分發工廠。

---

## **3.1 目標**

交付內容：

* social posts  
* short-form variants  
* campaign snippets  
* carousels  
* YouTube scripts  
* YouTube descriptions / chapters / thumbnails briefs  
* cross-channel repurposing

---

## **3.2 邊界**

### **負責**

* 從長內容拆短內容  
* social calendar  
* 內容改寫成平台格式  
* YouTube 上架資料  
* 基本成效追蹤

### **不直接負責**

* 廣告投放操作  
* influencer 合作  
* PR 危機處理

---

## **3.3 核心物件**

* `content_campaign`  
* `channel_variant`  
* `social_post`  
* `video_script`  
* `video_asset`  
* `publishing_slot`  
* `channel_metrics`

---

## **3.4 觸發器**

* SEO 文章發布  
* 新產品上市  
* 活動開始  
* 影片腳本產出  
* 排程日到期  
* 成效下降需重寫  
* 客戶要求 campaign

---

## **3.5 工作流**

## **Flow A：Repurpose Long-form to Multi-channel**

### **輸入**

* blog/article  
* offer  
* campaign brief  
* target channels

### **步驟**

1. 提取核心觀點  
2. 生成 channel variants  
3. 加入 CTA / hashtags / hooks  
4. 生成素材需求  
5. 排程

### **輸出**

* FB/IG/LinkedIn/X variants  
* captions  
* creative briefs  
* scheduled publishing entries

---

## **Flow B：YouTube Script Pipeline**

### **步驟**

1. 讀 source content / SOP / campaign  
2. 生成 title ideas  
3. 生成 outline  
4. 生成 full script  
5. 生成 chapters  
6. 生成 description  
7. 生成 thumbnail brief  
8. 產短影音拆條方案

### **輸出**

* script asset  
* metadata package  
* short clips plan  
* publishing package

### **人工審批**

* 品牌主頻道建議至少審 script 或 metadata  
* 高風險主題必審

---

## **Flow C：Scheduling & Publish**

### **步驟**

1. 選 channel  
2. 套 publishing policy  
3. 設排程  
4. 發布  
5. 記錄 post/video id  
6. 拉回 metrics

### **KPI**

* publishing consistency  
* engagement rate  
* click-through  
* lead conversions  
* subscriber growth  
* watch time  
* content reuse rate

---

## **3.6 失敗處理**

* API publish fail → retry  
* policy violation risk → block & review  
* asset missing → hold  
* video upload fail → retry \+ alert  
* low performance → trigger optimization run

---

## **3.7 自動化等級**

* repurposing：Level 3  
* social scheduling：Level 3  
* YouTube script generation：Level 2\~3  
* brand account publish：Level 2  
* crisis-topic posting：Level 1

---

# **4\. Support / Chatbot Factory Spec**

你要的客服不是單一 bot，而是：

## **知識檢索 \+ 對話分類 \+ 升級分流 \+ CRM 寫回**

---

## **4.1 目標**

支援：

* LINE  
* 網站 chat  
* email reply assist  
* WhatsApp / Messenger / 其他熱門通訊平台  
* 客服 FAQ  
* 基本售前售後  
* ticketing / escalation

---

## **4.2 邊界**

### **負責**

* FAQ 問答  
* 訂單狀態查詢  
* 基本售前導購  
* ticket 建立  
* 客戶標籤更新  
* 人工轉接

### **不負責**

* 法律裁決  
* 爭議退款最終決定  
* 醫療 / 金融專業判定  
* 高風險公關危機聲明

---

## **4.3 核心物件**

* `conversation`  
* `message`  
* `customer_profile`  
* `knowledge_chunk`  
* `support_intent`  
* `ticket`  
* `escalation_rule`  
* `resolution_run`

---

## **4.4 觸發器**

* 新訊息  
* 未回覆超時  
* 負面情緒  
* 退款關鍵字  
* 法律/威脅關鍵字  
* 高價值客戶來訊  
* FAQ 更新

---

## **4.5 工作流**

## **Flow A：Inbound Message Triage**

### **步驟**

1. 接收訊息  
2. 識別渠道  
3. 對話分類（intent / urgency / sentiment / risk）  
4. 載入 customer profile  
5. 載入相關知識  
6. 決定 auto reply / ask follow-up / escalate

### **輸出**

* reply plan  
* risk score  
* escalation decision  
* CRM update candidates

---

## **Flow B：Auto-reply with Guardrails**

### **步驟**

1. 使用 approved knowledge base  
2. 產答覆  
3. 經 response policy evaluator  
4. 若通過則發送  
5. 記錄 conversation \+ outcome

### **guardrails**

* 不能編造政策  
* 不能承諾退款  
* 不能自作主張給法律建議  
* 不能越權存取跨 tenant 資料

---

## **Flow C：Escalation**

### **觸發條件**

* 高風險  
* 高價值客戶  
* 負面情緒高  
* 敏感領域  
* bot 信心低

### **動作**

* 建立 ticket  
* 指派人工  
* 附摘要  
* 附對話紀錄  
* 附推薦回覆草稿

---

## **Flow D：Post-resolution Learning**

### **步驟**

1. 收集人工最終答覆  
2. 對照 bot 建議  
3. 更新知識庫  
4. 更新 escalation rules  
5. 更新 evaluator

### **KPI**

* first response time  
* auto-resolution rate  
* escalation accuracy  
* customer satisfaction  
* hallucination rate  
* refund/escalation prevention rate

---

## **4.6 自動化等級**

* FAQ 回答：Level 3  
* 訂單查詢：Level 3  
* 基本售前問答：Level 3  
* 高價成交諮詢：Level 2  
* 退款/爭議：Level 1\~2  
* 法律威脅/危機：Level 1

---

# **5\. Sales / CRM Factory Spec**

你前面補充 FluentCRM，這個 domain 就要明確把它放進系統。

目標不是「發 EDM」，而是：

## **把 lead → prospect → customer → expansion → retention 做成自動化生命週期系統**

---

## **5.1 目標**

處理：

* leads  
* nurturing  
* qualification  
* offers  
* proposals  
* onboarding triggers  
* upsell / cross-sell  
* churn prevention

---

## **5.2 核心物件**

* `lead`  
* `contact`  
* `account`  
* `deal`  
* `deal_stage`  
* `offer`  
* `proposal`  
* `crm_tag`  
* `lifecycle_state`  
* `nurture_flow`  
* `expansion_opportunity`

---

## **5.3 觸發器**

* 表單提交  
* 廣告 lead 匯入  
* chatbot 轉 sales  
* 下載 lead magnet  
* 觀看教學影片  
* 點擊 EDM  
* 站內高意圖行為  
* 既有客戶使用量上升  
* 續約日期接近

---

## **5.4 工作流**

## **Flow A：Lead Capture & Enrichment**

### **步驟**

1. 接收 lead  
2. 去重  
3. 來源標記  
4. enrich（公司、產業、國家、需求）  
5. lead score  
6. 分配 lifecycle state  
7. 寫入 CRM

### **輸出**

* lead record  
* score  
* tags  
* follow-up path

---

## **Flow B：Nurture**

### **步驟**

1. 根據 persona / source / intent 進入序列  
2. 發送教育內容 / 案例 / 報價入口  
3. 監控開信/點擊/回覆  
4. 分流高意圖 leads  
5. 更新 score 與標籤

### **KPI**

* lead-to-call conversion  
* lead-to-customer conversion  
* nurture completion rate  
* reply rate  
* SQL rate

---

## **Flow C：Proposal / Offer Generation**

### **步驟**

1. 根據需求生成 offer skeleton  
2. 套 package/price logic  
3. 生成 proposal 草稿  
4. 人工審核  
5. 發送  
6. 追蹤查看/回覆

### **輸出**

* offer draft  
* proposal doc  
* pricing explanation  
* contract trigger

### **人工審批**

所有正式報價與合約都應有人審核後才發。

---

## **Flow D：Customer Onboarding Trigger**

### **當 deal won / paid**

1. 建 client workspace  
2. 建 project  
3. 建站工廠觸發  
4. 啟動 welcome flow  
5. 建 onboarding checklist  
6. 推教學影片 / intake form

---

## **Flow E：Expansion / Retention**

### **觸發條件**

* 流量上升  
* 訂單量上升  
* CRM 名單成長  
* 客服量上升  
* 網站轉換不佳  
* 續約日 approaching

### **動作**

* 推 CRM pack  
* 推 SEO refresh  
* 推 support bot  
* 推 CRO / funnel package  
* 推 membership / loyalty package

---

## **5.5 自動化等級**

* lead enrichment：Level 3  
* nurture：Level 3  
* lead scoring：Level 4  
* proposal draft：Level 2  
* final quotation：Level 1\~2  
* onboarding trigger：Level 3  
* upsell suggestions：Level 4

---

# **6\. Finance / Tax / Legal Factory Spec**

這一塊最容易出事，所以一定要明確分層。

---

## **6.1 目標**

處理：

* 發票/帳單流程  
* 訂閱與續約提醒  
* 成本歸集  
* 基本稅務資料整理  
* 合約草稿與版本管理  
* 到期與風險提醒

---

## **6.2 邊界**

### **負責**

* 文件準備  
* 草稿生成  
* deadline reminder  
* 對帳輔助  
* 訂閱與付款狀態追蹤  
* 合約比較  
* 稅務資料匯整

### **不負責**

* 最終法律判斷  
* 最終稅務申報送件  
* 無人工覆核的大額金流操作

---

## **6.3 核心物件**

* `invoice`  
* `payment`  
* `subscription`  
* `expense`  
* `cost_center`  
* `tax_period`  
* `tax_document`  
* `contract`  
* `contract_version`  
* `legal_request`  
* `approval_record`

---

## **6.4 工作流**

## **Flow A：Billing & Subscription**

### **步驟**

1. 建立費率與方案  
2. 產帳單  
3. 發送付款通知  
4. 收到付款事件  
5. 更新權限 / 服務狀態  
6. 發送收據/通知  
7. 續約前提醒

### **KPI**

* invoice paid rate  
* overdue rate  
* churn rate  
* expansion revenue  
* collection time

---

## **Flow B：Cost Attribution**

### **步驟**

1. 收集 infra/API/content generation cost  
2. 對應 client/project/run  
3. 匯總毛利  
4. 輸出 profitability dashboard  
5. 給 Decision Engine 做資源配置參考

---

## **Flow C：Tax Prep**

### **步驟**

1. 匯入收入支出  
2. 分類憑證  
3. 建議稅務分類  
4. 匯出會計包  
5. 提醒截止日  
6. 生 draft summary

### **人工審批**

最終申報與灰色地帶判定一律人工。

---

## **Flow D：Contract Lifecycle**

### **步驟**

1. 選 contract template  
2. 填入 deal/offer data  
3. 生成草稿  
4. 版本比對  
5. 審批  
6. 發送簽署  
7. 保存 signed contract  
8. 監控續約 / 到期 / 風險條款

### **KPI**

* proposal-to-contract cycle time  
* renewal rate  
* legal review time  
* payment delay after contract

---

## **6.5 自動化等級**

* invoice generation：Level 3  
* payment reminder：Level 3  
* cost attribution：Level 4  
* contract draft：Level 2  
* contract send：Level 2  
* tax prep：Level 2  
* tax filing：Level 0\~1

---

# **7\. Training Docs / Tutorial Video Factory Spec**

這個 domain 是你的規模化槓桿之一。  
每交付一次，就要把交付知識轉成文件與影片。

---

## **7.1 目標**

產出：

* SOP 文件  
* 使用手冊  
* onboarding 教學  
* 客服教學  
* WooCommerce 管理教學  
* FluentCRM 使用教學  
* 客戶專屬操作影片

---

## **7.2 核心物件**

* `knowledge_asset`  
* `tutorial_script`  
* `storyboard`  
* `slide_scene`  
* `voice_track`  
* `subtitle_track`  
* `video_asset`  
* `doc_version`

---

## **7.3 觸發器**

* 新客戶上線  
* 新功能發布  
* SOP 更新  
* 客戶常見問題增加  
* 支援工單高頻主題  
* package 新增

---

## **7.4 工作流**

## **Flow A：SOP Extraction**

### **步驟**

1. 讀交付流程/系統設定  
2. 轉成任務步驟  
3. 產 SOP markdown  
4. 產 FAQ  
5. 產 role-specific variants

---

## **Flow B：Tutorial Script Generation**

### **輸入**

* SOP  
* target audience  
* product context  
* locale/language  
* video length target

### **輸出**

* full script  
* segment list  
* CTA / next-step suggestions

---

## **Flow C：Storyboard & Render Package**

### **步驟**

1. 將 script 切場景  
2. 產 slide scenes / UI callouts  
3. 產 voiceover text  
4. 產 subtitle  
5. 產 render manifest

### **輸出**

* storyboard  
* slide assets  
* voice script  
* subtitle file  
* final video job

---

## **Flow D：Distribution**

### **發布位置**

* YouTube  
* 客戶 portal  
* onboarding email  
* knowledge base center  
* support reply links

### **KPI**

* watch completion rate  
* support ticket reduction  
* onboarding completion  
* repeated view count  
* time-to-first-success

---

## **7.5 自動化等級**

* SOP draft：Level 3  
* script generation：Level 3  
* storyboard：Level 3  
* final branded publish：Level 2  
* sensitive/custom client education：Level 2

---

# **8\. Debug / Repair / Self-healing Factory Spec**

這一塊是你接近「龍蝦工廠」的關鍵。  
但必須是受控修復，不是 agent 亂修。

---

## **8.1 目標**

處理：

* 錯誤收斂  
* 問題分類  
* 自動修復建議  
* staging 驗證  
* rollback  
* incident 知識化

---

## **8.2 核心物件**

* `incident`  
* `error_event`  
* `repair_run`  
* `root_cause_hypothesis`  
* `patch_candidate`  
* `verification_run`  
* `rollback_run`  
* `runbook_update`

---

## **8.3 觸發器**

* Sentry error spike  
* deploy failure  
* smoke test fail  
* WP plugin conflict  
* checkout fail  
* email delivery fail  
* chatbot hallucination spike  
* content publish failure  
* uptime alert

---

## **8.4 工作流**

## **Flow A：Incident Intake**

### **步驟**

1. 收錯誤事件  
2. 聚類同類錯誤  
3. 分級 severity  
4. 對應 affected tenants/sites  
5. 產 incident record  
6. 決定 auto-repair eligibility

---

## **Flow B：Diagnosis**

### **步驟**

1. 拉 logs/traces/recent changes  
2. 拉 last successful state  
3. 建 root cause hypotheses  
4. 排優先順序  
5. 產 repair plan

### **輸出**

* diagnosis summary  
* candidate fixes  
* required approvals  
* blast radius estimate

---

## **Flow C：Patch / Repair**

### **若符合 guardrails**

1. 建 patch branch / config patch  
2. 在 staging 套用  
3. 跑 tests / smoke tests / scenario tests  
4. 比對結果  
5. 若通過則提 PR 或 approval

### **guardrails**

* 不得直接在 production 改 schema  
* 不得直接改 payment logic  
* 不得跳過測試  
* 不得越權讀取 secrets 原文

---

## **Flow D：Rollback / Recovery**

### **觸發**

* 修復失敗  
* 風險過高  
* 測試未通過  
* production 指標惡化

### **步驟**

1. 還原上一成功版本  
2. 驗證關鍵功能  
3. 標記 incident state  
4. 通知相關人  
5. 更新 runbook

---

## **Flow E：Knowledge Propagation**

### **步驟**

1. 紀錄根因  
2. 更新 evaluator / policy  
3. 更新 playbook  
4. 更新 auto-repair allowlist / denylist

### **KPI**

* mean time to detect  
* mean time to diagnose  
* mean time to recover  
* auto-repair success rate  
* false-fix rate  
* rollback rate  
* repeated incident rate

---

## **8.5 自動化等級**

* incident intake：Level 4  
* diagnosis draft：Level 4  
* staging repair：Level 3  
* production fix deployment：Level 2  
* rollback：Level 2  
* payment/contract/tax-related repair：Level 1

---

# **9\. Domain 之間的依賴圖**

這張很重要，因為你的工廠不是孤立模組。

Sales/CRM

   ↓

WP Factory ───→ Training Factory

   ↓                ↑

SEO/Content ─→ Social/YouTube

   ↓

Support/Chatbot

   ↓

Finance/Legal

   ↑

Repair/Self-healing ← All Domains

更精準地說：

* **Sales/CRM** 決定新客戶、新需求、新升級  
* **WP Factory** 建立交付底盤  
* **SEO/Content** 生長流量與內容資產  
* **Social/YouTube** 做分發與觸達  
* **Support** 承接售前售後與知識回流  
* **Finance/Legal** 管商業約束與文件  
* **Training Factory** 降低 support burden、提升 onboarding 效率  
* **Repair Factory** 為所有 domain 提供恢復與學習能力

---

# **10\. 每個 domain 的共通規格要求**

這一段之後你要套用到全部模組。

每個 workflow 都必須有：

* `workflow_id`  
* `workflow_version`  
* `tenant_scope`  
* `risk_level`  
* `trigger_type`  
* `input_schema`  
* `output_schema`  
* `approval_policy`  
* `rollback_strategy`  
* `observability_hooks`  
* `cost_tracking_policy`  
* `evaluator_config`

每個 run 都必須有：

* `run_id`  
* `parent_run_id`（如有）  
* `actor_type`（human / agent / scheduled / webhook）  
* `tool_versions`  
* `artifact_refs`  
* `decision_refs`  
* `incident_refs`  
* `status`  
* `started_at`  
* `ended_at`  
* `cost`  
* `outcome_score`

---

# **11\. 第 2 部分的關鍵結論**

到這裡，你應該已經不是在看「功能列表」，而是在看一個真正的工廠規格：

* 每個 domain 都有清楚邊界  
* 每個 domain 都有可觀測的 run  
* 每個 domain 都有自動化等級  
* 每個 domain 都有人工審批點  
* 每個 domain 都有 failure handling  
* 每個 domain 都會把結果回寫到系統記憶

這才是從「很多自動化」走向「可治理的 AI 公司系統」。

---

# **12\. 下一部分會是什麼**

下一部分我會進入最硬的實作層，寫：

# **Lobster Factory Master Spec v1 — 第 3 部分**

內容會包含：

* Supabase schema 設計  
* table 分層  
* RLS / tenant model  
* agent spec  
* prompt / template / package / playbook registry schema  
* workflow routing（n8n / Trigger.dev or Temporal / GitHub Actions / MCP）  
* approval & policy engine  
* versioning / rollout / rollback  
* observability schema  
* cost attribution schema  
* Decision Engine schema  
* 90 天落地 roadmap

好，直接進入最硬的一層。

# **Lobster Factory Master Spec v1 — 第 3 部分**

副標：**Supabase schema / tenant model / RLS / registries / agents / workflow routing / policy engine / rollout / observability / cost attribution / decision engine / 90 天 roadmap**

這一部分的目標只有一個：

## **把前兩部分變成真的可以開始做的系統骨架**

也就是回答這些問題：

* 資料表到底怎麼設計  
* 你的 agency 與 client 多租戶怎麼隔離  
* 哪些流程跑 n8n，哪些跑 durable workflow，哪些跑 GitHub Actions，哪些交給 MCP agent  
* prompt / package / manifest / playbook / evaluator 要怎麼存  
* approval / policy / rollback 怎麼做  
* 成本、錯誤、決策、實驗怎麼落資料  
* 90 天內第一版怎麼落地

---

# **1\. 總體資料模型設計原則**

你整個系統的 DB 不能只是「一般 SaaS 表」。  
你需要的是 6 層資料域：

## **1.1 Identity & Tenancy**

* organizations  
* workspaces  
* memberships  
* roles  
* permissions  
* service accounts

## **1.2 Business & Delivery**

* clients  
* projects  
* sites  
* environments  
* packages  
* manifests  
* deployments  
* launch checklists

## **1.3 Operations & Automation**

* workflows  
* workflow\_runs  
* agent\_runs  
* approvals  
* incidents  
* repair\_runs  
* scheduled\_jobs

## **1.4 Growth & Revenue**

* leads  
* contacts  
* accounts  
* deals  
* subscriptions  
* invoices  
* costs  
* experiments

## **1.5 Knowledge & Artifacts**

* prompts  
* templates  
* playbooks  
* documents  
* videos  
* assets  
* knowledge chunks

## **1.6 Decision & Learning**

* metrics snapshots  
* evaluations  
* decision records  
* recommendations  
* rollout states  
* change history

---

# **2\. Tenancy Model**

這一段是整個平台最重要的骨架。

你至少有三種 scope：

## **2.1 Organization**

最上層租戶。

類型：

* `agency`  
* `client`  
* `partner`（可選）  
* `internal_lab`（可選）

### **`organizations`**

id uuid pk

type text check (type in ('agency','client','partner','internal\_lab'))

name text

slug text unique

status text

default\_locale text

default\_timezone text

billing\_plan\_id uuid null

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

---

## **2.2 Workspace**

organization 下面的操作空間。

用途：

* 一個 client 可能有多品牌、多市場、多站點  
* 一個 agency 也可能分 team / region / product line

### **`workspaces`**

id uuid pk

organization\_id uuid fk \-\> organizations.id

name text

slug text

workspace\_type text

status text

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

unique (organization\_id, slug)

---

## **2.3 Site / Project Scope**

最實際的交付單位。

### **`projects`**

id uuid pk

organization\_id uuid fk

workspace\_id uuid fk

client\_organization\_id uuid fk \-\> organizations.id

name text

project\_type text

status text

owner\_user\_id uuid null

start\_date date null

target\_launch\_date date null

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

### **`sites`**

id uuid pk

organization\_id uuid fk

workspace\_id uuid fk

project\_id uuid fk

site\_type text

name text

primary\_domain text null

locale text

status text

theme\_family text

stack\_profile text

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

---

# **3\. Identity / Auth / Membership Schema**

## **3.1 Profiles**

如果你用 Supabase Auth，建議另外有一張 app profile。

### **`profiles`**

id uuid pk \-- same as auth.users.id

email text

display\_name text

avatar\_url text null

status text

default\_organization\_id uuid null

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

## **3.2 Memberships**

同一個人可屬於多 organization/workspace。

### **`organization_memberships`**

id uuid pk

organization\_id uuid fk

user\_id uuid fk \-\> profiles.id

membership\_type text

status text

joined\_at timestamptz

metadata jsonb

unique (organization\_id, user\_id)

### **`workspace_memberships`**

id uuid pk

workspace\_id uuid fk

user\_id uuid fk

status text

metadata jsonb

unique (workspace\_id, user\_id)

---

# **4\. Roles / Permissions / Policies Schema**

你不能只做 role name，要做細粒度 permission graph。

## **4.1 Roles**

### **`roles`**

id uuid pk

organization\_id uuid null \-- null \= system role

name text

scope\_type text check (scope\_type in ('system','organization','workspace','project','site'))

description text null

is\_system boolean default false

created\_at timestamptz

updated\_at timestamptz

## **4.2 Permissions**

### **`permissions`**

id uuid pk

resource\_type text

action text

risk\_level text check (risk\_level in ('low','medium','high'))

description text

unique (resource\_type, action)

例子：

* `site:read`  
* `site:deploy`  
* `workflow:execute`  
* `invoice:approve`  
* `contract:send`  
* `secret:use`  
* `incident:rollback`

## **4.3 Role Permissions**

### **`role_permissions`**

role\_id uuid fk

permission\_id uuid fk

constraints jsonb null

primary key (role\_id, permission\_id)

`constraints` 可放：

* only specific workspace types  
* cannot approve own changes  
* deploy only staging  
* max invoice amount

## **4.4 Assignments**

### **`user_role_assignments`**

id uuid pk

user\_id uuid fk

role\_id uuid fk

organization\_id uuid null

workspace\_id uuid null

project\_id uuid null

site\_id uuid null

granted\_by uuid null

granted\_at timestamptz

expires\_at timestamptz null

metadata jsonb

---

# **5\. RLS 設計原則**

Supabase 的核心優勢就是 Postgres \+ RLS，所以你的多租戶隔離要靠它。  
原則只有三句：

## **5.1 所有 tenant-bound 表都要有 scope 欄位**

至少：

* `organization_id`  
* `workspace_id`（多數時候）  
* 視情況加 `project_id` / `site_id`

## **5.2 所有查詢都從 membership 推導可見範圍**

不要用前端相信自己的 organization id。

## **5.3 高風險寫入要二次驗證**

不是查得到就代表能改。

---

## **5.4 建議的 SQL helper function**

### **`current_user_id()`**

回傳 auth uid

### **`user_has_org_access(org_id uuid)`**

判斷 membership

### **`user_has_workspace_access(workspace_id uuid)`**

判斷 workspace membership

### **`user_has_permission(resource_type text, action text, org_id uuid, workspace_id uuid, project_id uuid, site_id uuid)`**

做權限檢查

---

## **5.5 基本 RLS 範例概念**

對 `sites`：

* read：可見自己 membership 範圍內的 site  
* insert：需有 `site:create`  
* update：需有 `site:update`  
* delete：需有高風險 permission，且可能限制只允許 draft/staging site

---

# **6\. Client / CRM / Revenue Schema**

你前面講 FluentCRM，所以這一層要跟 WP CRM 對接，但平台主資料仍建議落 Supabase。

## **6.1 Contacts / Leads**

### **`contacts`**

id uuid pk

organization\_id uuid fk

workspace\_id uuid fk

external\_ref text null \-- FluentCRM contact ID etc.

email text null

phone text null

full\_name text null

country text null

locale text null

contact\_type text

lifecycle\_state text

lead\_score numeric default 0

source text null

tags jsonb default '\[\]'::jsonb

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

### **`accounts`**

id uuid pk

organization\_id uuid fk

workspace\_id uuid fk

name text

domain text null

country text null

industry text null

size\_band text null

status text

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

### **`contact_accounts`**

contact\_id uuid fk

account\_id uuid fk

relationship\_type text

primary key (contact\_id, account\_id)

### **`deals`**

id uuid pk

organization\_id uuid fk

workspace\_id uuid fk

account\_id uuid null

primary\_contact\_id uuid null

pipeline text

stage text

currency text

amount numeric null

probability numeric null

status text

source text null

close\_target\_date date null

won\_at timestamptz null

lost\_at timestamptz null

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

---

# **7\. Project / Site / Environment Schema**

## **7.1 Environments**

### **`environments`**

id uuid pk

organization\_id uuid fk

workspace\_id uuid fk

site\_id uuid fk

environment\_type text check (environment\_type in ('local','staging','production','preview'))

name text

base\_url text null

hosting\_provider text null

server\_ref text null

status text

wp\_root\_path text null

credentials\_ref text null

last\_health\_status text null

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

## **7.2 Site Templates**

### **`site_templates`**

id uuid pk

scope\_type text check (scope\_type in ('global','agency','client'))

scope\_id uuid null

name text

template\_type text

theme\_family text

layout\_payload jsonb

design\_tokens jsonb

starter\_pages jsonb

status text

version text

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

---

# **8\. Package / Manifest / Registry Schema**

這是你的 Factory OS 核心。

## **8.1 Packages**

### **`packages`**

id uuid pk

scope\_type text check (scope\_type in ('global','agency','client'))

scope\_id uuid null

name text

slug text

package\_type text

description text null

status text

default\_version text

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

unique (scope\_type, scope\_id, slug)

例子：

* wc-core  
* wc-loyalty  
* wc-crm  
* wc-membership  
* seo-starter  
* support-bot-basic

## **8.2 Package Versions**

### **`package_versions`**

id uuid pk

package\_id uuid fk

version text

changelog text null

compatibility jsonb

status text

artifact\_ref text null

created\_at timestamptz

created\_by uuid null

metadata jsonb

unique (package\_id, version)

## **8.3 Manifests**

### **`manifests`**

id uuid pk

package\_version\_id uuid fk

schema\_version text

manifest\_json jsonb

install\_guardrails jsonb

dependencies jsonb

conflicts jsonb

rollback\_hints jsonb

status text

created\_at timestamptz

updated\_at timestamptz

`manifest_json` 典型結構應包含：

* install order  
* required plugins/themes  
* conditional plugins  
* post-install hooks  
* verification checks  
* env constraints

## **8.4 Package Install Runs**

### **`package_install_runs`**

id uuid pk

organization\_id uuid fk

workspace\_id uuid fk

site\_id uuid fk

environment\_id uuid fk

package\_version\_id uuid fk

manifest\_id uuid fk

triggered\_by\_user\_id uuid null

triggered\_by\_agent\_id uuid null

status text

started\_at timestamptz

ended\_at timestamptz null

result\_summary jsonb

logs\_ref text null

rollback\_run\_id uuid null

metadata jsonb

---

# **9\. Prompt / Template / Playbook / Evaluator Registries**

這四個 registry 你一定要做，否則不可能進化。

## **9.1 Prompt Packs**

### **`prompt_packs`**

id uuid pk

scope\_type text

scope\_id uuid null

name text

slug text

domain text

status text

default\_version text

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

### **`prompt_versions`**

id uuid pk

prompt\_pack\_id uuid fk

version text

prompt\_text text

system\_instructions text null

input\_schema jsonb

output\_schema jsonb

evaluation\_rules jsonb

model\_preferences jsonb

status text

created\_at timestamptz

created\_by uuid null

metadata jsonb

unique (prompt\_pack\_id, version)

例子：

* seo-article-writer  
* support-first-response  
* deal-summary-generator  
* onboarding-script-generator

## **9.2 Templates**

### **`templates`**

id uuid pk

scope\_type text

scope\_id uuid null

name text

slug text

template\_domain text

status text

default\_version text

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

### **`template_versions`**

id uuid pk

template\_id uuid fk

version text

payload jsonb

rendering\_rules jsonb

compatibility jsonb

status text

created\_at timestamptz

metadata jsonb

## **9.3 Playbooks**

### **`playbooks`**

id uuid pk

scope\_type text

scope\_id uuid null

name text

slug text

domain text

status text

default\_version text

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

### **`playbook_versions`**

id uuid pk

playbook\_id uuid fk

version text

steps jsonb

decision\_points jsonb

risk\_notes jsonb

rollback\_notes jsonb

status text

created\_at timestamptz

metadata jsonb

## **9.4 Evaluators**

### **`evaluators`**

id uuid pk

scope\_type text

scope\_id uuid null

name text

slug text

domain text

status text

default\_version text

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

### **`evaluator_versions`**

id uuid pk

evaluator\_id uuid fk

version text

rules jsonb

scoring\_formula jsonb

thresholds jsonb

status text

created\_at timestamptz

metadata jsonb

例子：

* seo-quality-evaluator  
* support-safety-evaluator  
* deployment-health-evaluator  
* content-brand-voice-evaluator

---

# **10\. Workflow Schema**

你整個工廠要用 workflow 當正式物件，而不是散裝自動化。

## **10.1 Workflow Definitions**

### **`workflows`**

id uuid pk

scope\_type text

scope\_id uuid null

name text

slug text

domain text

orchestrator\_type text check (orchestrator\_type in ('n8n','durable','github\_actions','mcp','manual'))

risk\_level text

status text

default\_version text

input\_schema jsonb

output\_schema jsonb

approval\_policy\_id uuid null

rollback\_strategy jsonb

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

## **10.2 Workflow Versions**

### **`workflow_versions`**

id uuid pk

workflow\_id uuid fk

version text

definition\_ref text

routing\_config jsonb

trigger\_config jsonb

guardrails jsonb

status text

created\_at timestamptz

metadata jsonb

## **10.3 Workflow Runs**

### **`workflow_runs`**

id uuid pk

workflow\_version\_id uuid fk

organization\_id uuid fk

workspace\_id uuid null

project\_id uuid null

site\_id uuid null

environment\_id uuid null

parent\_run\_id uuid null

trigger\_type text

trigger\_ref text null

actor\_type text check (actor\_type in ('human','agent','webhook','schedule','system'))

actor\_ref text null

status text

risk\_level text

input\_snapshot jsonb

output\_snapshot jsonb

artifacts jsonb

started\_at timestamptz

ended\_at timestamptz null

cost\_amount numeric null

cost\_currency text null

decision\_id uuid null

incident\_id uuid null

approval\_id uuid null

metadata jsonb

---

# **11\. Agent Schema**

你未來一定要把 agent 當正式資產管理。

## **11.1 Agent Definitions**

### **`agents`**

id uuid pk

scope\_type text

scope\_id uuid null

name text

slug text

agent\_domain text

agent\_type text

status text

default\_version text

description text null

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

例子：

* site-builder-agent  
* seo-agent  
* content-agent  
* support-agent  
* repair-agent  
* report-agent  
* sales-agent

## **11.2 Agent Versions**

### **`agent_versions`**

id uuid pk

agent\_id uuid fk

version text

system\_prompt\_ref uuid null

tool\_policy\_id uuid null

input\_schema jsonb

output\_schema jsonb

model\_config jsonb

safety\_config jsonb

status text

created\_at timestamptz

metadata jsonb

## **11.3 Agent Tool Policies**

### **`tool_policies`**

id uuid pk

name text

description text null

allowed\_tools jsonb

denied\_tools jsonb

max\_steps integer null

max\_cost numeric null

requires\_approval\_for jsonb

environment\_constraints jsonb

status text

created\_at timestamptz

updated\_at timestamptz

例如 repair-agent：

* 可讀 logs / traces / repo  
* 可開 branch / PR  
* 不可直接 production deploy  
* 不可讀 secret 原文  
* 不可執行 destructive migration

## **11.4 Agent Runs**

### **`agent_runs`**

id uuid pk

agent\_version\_id uuid fk

workflow\_run\_id uuid null

organization\_id uuid fk

workspace\_id uuid null

project\_id uuid null

site\_id uuid null

environment\_id uuid null

status text

goal text

input\_snapshot jsonb

output\_snapshot jsonb

tool\_trace jsonb

evaluation\_summary jsonb

started\_at timestamptz

ended\_at timestamptz null

cost\_amount numeric null

cost\_breakdown jsonb

metadata jsonb

---

# **12\. Approval / Policy Engine Schema**

這一層是防止龍蝦工廠翻車的關鍵。

## **12.1 Policies**

### **`policies`**

id uuid pk

scope\_type text

scope\_id uuid null

name text

slug text

policy\_domain text

status text

default\_version text

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

## **12.2 Policy Versions**

### **`policy_versions`**

id uuid pk

policy\_id uuid fk

version text

rules jsonb

risk\_matrix jsonb

enforcement\_mode text check (enforcement\_mode in ('advisory','soft\_block','hard\_block'))

status text

created\_at timestamptz

metadata jsonb

例子：

* production-deploy-policy  
* refund-policy  
* support-escalation-policy  
* tax-filing-policy  
* legal-review-policy

## **12.3 Approval Policies**

### **`approval_policies`**

id uuid pk

name text

slug text

scope\_type text

scope\_id uuid null

resource\_type text

rules jsonb

status text

created\_at timestamptz

updated\_at timestamptz

`rules` 可定義：

* amount \> X needs finance approval  
* production deploy needs operator \+ owner  
* high-risk support reply needs supervisor  
* contract send needs legal reviewer

## **12.4 Approval Records**

### **`approvals`**

id uuid pk

approval\_policy\_id uuid fk

resource\_type text

resource\_id uuid

organization\_id uuid fk

workspace\_id uuid null

status text check (status in ('pending','approved','rejected','expired','cancelled'))

requested\_by uuid null

requested\_at timestamptz

resolved\_at timestamptz null

resolution\_notes text null

metadata jsonb

### **`approval_steps`**

id uuid pk

approval\_id uuid fk

step\_order integer

approver\_user\_id uuid null

approver\_role\_id uuid null

status text

acted\_at timestamptz null

notes text null

metadata jsonb

---

# **13\. Observability Schema**

Sentry、PostHog、workflow logs 不應該只在外部工具裡。  
你自己的平台要有索引與聚合層。

## **13.1 Incidents**

### **`incidents`**

id uuid pk

organization\_id uuid fk

workspace\_id uuid null

project\_id uuid null

site\_id uuid null

environment\_id uuid null

domain text

severity text check (severity in ('low','medium','high','critical'))

status text

title text

summary text

root\_cause\_summary text null

first\_seen\_at timestamptz

last\_seen\_at timestamptz

resolved\_at timestamptz null

sentry\_issue\_ref text null

metadata jsonb

## **13.2 Error Events**

### **`error_events`**

id uuid pk

incident\_id uuid null

organization\_id uuid fk

site\_id uuid null

environment\_id uuid null

source\_type text

source\_ref text null

error\_code text null

error\_message text

trace\_ref text null

event\_payload jsonb

occurred\_at timestamptz

metadata jsonb

## **13.3 Health Snapshots**

### **`health_snapshots`**

id uuid pk

organization\_id uuid fk

site\_id uuid null

environment\_id uuid null

snapshot\_type text

status text

metrics jsonb

captured\_at timestamptz

metadata jsonb

例子：

* wp health  
* checkout health  
* email delivery health  
* deployment health  
* support bot health

---

# **14\. Cost Attribution Schema**

你要做一人跨國公司，最不能缺的就是成本視圖。

## **14.1 Costs**

### **`cost_entries`**

id uuid pk

organization\_id uuid fk

workspace\_id uuid null

project\_id uuid null

site\_id uuid null

workflow\_run\_id uuid null

agent\_run\_id uuid null

cost\_type text

vendor text

service\_name text null

quantity numeric null

unit text null

amount numeric

currency text

occurred\_at timestamptz

metadata jsonb

例子：

* openai tokens  
* replicate generation  
* hosting  
* email sending  
* workflow execution  
* developer intervention time

## **14.2 Revenue Entries**

### **`revenue_entries`**

id uuid pk

organization\_id uuid fk

workspace\_id uuid null

project\_id uuid null

site\_id uuid null

revenue\_type text

source\_ref text null

amount numeric

currency text

recognized\_at timestamptz

metadata jsonb

## **14.3 Profitability Snapshots**

### **`profitability_snapshots`**

id uuid pk

organization\_id uuid fk

workspace\_id uuid null

project\_id uuid null

site\_id uuid null

period\_start date

period\_end date

revenue\_amount numeric

cost\_amount numeric

gross\_profit\_amount numeric

gross\_margin numeric

snapshot\_payload jsonb

captured\_at timestamptz

---

# **15\. Decision Engine Schema**

這一層是把「進化」資料化。

## **15.1 Metric Snapshots**

### **`metric_snapshots`**

id uuid pk

organization\_id uuid fk

workspace\_id uuid null

project\_id uuid null

site\_id uuid null

metric\_domain text

metric\_name text

metric\_value numeric null

metric\_payload jsonb null

captured\_at timestamptz

metadata jsonb

例子：

* seo: organic\_clicks  
* support: auto\_resolution\_rate  
* sales: lead\_to\_customer\_rate  
* delivery: build\_lead\_time  
* repair: mttr

## **15.2 Evaluations**

### **`evaluations`**

id uuid pk

organization\_id uuid fk

resource\_type text

resource\_id uuid

evaluator\_version\_id uuid fk

score numeric null

result text

findings jsonb

recommendations jsonb

evaluated\_at timestamptz

metadata jsonb

## **15.3 Decisions**

### **`decisions`**

id uuid pk

organization\_id uuid fk

workspace\_id uuid null

decision\_domain text

decision\_type text

priority\_score numeric null

status text check (status in ('proposed','approved','rejected','executed','expired'))

title text

rationale text

input\_refs jsonb

proposed\_actions jsonb

guardrails jsonb

expected\_impact jsonb

created\_by\_type text check (created\_by\_type in ('human','system','agent'))

created\_by\_ref text null

created\_at timestamptz

updated\_at timestamptz

### **`decision_actions`**

id uuid pk

decision\_id uuid fk

action\_type text

target\_resource\_type text

target\_resource\_id uuid null

dispatch\_channel text check (dispatch\_channel in ('n8n','durable','github\_actions','mcp','manual'))

status text

dispatched\_at timestamptz null

completed\_at timestamptz null

result\_summary jsonb

metadata jsonb

例子：

* rewrite content  
* open repair PR  
* upsell crm package  
* run staging rebuild  
* pause low-performing flow

---

# **16\. Knowledge / Document / Media Schema**

## **16.1 Knowledge Assets**

### **`knowledge_assets`**

id uuid pk

organization\_id uuid fk

workspace\_id uuid null

project\_id uuid null

site\_id uuid null

asset\_type text

title text

slug text null

status text

current\_version\_id uuid null

source\_type text null

source\_ref text null

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

## **16.2 Knowledge Versions**

### **`knowledge_asset_versions`**

id uuid pk

asset\_id uuid fk

version text

content\_format text

content\_ref text null

content\_text text null

summary text null

language text null

status text

created\_at timestamptz

metadata jsonb

這可用於：

* SOP  
* policy docs  
* FAQ  
* customer instructions  
* training scripts

## **16.3 Media Assets**

### **`media_assets`**

id uuid pk

organization\_id uuid fk

workspace\_id uuid null

project\_id uuid null

site\_id uuid null

media\_type text

storage\_provider text

storage\_key text

mime\_type text

title text null

status text

metadata jsonb

created\_at timestamptz

updated\_at timestamptz

---

# **17\. Workflow Routing 規格**

這段最關鍵：  
**哪些流程該跑哪個系統。**

## **17.1 跑 n8n 的**

適合：

* webhook intake  
* SaaS 串接  
* 通知  
* social publish  
* CRM sync  
* low-risk form automation  
* chatbot channel routing

### **典型流程**

* lead form → FluentCRM → Slack/LINE 通知  
* content approved → WP publish draft → social queue  
* payment received → email \+ onboarding invite

## **17.2 跑 durable workflow 的**

適合：

* onboarding  
* staging create  
* manifest install  
* QA → launch  
* repair → verify → approve → release  
* long-running video generation pipeline  
* human approval wait states

### **典型流程**

* project won → create client workspace → create site → install wc-core → QA → launch

## **17.3 跑 GitHub Actions 的**

適合：

* repo CI  
* tests  
* package validation  
* manifest schema validation  
* PR checks  
* docs build  
* static asset build

### **典型流程**

* repair PR → unit tests → smoke tests → release tag

## **17.4 跑 MCP agents 的**

適合：

* diagnosis  
* content creation  
* code refactor suggestions  
* bug investigation  
* proposal drafting  
* support response drafting  
* knowledge extraction

### **典型流程**

* incident created → repair-agent diagnoses → suggests patch → opens PR

---

# **18\. Rollout / Rollback Schema**

你要會進化，也要會退版。

## **18.1 Rollouts**

### **`rollouts`**

id uuid pk

organization\_id uuid fk

resource\_type text

resource\_id uuid

resource\_version text

rollout\_type text

status text

strategy jsonb

started\_at timestamptz

ended\_at timestamptz null

metadata jsonb

例子：

* prompt rollout  
* template rollout  
* agent rollout  
* package rollout  
* policy rollout

## **18.2 Rollout Targets**

### **`rollout_targets`**

id uuid pk

rollout\_id uuid fk

target\_scope\_type text

target\_scope\_id uuid

cohort text null

status text

started\_at timestamptz

ended\_at timestamptz null

metrics jsonb

metadata jsonb

## **18.3 Rollbacks**

### **`rollbacks`**

id uuid pk

organization\_id uuid fk

resource\_type text

resource\_id uuid

from\_version text

to\_version text

reason text

triggered\_by\_type text

triggered\_by\_ref text null

executed\_at timestamptz

result\_summary jsonb

metadata jsonb

---

# **19\. 實際命名規範建議**

這些小地方很重要，之後會救你很多命。

## **19.1 IDs / slugs**

* workflows: `wp-create-staging`  
* packages: `wc-core`  
* prompt packs: `seo-article-writer`  
* agents: `repair-agent`  
* templates: `kadence-service-home-v1`

## **19.2 versioning**

統一：

* `1.0.0`  
* `1.2.3`

不要混：

* `v1`  
* `rev-3`  
* `latest-final-final`

## **19.3 status enums**

盡量統一：

* `draft`  
* `active`  
* `deprecated`  
* `archived`  
* `blocked`  
* `failed`  
* `completed`  
* `pending_approval`

---

# **20\. 最小 SQL 分期實作順序**

不要一次建全部表。  
第一期先建最關鍵的。

## **Phase A：Tenancy \+ Delivery**

先建：

* organizations  
* workspaces  
* profiles  
* memberships  
* roles / permissions / assignments  
* projects  
* sites  
* environments

## **Phase B：Factory Registries**

再建：

* packages / versions / manifests  
* templates / versions  
* prompt packs / versions  
* playbooks / versions  
* evaluators / versions

## **Phase C：Execution**

再建：

* workflows / versions / runs  
* agents / versions / runs  
* approvals / steps  
* incidents / error\_events

## **Phase D：Business / Growth**

再建：

* contacts  
* accounts  
* deals  
* invoices  
* subscriptions  
* cost\_entries  
* revenue\_entries

## **Phase E：Decision / Learning**

最後建：

* evaluations  
* decisions  
* decision\_actions  
* rollouts  
* rollbacks  
* metric\_snapshots  
* profitability\_snapshots

---

# **21\. 最小可行 RLS 規則順序**

不要一開始想把所有 policy 寫滿。  
先用最小能活的版本。

## **第一步**

所有 tenant-bound 表只允許：

* 同 organization membership 可 read

## **第二步**

寫入需另外檢查：

* 是否有對應 action permission

## **第三步**

高風險操作不只靠 RLS，而是同時經過：

* RPC / edge function  
* permission check  
* approval policy  
* audit write

也就是：

## **高風險寫入不要直接讓前端 update table**

---

# **22\. 90 天落地 Roadmap**

這裡我直接幫你排成現實版。

## **Day 1–15：底座成形**

目標：先讓多租戶 \+ 建站主線成立

做：

* Supabase project  
* organizations/workspaces/profiles schema  
* memberships \+ 基本 roles  
* projects/sites/environments schema  
* packages/manifests schema  
* `wc-core` registry entry  
* staging create workflow v1  
* manifest install workflow v1

成果：

* 可以建立客戶  
* 可以建立 site  
* 可以對 staging 跑 `wc-core`

---

## **Day 16–30：交付主線跑通**

目標：從成交到 staging ready

做：

* deals / contacts / accounts  
* deal won → onboarding trigger  
* launch checklist schema  
* package install run logs  
* QA workflow  
* approval v1  
* incident / error events v1

成果：

* 從 lead / deal 到 staging ready 可打通  
* 有基礎失敗追蹤

---

## **Day 31–45：內容與 CRM 接上**

目標：讓站不只是建好，還能開始長內容與營運

做：

* prompt pack / template / evaluator schema  
* SEO content workflow v1  
* FluentCRM sync layer  
* contacts lifecycle sync  
* publish draft workflow  
* content evaluation v1

成果：

* 可自動產 SEO 內容草稿  
* 可寫回 CRM / lifecycle

---

## **Day 46–60：觀測與修復**

目標：開始形成自我修復能力

做：

* Sentry integration  
* incidents ingestion  
* repair-agent registry  
* repair workflow v1  
* GitHub Actions PR loop  
* rollback schema  
* health snapshots

成果：

* 錯誤可進 incident  
* agent 可提修復草案  
* 可做 staging repair 驗證

---

## **Day 61–75：決策與成本**

目標：開始不是只有自動做事，而是知道值不值得做

做：

* cost\_entries / revenue\_entries  
* profitability snapshots  
* metric snapshots  
* evaluations  
* decisions / decision\_actions  
* upsell recommendation flow v1

成果：

* 可看每客戶、每站、每流程粗略毛利  
* 可做基礎 decision loop

---

## **Day 76–90：知識化與產品化**

目標：把專案知識沉澱成工廠資產

做：

* knowledge assets  
* SOP extraction flow  
* tutorial script flow  
* rollout targets  
* beta cohort rollout  
* package / prompt / agent 版本升級規範

成果：

* 有教學文件與 SOP 流  
* 有 rollout / rollback  
* 平台開始像真正的 Factory OS

---

# **23\. 第一版真正最小 MVP 的核心範圍**

你不要一開始什麼都做。  
真正最小 MVP 應該只做這條：

## **Lead → Deal Won → Create Client Workspace → Create Staging → Apply wc-core → QA → Launch Approval → SEO Draft Generation → CRM Welcome Flow**

只要這條真的跑通，你就已經不是普通接案工作室。  
你已經在做：

## **可複製的 WordPress-native AI Delivery System**

---

# **24\. 這三部分合起來後，你現在有了什麼**

到這裡，整個 Master Spec v1 已經具備：

## **第 1 部分**

* 系統願景  
* 分層架構  
* 多租戶與治理原則  
* 自動化等級模型  
* human-in-the-loop 邊界

## **第 2 部分**

* 各 domain 的 workflow spec  
* triggers / inputs / outputs  
* KPIs  
* approvals  
* failure handling

## **第 3 部分**

* Supabase schema 藍圖  
* registries  
* agents / workflows / policies  
* routing  
* observability  
* cost attribution  
* decision engine  
* 90 天 roadmap

所以現在這份已經不是概念稿了。  
它已經是：

## **架構級 \+ 實作前規格級**

還差的，是更往下的交付物。

---

# **25\. 接下來最合理的第 4 部分**

如果你要，我下一部分就不再停留在 spec，會直接進入：

# **Lobster Factory Master Spec v1 — 第 4 部分**

內容改成真正的落地物：

* Supabase SQL 初版  
* 資料表 DDL 草稿  
* RLS policy 草稿  
* `wc-core` manifest schema 範例  
* workflow naming convention  
* n8n / durable workflow / GitHub Actions / MCP 的實際 routing matrix  
* agent policy JSON 範例  
* approval policy JSON 範例  
* decision record JSON 範例  
* 你的 monorepo 結構建議  
* 第一版 repo / folder 結構

