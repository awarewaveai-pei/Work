> ⛔ **SUPERSEDED（2026-06-23）**：本文件為草稿，已整合進單一 SSOT → [`COLD_OUTREACH_WORKBENCH_INTEGRATED_SPEC_v1.md`](./COLD_OUTREACH_WORKBENCH_INTEGRATED_SPEC_v1.md)（含對齊現有系統的修正、三營運模式、Free-Plan 成本骨幹）。請以該檔為準；本檔僅留歷史參考，不再更新。

# **Email 冷拜訪行銷工作台 v3.0：Outbound \+ FluentCRM Warm Nurture 完整最終架構**

文件類型：產品 / 技術總規劃  
版本：v3.0 Final  
核心定位：低成本、高品質、可審核、可追蹤、可培養的 AI 冷開發 \+ 暖名單自動化行銷系統。  
關鍵升級：在原本 Supabase \+ 控制台 \+ n8n \+ Trigger.dev \+ Free Plan 外掛架構上，正式加入 FluentCRM 作為 Warm CRM / Email Nurture Layer。

---

# **0\. 版本定位**

v3.0 是完整產品架構的最終整合版。

它不是單純的 AI 冷信生成器，也不是單純的 CRM，而是一套完整的：

AI Outbound Lead System  
\+  
Human-reviewed Cold Outreach  
\+  
Warm Lead CRM  
\+  
FluentCRM Email Nurture  
\+  
Free Plan Connector Router  
\+  
Supabase 主控資料庫  
\+  
n8n / Trigger.dev 工作流

---

# **1\. 核心產品定位**

## **1.1 一句話定位**

為創作者、顧問、小型服務業與 B2B 團隊設計的低成本 AI 冷開發與暖名單培養工作台。

## **1.2 產品要解決的問題**

1\. 不知道要開發誰  
2\. 找到名單但不知道誰值得聯絡  
3\. 冷拜訪訊息太像罐頭  
4\. 發太多容易變垃圾訊息  
5\. Follow-up 常常漏掉  
6\. 對方回覆後不知道怎麼推進  
7\. 暖名單沒有後續培養  
8\. 免費工具太多但不知道怎麼分工  
9\. API 額度與成本不好控管  
10\. 冷名單與訂閱名單混在一起，風險高

## **1.3 產品不做什麼**

不做自動大量亂寄信  
不做 LinkedIn / IG 大量自動私訊  
不把未同意冷名單直接丟進 FluentCRM newsletter  
不鼓勵 scraping 私人資料  
不做無來源依據的 AI 個人化  
不保證成交、不保證回覆、不保證療效或收益

---

# **2\. 最終系統分工**

## **2.1 核心角色分工**

| 系統 | 角色 |
| ----- | ----- |
| Supabase | 主資料庫、Auth、RLS、Leads、Messages、Replies、Campaigns、Analytics、Consent、Sync Logs |
| 自己的控制台 | 使用者操作介面、審核中心、作戰中心、名單管理、文案審核 |
| Trigger.dev | AI 背景任務、Lead scoring、文案生成、Follow-up 排程、批次任務 |
| 自架 n8n | 外部工具串接、Apify、Hunter、Snov、Gmail、Google Sheets、FluentCRM、Webhook |
| Gmail | 第一封冷信與個人化 follow-up 的草稿建立與人工寄送 |
| FluentCRM | Warm CRM、Email nurture、WordPress 表單名單、分眾、Sequence、Newsletter |
| WordPress | Landing page、表單、內容頁、提案頁、活動頁 |
| Apify Free | 公開資料抓取、目錄、活動頁、網站資料補強 |
| Hunter Free | 高分 lead 的 Email 查找與驗證 |
| Snov / Apollo Free | B2B 名單與 Email 補充來源 |
| Google Sheets / CSV | 免費匯入、備援、手動資料流 |
| Canva Free | 一頁式提案視覺化 |
| Brevo / HubSpot Free | 可選外掛，不作為第一核心 |

---

# **3\. 最終總架構**

\[Lead Sources\]  
CSV / 手動 / Google Sheets / Apify / Hunter / Snov / Apollo / WordPress Forms  
↓  
\[n8n Import \+ Normalize \+ Deduplicate\]  
↓  
\[Supabase Lead Inbox\]  
↓  
\[AI Lead Quality \+ Contactability \+ ICP Scoring via Trigger.dev\]  
↓  
\[Leads Database\]  
↓  
\[Message Generator\]  
Cold Email / DM / Follow-up / Proposal Summary  
↓  
\[Human Review\]  
Approve / Edit / Regenerate / Safety Check  
↓  
\[Gmail Draft / Copy DM / Manual Send\]  
↓  
\[Follow-up Engine\]  
↓  
\[Reply Classifier\]  
↓  
Positive Reply / Proposal Request / Meeting Booked / Opt-in  
↓  
\[Sync to FluentCRM\]  
Tags / Lists / Sequences / Nurture  
↓  
\[FluentCRM Activity\]  
Open / Click / Unsubscribe / Sequence / Form Submission  
↓  
\[Back to Supabase Analytics \+ Timeline\]

---

# **4\. Cold Lead 與 Warm Lead 分層**

## **4.1 Cold Lead Layer：Supabase 管**

Cold leads 只存在 Supabase，不直接進 FluentCRM 自動化。

適用狀態：

new  
inbox\_pending  
analyzed  
qualified  
message\_generated  
approved  
drafted  
sent  
followup\_due  
no\_reply  
not\_qualified  
do\_not\_contact

## **4.2 Warm Lead Layer：FluentCRM 管**

只有當 lead 變暖，才進 FluentCRM。

可同步條件：

replied\_positive  
requested\_proposal  
booked\_meeting  
opted\_in  
submitted\_form  
became\_customer

## **4.3 絕對禁止**

禁止把冷名單直接大量匯入 FluentCRM newsletter  
禁止把未 opt-in 名單加入長期 nurture sequence  
禁止對 do\_not\_contact 名單建立任何草稿或自動化  
禁止用 FluentCRM 當 cold email sender

---

# **5\. Free Plan 全外掛策略**

## **5.1 核心原則**

核心資料自己管  
外部工具只當 connector  
所有 free plan 都可插拔  
額度用完要有 fallback  
高成本動作只用在高分 lead

## **5.2 Free Plan Router**

需要 AI 生成：  
1\. Gemini Free  
2\. 使用者 BYO API Key  
3\. 產生 prompt 讓使用者手動貼到 ChatGPT

需要 Email 驗證：  
1\. Hunter Free  
2\. Snov Free  
3\. 手動驗證  
4\. 標記未驗證

需要名單蒐集：  
1\. 手動 / CSV / Google Sheets  
2\. Apify Free  
3\. Google Search / Maps 手動  
4\. 其他 BYO connector

需要 CRM：  
1\. Supabase  
2\. FluentCRM warm layer  
3\. HubSpot Free 可選

需要自動化：  
1\. 自架 n8n  
2\. Trigger.dev  
3\. Make Free 可選

## **5.3 省錢模式**

| 模式 | 說明 |
| ----- | ----- |
| 極省模式 | 幾乎不呼叫 API，只產 prompt、手動查找、手動匯入 |
| 平衡模式 | Gemini Free \+ Hunter 高分 lead 驗證 \+ Apify 小量抓資料 |
| 品質優先模式 | 高分 lead 完整 enrichment、多版本文案、安全檢查、提案摘要 |

---

# **6\. Supabase Database Schema**

以下 schema 是 v3.0 建議主體。實作時可依現有資料庫命名調整。

---

## **6.1 profiles**

create table profiles (  
  id uuid primary key references auth.users(id),  
  email text,  
  display\_name text,  
  created\_at timestamptz default now()  
);

---

## **6.2 service\_profiles**

使用者的服務設定檔。

create table service\_profiles (  
  id uuid primary key default gen\_random\_uuid(),  
  user\_id uuid references auth.users(id) not null,

  industry text,  
  service\_name text not null,  
  positioning text,  
  service\_description text,  
  target\_problems text\[\],  
  target\_audiences text\[\],  
  usp text,  
  price\_position text,  
  proof\_links text\[\],  
  tone text,

  forbidden\_words text\[\],  
  replacement\_words text\[\],  
  compliance\_rules text,  
  sensitive\_industry\_type text,

  created\_at timestamptz default now(),  
  updated\_at timestamptz default now()  
);

---

## **6.3 lead\_inbox**

所有匯入名單先進 Inbox，不直接污染 Leads。

create table lead\_inbox (  
  id uuid primary key default gen\_random\_uuid(),  
  user\_id uuid references auth.users(id) not null,

  raw\_payload jsonb,  
  normalized\_name text,  
  normalized\_industry text,  
  website text,  
  social\_url text,  
  email text,  
  phone text,  
  region text,

  source\_type text,  
  source\_url text,

  quality\_score int default 0,  
  contactability\_score int default 0,  
  duplicate\_score int default 0,

  inbox\_status text default 'pending',  
  ai\_notes text,

  created\_at timestamptz default now(),  
  updated\_at timestamptz default now()  
);

---

## **6.4 leads**

正式開發名單。

create table leads (  
  id uuid primary key default gen\_random\_uuid(),  
  user\_id uuid references auth.users(id) not null,  
  service\_profile\_id uuid references service\_profiles(id),

  name text not null,  
  industry text,  
  website text,  
  social\_url text,  
  contact\_name text,  
  contact\_role text,  
  email text,  
  phone text,  
  region text,

  source\_type text,  
  source\_url text,  
  observation text,  
  website\_summary text,  
  social\_summary text,  
  pain\_guess text,  
  buying\_motive text,  
  recommended\_offer text,  
  recommended\_angle text,

  lead\_quality\_score int default 0,  
  contactability\_score int default 0,  
  icp\_score int default 0,  
  score int default 0,  
  priority text,

  status text default 'new',

  first\_contact\_date date,  
  last\_contact\_date date,  
  next\_followup\_date date,

  do\_not\_contact boolean default false,  
  do\_not\_contact\_reason text,

  consent\_status text default 'unknown',  
  consent\_source text,  
  consent\_at timestamptz,

  fluentcrm\_contact\_id text,  
  fluentcrm\_sync\_status text default 'not\_synced',  
  fluentcrm\_last\_synced\_at timestamptz,

  notes text,

  created\_at timestamptz default now(),  
  updated\_at timestamptz default now()  
);

---

## **6.5 campaigns**

create table campaigns (  
  id uuid primary key default gen\_random\_uuid(),  
  user\_id uuid references auth.users(id) not null,

  name text not null,  
  target\_industry text,  
  offer text,  
  channel text,  
  hypothesis text,  
  status text default 'draft',

  created\_at timestamptz default now(),  
  updated\_at timestamptz default now()  
);

---

## **6.6 campaign\_leads**

create table campaign\_leads (  
  id uuid primary key default gen\_random\_uuid(),  
  campaign\_id uuid references campaigns(id) not null,  
  lead\_id uuid references leads(id) not null,

  status text default 'queued',  
  created\_at timestamptz default now(),

  unique (campaign\_id, lead\_id)  
);

---

## **6.7 messages**

create table messages (  
  id uuid primary key default gen\_random\_uuid(),  
  user\_id uuid references auth.users(id) not null,  
  lead\_id uuid references leads(id) not null,  
  campaign\_id uuid references campaigns(id),

  channel text not null,  
  output\_type text not null,  
  subject text,  
  body text not null,

  version int default 1,  
  variant\_label text,  
  angle text,

  personalization\_score int,  
  safety\_score int,  
  quality\_gate\_status text,

  ai\_model text,  
  prompt\_version\_id uuid,  
  prompt\_snapshot jsonb,  
  evidence\_snapshot jsonb,

  status text default 'draft',  
  approved\_at timestamptz,  
  drafted\_at timestamptz,  
  sent\_at timestamptz,

  created\_at timestamptz default now()  
);

---

## **6.8 replies**

create table replies (  
  id uuid primary key default gen\_random\_uuid(),  
  user\_id uuid references auth.users(id) not null,  
  lead\_id uuid references leads(id) not null,  
  message\_id uuid references messages(id),

  reply\_text text not null,  
  reply\_type text,  
  ai\_interpretation text,  
  hidden\_objection text,  
  next\_action text,  
  suggested\_response text,

  created\_at timestamptz default now()  
);

---

## **6.9 proposals**

create table proposals (  
  id uuid primary key default gen\_random\_uuid(),  
  user\_id uuid references auth.users(id) not null,  
  lead\_id uuid references leads(id),  
  campaign\_id uuid references campaigns(id),

  title text,  
  summary text,  
  markdown\_body text,  
  html\_body text,  
  status text default 'draft',

  sent\_at timestamptz,  
  created\_at timestamptz default now()  
);

---

## **6.10 suppression\_list**

create table suppression\_list (  
  id uuid primary key default gen\_random\_uuid(),  
  user\_id uuid references auth.users(id) not null,

  email text,  
  domain text,  
  lead\_id uuid references leads(id),

  reason text,  
  source text,

  created\_at timestamptz default now()  
);

---

## **6.11 prompt\_versions**

create table prompt\_versions (  
  id uuid primary key default gen\_random\_uuid(),  
  user\_id uuid references auth.users(id),

  name text not null,  
  prompt\_type text not null,  
  version text not null,  
  prompt\_text text not null,  
  is\_active boolean default false,

  created\_at timestamptz default now()  
);

---

## **6.12 experiments**

create table experiments (  
  id uuid primary key default gen\_random\_uuid(),  
  user\_id uuid references auth.users(id) not null,  
  campaign\_id uuid references campaigns(id),

  name text not null,  
  hypothesis text,  
  metric text,  
  status text default 'running',

  created\_at timestamptz default now()  
);

---

## **6.13 message\_variants**

create table message\_variants (  
  id uuid primary key default gen\_random\_uuid(),  
  message\_id uuid references messages(id),  
  experiment\_id uuid references experiments(id),

  variant\_label text,  
  angle text,

  created\_at timestamptz default now()  
);

---

## **6.14 connector\_accounts**

create table connector\_accounts (  
  id uuid primary key default gen\_random\_uuid(),  
  user\_id uuid references auth.users(id) not null,

  connector\_name text not null,  
  connector\_type text not null,  
  is\_enabled boolean default true,

  credentials\_ref text,  
  settings jsonb,

  created\_at timestamptz default now(),  
  updated\_at timestamptz default now()  
);

---

## **6.15 connector\_usage**

create table connector\_usage (  
  id uuid primary key default gen\_random\_uuid(),  
  user\_id uuid references auth.users(id) not null,

  connector\_name text not null,  
  usage\_type text not null,  
  amount numeric default 1,  
  metadata jsonb,

  created\_at timestamptz default now()  
);

---

## **6.16 connector\_limits**

create table connector\_limits (  
  id uuid primary key default gen\_random\_uuid(),  
  user\_id uuid references auth.users(id) not null,

  connector\_name text not null,  
  monthly\_limit numeric,  
  current\_usage numeric default 0,  
  reset\_at timestamptz,

  alert\_threshold numeric default 0.8,

  created\_at timestamptz default now(),  
  updated\_at timestamptz default now()  
);

---

## **6.17 crm\_sync\_logs**

create table crm\_sync\_logs (  
  id uuid primary key default gen\_random\_uuid(),  
  user\_id uuid references auth.users(id) not null,  
  lead\_id uuid references leads(id),

  crm\_name text not null default 'fluentcrm',  
  action text not null,

  request\_payload jsonb,  
  response\_payload jsonb,

  status text not null,  
  error\_message text,

  created\_at timestamptz default now()  
);

---

## **6.18 timeline\_events**

create table timeline\_events (  
  id uuid primary key default gen\_random\_uuid(),  
  user\_id uuid references auth.users(id) not null,  
  lead\_id uuid references leads(id),  
  campaign\_id uuid references campaigns(id),

  event\_type text not null,  
  title text,  
  description text,  
  metadata jsonb,

  created\_at timestamptz default now()  
);

---

## **6.19 analytics\_events**

create table analytics\_events (  
  id uuid primary key default gen\_random\_uuid(),  
  user\_id uuid references auth.users(id) not null,  
  lead\_id uuid references leads(id),  
  campaign\_id uuid references campaigns(id),

  event\_type text not null,  
  metadata jsonb,

  created\_at timestamptz default now()  
);

---

# **7\. RLS 安全策略**

所有使用者資料表都要啟用 RLS。

範例：

alter table leads enable row level security;

create policy "Users can read own leads"  
on leads for select  
using (auth.uid() \= user\_id);

create policy "Users can insert own leads"  
on leads for insert  
with check (auth.uid() \= user\_id);

create policy "Users can update own leads"  
on leads for update  
using (auth.uid() \= user\_id);

create policy "Users can delete own leads"  
on leads for delete  
using (auth.uid() \= user\_id);

同樣策略應套用：

service\_profiles  
lead\_inbox  
messages  
replies  
campaigns  
campaign\_leads  
proposals  
suppression\_list  
connector\_accounts  
connector\_usage  
crm\_sync\_logs  
timeline\_events  
analytics\_events

---

# **8\. Lead Scoring 系統**

## **8.1 Lead Quality Score**

衡量資料本身品質。

| 指標 | 分數 |
| ----- | ----- |
| 有公司 / 品牌名稱 | 15 |
| 有官網或社群 | 15 |
| 有公開商務聯絡方式 | 20 |
| 有明確產業 | 10 |
| 有具體觀察點 | 20 |
| 有 source\_url | 10 |
| 不是重複名單 | 10 |

## **8.2 Contactability Score**

衡量是否適合聯絡。

| 指標 | 分數 |
| ----- | ----- |
| 有公開 Email | 25 |
| Email 已驗證 | 25 |
| 有 IG / FB / LinkedIn | 15 |
| 有聯絡人職稱 | 15 |
| 有明確合作窗口 | 10 |
| 沒有 do\_not\_contact 紀錄 | 10 |

## **8.3 ICP Fit Score**

衡量是否符合使用者服務。

| 指標 | 分數 |
| ----- | ----- |
| 產業與服務高度相關 | 25 |
| 有明顯痛點 | 20 |
| 有近期活動 / 社群更新 | 15 |
| 有預算可能性 | 10 |
| 有具體合作切入點 | 20 |
| 有決策者 | 10 |

## **8.4 Priority**

80–100：High  
60–79：Medium  
40–59：Low  
0–39：Not Recommended

---

# **9\. Quality Gate**

## **9.1 Lead Gate**

沒有以下條件，不建議進入正式開發：

名稱  
產業  
來源 URL  
網站或社群  
具體觀察點  
無 suppression hit  
非重複名單

## **9.2 Message Gate**

文案必須檢查：

是否有具體觀察  
是否包含禁用詞  
是否誇大成果  
是否有未經證實資訊  
CTA 是否低壓  
字數是否合理  
是否像垃圾訊息

## **9.3 Block 條件**

以下情況應直接阻擋：

do\_not\_contact \= true  
suppression\_list 命中  
沒有任何觀察點  
AI 編造來源  
使用禁用詞  
含保證療效 / 保證收益 / 保證成交

---

# **10\. Anti-Hallucination Guard**

## **10.1 原則**

AI 只能引用以下欄位中明確存在的資料：

lead.observation  
lead.website\_summary  
lead.social\_summary  
lead.source\_url  
service\_profile  
industry\_playbook  
manual\_notes

## **10.2 訊息產出必須包含 evidence\_snapshot**

{  
  "used\_observation": "常辦女性瑜伽與香氛課程",  
  "used\_pain\_guess": "需要增加週末小班活動",  
  "source\_url": "https://example.com",  
  "unsupported\_claims": \[\]  
}

---

# **11\. FluentCRM Connector**

## **11.1 FluentCRM 的正式角色**

FluentCRM \= Warm CRM / Email Nurture / WordPress 表單名單培養

不是：

Cold email sender  
冷名單 newsletter 工具  
未同意名單大量寄信工具

## **11.2 Sync Rules**

只同步以下 leads：

replied\_positive  
requested\_proposal  
booked\_meeting  
opted\_in  
submitted\_form  
became\_customer

不同步以下 leads：

new  
analyzed  
message\_generated  
cold\_sent  
no\_reply  
not\_qualified  
do\_not\_contact  
unsubscribed

## **11.3 FluentCRM Tags**

### **Source Tags**

source:outbound  
source:website-form  
source:workshop  
source:referral  
source:manual-import

### **Industry Tags**

industry:yoga-wellness  
industry:hr  
industry:clinic  
industry:restaurant  
industry:education  
industry:ecommerce  
industry:long-term-care

### **Stage Tags**

stage:warm-lead  
stage:proposal-requested  
stage:meeting-booked  
stage:customer  
stage:lost

### **Interest Tags**

interest:art-healing-workshop  
interest:website-design  
interest:brand-design  
interest:content-marketing  
interest:seo

### **Compliance Tags**

consent:opted-in  
do-not-contact

注意：consent:opted-in 不只用 tag，Supabase 也要有正式 consent 欄位。

---

# **12\. FluentCRM Sequences**

## **12.1 Proposal Follow-up Sequence**

觸發條件：

tag \= stage:proposal-requested

流程：

Day 0：寄提案連結 / PDF  
Day 2：補充相關案例  
Day 5：詢問是否需要調整方案  
Day 10：最後一次低壓提醒

## **12.2 藝術療癒工作坊 Nurture Sequence**

Email 1：什麼是藝術療癒取向工作坊  
Email 2：適合企業 / 空間 / 團體的使用場景  
Email 3：工作坊流程與案例  
Email 4：常見問題  
Email 5：邀請預約討論

## **12.3 產業分眾 Newsletter**

HR：員工關懷 / wellbeing  
瑜伽空間：小班活動 / 女性自我探索  
長照中心：長者藝術陪伴  
親子教育：情緒表達 / 親子創作  
診所：信任建立 / 衛教內容 / 預約流程  
餐飲：活動包裝 / 社群內容 / 回訪

---

# **13\. n8n Workflows**

## **13.1 Import Leads Workflow**

Webhook Trigger  
↓  
Normalize Data  
↓  
Deduplicate  
↓  
Suppression Check  
↓  
Insert into lead\_inbox  
↓  
Trigger.dev lead scoring  
↓  
Return import summary

## **13.2 Apify Public Data Workflow**

Manual / Scheduled Trigger  
↓  
Run Apify Actor  
↓  
Fetch Dataset Items  
↓  
Normalize Fields  
↓  
Insert into lead\_inbox  
↓  
Log connector\_usage

## **13.3 Hunter Verify Workflow**

Webhook Trigger  
↓  
Check connector\_limits  
↓  
Hunter Verify  
↓  
Update leads.email\_verification metadata  
↓  
Log connector\_usage

## **13.4 Gmail Draft Workflow**

Webhook Trigger  
↓  
Fetch approved message  
↓  
Create Gmail Draft  
↓  
Update message.status \= drafted  
↓  
Create timeline\_event

## **13.5 Warm Lead → FluentCRM Workflow**

Supabase status changed  
↓  
Check sync rules  
↓  
Check consent\_status  
↓  
Prepare FluentCRM payload  
↓  
Create / Update FluentCRM contact  
↓  
Apply list \+ tags  
↓  
Start sequence if allowed  
↓  
Write crm\_sync\_logs  
↓  
Update fluentcrm\_contact\_id  
↓  
Create timeline\_event

## **13.6 WordPress Form → Supabase Workflow**

Fluent Forms / WordPress form submitted  
↓  
FluentCRM contact created  
↓  
Outgoing webhook  
↓  
n8n  
↓  
Insert / update lead in Supabase  
↓  
Set consent\_status \= opted\_in  
↓  
Trigger.dev classify intent  
↓  
Create timeline\_event

## **13.7 FluentCRM Activity → Supabase Analytics**

FluentCRM webhook / scheduled polling  
↓  
Fetch contact activity  
↓  
Map event type  
↓  
Insert analytics\_events  
↓  
Insert timeline\_events

Events:

email\_opened  
email\_clicked  
tag\_added  
sequence\_started  
sequence\_completed  
unsubscribe  
form\_submitted  
meeting\_booked

---

# **14\. Trigger.dev Tasks**

## **14.1 enrichLead**

export const enrichLead \= task({  
  id: "enrich-lead",  
  run: async ({ leadId }) \=\> {  
    // 1\. Read lead or lead\_inbox record  
    // 2\. Build context from service profile and playbook  
    // 3\. Run AI classification  
    // 4\. Calculate quality, contactability, ICP score  
    // 5\. Write results to Supabase  
    // 6\. Create timeline event  
  },  
});

## **14.2 generateOutreachPack**

export const generateOutreachPack \= task({  
  id: "generate-outreach-pack",  
  run: async ({ leadId, serviceProfileId, campaignId }) \=\> {  
    // 1\. Read service profile \+ lead  
    // 2\. Check quality gate  
    // 3\. Generate email, DM, followups, proposal summary  
    // 4\. Run safety linter  
    // 5\. Store messages with prompt\_snapshot and evidence\_snapshot  
    // 6\. Update lead status  
  },  
});

## **14.3 safetyLintMessage**

export const safetyLintMessage \= task({  
  id: "safety-lint-message",  
  run: async ({ messageId }) \=\> {  
    // Check forbidden words, unsupported claims, hard CTA, spam tone  
  },  
});

## **14.4 classifyReply**

export const classifyReply \= task({  
  id: "classify-reply",  
  run: async ({ replyId }) \=\> {  
    // Classify reply type  
    // Suggest next action  
    // Generate suggested response  
  },  
});

## **14.5 dailyFollowupScan**

export const dailyFollowupScan \= schedules.task({  
  id: "daily-followup-scan",  
  cron: "0 9 \* \* \*",  
  run: async () \=\> {  
    // Find leads where next\_followup\_date \<= today  
    // Create tasks or dashboard items  
  },  
});

## **14.6 syncWarmLeadToFluentCRM**

export const syncWarmLeadToFluentCRM \= task({  
  id: "sync-warm-lead-to-fluentcrm",  
  run: async ({ leadId }) \=\> {  
    // Verify lead is warm  
    // Verify consent/sync rule  
    // Trigger n8n FluentCRM workflow  
  },  
});

## **14.7 buildIndustryPlaybookInsights**

export const buildIndustryPlaybookInsights \= task({  
  id: "build-industry-playbook-insights",  
  run: async ({ campaignId }) \=\> {  
    // Analyze reply rate, angles, CTA, objections  
    // Update playbook recommendations  
  },  
});

---

# **15\. Supabase Edge Functions**

建議保留安全 API 層。

/import-leads  
/analyze-lead  
/generate-message  
/approve-message  
/create-gmail-draft  
/sync-fluentcrm  
/fluentcrm-webhook  
/n8n-webhook

範例：

import { serve } from "https://deno.land/std/http/server.ts";

serve(async (req) \=\> {  
  const payload \= await req.json();

  // 1\. Verify auth or webhook secret  
  // 2\. Validate payload  
  // 3\. Execute action  
  // 4\. Write logs  
  // 5\. Return response

  return new Response(JSON.stringify({ ok: true }), {  
    headers: { "Content-Type": "application/json" },  
  });  
});

---

# **16\. 控制台頁面架構**

Dashboard  
Lead Inbox  
Leads  
Lead Detail  
Campaigns  
Message Review  
Draft Queue  
Follow-ups  
Replies  
Proposals  
Warm Leads  
FluentCRM Sync  
Playbooks  
Analytics  
Connectors  
Settings

---

# **17\. Analytics 指標**

## **17.1 Cold Outreach Metrics**

新增 leads  
合格 leads  
已產生文案  
已審核  
已建立草稿  
已寄出  
回覆數  
正面回覆數  
預約數  
提案數  
成交數

## **17.2 Warm Nurture Metrics**

同步到 FluentCRM 人數  
Sequence started  
Sequence completed  
Open rate  
Click rate  
Unsubscribe rate  
Proposal clicks  
Meeting booked  
Customer conversion

## **17.3 Cost Metrics**

每 100 leads 的外部工具成本  
Hunter credit 使用效率  
Apify credit 使用效率  
Gemini usage  
n8n workflow 次數  
Trigger.dev 任務成本

## **17.4 Quality Metrics**

Lead Quality Gate 通過率  
Message Quality Gate 通過率  
AI 幻覺攔截次數  
禁用詞攔截次數  
Observation 缺失率  
Draft approval rate

---

# **18\. 合規與品牌安全**

## **18.1 基本規則**

只使用公開商務資料  
保留 source\_url  
對方拒絕後停止聯絡  
所有 do\_not\_contact 雙向同步  
冷名單與 opt-in 名單分開  
不冒充身份  
不誇大結果  
不使用療效、收益、成交保證

## **18.2 敏感產業禁用詞**

### **藝術療癒 / 健康相關**

治療焦慮  
治療憂鬱  
療效保證  
改善疾病  
診斷  
取代諮商  
保證療癒

替代詞：

情緒表達  
壓力覺察  
自我探索  
創作陪伴  
團體連結  
身心放鬆  
支持性活動  
非語言表達

### **行銷 / 商業相關**

禁用：

保證成交  
保證業績  
穩賺  
一定提升營收

替代：

提升機會  
改善流程  
協助優化  
增加轉換可能性

---

# **19\. 開發路線圖**

## **Phase 1：核心能用**

Supabase schema \+ RLS  
Service Profile  
Lead Inbox  
Leads CRUD  
AI scoring  
Message generation  
Message Review  
Gmail draft  
Follow-up date

## **Phase 2：品質變強**

Quality Gate  
Safety Linter  
Evidence Snapshot  
Draft Queue  
Suppression List  
Prompt Versioning  
Reply Classifier

## **Phase 3：Free Plan 外掛**

Connector Accounts  
Connector Usage  
Quota Router  
Apify Workflow  
Hunter Workflow  
Google Sheets Import  
Manual Fallback  
Cost-saving Mode

## **Phase 4：FluentCRM Warm Layer**

FluentCRM Connector  
Warm Lead Sync  
Consent Model  
Tags / Lists / Sequences  
WordPress Form Inbox  
Activity back-sync  
CRM Sync Logs

## **Phase 5：成效與學習**

Analytics Dashboard  
A/B Experiment Engine  
Industry Playbook Builder  
Proposal Builder  
Deal Path  
Nurture Conversion Tracking

---

# **20\. 最小 MVP 範圍**

如果要快速開發，v3.0 MVP 只做這些：

1\. Supabase schema \+ RLS  
2\. Service Profile  
3\. Lead Inbox  
4\. Leads CRUD  
5\. AI scoring  
6\. AI cold email / DM / follow-up  
7\. Message Review \+ Approve  
8\. Gmail draft via n8n  
9\. Follow-up dashboard  
10\. Reply classification  
11\. Warm lead sync to FluentCRM  
12\. FluentCRM tags \+ basic sequence

暫時不做：

完全自動寄信  
LinkedIn / IG 自動化  
複雜團隊權限  
Billing  
多租戶 marketplace  
大型付費資料庫

---

# **21\. 最終產品形態**

完成 v3.0 後，產品應該是：

低成本 AI 冷開發作戰中心  
\+  
高品質人工審核文案系統  
\+  
Free Plan 外掛額度路由器  
\+  
Supabase 主控 CRM  
\+  
FluentCRM 暖名單培養引擎  
\+  
n8n / Trigger.dev 自動化後台

它的真正差異化不是「大量發送」，而是：

名單乾淨  
觀察具體  
文案可信  
人工審核  
跟進不漏  
回覆可推進  
暖名單可培養  
成本可控制  
資料可追蹤  
系統可擴充

---

# **22\. 最終結論**

v3.0 的核心設計是：

Supabase 管冷開發與主控資料  
FluentCRM 管暖名單與 nurture  
Gmail 管人工冷信草稿  
n8n 管外部工具串接  
Trigger.dev 管 AI 任務與排程  
Free Plan Router 管成本  
Quality Gate 管品質  
Safety Linter 管風險  
Analytics 管學習

這會讓整套工具從「AI 冷拜訪工具」升級成：

低成本 AI Outbound \+ FluentCRM Warm Nurture 全流程行銷系統。

