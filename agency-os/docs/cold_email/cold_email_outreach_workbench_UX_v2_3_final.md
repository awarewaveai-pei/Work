> ⛔ **SUPERSEDED（2026-06-23）**：本文件為草稿，已整合進單一 SSOT → [`COLD_OUTREACH_WORKBENCH_INTEGRATED_SPEC_v1.md`](./COLD_OUTREACH_WORKBENCH_INTEGRATED_SPEC_v1.md)（PART F 控制台 UX，掛進 next-admin `app/outreach/`）。請以該檔為準；本檔僅留歷史參考，不再更新。

* # **AI 冷拜訪行銷工作台 UX v2.3 Final：FluentCRM Warm Nurture Experience**

* 文件類型：UI/UX 最終規劃  
  版本：v2.3 Final  
  對應產品架構：AI 冷拜訪行銷工作台 v3.0  
  核心升級：在 v2.2 高階互動體驗基礎上，加入 FluentCRM Warm CRM、Nurture Sequence、Consent、WordPress Form、CRM Activity Sync 與寄送策略 UI。  
* ---

* # **0\. v2.3 版本定位**

* v2.3 是 UI/UX 的最終整合版。  
* 它承接：  
* v2.1：基礎頁面架構  
* v2.2：高階互動與產品體驗  
* v2.3：加入 FluentCRM Warm Nurture Experience  
*   
* 最終產品體驗不是「AI 文案產生器」，而是：  
* 冷開發作戰中心  
* \+  
* AI 業務助理  
* \+  
* 高品質 CRM  
* \+  
* 免費額度控制台  
* \+  
* FluentCRM 暖名單培養系統  
*   
* ---

* # **1\. UX 核心原則**

* ## **1.1 Cold 與 Warm 必須分開**

* 冷名單與暖名單在 UI 上必須清楚分層：  
* Cold Leads：Supabase 主控  
* Warm Leads：FluentCRM 培養  
*   
* 冷開發階段：  
* 名單匯入  
* AI 評分  
* 文案生成  
* 人工審核  
* Gmail 草稿  
* Follow-up  
* 回覆判斷  
*   
* 暖名單階段：  
* Positive reply  
* Proposal requested  
* Meeting booked  
* Opt-in  
* WordPress form submitted  
* FluentCRM sync  
* Tag / List / Sequence  
* Nurture analytics  
* 

* ## **1.2 UI 不鼓勵大量寄送**

* 產品語言應避免：  
* Mass blast  
* Auto spam  
* Bulk cold send  
* Auto DM  
*   
* 建議使用：  
* 建立草稿  
* 人工審核  
* 高品質聯絡  
* 個人化開場  
* 低壓 CTA  
* 暖名單培養  
* 停止聯絡  
* 

* ## **1.3 FluentCRM 不是冷信發送器**

* FluentCRM 在 UI 上的定位要寫清楚：  
* FluentCRM 用於已回覆、有興趣、已同意、已填表單、已預約的暖名單培養。  
*   
* 不要讓使用者誤以為可以把所有 cold leads 直接同步進 newsletter。

* ## **1.4 每個頁面都要有 Next Best Action**

* 使用者打開任何頁面，都應該知道下一步：  
* 補觀察點  
* AI 分析  
* 生成文案  
* 審核草稿  
* 建立 Gmail 草稿  
* 跟進  
* 處理回覆  
* 同步 FluentCRM  
* 啟動 nurture sequence  
*   
* ---

* # **2\. 最終資訊架構**

* 建議左側 sidebar：  
* Dashboard 作戰中心  
* Lead Inbox 名單收件匣  
* Leads 冷名單庫  
* Campaigns 開發批次  
* Message Review 文案審核  
* Draft Queue 草稿佇列  
* Follow-ups 跟進任務  
* Replies 回覆處理  
* Proposals 提案  
* Warm Leads 暖名單  
* Nurture Sequences 培養流程  
* FluentCRM Sync CRM 同步  
* Playbooks 產業劇本  
* Analytics 成效分析  
* Connectors 免費工具連接  
* Settings 設定  
*   
* ---

* # **3\. 使用者主流程**

* ## **3.1 首次使用流程**

* Step 1：建立 Service Profile  
* Step 2：選擇目標產業  
* Step 3：連接 Gmail / n8n / FluentCRM  
* Step 4：匯入第一批 leads  
* Step 5：Lead Inbox 審核  
* Step 6：AI 評分  
* Step 7：生成 cold email / DM / follow-up  
* Step 8：Message Review 人工審核  
* Step 9：建立 Gmail 草稿或複製 DM  
* Step 10：設定 Follow-up  
* Step 11：收到回覆後 Reply Copilot 判斷  
* Step 12：若變暖，同步到 FluentCRM  
* Step 13：加入 tag / list / sequence  
* Step 14：追蹤 nurture 成效  
* 

* ## **3.2 每日使用流程**

* 打開 Dashboard  
* ↓  
* 處理今日任務  
* ↓  
* 先處理 Replies  
* ↓  
* 再處理 Follow-ups  
* ↓  
* 審核 Draft Queue  
* ↓  
* 補充 Lead Inbox 缺失資料  
* ↓  
* 查看 Warm Leads / FluentCRM Sync  
* ↓  
* 檢查免費額度與寄送健康  
*   
* ---

* # **4\. Dashboard：每日作戰中心**

* ## **4.1 目的**

* Dashboard 是使用者每天的指揮中心，不是單純報表。

* ## **4.2 今日任務卡片**

* 今天要處理  
*   
* 冷開發：  
* \- 需要跟進：8 筆  
* \- 待審核草稿：12 封  
* \- 高分 lead 尚未聯絡：15 筆  
* \- 缺少觀察點：6 筆  
*   
* 暖名單：  
* \- 有興趣回覆：3 筆  
* \- 待同步 FluentCRM：2 筆  
* \- FluentCRM sync error：1 筆  
* \- Proposal sequence 今日待追蹤：4 筆  
* 

* ## **4.3 AI 推薦行動**

* AI 建議  
*   
* 1\. 優先處理 3 筆「有興趣」回覆，這些應先傳提案或同步 FluentCRM。  
* 2\. 本週瑜伽空間回覆率最高，建議新增 20 筆同類 lead。  
* 3\. 有 6 筆 lead 缺少具體觀察點，暫不建議生成冷信。  
* 4\. Hunter credits 剩 12 次，建議只用在 80 分以上 leads。  
* 5\. FluentCRM 有 1 筆退訂事件，已建議同步到 suppression list。  
* 

* ## **4.4 成效摘要**

* 本週 cold outreach：  
* 發送：42  
* 回覆：7  
* 正面回覆：4  
* 預約：2  
*   
* 本週 nurture：  
* 同步 FluentCRM：5  
* Sequence started：4  
* Email clicked：3  
* Proposal viewed：2  
* Meeting booked：1  
* 

* ## **4.5 免費額度狀態**

* Gemini Free：68% 可用  
* Hunter Free：12 / 50 credits  
* Apify Free：$3.20 / $5 剩餘  
* Trigger.dev：剩餘 $4.10  
* n8n：自架，正常  
* FluentCRM：已連接  
* Gmail：已連接  
*   
* ---

* # **5\. Lead Inbox：名單收件匣**

* ## **5.1 目的**

* 所有匯入資料先進 Lead Inbox，不直接污染正式 Leads。  
* 來源包括：  
* CSV  
* Google Sheets  
* Apify  
* Hunter  
* Snov  
* Apollo  
* n8n webhook  
* WordPress form  
* FluentCRM contact  
* 手動輸入  
* 

* ## **5.2 Inbox 分類**

* 高品質  
* 資料不足  
* 疑似重複  
* 缺少聯絡方式  
* 不建議開發  
* 風險名單  
* WordPress 表單名單  
* FluentCRM 回流名單  
* 

* ## **5.3 Lead Inbox Card**

* \[品牌名稱\]  
* 來源：Apify / CSV / WordPress Form  
* 產業：瑜伽 / 身心靈  
* 品質分數：84  
* 可聯絡度：72  
* 疑似重複：低  
* 建議：Approve to Leads  
* 

* ## **5.4 操作**

* Approve to Leads  
* Reject  
* Merge duplicate  
* Request enrichment  
* Add observation  
* Mark do\_not\_contact  
* Sync to FluentCRM  
* 

* ## **5.5 WordPress Form 特殊處理**

* 如果來源是 WordPress / FluentCRM form：  
* consent\_status \= opted\_in  
* source\_type \= website\_form  
* 可直接進 Warm Leads  
* 可同步 FluentCRM  
* 可啟動 nurture sequence  
*   
* ---

* # **6\. Leads：冷名單庫**

* ## **6.1 表格欄位**

* 名稱  
* 產業  
* 地區  
* Lead Quality  
* Contactability  
* ICP Score  
* 優先級  
* 狀態  
* 聯絡渠道  
* 下次跟進  
* FluentCRM 狀態  
* Consent 狀態  
* 來源  
* 

* ## **6.2 篩選器**

* 產業  
* 地區  
* 分數範圍  
* 狀態  
* 渠道  
* 來源  
* 是否有 email  
* 是否有觀察點  
* 是否 do\_not\_contact  
* 是否已同步 FluentCRM  
* consent\_status  
* 

* ## **6.3 批次操作**

* AI 分析  
* 生成文案  
* 加入 Campaign  
* 標記不聯絡  
* 匯出 CSV  
* 去重  
* 批次同步 Warm Leads 到 FluentCRM  
*   
* 注意：批次同步到 FluentCRM 只能同步 warm / opted-in 名單。  
* ---

* # **7\. Lead Detail：單一客戶頁**

* ## **7.1 版面**

* 左側：客戶資料  
* 中間：AI 分析與互動紀錄  
* 右側：Next Best Action / FluentCRM 狀態  
* 

* ## **7.2 左側資料**

* 公司名稱  
* 產業  
* 網站  
* 社群  
* 聯絡人  
* Email  
* 電話  
* 地區  
* 來源 URL  
* Consent 狀態  
* FluentCRM Contact ID  
* 

* ## **7.3 中間 AI 分析**

* Lead Quality Score  
* Contactability Score  
* ICP Score  
* 推測痛點  
* 推薦切入角度  
* 推薦方案  
* 可用觀察點  
* 風險提醒  
* 來源依據  
* 

* ## **7.4 右側動作**

* 冷開發動作：  
* AI 分析  
* 生成文案  
* 加入 Campaign  
* 建立 Gmail 草稿  
* 設定 Follow-up  
* 標記無興趣  
* 加入 Suppression List  
*   
* 暖名單動作：  
* Sync to FluentCRM  
* Add FluentCRM Tag  
* Start Nurture Sequence  
* Remove from Sequence  
* View in WordPress  
* Mark Opt-in  
* Mark Unsubscribed  
* 

* ## **7.5 CRM Timeline**

* 6/22 匯入 lead  
* 6/22 AI 分析，分數 88  
* 6/23 產生 cold email  
* 6/23 建立 Gmail 草稿  
* 6/24 標記已寄出  
* 6/27 Follow-up 1 到期  
* 6/28 對方回覆：可以看看  
* 6/28 同步 FluentCRM  
* 6/28 加入 stage:proposal-requested  
* 6/29 FluentCRM Email clicked  
*   
* ---

* # **8\. Campaigns：開發批次**

* ## **8.1 Campaign Card**

* 名稱：藝術療癒 × 瑜伽空間 × 台北  
* 目標產業：瑜伽 / 身心靈  
* 渠道：IG DM \+ Email  
* Lead 數：80  
* 已聯絡：32  
* 回覆：6  
* 正面回覆：3  
* 同步 FluentCRM：2  
* 預約：1  
* 狀態：進行中  
* 

* ## **8.2 Campaign Detail**

* 目標  
* 目標產業  
* 主推方案  
* 切入策略  
* Hypothesis  
* Lead 清單  
* 文案版本  
* Follow-up 節奏  
* FluentCRM Sync Rules  
* 成效  
* 

* ## **8.3 Campaign Hypothesis**

* 假設：瑜伽空間會對「週末小班藝術療癒活動」有較高回覆率。  
*   
* ---

* # **9\. Message Review：文案審核中心**

* ## **9.1 目的**

* AI 不直接寄信。所有訊息先在這裡審核。

* ## **9.2 版面**

* 左側：Lead Context  
* 中間：Message Draft  
* 右側：Safety / Evidence / Actions  
* 

* ## **9.3 Tabs**

* Cold Email  
* IG DM  
* LinkedIn  
* Follow-up 1  
* Follow-up 2  
* Proposal Summary  
* Warm Nurture Intro  
* 

* ## **9.4 Safety Panel**

* 個人化分數：92  
* 安全分數：88  
* 垃圾感風險：低  
* 誇大承諾：無  
* 是否有具體觀察：是  
* CTA 是否低壓：是  
* 禁用詞：未發現  
* FluentCRM 同步條件：尚未符合  
* 

* ## **9.5 Evidence Panel**

* 本封文案依據：  
* \- observation: 常辦女性瑜伽與香氛課程  
* \- pain\_guess: 需要增加週末小班活動  
* \- source\_url: https://...  
* 

* ## **9.6 操作**

* Approve  
* 建立 Gmail 草稿  
* 複製文字  
* 重新生成  
* 更短  
* 更溫和  
* 更商務  
* 加入案例  
* 降低推銷感  
* 產生提案摘要  
*   
* ---

* # **10\. Draft Queue：草稿審核佇列**

* ## **10.1 Queue 分類**

* 待審核  
* 需要修改  
* 已批准  
* 已建立 Gmail 草稿  
* 已複製  
* 已跳過  
* 

* ## **10.2 Draft Card**

* 客戶名稱  
* 產業  
* 渠道  
* 文案類型  
* 個人化分數  
* 安全分數  
* CTA  
* 下一步  
* 

* ## **10.3 批次審稿快捷鍵**

* A \= Approve  
* R \= Regenerate  
* S \= Skip  
* C \= Copy  
* D \= Create Gmail Draft  
* W \= Make warmer  
* B \= More businesslike  
*   
* ---

* # **11\. Follow-ups：跟進任務**

* ## **11.1 看板欄位**

* 今天到期  
* 明天  
* 本週  
* 逾期  
* 等待回覆  
* 已停止  
* FluentCRM nurture 中  
* 

* ## **11.2 任務卡**

* 客戶名稱  
* 上次聯絡日期  
* 上次訊息摘要  
* 建議 Follow-up  
* 狀態  
* 是否已同步 FluentCRM  
* 一鍵複製 / 建立草稿  
* 

* ## **11.3 快速操作**

* 完成跟進  
* 延後 3 天  
* 延後 7 天  
* 停止聯絡  
* 重新生成 follow-up  
* 轉入 FluentCRM nurture  
*   
* ---

* # **12\. Replies：回覆處理中心**

* ## **12.1 回覆分類**

* 有興趣  
* 詢價  
* 要更多資料  
* 要案例  
* 找錯窗口  
* 已有合作廠商  
* 暫時沒需求  
* 拒絕  
* 退訂 / 不要再聯絡  
* 

* ## **12.2 Reply Copilot 輸出**

* 對方意圖：  
* 隱含疑慮：  
* 建議策略：  
* 建議回覆：  
* 是否傳提案：  
* 是否約時間：  
* 是否同步 FluentCRM：  
* 建議 FluentCRM tag：  
* 建議 sequence：  
* 是否停止聯絡：  
* 

* ## **12.3 回覆 → FluentCRM 規則**

| 回覆類型 | FluentCRM 動作 |
| ----- | ----- |
| 有興趣 | 可同步，tag stage:warm-lead |
| 要提案 | 可同步，tag stage:proposal-requested |
| 預約會議 | 可同步，tag stage:meeting-booked |
| 要案例 | 可同步，tag interest:case-study |
| 暫時沒需求 | 不進長期 nurture，除非對方同意 |
| 拒絕 | 不同步或移除 |
| 不要再聯絡 | suppression \+ do-not-contact |

* ---

* # **13\. Proposals：一頁式提案**

* ## **13.1 提案欄位**

* 合作主題  
* 為什麼適合對方  
* 服務內容  
* 流程  
* 時間 / 交付物  
* 對方收益  
* 合作方式  
* 下一步  
* 

* ## **13.2 支援格式**

* Markdown  
* HTML  
* 複製到 Canva  
* PDF later  
* FluentCRM Email Body  
* 

* ## **13.3 提案後動作**

* Send via Gmail  
* Sync to FluentCRM  
* Start Proposal Follow-up Sequence  
* Add tag stage:proposal-requested  
* Track proposal clicked  
*   
* ---

* # **14\. Warm Leads：暖名單中心**

* ## **14.1 目的**

* 集中管理已變暖、已同意、已互動、已填表單的名單。

* ## **14.2 Warm Leads 條件**

* replied\_positive  
* requested\_proposal  
* booked\_meeting  
* opted\_in  
* submitted\_form  
* became\_customer  
* 

* ## **14.3 表格欄位**

* 名稱  
* 來源  
* 產業  
* Warm Stage  
* Consent Status  
* FluentCRM Sync  
* Tags  
* Active Sequence  
* Last Activity  
* Next Action  
* 

* ## **14.4 Warm Stage**

* warm-lead  
* proposal-requested  
* meeting-booked  
* nurturing  
* customer  
* lost  
* unsubscribed  
* 

* ## **14.5 快速操作**

* Sync to FluentCRM  
* Add Tag  
* Start Sequence  
* Send Proposal  
* Book Meeting  
* Mark Customer  
* Mark Lost  
* Mark Unsubscribed  
*   
* ---

* # **15\. Nurture Sequences：培養流程**

* ## **15.1 目的**

* 顯示 FluentCRM 中哪些 sequence 正在使用，以及它們對應哪種 lead。

* ## **15.2 Sequence Card**

* 名稱：Proposal Follow-up Sequence  
* 觸發：stage:proposal-requested  
* 人數：12  
* 開信率：46%  
* 點擊率：18%  
* 退訂：1  
* 狀態：Active  
* 

* ## **15.3 內建 Sequence**

* Proposal Follow-up  
* 藝術療癒工作坊 Nurture  
* HR Employee Wellbeing Nurture  
* 瑜伽空間合作 Nurture  
* 長照中心活動 Nurture  
* 網站設計提案 Nurture  
* 品牌設計案例 Nurture  
* 

* ## **15.4 Sequence Detail**

* Email 1：主題 / 發送時間 / 內容  
* Email 2：主題 / 發送時間 / 內容  
* Email 3：主題 / 發送時間 / 內容  
* 成效  
* 適用 tags  
* 停用條件  
*   
* ---

* # **16\. FluentCRM Sync：同步中心**

* ## **16.1 目的**

* 管理 Supabase 與 FluentCRM 的同步狀態。

* ## **16.2 Sync Status**

* 未同步  
* 可同步  
* 已同步  
* 同步失敗  
* 等待重試  
* 不可同步：未符合 warm 條件  
* 不可同步：do\_not\_contact  
* 不可同步：unsubscribed  
* 

* ## **16.3 Sync Error Center**

* 顯示：  
* Lead  
* 錯誤類型  
* 錯誤訊息  
* 上次同步時間  
* 重試次數  
* 下一步  
*   
* 操作：  
* Retry  
* Ignore  
* Edit Mapping  
* Mark Not Syncable  
* View Payload  
* 

* ## **16.4 Mapping 設定**

* Supabase industry → FluentCRM tags  
* Supabase status → FluentCRM stage tags  
* Supabase source\_type → FluentCRM source tags  
* Supabase consent\_status → FluentCRM compliance tags  
*   
* ---

* # **17\. Playbooks：產業劇本**

* ## **17.1 每個 Playbook 包含**

* 產業  
* 常見痛點  
* 決策者  
* 最佳渠道  
* 最佳切入角度  
* 常見拒絕原因  
* 推薦 CTA  
* 禁用說法  
* 成功文案範例  
* 推薦 FluentCRM Sequence  
* 推薦 Tags  
* 

* ## **17.2 範例：瑜伽 / 身心靈空間**

* 建議渠道：IG DM  
* 主推方案：週末小班工作坊  
* CTA：可以傳一份簡短合作提案嗎？  
* 避免說法：治療焦慮、療效、心理治療  
* 成功角度：增加週末活動與會員黏著度  
* 推薦 Sequence：瑜伽空間合作 Nurture  
* 推薦 Tags：industry:yoga-wellness, interest:art-healing-workshop  
*   
* ---

* # **18\. Analytics：成效分析**

* ## **18.1 Cold Outreach Metrics**

* 新增 leads  
* 合格 leads  
* 已產生文案  
* 已審核  
* 已建立草稿  
* 已寄出  
* 回覆數  
* 正面回覆數  
* 預約數  
* 提案數  
* 成交數  
* 

* ## **18.2 Warm Nurture Metrics**

* 同步 FluentCRM 人數  
* Sequence started  
* Sequence completed  
* Open rate  
* Click rate  
* Unsubscribe rate  
* Proposal clicks  
* Meeting booked  
* Customer conversion  
* 

* ## **18.3 維度**

* 產業  
* 渠道  
* 文案版本  
* 切入角度  
* CTA  
* 服務方案  
* Lead 分數區間  
* FluentCRM Sequence  
* Tag  
* Source  
* 

* ## **18.4 必備圖表**

* 冷開發漏斗  
* 暖名單培養漏斗  
* 各產業回覆率  
* 各渠道回覆率  
* A/B 文案表現  
* Sequence 成效  
* 免費額度使用效率  
* 每 100 leads 成本  
*   
* ---

* # **19\. Connectors：免費工具連接**

* ## **19.1 Connector Cards**

* Gmail  
* 狀態：已連接  
* 用途：冷信草稿  
* 建議：只建立草稿，不自動大量寄送  
*   
* FluentCRM  
* 狀態：已連接  
* 用途：暖名單 CRM / Email Nurture  
* 同步規則：僅 warm / opt-in leads  
*   
* Hunter  
* 狀態：已連接  
* 額度：12 / 50 credits  
* 用途：Email 查找與驗證  
* 建議：只用於 80 分以上 leads  
*   
* Apify  
* 狀態：已連接  
* 免費額度：$3.20 / $5 剩餘  
* 用途：公開資料抓取  
* 建議：只用於公開目錄與高分 lead 補資料  
* 

* ## **19.2 Connector 設定**

* 連接狀態  
* 目前配額  
* 本月使用量  
* 失敗紀錄  
* fallback 規則  
* 是否啟用  
* Webhook URL  
* API Key reference  
*   
* ---

* # **20\. Settings：設定**

* ## **20.1 分區**

* Service Profiles  
* AI Provider  
* Prompt Versions  
* 品牌語氣  
* 禁用詞  
* Follow-up 節奏  
* Suppression List  
* Gmail  
* FluentCRM  
* n8n Webhooks  
* Trigger.dev  
* 配額策略  
* Consent Rules  
* Sync Rules  
* 

* ## **20.2 FluentCRM Settings**

* WordPress Site URL  
* FluentCRM API Base URL  
* API Key / App Password  
* Default List  
* Default Tags  
* Default Sequence  
* Webhook Secret  
* Sync Rules  
* Unsubscribe Handling  
* Do Not Contact Sync  
*   
* ---

* # **21\. 寄送策略 UI**

* ## **21.1 寄送工具分工提示**

* UI 應明確顯示：

| 場景 | 推薦工具 |
| ----- | ----- |
| 第一封冷信 | Gmail 草稿 |
| 個人化 follow-up | Gmail 草稿 |
| IG / LinkedIn DM | 複製文字，人工發送 |
| 對方有興趣後傳提案 | Gmail 或 FluentCRM |
| 已 opt-in 的長期培養 | FluentCRM |
| Newsletter | FluentCRM |
| 交易型通知 | Brevo / FluentCRM / SES，看架構 |
| 大量 cold blast | 不建議 |

* ## **21.2 Sendy / Brevo / FluentCRM 提醒**

* UI 可用說明：  
* 你目前已連接 FluentCRM。建議將 FluentCRM 作為暖名單與 newsletter 系統。  
* Brevo 適合不想維護 WordPress / SMTP 的使用者。  
* Sendy 適合大量 newsletter 且願意維護 Amazon SES 的使用者，但若已有 FluentCRM，功能會部分重疊。  
*   
* ---

* # **22\. Cost-Saving Mode：省錢模式**

* ## **22.1 模式選項**

* 極省模式  
* 平衡模式  
* 品質優先模式  
* 

* ## **22.2 極省模式**

* AI 只產生 prompt，不呼叫 API  
* Email 查找手動  
* 不跑 Apify  
* 不跑大量 enrichment  
* 只使用 Gmail 草稿與 FluentCRM 既有功能  
* 

* ## **22.3 平衡模式**

* Gemini Free 生成  
* Hunter 只驗證高分 lead  
* Apify 只抓必要欄位  
* FluentCRM 只同步 warm leads  
* 

* ## **22.4 品質優先模式**

* 高分 lead 完整補資料  
* 產生多版本文案  
* 跑 Safety Linter  
* 產生 Proposal  
* 同步 FluentCRM Nurture  
* 回寫活動資料  
*   
* ---

* # **23\. Status Badges**

* ## **23.1 Lead Status**

* New  
* Inbox Pending  
* Analyzed  
* Qualified  
* Message Generated  
* Approved  
* Drafted  
* Sent  
* Follow-up Due  
* Replied  
* Proposal Sent  
* Meeting Booked  
* Warm  
* Synced to FluentCRM  
* Nurturing  
* Customer  
* Lost  
* Do Not Contact  
* Unsubscribed  
* 

* ## **23.2 Consent Status**

* Unknown  
* Replied  
* Opted-in  
* Form Submitted  
* Customer  
* Unsubscribed  
* Do Not Contact  
* 

* ## **23.3 FluentCRM Sync Status**

* Not Synced  
* Ready to Sync  
* Synced  
* Sync Failed  
* Retrying  
* Not Eligible  
*   
* ---

* # **24\. Empty States**

* ## **24.1 Warm Leads 空狀態**

* 目前沒有暖名單。  
*   
* 你可以：  
* 1\. 處理有興趣的回覆  
* 2\. 傳送一頁式提案  
* 3\. 將已 opt-in 名單同步到 FluentCRM  
* 

* ## **24.2 FluentCRM Sync 空狀態**

* 目前沒有待同步項目。  
*   
* 只有正面回覆、提案請求、已預約或已 opt-in 的名單才會出現在這裡。  
* 

* ## **24.3 Nurture Sequences 空狀態**

* 尚未設定 FluentCRM nurture sequence。  
*   
* 建議先建立：  
* 1\. Proposal Follow-up Sequence  
* 2\. 產業分眾培養 Sequence  
* 3\. Newsletter List  
*   
* ---

* # **25\. Microcopy**

* ## **25.1 建議用語**

* 建立 Gmail 草稿  
* 同步暖名單  
* 啟動培養流程  
* 停止聯絡  
* 來源依據  
* 低壓 CTA  
* 人工審核  
* 高品質開發  
* 

* ## **25.2 避免用語**

* Blast  
* Spam  
* Auto scrape everyone  
* Mass DM  
* Cold newsletter  
* 一鍵狂發  
* 保證成交  
*   
* ---

* # **26\. Template Gallery**

* ## **26.1 內建模板**

* 藝術療癒 × 瑜伽空間  
* 藝術療癒 × 企業 HR  
* 藝術療癒 × 長照中心  
* 藝術療癒 × 親子教育  
* 網站設計 × 診所  
* 品牌設計 × 餐飲  
* 社群代操 × 美業  
* 攝影服務 × 旅宿  
* 顧問服務 × B2B 公司  
* SEO 內容 × 電商  
* 

* ## **26.2 每個模板包含**

* 目標產業  
* 常見痛點  
* 推薦 CTA  
* 禁用詞  
* 冷信結構  
* DM 結構  
* Follow-up 節奏  
* 提案格式  
* 推薦 FluentCRM tags  
* 推薦 FluentCRM sequence  
*   
* ---

* # **27\. UX Success Metrics**

* ## **27.1 操作效率**

* 從匯入 lead 到產生文案的時間  
* 從文案生成到 approve 的時間  
* 批次審稿完成率  
* 每位使用者每日可處理 lead 數  
* Warm lead sync 完成時間  
* 

* ## **27.2 品質指標**

* Lead Quality Gate 通過率  
* Message Quality Gate 通過率  
* Draft approval rate  
* 文案重新生成次數  
* 缺少 observation 的 lead 比例  
* AI 幻覺攔截次數  
* 

* ## **27.3 成效指標**

* 回覆率  
* 正面回覆率  
* 預約率  
* 提案轉換率  
* 成交率  
* Follow-up 完成率  
* Warm lead nurture conversion  
* FluentCRM click-to-meeting rate  
* 

* ## **27.4 成本指標**

* 每 100 leads 的外部 API 成本  
* Hunter credit 使用效率  
* Apify credit 使用效率  
* Gemini usage  
* FluentCRM sequence ROI  
* Manual fallback 使用次數  
*   
* ---

* # **28\. MVP UI 範圍**

* ## **28.1 第一階段必做**

* Dashboard  
* Lead Inbox  
* Leads  
* Lead Detail  
* Message Review  
* Draft Queue  
* Follow-ups  
* Replies  
* Settings  
* Connectors  
* 

* ## **28.2 第二階段加入**

* Campaigns  
* Proposals  
* Warm Leads  
* FluentCRM Sync  
* Analytics  
* Playbooks  
* 

* ## **28.3 第三階段加入**

* Nurture Sequences  
* Template Gallery  
* Command Palette  
* A/B Experiments  
* Advanced Cost Dashboard  
*   
* ---

* # **29\. 最重要的 UX 結論**

* v2.3 的核心不是把 FluentCRM 塞進來，而是把整個使用者旅程分清楚：  
* Cold outreach：高品質、低壓、人工審核  
* Warm nurture：分眾、自動化、長期培養  
*   
* 使用者每天打開產品時，應該清楚看到：  
* 今天要聯絡誰  
* 誰需要跟進  
* 誰已經變暖  
* 誰該進 FluentCRM  
* 誰不應該再聯絡  
* 哪個 sequence 有效  
* 哪個產業值得繼續開發  
* 免費額度還剩多少  
*   
* 最終體驗應該像：  
* 一個低成本但高級的 AI 業務助理  
* \+  
* 一個冷開發 CRM  
* \+  
* 一個 FluentCRM 暖名單培養中心  
*   
* ---

* # **30\. v2.3 最終定義**

* 完成 v2.3 後，這套工具的 UI/UX 應該能支撐：  
* 名單進來先審核  
* 冷開發前先評分  
* 文案生成後先檢查  
* 寄送前人工批准  
* 回覆後 AI 判斷下一步  
* 變暖後同步 FluentCRM  
* 培養後數據回寫  
* 整體成效持續學習  
*   
* 這才是完整、便宜、高品質、可商業化的 AI Outbound \+ Warm Nurture 工作台。

