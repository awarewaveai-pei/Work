> ⛔ **SUPERSEDED（2026-06-23）**：本文件為草稿，已整合進單一 SSOT → [`COLD_OUTREACH_WORKBENCH_INTEGRATED_SPEC_v1.md`](./COLD_OUTREACH_WORKBENCH_INTEGRATED_SPEC_v1.md)（PART D 寄送治理 + PART H 免費寄送策略；SES 已依決策移除，暖信走客戶 FluentSMTP 或 Brevo free）。請以該檔為準；本檔僅留歷史參考，不再更新。

# Email Deliverability & Compliance v3 Final：退信、投訴、退訂風險治理版

> 適用產品：AI 冷拜訪行銷工作台  
> 技術棧：Supabase、自己的控制台、自架 n8n、Trigger.dev、WordPress、FluentCRM、FluentSMTP、Amazon SES、Gmail / Google Workspace、Resend  
> 文件目的：把 email 寄送從「工具選擇」升級成「風險治理系統」，明確處理 bounced、spam report / complaint、unsubscribe、suppression、domain reputation、provider fallback 與 UI 防呆。  
> 核心原則：不能保證永遠不被退信、不被檢舉、不進垃圾信；只能透過架構、名單品質、節奏、驗證、監控、立即停損，把風險壓低並可追蹤。

---

# 1. 最終判斷

## 1.1 之前版本還不夠完整

前一版已經決定：

```text
冷信：Gmail / Google Workspace
暖信：FluentCRM + FluentSMTP + Amazon SES
系統信：Resend 或 SES
備援：Brevo
不用：Sendy
```

這個方向是對的，但還不算真正面面俱到。  
原因是它缺少「寄送風險治理層」。

真正完整的 email 架構必須補上：

```text
Bounce Management
Complaint / Spam Report Management
Unsubscribe Management
Suppression List
Domain / Sender Reputation Monitoring
Sending Policy Gate
Provider Event Webhooks
Emergency Stop
Legal / Consent Rules
UI 防呆
```

---

# 2. 最終 Email Stream

不要用一個工具寄所有信。分三條 stream。

| Stream | 用途 | 主工具 | 底層寄送 | 風險 |
|---|---|---|---|---|
| Cold Outreach | 第一封冷信、個人化 follow-up、一對一溝通 | Gmail / Google Workspace | Gmail | 投訴、被忽略、低回覆 |
| Warm Marketing / Nurture | 已回覆、已 opt-in、填表單、提案後 nurture、newsletter | FluentCRM | FluentSMTP + Amazon SES | 退訂、投訴、退信 |
| Transactional | 系統通知、預約確認、提案連結、OTP | Resend 或 SES | Resend / SES API | 被 marketing 污染、deliverability 下降 |

---

# 3. 最終工具決策

```text
冷開發第一封：Gmail / Google Workspace
冷開發 follow-up：Gmail / Google Workspace
暖名單 nurture：FluentCRM
FluentCRM 實際寄送：FluentSMTP + Amazon SES
系統通知：Resend，或 Amazon SES
簡單備援：Brevo
不使用：Sendy
```

## 為什麼不用 Sendy

```text
Sendy = Self-hosted newsletter + Amazon SES
FluentCRM = WordPress CRM + newsletter + automation + sequence
```

你已經有 FluentCRM，Sendy 會造成：

```text
名單分裂
退訂不同步
多一套 unsubscribe
多一套寄送紀錄
多一套同步邏輯
聲譽風險增加
```

所以：

```text
已有 FluentCRM → 不用 Sendy
```

---

# 4. 不能保證什麼

## 4.1 不能保證不 bounced

退信原因可能包括：

```text
email 不存在
收件伺服器拒收
對方 mailbox full
對方 domain 設定問題
你的內容被拒收
你的 domain / IP reputation 不佳
```

你能做的是：

```text
寄前驗證 email
只寄高品質名單
hard bounce 立即 suppression
soft bounce 多次後 suppression
監控 SES bounce rate
達到風險閾值自動停止
```

---

## 4.2 不能保證不被 report spam

投訴原因可能包括：

```text
對方不認識你
對方覺得不相關
內容太像推銷
太頻繁 follow-up
沒有清楚停止聯絡方式
名單來源品質差
```

你能做的是：

```text
冷信小量
具體觀察
低壓 CTA
拒收句
對方拒絕立即停止
warm email 加 unsubscribe
complaint 立即 suppression
高 complaint rate 自動停寄
```

---

## 4.3 不能保證不進 Promotions

Newsletter / EDM / 活動通知進 Promotions 是正常的。  
真正要避免的是：

```text
cold email 進 spam
proposal follow-up 進 spam
transactional email 進 spam
```

---

# 5. 官方風險閾值轉成產品規則

## 5.1 Google / Yahoo Spam Complaint

產品內部規則：

```text
目標：user-reported spam rate < 0.1%
警戒：>= 0.1%
強制停止該 stream：>= 0.3%
```

## 5.2 Amazon SES Bounce

產品內部規則：

```text
理想：hard bounce < 1%
警戒：>= 2%
強制檢查：>= 3%
停止 SES marketing stream：>= 5%
災難級：>= 10%
```

## 5.3 Amazon SES Complaint

產品內部規則：

```text
理想：complaint < 0.05%
警戒：>= 0.08%
停止 campaign：>= 0.1%
停止 SES marketing stream：>= 0.3%
災難級：>= 0.5%
```

## 5.4 Unsubscribe Rate

沒有單一全球固定標準，產品採內部營運閾值：

```text
正常：< 0.5%
警戒：0.5%–1%
檢查內容與分眾：1%–2%
停止該 sequence：> 2%
```

## 5.5 Cold Outreach Reply Opt-out

冷信沒有一定要用 newsletter unsubscribe link，但必須提供簡單拒收方式：

```text
如果不適合，我就不再打擾。
```

任何拒絕、不要再聯絡、退訂、檢舉、hard bounce 都要進 suppression。

---

# 6. Sending Policy Gate

每一封信寄出前都要通過 Gate。

## 6.1 Global Gate

所有 email stream 共用。

```text
不得命中 suppression_list
不得 do_not_contact
不得使用 invalid email
不得寄給 hard_bounced email
不得寄給 complained email
不得寄給 unsubscribed email
不得寄給沒有合法寄送狀態的名單
不得超過 sender daily limit
不得超過 domain daily limit
不得超過 campaign risk limit
```

---

## 6.2 Cold Gate

冷開發專用。

必須符合：

```text
lead 有 source_url
lead 有 observation
lead 與服務有合理相關性
email 不是私人來源或不明來源
沒有近期寄送紀錄
同一公司 / domain 未過度聯絡
訊息是純文字
最多 1 個連結
沒有圖片
沒有附件
沒有 tracking pixel
沒有誇大承諾
有拒收句
人工 approve
只建立 Gmail draft，不自動寄出
```

不符合則阻擋：

```text
沒有 observation → block
沒有 source_url → block
有禁用詞 → block
CTA 過硬 → warning 或 block
像 EDM → block
同一模板大量重複 → block
```

---

## 6.3 Warm Gate

FluentCRM / SES 專用。

必須符合其中之一：

```text
positive reply
proposal requested
meeting booked
form submitted
explicit opt-in
customer
```

必須具備：

```text
FluentCRM contact exists
consent_status 不可為 unknown
unsubscribe link
List-Unsubscribe header
正確 tag / list
非 suppression
非 bounced
非 complained
```

---

## 6.4 Transactional Gate

Resend / SES 系統通知專用。

必須符合：

```text
目的為系統通知
不可混入 newsletter
不可混入銷售促銷
不可加大量 marketing CTA
subject 必須反映事件
```

---

# 7. Bounce Management

## 7.1 Bounce 分類

```text
hard_bounce：永久退信，email 不存在或不可送達
soft_bounce：暫時退信，例如 mailbox full、暫時拒收
blocked：被對方伺服器或政策拒收
```

## 7.2 處理規則

| 事件 | 動作 |
|---|---|
| hard_bounce | 立即加入 suppression_list，停止所有 stream |
| soft_bounce 1 次 | 標記 soft_bounce_count +1 |
| soft_bounce 2 次 | 暫停 14 天 |
| soft_bounce 3 次 | suppression |
| blocked | 暫停該 domain，進 Deliverability Review |
| Gmail mailer-daemon bounce | n8n / Gmail parser 解析後更新 Supabase |
| SES bounce | SES SNS → n8n → Supabase |
| Resend bounce | Resend webhook → n8n → Supabase |

---

## 7.3 Bounce Incident Workflow

```text
Bounce Event
↓
Parse event
↓
Classify hard / soft / blocked
↓
Update sending_events
↓
Update lead.email_status
↓
If hard → suppression_list
↓
If soft count >= 3 → suppression_list
↓
If domain-level issue → pause domain
↓
Notify dashboard
```

---

# 8. Complaint / Spam Report Management

## 8.1 Complaint 定義

Complaint 代表收件人按了：

```text
Report spam
Junk
Abuse complaint
Feedback loop complaint
```

## 8.2 Complaint 處理原則

任何 complaint 都比 unsubscribe 嚴重。

收到 complaint 後：

```text
立即 suppression
停止該 recipient 所有 stream
停止同 campaign 其他 follow-up
檢查同批名單來源
檢查文案是否過硬
檢查該 industry / source 是否需要暫停
```

---

## 8.3 Complaint Workflow

```text
Complaint Event
↓
Insert sending_events
↓
Insert suppression_list(reason='complaint')
↓
Update lead.do_not_contact = true
↓
Stop sequences
↓
Pause campaign if complaint threshold exceeded
↓
Notify user
```

---

## 8.4 風險擴散規則

如果同一 campaign 出現：

```text
1 complaint → 停止該 recipient
2 complaints → 暫停該 campaign，檢查文案與名單
3 complaints → 停止 campaign
```

如果同一來源出現：

```text
complaint rate >= 0.1% → 停止該 source_type 新寄送
```

---

# 9. Unsubscribe Management

## 9.1 冷信 opt-out

Cold email 不用放大型 newsletter unsubscribe link，但要有清楚拒收句。

範例：

```text
如果不適合，我就不再打擾。
```

如果對方回：

```text
不要再寄
unsubscribe
stop
不需要
請勿聯絡
```

系統動作：

```text
lead.do_not_contact = true
suppression_list(reason='manual_opt_out')
停止所有 follow-up
不同步 FluentCRM
```

---

## 9.2 Warm marketing unsubscribe

FluentCRM / newsletter / sequence 必須有：

```text
Email body unsubscribe link
List-Unsubscribe header
One-click unsubscribe 支援
Preference center，可選
```

退訂後：

```text
FluentCRM unsubscribe
↓
n8n webhook
↓
Supabase suppression_list
↓
lead.do_not_contact = true
↓
停止 cold + warm
↓
保留 transactional email，除非法規或使用者要求全部停止
```

---

## 9.3 Unsubscribe Scope

退訂不能只是一個 boolean。要有 scope。

```text
unsubscribe_marketing：停止 newsletter / nurture
unsubscribe_sales：停止 cold / sales follow-up
unsubscribe_all：停止所有非必要信件
do_not_contact：完全不聯絡
transactional_only：只保留必要系統通知
```

---

# 10. Suppression List 設計

## 10.1 suppression_list 必須是全系統核心

任何寄送前都要先查 suppression_list。

## 10.2 Supabase Schema

```sql
create table suppression_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,

  email text,
  domain text,
  company_name text,
  lead_id uuid references leads(id),

  reason text not null,
  source text not null,

  applies_to text default 'all',
  scope text default 'email',

  evidence jsonb,

  created_at timestamptz default now()
);
```

## 10.3 reason

```text
manual_opt_out
unsubscribe
hard_bounce
soft_bounce_limit
complaint
spam_report
invalid_email
role_account_blocked
legal_request
domain_block
user_manual
```

## 10.4 scope

```text
email
domain
company
campaign
global
```

## 10.5 applies_to

```text
cold
marketing
transactional
all
```

---

# 11. Domain / Sender Reputation 架構

## 11.1 分 stream

```text
cold：Google Workspace 主信箱
marketing：mail.yourdomain.com via SES
transactional：notify.yourdomain.com via Resend / SES
```

## 11.2 不要混用

```text
不要用 cold 信箱寄 newsletter
不要用 marketing subdomain 寄第一封 cold email
不要用 transactional domain 寄 promotion
不要把退訂名單再用 Gmail follow-up
```

---

# 12. DNS Checklist

每個寄送 domain / subdomain 都要有：

```text
SPF
DKIM
DMARC
```

SES marketing stream 建議：

```text
Custom MAIL FROM
Bounce domain
SNS bounce / complaint
Custom tracking domain
```

Resend transactional stream 建議：

```text
Domain verification
DKIM
Webhook
Separate notify subdomain
```

Gmail cold stream 建議：

```text
Google Workspace SPF
Google DKIM
DMARC
Google Postmaster Tools
不要用 tracking pixel
```

---

# 13. Supabase Schema 完整補強

## 13.1 email_domains

```sql
create table email_domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,

  domain text not null,
  stream_type text not null,
  provider text not null,

  spf_status text default 'unknown',
  dkim_status text default 'unknown',
  dmarc_status text default 'unknown',
  mail_from_status text default 'unknown',
  tracking_domain_status text default 'unknown',

  reputation_status text default 'unknown',

  last_checked_at timestamptz,
  is_active boolean default true,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

## 13.2 sender_accounts

```sql
create table sender_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,

  email text not null,
  display_name text,
  provider text not null,
  stream_type text not null,

  daily_limit int default 20,
  daily_sent_count int default 0,
  weekly_sent_count int default 0,

  warmup_stage text default 'new',
  health_status text default 'healthy',

  is_active boolean default true,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

## 13.3 sending_events

```sql
create table sending_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  lead_id uuid references leads(id),
  message_id uuid references messages(id),
  campaign_id uuid references campaigns(id),

  stream_type text not null,
  provider text,
  sender_account_id uuid references sender_accounts(id),

  event_type text not null,
  event_status text,
  provider_event_id text,

  metadata jsonb,

  created_at timestamptz default now()
);
```

event_type：

```text
draft_created
sent
delivered
opened
clicked
replied
soft_bounced
hard_bounced
blocked
complained
unsubscribed
suppressed
synced_to_fluentcrm
sequence_started
sequence_completed
```

---

## 13.4 email_risk_metrics

```sql
create table email_risk_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,

  stream_type text not null,
  provider text,
  domain text,
  sender_account_id uuid references sender_accounts(id),
  campaign_id uuid references campaigns(id),

  sent_count int default 0,
  hard_bounce_count int default 0,
  soft_bounce_count int default 0,
  complaint_count int default 0,
  unsubscribe_count int default 0,

  hard_bounce_rate numeric default 0,
  complaint_rate numeric default 0,
  unsubscribe_rate numeric default 0,

  risk_status text default 'healthy',

  period_start timestamptz,
  period_end timestamptz,

  created_at timestamptz default now()
);
```

---

## 13.5 deliverability_incidents

```sql
create table deliverability_incidents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,

  incident_type text not null,
  severity text not null,
  stream_type text,
  provider text,
  domain text,
  campaign_id uuid references campaigns(id),

  title text,
  description text,
  evidence jsonb,

  status text default 'open',
  action_taken text,

  created_at timestamptz default now(),
  resolved_at timestamptz
);
```

---

# 14. n8n Workflows

## 14.1 Gmail Bounce Parser

```text
Gmail Search Trigger
query: from:(mailer-daemon OR postmaster) OR subject:("Delivery Status Notification" OR "Undelivered Mail")
↓
Parse failed recipient
↓
Classify bounce
↓
Update Supabase sending_events
↓
If hard bounce → suppression_list
```

---

## 14.2 SES Bounce / Complaint Handler

```text
SES SNS
↓
n8n Webhook
↓
Parse notificationType
↓
If Bounce → classify hard / soft
↓
If Complaint → immediate suppression
↓
Insert sending_events
↓
Update email_risk_metrics
↓
Maybe create deliverability_incident
```

---

## 14.3 FluentCRM Unsubscribe Sync

```text
FluentCRM unsubscribe webhook
↓
n8n
↓
Find Supabase lead/contact
↓
Insert suppression_list
↓
Update consent_status
↓
Stop all future marketing/sales
↓
Insert timeline_event
```

---

## 14.4 Resend Webhook

```text
Resend Event
↓
n8n Webhook
↓
Classify delivered / bounced / complained / opened / clicked
↓
Insert sending_events
↓
Update metrics
```

---

## 14.5 Daily Deliverability Scan

```text
Every morning
↓
Calculate bounce / complaint / unsubscribe rates
↓
Compare with thresholds
↓
If warning → dashboard alert
↓
If danger → pause sender / campaign / stream
↓
Create incident
```

---

# 15. Emergency Stop Rules

系統必須有自動停損。

## 15.1 Stop Recipient

```text
hard_bounce
complaint
unsubscribe
manual opt-out
```

## 15.2 Stop Campaign

```text
complaint_count >= 2
complaint_rate >= 0.1%
hard_bounce_rate >= 3%
unsubscribe_rate > 2%
```

## 15.3 Stop Sender

```text
sender hard_bounce_rate >= 3%
sender complaint_rate >= 0.1%
Google Postmaster spam rate >= 0.1%
```

## 15.4 Stop Stream

```text
SES bounce_rate >= 5%
SES complaint_rate >= 0.1%
Google spam rate >= 0.3%
```

---

# 16. UI / UX 必加

## 16.1 Email Risk Dashboard

顯示：

```text
Cold spam risk
Marketing bounce rate
Marketing complaint rate
Unsubscribe rate
SES health
Gmail sender health
Resend health
Domain authentication status
Open incidents
Suppression growth
```

---

## 16.2 Send Blocker Modal

當使用者想寄高風險信時，顯示：

```text
此封信已被阻擋，原因：
- 缺少具體觀察點
- 收件人曾退訂
- 此 campaign complaint rate 達警戒值
- 此 sender 今日已達上限
```

---

## 16.3 Unsubscribe / Suppression Center

功能：

```text
搜尋 email
查看 reason
查看 source
查看 timestamp
查看 applies_to
手動加入 suppression
匯入 suppression CSV
匯出 suppression
解除 suppression 需二次確認
```

---

## 16.4 Deliverability Incident Center

顯示：

```text
事件類型
嚴重程度
影響 stream
影響 campaign
自動採取動作
待處理建議
```

---

# 17. Legal / Consent Layer

不同地區法規不同，系統應保留彈性。  
不要假設所有地區都能用同一套 cold outreach 規則。

## 17.1 Consent Status

```text
unknown
legitimate_interest
replied
opted_in
form_submitted
customer
unsubscribed
do_not_contact
```

## 17.2 Region Risk

```text
US：CAN-SPAM opt-out and truthful header/subject requirements
EU / UK：需要更嚴格的 lawful basis / legitimate interest 評估
Canada：通常更偏 opt-in
Taiwan：應保留拒收與個資來源紀錄
```

## 17.3 系統策略

```text
若 region = EU/UK/Canada，冷開發需額外 legal warning
若沒有 source_url，不允許生成冷信
若是私人 email，不建議 cold outreach
所有 opt-out 立即同步
```

---

# 18. Cold Email 最終範本規則

## 18.1 必須短

```text
80–150 字
一個主題
一個 CTA
一個觀察點
```

## 18.2 必須像真人

```text
不要滿版 HTML
不要圖片
不要附件
不要 tracking pixel
不要一堆連結
不要誇大承諾
```

## 18.3 必須可拒收

```text
如果不適合，我就不再打擾。
```

---

# 19. 這樣是否面面俱到？

更精準地說：

```text
它不能保證零退信、零投訴、零退訂。
但它已經把退信、投訴、退訂、suppression、sender reputation、provider event、UI 防呆與自動停損納入架構。
```

這才是可商業化的 email architecture。

---

# 20. MVP 必做項目

## Phase 1

```text
Gmail Draft only
Suppression List
Manual opt-out parsing
Basic sender daily limit
Cold Gate
Observation required
```

## Phase 2

```text
FluentCRM + SES
Unsubscribe webhook
SES bounce / complaint SNS
Warm Gate
Email Risk Dashboard basic
```

## Phase 3

```text
Resend transactional
Daily deliverability scan
Emergency stop
Incident center
Domain authentication dashboard
```

## Phase 4

```text
Google Postmaster monitoring
DMARC reports
Advanced provider fallback
Region legal risk rules
```

---

# 21. 最終結論

```text
只說「用 Gmail、FluentCRM、SES、Resend」還不夠。
完整版本必須再加：
Bounce handling
Complaint handling
Unsubscribe handling
Suppression list
Deliverability metrics
Emergency stop
Legal / consent layer
UI 防呆
```

最終 email 架構應該是：

```text
Cold：Gmail draft + manual send + strict cold gate
Warm：FluentCRM + SES + unsubscribe + bounce / complaint handling
Transactional：Resend or SES + separate subdomain
Suppression：所有拒絕、退訂、退信、投訴都回寫 Supabase
Monitoring：每天掃描 bounce / complaint / unsubscribe
Emergency：超過閾值自動暫停 sender / campaign / stream
```

一句話：

```text
不能保證不出事，但可以設計成「一出事就知道、會停止、會記錄、會避免再次寄給同一批人」。
```
