# Ops Inbox — 路線 B 實作工作包（執行手冊）

> **這份檔是給「動手做的 AI / 人」用的純執行版**。設計理由、衝突分析、風險評估住母計畫表 `docs/Ops_Observability_PathB_Plan.md`。
>
> Version: **v1.0 — Day 0 ready**
> Companion to: `docs/Ops_Observability_PathB_Plan.md` v2.0
> Last sync: 2026-04-27

---

## §0 怎麼用這份文件（給操作者，30 秒看完）

**目的**：把整個路線 B 拆成 6 個獨立工作包（B-0 ~ B-5），每個工作包可以**單獨複製貼給任一 AI**（Claude / ChatGPT / Cursor Agent / Gemini / 你自己接力）執行。

**規則**：

1. 每個工作包 **§4–§9** 都是 self-contained，整段複製就能丟給 AI，不需要附母計畫表。
2. 整段複製時，**§1 共用 context** 也要一起貼到工作包**前面**（任何 AI 都需要知道這份）。最簡單：複製 `[§1] + [§4]` 給做 B-0 的 AI；複製 `[§1] + [§5]` 給做 B-1 的 AI，依此類推。
3. 工作包之間的依賴：見 §2。**B-0 必須最先完成**；B-1 之後 B-2 / B-3 / B-5 可三路並行；B-4 要等 B-3 的 UI shell。
4. 每個工作包結尾有「Acceptance」自我驗證清單 → AI 完成後跑一遍才能宣告完成。
5. 動工前先跑一次 §3 Day 0 體檢。

**對 AI 的指令模板（複製這段給每個 AI）**：

```
你的任務：完成下列工作包。

【共用 context】
<貼 §1 整段>

【工作包】
<貼 §4 / §5 / §6 / §7 / §8 / §9 其中一段>

執行原則：
- 嚴格遵守 [Files allowed to create] 與 [Files forbidden to touch] 兩個白/黑名單
- 完成後自己跑 [Acceptance] 清單，每一項打勾後才回報完成
- 遇到歧義先停下來問人，不要自己猜
- 不要動既有檔的功能行為（只能加，不能改現有 export 簽章）
```

---

## §1 共用 Context（每個工作包都假設你讀過）

> 這節是所有 AI 的「世界觀」。30 秒看完，每個工作包都依賴這份。

### 1.1 你正在加工的 codebase 是什麼

- **Repo**: `C:\Users\USER\Work`（git worktree 根）
- **目標 app**: `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`（Next.js 15 App Router）
- **對外網址**: `https://app.aware-wave.com`（既有 admin，路線 B 在內加 `/ops/inbox`）
- **DB**: 自架 Supabase（`https://supabase.aware-wave.com`、Studio `https://studio.aware-wave.com`），重用既有 `lib/supabase-server.ts`（讀 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`）
- **Auth**: 既有「trusted reverse proxy + role header」模型（不是 Clerk、不是 Supabase Auth）。Middleware 路徑見 §1.4。
- **Migration 慣例**: `lobster-factory/packages/db/migrations/00XX_<name>.sql`（已到 0012；新增請用 0013）
- **既有觀測來源**: Sentry / Uptime Kuma / Grafana+Loki+Promtail / Netdata / Slack

### 1.2 30 年不變的鐵律（違反 = 整個方案崩）

```txt
1. Migration 走既有 numbered 慣例：lobster-factory/packages/db/migrations/0013_ops_inbox.sql
   不要用 supabase/migrations/<timestamp>_*.sql 格式。

2. Inbox 程式碼集中在 apps/next-admin/lib/ops-inbox/ 與
   apps/next-admin/app/{ops/inbox, api/webhooks, api/ai}/。
   不要把任何 inbox 型別放 packages/shared（next.config.ts 的
   outputFileTracingRoot 鎖定 next-admin，跨 packages Docker build 會痛）。

3. Supabase env 變數沿用既有 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY。
   絕對不要新增 OPS_INBOX_SUPABASE_*（v1 plan 的設計錯誤已修正）。

4. 一律不裝 OpenAI / Anthropic SDK。Tier 2 ChatGPT/Claude 走「複製到剪貼簿 + 開新分頁」，
   吃使用者既有 Plus/Pro 訂閱。唯一新增依賴 = @google/generative-ai（Gemini Free）。

5. Slack 通知走兩層拓撲：
   - 既有 #alerts-infra（Tier 1 firehose，Netdata/Kuma 直連）— 永遠不動
   - 新建 #ops-incidents（Tier 2 curated，Inbox 專用）
   兩層永不混流。

6. 既有 lib 函式（supabase-server / ops-role / ops-contracts）的 export 簽章不准改，
   只准「加新 export」。
```

### 1.3 命名規約（所有工作包都用同一套）

```txt
DB schema:    ops_incidents（主表），ops_inbox_*（小表，例 ops_inbox_gemini_quota）
URL（API）:   /api/webhooks/{source}, /api/ai/*, /api/ops/inbox/health
URL（UI）:    /ops/inbox, /ops/inbox/[id]
Files:        apps/next-admin/lib/ops-inbox/**
Env vars:     OPS_INBOX_*（所有 inbox 專屬變數一律此前綴；既有變數沿用）
TS types:     apps/next-admin/lib/ops-inbox/types.ts（不放 packages/shared）
Slack:        #ops-incidents（Tier 2，新）；#alerts-infra（Tier 1，既有不動）
```

### 1.4 既有檔的「角色」與「可不可動」

| 檔 | 角色 | 路線 B 動作 |
|---|---|---|
| `apps/next-admin/middleware.ts` | trusted-proxy auth + header 淨化；matcher 目前 = `["/api/ops/:path*"]` | **B-0 改 matcher 加路徑**（純加） |
| `apps/next-admin/tsconfig.json` | TS 設定 | **B-0 加 `paths: { "@/*": ["./*"] }`**（純加） |
| `apps/next-admin/app/layout.tsx` | sidebar | **B-0 加 1 行 sidebar link**（純加） |
| `apps/next-admin/lib/supabase-server.ts` | `getSupabaseReadClient` / `getSupabaseWriteClient` | **不准動**，直接 import |
| `apps/next-admin/lib/ops-role.ts` | `readOpsRole` / `resolveOpsRole` 等 | **B-0 加 2 個 export 函式**（純加，原 export 不動） |
| `apps/next-admin/lib/ops-contracts.ts` | `OpsRole` type 集中地 | **完全不准動** |
| `app/api/ops/*` | 既有 5 個 ops console 路由 | **完全不准動** |
| `app/ops-console/page.tsx` | 既有 ops console UI | **完全不准動**（注意 `/ops-console` ≠ `/ops/inbox`） |
| `lobster-factory/packages/db/migrations/` | 既有 0001–0012 | **B-0 新增 0013_ops_inbox.sql** |

> 改動的檔總共 **3 個既有檔**（middleware / tsconfig / layout）+ **1 個既有檔加 export**（ops-role）+ **1 支新 migration**。其他全部新檔。

### 1.5 SERVICE_REGISTRY（Inbox 用來區分「能跳 Cursor 還是只能開 Web UI」）

```ts
// 三種 dispatch 型態：
//   local-repo         : 有本地 repo，Cursor deeplink 帶 cwd
//   remote-ui-n8n      : 沒本地 code，要開 n8n web UI
//   remote-ui-supabase : 沒本地 code，要開 Supabase Studio

export const SERVICE_REGISTRY = {
  'javascript-nextjs':  { type: 'local-repo',  repo_path: 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin', public_url: 'https://app.aware-wave.com', host: 'sg' },
  'node-api':           { type: 'local-repo',  repo_path: 'lobster-factory/infra/hetzner-phase1-core/apps/node-api',   public_url: 'https://api.aware-wave.com', host: 'sg' },
  'php':                { type: 'local-repo',  repo_path: 'lobster-factory/infra/hetzner-phase1-core/apps/wordpress',  public_url: 'https://aware-wave.com',     host: 'sg' },
  'trigger-workflows':  { type: 'local-repo',  repo_path: 'lobster-factory/packages/workflows',                         public_url: 'https://trigger.aware-wave.com', host: 'eu' },
  'n8n':                { type: 'remote-ui-n8n',      ui_url: 'https://n8n.aware-wave.com/home/workflows', ssh_path: '/root/n8n/',           host: 'eu' },
  'supabase':           { type: 'remote-ui-supabase', ui_url: 'https://studio.aware-wave.com',             ssh_path: '/root/supabase/docker/', host: 'eu' },
} as const;
```

主機對應：

| host code | hostname | IP |
|---|---|---|
| `sg` | `wordpress-ubuntu-4gb-sin-1` | 5.223.93.113 |
| `eu` | `awarewave-eu-hel1-cpx32`    | 204.168.175.41 |

### 1.6 環境變數（B-0 開始就要齊全）

```ps1
# 既有，沿用（不動、不重設）
SUPABASE_URL                       # https://supabase.aware-wave.com
SUPABASE_SERVICE_ROLE_KEY          # 服務角色 key
GEMINI_API_KEY                     # 既有，Tier 1 共用
OPS_PROXY_SHARED_SECRET            # 既有，trusted-proxy auth

# 路線 B 新增（OPS_INBOX_ 前綴，已寫入 driver 的 user-env.ps1）
OPS_INBOX_INGEST_TOKEN             # webhook Bearer 共享密鑰，32 字元隨機
OPS_INBOX_PUBLIC_URL               # https://app.aware-wave.com
OPS_INBOX_SLACK_INCIDENTS_WEBHOOK  # Tier 2 #ops-incidents 專屬 webhook URL
OPS_INBOX_SLACK_INCIDENTS_CHANNEL  # "#ops-incidents"（顯示用）
OPS_INBOX_NOTIFY_ENABLED           # "true" 全域 kill switch
OPS_INBOX_GEMINI_ENABLED           # "true"
OPS_INBOX_GEMINI_DAILY_LIMIT       # "1400"（free tier 1500，留 100 緩衝）
OPS_INBOX_POSTHOG_ENABLED          # "false"（v1 預設關）
```

**永遠不要出現的變數**：`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`OPS_INBOX_SUPABASE_*`、`OPS_INBOX_GEMINI_API_KEY`、`CLERK_*`。

---

## §2 工作包依賴圖

```txt
┌──────────────────────────────────────────────────┐
│  B-0 基礎建設                                     │
│  middleware / tsconfig / layout / ops-role        │
│  + 0013_ops_inbox.sql                              │
│  ⚠️ 序列鎖：必須最先做完才能開其他                 │
└────────────────────┬─────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────┐
│  B-1 資料層 + 第一個 webhook (Sentry)             │
│  types / fingerprint / redact / verify / registry │
│  + sentry normalizer + sentry webhook route       │
└──────┬─────────────────┬─────────────┬───────────┘
       │                 │             │
       ▼                 ▼             ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ B-2         │  │ B-3         │  │ B-5         │
│ 剩 4 webhook│  │ Dashboard UI│  │ Notifier    │
│ (可獨立做)   │  │ (可獨立做)   │  │ (可獨立做)   │
└─────────────┘  └──────┬──────┘  └─────────────┘
                        │
                        ▼
                ┌─────────────┐
                │ B-4         │
                │ AI 三軌      │
                │ (依賴 B-3 UI)│
                └─────────────┘
                        │
                        ▼
                ┌─────────────┐
                │ §10         │
                │ 整合驗收     │
                └─────────────┘
```

**並行機會總結**：

| Phase | 可並行給的 AI 數 | 工作包 |
|---|---|---|
| Phase 1 | 1（序列鎖） | B-0 |
| Phase 2 | 1（序列鎖） | B-1 |
| Phase 3 | **3 個並行** | B-2、B-3、B-5 |
| Phase 4 | 1 | B-4 |
| Phase 5 | 1 | §10 整合驗收 |

> Phase 3 你可以同時開 3 個 chat 給 3 個 AI 做。記得每個 AI 都看不到別人寫的檔，所以 B-2 / B-3 / B-5 之間**不能有檔案重疊**（已在每個工作包的 [Files allowed to create] 清單裡用白名單隔離）。

---

## §3 動工前體檢（Day 0，必做 60 分鐘）

> 任一項沒過 → 不要動 B-0，先把它修好。

### 3.1 環境變數檢查（5 分鐘）

```powershell
# 應印出 10 個變數值都不為空
@(
  'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','GEMINI_API_KEY','OPS_PROXY_SHARED_SECRET',
  'OPS_INBOX_INGEST_TOKEN','OPS_INBOX_PUBLIC_URL','OPS_INBOX_SLACK_INCIDENTS_WEBHOOK',
  'OPS_INBOX_SLACK_INCIDENTS_CHANNEL','OPS_INBOX_NOTIFY_ENABLED','OPS_INBOX_GEMINI_ENABLED'
) | ForEach-Object { "{0}={1}" -f $_, [Environment]::GetEnvironmentVariable($_,'User') }
```

### 3.2 既有系統健康（不要在生病的系統上動工）

- [ ] `next-admin` 本地 `npm run dev` 起得來，`/api-check` 綠燈
- [ ] Supabase awarewave 連得上、service role key 有效（`/rest/v1/` 200，能 GET `workflow_runs`）
- [ ] Slack `#alerts-infra` 過去 24h 內有 Netdata 訊息（驗證 Tier 1 firehose 仍正常）
- [ ] Slack `#ops-incidents` 已建立、webhook smoke test 過（中文不亂碼）

**已知（2026-04-27 體檢結果，不擋 B-0）**：
- `supabase.aware-wave.com` 的 public schema 目前只有 `workflow_runs` 一張表 → lobster-factory 既有 migration `0001–0012` **從未套用**到這座 Supabase。
- 因此 `https://app.aware-wave.com/ops-console` 即使打得開，背後讀的表大多不存在（已知壞 / 未啟用），這**不是路線 B 造成的**，也**不在路線 B 修復範圍**。
- `0013_ops_inbox.sql` 是 self-contained（無 FK 到 0001–0012），可直接上 → 路線 B 不依賴既有 migration。
- 若日後要修復 ops-console，那是另一個獨立工單。

### 3.3 衝突 grep（這 6 個 query 都應該回 0 行）

```powershell
rg --no-heading "ops_incidents|OPS_INBOX_|/api/webhooks|/ops/inbox|lib/ops-inbox" `
   lobster-factory/infra/hetzner-phase1-core/apps/next-admin `
   lobster-factory/packages
# 預期：0 行（OPS_INBOX_ 在 user-env.ps1 設定不算 — 那是環境，不是 codebase）
```

### 3.4 Slack `#ops-incidents` UTF-8 smoke test

```powershell
$body = @{ text = "ops-inbox 中文測試 ✅ — Day 0 ready" } | ConvertTo-Json
$bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
Invoke-RestMethod -Uri $env:OPS_INBOX_SLACK_INCIDENTS_WEBHOOK `
  -Method POST -Body $bytes -ContentType 'application/json; charset=utf-8'
```

→ Slack `#ops-incidents` 看到中文沒亂碼。

### 3.5 一次性手動設定（5 分鐘，B-2 之前必做）

- [ ] Sentry → Settings → Internal Integrations → 加 `Ops Inbox Ingest`，Webhook URL = `https://app.aware-wave.com/api/webhooks/sentry`，Authorization header `Bearer <OPS_INBOX_INGEST_TOKEN>`（**B-1 webhook 上線後再做**）
- [ ] Uptime Kuma 每個 monitor 加 webhook → `https://app.aware-wave.com/api/webhooks/uptime-kuma`（**B-2 完成後做**）
- [ ] Grafana → Alerting → Contact points → webhook 同上（**B-2 完成後做**）
- [ ] Netdata → 每台主機改 `health_alarm_notify.conf` 用 webhook provider 指 `/api/webhooks/netdata`（**B-2 完成後做**）
- [ ] PostHog v1 跳過

---

# 工作包

> 下面 §4 ~ §9 每一節都是獨立工作包。複製整段（含 §1 共用 context）給對應 AI 即可執行。

---

## §4 工作包 B-0：基礎建設

### TL;DR
3 個既有檔小改 + 1 支 migration，把 `/ops/inbox` 與 `/api/ai/*` 路由準備好讓後續工作包能掛東西進來。**這個工作包是序列鎖，必須最先完成**。

### Estimated time
60–90 分鐘（含 migration 跑在 Supabase）

### Prerequisites
§3 Day 0 體檢全綠

### Can run in parallel with
**無**（這個是序列鎖，做完才能開 B-1）

### Files allowed to modify（既有檔，純加不改）

```txt
apps/next-admin/middleware.ts                  # 擴 matcher
apps/next-admin/tsconfig.json                  # 加 paths
apps/next-admin/app/layout.tsx                 # 加 1 行 sidebar link
apps/next-admin/lib/ops-role.ts                # 加 2 個 export 函式
```

### Files allowed to create

```txt
lobster-factory/packages/db/migrations/0013_ops_inbox.sql
```

### Files forbidden to touch

任何**不在上面兩個清單**的既有檔。特別是：
- `apps/next-admin/lib/supabase-server.ts`（不准動）
- `apps/next-admin/lib/ops-contracts.ts`（不准動）
- `app/ops-console/**`（不准動）
- `app/api/ops/**`（不准動）
- 任何 0001–0012 既有 migration（不准動）

### Spec — 4.1 改 `middleware.ts`

只改 `config.matcher`，純加路徑：

```diff
 export const config = {
-  matcher: ["/api/ops/:path*"],
+  matcher: ["/api/ops/:path*", "/ops/:path*", "/api/ai/:path*"],
 };
```

> Middleware 內部邏輯（讀 `OPS_PROXY_SHARED_SECRET` + 淨化 `x-ops-claims-*` headers）**完全不動**。Middleware 只是 sanitize header；實際 role 檢查在 page / route handler 用 `readOpsRole()`。

### Spec — 4.2 改 `tsconfig.json`

加 `compilerOptions.baseUrl` 與 `compilerOptions.paths`：

```jsonc
{
  "compilerOptions": {
    // ...既有設定不動...
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

> 後續所有工作包用 `import { ... } from '@/lib/ops-inbox/...'`。沒這條路徑會炸。

### Spec — 4.3 改 `app/layout.tsx`（sidebar 加 Ops Inbox link）

在 `Overview` section 內，`Ops Console v1` 之後、`API Health` 之前插一行：

```diff
   <div className="sidebar-section">
     <div className="sidebar-section-label">Overview</div>
     <Link href="/" className="sidebar-link">
       <span className="icon">◈</span> Dashboard
     </Link>
     <Link href="/ops-console" className="sidebar-link">
       <span className="icon">▣</span> Ops Console v1
     </Link>
+    <Link href="/ops/inbox" className="sidebar-link">
+      <span className="icon">📥</span> Ops Inbox
+    </Link>
     <Link href="/api-check" className="sidebar-link">
       <span className="icon">⬡</span> API Health
     </Link>
```

> 不要加 `<OpsInboxBadge />`（那個 client component 在 B-3 才寫；B-0 階段先不要 reference 不存在的 component）。

### Spec — 4.4 改 `lib/ops-role.ts`（加 2 個 export）

在檔尾加（不動既有 export）：

```ts
// === 路線 B Ops Inbox 新增 ===
export function canTriggerAiDiagnose(role: OpsRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'operator';
}

export function canModifyIncidentStatus(role: OpsRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'operator';
}
```

> 既有的 `readOpsRole` / `resolveOpsRole` / `canCreateAiImageJob` 等 export **不動**。

### Spec — 4.5 新增 `0013_ops_inbox.sql`

完整 SQL：

```sql
-- lobster-factory/packages/db/migrations/0013_ops_inbox.sql
-- 路線 B：Ops Inbox 主表 + Gemini 配額表

create extension if not exists pgcrypto;

-- ─── 主表：ops_incidents ────────────────────────────────────
create table if not exists ops_incidents (
  id              uuid primary key default gen_random_uuid(),

  source          text not null
                    check (source in ('sentry','uptime_kuma','grafana','netdata','posthog','manual')),
  external_id     text not null,
  fingerprint     text not null,

  signal_type     text not null
                    check (signal_type in ('error','uptime','latency','resource','business','deployment')),
  severity        text not null default 'medium'
                    check (severity in ('low','medium','high','critical')),

  service         text,
  environment     text not null default 'production'
                    check (environment in ('development','staging','production')),

  title           text not null,
  message         text,

  occurrence_count integer not null default 1,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),

  status          text not null default 'open'
                    check (status in ('open','investigating','resolved','ignored')),

  notes           text,
  due_at          timestamptz,
  reopen_count    integer not null default 0,
  resolved_at     timestamptz,
  resolved_by     text,

  ai_provider_suggested text,
  ai_diagnoses    jsonb not null default '[]'::jsonb,
  cursor_deeplink text,
  notification_log jsonb not null default '[]'::jsonb,

  raw             jsonb not null default '{}'::jsonb,
  tags            jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (source, external_id),
  unique (fingerprint, environment)
);

create index if not exists ops_incidents_status_idx       on ops_incidents(status);
create index if not exists ops_incidents_severity_idx     on ops_incidents(severity);
create index if not exists ops_incidents_last_seen_idx    on ops_incidents(last_seen_at desc);
create index if not exists ops_incidents_source_idx       on ops_incidents(source);
create index if not exists ops_incidents_service_idx      on ops_incidents(service);
create index if not exists ops_incidents_open_recent_idx
  on ops_incidents (last_seen_at desc)
  where status in ('open','investigating');

create or replace function ops_incidents_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists ops_incidents_touch_updated on ops_incidents;
create trigger ops_incidents_touch_updated
before update on ops_incidents
for each row execute function ops_incidents_touch_updated_at();

-- ─── 配額表：ops_inbox_gemini_quota ─────────────────────────
create table if not exists ops_inbox_gemini_quota (
  date           date primary key,
  count          integer not null default 0,
  last_call_at   timestamptz,
  last_error     text,
  updated_at     timestamptz not null default now()
);

create or replace function ops_inbox_gemini_quota_increment(p_max integer)
returns table (allowed boolean, current_count integer)
language plpgsql as $$
declare
  v_today date := (now() at time zone 'UTC')::date;
  v_count integer;
begin
  insert into ops_inbox_gemini_quota (date, count)
  values (v_today, 0)
  on conflict (date) do nothing;

  update ops_inbox_gemini_quota
     set count = count + 1,
         last_call_at = now(),
         updated_at = now()
   where date = v_today
     and count < p_max
  returning count into v_count;

  if v_count is null then
    select count into v_count from ops_inbox_gemini_quota where date = v_today;
    return query select false, v_count;
  end if;
  return query select true, v_count;
end;
$$;

-- ─── RLS：service role bypass，anon 全擋 ─────────────────────
alter table ops_incidents enable row level security;
alter table ops_inbox_gemini_quota enable row level security;
-- 故意不寫 policy（next-admin 用 service role 讀寫，無 RLS policy 等於 anon 全擋 + service role bypass）
```

跑 migration（用既有 supabase CLI 或 Studio SQL editor）。

### Acceptance（B-0 完成定義）

- [ ] `apps/next-admin` 跑 `npm run build` 通過
- [ ] `npm run dev` 起得來，`http://localhost:3000/ops-console` 仍正常打開（既有功能不壞）
- [ ] `http://localhost:3000/ops/inbox` 回 **404**（route 還沒建，正確）
- [ ] `http://localhost:3000/api-check` 仍綠燈
- [ ] `git diff apps/next-admin/lib/supabase-server.ts` → **空**（沒被動）
- [ ] `git diff apps/next-admin/lib/ops-contracts.ts` → **空**
- [ ] `apps/next-admin/lib/ops-role.ts` 既有 export 簽章未變（grep `export function readOpsRole`、`export function resolveOpsRole` 仍存在）
- [ ] Supabase awarewave：`select count(*) from ops_incidents` 回 0（表存在）
- [ ] Supabase awarewave：`select count(*) from ops_inbox_gemini_quota` 回 0
- [ ] Supabase awarewave：`select * from ops_inbox_gemini_quota_increment(1400)` 不報錯
- [ ] `git log -1` 顯示這個 commit 只動 4 個檔 + 加 1 支 migration（diff < 200 行）

### Out of scope（B-0 不做）

- ❌ 不寫任何 webhook route
- ❌ 不寫任何 lib/ops-inbox/* 檔案
- ❌ 不寫任何 UI（連 `OpsInboxBadge` 都還沒寫）
- ❌ 不裝 `@google/generative-ai`（B-4 才裝）

### Hand-off

完成後，可以開 B-1。把 commit hash 跟「Acceptance 全綠」回報給人即可。

---

## §5 工作包 B-1：資料層 + Sentry webhook（第一個 webhook 跑通）

### TL;DR
建立所有共用 lib（types / fingerprint / redact / verify / registry / transition），寫 Sentry normalizer + webhook route 跑通端到端：Sentry test event 進來 → 落表 → 去重正常。

### Estimated time
3–4 小時

### Prerequisites
B-0 完成（Acceptance 全綠）

### Can run in parallel with
**無**（B-1 建立所有 normalizer/webhook 共用的 lib，B-2/B-3/B-5 都要 import 它）

### Files allowed to create

```txt
apps/next-admin/lib/ops-inbox/types.ts
apps/next-admin/lib/ops-inbox/verifyIngestToken.ts
apps/next-admin/lib/ops-inbox/redactSecrets.ts
apps/next-admin/lib/ops-inbox/fingerprint.ts
apps/next-admin/lib/ops-inbox/transition.ts
apps/next-admin/lib/ops-inbox/registry/services.ts
apps/next-admin/lib/ops-inbox/registry/sourceMapping.ts
apps/next-admin/lib/ops-inbox/normalize/sentry.ts
apps/next-admin/app/api/webhooks/sentry/route.ts

# vitest（路徑請對齊 next-admin 既有測試慣例）
apps/next-admin/lib/ops-inbox/__tests__/fingerprint.test.ts
apps/next-admin/lib/ops-inbox/__tests__/redactSecrets.test.ts
apps/next-admin/lib/ops-inbox/normalize/__tests__/sentry.test.ts
```

### Files forbidden to touch

- B-0 改過的 4 個既有檔（已收斂，不要再動）
- `lib/ops-inbox/notify/*`（B-5 的）
- `lib/ops-inbox/ai/*`（B-4 的）
- `lib/ops-inbox/dispatch/*`（B-4 的）
- 其他 normalizer / webhook route（B-2 的）
- UI（B-3 的）

### Spec — 5.1 `types.ts`

```ts
// apps/next-admin/lib/ops-inbox/types.ts

export type IncidentSource =
  | 'sentry' | 'uptime_kuma' | 'grafana' | 'netdata' | 'posthog' | 'manual';

export type IncidentSignalType =
  | 'error' | 'uptime' | 'latency' | 'resource' | 'business' | 'deployment';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'ignored';

export type IncidentEnvironment = 'development' | 'staging' | 'production';

export interface AiDiagnosis {
  provider: 'gemini' | 'chatgpt' | 'claude' | 'cursor' | 'other';
  model?: string;
  role: 'auto-classify' | 'diagnosis' | 'rca' | 'manual-paste';
  summary: string;
  tokens?: number;
  cost_usd?: number;
  created_at: string;
  created_by?: string;
}

export type NotificationStatus = 'sent' | 'failed' | 'throttled';
export type NotificationRule =
  | 'new_incident_first_occurrence'
  | 'severity_escalation'
  | 'reopen'
  | 'critical_immediate';

export interface NotificationLogEntry {
  channel: string;
  rule: NotificationRule;
  status: NotificationStatus;
  ts: string;
  message_ts?: string;
  reason?: string;
  error?: string;
}

export interface Incident {
  id: string;
  source: IncidentSource;
  external_id: string;
  fingerprint: string;
  signal_type: IncidentSignalType;
  severity: IncidentSeverity;

  service: string | null;
  environment: IncidentEnvironment;

  title: string;
  message: string | null;

  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;

  status: IncidentStatus;
  notes: string | null;
  due_at: string | null;
  reopen_count: number;
  resolved_at: string | null;
  resolved_by: string | null;

  ai_provider_suggested: string | null;
  ai_diagnoses: AiDiagnosis[];
  cursor_deeplink: string | null;

  notification_log: NotificationLogEntry[];

  raw: Record<string, unknown>;
  tags: Record<string, unknown>;

  created_at: string;
  updated_at: string;
}

export type IncidentDraft = Pick<
  Incident,
  | 'source' | 'external_id' | 'fingerprint' | 'signal_type' | 'severity'
  | 'service' | 'environment' | 'title' | 'message' | 'raw' | 'tags'
>;

// 舊 incident 的子集，用於 transition diff
export interface IncidentSnapshot {
  id: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  occurrence_count: number;
  reopen_count: number;
}

export type IncidentTransition =
  | { kind: 'new' }
  | { kind: 'duplicate'; prevSeverity: IncidentSeverity; prevStatus: IncidentStatus }
  | { kind: 'severity_escalated'; prevSeverity: IncidentSeverity; newSeverity: IncidentSeverity }
  | { kind: 'reopened'; prevStatus: IncidentStatus };
```

### Spec — 5.2 `verifyIngestToken.ts`

```ts
// apps/next-admin/lib/ops-inbox/verifyIngestToken.ts

export function verifyIngestToken(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const expected = process.env.OPS_INBOX_INGEST_TOKEN;
  if (!expected) return false;          // 未設 env → 一律拒
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  // 用常數時間比對避免 timing attack（雖然 webhook 場景影響不大，但寫好習慣）
  return timingSafeEqual(m[1], expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

### Spec — 5.3 `redactSecrets.ts`

```ts
// apps/next-admin/lib/ops-inbox/redactSecrets.ts

const SECRET_KEY_PATTERNS = [
  /password/i, /passwd/i, /secret/i, /token/i, /api[_-]?key/i,
  /auth(orization)?/i, /cookie/i, /session/i, /credential/i, /bearer/i,
  /^x-.*-key$/i, /private[_-]?key/i,
];

export function redactSecrets<T>(input: T): T {
  return walk(input) as T;
}

function walk(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(walk);
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERNS.some((p) => p.test(k))) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = walk(val);
      }
    }
    return out;
  }
  return v;
}
```

### Spec — 5.4 `fingerprint.ts`

```ts
// apps/next-admin/lib/ops-inbox/fingerprint.ts
import { createHash } from 'node:crypto';
import type { IncidentSource, IncidentSignalType } from './types';

export function computeFingerprint(args: {
  source: IncidentSource;
  service: string | null;
  signal_type: IncidentSignalType;
  title: string;
  raw: any;
}): string {
  const sourceFp = sourceSpecificFingerprint(args);
  if (sourceFp) return sourceFp;

  const normTitle = args.title
    .replace(/\b[0-9a-f]{8,}\b/gi, '<hex>')
    .replace(/\b\d{2,}\b/g, '<n>')
    .replace(/['"`].*?['"`]/g, '<str>')
    .toLowerCase()
    .trim();
  return sha256(`${args.source}|${args.service ?? '_'}|${args.signal_type}|${normTitle}`);
}

function sourceSpecificFingerprint(args: { source: IncidentSource; raw: any }): string | null {
  switch (args.source) {
    case 'sentry':
      return args.raw?.data?.issue?.id
        ? sha256(`sentry:${args.raw.data.issue.id}`)
        : null;
    case 'grafana':
      return args.raw?.alerts?.[0]?.fingerprint
        ? sha256(`grafana:${args.raw.alerts[0].fingerprint}`)
        : null;
    case 'uptime_kuma':
      return args.raw?.monitor?.id
        ? sha256(`kuma:${args.raw.monitor.id}:${args.raw.monitor?.type ?? 'http'}`)
        : null;
    case 'netdata':
      return args.raw?.host && args.raw?.alarm
        ? sha256(`netdata:${args.raw.host}:${args.raw.alarm}`)
        : null;
    case 'posthog':
      return args.raw?.alert_id
        ? sha256(`posthog:${args.raw.alert_id}`)
        : null;
    default:
      return null;
  }
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
```

### Spec — 5.5 `transition.ts`

```ts
// apps/next-admin/lib/ops-inbox/transition.ts
import type {
  IncidentDraft, IncidentSeverity, IncidentSnapshot, IncidentTransition,
} from './types';

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  low: 0, medium: 1, high: 2, critical: 3,
};

export function maxSeverity(
  a: IncidentSeverity | undefined,
  b: IncidentSeverity,
): IncidentSeverity {
  if (!a) return b;
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export function computeTransition(
  existing: IncidentSnapshot | null,
  draft: IncidentDraft,
): IncidentTransition {
  if (!existing) return { kind: 'new' };

  if (existing.status === 'resolved' || existing.status === 'ignored') {
    return { kind: 'reopened', prevStatus: existing.status };
  }

  if (SEVERITY_RANK[draft.severity] > SEVERITY_RANK[existing.severity]) {
    return {
      kind: 'severity_escalated',
      prevSeverity: existing.severity,
      newSeverity: draft.severity,
    };
  }

  return {
    kind: 'duplicate',
    prevSeverity: existing.severity,
    prevStatus: existing.status,
  };
}
```

### Spec — 5.6 `registry/services.ts`

把 §1.5 的 `SERVICE_REGISTRY` 完整寫進去。完整 ts as const，加 `KnownService` / `KNOWN_SERVICES` export：

```ts
// apps/next-admin/lib/ops-inbox/registry/services.ts

export type ServiceTarget =
  | { type: 'local-repo'; repo_path: string; public_url?: string; host: 'sg' | 'eu' }
  | { type: 'remote-ui-n8n'; ui_url: string; ssh_path: string; host: 'eu' }
  | { type: 'remote-ui-supabase'; ui_url: string; ssh_path: string; host: 'eu' };

export const SERVICE_REGISTRY = {
  'javascript-nextjs': {
    type: 'local-repo',
    repo_path: 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin',
    public_url: 'https://app.aware-wave.com',
    host: 'sg',
  },
  'node-api': {
    type: 'local-repo',
    repo_path: 'lobster-factory/infra/hetzner-phase1-core/apps/node-api',
    public_url: 'https://api.aware-wave.com',
    host: 'sg',
  },
  'php': {
    type: 'local-repo',
    repo_path: 'lobster-factory/infra/hetzner-phase1-core/apps/wordpress',
    public_url: 'https://aware-wave.com',
    host: 'sg',
  },
  'trigger-workflows': {
    type: 'local-repo',
    repo_path: 'lobster-factory/packages/workflows',
    public_url: 'https://trigger.aware-wave.com',
    host: 'eu',
  },
  'n8n': {
    type: 'remote-ui-n8n',
    ui_url: 'https://n8n.aware-wave.com/home/workflows',
    ssh_path: '/root/n8n/',
    host: 'eu',
  },
  'supabase': {
    type: 'remote-ui-supabase',
    ui_url: 'https://studio.aware-wave.com',
    ssh_path: '/root/supabase/docker/',
    host: 'eu',
  },
} as const satisfies Record<string, ServiceTarget>;

export type KnownService = keyof typeof SERVICE_REGISTRY;
export const KNOWN_SERVICES = Object.keys(SERVICE_REGISTRY) as KnownService[];

export function getService(key: string | null): ServiceTarget | null {
  if (!key) return null;
  return (SERVICE_REGISTRY as Record<string, ServiceTarget>)[key] ?? null;
}
```

### Spec — 5.7 `registry/sourceMapping.ts`

```ts
// apps/next-admin/lib/ops-inbox/registry/sourceMapping.ts
import type { KnownService } from './services';

// Sentry project_slug → SERVICE_REGISTRY key
export function sentryProjectSlugToService(slug: string | undefined): KnownService | null {
  if (!slug) return null;
  const map: Record<string, KnownService> = {
    'javascript-nextjs': 'javascript-nextjs',
    'node-api': 'node-api',
    'php': 'php',
    'n8n': 'n8n',
    'supabase': 'supabase',
    'trigger-workflows': 'trigger-workflows',
  };
  return map[slug] ?? null;
}

// Uptime Kuma hostname → SERVICE_REGISTRY key
export function kumaHostnameToService(hostname: string | undefined): KnownService | null {
  if (!hostname) return null;
  const map: Record<string, KnownService> = {
    'aware-wave.com': 'php',
    'app.aware-wave.com': 'javascript-nextjs',
    'api.aware-wave.com': 'node-api',
    'n8n.aware-wave.com': 'n8n',
    'studio.aware-wave.com': 'supabase',
    'trigger.aware-wave.com': 'trigger-workflows',
  };
  return map[hostname.toLowerCase()] ?? null;
}

// Netdata host → 不對應到 service，回 host 標籤
export function netdataHostToTag(host: string | undefined): { host: 'sg' | 'eu' | null } {
  if (!host) return { host: null };
  if (host.includes('sin') || host.includes('wordpress-ubuntu')) return { host: 'sg' };
  if (host.includes('hel') || host.includes('awarewave-eu')) return { host: 'eu' };
  return { host: null };
}
```

### Spec — 5.8 `normalize/sentry.ts`

```ts
// apps/next-admin/lib/ops-inbox/normalize/sentry.ts
import type { IncidentDraft, IncidentSeverity, IncidentEnvironment } from '../types';
import { sentryProjectSlugToService } from '../registry/sourceMapping';

export function normalizeSentry(raw: any): IncidentDraft {
  const issue = raw?.data?.issue ?? {};
  const event = raw?.data?.event ?? raw?.event ?? {};
  const projectSlug: string | undefined = raw?.data?.project_slug ?? raw?.project_slug;

  const level: string = event.level ?? issue.level ?? 'error';
  const severity: IncidentSeverity =
    level === 'fatal'   ? 'critical' :
    level === 'error'   ? 'high'     :
    level === 'warning' ? 'medium'   :
                          'low';

  const envRaw: string = event.environment ?? raw?.data?.environment ?? 'production';
  const environment: IncidentEnvironment =
    envRaw === 'staging'     ? 'staging'     :
    envRaw === 'development' ? 'development' :
                               'production';

  const title: string = issue.title ?? event.title ?? raw?.message ?? 'Sentry event';
  const message: string | null = event.message ?? issue.culprit ?? null;
  const externalId: string = String(issue.id ?? event.event_id ?? Date.now());

  return {
    source: 'sentry',
    external_id: externalId,
    fingerprint: '', // 由 webhook handler 統一呼叫 computeFingerprint 填
    signal_type: 'error',
    severity,
    service: sentryProjectSlugToService(projectSlug),
    environment,
    title,
    message,
    raw,
    tags: { sentry_level: level, project_slug: projectSlug ?? null },
  };
}
```

### Spec — 5.9 `app/api/webhooks/sentry/route.ts`（兩段式 upsert）

```ts
// apps/next-admin/app/api/webhooks/sentry/route.ts
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseWriteClient } from '@/lib/supabase-server';
import { verifyIngestToken } from '@/lib/ops-inbox/verifyIngestToken';
import { redactSecrets } from '@/lib/ops-inbox/redactSecrets';
import { computeFingerprint } from '@/lib/ops-inbox/fingerprint';
import { computeTransition, maxSeverity } from '@/lib/ops-inbox/transition';
import { normalizeSentry } from '@/lib/ops-inbox/normalize/sentry';
import type { IncidentSnapshot } from '@/lib/ops-inbox/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!verifyIngestToken(req)) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new NextResponse('invalid json', { status: 400 });
  }

  const raw = redactSecrets(payload);
  const draft = normalizeSentry(raw);
  draft.fingerprint = computeFingerprint({
    source: draft.source,
    service: draft.service,
    signal_type: draft.signal_type,
    title: draft.title,
    raw,
  });

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return new NextResponse('db unavailable', { status: 503 });
  }

  const { data: existing } = await supabase
    .from('ops_incidents')
    .select('id, severity, status, occurrence_count, reopen_count')
    .eq('fingerprint', draft.fingerprint)
    .eq('environment', draft.environment)
    .maybeSingle<IncidentSnapshot>();

  const transition = computeTransition(existing ?? null, draft);
  const isReopen = transition.kind === 'reopened';

  const { data: upserted, error } = await supabase
    .from('ops_incidents')
    .upsert(
      {
        ...draft,
        last_seen_at: new Date().toISOString(),
        occurrence_count: (existing?.occurrence_count ?? 0) + 1,
        reopen_count: (existing?.reopen_count ?? 0) + (isReopen ? 1 : 0),
        ...(isReopen
          ? { status: 'open' as const, resolved_at: null, resolved_by: null }
          : {}),
        severity: maxSeverity(existing?.severity, draft.severity),
      },
      { onConflict: 'fingerprint,environment' },
    )
    .select('*')
    .single();

  if (error) {
    Sentry.captureException(error, { tags: { route: 'ops-inbox-webhook-sentry' } });
    return new NextResponse('db write failed', { status: 500 });
  }

  // fire-and-forget side effects（B-4 / B-5 完成後會接上）
  // 目前 B-1 階段先空轉，留 hook 點：
  void (async () => {
    try {
      // TODO B-4: triggerAutoClassify(upserted.id)
      // TODO B-5: dispatchNotifications({ incident: upserted, transition })
    } catch (e) {
      Sentry.captureException(e);
    }
  })();

  return NextResponse.json({
    incident_id: upserted.id,
    transition: transition.kind,
    occurrence_count: upserted.occurrence_count,
  });
}
```

### Spec — 5.10 vitest（驗證去重 / redact / normalize）

`__tests__/redactSecrets.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { redactSecrets } from '../redactSecrets';

describe('redactSecrets', () => {
  it('redacts password / token / cookie / Authorization keys', () => {
    const input = {
      user: 'alice',
      password: 'p@ss',
      authorization: 'Bearer xxx',
      headers: { Cookie: 'sid=abc', 'x-api-key': 'k' },
      nested: [{ secret: 's', ok: 1 }],
    };
    const out = redactSecrets(input) as any;
    expect(out.password).toBe('[REDACTED]');
    expect(out.authorization).toBe('[REDACTED]');
    expect(out.headers.Cookie).toBe('[REDACTED]');
    expect(out.headers['x-api-key']).toBe('[REDACTED]');
    expect(out.nested[0].secret).toBe('[REDACTED]');
    expect(out.nested[0].ok).toBe(1);
    expect(out.user).toBe('alice');
  });
});
```

`__tests__/fingerprint.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { computeFingerprint } from '../fingerprint';

describe('computeFingerprint', () => {
  it('Sentry uses issue.id (stable across deploys)', () => {
    const a = computeFingerprint({
      source: 'sentry', service: 'node-api', signal_type: 'error',
      title: 'TypeError at line 42 in cart.tsx',
      raw: { data: { issue: { id: '5566' } } },
    });
    const b = computeFingerprint({
      source: 'sentry', service: 'node-api', signal_type: 'error',
      title: 'TypeError at line 99 in cart.tsx (different line)',
      raw: { data: { issue: { id: '5566' } } },
    });
    expect(a).toBe(b);
  });

  it('falls back to normalized title hash if no source-specific id', () => {
    const a = computeFingerprint({
      source: 'manual', service: null, signal_type: 'error',
      title: 'Something at 5566', raw: {},
    });
    const b = computeFingerprint({
      source: 'manual', service: null, signal_type: 'error',
      title: 'Something at 9999', raw: {},
    });
    expect(a).toBe(b); // 行號被正規化成 <n>
  });
});
```

`normalize/__tests__/sentry.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { normalizeSentry } from '../sentry';

const samplePayload = {
  data: {
    issue: { id: '5566', title: "TypeError: Cannot read 'price' of undefined", level: 'error', culprit: 'app/cart.tsx' },
    event: { event_id: 'aaaa', level: 'error', environment: 'production', message: 'TypeError ...' },
    project_slug: 'javascript-nextjs',
  },
};

describe('normalizeSentry', () => {
  it('maps to IncidentDraft', () => {
    const d = normalizeSentry(samplePayload);
    expect(d.source).toBe('sentry');
    expect(d.external_id).toBe('5566');
    expect(d.signal_type).toBe('error');
    expect(d.severity).toBe('high');
    expect(d.service).toBe('javascript-nextjs');
    expect(d.environment).toBe('production');
    expect(d.title).toContain('TypeError');
  });
});
```

### Acceptance（B-1 完成定義）

- [ ] `npm run build` 通過
- [ ] `npm run test` 三個 vitest 都過（如果 next-admin 沒接 vitest，先跳過 test 跑 `tsc --noEmit` 驗證）
- [ ] 本機 `curl` 模擬 Sentry payload 打 `/api/webhooks/sentry`：
  ```bash
  curl -X POST http://localhost:3000/api/webhooks/sentry \
    -H "Authorization: Bearer $env:OPS_INBOX_INGEST_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"data":{"issue":{"id":"test-001","title":"test error","level":"error"},"event":{"event_id":"e1","level":"error","environment":"development"},"project_slug":"node-api"}}'
  ```
  應回 `{"incident_id":"...","transition":"new","occurrence_count":1}`
- [ ] 同一 payload 連送 5 次：DB `ops_incidents` 仍只 1 筆，`occurrence_count = 5`，`transition` 從 `new` → `duplicate`
- [ ] 不帶 `Authorization` header → 401
- [ ] 帶錯 token → 401
- [ ] DB 那筆 row 的 `raw` 欄位不含原始密碼/token（如 payload 帶就被 redact 成 `[REDACTED]`）
- [ ] `git diff lib/supabase-server.ts` 仍空（重用既有 client，沒改）
- [ ] B-0 改的 4 個檔沒被再動

### Out of scope（B-1 不做）

- ❌ 其他 4 個 webhook（B-2 做）
- ❌ Slack 通知（B-5 做；webhook handler 內留 TODO 註解即可）
- ❌ Gemini auto-classify（B-4 做；同上留 TODO）
- ❌ UI 任何頁面（B-3 做）

### Hand-off

完成後 B-2 / B-3 / B-5 三路可並行。

---

## §6 工作包 B-2：剩 4 個 webhook（Kuma / Grafana / Netdata / PostHog）

### TL;DR
複製 B-1 的 Sentry pattern，寫 4 個 normalizer + 4 個 webhook route。沒有新概念，純擴張。

### Estimated time
3–4 小時

### Prerequisites
B-1 完成（types / fingerprint / redact / verify / registry / transition / Sentry route 都已存在）

### Can run in parallel with
**B-3、B-5**（不同檔案，無交集）

### Files allowed to create

```txt
apps/next-admin/lib/ops-inbox/normalize/uptime-kuma.ts
apps/next-admin/lib/ops-inbox/normalize/grafana.ts
apps/next-admin/lib/ops-inbox/normalize/netdata.ts
apps/next-admin/lib/ops-inbox/normalize/posthog.ts

apps/next-admin/app/api/webhooks/uptime-kuma/route.ts
apps/next-admin/app/api/webhooks/grafana/route.ts
apps/next-admin/app/api/webhooks/netdata/route.ts
apps/next-admin/app/api/webhooks/posthog/route.ts

# vitest（4 支）
apps/next-admin/lib/ops-inbox/normalize/__tests__/uptime-kuma.test.ts
apps/next-admin/lib/ops-inbox/normalize/__tests__/grafana.test.ts
apps/next-admin/lib/ops-inbox/normalize/__tests__/netdata.test.ts
apps/next-admin/lib/ops-inbox/normalize/__tests__/posthog.test.ts
```

### Files forbidden to touch

- B-0/B-1 的所有檔（**不要**動 `lib/ops-inbox/types.ts` / `fingerprint.ts` / `transition.ts` / `verifyIngestToken.ts` / `registry/*` / Sentry normalizer / Sentry route）
- `lib/ops-inbox/notify/*`（B-5 的）
- `lib/ops-inbox/ai/*`、`lib/ops-inbox/dispatch/*`（B-4 的）
- 任何 UI 檔

### Spec — 共用模板（4 個 webhook route 都長一樣，只差 normalizer 名）

```ts
// apps/next-admin/app/api/webhooks/<source>/route.ts
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseWriteClient } from '@/lib/supabase-server';
import { verifyIngestToken } from '@/lib/ops-inbox/verifyIngestToken';
import { redactSecrets } from '@/lib/ops-inbox/redactSecrets';
import { computeFingerprint } from '@/lib/ops-inbox/fingerprint';
import { computeTransition, maxSeverity } from '@/lib/ops-inbox/transition';
import { normalize<Source> } from '@/lib/ops-inbox/normalize/<source>';
import type { IncidentSnapshot } from '@/lib/ops-inbox/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!verifyIngestToken(req)) return new NextResponse('unauthorized', { status: 401 });

  // PostHog 專屬：feature flag
  if ('<source>' === 'posthog' && process.env.OPS_INBOX_POSTHOG_ENABLED !== 'true') {
    return new NextResponse('posthog ingestion disabled', { status: 503 });
  }

  let payload: any;
  try { payload = await req.json(); } catch { return new NextResponse('invalid json', { status: 400 }); }

  const raw = redactSecrets(payload);
  const draft = normalize<Source>(raw);

  // Netdata 專屬：CLEAR 不入庫
  if ('<source>' === 'netdata' && draft.severity === 'low' && (raw as any)?.status === 'CLEAR') {
    return NextResponse.json({ skipped: 'netdata_clear' });
  }

  draft.fingerprint = computeFingerprint({
    source: draft.source, service: draft.service,
    signal_type: draft.signal_type, title: draft.title, raw,
  });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return new NextResponse('db unavailable', { status: 503 });

  const { data: existing } = await supabase
    .from('ops_incidents')
    .select('id, severity, status, occurrence_count, reopen_count')
    .eq('fingerprint', draft.fingerprint)
    .eq('environment', draft.environment)
    .maybeSingle<IncidentSnapshot>();

  const transition = computeTransition(existing ?? null, draft);
  const isReopen = transition.kind === 'reopened';

  const { data: upserted, error } = await supabase
    .from('ops_incidents')
    .upsert(
      {
        ...draft,
        last_seen_at: new Date().toISOString(),
        occurrence_count: (existing?.occurrence_count ?? 0) + 1,
        reopen_count: (existing?.reopen_count ?? 0) + (isReopen ? 1 : 0),
        ...(isReopen ? { status: 'open' as const, resolved_at: null, resolved_by: null } : {}),
        severity: maxSeverity(existing?.severity, draft.severity),
      },
      { onConflict: 'fingerprint,environment' },
    )
    .select('*')
    .single();

  if (error) {
    Sentry.captureException(error, { tags: { route: 'ops-inbox-webhook-<source>' } });
    return new NextResponse('db write failed', { status: 500 });
  }

  void (async () => {
    try {
      // TODO B-4 / B-5 hook 點
    } catch (e) { Sentry.captureException(e); }
  })();

  return NextResponse.json({
    incident_id: upserted.id,
    transition: transition.kind,
    occurrence_count: upserted.occurrence_count,
  });
}
```

> AI 注意：每個 route 把 `<Source>` / `<source>` 替成對應名稱（uptime-kuma → `normalizeUptimeKuma` / `'uptime_kuma'`），其餘字面照抄。

### Spec — 6.1 `normalize/uptime-kuma.ts`

Kuma webhook payload 範例（你需要的欄位）：

```json
{
  "heartbeat": { "status": 0, "time": "2026-04-27 12:00:00", "msg": "timeout" },
  "monitor":   { "id": 7, "name": "scenery-mongolia.com", "type": "http",
                 "url": "https://scenery-mongolia.com",
                 "tags": [{"name":"service","value":"php"},{"name":"env","value":"production"}],
                 "hostname": "scenery-mongolia.com" }
}
```

```ts
// apps/next-admin/lib/ops-inbox/normalize/uptime-kuma.ts
import type { IncidentDraft, IncidentSeverity, IncidentEnvironment } from '../types';
import { kumaHostnameToService } from '../registry/sourceMapping';

const KUMA_STATUS = { DOWN: 0, UP: 1, PENDING: 2, MAINTENANCE: 3 } as const;

export function normalizeUptimeKuma(raw: any): IncidentDraft {
  const monitor = raw?.monitor ?? {};
  const heartbeat = raw?.heartbeat ?? {};
  const tags: Array<{ name: string; value: string }> = monitor.tags ?? [];

  const isDown = heartbeat.status === KUMA_STATUS.DOWN;
  const certExpiringSoon = /cert.*expire/i.test(heartbeat.msg ?? '');

  const envTag = tags.find((t) => t.name === 'env')?.value;
  const environment: IncidentEnvironment =
    envTag === 'staging'     ? 'staging'     :
    envTag === 'development' ? 'development' :
    /staging\./i.test(monitor.hostname ?? '') ? 'staging' :
                               'production';

  const severity: IncidentSeverity = certExpiringSoon
    ? 'low'
    : isDown
      ? (environment === 'production' ? 'critical' : 'medium')
      : 'low';

  const serviceTag = tags.find((t) => t.name === 'service')?.value;
  const service = (serviceTag as any) ?? kumaHostnameToService(monitor.hostname);

  const title = isDown
    ? `Uptime: ${monitor.name} is DOWN`
    : `Uptime: ${monitor.name} ${heartbeat.msg ?? 'event'}`;

  return {
    source: 'uptime_kuma',
    external_id: String(monitor.id ?? Date.now()),
    fingerprint: '',
    signal_type: 'uptime',
    severity,
    service,
    environment,
    title,
    message: heartbeat.msg ?? null,
    raw,
    tags: { kuma_type: monitor.type, kuma_url: monitor.url, hostname: monitor.hostname },
  };
}
```

### Spec — 6.2 `normalize/grafana.ts`

Grafana Alertmanager-style payload：

```json
{
  "status": "firing",
  "alerts": [{
    "status": "firing",
    "fingerprint": "abc123def456",
    "labels": { "alertname": "HighErrorRate", "severity": "critical", "service": "node-api", "environment": "production" },
    "annotations": { "summary": "5xx > 1%/min", "description": "rate exceeded" },
    "startsAt": "2026-04-27T12:00:00Z"
  }]
}
```

```ts
// apps/next-admin/lib/ops-inbox/normalize/grafana.ts
import type { IncidentDraft, IncidentSeverity, IncidentSignalType, IncidentEnvironment } from '../types';

export function normalizeGrafana(raw: any): IncidentDraft {
  const alert = raw?.alerts?.[0] ?? {};
  const labels: Record<string, string> = alert.labels ?? {};
  const annotations: Record<string, string> = alert.annotations ?? {};

  const severity: IncidentSeverity =
    (labels.severity === 'critical' || labels.severity === 'high' ||
     labels.severity === 'medium' || labels.severity === 'low')
      ? labels.severity as IncidentSeverity
      : 'medium';

  const env = labels.environment;
  const environment: IncidentEnvironment =
    env === 'staging' ? 'staging' : env === 'development' ? 'development' : 'production';

  // 推 signal_type
  const ann = (annotations.summary ?? annotations.description ?? '').toLowerCase();
  const signal_type: IncidentSignalType =
    /latency|p95|p99/.test(ann) ? 'latency' :
    /cpu|mem|disk|load/.test(ann) ? 'resource' :
    /uptime|down|reachab/.test(ann) ? 'uptime' :
    /deploy|rollout/.test(ann) ? 'deployment' :
    'error';

  const title = annotations.summary ?? labels.alertname ?? 'Grafana alert';

  return {
    source: 'grafana',
    external_id: alert.fingerprint ?? `${labels.alertname}:${alert.startsAt}`,
    fingerprint: '',
    signal_type,
    severity,
    service: labels.service ?? null,
    environment,
    title,
    message: annotations.description ?? null,
    raw,
    tags: { ...labels },
  };
}
```

### Spec — 6.3 `normalize/netdata.ts`

Netdata webhook payload（注意：Netdata 預設沒有「webhook」provider，要設定 `health_alarm_notify.conf` 的 `custom` provider 或使用相容 Slack-style 的 endpoint。下面 normalizer 假設用既有 Netdata `host`/`alarm`/`status` 欄位的 JSON。實作時若發現 payload 結構不同，請先把 `raw` 寫進 DB，由人手工調整 normalizer）：

```json
{
  "host": "wordpress-ubuntu-4gb-sin-1",
  "alarm": "10min_cpu_usage",
  "status": "CRITICAL",
  "value_string": "98%",
  "info": "CPU utilization in last 10min"
}
```

```ts
// apps/next-admin/lib/ops-inbox/normalize/netdata.ts
import type { IncidentDraft, IncidentSeverity } from '../types';
import { netdataHostToTag } from '../registry/sourceMapping';

export function normalizeNetdata(raw: any): IncidentDraft {
  const status: string = (raw?.status ?? 'UNKNOWN').toUpperCase();
  const severity: IncidentSeverity =
    status === 'CRITICAL' ? 'critical' :
    status === 'WARNING'  ? 'medium'   :
                            'low';

  const host: string = raw?.host ?? 'unknown-host';
  const alarm: string = raw?.alarm ?? 'unknown-alarm';
  const valueStr: string = raw?.value_string ?? '';
  const info: string = raw?.info ?? '';

  const hostTag = netdataHostToTag(host);

  return {
    source: 'netdata',
    external_id: `${host}:${alarm}`,
    fingerprint: '',
    signal_type: 'resource',
    severity,
    service: null,                    // Netdata 標 host 不標 service
    environment: 'production',        // VPS 都是 production
    title: `Netdata: ${alarm} = ${valueStr} on ${host}`,
    message: info || null,
    raw,
    tags: { host: hostTag.host, alarm, status, value_string: valueStr },
  };
}
```

### Spec — 6.4 `normalize/posthog.ts`

PostHog alert webhook（最少欄位）：

```json
{
  "alert_id": "ph-alert-001",
  "event": { "uuid": "...", "properties": { "$service": "node-api", "environment": "production" } },
  "name": "Signup drop > 30%",
  "description": "..."
}
```

```ts
// apps/next-admin/lib/ops-inbox/normalize/posthog.ts
import type { IncidentDraft, IncidentSeverity, IncidentEnvironment } from '../types';

export function normalizePostHog(raw: any): IncidentDraft {
  const event = raw?.event ?? {};
  const props: Record<string, unknown> = event.properties ?? {};

  const env = String(props.environment ?? 'production');
  const environment: IncidentEnvironment =
    env === 'staging' ? 'staging' : env === 'development' ? 'development' : 'production';

  const dropPct = Number(raw?.drop_percent ?? 0);
  const severity: IncidentSeverity = dropPct >= 50 ? 'high' : dropPct >= 30 ? 'medium' : 'low';

  return {
    source: 'posthog',
    external_id: String(raw?.alert_id ?? event.uuid ?? Date.now()),
    fingerprint: '',
    signal_type: 'business',
    severity,
    service: (props.$service as string) ?? null,
    environment,
    title: raw?.name ?? 'PostHog business alert',
    message: raw?.description ?? null,
    raw,
    tags: { alert_id: raw?.alert_id ?? null, drop_percent: dropPct },
  };
}
```

### Acceptance（B-2 完成定義）

- [ ] `npm run build` 通過
- [ ] 4 支 vitest 都過（用上面 6.1–6.4 的範例 payload 當 fixture）
- [ ] curl 4 個端點各送 1 筆假 payload（Authorization Bearer 帶對）→ 各回 200 + `incident_id`
- [ ] DB 共有 5 筆 `ops_incidents`（4 + 之前 B-1 留下的 1 筆 Sentry）
- [ ] 同 fingerprint 的同來源 payload 連送 5 次 → DB 仍只 1 筆，`occurrence_count = 5`
- [ ] 帶錯 token → 401
- [ ] 設 `OPS_INBOX_POSTHOG_ENABLED=false` → posthog route 回 503，DB 沒新增 row
- [ ] 送一筆 Netdata `status=CLEAR` → route 回 `{skipped:"netdata_clear"}`，DB 沒新增
- [ ] B-0/B-1 既有檔 `git diff` 為空（沒被再動）

### Out of scope（B-2 不做）

- ❌ Slack 通知（B-5）
- ❌ Gemini auto-classify（B-4）
- ❌ UI

### Hand-off

完成後通報「5 個 webhook 都通了」即可。

---

## §7 工作包 B-3：Dashboard UI（列表 + 詳情 + 狀態動作）

### TL;DR
寫 `/ops/inbox` 列表頁與 `/ops/inbox/[id]` 詳情頁，加上篩選 / 改狀態 / Cursor deeplink 按鈕（不含 AI 三軌按鈕，那是 B-4）。

### Estimated time
4–5 小時

### Prerequisites
B-1 完成（types / registry 已存在；ops_incidents 表有資料）

### Can run in parallel with
**B-2、B-5**（不同檔，無交集）

### Files allowed to create

```txt
apps/next-admin/app/ops/inbox/page.tsx
apps/next-admin/app/ops/inbox/[id]/page.tsx
apps/next-admin/app/ops/inbox/actions.ts
apps/next-admin/app/ops/inbox/components/IncidentCard.tsx
apps/next-admin/app/ops/inbox/components/IncidentFilterBar.tsx
apps/next-admin/app/ops/inbox/components/StatusActions.tsx
apps/next-admin/app/ops/inbox/components/OpenInCursorButton.tsx
apps/next-admin/app/ops/inbox/components/OpenRemoteUIButton.tsx
apps/next-admin/app/ops/inbox/components/OpsInboxBadge.tsx        # sidebar 徽章（client）
apps/next-admin/app/ops/inbox/components/RawPayloadDetails.tsx
apps/next-admin/app/api/ops/inbox/health/route.ts
apps/next-admin/lib/ops-inbox/dispatch/buildCursorDeeplink.ts
apps/next-admin/lib/ops-inbox/dispatch/buildRemoteUiUrl.ts
apps/next-admin/lib/ops-inbox/dispatch/buildPrompt.ts
```

### Files allowed to modify

```txt
apps/next-admin/app/layout.tsx       # 把 OpsInboxBadge 引進來掛在 sidebar link 裡
```

> 注意：B-0 已經先加了 `<Link href="/ops/inbox">📥 Ops Inbox</Link>`。B-3 在這條 Link 內**加上** `<OpsInboxBadge />` 元件。

### Files forbidden to touch

- `lib/ops-inbox/types.ts` / `fingerprint.ts` / `transition.ts` / `verifyIngestToken.ts` / `registry/*` / `normalize/*`（B-1/B-2 的）
- 任何 webhook route（B-1/B-2 的）
- `lib/ops-inbox/notify/*`（B-5）
- `lib/ops-inbox/ai/*`（B-4）
- `app/ops/inbox/components/AskChatGPTButton.tsx`、`AskClaudeButton.tsx`、`AskGeminiButton.tsx`、`PasteAiResultBox.tsx`（B-4 才寫）

### Spec — 7.1 視覺色票（CSS variables，加在 `app/globals.css` 或新建 `app/ops/inbox/inbox.css`）

```css
:root {
  --bg-canvas: #f8fafc;
  --bg-card: #ffffff;
  --border-subtle: #e5e7eb;
  --text-primary: #0f172a;
  --text-secondary: #64748b;
  --text-muted: #94a3b8;

  --severity-critical: #dc2626;
  --severity-high: #ea580c;
  --severity-medium: #ca8a04;
  --severity-low: #0284c7;

  --ai-bg: #e0f2fe;
  --ai-text: #0369a1;

  --btn-primary-bg: #2563eb;
  --btn-primary-hover: #1d4ed8;
  --btn-primary-text: #ffffff;
  --btn-secondary-bg: #ffffff;
  --btn-secondary-border: #cbd5e1;
  --btn-secondary-text: #0f172a;

  --status-resolved: #16a34a;
  --status-ignored: #6b7280;
}
```

### Spec — 7.2 列表頁 `app/ops/inbox/page.tsx`（Server Component）

```tsx
import { headers } from 'next/headers';
import Link from 'next/link';
import { getSupabaseReadClient } from '@/lib/supabase-server';
import { readOpsRole, canModifyIncidentStatus } from '@/lib/ops-role';
import { IncidentCard } from './components/IncidentCard';
import { IncidentFilterBar } from './components/IncidentFilterBar';
import type { Incident, IncidentSeverity, IncidentStatus, IncidentSource } from '@/lib/ops-inbox/types';

interface SearchParams {
  status?: string;
  severity?: string;
  source?: string;
  q?: string;
}

export default async function OpsInboxListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const role = readOpsRole(await headers());
  const canAct = canModifyIncidentStatus(role);

  const supabase = getSupabaseReadClient();
  if (!supabase) {
    return <ConnectionError />;
  }

  let query = supabase.from('ops_incidents').select('*').order('last_seen_at', { ascending: false }).limit(200);

  // 預設只看 open + investigating
  const statusFilter = sp.status?.split(',') ?? ['open', 'investigating'];
  if (statusFilter[0] !== 'all') query = query.in('status', statusFilter as IncidentStatus[]);

  if (sp.severity) {
    const sev = sp.severity.split(',') as IncidentSeverity[];
    query = query.in('severity', sev);
  }
  if (sp.source) {
    const src = sp.source.split(',') as IncidentSource[];
    query = query.in('source', src);
  }
  if (sp.q) {
    query = query.or(`title.ilike.%${sp.q}%,message.ilike.%${sp.q}%`);
  }

  const { data: incidents, error } = await query;
  if (error) return <ConnectionError message={error.message} />;

  return (
    <div style={{ background: 'var(--bg-canvas)', minHeight: '100vh', padding: '24px' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ color: 'var(--text-primary)' }}>Ops Inbox</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Unified incident inbox · {incidents?.length ?? 0} matches</p>
      </header>
      <IncidentFilterBar current={sp} />
      {(!incidents || incidents.length === 0) ? (
        <EmptyState />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
          {incidents.map((i) => (
            <IncidentCard key={i.id} incident={i as Incident} canAct={canAct} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', padding: 48, textAlign: 'center', borderRadius: 12 }}>
      <h3>All clear</h3>
      <p style={{ color: 'var(--text-secondary)' }}>過去沒有未處理事件</p>
    </div>
  );
}

function ConnectionError({ message }: { message?: string }) {
  return (
    <div style={{ background: '#fee2e2', color: '#991b1b', padding: 24, borderRadius: 12 }}>
      <strong>無法連線到 Supabase</strong>
      {message && <pre style={{ marginTop: 8, fontSize: 12 }}>{message}</pre>}
    </div>
  );
}
```

### Spec — 7.3 詳情頁 `app/ops/inbox/[id]/page.tsx`

```tsx
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseReadClient } from '@/lib/supabase-server';
import { readOpsRole, canModifyIncidentStatus } from '@/lib/ops-role';
import { getService } from '@/lib/ops-inbox/registry/services';
import { OpenInCursorButton } from '../components/OpenInCursorButton';
import { OpenRemoteUIButton } from '../components/OpenRemoteUIButton';
import { StatusActions } from '../components/StatusActions';
import { RawPayloadDetails } from '../components/RawPayloadDetails';
import type { Incident } from '@/lib/ops-inbox/types';

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = readOpsRole(await headers());
  const canAct = canModifyIncidentStatus(role);

  const supabase = getSupabaseReadClient();
  if (!supabase) return <div>DB unavailable</div>;

  const { data: incident, error } = await supabase
    .from('ops_incidents').select('*').eq('id', id).single();
  if (error || !incident) return notFound();

  const inc = incident as Incident;
  const svc = getService(inc.service);

  return (
    <div style={{ background: 'var(--bg-canvas)', minHeight: '100vh', padding: 24 }}>
      <nav style={{ marginBottom: 12 }}>
        <Link href="/ops/inbox">← Ops Inbox</Link> / <span>INC-{inc.id.slice(0, 8)}</span>
      </nav>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1>{inc.title}</h1>
          <div style={{ color: 'var(--text-secondary)' }}>
            <SeverityChip severity={inc.severity} /> · {inc.source} · {inc.service ?? '(host-level)'} · {inc.environment} · {inc.occurrence_count}×
          </div>
        </div>
        <StatusActions incidentId={inc.id} status={inc.status} canAct={canAct} />
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 24 }}>
        <main>
          <section style={{ background: 'var(--ai-bg)', color: 'var(--ai-text)', padding: 16, borderRadius: 12, marginBottom: 16 }}>
            <strong>✨ Gemini auto-summary</strong>
            <p style={{ marginTop: 8 }}>
              {inc.ai_diagnoses.find((d) => d.role === 'auto-classify')?.summary ?? '（尚未分類，B-4 上線後會自動填）'}
            </p>
          </section>

          <section style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
            <h3>Choose your AI</h3>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {svc?.type === 'local-repo' && <OpenInCursorButton incident={inc} primary />}
              {svc?.type === 'remote-ui-n8n' && <OpenRemoteUIButton incident={inc} target="n8n" primary />}
              {svc?.type === 'remote-ui-supabase' && <OpenRemoteUIButton incident={inc} target="supabase" primary />}
              {/* B-4 會在這裡接 AskChatGPTButton / AskClaudeButton / AskGeminiButton */}
              <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>
                （AI 對話按鈕將在 B-4 接上）
              </span>
            </div>
          </section>

          <RawPayloadDetails raw={inc.raw} />
        </main>

        <aside>
          <ServicePanel service={inc.service} svc={svc} />
          <OccurrencePanel incident={inc} />
          <NotificationLogPanel log={inc.notification_log} />
        </aside>
      </div>
    </div>
  );
}

function SeverityChip({ severity }: { severity: Incident['severity'] }) {
  const color = `var(--severity-${severity})`;
  return <span style={{ color, fontWeight: 600, textTransform: 'uppercase' }}>{severity}</span>;
}

function ServicePanel({ service, svc }: { service: string | null; svc: ReturnType<typeof getService> }) {
  return (
    <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 12, border: '1px solid var(--border-subtle)', marginBottom: 12 }}>
      <h4>Service</h4>
      <div>{service ?? '(host-level)'}</div>
      {svc && <pre style={{ fontSize: 12, marginTop: 8 }}>{JSON.stringify(svc, null, 2)}</pre>}
    </div>
  );
}

function OccurrencePanel({ incident }: { incident: Incident }) {
  return (
    <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 12, border: '1px solid var(--border-subtle)', marginBottom: 12 }}>
      <h4>Occurrences</h4>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{incident.occurrence_count}×</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        First: {new Date(incident.first_seen_at).toLocaleString()}<br />
        Last: {new Date(incident.last_seen_at).toLocaleString()}<br />
        fp: {incident.fingerprint.slice(0, 8)}
      </div>
    </div>
  );
}

function NotificationLogPanel({ log }: { log: Incident['notification_log'] }) {
  if (!log?.length) return null;
  return (
    <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
      <h4>Notify Log</h4>
      <ul style={{ fontSize: 12 }}>
        {log.map((e, i) => (
          <li key={i}>
            {e.status === 'sent' ? '✓' : e.status === 'throttled' ? '⊘' : '✗'} {e.channel} · {e.rule}
            {e.reason && <span> ({e.reason})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Spec — 7.4 Server Actions `app/ops/inbox/actions.ts`

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getSupabaseWriteClient } from '@/lib/supabase-server';
import { readOpsRole, canModifyIncidentStatus } from '@/lib/ops-role';

async function ensureRole(): Promise<string> {
  const role = readOpsRole(await headers());
  if (!canModifyIncidentStatus(role)) throw new Error('forbidden');
  return role;
}

export async function acknowledgeIncident(id: string) {
  await ensureRole();
  const supabase = getSupabaseWriteClient(); if (!supabase) throw new Error('db');
  await supabase.from('ops_incidents').update({ status: 'investigating' }).eq('id', id);
  revalidatePath(`/ops/inbox/${id}`); revalidatePath('/ops/inbox');
}

export async function resolveIncident(id: string) {
  const role = await ensureRole();
  const supabase = getSupabaseWriteClient(); if (!supabase) throw new Error('db');
  await supabase.from('ops_incidents').update({
    status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: role,
  }).eq('id', id);
  revalidatePath(`/ops/inbox/${id}`); revalidatePath('/ops/inbox');
}

export async function ignoreIncident(id: string) {
  await ensureRole();
  const supabase = getSupabaseWriteClient(); if (!supabase) throw new Error('db');
  await supabase.from('ops_incidents').update({ status: 'ignored' }).eq('id', id);
  revalidatePath(`/ops/inbox/${id}`); revalidatePath('/ops/inbox');
}

export async function reopenIncident(id: string) {
  await ensureRole();
  const supabase = getSupabaseWriteClient(); if (!supabase) throw new Error('db');
  // reopen 用 RPC / 兩段式更新都可以；這裡為簡潔用 single update + 手動加 reopen_count
  const { data: cur } = await supabase.from('ops_incidents').select('reopen_count').eq('id', id).single();
  await supabase.from('ops_incidents').update({
    status: 'open',
    reopen_count: (cur?.reopen_count ?? 0) + 1,
    resolved_at: null,
    resolved_by: null,
  }).eq('id', id);
  revalidatePath(`/ops/inbox/${id}`); revalidatePath('/ops/inbox');
}
```

### Spec — 7.5 `components/IncidentCard.tsx`（Server Component，純 props in）

```tsx
import Link from 'next/link';
import type { Incident } from '@/lib/ops-inbox/types';
import { OpenInCursorButton } from './OpenInCursorButton';

export function IncidentCard({ incident, canAct }: { incident: Incident; canAct: boolean }) {
  const sevColor = `var(--severity-${incident.severity})`;
  const aiSummary = incident.ai_diagnoses.find((d) => d.role === 'auto-classify')?.summary;

  return (
    <article style={{
      background: 'var(--bg-card)', borderRadius: 12,
      border: '1px solid var(--border-subtle)', borderLeft: `4px solid ${sevColor}`,
      padding: 16, opacity: incident.status === 'resolved' ? 0.5 : incident.status === 'ignored' ? 0.3 : 1,
    }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 12 }}>
        <span style={{ color: sevColor, fontWeight: 600, textTransform: 'uppercase' }}>{incident.severity}</span>
        <span>· {incident.source}</span>
        <span>· {incident.service ?? '(host-level)'}</span>
        <span>· {incident.environment}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{timeAgo(incident.last_seen_at)}</span>
      </div>
      <Link href={`/ops/inbox/${incident.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>{incident.title}</h3>
      </Link>
      {aiSummary && (
        <div style={{ background: 'var(--ai-bg)', color: 'var(--ai-text)', padding: 8, borderRadius: 8, fontSize: 13, marginBottom: 8 }}>
          ✨ {aiSummary}
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
        Occurrences: {incident.occurrence_count}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <OpenInCursorButton incident={incident} primary />
        {canAct && <Link href={`/ops/inbox/${incident.id}`} style={{ alignSelf: 'center', fontSize: 12 }}>Details →</Link>}
      </div>
    </article>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
```

### Spec — 7.6 `components/StatusActions.tsx` / `OpenInCursorButton.tsx` / `OpenRemoteUIButton.tsx` / `RawPayloadDetails.tsx` / `OpsInboxBadge.tsx`

```tsx
// components/StatusActions.tsx
'use client';
import { useTransition } from 'react';
import { acknowledgeIncident, resolveIncident, ignoreIncident, reopenIncident } from '../actions';

export function StatusActions({ incidentId, status, canAct }: { incidentId: string; status: string; canAct: boolean }) {
  const [pending, start] = useTransition();
  if (!canAct) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>(view only)</span>;
  const btn = { padding: '6px 12px', borderRadius: 6, border: '1px solid var(--btn-secondary-border)', background: 'var(--btn-secondary-bg)', cursor: 'pointer' } as const;
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {status === 'open' && <button style={btn} disabled={pending} onClick={() => start(() => acknowledgeIncident(incidentId))}>Acknowledge</button>}
      {(status === 'open' || status === 'investigating') && <button style={btn} disabled={pending} onClick={() => start(() => resolveIncident(incidentId))}>Mark resolved</button>}
      {(status === 'open' || status === 'investigating') && <button style={btn} disabled={pending} onClick={() => start(() => ignoreIncident(incidentId))}>Mark ignored</button>}
      {(status === 'resolved' || status === 'ignored') && <button style={btn} disabled={pending} onClick={() => start(() => reopenIncident(incidentId))}>Reopen</button>}
    </div>
  );
}
```

```tsx
// components/OpenInCursorButton.tsx
'use client';
import type { Incident } from '@/lib/ops-inbox/types';
import { buildCursorDeeplink } from '@/lib/ops-inbox/dispatch/buildCursorDeeplink';

export function OpenInCursorButton({ incident, primary }: { incident: Incident; primary?: boolean }) {
  const onClick = () => { window.location.href = buildCursorDeeplink(incident); };
  const style = primary
    ? { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }
    : { background: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-text)', border: '1px solid var(--btn-secondary-border)' };
  return (
    <button onClick={onClick} style={{ ...style, padding: '8px 14px', borderRadius: 6, cursor: 'pointer' }}>
      Open in Cursor →
    </button>
  );
}
```

```tsx
// components/OpenRemoteUIButton.tsx
'use client';
import type { Incident } from '@/lib/ops-inbox/types';
import { buildRemoteUiUrl } from '@/lib/ops-inbox/dispatch/buildRemoteUiUrl';
import { buildIncidentPrompt } from '@/lib/ops-inbox/dispatch/buildPrompt';

export function OpenRemoteUIButton({ incident, target, primary }: { incident: Incident; target: 'n8n' | 'supabase'; primary?: boolean }) {
  const onClick = async () => {
    const prompt = buildIncidentPrompt(incident, 'remote-ui');
    try { await navigator.clipboard.writeText(prompt); } catch {}
    window.open(buildRemoteUiUrl(incident, target), '_blank');
  };
  const label = target === 'n8n' ? 'Open n8n UI →' : 'Open Studio →';
  const style = primary
    ? { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }
    : { background: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-text)', border: '1px solid var(--btn-secondary-border)' };
  return (
    <button onClick={onClick} style={{ ...style, padding: '8px 14px', borderRadius: 6, cursor: 'pointer' }}>
      {label}
    </button>
  );
}
```

```tsx
// components/RawPayloadDetails.tsx
export function RawPayloadDetails({ raw }: { raw: Record<string, unknown> }) {
  return (
    <details style={{ marginTop: 16, background: 'var(--bg-card)', padding: 16, borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
      <summary>Raw payload</summary>
      <pre style={{ fontSize: 12, marginTop: 8, overflow: 'auto', maxHeight: 400 }}>
        {JSON.stringify(raw, null, 2)}
      </pre>
    </details>
  );
}
```

```tsx
// components/OpsInboxBadge.tsx
'use client';
import { useEffect, useState } from 'react';

export function OpsInboxBadge() {
  const [counts, setCounts] = useState<{ critical: number; high: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('/api/ops/inbox/health');
        if (!alive || !r.ok) return;
        const j = await r.json();
        setCounts({ critical: j.critical_count ?? 0, high: j.high_count ?? 0 });
      } catch {}
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  if (!counts) return null;
  if (counts.critical > 0)
    return <span style={{ marginLeft: 8, padding: '2px 6px', background: 'var(--severity-critical)', color: '#fff', borderRadius: 999, fontSize: 11 }}>{counts.critical}</span>;
  if (counts.high > 0)
    return <span style={{ marginLeft: 8, padding: '2px 6px', background: 'var(--severity-high)', color: '#fff', borderRadius: 999, fontSize: 11 }}>{counts.high}</span>;
  return null;
}
```

把 `<OpsInboxBadge />` 加到 `app/layout.tsx` B-0 那一行 sidebar Link 內：

```diff
-    <Link href="/ops/inbox" className="sidebar-link">
-      <span className="icon">📥</span> Ops Inbox
-    </Link>
+    <Link href="/ops/inbox" className="sidebar-link">
+      <span className="icon">📥</span> Ops Inbox
+      <OpsInboxBadge />
+    </Link>
```

並在檔頂 `import { OpsInboxBadge } from './ops/inbox/components/OpsInboxBadge';`（路徑視 layout.tsx 位置調整）。

### Spec — 7.7 `lib/ops-inbox/dispatch/{buildPrompt, buildCursorDeeplink, buildRemoteUiUrl}.ts`

`buildPrompt.ts`：見母計畫表 §附錄 A.1（完整版約 90 行）。**B-3 階段允許先寫一個簡化版**：

```ts
import type { Incident } from '@/lib/ops-inbox/types';

export function buildIncidentPrompt(incident: Incident, target: 'cursor' | 'chat' | 'remote-ui'): string {
  const lines = [
    `Incident from Ops Inbox`,
    ``,
    `Source: ${incident.source}`,
    `Service: ${incident.service ?? '(host-level)'}`,
    `Environment: ${incident.environment}`,
    `Severity: ${incident.severity}`,
    `Title: ${incident.title}`,
    incident.message ? `Message: ${incident.message}` : '',
    `Occurrences: ${incident.occurrence_count}`,
    ``,
    `Raw (redacted):`,
    '```json',
    JSON.stringify(incident.raw, null, 2),
    '```',
  ];
  return lines.filter(Boolean).join('\n');
}
```

`buildCursorDeeplink.ts`：

```ts
import type { Incident } from '@/lib/ops-inbox/types';
import { buildIncidentPrompt } from './buildPrompt';

const MAX_DEEPLINK_LEN = 7800;

export function buildCursorDeeplink(incident: Incident): string {
  let prompt = buildIncidentPrompt(incident, 'cursor');
  let encoded = encodeURIComponent(prompt);
  if (encoded.length > MAX_DEEPLINK_LEN) {
    prompt = buildIncidentPrompt({ ...incident, raw: { _omitted: 'see inbox detail page' } }, 'cursor');
    encoded = encodeURIComponent(prompt);
  }
  if (encoded.length > MAX_DEEPLINK_LEN) {
    const truncated = { ...incident, raw: {}, message: (incident.message ?? '').slice(0, 2000) + '…' };
    prompt = buildIncidentPrompt(truncated, 'cursor');
    encoded = encodeURIComponent(prompt);
  }
  return `cursor://anysphere.cursor-deeplink/prompt?text=${encoded}`;
}
```

`buildRemoteUiUrl.ts`：

```ts
import type { Incident } from '@/lib/ops-inbox/types';
import { getService } from '@/lib/ops-inbox/registry/services';

export function buildRemoteUiUrl(incident: Incident, target: 'n8n' | 'supabase'): string {
  const svc = getService(incident.service);
  if (!svc) return target === 'n8n' ? 'https://n8n.aware-wave.com' : 'https://studio.aware-wave.com';
  if (svc.type === 'remote-ui-n8n') return svc.ui_url;
  if (svc.type === 'remote-ui-supabase') return svc.ui_url;
  return target === 'n8n' ? 'https://n8n.aware-wave.com' : 'https://studio.aware-wave.com';
}
```

### Spec — 7.8 Health endpoint `app/api/ops/inbox/health/route.ts`

```ts
import { NextResponse } from 'next/server';
import { getSupabaseReadClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getSupabaseReadClient();
  if (!supabase) return NextResponse.json({ ok: false, error: 'db unavailable' }, { status: 503 });

  const today = new Date().toISOString().slice(0, 10);

  const [open, critical, high, quota, lastIngest] = await Promise.all([
    supabase.from('ops_incidents').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('ops_incidents').select('id', { count: 'exact', head: true }).in('status', ['open', 'investigating']).eq('severity', 'critical'),
    supabase.from('ops_incidents').select('id', { count: 'exact', head: true }).in('status', ['open', 'investigating']).eq('severity', 'high'),
    supabase.from('ops_inbox_gemini_quota').select('count').eq('date', today).maybeSingle(),
    supabase.from('ops_incidents').select('last_seen_at').order('last_seen_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  return NextResponse.json({
    ok: true,
    open_count: open.count ?? 0,
    critical_count: critical.count ?? 0,
    high_count: high.count ?? 0,
    gemini_quota_used: quota.data?.count ?? 0,
    gemini_quota_limit: Number(process.env.OPS_INBOX_GEMINI_DAILY_LIMIT ?? 1400),
    last_ingest_at: lastIngest.data?.last_seen_at ?? null,
  });
}
```

### Spec — 7.9 `IncidentFilterBar.tsx`（client，URL searchParams 驅動）

```tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

export function IncidentFilterBar({ current }: { current: { status?: string; severity?: string; source?: string; q?: string } }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp);
    if (value === null) next.delete(key); else next.set(key, value);
    start(() => router.push(`/ops/inbox?${next.toString()}`));
  };

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      {['all', 'open', 'investigating', 'resolved'].map((s) => (
        <button key={s}
          onClick={() => setParam('status', s === 'all' ? null : s)}
          style={{
            padding: '6px 12px', borderRadius: 6,
            background: (current.status ?? 'open') === s || (s === 'all' && !current.status) ? 'var(--btn-primary-bg)' : 'var(--btn-secondary-bg)',
            color: (current.status ?? 'open') === s ? '#fff' : 'var(--text-primary)',
            border: '1px solid var(--btn-secondary-border)', cursor: 'pointer',
          }}
        >{s}</button>
      ))}
      <input
        defaultValue={current.q ?? ''}
        placeholder="Search title / message…"
        onChange={(e) => {
          const v = e.target.value;
          setTimeout(() => setParam('q', v || null), 300);
        }}
        style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--btn-secondary-border)', flex: 1, minWidth: 200 }}
      />
    </div>
  );
}
```

### Acceptance（B-3 完成定義）

- [ ] `npm run build` 通過
- [ ] `http://localhost:3000/ops/inbox` 顯示 B-1/B-2 灌進去的 5 筆 incident
- [ ] 點 status filter `resolved` → 列表變空（沒有 resolved 過的）
- [ ] 點 status filter `all` → 全部 5 筆都列出
- [ ] 點任一卡片 → 進詳情頁
- [ ] 詳情頁能看到 raw payload（`<details>` 展開）
- [ ] 詳情頁 `Mark resolved` 按一下 → status 變 resolved，回列表預設看不到（需切到 all 才看得到）
- [ ] resolved 後的卡片在 detail 頁可以 `Reopen` → status 回 open，`reopen_count` +1
- [ ] sidebar 上 `Ops Inbox` 後面在有 critical/high incident 時顯示徽章；全部 resolved 後徽章消失（30 秒收斂）
- [ ] `curl http://localhost:3000/api/ops/inbox/health` 回 JSON 含 `open_count`、`critical_count`、`gemini_quota_used`
- [ ] 點 detail 頁 `Open in Cursor` 按鈕 → 本地 Cursor 有開新 chat，prompt 含 incident title + raw
- [ ] `viewer` role（請暫時手動把 `x-ops-claims-role` 改成 `viewer` 測試）→ 進列表能看，detail 頁的 `StatusActions` 顯示 "view only"
- [ ] B-0/B-1/B-2 既有檔 `git diff` 為空（除了 layout.tsx 加 OpsInboxBadge import 與 1 行）

### Out of scope（B-3 不做）

- ❌ Ask ChatGPT / Ask Claude / Ask Gemini 按鈕（B-4）
- ❌ 「貼回 AI 結論」textarea（B-4）
- ❌ Slack 通知（B-5）
- ❌ Gemini auto-classify 寫入 ai_diagnoses[0]（B-4）；現在 detail 頁的 AI summary 區會顯示「尚未分類」

### Hand-off

完成後，B-4 會在 detail 頁的 `Choose your AI` 區塊**加 3 顆按鈕**（Ask ChatGPT / Ask Claude / Ask Gemini Pro）+ `PasteAiResultBox`。

---

## §8 工作包 B-4：AI 三軌（Gemini auto-classify + 訂閱按鈕 + 貼回）

### TL;DR
裝 `@google/generative-ai`，寫 Gemini Free Tier wrapper + quota guard + auto-classify endpoint，在 detail 頁加 3 顆 AI 按鈕 + 「貼回 AI 結論」表單。Webhook handlers 把 fire-and-forget hook 接上 `triggerAutoClassify`。

### Estimated time
4–5 小時

### Prerequisites
B-1 完成（types / registry）+ B-3 完成（detail 頁框架已在）

### Can run in parallel with
B-5（不同檔，無交集）

### Files allowed to create

```txt
apps/next-admin/lib/ops-inbox/ai/gemini.ts
apps/next-admin/lib/ops-inbox/ai/quotaGuard.ts
apps/next-admin/lib/ops-inbox/ai/triggerAutoClassify.ts
apps/next-admin/lib/ops-inbox/ai/recommendOrder.ts
apps/next-admin/lib/ops-inbox/dispatch/buildClipboardPrompt.ts

apps/next-admin/app/api/ai/auto-classify/route.ts
apps/next-admin/app/api/ai/save-diagnosis/route.ts

apps/next-admin/app/ops/inbox/components/AskChatGPTButton.tsx
apps/next-admin/app/ops/inbox/components/AskClaudeButton.tsx
apps/next-admin/app/ops/inbox/components/AskGeminiButton.tsx
apps/next-admin/app/ops/inbox/components/PasteAiResultBox.tsx
apps/next-admin/app/ops/inbox/components/AiDiagnosisTimeline.tsx
```

### Files allowed to modify

```txt
apps/next-admin/app/api/webhooks/sentry/route.ts        # 接 triggerAutoClassify
apps/next-admin/app/api/webhooks/uptime-kuma/route.ts   # 同上
apps/next-admin/app/api/webhooks/grafana/route.ts       # 同上
apps/next-admin/app/api/webhooks/netdata/route.ts       # 同上
apps/next-admin/app/api/webhooks/posthog/route.ts       # 同上
apps/next-admin/app/ops/inbox/[id]/page.tsx             # 加 3 顆按鈕 + PasteAiResultBox + AiDiagnosisTimeline
apps/next-admin/package.json                            # 加 @google/generative-ai
```

### Files forbidden to touch

- B-1/B-2 的 normalizer / lib（不要動）
- B-3 的 IncidentCard / actions.ts / OpenInCursor / OpenRemoteUI / StatusActions（不要動）
- `lib/ops-inbox/notify/*`（B-5）
- B-0 既有檔（middleware/tsconfig/layout/ops-role）

### Spec — 8.1 安裝依賴

```bash
cd apps/next-admin
npm install @google/generative-ai
```

> **唯一允許新增的 npm 依賴**。**不要** `npm install openai` 或 `@anthropic-ai/sdk` —— ChatGPT/Claude 走剪貼簿。

### Spec — 8.2 `lib/ops-inbox/ai/gemini.ts`

```ts
// apps/next-admin/lib/ops-inbox/ai/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface AutoClassifyResult {
  is_actionable: boolean;
  guessed_category: 'code-bug' | 'config' | 'infra' | 'transient' | 'business';
  one_line_summary: string;        // 中文一句話
  recommended_ai: 'chatgpt' | 'claude' | 'cursor';
  tokens?: number;
}

export async function geminiAutoClassify(input: {
  source: string; service: string | null; severity: string;
  signal_type: string; title: string; message: string | null;
}): Promise<AutoClassifyResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        required: ['is_actionable', 'guessed_category', 'one_line_summary', 'recommended_ai'],
        properties: {
          is_actionable: { type: 'boolean' },
          guessed_category: { type: 'string', enum: ['code-bug','config','infra','transient','business'] },
          one_line_summary: { type: 'string' },
          recommended_ai: { type: 'string', enum: ['chatgpt','claude','cursor'] },
        },
      },
    },
  });

  const prompt = `你是 Ops Inbox 的分類助理。給你一筆 incident，請輸出 JSON：
- is_actionable: 是否需要人類處理（false = 雜訊）
- guessed_category: code-bug / config / infra / transient / business
- one_line_summary: 中文一句話摘要（< 40 字）
- recommended_ai: chatgpt（程式碼） / claude（架構推理） / cursor（直接動 code）

Incident:
- source: ${input.source}
- service: ${input.service ?? '(none)'}
- severity: ${input.severity}
- signal_type: ${input.signal_type}
- title: ${input.title}
- message: ${input.message ?? ''}`;

  const r = await model.generateContent(prompt);
  const text = r.response.text();
  let parsed: AutoClassifyResult;
  try { parsed = JSON.parse(text); }
  catch { throw new Error(`gemini bad json: ${text.slice(0, 200)}`); }
  parsed.tokens = r.response.usageMetadata?.totalTokenCount;
  return parsed;
}
```

### Spec — 8.3 `lib/ops-inbox/ai/quotaGuard.ts`

```ts
import { getSupabaseWriteClient } from '@/lib/supabase-server';

export async function tryConsumeGeminiQuota(): Promise<{ allowed: boolean; current: number; limit: number }> {
  const limit = Number(process.env.OPS_INBOX_GEMINI_DAILY_LIMIT ?? 1400);
  const supabase = getSupabaseWriteClient();
  if (!supabase) return { allowed: false, current: 0, limit };

  const { data, error } = await supabase.rpc('ops_inbox_gemini_quota_increment', { p_max: limit });
  if (error || !data) return { allowed: false, current: 0, limit };
  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: !!row.allowed, current: row.current_count ?? 0, limit };
}
```

### Spec — 8.4 `app/api/ai/auto-classify/route.ts`

```ts
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { getSupabaseWriteClient } from '@/lib/supabase-server';
import { readOpsRole } from '@/lib/ops-role';
import { geminiAutoClassify } from '@/lib/ops-inbox/ai/gemini';
import { tryConsumeGeminiQuota } from '@/lib/ops-inbox/ai/quotaGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // 來源：webhook handler fire-and-forget（同 process / same origin），或 detail 頁手動觸發
  // 用既有 trusted-proxy + role header 邊界（middleware 已 cover /api/ai/*）
  const role = readOpsRole(await headers());
  // viewer 不允許手動觸發；webhook 內部呼叫沒帶 role header → role = 'viewer'，但 webhook 內部用 internal token 通道時可放行
  // 簡化：B-4 階段 webhook handler 同 process 直接 import triggerAutoClassify，不打 HTTP
  // 這支 endpoint 是給未來「手動 retry」用，要求 operator+
  if (process.env.OPS_INBOX_GEMINI_ENABLED !== 'true') {
    return NextResponse.json({ skipped: 'gemini_disabled' });
  }
  if (role === 'viewer') {
    return new NextResponse('forbidden', { status: 403 });
  }

  const { incident_id } = await req.json();
  if (!incident_id) return new NextResponse('incident_id required', { status: 400 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return new NextResponse('db unavailable', { status: 503 });

  const { data: incident, error } = await supabase
    .from('ops_incidents')
    .select('id, source, service, severity, signal_type, title, message, ai_diagnoses')
    .eq('id', incident_id)
    .single();
  if (error || !incident) return new NextResponse('not found', { status: 404 });

  const quota = await tryConsumeGeminiQuota();
  if (!quota.allowed) {
    return NextResponse.json({ skipped: 'quota_exhausted', current: quota.current, limit: quota.limit });
  }

  try {
    const result = await geminiAutoClassify(incident as any);
    const newDiagnosis = {
      provider: 'gemini' as const, model: 'gemini-2.0-flash', role: 'auto-classify' as const,
      summary: result.one_line_summary, tokens: result.tokens,
      created_at: new Date().toISOString(), created_by: 'system',
    };
    await supabase.from('ops_incidents').update({
      ai_diagnoses: [...(incident.ai_diagnoses as any[]), newDiagnosis],
      ai_provider_suggested: result.recommended_ai,
    }).eq('id', incident_id);
    return NextResponse.json({ ok: true, summary: result.one_line_summary });
  } catch (e: any) {
    Sentry.captureException(e);
    return NextResponse.json({ skipped: 'gemini_error', error: String(e.message ?? e) });
  }
}
```

### Spec — 8.5 `lib/ops-inbox/ai/triggerAutoClassify.ts`（給 webhook handler 同 process 呼叫）

> **不打 HTTP，直接 import**。webhook handler 跑在同一個 next-admin process 內，多打一次 fetch 浪費。

```ts
import * as Sentry from '@sentry/nextjs';
import { getSupabaseWriteClient } from '@/lib/supabase-server';
import { geminiAutoClassify } from './gemini';
import { tryConsumeGeminiQuota } from './quotaGuard';

export async function triggerAutoClassify(incidentId: string): Promise<void> {
  if (process.env.OPS_INBOX_GEMINI_ENABLED !== 'true') return;
  const supabase = getSupabaseWriteClient(); if (!supabase) return;

  const { data: incident } = await supabase
    .from('ops_incidents')
    .select('id, source, service, severity, signal_type, title, message, ai_diagnoses')
    .eq('id', incidentId)
    .single();
  if (!incident) return;
  // 已分類過就不重做（occurrence_count++ 不需要重新分類）
  if ((incident.ai_diagnoses as any[]).some((d) => d.role === 'auto-classify')) return;

  const quota = await tryConsumeGeminiQuota();
  if (!quota.allowed) return;

  try {
    const result = await geminiAutoClassify(incident as any);
    await supabase.from('ops_incidents').update({
      ai_diagnoses: [...(incident.ai_diagnoses as any[]), {
        provider: 'gemini', model: 'gemini-2.0-flash', role: 'auto-classify',
        summary: result.one_line_summary, tokens: result.tokens,
        created_at: new Date().toISOString(), created_by: 'system',
      }],
      ai_provider_suggested: result.recommended_ai,
    }).eq('id', incidentId);
  } catch (e) { Sentry.captureException(e); }
}
```

### Spec — 8.6 把 5 個 webhook handler 內的 TODO 換成 triggerAutoClassify

每個 webhook route 找到：

```ts
  void (async () => {
    try {
      // TODO B-4: triggerAutoClassify(upserted.id)
      // TODO B-5: dispatchNotifications(...)
    } catch (e) { Sentry.captureException(e); }
  })();
```

換成：

```ts
import { triggerAutoClassify } from '@/lib/ops-inbox/ai/triggerAutoClassify';
// ...
  void (async () => {
    try {
      if (transition.kind === 'new') await triggerAutoClassify(upserted.id);
      // TODO B-5: dispatchNotifications({ incident: upserted, transition })
    } catch (e) { Sentry.captureException(e); }
  })();
```

> 注意：只在 `transition.kind === 'new'` 時才跑 Gemini，省 quota（duplicate 不重新分類）。

### Spec — 8.7 `lib/ops-inbox/ai/recommendOrder.ts`

```ts
import type { Incident } from '@/lib/ops-inbox/types';

type ButtonId = 'cursor' | 'chatgpt' | 'claude' | 'gemini';

export function recommendButtonOrder(incident: Incident): ButtonId[] {
  const sig = incident.signal_type;
  const sev = incident.severity;
  if (sig === 'error' && sev === 'critical') return ['claude', 'cursor', 'chatgpt', 'gemini'];
  if (sig === 'error' || sig === 'deployment') return ['cursor', 'chatgpt', 'claude', 'gemini'];
  if (sig === 'business') return ['claude', 'chatgpt', 'cursor', 'gemini'];
  // uptime / latency / resource
  return ['claude', 'cursor', 'chatgpt', 'gemini'];
}
```

### Spec — 8.8 `lib/ops-inbox/dispatch/buildClipboardPrompt.ts`

```ts
import type { Incident } from '@/lib/ops-inbox/types';
import { buildIncidentPrompt } from './buildPrompt';

export function buildClipboardPrompt(incident: Incident, target: 'chatgpt' | 'claude' | 'gemini'): string {
  const role = target === 'gemini'
    ? '你是 SRE / Postmortem 分析師。'
    : target === 'claude'
      ? '你是擅長系統推理的 senior SRE，請用 RCA / 假設驗證的方式分析下面 incident。'
      : '你是 senior full-stack engineer，幫我看下面這個生產環境的 incident，給出最可能的 root cause 與修復建議。';
  return `${role}\n\n${buildIncidentPrompt(incident, 'chat')}`;
}
```

### Spec — 8.9 `app/ops/inbox/components/AskChatGPTButton.tsx` / `AskClaudeButton.tsx` / `AskGeminiButton.tsx`

```tsx
// AskChatGPTButton.tsx
'use client';
import { useState } from 'react';
import type { Incident } from '@/lib/ops-inbox/types';
import { buildClipboardPrompt } from '@/lib/ops-inbox/dispatch/buildClipboardPrompt';

export function AskChatGPTButton({ incident, primary }: { incident: Incident; primary?: boolean }) {
  const [toast, setToast] = useState<string | null>(null);
  const onClick = async () => {
    const prompt = buildClipboardPrompt(incident, 'chatgpt');
    try { await navigator.clipboard.writeText(prompt); setToast('Prompt copied · paste with Cmd/Ctrl+V'); }
    catch { setToast('Copy failed — paste from "Show prompt" fallback'); }
    window.open('https://chatgpt.com/', '_blank');
    setTimeout(() => setToast(null), 4000);
  };
  return (
    <>
      <button onClick={onClick} style={btn(primary)}>Ask ChatGPT</button>
      {toast && <div role="status" style={toastStyle}>{toast}</div>}
    </>
  );
}

function btn(primary?: boolean): React.CSSProperties {
  return primary
    ? { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', padding: '8px 14px', borderRadius: 6, border: 'none', cursor: 'pointer' }
    : { background: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-text)', padding: '8px 14px', borderRadius: 6, border: '1px solid var(--btn-secondary-border)', cursor: 'pointer' };
}
const toastStyle: React.CSSProperties = { position: 'fixed', bottom: 16, right: 16, padding: '8px 16px', background: '#0f172a', color: '#fff', borderRadius: 6 };
```

`AskClaudeButton.tsx` 同上但 `window.open('https://claude.ai/new', '_blank')` 與 `buildClipboardPrompt(..., 'claude')`。

`AskGeminiButton.tsx` 同上但開 `https://gemini.google.com/app` 與 `'gemini'`。

### Spec — 8.10 `PasteAiResultBox.tsx` + `AiDiagnosisTimeline.tsx`

```tsx
// PasteAiResultBox.tsx
'use client';
import { useState, useTransition } from 'react';

export function PasteAiResultBox({ incidentId, canSave }: { incidentId: string; canSave: boolean }) {
  const [provider, setProvider] = useState('chatgpt');
  const [summary, setSummary] = useState('');
  const [pending, start] = useTransition();
  if (!canSave) return null;
  const submit = () => start(async () => {
    const r = await fetch('/api/ai/save-diagnosis', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incident_id: incidentId, provider, summary }),
    });
    if (r.ok) { setSummary(''); location.reload(); }
  });
  return (
    <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 12, border: '1px solid var(--border-subtle)', marginTop: 16 }}>
      <h4>Paste AI conclusion</h4>
      <select value={provider} onChange={(e) => setProvider(e.target.value)}>
        <option value="chatgpt">ChatGPT</option>
        <option value="claude">Claude</option>
        <option value="cursor">Cursor</option>
        <option value="other">Other</option>
      </select>
      <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Paste AI conclusion here…" rows={6} style={{ width: '100%', marginTop: 8 }} />
      <button onClick={submit} disabled={pending || !summary.trim()} style={{ marginTop: 8, padding: '6px 12px', background: 'var(--btn-primary-bg)', color: '#fff', border: 'none', borderRadius: 6 }}>Save diagnosis</button>
    </div>
  );
}
```

```tsx
// AiDiagnosisTimeline.tsx
import type { AiDiagnosis } from '@/lib/ops-inbox/types';

export function AiDiagnosisTimeline({ diagnoses }: { diagnoses: AiDiagnosis[] }) {
  if (!diagnoses.length) return null;
  return (
    <section style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 12, border: '1px solid var(--border-subtle)', marginTop: 16 }}>
      <h4>AI Diagnosis Timeline</h4>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {diagnoses.map((d, i) => (
          <li key={i} style={{ borderLeft: `3px solid ${providerColor(d.provider)}`, paddingLeft: 12, marginBottom: 12 }}>
            <strong>{d.provider}</strong> · {d.role} · {new Date(d.created_at).toLocaleString()}
            <p style={{ margin: '4px 0 0 0' }}>{d.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
function providerColor(p: AiDiagnosis['provider']): string {
  return p === 'gemini' ? '#0284c7' : p === 'chatgpt' ? '#16a34a' : p === 'claude' ? '#9333ea' : p === 'cursor' ? '#2563eb' : '#64748b';
}
```

### Spec — 8.11 `app/api/ai/save-diagnosis/route.ts`

```ts
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSupabaseWriteClient } from '@/lib/supabase-server';
import { readOpsRole, canTriggerAiDiagnose } from '@/lib/ops-role';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const role = readOpsRole(await headers());
  if (!canTriggerAiDiagnose(role)) return new NextResponse('forbidden', { status: 403 });

  const { incident_id, provider, summary } = await req.json();
  if (!incident_id || !provider || !summary) return new NextResponse('missing fields', { status: 400 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return new NextResponse('db unavailable', { status: 503 });

  const { data: cur } = await supabase.from('ops_incidents').select('ai_diagnoses').eq('id', incident_id).single();
  if (!cur) return new NextResponse('not found', { status: 404 });

  const newEntry = {
    provider, role: 'manual-paste', summary,
    created_at: new Date().toISOString(), created_by: role,
  };
  await supabase.from('ops_incidents').update({
    ai_diagnoses: [...(cur.ai_diagnoses as any[]), newEntry],
  }).eq('id', incident_id);

  return NextResponse.json({ ok: true });
}
```

### Spec — 8.12 把 detail 頁的「Choose your AI」與「貼回」與「timeline」接上

在 `app/ops/inbox/[id]/page.tsx` 內：
- import `recommendButtonOrder` / `AskChatGPTButton` / `AskClaudeButton` / `AskGeminiButton` / `PasteAiResultBox` / `AiDiagnosisTimeline` / `canTriggerAiDiagnose`
- 在 `Choose your AI` 區塊用 `recommendButtonOrder(inc)` 排序，依 `service.type` 選第一顆（local-repo → Cursor / remote-ui-* → 對應 web UI）+ 其餘 3 顆
- main 末端加 `<AiDiagnosisTimeline diagnoses={inc.ai_diagnoses} />` 與 `<PasteAiResultBox incidentId={inc.id} canSave={canTriggerAiDiagnose(role)} />`

### Acceptance（B-4 完成定義）

- [ ] `npm run build` 通過；`@google/generative-ai` 在 `package.json` 內
- [ ] 手動跑 `curl -X POST localhost:3000/api/webhooks/sentry ...` 一個**新** fingerprint → 1–3 秒內 detail 頁 AI summary 區出現中文一句話
- [ ] 同一 fingerprint 重送 → 不再呼叫 Gemini（log 內看不到第二次 quota++）
- [ ] `OPS_INBOX_GEMINI_ENABLED=false` 時觸發 → 不呼叫 Gemini，detail 頁 AI summary 仍顯示「尚未分類」（或「auto-classification disabled」）
- [ ] 把 `ops_inbox_gemini_quota` 表手動 update count = 1400（達 limit）後再觸發 → 不呼叫 Gemini，response 內 `skipped:'quota_exhausted'`
- [ ] 點 `Ask ChatGPT` → 剪貼簿有 prompt（用 PowerShell `Get-Clipboard` 驗證）+ 開 chatgpt.com 新分頁
- [ ] 點 `Ask Claude` → 同上開 claude.ai
- [ ] 點 `Ask Gemini Pro` → 同上開 gemini.google.com
- [ ] 點 `Open in Cursor`（B-3 已存在）仍正常
- [ ] detail 頁底部 `Paste AI conclusion` 貼一段文字 → 存入 DB → timeline 多一筆 manual-paste
- [ ] `viewer` role POST `/api/ai/save-diagnosis` → 403
- [ ] B-3 的 IncidentCard / actions.ts 都沒被改

### Out of scope（B-4 不做）

- ❌ Slack 通知（B-5）

### Hand-off

只剩 B-5 的 Slack notifier。

---

## §9 工作包 B-5：通知層（Notifier 抽象 + SlackNotifier + dispatcher）

### TL;DR
寫 Notifier interface + SlackNotifier + 通知規則 + dispatcher，把 5 個 webhook handler 的「TODO B-5」hook 接上。Slack 走新建的 `#ops-incidents`，不碰 `#alerts-infra`。

### Estimated time
3–4 小時

### Prerequisites
B-1 完成（types / transition）

### Can run in parallel with
B-2、B-3（不同檔，無交集）

### Files allowed to create

```txt
apps/next-admin/lib/ops-inbox/notify/types.ts
apps/next-admin/lib/ops-inbox/notify/slack.ts
apps/next-admin/lib/ops-inbox/notify/rules.ts
apps/next-admin/lib/ops-inbox/notify/dispatcher.ts
apps/next-admin/lib/ops-inbox/notify/__tests__/rules.test.ts
```

### Files allowed to modify

```txt
apps/next-admin/app/api/webhooks/sentry/route.ts        # 接 dispatchNotifications
apps/next-admin/app/api/webhooks/uptime-kuma/route.ts   # 同上
apps/next-admin/app/api/webhooks/grafana/route.ts       # 同上
apps/next-admin/app/api/webhooks/netdata/route.ts       # 同上
apps/next-admin/app/api/webhooks/posthog/route.ts       # 同上
```

### Files forbidden to touch

- B-1/B-2/B-3/B-4 的所有非清單檔
- B-0 既有檔

### Spec — 9.1 `notify/types.ts`

```ts
import type { Incident, NotificationRule, NotificationStatus } from '../types';

export interface NotificationContext {
  incident: Incident;
  rule: NotificationRule;
  publicUrl: string;
}

export interface NotificationResult {
  status: NotificationStatus;
  reason?: string;
  externalRef?: string;
  error?: string;
}

export interface Notifier {
  readonly id: string;
  send(ctx: NotificationContext): Promise<NotificationResult>;
}
```

### Spec — 9.2 `notify/slack.ts`

```ts
import type { Notifier, NotificationContext, NotificationResult } from './types';

export class SlackNotifier implements Notifier {
  constructor(public readonly id: string, private webhookUrl: string) {}

  async send(ctx: NotificationContext): Promise<NotificationResult> {
    if (!this.webhookUrl) return { status: 'failed', error: 'webhook_url_missing' };

    const i = ctx.incident;
    const fp = i.fingerprint.slice(0, 8);
    const sevEmoji = i.severity === 'critical' ? '🔴' : i.severity === 'high' ? '🟠' : i.severity === 'medium' ? '🟡' : '🔵';
    const incidentUrl = `${ctx.publicUrl}/ops/inbox/${i.id}`;
    const ruleLabel = ctx.rule === 'severity_escalation' ? ' · ESCALATED'
                    : ctx.rule === 'reopen' ? ' · REOPENED'
                    : ctx.rule === 'critical_immediate' ? ' · CRITICAL'
                    : '';
    const here = ctx.rule === 'critical_immediate' ? '<!here> ' : '';

    const body = {
      text: `${sevEmoji} ${i.severity.toUpperCase()}${ruleLabel} · ${i.source} · ${i.title}`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `${here}${sevEmoji} *${i.severity.toUpperCase()}${ruleLabel}* · _${i.source}_ · *${i.service ?? '(host-level)'}* · ${i.environment}` } },
        { type: 'section', text: { type: 'mrkdwn', text: `*${i.title}*\n${i.message ?? ''}` } },
        { type: 'context', elements: [
          { type: 'mrkdwn', text: `Occurrences: *${i.occurrence_count}* · fp:${fp}` },
          { type: 'mrkdwn', text: `<${incidentUrl}|Open in Inbox>` },
        ]},
      ],
    };

    try {
      const r = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
      });
      if (!r.ok) return { status: 'failed', error: `slack_${r.status}` };
      return { status: 'sent' };
    } catch (e: any) {
      return { status: 'failed', error: String(e.message ?? e) };
    }
  }
}
```

### Spec — 9.3 `notify/rules.ts`（哪些 transition 要發）

```ts
import type { Incident, IncidentTransition, NotificationRule } from '../types';

interface DecideArgs {
  incident: Incident;
  transition: IncidentTransition;
  now: Date;
}

interface Decision {
  shouldSend: boolean;
  rule?: NotificationRule;
  reason?: string;
}

const THROTTLE_WINDOW_MS = 15 * 60 * 1000;

export function decideNotification(args: DecideArgs): Decision {
  const { incident, transition, now } = args;

  if (process.env.OPS_INBOX_NOTIFY_ENABLED !== 'true')
    return { shouldSend: false, reason: 'globally_disabled' };

  if (incident.environment === 'development')
    return { shouldSend: false, reason: 'env_development' };

  if (incident.status === 'ignored')
    return { shouldSend: false, reason: 'status_ignored' };

  // 規則優先級：critical > escalation > reopen > new
  if (transition.kind === 'severity_escalated')
    return { shouldSend: true, rule: 'severity_escalation' };

  if (transition.kind === 'reopened')
    return { shouldSend: true, rule: 'reopen' };

  if (transition.kind === 'new') {
    if (incident.severity === 'critical') return { shouldSend: true, rule: 'critical_immediate' };
    return { shouldSend: true, rule: 'new_incident_first_occurrence' };
  }

  // duplicate：除非 critical 且 throttle 視窗外才再發
  if (transition.kind === 'duplicate') {
    if (incident.severity !== 'critical') return { shouldSend: false, reason: 'duplicate_non_critical' };
    const lastSend = lastSentAt(incident, now);
    if (lastSend && now.getTime() - lastSend.getTime() < THROTTLE_WINDOW_MS) {
      return { shouldSend: false, reason: 'within_throttle_window' };
    }
    return { shouldSend: true, rule: 'critical_immediate' };
  }

  return { shouldSend: false, reason: 'unknown_transition' };
}

function lastSentAt(incident: Incident, now: Date): Date | null {
  const sent = incident.notification_log
    .filter((e) => e.status === 'sent')
    .map((e) => new Date(e.ts));
  if (!sent.length) return null;
  return sent.reduce((a, b) => (a > b ? a : b));
}
```

### Spec — 9.4 `notify/dispatcher.ts`

```ts
import * as Sentry from '@sentry/nextjs';
import { getSupabaseWriteClient } from '@/lib/supabase-server';
import type { Incident, IncidentTransition, NotificationLogEntry } from '../types';
import type { Notifier } from './types';
import { SlackNotifier } from './slack';
import { decideNotification } from './rules';

const NOTIFIERS: Notifier[] = [
  new SlackNotifier('slack:ops-incidents', process.env.OPS_INBOX_SLACK_INCIDENTS_WEBHOOK ?? ''),
  // 30 年內加 Discord / Email / PagerDuty 都在這裡擴。
];

export async function dispatchNotifications(args: { incident: Incident; transition: IncidentTransition }): Promise<void> {
  const decision = decideNotification({
    incident: args.incident, transition: args.transition, now: new Date(),
  });

  const publicUrl = process.env.OPS_INBOX_PUBLIC_URL ?? 'http://localhost:3000';

  // 即使 shouldSend = false 也要寫一筆 throttled log（用第一個 notifier 的 id）
  if (!decision.shouldSend) {
    await appendLog(args.incident.id, {
      channel: NOTIFIERS[0]?.id ?? 'unknown', rule: 'new_incident_first_occurrence',
      status: 'throttled', ts: new Date().toISOString(), reason: decision.reason,
    });
    return;
  }

  for (const notifier of NOTIFIERS) {
    try {
      const result = await notifier.send({ incident: args.incident, rule: decision.rule!, publicUrl });
      await appendLog(args.incident.id, {
        channel: notifier.id, rule: decision.rule!, status: result.status,
        ts: new Date().toISOString(),
        message_ts: result.externalRef, reason: result.reason, error: result.error,
      });
    } catch (e: any) {
      Sentry.captureException(e);
      await appendLog(args.incident.id, {
        channel: notifier.id, rule: decision.rule!, status: 'failed',
        ts: new Date().toISOString(), error: String(e.message ?? e),
      });
    }
  }
}

async function appendLog(incidentId: string, entry: NotificationLogEntry): Promise<void> {
  const supabase = getSupabaseWriteClient(); if (!supabase) return;
  const { data: cur } = await supabase.from('ops_incidents').select('notification_log').eq('id', incidentId).single();
  if (!cur) return;
  await supabase.from('ops_incidents').update({
    notification_log: [...(cur.notification_log as NotificationLogEntry[]), entry],
  }).eq('id', incidentId);
}
```

### Spec — 9.5 把 5 個 webhook handler 的 TODO B-5 換成呼叫

```ts
import { dispatchNotifications } from '@/lib/ops-inbox/notify/dispatcher';
// ...
  void (async () => {
    try {
      if (transition.kind === 'new') await triggerAutoClassify(upserted.id);
      await dispatchNotifications({ incident: upserted as Incident, transition });
    } catch (e) { Sentry.captureException(e); }
  })();
```

> 呼叫順序：先 auto-classify 再 dispatch（這樣 Slack 訊息有機會帶上 Gemini 摘要）。但實務上兩者並行也可以，差別只在第一次通知有沒有 AI summary。**B-5 寫成「先 auto-classify 等它完，再 dispatch」**比較穩定。

### Spec — 9.6 vitest `__tests__/rules.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { decideNotification } from '../rules';

const baseIncident: any = {
  environment: 'production', status: 'open', severity: 'medium',
  notification_log: [],
};

describe('decideNotification', () => {
  beforeEach(() => { process.env.OPS_INBOX_NOTIFY_ENABLED = 'true'; });

  it('respects globally_disabled', () => {
    process.env.OPS_INBOX_NOTIFY_ENABLED = 'false';
    expect(decideNotification({ incident: baseIncident, transition: { kind: 'new' }, now: new Date() }).shouldSend).toBe(false);
  });

  it('skips development env', () => {
    expect(decideNotification({
      incident: { ...baseIncident, environment: 'development' },
      transition: { kind: 'new' }, now: new Date(),
    }).shouldSend).toBe(false);
  });

  it('sends new incident', () => {
    const d = decideNotification({ incident: baseIncident, transition: { kind: 'new' }, now: new Date() });
    expect(d.shouldSend).toBe(true);
    expect(d.rule).toBe('new_incident_first_occurrence');
  });

  it('sends severity_escalation', () => {
    const d = decideNotification({
      incident: baseIncident,
      transition: { kind: 'severity_escalated', prevSeverity: 'medium', newSeverity: 'critical' },
      now: new Date(),
    });
    expect(d.rule).toBe('severity_escalation');
  });

  it('sends reopen', () => {
    const d = decideNotification({
      incident: baseIncident,
      transition: { kind: 'reopened', prevStatus: 'resolved' },
      now: new Date(),
    });
    expect(d.rule).toBe('reopen');
  });

  it('throttles non-critical duplicate', () => {
    const d = decideNotification({
      incident: baseIncident,
      transition: { kind: 'duplicate', prevSeverity: 'medium', prevStatus: 'open' },
      now: new Date(),
    });
    expect(d.shouldSend).toBe(false);
    expect(d.reason).toBe('duplicate_non_critical');
  });

  it('throttles critical duplicate within 15min window', () => {
    const now = new Date();
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const d = decideNotification({
      incident: { ...baseIncident, severity: 'critical', notification_log: [{ status: 'sent', ts: tenMinAgo }] },
      transition: { kind: 'duplicate', prevSeverity: 'critical', prevStatus: 'open' },
      now,
    });
    expect(d.shouldSend).toBe(false);
    expect(d.reason).toBe('within_throttle_window');
  });

  it('sends critical duplicate outside window', () => {
    const now = new Date();
    const twentyMinAgo = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
    const d = decideNotification({
      incident: { ...baseIncident, severity: 'critical', notification_log: [{ status: 'sent', ts: twentyMinAgo }] },
      transition: { kind: 'duplicate', prevSeverity: 'critical', prevStatus: 'open' },
      now,
    });
    expect(d.shouldSend).toBe(true);
    expect(d.rule).toBe('critical_immediate');
  });
});
```

### Acceptance（B-5 完成定義）

- [ ] `npm run build` 通過
- [ ] vitest `rules.test.ts` 全綠
- [ ] 觸發 1 個全新 Sentry incident → `#ops-incidents` 收到 1 條 Slack（含 fp 短碼 + Inbox 連結）
- [ ] **`#alerts-infra` 沒收到** Inbox 發的訊息（用 channel history 確認）
- [ ] 同 fingerprint 連送 5 次 → `#ops-incidents` 只收 1 條，DB `notification_log` 4 筆 `throttled` + 1 筆 `sent`
- [ ] severity 從 medium 升 critical 觸發 → 再發 1 條，message text 含 `ESCALATED`，log 規則 = `severity_escalation`
- [ ] 在 detail 頁手動 resolve 然後再送同 fingerprint → 收 1 條 `REOPENED`，`reopen_count` +1
- [ ] critical 第一次 → message 含 `<!here>`
- [ ] `OPS_INBOX_NOTIFY_ENABLED=false` 後再觸發 → Slack 不收，`notification_log` 有 `throttled, reason: globally_disabled`
- [ ] `environment=development` 的 incident（curl payload 改 environment 試）→ Slack 不收，log 有 `env_development`
- [ ] `Sentry.captureException` 在 Slack 發送失敗時被呼叫（手動把 webhook URL 改成壞的，看 Sentry 後台有沒有錯誤）

### Out of scope（B-5 不做）

- ❌ 不做 PagerDuty / Discord / Email（介面已開好，未來加）
- ❌ 不做 Slack thread reply / reaction（路線 C）
- ❌ 不做 message_ts 回追刪訊息（路線 C）

### Hand-off

到這裡 5 天工作包全部完成。跑 §10 整合驗收。

---

## §10 整合驗收（5 個工作包都完成後跑這個）

### 10.1 既有系統不退化

- [ ] `npm run build` 通過
- [ ] `https://app.aware-wave.com/` 仍正常打開
- [ ] `https://app.aware-wave.com/ops-console` 仍正常打開
- [ ] `https://app.aware-wave.com/api-check` 仍綠燈
- [ ] 既有 `/api/ops/*` 路由行為不變（手動驗 1–2 個）
- [ ] `git diff lib/supabase-server.ts` 仍空
- [ ] `git diff lib/ops-contracts.ts` 仍空
- [ ] `lib/ops-role.ts` 既有 export 簽章未變

### 10.2 端對端煙霧測（必跑全部）

```powershell
# 1) 觸發一筆全新 Sentry incident（用 §3.5 設好的 internal integration 發 test event）
# 2) 觀察：
#    - DB ops_incidents 增 1 筆
#    - 1–3 秒內 detail 頁 AI summary 區出現中文摘要
#    - Slack #ops-incidents 收到 1 條（含 fp 短碼）
#    - Inbox 列表頁出現這筆，sidebar 徽章紅/橙色
# 3) 點 detail 頁 [Open in Cursor] → 本地 Cursor 開新 chat 含 incident context
# 4) 點 detail 頁 [Ask ChatGPT] → 剪貼簿有 prompt + chatgpt.com 開新分頁
# 5) 在 detail 頁貼一段假 ChatGPT 回覆到 Paste box → Save → timeline 出現新一筆 manual-paste
# 6) Mark resolved → 列表預設看不到這筆
# 7) 從 Sentry 再觸發同樣 issue → Inbox reopen，#ops-incidents 收一條 REOPENED 訊息

# 8) 同來源連送 5 次同 fingerprint payload：
curl -X POST $env:OPS_INBOX_PUBLIC_URL/api/webhooks/sentry `
  -H "Authorization: Bearer $env:OPS_INBOX_INGEST_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"data":{"issue":{"id":"smoke-1","title":"smoke","level":"warning"},"event":{"event_id":"e","level":"warning","environment":"production"},"project_slug":"node-api"}}'
# 重複 5 次 → DB 仍 1 筆，#ops-incidents 仍 1 條，notification_log 4 筆 throttled

# 9) 升級 severity：把 payload 的 level 從 warning 改 fatal 再送 → 
#    收 1 條 ESCALATED 訊息，log 規則 = severity_escalation

# 10) 把 OPS_INBOX_NOTIFY_ENABLED 改成 false 重啟 dev → 再送一筆 → Slack 不收，DB 有
```

### 10.3 衝突檢核（每行對應 §1.4 的承諾）

```powershell
# 不該存在的命名
rg "OPS_INBOX_SUPABASE_" lobster-factory       # 應 0 行
rg "OPENAI_API_KEY|ANTHROPIC_API_KEY" lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox  # 應 0 行
rg "supabase/migrations/" lobster-factory       # 應 0 行（不應出現新目錄）

# 既有 export 仍在
rg "export function readOpsRole" lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-role.ts  # ≥ 1 行
rg "export function getSupabaseWriteClient" lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/supabase-server.ts  # ≥ 1 行
```

### 10.4 部署到 production VPS

- [ ] SSH SG `5.223.93.113`
- [ ] `vim /root/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/.env.production` 加所有 `OPS_INBOX_*`（從 driver 機 setx 值複製）
- [ ] `docker compose up -d next-admin --force-recreate`
- [ ] `curl https://app.aware-wave.com/api/ops/inbox/health` 回 200 + `{ ok: true, gemini_quota_used: 0, gemini_quota_limit: 1400 }`
- [ ] 在生產環境跑一次 §10.2 第 1–2 項煙霧測（確認 production webhook 端點通）

### 10.5 文件收斂

- [ ] 母計畫表 `Ops_Observability_PathB_Plan.md` 頂部加上「實作版住 `Ops_Observability_PathB_Implementation.md`」cross-link
- [ ] `AWARE_WAVE_CREDENTIALS.md §18` 同步：列出 `#ops-incidents` webhook + 所有 `OPS_INBOX_*` 變數名稱（值不入文件，只列名稱）
- [ ] 寫一份 `docs/ops-inbox-runbook.md`（30 行就好）：怎麼換 Slack 通道、怎麼輪 token、怎麼關掉某個 webhook 來源

---

## §11 結束 — 給操作者的 Sign-Off

5 個工作包完成 + §10 全綠 = 路線 B v1 上線。

接下來只有 1 件事是**定期該回頭看的**：母計畫表附錄 D「30-Year Stability Checklist」，**每年複查 1 次**（每年生日 / 公司週年都行）。

母計畫表（設計版）：`docs/Ops_Observability_PathB_Plan.md`  
本檔（執行版）：`docs/Ops_Observability_PathB_Implementation.md`

兩份檔的關係：
- 設計版 = 為什麼這樣做（含衝突分析、風險、附錄、未來升級路徑）
- 執行版 = 怎麼做（給 AI 接力的 6 個獨立工作包）

> 任何時候執行版與設計版**不一致** → 設計版優先；發現後立即同步執行版。
