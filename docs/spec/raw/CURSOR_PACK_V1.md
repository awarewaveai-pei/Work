**接貼給 Cursor 用的「Cursor Pack v1」**  
我已經幫你整理成：

* 每一段都是**可直接貼的 prompt**  
* 已經幫你拆好順序（不要一次全貼）  
* 每一段都有 **限制 \+ 輸出格式 \+ 驗收標準**

---

# **🧠 1️⃣ MASTER\_SYSTEM\_PROMPT.md（先貼這個）**

You are building "Lobster Factory", an AI-native multi-tenant Agency OS \+ Client OS platform.

\#\# Core Stack  
\- WordPress (Kadence \+ WooCommerce \+ FluentCRM \+ Fluent Forms)  
\- Supabase (Postgres, Auth, RLS, Storage)  
\- n8n (integration & automation)  
\- Durable workflow engine (Trigger.dev or Inngest)  
\- GitHub Actions (CI/CD)  
\- MCP Agents (AI execution layer)  
\- Sentry (errors & incidents)  
\- PostHog (analytics & feature flags)

\#\# System Philosophy  
\- This is NOT a website builder  
\- This is a Company-as-a-System platform  
\- Everything must be:  
  \- versioned  
  \- observable  
  \- reversible  
  \- multi-tenant safe

\#\# Core Rules  
1\. NEVER assume production automation is safe  
2\. All data must include:  
   \- organization\_id  
   \- workspace\_id (when applicable)  
3\. High-risk actions MUST require approval  
4\. All workflows must produce:  
   \- run\_id  
   \- logs  
   \- artifacts  
   \- status  
5\. Everything must support rollback  
6\. Prefer explicit schema over implicit logic

\#\# Architecture Layers  
\- Control Plane (auth, roles, billing, policy)  
\- Execution Plane (workflows, agents)  
\- Data Plane (Supabase)  
\- Observability (Sentry, logs)  
\- Decision Engine (evaluation \+ optimization)

\#\# Output Style  
\- Always produce structured output  
\- Prefer SQL / JSON / TypeScript over explanation  
\- Break work into phases  
\- Include acceptance criteria

\#\# Forbidden  
\- Do NOT auto-deploy to production  
\- Do NOT access secrets directly  
\- Do NOT skip validation steps

---

# **🧱 2️⃣ DATA MODEL PROMPT（先做資料庫）**

👉 第二步貼這個（很重要）

Task: Design and implement Phase 1 Supabase schema.

\#\# Scope  
Only implement core multi-tenant foundation:

Tables to create:  
\- organizations  
\- workspaces  
\- profiles  
\- organization\_memberships  
\- workspace\_memberships  
\- roles  
\- permissions  
\- role\_permissions  
\- user\_role\_assignments  
\- projects  
\- sites  
\- environments

\#\# Requirements  
\- Use UUID primary keys  
\- Add foreign keys  
\- Add indexes  
\- Include created\_at / updated\_at  
\- Include metadata jsonb fields where useful

\#\# Constraints  
\- Must support:  
  \- agency \+ client tenants  
  \- user in multiple organizations  
  \- site linked to project, workspace, org  
  \- environment types (staging, production)

\#\# DO NOT  
\- Implement full RLS yet  
\- Do NOT over-engineer

\#\# Output format  
1\. SQL migration file  
2\. Short explanation of relationships  
3\. Suggested next migration

\#\# Acceptance Criteria  
\- Can create agency org  
\- Can create client org  
\- User can belong to multiple orgs  
\- Site belongs to project and org  
\- Environment supports staging \+ production

---

# **⚙️ 3️⃣ WP FACTORY PROMPT（你的核心）**

👉 這個是你最重要的一段（wc-core）

Task: Design WordPress Factory workflow system.

\#\# Goal  
Implement automated WordPress site provisioning system.

\#\# Core Flow  
1\. Create staging  
2\. Install WordPress  
3\. Apply manifest (wc-core)  
4\. Install plugins:  
   \- Kadence theme  
   \- Kadence blocks  
   \- WooCommerce  
   \- CartFlows  
   \- RankMath  
   \- FluentCRM  
   \- FluentSMTP  
   \- Site Kit  
   \- LiteSpeed (conditional)  
5\. Run smoke tests  
6\. Generate report

\#\# Inputs  
\- site\_id  
\- environment\_id  
\- manifest\_id

\#\# Outputs  
\- install result  
\- plugin versions  
\- logs  
\- test results

\#\# Constraints  
\- Only allow staging environment  
\- Must support rollback  
\- Must log every step  
\- Must validate WP root

\#\# Output format  
1\. Workflow definition (JSON)  
2\. Step-by-step execution plan  
3\. Failure handling strategy

\#\# Acceptance Criteria  
\- Can create staging site  
\- Can install full wc-core stack  
\- Can detect install failure  
\- Can rollback if failure

---

# **🔄 4️⃣ WORKFLOW ROUTING PROMPT（超重要）**

👉 這會避免系統亂掉

Task: Define workflow routing system.

\#\# You must categorize all workflows into:

\#\#\# n8n (light automation)  
\- webhooks  
\- CRM sync  
\- notifications  
\- social posting

\#\#\# Durable workflows (Trigger.dev / Inngest)  
\- onboarding  
\- site creation  
\- deployment  
\- repair flows

\#\#\# GitHub Actions  
\- CI/CD  
\- testing  
\- PR validation

\#\#\# MCP Agents  
\- content generation  
\- bug diagnosis  
\- support replies  
\- proposal drafting

\#\# Output  
1\. Routing table  
2\. Decision rules  
3\. Example flows

\#\# Acceptance Criteria  
\- Each workflow has clear execution engine  
\- No overlap ambiguity  
\- High-risk flows NOT in n8n

---

# **🤖 5️⃣ AGENT SYSTEM PROMPT**

Task: Design AI agent system.

\#\# Agents  
\- site-builder-agent  
\- seo-agent  
\- content-agent  
\- support-agent  
\- repair-agent  
\- sales-agent

\#\# Each agent must have:  
\- versioning  
\- tool policy  
\- input/output schema  
\- cost tracking

\#\# Tool Constraints Example (repair-agent)  
\- can read logs  
\- can open PR  
\- CANNOT deploy production  
\- CANNOT access secrets  
\- CANNOT run destructive DB changes

\#\# Output  
1\. agent schema  
2\. tool policies JSON  
3\. example agent config

\#\# Acceptance Criteria  
\- agent actions are controlled  
\- no unsafe operations allowed  
\- supports versioning

---

# **🔐 6️⃣ APPROVAL SYSTEM PROMPT**

Task: Build approval system.

\#\# Must support:  
\- multi-step approval  
\- role-based approval  
\- risk-based approval

\#\# Example Rules  
\- production deploy → require admin  
\- refund → require finance  
\- contract send → require legal

\#\# Output  
1\. approval schema  
2\. approval workflow  
3\. example JSON rules

\#\# Acceptance Criteria  
\- high-risk actions blocked without approval  
\- approvals are auditable

---

# **💰 7️⃣ COST \+ DECISION ENGINE PROMPT**

Task: Build cost tracking \+ decision engine.

\#\# Must track:  
\- AI cost (tokens)  
\- hosting  
\- automation runs  
\- per client cost

\#\# Decision Engine must:  
\- analyze metrics  
\- suggest actions  
\- NOT auto-execute high-risk actions

\#\# Output  
1\. cost schema  
2\. decision schema  
3\. example decision JSON

\#\# Acceptance Criteria  
\- can calculate per-client profitability  
\- can suggest optimizations

---

# **📋 8️⃣ IMPLEMENTATION TASKS（直接叫 Cursor 跑）**

Phase 1:  
\- Supabase schema (core tables)

Phase 2:  
\- WP staging \+ manifest install

Phase 3:  
\- workflow system

Phase 4:  
\- agent system

Phase 5:  
\- approval system

Phase 6:  
\- cost \+ decision engine

Rules:  
\- Do NOT skip phases  
\- Each phase must be complete before next

For each phase output:  
1\. files created  
2\. explanation  
3\. next steps

Acceptance:  
\- system must be runnable after each phase

---

# **🚀 你現在怎麼用（超重要）**

👉 不要一次貼全部

## **正確順序：**

1. 貼 `MASTER_SYSTEM_PROMPT`  
2. 貼 `DATA MODEL`  
3. 等 Cursor 做完  
4. 再貼 `WP FACTORY`  
5. 再貼 workflow / agent

---

# **⚠️ 最關鍵提醒（真的重要）**

👉 你現在這套是：

# **❌ 一次叫 AI 做完整系統 → 會爆**

# **✅ 分 phase \+ 每步有驗收 → 才會成功**

---

# **如果你要更猛一點（下一步）**

我可以幫你做：

### **👉 Cursor Pack v2（進階版）**

* Supabase SQL 直接寫好  
* wc-core manifest JSON 完整版  
* n8n workflow JSON  
* Trigger.dev workflow code  
* MCP agent config  
* GitHub repo 結構

很好，這一版我會直接給你：

# **🔥 Cursor Pack v2（可直接開發版）**

這不是再講概念，而是：

👉 **你貼進 Cursor 就會開始寫 code 的等級**

內容包含：

* Supabase SQL（可直接用）  
* wc-core manifest（實際 JSON）  
* workflow routing（實際結構）  
* agent config（實際可用）  
* repo 結構  
* 第一批實作任務（工程級）

---

# **🧱 1️⃣ Supabase SQL（Phase 1 可直接用）**

👉 直接貼給 Cursor 生成 migration

\-- organizations

create table organizations (

  id uuid primary key default gen\_random\_uuid(),

  type text check (type in ('agency','client')),

  name text not null,

  slug text unique,

  status text default 'active',

  created\_at timestamptz default now(),

  updated\_at timestamptz default now()

);

\-- workspaces

create table workspaces (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid references organizations(id) on delete cascade,

  name text,

  slug text,

  created\_at timestamptz default now()

);

\-- profiles

create table profiles (

  id uuid primary key,

  email text,

  display\_name text,

  created\_at timestamptz default now()

);

\-- memberships

create table organization\_memberships (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid references organizations(id),

  user\_id uuid references profiles(id),

  role text,

  created\_at timestamptz default now()

);

\-- projects

create table projects (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid references organizations(id),

  workspace\_id uuid references workspaces(id),

  name text,

  status text,

  created\_at timestamptz default now()

);

\-- sites

create table sites (

  id uuid primary key default gen\_random\_uuid(),

  project\_id uuid references projects(id),

  organization\_id uuid references organizations(id),

  name text,

  domain text,

  status text,

  created\_at timestamptz default now()

);

\-- environments

create table environments (

  id uuid primary key default gen\_random\_uuid(),

  site\_id uuid references sites(id),

  type text check (type in ('staging','production')),

  base\_url text,

  status text,

  created\_at timestamptz default now()

);

---

# **⚙️ 2️⃣ wc-core manifest（你的一鍵核心）**

👉 這個是你整個商業模式的核心 JSON

{

  "name": "wc-core",

  "version": "1.0.0",

  "target": "staging-only",

  "steps": \[

    {

      "type": "install\_theme",

      "slug": "kadence"

    },

    {

      "type": "install\_plugin",

      "slug": "woocommerce"

    },

    {

      "type": "install\_plugin",

      "slug": "cartflows"

    },

    {

      "type": "install\_plugin",

      "slug": "seo-by-rank-math"

    },

    {

      "type": "install\_plugin",

      "slug": "fluent-crm"

    },

    {

      "type": "install\_plugin",

      "slug": "fluent-smtp"

    },

    {

      "type": "install\_plugin",

      "slug": "google-site-kit"

    },

    {

      "type": "conditional\_plugin",

      "condition": "litespeed\_server",

      "slug": "litespeed-cache"

    }

  \],

  "post\_install": \[

    "flush\_permalinks",

    "set\_timezone",

    "activate\_theme"

  \],

  "verification": \[

    "check\_plugin\_active",

    "check\_homepage\_loads",

    "check\_admin\_login"

  \],

  "rollback": {

    "strategy": "restore\_backup"

  }

}

---

# **🔄 3️⃣ Workflow（可直接轉 Trigger.dev / n8n）**

{

  "workflow": "create\_wp\_site",

  "steps": \[

    "create\_environment",

    "install\_wordpress",

    "apply\_manifest\_wc\_core",

    "run\_smoke\_tests",

    "generate\_report"

  \],

  "failure\_handling": {

    "retry": 2,

    "rollback": true,

    "alert": true

  }

}

---

# **🤖 4️⃣ Agent Config（可直接用）**

{

  "agent": "repair-agent",

  "version": "1.0",

  "allowed\_tools": \[

    "read\_logs",

    "analyze\_code",

    "create\_patch",

    "open\_pr"

  \],

  "denied\_tools": \[

    "deploy\_production",

    "read\_secrets",

    "drop\_database"

  \],

  "max\_steps": 10,

  "requires\_approval\_for": \[

    "production\_change"

  \]

}

---

# **🧠 5️⃣ Decision Engine（實際格式）**

{

  "decision": {

    "type": "optimize\_seo",

    "target": "site\_123",

    "reason": "traffic\_drop",

    "actions": \[

      "rewrite\_content",

      "add\_internal\_links"

    \],

    "priority": "high"

  }

}

---

# **📁 6️⃣ Repo 結構（直接給 Cursor）**

/agency-os

  /apps

    /api

    /worker

  /packages

    /db

    /workflows

    /agents

    /manifests

  /templates

    /woocommerce

  /scripts

    install-from-manifest.sh

---

# **🧪 7️⃣ 第一個實作任務（直接貼 Cursor）**

Task: Build WP staging creation system

Steps:

1\. Create environment record

2\. Call hosting API

3\. Install WordPress

4\. Store credentials

5\. Return site URL

Output:

\- TypeScript service

\- DB integration

\- logs

Acceptance:

\- Can create staging site

\- Can login WP admin

\- Can store environment in DB

---

# **🔥 8️⃣ 第二個任務（wc-core 安裝）**

Task: Implement wc-core installer

Requirements:

\- Read manifest JSON

\- Execute steps sequentially

\- Install plugins via WP CLI

\- Activate plugins

\- Run verification

Output:

\- CLI script

\- logs

\- result JSON

Acceptance:

\- All plugins installed

\- No fatal error

\- Verification passes

---

# **🚀 9️⃣ 第三個任務（最重要）**

Task: Connect CRM → Site → Automation

Flow:

\- FluentCRM new user

→ trigger webhook

→ create project

→ create site

→ run wc-core

→ send onboarding email

Acceptance:

\- end-to-end flow works

\- no manual steps required

---

# **🧠 最重要的使用方式**

👉 你現在這樣用 Cursor：

## **❌ 錯誤**

一次貼全部 → 要他做整個系統

## **✅ 正確（很關鍵）**

1️⃣ 貼 MASTER PROMPT  
2️⃣ 貼 SQL → 讓他建 DB  
3️⃣ 貼 WP 任務 → 讓他建建站  
4️⃣ 再慢慢加 workflow / agent

---

# **⚠️ 現實提醒（這句一定要看）**

👉 你現在這套已經是：

# **👉 創業級系統（不是玩具）**

會卡的地方一定是：

* workflow orchestration  
* WordPress automation  
* multi-tenant RLS  
* agent control（最容易爆）

---

# **🚀 下一步（如果你要更狠）**

我可以幫你直接做到：

### **👉 Cursor Pack v3（Production級）**

* 真正可跑的 Supabase migration（完整）  
* WP CLI installer script（完整）  
* n8n workflow JSON（可匯入）  
* Trigger.dev code（完整）  
* agent \+ policy engine（可執行）  
* Decision Engine（初版可跑）

---

下面是 **Cursor Pack v3**。  
這版直接偏向「可開工」，你可以分檔貼給 Cursor。

---

# **1\. `000_MASTER_PROMPT.md`**

You are implementing "Lobster Factory", a multi-tenant Agency OS / Client OS platform.

Primary stack:  
\- WordPress \+ Kadence \+ WooCommerce \+ FluentCRM \+ Fluent Forms  
\- Supabase (Postgres, Auth, RLS, Storage)  
\- n8n for light integrations  
\- Trigger.dev for durable long-running workflows  
\- GitHub Actions for CI/CD  
\- MCP-style agents for content, repair, reporting, sales assistance  
\- Sentry for incidents  
\- PostHog for analytics and feature flags

Core product goals:  
1\. Create client organizations and workspaces  
2\. Create WordPress staging sites  
3\. Apply wc-core manifest safely  
4\. Run smoke tests  
5\. Support CRM-driven onboarding  
6\. Version packages, prompts, templates, agents, workflows  
7\. Track runs, incidents, approvals, costs, and decisions

Non-negotiable rules:  
\- Never auto-deploy to production by default  
\- All tenant-bound records must include organization\_id  
\- Use workspace\_id where applicable  
\- High-risk actions require explicit approval records  
\- All workflows must write run records  
\- All critical operations must be reversible or explicitly marked non-reversible  
\- Prefer explicit schemas over implicit assumptions  
\- Prefer small phases and acceptance criteria  
\- Use TypeScript for application code  
\- Use SQL migrations for database changes  
\- Use Zod for runtime validation where appropriate

Architecture rules:  
\- Supabase is the system of record for platform data  
\- WordPress is the runtime delivery surface for sites and CRM operations  
\- n8n is for light automations, webhooks, sync, notifications  
\- Trigger.dev is for durable workflows like provisioning, install, repair, onboarding  
\- GitHub Actions is for CI/CD and validation  
\- Agents must have tool allowlists and deny-lists  
\- Secrets must never be exposed in logs or output

When generating code:  
\- Include file paths  
\- Include comments sparingly but clearly  
\- Include acceptance criteria  
\- Include next steps only if necessary

---

# **2\. `001_REPO_STRUCTURE.md`**

Recommended monorepo structure:

agency-os/  
  apps/  
    api/  
      src/  
        index.ts  
        config/  
        lib/  
        routes/  
        services/  
        db/  
        types/  
    worker/  
      src/  
        index.ts  
        jobs/  
        triggers/  
        activities/  
        agents/  
  packages/  
    db/  
      migrations/  
      schemas/  
      sql/  
      src/  
        client.ts  
        types.ts  
    workflows/  
      src/  
        trigger/  
          create-wp-site.ts  
          apply-manifest.ts  
          client-onboarding.ts  
          repair-incident.ts  
    agents/  
      src/  
        configs/  
        repair-agent.ts  
        seo-agent.ts  
        support-agent.ts  
    manifests/  
      wc-core.json  
      wc-crm.json  
      wc-membership.json  
    policies/  
      approval/  
      tool/  
      rollout/  
    shared/  
      src/  
        zod/  
        constants/  
        logger/  
        env/  
  templates/  
    wordpress/  
      kadence/  
      pages/  
      reusable-blocks/  
    woocommerce/  
      manifests/  
      scripts/  
        install-from-manifest.sh  
        smoke-test.sh  
  infra/  
    github/  
      workflows/  
    n8n/  
      exports/  
    trigger/  
      config/  
  docs/  
    MASTER\_SPEC.md  
    RUNBOOKS.md  
    INCIDENTS.md  
  .env.example  
  package.json  
  turbo.json  
  pnpm-workspace.yaml

---

# **3\. `packages/db/migrations/0001_core.sql`**

create extension if not exists pgcrypto;

create table if not exists organizations (  
  id uuid primary key default gen\_random\_uuid(),  
  type text not null check (type in ('agency', 'client')),  
  name text not null,  
  slug text not null unique,  
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),  
  default\_locale text not null default 'en',  
  default\_timezone text not null default 'UTC',  
  metadata jsonb not null default '{}'::jsonb,  
  created\_at timestamptz not null default now(),  
  updated\_at timestamptz not null default now()  
);

create table if not exists workspaces (  
  id uuid primary key default gen\_random\_uuid(),  
  organization\_id uuid not null references organizations(id) on delete cascade,  
  name text not null,  
  slug text not null,  
  workspace\_type text not null default 'default',  
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),  
  metadata jsonb not null default '{}'::jsonb,  
  created\_at timestamptz not null default now(),  
  updated\_at timestamptz not null default now(),  
  unique (organization\_id, slug)  
);

create table if not exists profiles (  
  id uuid primary key,  
  email text not null unique,  
  display\_name text,  
  avatar\_url text,  
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),  
  default\_organization\_id uuid references organizations(id) on delete set null,  
  metadata jsonb not null default '{}'::jsonb,  
  created\_at timestamptz not null default now(),  
  updated\_at timestamptz not null default now()  
);

create table if not exists organization\_memberships (  
  id uuid primary key default gen\_random\_uuid(),  
  organization\_id uuid not null references organizations(id) on delete cascade,  
  user\_id uuid not null references profiles(id) on delete cascade,  
  membership\_type text not null default 'member',  
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),  
  joined\_at timestamptz not null default now(),  
  metadata jsonb not null default '{}'::jsonb,  
  unique (organization\_id, user\_id)  
);

create table if not exists workspace\_memberships (  
  id uuid primary key default gen\_random\_uuid(),  
  workspace\_id uuid not null references workspaces(id) on delete cascade,  
  user\_id uuid not null references profiles(id) on delete cascade,  
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),  
  metadata jsonb not null default '{}'::jsonb,  
  unique (workspace\_id, user\_id)  
);

create table if not exists roles (  
  id uuid primary key default gen\_random\_uuid(),  
  organization\_id uuid references organizations(id) on delete cascade,  
  name text not null,  
  scope\_type text not null check (scope\_type in ('system', 'organization', 'workspace', 'project', 'site')),  
  description text,  
  is\_system boolean not null default false,  
  created\_at timestamptz not null default now(),  
  updated\_at timestamptz not null default now(),  
  unique (organization\_id, name, scope\_type)  
);

create table if not exists permissions (  
  id uuid primary key default gen\_random\_uuid(),  
  resource\_type text not null,  
  action text not null,  
  risk\_level text not null check (risk\_level in ('low', 'medium', 'high')),  
  description text,  
  unique (resource\_type, action)  
);

create table if not exists role\_permissions (  
  role\_id uuid not null references roles(id) on delete cascade,  
  permission\_id uuid not null references permissions(id) on delete cascade,  
  constraints jsonb not null default '{}'::jsonb,  
  primary key (role\_id, permission\_id)  
);

create table if not exists user\_role\_assignments (  
  id uuid primary key default gen\_random\_uuid(),  
  user\_id uuid not null references profiles(id) on delete cascade,  
  role\_id uuid not null references roles(id) on delete cascade,  
  organization\_id uuid references organizations(id) on delete cascade,  
  workspace\_id uuid references workspaces(id) on delete cascade,  
  granted\_by uuid references profiles(id) on delete set null,  
  granted\_at timestamptz not null default now(),  
  expires\_at timestamptz,  
  metadata jsonb not null default '{}'::jsonb  
);

create table if not exists projects (  
  id uuid primary key default gen\_random\_uuid(),  
  organization\_id uuid not null references organizations(id) on delete cascade,  
  workspace\_id uuid not null references workspaces(id) on delete cascade,  
  client\_organization\_id uuid references organizations(id) on delete set null,  
  name text not null,  
  project\_type text not null default 'wordpress',  
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),  
  owner\_user\_id uuid references profiles(id) on delete set null,  
  start\_date date,  
  target\_launch\_date date,  
  metadata jsonb not null default '{}'::jsonb,  
  created\_at timestamptz not null default now(),  
  updated\_at timestamptz not null default now()  
);

create table if not exists sites (  
  id uuid primary key default gen\_random\_uuid(),  
  organization\_id uuid not null references organizations(id) on delete cascade,  
  workspace\_id uuid not null references workspaces(id) on delete cascade,  
  project\_id uuid not null references projects(id) on delete cascade,  
  site\_type text not null default 'woocommerce',  
  name text not null,  
  primary\_domain text,  
  locale text not null default 'en',  
  status text not null default 'draft' check (status in ('draft', 'staging', 'live', 'paused', 'archived')),  
  theme\_family text not null default 'kadence',  
  stack\_profile text not null default 'wc-core',  
  metadata jsonb not null default '{}'::jsonb,  
  created\_at timestamptz not null default now(),  
  updated\_at timestamptz not null default now()  
);

create table if not exists environments (  
  id uuid primary key default gen\_random\_uuid(),  
  organization\_id uuid not null references organizations(id) on delete cascade,  
  workspace\_id uuid not null references workspaces(id) on delete cascade,  
  site\_id uuid not null references sites(id) on delete cascade,  
  environment\_type text not null check (environment\_type in ('local', 'staging', 'production', 'preview')),  
  name text not null,  
  base\_url text,  
  hosting\_provider text,  
  server\_ref text,  
  status text not null default 'pending' check (status in ('pending', 'provisioning', 'ready', 'failed', 'archived')),  
  wp\_root\_path text,  
  credentials\_ref text,  
  last\_health\_status text,  
  metadata jsonb not null default '{}'::jsonb,  
  created\_at timestamptz not null default now(),  
  updated\_at timestamptz not null default now()  
);

create index if not exists idx\_workspaces\_org\_id on workspaces(organization\_id);  
create index if not exists idx\_org\_memberships\_org\_id on organization\_memberships(organization\_id);  
create index if not exists idx\_org\_memberships\_user\_id on organization\_memberships(user\_id);  
create index if not exists idx\_workspace\_memberships\_workspace\_id on workspace\_memberships(workspace\_id);  
create index if not exists idx\_user\_role\_assignments\_user\_id on user\_role\_assignments(user\_id);  
create index if not exists idx\_projects\_org\_ws on projects(organization\_id, workspace\_id);  
create index if not exists idx\_sites\_org\_ws on sites(organization\_id, workspace\_id);  
create index if not exists idx\_environments\_site\_id on environments(site\_id);

---

# **4\. `packages/db/migrations/0002_factory.sql`**

create table if not exists packages (  
  id uuid primary key default gen\_random\_uuid(),  
  scope\_type text not null check (scope\_type in ('global', 'agency', 'client')),  
  scope\_id uuid,  
  name text not null,  
  slug text not null,  
  package\_type text not null default 'wordpress',  
  description text,  
  status text not null default 'active' check (status in ('draft', 'active', 'deprecated', 'archived')),  
  default\_version text not null,  
  metadata jsonb not null default '{}'::jsonb,  
  created\_at timestamptz not null default now(),  
  updated\_at timestamptz not null default now(),  
  unique (scope\_type, scope\_id, slug)  
);

create table if not exists package\_versions (  
  id uuid primary key default gen\_random\_uuid(),  
  package\_id uuid not null references packages(id) on delete cascade,  
  version text not null,  
  changelog text,  
  compatibility jsonb not null default '{}'::jsonb,  
  status text not null default 'active' check (status in ('draft', 'active', 'deprecated', 'archived')),  
  artifact\_ref text,  
  created\_at timestamptz not null default now(),  
  created\_by uuid references profiles(id) on delete set null,  
  metadata jsonb not null default '{}'::jsonb,  
  unique (package\_id, version)  
);

create table if not exists manifests (  
  id uuid primary key default gen\_random\_uuid(),  
  package\_version\_id uuid not null references package\_versions(id) on delete cascade,  
  schema\_version text not null,  
  manifest\_json jsonb not null,  
  install\_guardrails jsonb not null default '{}'::jsonb,  
  dependencies jsonb not null default '\[\]'::jsonb,  
  conflicts jsonb not null default '\[\]'::jsonb,  
  rollback\_hints jsonb not null default '{}'::jsonb,  
  status text not null default 'active' check (status in ('draft', 'active', 'deprecated', 'archived')),  
  created\_at timestamptz not null default now(),  
  updated\_at timestamptz not null default now()  
);

create table if not exists workflows (  
  id uuid primary key default gen\_random\_uuid(),  
  scope\_type text not null check (scope\_type in ('global', 'agency', 'client')),  
  scope\_id uuid,  
  name text not null,  
  slug text not null,  
  domain text not null,  
  orchestrator\_type text not null check (orchestrator\_type in ('n8n', 'durable', 'github\_actions', 'mcp', 'manual')),  
  risk\_level text not null check (risk\_level in ('low', 'medium', 'high')),  
  status text not null default 'active',  
  default\_version text not null,  
  input\_schema jsonb not null default '{}'::jsonb,  
  output\_schema jsonb not null default '{}'::jsonb,  
  approval\_policy\_id uuid,  
  rollback\_strategy jsonb not null default '{}'::jsonb,  
  metadata jsonb not null default '{}'::jsonb,  
  created\_at timestamptz not null default now(),  
  updated\_at timestamptz not null default now(),  
  unique (scope\_type, scope\_id, slug)  
);

create table if not exists workflow\_versions (  
  id uuid primary key default gen\_random\_uuid(),  
  workflow\_id uuid not null references workflows(id) on delete cascade,  
  version text not null,  
  definition\_ref text not null,  
  routing\_config jsonb not null default '{}'::jsonb,  
  trigger\_config jsonb not null default '{}'::jsonb,  
  guardrails jsonb not null default '{}'::jsonb,  
  status text not null default 'active',  
  created\_at timestamptz not null default now(),  
  metadata jsonb not null default '{}'::jsonb,  
  unique (workflow\_id, version)  
);

create table if not exists workflow\_runs (  
  id uuid primary key default gen\_random\_uuid(),  
  workflow\_version\_id uuid not null references workflow\_versions(id) on delete cascade,  
  organization\_id uuid not null references organizations(id) on delete cascade,  
  workspace\_id uuid references workspaces(id) on delete cascade,  
  project\_id uuid references projects(id) on delete cascade,  
  site\_id uuid references sites(id) on delete cascade,  
  environment\_id uuid references environments(id) on delete cascade,  
  parent\_run\_id uuid references workflow\_runs(id) on delete set null,  
  trigger\_type text not null,  
  trigger\_ref text,  
  actor\_type text not null check (actor\_type in ('human', 'agent', 'webhook', 'schedule', 'system')),  
  actor\_ref text,  
  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'blocked', 'cancelled')),  
  risk\_level text not null check (risk\_level in ('low', 'medium', 'high')),  
  input\_snapshot jsonb not null default '{}'::jsonb,  
  output\_snapshot jsonb not null default '{}'::jsonb,  
  artifacts jsonb not null default '\[\]'::jsonb,  
  started\_at timestamptz not null default now(),  
  ended\_at timestamptz,  
  cost\_amount numeric,  
  cost\_currency text,  
  decision\_id uuid,  
  incident\_id uuid,  
  approval\_id uuid,  
  metadata jsonb not null default '{}'::jsonb  
);

create table if not exists package\_install\_runs (  
  id uuid primary key default gen\_random\_uuid(),  
  organization\_id uuid not null references organizations(id) on delete cascade,  
  workspace\_id uuid not null references workspaces(id) on delete cascade,  
  site\_id uuid not null references sites(id) on delete cascade,  
  environment\_id uuid not null references environments(id) on delete cascade,  
  package\_version\_id uuid not null references package\_versions(id) on delete cascade,  
  manifest\_id uuid not null references manifests(id) on delete cascade,  
  workflow\_run\_id uuid references workflow\_runs(id) on delete set null,  
  triggered\_by\_user\_id uuid references profiles(id) on delete set null,  
  triggered\_by\_agent\_id uuid,  
  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'rolled\_back')),  
  started\_at timestamptz not null default now(),  
  ended\_at timestamptz,  
  result\_summary jsonb not null default '{}'::jsonb,  
  logs\_ref text,  
  rollback\_run\_id uuid,  
  metadata jsonb not null default '{}'::jsonb  
);

create index if not exists idx\_workflow\_runs\_org on workflow\_runs(organization\_id);  
create index if not exists idx\_workflow\_runs\_site on workflow\_runs(site\_id);  
create index if not exists idx\_pkg\_install\_runs\_site on package\_install\_runs(site\_id);

---

# **5\. `packages/db/migrations/0003_agents_approvals_observability.sql`**

create table if not exists policies (  
  id uuid primary key default gen\_random\_uuid(),  
  scope\_type text not null check (scope\_type in ('global', 'agency', 'client')),  
  scope\_id uuid,  
  name text not null,  
  slug text not null,  
  policy\_domain text not null,  
  status text not null default 'active',  
  default\_version text not null,  
  metadata jsonb not null default '{}'::jsonb,  
  created\_at timestamptz not null default now(),  
  updated\_at timestamptz not null default now(),  
  unique (scope\_type, scope\_id, slug)  
);

create table if not exists policy\_versions (  
  id uuid primary key default gen\_random\_uuid(),  
  policy\_id uuid not null references policies(id) on delete cascade,  
  version text not null,  
  rules jsonb not null default '{}'::jsonb,  
  risk\_matrix jsonb not null default '{}'::jsonb,  
  enforcement\_mode text not null check (enforcement\_mode in ('advisory', 'soft\_block', 'hard\_block')),  
  status text not null default 'active',  
  created\_at timestamptz not null default now(),  
  metadata jsonb not null default '{}'::jsonb,  
  unique (policy\_id, version)  
);

create table if not exists approval\_policies (  
  id uuid primary key default gen\_random\_uuid(),  
  name text not null,  
  slug text not null unique,  
  scope\_type text not null check (scope\_type in ('global', 'agency', 'client')),  
  scope\_id uuid,  
  resource\_type text not null,  
  rules jsonb not null default '{}'::jsonb,  
  status text not null default 'active',  
  created\_at timestamptz not null default now(),  
  updated\_at timestamptz not null default now()  
);

create table if not exists approvals (  
  id uuid primary key default gen\_random\_uuid(),  
  approval\_policy\_id uuid not null references approval\_policies(id) on delete cascade,  
  resource\_type text not null,  
  resource\_id uuid not null,  
  organization\_id uuid not null references organizations(id) on delete cascade,  
  workspace\_id uuid references workspaces(id) on delete cascade,  
  status text not null check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),  
  requested\_by uuid references profiles(id) on delete set null,  
  requested\_at timestamptz not null default now(),  
  resolved\_at timestamptz,  
  resolution\_notes text,  
  metadata jsonb not null default '{}'::jsonb  
);

create table if not exists approval\_steps (  
  id uuid primary key default gen\_random\_uuid(),  
  approval\_id uuid not null references approvals(id) on delete cascade,  
  step\_order integer not null,  
  approver\_user\_id uuid references profiles(id) on delete set null,  
  approver\_role\_id uuid references roles(id) on delete set null,  
  status text not null check (status in ('pending', 'approved', 'rejected', 'skipped')),  
  acted\_at timestamptz,  
  notes text,  
  metadata jsonb not null default '{}'::jsonb  
);

create table if not exists agents (  
  id uuid primary key default gen\_random\_uuid(),  
  scope\_type text not null check (scope\_type in ('global', 'agency', 'client')),  
  scope\_id uuid,  
  name text not null,  
  slug text not null,  
  agent\_domain text not null,  
  agent\_type text not null,  
  status text not null default 'active',  
  default\_version text not null,  
  description text,  
  metadata jsonb not null default '{}'::jsonb,  
  created\_at timestamptz not null default now(),  
  updated\_at timestamptz not null default now(),  
  unique (scope\_type, scope\_id, slug)  
);

create table if not exists tool\_policies (  
  id uuid primary key default gen\_random\_uuid(),  
  name text not null,  
  description text,  
  allowed\_tools jsonb not null default '\[\]'::jsonb,  
  denied\_tools jsonb not null default '\[\]'::jsonb,  
  max\_steps integer,  
  max\_cost numeric,  
  requires\_approval\_for jsonb not null default '\[\]'::jsonb,  
  environment\_constraints jsonb not null default '{}'::jsonb,  
  status text not null default 'active',  
  created\_at timestamptz not null default now(),  
  updated\_at timestamptz not null default now()  
);

create table if not exists agent\_versions (  
  id uuid primary key default gen\_random\_uuid(),  
  agent\_id uuid not null references agents(id) on delete cascade,  
  version text not null,  
  system\_prompt\_ref uuid,  
  tool\_policy\_id uuid references tool\_policies(id) on delete set null,  
  input\_schema jsonb not null default '{}'::jsonb,  
  output\_schema jsonb not null default '{}'::jsonb,  
  model\_config jsonb not null default '{}'::jsonb,  
  safety\_config jsonb not null default '{}'::jsonb,  
  status text not null default 'active',  
  created\_at timestamptz not null default now(),  
  metadata jsonb not null default '{}'::jsonb,  
  unique (agent\_id, version)  
);

create table if not exists agent\_runs (  
  id uuid primary key default gen\_random\_uuid(),  
  agent\_version\_id uuid not null references agent\_versions(id) on delete cascade,  
  workflow\_run\_id uuid references workflow\_runs(id) on delete set null,  
  organization\_id uuid not null references organizations(id) on delete cascade,  
  workspace\_id uuid references workspaces(id) on delete cascade,  
  project\_id uuid references projects(id) on delete cascade,  
  site\_id uuid references sites(id) on delete cascade,  
  environment\_id uuid references environments(id) on delete cascade,  
  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'blocked')),  
  goal text not null,  
  input\_snapshot jsonb not null default '{}'::jsonb,  
  output\_snapshot jsonb not null default '{}'::jsonb,  
  tool\_trace jsonb not null default '\[\]'::jsonb,  
  evaluation\_summary jsonb not null default '{}'::jsonb,  
  started\_at timestamptz not null default now(),  
  ended\_at timestamptz,  
  cost\_amount numeric,  
  cost\_breakdown jsonb not null default '{}'::jsonb,  
  metadata jsonb not null default '{}'::jsonb  
);

create table if not exists incidents (  
  id uuid primary key default gen\_random\_uuid(),  
  organization\_id uuid not null references organizations(id) on delete cascade,  
  workspace\_id uuid references workspaces(id) on delete cascade,  
  project\_id uuid references projects(id) on delete cascade,  
  site\_id uuid references sites(id) on delete cascade,  
  environment\_id uuid references environments(id) on delete cascade,  
  domain text not null,  
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),  
  status text not null check (status in ('open', 'investigating', 'mitigated', 'resolved')),  
  title text not null,  
  summary text not null,  
  root\_cause\_summary text,  
  first\_seen\_at timestamptz not null default now(),  
  last\_seen\_at timestamptz not null default now(),  
  resolved\_at timestamptz,  
  sentry\_issue\_ref text,  
  metadata jsonb not null default '{}'::jsonb  
);

create table if not exists error\_events (  
  id uuid primary key default gen\_random\_uuid(),  
  incident\_id uuid references incidents(id) on delete set null,  
  organization\_id uuid not null references organizations(id) on delete cascade,  
  site\_id uuid references sites(id) on delete cascade,  
  environment\_id uuid references environments(id) on delete cascade,  
  source\_type text not null,  
  source\_ref text,  
  error\_code text,  
  error\_message text not null,  
  trace\_ref text,  
  event\_payload jsonb not null default '{}'::jsonb,  
  occurred\_at timestamptz not null default now(),  
  metadata jsonb not null default '{}'::jsonb  
);

---

# **6\. `packages/db/migrations/0004_rls_helpers.sql`**

create or replace function current\_user\_id()  
returns uuid  
language sql  
stable  
as $$  
  select auth.uid()::uuid  
$$;

create or replace function user\_has\_org\_access(org\_id uuid)  
returns boolean  
language sql  
stable  
as $$  
  select exists (  
    select 1  
    from organization\_memberships om  
    where om.organization\_id \= org\_id  
      and om.user\_id \= auth.uid()::uuid  
      and om.status \= 'active'  
  )  
$$;

create or replace function user\_has\_workspace\_access(ws\_id uuid)  
returns boolean  
language sql  
stable  
as $$  
  select exists (  
    select 1  
    from workspace\_memberships wm  
    where wm.workspace\_id \= ws\_id  
      and wm.user\_id \= auth.uid()::uuid  
      and wm.status \= 'active'  
  )  
$$;

alter table organizations enable row level security;  
alter table workspaces enable row level security;  
alter table projects enable row level security;  
alter table sites enable row level security;  
alter table environments enable row level security;

create policy organizations\_select on organizations  
for select  
using (  
  user\_has\_org\_access(id)  
);

create policy workspaces\_select on workspaces  
for select  
using (  
  user\_has\_org\_access(organization\_id)  
);

create policy projects\_select on projects  
for select  
using (  
  user\_has\_org\_access(organization\_id)  
);

create policy sites\_select on sites  
for select  
using (  
  user\_has\_org\_access(organization\_id)  
);

create policy environments\_select on environments  
for select  
using (  
  user\_has\_org\_access(organization\_id)  
);

---

# **7\. `packages/manifests/wc-core.json`**

{  
  "name": "wc-core",  
  "version": "1.0.0",  
  "schemaVersion": "1.0.0",  
  "target": "staging-only",  
  "description": "Base WooCommerce \+ Kadence \+ FluentCRM stack",  
  "guardrails": {  
    "allowEnvironments": \["staging"\],  
    "requireBackup": true,  
    "blockIfProduction": true  
  },  
  "dependencies": \[\],  
  "conflicts": \[\],  
  "steps": \[  
    { "id": "theme-kadence", "type": "install\_theme", "slug": "kadence" },  
    { "id": "plugin-kadence-blocks", "type": "install\_plugin", "slug": "kadence-blocks" },  
    { "id": "plugin-woocommerce", "type": "install\_plugin", "slug": "woocommerce" },  
    { "id": "plugin-cartflows", "type": "install\_plugin", "slug": "cartflows" },  
    { "id": "plugin-rank-math", "type": "install\_plugin", "slug": "seo-by-rank-math" },  
    { "id": "plugin-fluent-crm", "type": "install\_plugin", "slug": "fluent-crm" },  
    { "id": "plugin-fluent-forms", "type": "install\_plugin", "slug": "fluentform" },  
    { "id": "plugin-fluent-smtp", "type": "install\_plugin", "slug": "fluent-smtp" },  
    { "id": "plugin-site-kit", "type": "install\_plugin", "slug": "google-site-kit" },  
    {  
      "id": "plugin-litespeed",  
      "type": "conditional\_plugin",  
      "condition": "is\_litespeed",  
      "slug": "litespeed-cache"  
    }  
  \],  
  "postInstall": \[  
    { "type": "activate\_theme", "slug": "kadence" },  
    { "type": "flush\_permalinks" },  
    { "type": "set\_option", "key": "timezone\_string", "value": "Asia/Taipei" }  
  \],  
  "verification": \[  
    { "type": "check\_homepage" },  
    { "type": "check\_admin\_login" },  
    { "type": "check\_plugin\_active", "slug": "woocommerce" },  
    { "type": "check\_plugin\_active", "slug": "fluent-crm" }  
  \],  
  "rollback": {  
    "strategy": "restore\_backup\_snapshot"  
  }  
}

---

# **8\. `templates/woocommerce/scripts/install-from-manifest.sh`**

\#\!/usr/bin/env bash  
set \-euo pipefail

WP\_ROOT="${1:-}"  
MANIFEST\_PATH="${2:-}"

if \[\[ \-z "$WP\_ROOT" || \-z "$MANIFEST\_PATH" \]\]; then  
  echo "Usage: ./install-from-manifest.sh \<WP\_ROOT\> \<MANIFEST\_PATH\>"  
  exit 1  
fi

if \[\[ \! \-f "$WP\_ROOT/wp-config.php" \]\]; then  
  echo "ERROR: wp-config.php not found in $WP\_ROOT"  
  exit 1  
fi

if \[\[ \! \-f "$MANIFEST\_PATH" \]\]; then  
  echo "ERROR: manifest not found at $MANIFEST\_PATH"  
  exit 1  
fi

command \-v jq \>/dev/null 2\>&1 || { echo "ERROR: jq is required"; exit 1; }  
command \-v wp \>/dev/null 2\>&1 || { echo "ERROR: wp-cli is required"; exit 1; }

cd "$WP\_ROOT"

TARGET=$(jq \-r '.target' "$MANIFEST\_PATH")  
if \[\[ "$TARGET" \!= "staging-only" \]\]; then  
  echo "ERROR: only staging-only manifests supported in this installer"  
  exit 1  
fi

echo "== Creating backup snapshot \=="  
BACKUP\_DIR="/tmp/wp-backup-$(date \+%s)"  
mkdir \-p "$BACKUP\_DIR"  
tar \-czf "$BACKUP\_DIR/files.tar.gz" .

echo "== Detecting LiteSpeed \=="  
IS\_LITESPEED="false"  
if \[\[ "${SERVER\_SOFTWARE:-}" \== \*"LiteSpeed"\* \]\]; then  
  IS\_LITESPEED="true"  
fi

STEP\_COUNT=$(jq '.steps | length' "$MANIFEST\_PATH")  
for ((i=0; i\<STEP\_COUNT; i++)); do  
  TYPE=$(jq \-r ".steps\[$i\].type" "$MANIFEST\_PATH")  
  SLUG=$(jq \-r ".steps\[$i\].slug // empty" "$MANIFEST\_PATH")  
  CONDITION=$(jq \-r ".steps\[$i\].condition // empty" "$MANIFEST\_PATH")

  case "$TYPE" in  
    install\_theme)  
      echo "Installing theme: $SLUG"  
      wp theme install "$SLUG" \--activate  
      ;;  
    install\_plugin)  
      echo "Installing plugin: $SLUG"  
      wp plugin install "$SLUG" \--activate  
      ;;  
    conditional\_plugin)  
      if \[\[ "$CONDITION" \== "is\_litespeed" && "$IS\_LITESPEED" \== "true" \]\]; then  
        echo "Installing conditional plugin: $SLUG"  
        wp plugin install "$SLUG" \--activate  
      else  
        echo "Skipping conditional plugin: $SLUG"  
      fi  
      ;;  
    \*)  
      echo "ERROR: Unsupported step type $TYPE"  
      exit 1  
      ;;  
  esac  
done

POST\_COUNT=$(jq '.postInstall | length' "$MANIFEST\_PATH")  
for ((i=0; i\<POST\_COUNT; i++)); do  
  TYPE=$(jq \-r ".postInstall\[$i\].type" "$MANIFEST\_PATH")

  case "$TYPE" in  
    activate\_theme)  
      SLUG=$(jq \-r ".postInstall\[$i\].slug" "$MANIFEST\_PATH")  
      wp theme activate "$SLUG"  
      ;;  
    flush\_permalinks)  
      wp rewrite flush \--hard  
      ;;  
    set\_option)  
      KEY=$(jq \-r ".postInstall\[$i\].key" "$MANIFEST\_PATH")  
      VALUE=$(jq \-r ".postInstall\[$i\].value" "$MANIFEST\_PATH")  
      wp option update "$KEY" "$VALUE"  
      ;;  
    \*)  
      echo "Skipping unsupported postInstall type: $TYPE"  
      ;;  
  esac  
done

echo "== Running verification \=="

wp option get home \>/dev/null  
wp plugin is-active woocommerce  
wp plugin is-active fluent-crm  
wp plugin is-active fluent-smtp

echo "== Manifest install completed successfully \=="

---

# **9\. `templates/woocommerce/scripts/smoke-test.sh`**

\#\!/usr/bin/env bash  
set \-euo pipefail

BASE\_URL="${1:-}"

if \[\[ \-z "$BASE\_URL" \]\]; then  
  echo "Usage: ./smoke-test.sh \<BASE\_URL\>"  
  exit 1  
fi

curl \-fsSL "$BASE\_URL" \>/dev/null  
curl \-fsSL "$BASE\_URL/wp-login.php" \>/dev/null

echo "Smoke tests passed for $BASE\_URL"

---

# **10\. `packages/workflows/src/trigger/create-wp-site.ts`**

import { task, logger } from "@trigger.dev/sdk";  
import { z } from "zod";

const InputSchema \= z.object({  
  organizationId: z.string().uuid(),  
  workspaceId: z.string().uuid(),  
  projectId: z.string().uuid(),  
  siteId: z.string().uuid(),  
  siteName: z.string().min(1),  
  manifestSlug: z.literal("wc-core"),  
});

export const createWpSite \= task({  
  id: "create-wp-site",  
  run: async (payload: unknown) \=\> {  
    const input \= InputSchema.parse(payload);

    logger.info("Starting WP site creation", input);

    // 1\. create staging environment record  
    // 2\. call hosting provider adapter  
    // 3\. install wordpress  
    // 4\. apply manifest  
    // 5\. run smoke tests  
    // 6\. write results

    return {  
      status: "pending\_implementation",  
      input,  
    };  
  },  
});

---

# **11\. `packages/workflows/src/trigger/apply-manifest.ts`**

import { task, logger } from "@trigger.dev/sdk";  
import { z } from "zod";  
import fs from "node:fs/promises";  
import path from "node:path";

const InputSchema \= z.object({  
  environmentId: z.string().uuid(),  
  wpRootPath: z.string().min(1),  
  manifestPath: z.string().min(1),  
  environmentType: z.enum(\["staging", "production"\]),  
});

export const applyManifest \= task({  
  id: "apply-manifest",  
  run: async (payload: unknown) \=\> {  
    const input \= InputSchema.parse(payload);

    if (input.environmentType \!== "staging") {  
      throw new Error("Manifest install is blocked outside staging");  
    }

    const raw \= await fs.readFile(path.resolve(input.manifestPath), "utf8");  
    const manifest \= JSON.parse(raw);

    logger.info("Loaded manifest", {  
      name: manifest.name,  
      version: manifest.version,  
    });

    return {  
      status: "pending\_shell\_execution",  
      manifest,  
      input,  
    };  
  },  
});

---

# **12\. `packages/agents/src/configs/repair-agent.json`**

{  
  "name": "repair-agent",  
  "version": "1.0.0",  
  "domain": "repair",  
  "allowedTools": \[  
    "read\_logs",  
    "read\_repo",  
    "analyze\_trace",  
    "create\_patch",  
    "open\_pr"  
  \],  
  "deniedTools": \[  
    "deploy\_production",  
    "read\_secrets",  
    "drop\_database",  
    "execute\_destructive\_migration"  
  \],  
  "requiresApprovalFor": \[  
    "production\_change",  
    "payment\_logic\_change",  
    "schema\_change"  
  \],  
  "limits": {  
    "maxSteps": 12,  
    "maxCostUsd": 5  
  }  
}

---

# **13\. `packages/policies/approval/production-deploy-policy.json`**

{  
  "name": "production-deploy-policy",  
  "resourceType": "deployment",  
  "rules": \[  
    {  
      "match": {  
        "environment": "production"  
      },  
      "requiredApprovals": \[  
        { "role": "agency\_admin", "count": 1 }  
      \],  
      "mode": "hard\_block"  
    }  
  \]  
}

---

# **14\. `packages/policies/tool/repair-agent-policy.json`**

{  
  "name": "repair-agent-policy",  
  "allowedTools": \[  
    "read\_logs",  
    "read\_repo",  
    "create\_patch",  
    "open\_pr"  
  \],  
  "deniedTools": \[  
    "deploy\_production",  
    "read\_secret\_plaintext",  
    "drop\_database"  
  \],  
  "environmentConstraints": {  
    "allowedEnvironments": \["staging", "preview"\],  
    "blockedEnvironments": \["production"\]  
  },  
  "requiresApprovalFor": \[  
    "code\_merge",  
    "schema\_change"  
  \]  
}

---

# **15\. `apps/api/src/types/manifest.ts`**

import { z } from "zod";

export const ManifestStepSchema \= z.object({  
  id: z.string(),  
  type: z.enum(\["install\_theme", "install\_plugin", "conditional\_plugin"\]),  
  slug: z.string().optional(),  
  condition: z.string().optional(),  
});

export const ManifestSchema \= z.object({  
  name: z.string(),  
  version: z.string(),  
  schemaVersion: z.string(),  
  target: z.literal("staging-only"),  
  description: z.string().optional(),  
  guardrails: z.object({  
    allowEnvironments: z.array(z.string()),  
    requireBackup: z.boolean(),  
    blockIfProduction: z.boolean(),  
  }),  
  dependencies: z.array(z.unknown()),  
  conflicts: z.array(z.unknown()),  
  steps: z.array(ManifestStepSchema),  
  postInstall: z.array(z.record(z.any())),  
  verification: z.array(z.record(z.any())),  
  rollback: z.object({  
    strategy: z.string(),  
  }),  
});

export type Manifest \= z.infer\<typeof ManifestSchema\>;

---

# **16\. `apps/api/src/services/wp/wpFactory.ts`**

import { ManifestSchema } from "../../types/manifest";

export async function validateManifest(raw: unknown) {  
  return ManifestSchema.parse(raw);  
}

export async function assertStagingOnly(environmentType: string) {  
  if (environmentType \!== "staging") {  
    throw new Error("Operation blocked: only staging environment is allowed");  
  }  
}

export async function buildInstallPlan(manifest: unknown) {  
  const parsed \= await validateManifest(manifest);

  return {  
    package: parsed.name,  
    version: parsed.version,  
    steps: parsed.steps,  
    postInstall: parsed.postInstall,  
    verification: parsed.verification,  
    rollback: parsed.rollback,  
  };  
}

---

# **17\. `infra/github/workflows/validate-manifest.yml`**

name: Validate Manifest

on:  
  pull\_request:  
    paths:  
      \- "packages/manifests/\*\*"

jobs:  
  validate:  
    runs-on: ubuntu-latest  
    steps:  
      \- uses: actions/checkout@v4  
      \- uses: actions/setup-node@v4  
        with:  
          node-version: 20  
      \- run: npm ci  
      \- run: node scripts/validate-manifests.mjs

---

# **18\. `scripts/validate-manifests.mjs`**

import fs from "node:fs/promises";  
import path from "node:path";

const dir \= path.resolve("packages/manifests");  
const files \= await fs.readdir(dir);

for (const file of files) {  
  if (\!file.endsWith(".json")) continue;  
  const raw \= await fs.readFile(path.join(dir, file), "utf8");  
  const data \= JSON.parse(raw);

  if (data.target \!== "staging-only") {  
    throw new Error(\`${file}: target must be staging-only\`);  
  }

  if (\!Array.isArray(data.steps) || data.steps.length \=== 0\) {  
    throw new Error(\`${file}: steps required\`);  
  }  
}

console.log("All manifests valid");

---

# **19\. `infra/n8n/exports/client-onboarding-flow.json`**

{  
  "name": "client-onboarding-flow",  
  "nodes": \[  
    {  
      "name": "Webhook",  
      "type": "n8n-nodes-base.webhook",  
      "position": \[200, 200\],  
      "parameters": {  
        "path": "client-onboarding",  
        "httpMethod": "POST"  
      }  
    },  
    {  
      "name": "Validate Payload",  
      "type": "n8n-nodes-base.code",  
      "position": \[450, 200\],  
      "parameters": {  
        "jsCode": "return items;"  
      }  
    },  
    {  
      "name": "Call API",  
      "type": "n8n-nodes-base.httpRequest",  
      "position": \[700, 200\],  
      "parameters": {  
        "method": "POST",  
        "url": "https://api.example.com/internal/onboarding"  
      }  
    }  
  \],  
  "connections": {  
    "Webhook": {  
      "main": \[\[{ "node": "Validate Payload", "type": "main", "index": 0 }\]\]  
    },  
    "Validate Payload": {  
      "main": \[\[{ "node": "Call API", "type": "main", "index": 0 }\]\]  
    }  
  }  
}

---

# **20\. `packages/db/migrations/0005_seed_minimum.sql`**

insert into permissions (resource\_type, action, risk\_level, description)  
values  
  ('site', 'read', 'low', 'Read site'),  
  ('site', 'create', 'medium', 'Create site'),  
  ('site', 'update', 'medium', 'Update site'),  
  ('site', 'deploy', 'high', 'Deploy site'),  
  ('workflow', 'execute', 'medium', 'Execute workflow'),  
  ('approval', 'approve', 'high', 'Approve high-risk action')  
on conflict do nothing;

---

# **21\. `CURSOR_TASK_01.md`**

Task: Implement the database foundation.

Files:  
\- packages/db/migrations/0001\_core.sql  
\- packages/db/migrations/0002\_factory.sql  
\- packages/db/migrations/0003\_agents\_approvals\_observability.sql  
\- packages/db/migrations/0004\_rls\_helpers.sql  
\- packages/db/migrations/0005\_seed\_minimum.sql

Requirements:  
\- Ensure migrations run cleanly on Supabase  
\- Add missing indexes only when needed  
\- Keep schema explicit and normalized  
\- Do not add unrelated tables yet

Output:  
1\. Final migration files  
2\. Notes about any fixes  
3\. Suggested generated TypeScript types

Acceptance criteria:  
\- Can create agency org \+ client org  
\- Can create workspace, project, site, environment  
\- Can create package, manifest, workflow, agent, approval records  
\- RLS select works for membership-based access

---

# **22\. `CURSOR_TASK_02.md`**

Task: Implement manifest validation and WP factory service.

Files:  
\- apps/api/src/types/manifest.ts  
\- apps/api/src/services/wp/wpFactory.ts  
\- scripts/validate-manifests.mjs  
\- infra/github/workflows/validate-manifest.yml  
\- packages/manifests/wc-core.json  
\- templates/woocommerce/scripts/install-from-manifest.sh  
\- templates/woocommerce/scripts/smoke-test.sh

Requirements:  
\- Parse and validate wc-core manifest  
\- Ensure staging-only guardrail  
\- Ensure shell installer is safe and explicit  
\- Ensure GitHub Action validates manifests on PR

Output:  
1\. Final code  
2\. Notes about unsafe areas  
3\. Suggested unit tests

Acceptance criteria:  
\- wc-core manifest validates  
\- installer blocks invalid input  
\- smoke test script works  
\- CI validates manifests

---

# **23\. `CURSOR_TASK_03.md`**

Task: Implement durable workflows for:  
1\. create-wp-site  
2\. apply-manifest

Files:  
\- packages/workflows/src/trigger/create-wp-site.ts  
\- packages/workflows/src/trigger/apply-manifest.ts

Requirements:  
\- Use Zod validation  
\- Write placeholders for DB persistence and hosting provider adapter  
\- Explicitly block production manifest execution  
\- Return structured status objects

Output:  
1\. Final workflow code  
2\. TODO list for provider adapter  
3\. Suggested DB write points

Acceptance criteria:  
\- Workflows compile  
\- Inputs are validated  
\- Production is blocked  
\- Return values are structured and machine-readable

---

# **24\. `CURSOR_TASK_04.md`**

Task: Implement minimum agent \+ approval policy loading.

Files:  
\- packages/agents/src/configs/repair-agent.json  
\- packages/policies/approval/production-deploy-policy.json  
\- packages/policies/tool/repair-agent-policy.json

Requirements:  
\- Add loaders and validators in TypeScript  
\- Keep schemas explicit  
\- Do not execute agent logic yet

Output:  
1\. JSON schemas or Zod schemas  
2\. Loader functions  
3\. Example validation usage

Acceptance criteria:  
\- Invalid policy fails validation  
\- Invalid agent config fails validation  
\- Production deploy policy is machine-readable

---

# **25\. `ROUTING_MATRIX.md`**

Execution routing matrix:

1\. n8n  
\- lead webhooks  
\- CRM sync  
\- notifications  
\- onboarding email  
\- social publishing

2\. Trigger.dev  
\- create client workspace  
\- create staging site  
\- install WordPress  
\- apply wc-core manifest  
\- run smoke tests  
\- repair flow  
\- long-running tutorial generation

3\. GitHub Actions  
\- manifest validation  
\- SQL linting  
\- tests  
\- PR checks  
\- release checks

4\. MCP agents  
\- code diagnosis  
\- content generation  
\- support draft generation  
\- proposal drafting  
\- incident analysis

Hard rule:  
\- High-risk production changes must never execute exclusively through n8n or an unrestricted agent

---

# **26\. 一次貼給 Cursor 的啟動指令**

先貼這段，再貼任務檔。

Use the repository structure and files below as the initial implementation baseline.

Important:  
\- Do not redesign the system  
\- Do not replace Supabase with another database  
\- Do not remove the staging-only guardrail  
\- Preserve explicit multi-tenant structure  
\- Preserve workflow, agent, and approval concepts  
\- Implement in small, compilable increments  
\- Output file-by-file results

---

# **27\. 你實際餵 Cursor 的順序**

先後順序照這樣：

1. `000_MASTER_PROMPT.md`  
2. `001_REPO_STRUCTURE.md`  
3. `CURSOR_TASK_01.md`  
4. `CURSOR_TASK_02.md`  
5. `CURSOR_TASK_03.md`  
6. `CURSOR_TASK_04.md`

---

# **28\. 最後一段，直接可貼給 Cursor**

Start with CURSOR\_TASK\_01 only.

Return:  
1\. final SQL files  
2\. brief explanation  
3\. any migration corrections needed

Do not implement later phases yet.

可以，下面直接給你 **Cursor Pack v4**。  
這版是把前面的內容整理成 **可直接建立檔案的 markdown 套件**。

你可以做兩種用法：

1. 在本機建立同名檔案後，把內容貼進去  
2. 直接把單一檔案內容貼給 Cursor，叫它建立對應檔案

---

# **`000_MASTER_PROMPT.md`**

You are implementing "Lobster Factory", a multi-tenant Agency OS / Client OS platform.

Primary stack:

\- WordPress \+ Kadence \+ WooCommerce \+ FluentCRM \+ Fluent Forms

\- Supabase (Postgres, Auth, RLS, Storage)

\- n8n for light integrations

\- Trigger.dev for durable long-running workflows

\- GitHub Actions for CI/CD

\- MCP-style agents for content, repair, reporting, sales assistance

\- Sentry for incidents

\- PostHog for analytics and feature flags

Core product goals:

1\. Create client organizations and workspaces

2\. Create WordPress staging sites

3\. Apply wc-core manifest safely

4\. Run smoke tests

5\. Support CRM-driven onboarding

6\. Version packages, prompts, templates, agents, workflows

7\. Track runs, incidents, approvals, costs, and decisions

Non-negotiable rules:

\- Never auto-deploy to production by default

\- All tenant-bound records must include organization\_id

\- Use workspace\_id where applicable

\- High-risk actions require explicit approval records

\- All workflows must write run records

\- All critical operations must be reversible or explicitly marked non-reversible

\- Prefer explicit schemas over implicit assumptions

\- Prefer small phases and acceptance criteria

\- Use TypeScript for application code

\- Use SQL migrations for database changes

\- Use Zod for runtime validation where appropriate

Architecture rules:

\- Supabase is the system of record for platform data

\- WordPress is the runtime delivery surface for sites and CRM operations

\- n8n is for light automations, webhooks, sync, notifications

\- Trigger.dev is for durable workflows like provisioning, install, repair, onboarding

\- GitHub Actions is for CI/CD and validation

\- Agents must have tool allowlists and deny-lists

\- Secrets must never be exposed in logs or output

When generating code:

\- Include file paths

\- Include comments sparingly but clearly

\- Include acceptance criteria

\- Include next steps only if necessary

---

# **`001_REPO_STRUCTURE.md`**

Recommended monorepo structure:

agency-os/

  apps/

    api/

      src/

        index.ts

        config/

        lib/

        routes/

        services/

        db/

        types/

    worker/

      src/

        index.ts

        jobs/

        triggers/

        activities/

        agents/

  packages/

    db/

      migrations/

      schemas/

      sql/

      src/

        client.ts

        types.ts

    workflows/

      src/

        trigger/

          create-wp-site.ts

          apply-manifest.ts

          client-onboarding.ts

          repair-incident.ts

    agents/

      src/

        configs/

        repair-agent.ts

        seo-agent.ts

        support-agent.ts

    manifests/

      wc-core.json

      wc-crm.json

      wc-membership.json

    policies/

      approval/

      tool/

      rollout/

    shared/

      src/

        zod/

        constants/

        logger/

        env/

  templates/

    wordpress/

      kadence/

      pages/

      reusable-blocks/

    woocommerce/

      manifests/

      scripts/

        install-from-manifest.sh

        smoke-test.sh

  infra/

    github/

      workflows/

    n8n/

      exports/

    trigger/

      config/

  docs/

    MASTER\_SPEC.md

    RUNBOOKS.md

    INCIDENTS.md

  .env.example

  package.json

  turbo.json

  pnpm-workspace.yaml

---

# **`002_ROUTING_MATRIX.md`**

Execution routing matrix:

1\. n8n

\- lead webhooks

\- CRM sync

\- notifications

\- onboarding email

\- social publishing

2\. Trigger.dev

\- create client workspace

\- create staging site

\- install WordPress

\- apply wc-core manifest

\- run smoke tests

\- repair flow

\- long-running tutorial generation

3\. GitHub Actions

\- manifest validation

\- SQL linting

\- tests

\- PR checks

\- release checks

4\. MCP agents

\- code diagnosis

\- content generation

\- support draft generation

\- proposal drafting

\- incident analysis

Hard rule:

\- High-risk production changes must never execute exclusively through n8n or an unrestricted agent

---

# **`010_CURSOR_BOOTSTRAP.md`**

Use the repository structure and files below as the initial implementation baseline.

Important:

\- Do not redesign the system

\- Do not replace Supabase with another database

\- Do not remove the staging-only guardrail

\- Preserve explicit multi-tenant structure

\- Preserve workflow, agent, and approval concepts

\- Implement in small, compilable increments

\- Output file-by-file results

---

# **`020_TASK_01_DATABASE.md`**

Task: Implement the database foundation.

Files:

\- packages/db/migrations/0001\_core.sql

\- packages/db/migrations/0002\_factory.sql

\- packages/db/migrations/0003\_agents\_approvals\_observability.sql

\- packages/db/migrations/0004\_rls\_helpers.sql

\- packages/db/migrations/0005\_seed\_minimum.sql

Requirements:

\- Ensure migrations run cleanly on Supabase

\- Add missing indexes only when needed

\- Keep schema explicit and normalized

\- Do not add unrelated tables yet

Output:

1\. final SQL files

2\. notes about any fixes

3\. suggested generated TypeScript types

Acceptance criteria:

\- Can create agency org \+ client org

\- Can create workspace, project, site, environment

\- Can create package, manifest, workflow, agent, approval records

\- RLS select works for membership-based access

---

# **`021_TASK_02_MANIFEST_AND_WP_FACTORY.md`**

Task: Implement manifest validation and WP factory service.

Files:

\- apps/api/src/types/manifest.ts

\- apps/api/src/services/wp/wpFactory.ts

\- scripts/validate-manifests.mjs

\- infra/github/workflows/validate-manifest.yml

\- packages/manifests/wc-core.json

\- templates/woocommerce/scripts/install-from-manifest.sh

\- templates/woocommerce/scripts/smoke-test.sh

Requirements:

\- Parse and validate wc-core manifest

\- Ensure staging-only guardrail

\- Ensure shell installer is safe and explicit

\- Ensure GitHub Action validates manifests on PR

Output:

1\. final code

2\. notes about unsafe areas

3\. suggested unit tests

Acceptance criteria:

\- wc-core manifest validates

\- installer blocks invalid input

\- smoke test script works

\- CI validates manifests

---

# **`022_TASK_03_DURABLE_WORKFLOWS.md`**

Task: Implement durable workflows for:

1\. create-wp-site

2\. apply-manifest

Files:

\- packages/workflows/src/trigger/create-wp-site.ts

\- packages/workflows/src/trigger/apply-manifest.ts

Requirements:

\- Use Zod validation

\- Write placeholders for DB persistence and hosting provider adapter

\- Explicitly block production manifest execution

\- Return structured status objects

Output:

1\. final workflow code

2\. TODO list for provider adapter

3\. suggested DB write points

Acceptance criteria:

\- workflows compile

\- inputs are validated

\- production is blocked

\- return values are structured and machine-readable

---

# **`023_TASK_04_AGENT_AND_POLICY_LOADERS.md`**

Task: Implement minimum agent \+ approval policy loading.

Files:

\- packages/agents/src/configs/repair-agent.json

\- packages/policies/approval/production-deploy-policy.json

\- packages/policies/tool/repair-agent-policy.json

Requirements:

\- Add loaders and validators in TypeScript

\- Keep schemas explicit

\- Do not execute agent logic yet

Output:

1\. JSON schemas or Zod schemas

2\. loader functions

3\. example validation usage

Acceptance criteria:

\- invalid policy fails validation

\- invalid agent config fails validation

\- production deploy policy is machine-readable

---

# **`030_DB_MIGRATION_0001_CORE.sql`**

create extension if not exists pgcrypto;

create table if not exists organizations (

  id uuid primary key default gen\_random\_uuid(),

  type text not null check (type in ('agency', 'client')),

  name text not null,

  slug text not null unique,

  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),

  default\_locale text not null default 'en',

  default\_timezone text not null default 'UTC',

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now()

);

create table if not exists workspaces (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid not null references organizations(id) on delete cascade,

  name text not null,

  slug text not null,

  workspace\_type text not null default 'default',

  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now(),

  unique (organization\_id, slug)

);

create table if not exists profiles (

  id uuid primary key,

  email text not null unique,

  display\_name text,

  avatar\_url text,

  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),

  default\_organization\_id uuid references organizations(id) on delete set null,

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now()

);

create table if not exists organization\_memberships (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid not null references organizations(id) on delete cascade,

  user\_id uuid not null references profiles(id) on delete cascade,

  membership\_type text not null default 'member',

  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),

  joined\_at timestamptz not null default now(),

  metadata jsonb not null default '{}'::jsonb,

  unique (organization\_id, user\_id)

);

create table if not exists workspace\_memberships (

  id uuid primary key default gen\_random\_uuid(),

  workspace\_id uuid not null references workspaces(id) on delete cascade,

  user\_id uuid not null references profiles(id) on delete cascade,

  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),

  metadata jsonb not null default '{}'::jsonb,

  unique (workspace\_id, user\_id)

);

create table if not exists roles (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid references organizations(id) on delete cascade,

  name text not null,

  scope\_type text not null check (scope\_type in ('system', 'organization', 'workspace', 'project', 'site')),

  description text,

  is\_system boolean not null default false,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now(),

  unique (organization\_id, name, scope\_type)

);

create table if not exists permissions (

  id uuid primary key default gen\_random\_uuid(),

  resource\_type text not null,

  action text not null,

  risk\_level text not null check (risk\_level in ('low', 'medium', 'high')),

  description text,

  unique (resource\_type, action)

);

create table if not exists role\_permissions (

  role\_id uuid not null references roles(id) on delete cascade,

  permission\_id uuid not null references permissions(id) on delete cascade,

  constraints jsonb not null default '{}'::jsonb,

  primary key (role\_id, permission\_id)

);

create table if not exists user\_role\_assignments (

  id uuid primary key default gen\_random\_uuid(),

  user\_id uuid not null references profiles(id) on delete cascade,

  role\_id uuid not null references roles(id) on delete cascade,

  organization\_id uuid references organizations(id) on delete cascade,

  workspace\_id uuid references workspaces(id) on delete cascade,

  granted\_by uuid references profiles(id) on delete set null,

  granted\_at timestamptz not null default now(),

  expires\_at timestamptz,

  metadata jsonb not null default '{}'::jsonb

);

create table if not exists projects (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid not null references organizations(id) on delete cascade,

  workspace\_id uuid not null references workspaces(id) on delete cascade,

  client\_organization\_id uuid references organizations(id) on delete set null,

  name text not null,

  project\_type text not null default 'wordpress',

  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),

  owner\_user\_id uuid references profiles(id) on delete set null,

  start\_date date,

  target\_launch\_date date,

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now()

);

create table if not exists sites (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid not null references organizations(id) on delete cascade,

  workspace\_id uuid not null references workspaces(id) on delete cascade,

  project\_id uuid not null references projects(id) on delete cascade,

  site\_type text not null default 'woocommerce',

  name text not null,

  primary\_domain text,

  locale text not null default 'en',

  status text not null default 'draft' check (status in ('draft', 'staging', 'live', 'paused', 'archived')),

  theme\_family text not null default 'kadence',

  stack\_profile text not null default 'wc-core',

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now()

);

create table if not exists environments (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid not null references organizations(id) on delete cascade,

  workspace\_id uuid not null references workspaces(id) on delete cascade,

  site\_id uuid not null references sites(id) on delete cascade,

  environment\_type text not null check (environment\_type in ('local', 'staging', 'production', 'preview')),

  name text not null,

  base\_url text,

  hosting\_provider text,

  server\_ref text,

  status text not null default 'pending' check (status in ('pending', 'provisioning', 'ready', 'failed', 'archived')),

  wp\_root\_path text,

  credentials\_ref text,

  last\_health\_status text,

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now()

);

create index if not exists idx\_workspaces\_org\_id on workspaces(organization\_id);

create index if not exists idx\_org\_memberships\_org\_id on organization\_memberships(organization\_id);

create index if not exists idx\_org\_memberships\_user\_id on organization\_memberships(user\_id);

create index if not exists idx\_workspace\_memberships\_workspace\_id on workspace\_memberships(workspace\_id);

create index if not exists idx\_user\_role\_assignments\_user\_id on user\_role\_assignments(user\_id);

create index if not exists idx\_projects\_org\_ws on projects(organization\_id, workspace\_id);

create index if not exists idx\_sites\_org\_ws on sites(organization\_id, workspace\_id);

create index if not exists idx\_environments\_site\_id on environments(site\_id);

---

# **`031_DB_MIGRATION_0002_FACTORY.sql`**

create table if not exists packages (

  id uuid primary key default gen\_random\_uuid(),

  scope\_type text not null check (scope\_type in ('global', 'agency', 'client')),

  scope\_id uuid,

  name text not null,

  slug text not null,

  package\_type text not null default 'wordpress',

  description text,

  status text not null default 'active' check (status in ('draft', 'active', 'deprecated', 'archived')),

  default\_version text not null,

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now(),

  unique (scope\_type, scope\_id, slug)

);

create table if not exists package\_versions (

  id uuid primary key default gen\_random\_uuid(),

  package\_id uuid not null references packages(id) on delete cascade,

  version text not null,

  changelog text,

  compatibility jsonb not null default '{}'::jsonb,

  status text not null default 'active' check (status in ('draft', 'active', 'deprecated', 'archived')),

  artifact\_ref text,

  created\_at timestamptz not null default now(),

  created\_by uuid references profiles(id) on delete set null,

  metadata jsonb not null default '{}'::jsonb,

  unique (package\_id, version)

);

create table if not exists manifests (

  id uuid primary key default gen\_random\_uuid(),

  package\_version\_id uuid not null references package\_versions(id) on delete cascade,

  schema\_version text not null,

  manifest\_json jsonb not null,

  install\_guardrails jsonb not null default '{}'::jsonb,

  dependencies jsonb not null default '\[\]'::jsonb,

  conflicts jsonb not null default '\[\]'::jsonb,

  rollback\_hints jsonb not null default '{}'::jsonb,

  status text not null default 'active' check (status in ('draft', 'active', 'deprecated', 'archived')),

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now()

);

create table if not exists workflows (

  id uuid primary key default gen\_random\_uuid(),

  scope\_type text not null check (scope\_type in ('global', 'agency', 'client')),

  scope\_id uuid,

  name text not null,

  slug text not null,

  domain text not null,

  orchestrator\_type text not null check (orchestrator\_type in ('n8n', 'durable', 'github\_actions', 'mcp', 'manual')),

  risk\_level text not null check (risk\_level in ('low', 'medium', 'high')),

  status text not null default 'active',

  default\_version text not null,

  input\_schema jsonb not null default '{}'::jsonb,

  output\_schema jsonb not null default '{}'::jsonb,

  approval\_policy\_id uuid,

  rollback\_strategy jsonb not null default '{}'::jsonb,

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now(),

  unique (scope\_type, scope\_id, slug)

);

create table if not exists workflow\_versions (

  id uuid primary key default gen\_random\_uuid(),

  workflow\_id uuid not null references workflows(id) on delete cascade,

  version text not null,

  definition\_ref text not null,

  routing\_config jsonb not null default '{}'::jsonb,

  trigger\_config jsonb not null default '{}'::jsonb,

  guardrails jsonb not null default '{}'::jsonb,

  status text not null default 'active',

  created\_at timestamptz not null default now(),

  metadata jsonb not null default '{}'::jsonb,

  unique (workflow\_id, version)

);

create table if not exists workflow\_runs (

  id uuid primary key default gen\_random\_uuid(),

  workflow\_version\_id uuid not null references workflow\_versions(id) on delete cascade,

  organization\_id uuid not null references organizations(id) on delete cascade,

  workspace\_id uuid references workspaces(id) on delete cascade,

  project\_id uuid references projects(id) on delete cascade,

  site\_id uuid references sites(id) on delete cascade,

  environment\_id uuid references environments(id) on delete cascade,

  parent\_run\_id uuid references workflow\_runs(id) on delete set null,

  trigger\_type text not null,

  trigger\_ref text,

  actor\_type text not null check (actor\_type in ('human', 'agent', 'webhook', 'schedule', 'system')),

  actor\_ref text,

  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'blocked', 'cancelled')),

  risk\_level text not null check (risk\_level in ('low', 'medium', 'high')),

  input\_snapshot jsonb not null default '{}'::jsonb,

  output\_snapshot jsonb not null default '{}'::jsonb,

  artifacts jsonb not null default '\[\]'::jsonb,

  started\_at timestamptz not null default now(),

  ended\_at timestamptz,

  cost\_amount numeric,

  cost\_currency text,

  decision\_id uuid,

  incident\_id uuid,

  approval\_id uuid,

  metadata jsonb not null default '{}'::jsonb

);

create table if not exists package\_install\_runs (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid not null references organizations(id) on delete cascade,

  workspace\_id uuid not null references workspaces(id) on delete cascade,

  site\_id uuid not null references sites(id) on delete cascade,

  environment\_id uuid not null references environments(id) on delete cascade,

  package\_version\_id uuid not null references package\_versions(id) on delete cascade,

  manifest\_id uuid not null references manifests(id) on delete cascade,

  workflow\_run\_id uuid references workflow\_runs(id) on delete set null,

  triggered\_by\_user\_id uuid references profiles(id) on delete set null,

  triggered\_by\_agent\_id uuid,

  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'rolled\_back')),

  started\_at timestamptz not null default now(),

  ended\_at timestamptz,

  result\_summary jsonb not null default '{}'::jsonb,

  logs\_ref text,

  rollback\_run\_id uuid,

  metadata jsonb not null default '{}'::jsonb

);

create index if not exists idx\_workflow\_runs\_org on workflow\_runs(organization\_id);

create index if not exists idx\_workflow\_runs\_site on workflow\_runs(site\_id);

create index if not exists idx\_pkg\_install\_runs\_site on package\_install\_runs(site\_id);

---

# **`032_DB_MIGRATION_0003_AGENTS_APPROVALS_OBSERVABILITY.sql`**

create table if not exists policies (

  id uuid primary key default gen\_random\_uuid(),

  scope\_type text not null check (scope\_type in ('global', 'agency', 'client')),

  scope\_id uuid,

  name text not null,

  slug text not null,

  policy\_domain text not null,

  status text not null default 'active',

  default\_version text not null,

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now(),

  unique (scope\_type, scope\_id, slug)

);

create table if not exists policy\_versions (

  id uuid primary key default gen\_random\_uuid(),

  policy\_id uuid not null references policies(id) on delete cascade,

  version text not null,

  rules jsonb not null default '{}'::jsonb,

  risk\_matrix jsonb not null default '{}'::jsonb,

  enforcement\_mode text not null check (enforcement\_mode in ('advisory', 'soft\_block', 'hard\_block')),

  status text not null default 'active',

  created\_at timestamptz not null default now(),

  metadata jsonb not null default '{}'::jsonb,

  unique (policy\_id, version)

);

create table if not exists approval\_policies (

  id uuid primary key default gen\_random\_uuid(),

  name text not null,

  slug text not null unique,

  scope\_type text not null check (scope\_type in ('global', 'agency', 'client')),

  scope\_id uuid,

  resource\_type text not null,

  rules jsonb not null default '{}'::jsonb,

  status text not null default 'active',

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now()

);

create table if not exists approvals (

  id uuid primary key default gen\_random\_uuid(),

  approval\_policy\_id uuid not null references approval\_policies(id) on delete cascade,

  resource\_type text not null,

  resource\_id uuid not null,

  organization\_id uuid not null references organizations(id) on delete cascade,

  workspace\_id uuid references workspaces(id) on delete cascade,

  status text not null check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),

  requested\_by uuid references profiles(id) on delete set null,

  requested\_at timestamptz not null default now(),

  resolved\_at timestamptz,

  resolution\_notes text,

  metadata jsonb not null default '{}'::jsonb

);

create table if not exists approval\_steps (

  id uuid primary key default gen\_random\_uuid(),

  approval\_id uuid not null references approvals(id) on delete cascade,

  step\_order integer not null,

  approver\_user\_id uuid references profiles(id) on delete set null,

  approver\_role\_id uuid references roles(id) on delete set null,

  status text not null check (status in ('pending', 'approved', 'rejected', 'skipped')),

  acted\_at timestamptz,

  notes text,

  metadata jsonb not null default '{}'::jsonb

);

create table if not exists agents (

  id uuid primary key default gen\_random\_uuid(),

  scope\_type text not null check (scope\_type in ('global', 'agency', 'client')),

  scope\_id uuid,

  name text not null,

  slug text not null,

  agent\_domain text not null,

  agent\_type text not null,

  status text not null default 'active',

  default\_version text not null,

  description text,

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now(),

  unique (scope\_type, scope\_id, slug)

);

create table if not exists tool\_policies (

  id uuid primary key default gen\_random\_uuid(),

  name text not null,

  description text,

  allowed\_tools jsonb not null default '\[\]'::jsonb,

  denied\_tools jsonb not null default '\[\]'::jsonb,

  max\_steps integer,

  max\_cost numeric,

  requires\_approval\_for jsonb not null default '\[\]'::jsonb,

  environment\_constraints jsonb not null default '{}'::jsonb,

  status text not null default 'active',

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now()

);

create table if not exists agent\_versions (

  id uuid primary key default gen\_random\_uuid(),

  agent\_id uuid not null references agents(id) on delete cascade,

  version text not null,

  system\_prompt\_ref uuid,

  tool\_policy\_id uuid references tool\_policies(id) on delete set null,

  input\_schema jsonb not null default '{}'::jsonb,

  output\_schema jsonb not null default '{}'::jsonb,

  model\_config jsonb not null default '{}'::jsonb,

  safety\_config jsonb not null default '{}'::jsonb,

  status text not null default 'active',

  created\_at timestamptz not null default now(),

  metadata jsonb not null default '{}'::jsonb,

  unique (agent\_id, version)

);

create table if not exists agent\_runs (

  id uuid primary key default gen\_random\_uuid(),

  agent\_version\_id uuid not null references agent\_versions(id) on delete cascade,

  workflow\_run\_id uuid references workflow\_runs(id) on delete set null,

  organization\_id uuid not null references organizations(id) on delete cascade,

  workspace\_id uuid references workspaces(id) on delete cascade,

  project\_id uuid references projects(id) on delete cascade,

  site\_id uuid references sites(id) on delete cascade,

  environment\_id uuid references environments(id) on delete cascade,

  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'blocked')),

  goal text not null,

  input\_snapshot jsonb not null default '{}'::jsonb,

  output\_snapshot jsonb not null default '{}'::jsonb,

  tool\_trace jsonb not null default '\[\]'::jsonb,

  evaluation\_summary jsonb not null default '{}'::jsonb,

  started\_at timestamptz not null default now(),

  ended\_at timestamptz,

  cost\_amount numeric,

  cost\_breakdown jsonb not null default '{}'::jsonb,

  metadata jsonb not null default '{}'::jsonb

);

create table if not exists incidents (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid not null references organizations(id) on delete cascade,

  workspace\_id uuid references workspaces(id) on delete cascade,

  project\_id uuid references projects(id) on delete cascade,

  site\_id uuid references sites(id) on delete cascade,

  environment\_id uuid references environments(id) on delete cascade,

  domain text not null,

  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),

  status text not null check (status in ('open', 'investigating', 'mitigated', 'resolved')),

  title text not null,

  summary text not null,

  root\_cause\_summary text,

  first\_seen\_at timestamptz not null default now(),

  last\_seen\_at timestamptz not null default now(),

  resolved\_at timestamptz,

  sentry\_issue\_ref text,

  metadata jsonb not null default '{}'::jsonb

);

create table if not exists error\_events (

  id uuid primary key default gen\_random\_uuid(),

  incident\_id uuid references incidents(id) on delete set null,

  organization\_id uuid not null references organizations(id) on delete cascade,

  site\_id uuid references sites(id) on delete cascade,

  environment\_id uuid references environments(id) on delete cascade,

  source\_type text not null,

  source\_ref text,

  error\_code text,

  error\_message text not null,

  trace\_ref text,

  event\_payload jsonb not null default '{}'::jsonb,

  occurred\_at timestamptz not null default now(),

  metadata jsonb not null default '{}'::jsonb

);

---

# **`033_DB_MIGRATION_0004_RLS_HELPERS.sql`**

create or replace function current\_user\_id()

returns uuid

language sql

stable

as $$

  select auth.uid()::uuid

$$;

create or replace function user\_has\_org\_access(org\_id uuid)

returns boolean

language sql

stable

as $$

  select exists (

    select 1

    from organization\_memberships om

    where om.organization\_id \= org\_id

      and om.user\_id \= auth.uid()::uuid

      and om.status \= 'active'

  )

$$;

create or replace function user\_has\_workspace\_access(ws\_id uuid)

returns boolean

language sql

stable

as $$

  select exists (

    select 1

    from workspace\_memberships wm

    where wm.workspace\_id \= ws\_id

      and wm.user\_id \= auth.uid()::uuid

      and wm.status \= 'active'

  )

$$;

alter table organizations enable row level security;

alter table workspaces enable row level security;

alter table projects enable row level security;

alter table sites enable row level security;

alter table environments enable row level security;

create policy organizations\_select on organizations

for select

using (

  user\_has\_org\_access(id)

);

create policy workspaces\_select on workspaces

for select

using (

  user\_has\_org\_access(organization\_id)

);

create policy projects\_select on projects

for select

using (

  user\_has\_org\_access(organization\_id)

);

create policy sites\_select on sites

for select

using (

  user\_has\_org\_access(organization\_id)

);

create policy environments\_select on environments

for select

using (

  user\_has\_org\_access(organization\_id)

);

---

# **`034_DB_MIGRATION_0005_SEED_MINIMUM.sql`**

insert into permissions (resource\_type, action, risk\_level, description)

values

  ('site', 'read', 'low', 'Read site'),

  ('site', 'create', 'medium', 'Create site'),

  ('site', 'update', 'medium', 'Update site'),

  ('site', 'deploy', 'high', 'Deploy site'),

  ('workflow', 'execute', 'medium', 'Execute workflow'),

  ('approval', 'approve', 'high', 'Approve high-risk action')

on conflict do nothing;

---

# **`040_MANIFEST_wc-core.json`**

{

  "name": "wc-core",

  "version": "1.0.0",

  "schemaVersion": "1.0.0",

  "target": "staging-only",

  "description": "Base WooCommerce \+ Kadence \+ FluentCRM stack",

  "guardrails": {

    "allowEnvironments": \["staging"\],

    "requireBackup": true,

    "blockIfProduction": true

  },

  "dependencies": \[\],

  "conflicts": \[\],

  "steps": \[

    { "id": "theme-kadence", "type": "install\_theme", "slug": "kadence" },

    { "id": "plugin-kadence-blocks", "type": "install\_plugin", "slug": "kadence-blocks" },

    { "id": "plugin-woocommerce", "type": "install\_plugin", "slug": "woocommerce" },

    { "id": "plugin-cartflows", "type": "install\_plugin", "slug": "cartflows" },

    { "id": "plugin-rank-math", "type": "install\_plugin", "slug": "seo-by-rank-math" },

    { "id": "plugin-fluent-crm", "type": "install\_plugin", "slug": "fluent-crm" },

    { "id": "plugin-fluent-forms", "type": "install\_plugin", "slug": "fluentform" },

    { "id": "plugin-fluent-smtp", "type": "install\_plugin", "slug": "fluent-smtp" },

    { "id": "plugin-site-kit", "type": "install\_plugin", "slug": "google-site-kit" },

    {

      "id": "plugin-litespeed",

      "type": "conditional\_plugin",

      "condition": "is\_litespeed",

      "slug": "litespeed-cache"

    }

  \],

  "postInstall": \[

    { "type": "activate\_theme", "slug": "kadence" },

    { "type": "flush\_permalinks" },

    { "type": "set\_option", "key": "timezone\_string", "value": "Asia/Taipei" }

  \],

  "verification": \[

    { "type": "check\_homepage" },

    { "type": "check\_admin\_login" },

    { "type": "check\_plugin\_active", "slug": "woocommerce" },

    { "type": "check\_plugin\_active", "slug": "fluent-crm" }

  \],

  "rollback": {

    "strategy": "restore\_backup\_snapshot"

  }

}

---

# **`050_INSTALLER_install-from-manifest.sh`**

\#\!/usr/bin/env bash

set \-euo pipefail

WP\_ROOT="${1:-}"

MANIFEST\_PATH="${2:-}"

if \[\[ \-z "$WP\_ROOT" || \-z "$MANIFEST\_PATH" \]\]; then

  echo "Usage: ./install-from-manifest.sh \<WP\_ROOT\> \<MANIFEST\_PATH\>"

  exit 1

fi

if \[\[ \! \-f "$WP\_ROOT/wp-config.php" \]\]; then

  echo "ERROR: wp-config.php not found in $WP\_ROOT"

  exit 1

fi

if \[\[ \! \-f "$MANIFEST\_PATH" \]\]; then

  echo "ERROR: manifest not found at $MANIFEST\_PATH"

  exit 1

fi

command \-v jq \>/dev/null 2\>&1 || { echo "ERROR: jq is required"; exit 1; }

command \-v wp \>/dev/null 2\>&1 || { echo "ERROR: wp-cli is required"; exit 1; }

cd "$WP\_ROOT"

TARGET=$(jq \-r '.target' "$MANIFEST\_PATH")

if \[\[ "$TARGET" \!= "staging-only" \]\]; then

  echo "ERROR: only staging-only manifests supported in this installer"

  exit 1

fi

echo "== Creating backup snapshot \=="

BACKUP\_DIR="/tmp/wp-backup-$(date \+%s)"

mkdir \-p "$BACKUP\_DIR"

tar \-czf "$BACKUP\_DIR/files.tar.gz" .

echo "== Detecting LiteSpeed \=="

IS\_LITESPEED="false"

if \[\[ "${SERVER\_SOFTWARE:-}" \== \*"LiteSpeed"\* \]\]; then

  IS\_LITESPEED="true"

fi

STEP\_COUNT=$(jq '.steps | length' "$MANIFEST\_PATH")

for ((i=0; i\<STEP\_COUNT; i++)); do

  TYPE=$(jq \-r ".steps\[$i\].type" "$MANIFEST\_PATH")

  SLUG=$(jq \-r ".steps\[$i\].slug // empty" "$MANIFEST\_PATH")

  CONDITION=$(jq \-r ".steps\[$i\].condition // empty" "$MANIFEST\_PATH")

  case "$TYPE" in

    install\_theme)

      echo "Installing theme: $SLUG"

      wp theme install "$SLUG" \--activate

      ;;

    install\_plugin)

      echo "Installing plugin: $SLUG"

      wp plugin install "$SLUG" \--activate

      ;;

    conditional\_plugin)

      if \[\[ "$CONDITION" \== "is\_litespeed" && "$IS\_LITESPEED" \== "true" \]\]; then

        echo "Installing conditional plugin: $SLUG"

        wp plugin install "$SLUG" \--activate

      else

        echo "Skipping conditional plugin: $SLUG"

      fi

      ;;

    \*)

      echo "ERROR: Unsupported step type $TYPE"

      exit 1

      ;;

  esac

done

POST\_COUNT=$(jq '.postInstall | length' "$MANIFEST\_PATH")

for ((i=0; i\<POST\_COUNT; i++)); do

  TYPE=$(jq \-r ".postInstall\[$i\].type" "$MANIFEST\_PATH")

  case "$TYPE" in

    activate\_theme)

      SLUG=$(jq \-r ".postInstall\[$i\].slug" "$MANIFEST\_PATH")

      wp theme activate "$SLUG"

      ;;

    flush\_permalinks)

      wp rewrite flush \--hard

      ;;

    set\_option)

      KEY=$(jq \-r ".postInstall\[$i\].key" "$MANIFEST\_PATH")

      VALUE=$(jq \-r ".postInstall\[$i\].value" "$MANIFEST\_PATH")

      wp option update "$KEY" "$VALUE"

      ;;

    \*)

      echo "Skipping unsupported postInstall type: $TYPE"

      ;;

  esac

done

echo "== Running verification \=="

wp option get home \>/dev/null

wp plugin is-active woocommerce

wp plugin is-active fluent-crm

wp plugin is-active fluent-smtp

echo "== Manifest install completed successfully \=="

---

# **`051_SMOKE_TEST_smoke-test.sh`**

\#\!/usr/bin/env bash

set \-euo pipefail

BASE\_URL="${1:-}"

if \[\[ \-z "$BASE\_URL" \]\]; then

  echo "Usage: ./smoke-test.sh \<BASE\_URL\>"

  exit 1

fi

curl \-fsSL "$BASE\_URL" \>/dev/null

curl \-fsSL "$BASE\_URL/wp-login.php" \>/dev/null

echo "Smoke tests passed for $BASE\_URL"

---

# **`060_TYPES_manifest.ts`**

import { z } from "zod";

export const ManifestStepSchema \= z.object({

  id: z.string(),

  type: z.enum(\["install\_theme", "install\_plugin", "conditional\_plugin"\]),

  slug: z.string().optional(),

  condition: z.string().optional(),

});

export const ManifestSchema \= z.object({

  name: z.string(),

  version: z.string(),

  schemaVersion: z.string(),

  target: z.literal("staging-only"),

  description: z.string().optional(),

  guardrails: z.object({

    allowEnvironments: z.array(z.string()),

    requireBackup: z.boolean(),

    blockIfProduction: z.boolean(),

  }),

  dependencies: z.array(z.unknown()),

  conflicts: z.array(z.unknown()),

  steps: z.array(ManifestStepSchema),

  postInstall: z.array(z.record(z.any())),

  verification: z.array(z.record(z.any())),

  rollback: z.object({

    strategy: z.string(),

  }),

});

export type Manifest \= z.infer\<typeof ManifestSchema\>;

---

# **`061_SERVICE_wpFactory.ts`**

import { ManifestSchema } from "../../types/manifest";

export async function validateManifest(raw: unknown) {

  return ManifestSchema.parse(raw);

}

export async function assertStagingOnly(environmentType: string) {

  if (environmentType \!== "staging") {

    throw new Error("Operation blocked: only staging environment is allowed");

  }

}

export async function buildInstallPlan(manifest: unknown) {

  const parsed \= await validateManifest(manifest);

  return {

    package: parsed.name,

    version: parsed.version,

    steps: parsed.steps,

    postInstall: parsed.postInstall,

    verification: parsed.verification,

    rollback: parsed.rollback,

  };

}

---

# **`070_WORKFLOW_create-wp-site.ts`**

import { task, logger } from "@trigger.dev/sdk";

import { z } from "zod";

const InputSchema \= z.object({

  organizationId: z.string().uuid(),

  workspaceId: z.string().uuid(),

  projectId: z.string().uuid(),

  siteId: z.string().uuid(),

  siteName: z.string().min(1),

  manifestSlug: z.literal("wc-core"),

});

export const createWpSite \= task({

  id: "create-wp-site",

  run: async (payload: unknown) \=\> {

    const input \= InputSchema.parse(payload);

    logger.info("Starting WP site creation", input);

    return {

      status: "pending\_implementation",

      input,

    };

  },

});

---

# **`071_WORKFLOW_apply-manifest.ts`**

import { task, logger } from "@trigger.dev/sdk";

import { z } from "zod";

import fs from "node:fs/promises";

import path from "node:path";

const InputSchema \= z.object({

  environmentId: z.string().uuid(),

  wpRootPath: z.string().min(1),

  manifestPath: z.string().min(1),

  environmentType: z.enum(\["staging", "production"\]),

});

export const applyManifest \= task({

  id: "apply-manifest",

  run: async (payload: unknown) \=\> {

    const input \= InputSchema.parse(payload);

    if (input.environmentType \!== "staging") {

      throw new Error("Manifest install is blocked outside staging");

    }

    const raw \= await fs.readFile(path.resolve(input.manifestPath), "utf8");

    const manifest \= JSON.parse(raw);

    logger.info("Loaded manifest", {

      name: manifest.name,

      version: manifest.version,

    });

    return {

      status: "pending\_shell\_execution",

      manifest,

      input,

    };

  },

});

---

# **`080_AGENT_repair-agent.json`**

{

  "name": "repair-agent",

  "version": "1.0.0",

  "domain": "repair",

  "allowedTools": \[

    "read\_logs",

    "read\_repo",

    "analyze\_trace",

    "create\_patch",

    "open\_pr"

  \],

  "deniedTools": \[

    "deploy\_production",

    "read\_secrets",

    "drop\_database",

    "execute\_destructive\_migration"

  \],

  "requiresApprovalFor": \[

    "production\_change",

    "payment\_logic\_change",

    "schema\_change"

  \],

  "limits": {

    "maxSteps": 12,

    "maxCostUsd": 5

  }

}

---

# **`081_POLICY_production-deploy-policy.json`**

{

  "name": "production-deploy-policy",

  "resourceType": "deployment",

  "rules": \[

    {

      "match": {

        "environment": "production"

      },

      "requiredApprovals": \[

        { "role": "agency\_admin", "count": 1 }

      \],

      "mode": "hard\_block"

    }

  \]

}

---

# **`082_POLICY_repair-agent-policy.json`**

{

  "name": "repair-agent-policy",

  "allowedTools": \[

    "read\_logs",

    "read\_repo",

    "create\_patch",

    "open\_pr"

  \],

  "deniedTools": \[

    "deploy\_production",

    "read\_secret\_plaintext",

    "drop\_database"

  \],

  "environmentConstraints": {

    "allowedEnvironments": \["staging", "preview"\],

    "blockedEnvironments": \["production"\]

  },

  "requiresApprovalFor": \[

    "code\_merge",

    "schema\_change"

  \]

}

---

# **`090_GITHUB_validate-manifest.yml`**

name: Validate Manifest

on:

  pull\_request:

    paths:

      \- "packages/manifests/\*\*"

jobs:

  validate:

    runs-on: ubuntu-latest

    steps:

      \- uses: actions/checkout@v4

      \- uses: actions/setup-node@v4

        with:

          node-version: 20

      \- run: npm ci

      \- run: node scripts/validate-manifests.mjs

---

# **`091_SCRIPT_validate-manifests.mjs`**

import fs from "node:fs/promises";

import path from "node:path";

const dir \= path.resolve("packages/manifests");

const files \= await fs.readdir(dir);

for (const file of files) {

  if (\!file.endsWith(".json")) continue;

  const raw \= await fs.readFile(path.join(dir, file), "utf8");

  const data \= JSON.parse(raw);

  if (data.target \!== "staging-only") {

    throw new Error(\`${file}: target must be staging-only\`);

  }

  if (\!Array.isArray(data.steps) || data.steps.length \=== 0\) {

    throw new Error(\`${file}: steps required\`);

  }

}

console.log("All manifests valid");

---

# **`100_N8N_client-onboarding-flow.json`**

{

  "name": "client-onboarding-flow",

  "nodes": \[

    {

      "name": "Webhook",

      "type": "n8n-nodes-base.webhook",

      "position": \[200, 200\],

      "parameters": {

        "path": "client-onboarding",

        "httpMethod": "POST"

      }

    },

    {

      "name": "Validate Payload",

      "type": "n8n-nodes-base.code",

      "position": \[450, 200\],

      "parameters": {

        "jsCode": "return items;"

      }

    },

    {

      "name": "Call API",

      "type": "n8n-nodes-base.httpRequest",

      "position": \[700, 200\],

      "parameters": {

        "method": "POST",

        "url": "https://api.example.com/internal/onboarding"

      }

    }

  \],

  "connections": {

    "Webhook": {

      "main": \[\[{ "node": "Validate Payload", "type": "main", "index": 0 }\]\]

    },

    "Validate Payload": {

      "main": \[\[{ "node": "Call API", "type": "main", "index": 0 }\]\]

    }

  }

}

---

# **`110_CURSOR_RUN_ORDER.md`**

Run Cursor in this order:

1\. 000\_MASTER\_PROMPT.md

2\. 001\_REPO\_STRUCTURE.md

3\. 002\_ROUTING\_MATRIX.md

4\. 010\_CURSOR\_BOOTSTRAP.md

5\. 020\_TASK\_01\_DATABASE.md

6\. 021\_TASK\_02\_MANIFEST\_AND\_WP\_FACTORY.md

7\. 022\_TASK\_03\_DURABLE\_WORKFLOWS.md

8\. 023\_TASK\_04\_AGENT\_AND\_POLICY\_LOADERS.md

Do not ask Cursor to implement everything at once.

Ask for one task only, wait for output, then continue.

---

# **`111_FIRST_MESSAGE_TO_CURSOR.md`**

Start with TASK\_01 only.

Use these files as the intended target structure:

\- 030\_DB\_MIGRATION\_0001\_CORE.sql

\- 031\_DB\_MIGRATION\_0002\_FACTORY.sql

\- 032\_DB\_MIGRATION\_0003\_AGENTS\_APPROVALS\_OBSERVABILITY.sql

\- 033\_DB\_MIGRATION\_0004\_RLS\_HELPERS.sql

\- 034\_DB\_MIGRATION\_0005\_SEED\_MINIMUM.sql

Return:

1\. final SQL files

2\. brief explanation

3\. any migration corrections needed

Do not implement later phases yet.

---

# **你最推薦的實際操作法**

先把這 5 份貼給 Cursor：

* `000_MASTER_PROMPT.md`  
* `001_REPO_STRUCTURE.md`  
* `010_CURSOR_BOOTSTRAP.md`  
* `020_TASK_01_DATABASE.md`  
* `111_FIRST_MESSAGE_TO_CURSOR.md`

等它把 DB 基礎做完，再進下一批。

下一輪就貼：

* `021_TASK_02_MANIFEST_AND_WP_FACTORY.md`  
* `040_MANIFEST_wc-core.json`  
* `050_INSTALLER_install-from-manifest.sh`  
* `051_SMOKE_TEST_smoke-test.sh`  
* `060_TYPES_manifest.ts`  
* `061_SERVICE_wpFactory.ts`  
* `090_GITHUB_validate-manifest.yml`  
* `091_SCRIPT_validate-manifests.mjs`

可以，下面我直接把 **Cursor Pack v4** 轉成 **專案檔案包格式**。  
你可以整段貼給 Cursor，叫它依照 `FILE:` 標頭建立檔案。

---

FILE: 000\_MASTER\_PROMPT.md

You are implementing "Lobster Factory", a multi-tenant Agency OS / Client OS platform.

Primary stack:

\- WordPress \+ Kadence \+ WooCommerce \+ FluentCRM \+ Fluent Forms

\- Supabase (Postgres, Auth, RLS, Storage)

\- n8n for light integrations

\- Trigger.dev for durable long-running workflows

\- GitHub Actions for CI/CD

\- MCP-style agents for content, repair, reporting, sales assistance

\- Sentry for incidents

\- PostHog for analytics and feature flags

Core product goals:

1\. Create client organizations and workspaces

2\. Create WordPress staging sites

3\. Apply wc-core manifest safely

4\. Run smoke tests

5\. Support CRM-driven onboarding

6\. Version packages, prompts, templates, agents, workflows

7\. Track runs, incidents, approvals, costs, and decisions

Non-negotiable rules:

\- Never auto-deploy to production by default

\- All tenant-bound records must include organization\_id

\- Use workspace\_id where applicable

\- High-risk actions require explicit approval records

\- All workflows must write run records

\- All critical operations must be reversible or explicitly marked non-reversible

\- Prefer explicit schemas over implicit assumptions

\- Prefer small phases and acceptance criteria

\- Use TypeScript for application code

\- Use SQL migrations for database changes

\- Use Zod for runtime validation where appropriate

Architecture rules:

\- Supabase is the system of record for platform data

\- WordPress is the runtime delivery surface for sites and CRM operations

\- n8n is for light automations, webhooks, sync, notifications

\- Trigger.dev is for durable workflows like provisioning, install, repair, onboarding

\- GitHub Actions is for CI/CD and validation

\- Agents must have tool allowlists and deny-lists

\- Secrets must never be exposed in logs or output

When generating code:

\- Include file paths

\- Include comments sparingly but clearly

\- Include acceptance criteria

\- Include next steps only if necessary

FILE: 001\_REPO\_STRUCTURE.md

Recommended monorepo structure:

agency-os/

  apps/

    api/

      src/

        index.ts

        config/

        lib/

        routes/

        services/

        db/

        types/

    worker/

      src/

        index.ts

        jobs/

        triggers/

        activities/

        agents/

  packages/

    db/

      migrations/

      schemas/

      sql/

      src/

        client.ts

        types.ts

    workflows/

      src/

        trigger/

          create-wp-site.ts

          apply-manifest.ts

          client-onboarding.ts

          repair-incident.ts

    agents/

      src/

        configs/

        repair-agent.ts

        seo-agent.ts

        support-agent.ts

    manifests/

      wc-core.json

      wc-crm.json

      wc-membership.json

    policies/

      approval/

      tool/

      rollout/

    shared/

      src/

        zod/

        constants/

        logger/

        env/

  templates/

    wordpress/

      kadence/

      pages/

      reusable-blocks/

    woocommerce/

      manifests/

      scripts/

        install-from-manifest.sh

        smoke-test.sh

  infra/

    github/

      workflows/

    n8n/

      exports/

    trigger/

      config/

  docs/

    MASTER\_SPEC.md

    RUNBOOKS.md

    INCIDENTS.md

  .env.example

  package.json

  turbo.json

  pnpm-workspace.yaml

FILE: 002\_ROUTING\_MATRIX.md

Execution routing matrix:

1\. n8n

\- lead webhooks

\- CRM sync

\- notifications

\- onboarding email

\- social publishing

2\. Trigger.dev

\- create client workspace

\- create staging site

\- install WordPress

\- apply wc-core manifest

\- run smoke tests

\- repair flow

\- long-running tutorial generation

3\. GitHub Actions

\- manifest validation

\- SQL linting

\- tests

\- PR checks

\- release checks

4\. MCP agents

\- code diagnosis

\- content generation

\- support draft generation

\- proposal drafting

\- incident analysis

Hard rule:

\- High-risk production changes must never execute exclusively through n8n or an unrestricted agent

FILE: 010\_CURSOR\_BOOTSTRAP.md

Use the repository structure and files below as the initial implementation baseline.

Important:

\- Do not redesign the system

\- Do not replace Supabase with another database

\- Do not remove the staging-only guardrail

\- Preserve explicit multi-tenant structure

\- Preserve workflow, agent, and approval concepts

\- Implement in small, compilable increments

\- Output file-by-file results

FILE: 020\_TASK\_01\_DATABASE.md

Task: Implement the database foundation.

Files:

\- packages/db/migrations/0001\_core.sql

\- packages/db/migrations/0002\_factory.sql

\- packages/db/migrations/0003\_agents\_approvals\_observability.sql

\- packages/db/migrations/0004\_rls\_helpers.sql

\- packages/db/migrations/0005\_seed\_minimum.sql

Requirements:

\- Ensure migrations run cleanly on Supabase

\- Add missing indexes only when needed

\- Keep schema explicit and normalized

\- Do not add unrelated tables yet

Output:

1\. final SQL files

2\. notes about any fixes

3\. suggested generated TypeScript types

Acceptance criteria:

\- Can create agency org \+ client org

\- Can create workspace, project, site, environment

\- Can create package, manifest, workflow, agent, approval records

\- RLS select works for membership-based access

FILE: 021\_TASK\_02\_MANIFEST\_AND\_WP\_FACTORY.md

Task: Implement manifest validation and WP factory service.

Files:

\- apps/api/src/types/manifest.ts

\- apps/api/src/services/wp/wpFactory.ts

\- scripts/validate-manifests.mjs

\- infra/github/workflows/validate-manifest.yml

\- packages/manifests/wc-core.json

\- templates/woocommerce/scripts/install-from-manifest.sh

\- templates/woocommerce/scripts/smoke-test.sh

Requirements:

\- Parse and validate wc-core manifest

\- Ensure staging-only guardrail

\- Ensure shell installer is safe and explicit

\- Ensure GitHub Action validates manifests on PR

Output:

1\. final code

2\. notes about unsafe areas

3\. suggested unit tests

Acceptance criteria:

\- wc-core manifest validates

\- installer blocks invalid input

\- smoke test script works

\- CI validates manifests

FILE: 022\_TASK\_03\_DURABLE\_WORKFLOWS.md

Task: Implement durable workflows for:

1\. create-wp-site

2\. apply-manifest

Files:

\- packages/workflows/src/trigger/create-wp-site.ts

\- packages/workflows/src/trigger/apply-manifest.ts

Requirements:

\- Use Zod validation

\- Write placeholders for DB persistence and hosting provider adapter

\- Explicitly block production manifest execution

\- Return structured status objects

Output:

1\. final workflow code

2\. TODO list for provider adapter

3\. suggested DB write points

Acceptance criteria:

\- workflows compile

\- inputs are validated

\- production is blocked

\- return values are structured and machine-readable

FILE: 023\_TASK\_04\_AGENT\_AND\_POLICY\_LOADERS.md

Task: Implement minimum agent \+ approval policy loading.

Files:

\- packages/agents/src/configs/repair-agent.json

\- packages/policies/approval/production-deploy-policy.json

\- packages/policies/tool/repair-agent-policy.json

Requirements:

\- Add loaders and validators in TypeScript

\- Keep schemas explicit

\- Do not execute agent logic yet

Output:

1\. JSON schemas or Zod schemas

2\. loader functions

3\. example validation usage

Acceptance criteria:

\- invalid policy fails validation

\- invalid agent config fails validation

\- production deploy policy is machine-readable

FILE: packages/db/migrations/0001\_core.sql

create extension if not exists pgcrypto;

create table if not exists organizations (

  id uuid primary key default gen\_random\_uuid(),

  type text not null check (type in ('agency', 'client')),

  name text not null,

  slug text not null unique,

  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),

  default\_locale text not null default 'en',

  default\_timezone text not null default 'UTC',

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now()

);

create table if not exists workspaces (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid not null references organizations(id) on delete cascade,

  name text not null,

  slug text not null,

  workspace\_type text not null default 'default',

  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now(),

  unique (organization\_id, slug)

);

create table if not exists profiles (

  id uuid primary key,

  email text not null unique,

  display\_name text,

  avatar\_url text,

  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),

  default\_organization\_id uuid references organizations(id) on delete set null,

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now()

);

create table if not exists organization\_memberships (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid not null references organizations(id) on delete cascade,

  user\_id uuid not null references profiles(id) on delete cascade,

  membership\_type text not null default 'member',

  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),

  joined\_at timestamptz not null default now(),

  metadata jsonb not null default '{}'::jsonb,

  unique (organization\_id, user\_id)

);

create table if not exists workspace\_memberships (

  id uuid primary key default gen\_random\_uuid(),

  workspace\_id uuid not null references workspaces(id) on delete cascade,

  user\_id uuid not null references profiles(id) on delete cascade,

  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),

  metadata jsonb not null default '{}'::jsonb,

  unique (workspace\_id, user\_id)

);

create table if not exists roles (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid references organizations(id) on delete cascade,

  name text not null,

  scope\_type text not null check (scope\_type in ('system', 'organization', 'workspace', 'project', 'site')),

  description text,

  is\_system boolean not null default false,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now(),

  unique (organization\_id, name, scope\_type)

);

create table if not exists permissions (

  id uuid primary key default gen\_random\_uuid(),

  resource\_type text not null,

  action text not null,

  risk\_level text not null check (risk\_level in ('low', 'medium', 'high')),

  description text,

  unique (resource\_type, action)

);

create table if not exists role\_permissions (

  role\_id uuid not null references roles(id) on delete cascade,

  permission\_id uuid not null references permissions(id) on delete cascade,

  constraints jsonb not null default '{}'::jsonb,

  primary key (role\_id, permission\_id)

);

create table if not exists user\_role\_assignments (

  id uuid primary key default gen\_random\_uuid(),

  user\_id uuid not null references profiles(id) on delete cascade,

  role\_id uuid not null references roles(id) on delete cascade,

  organization\_id uuid references organizations(id) on delete cascade,

  workspace\_id uuid references workspaces(id) on delete cascade,

  granted\_by uuid references profiles(id) on delete set null,

  granted\_at timestamptz not null default now(),

  expires\_at timestamptz,

  metadata jsonb not null default '{}'::jsonb

);

create table if not exists projects (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid not null references organizations(id) on delete cascade,

  workspace\_id uuid not null references workspaces(id) on delete cascade,

  client\_organization\_id uuid references organizations(id) on delete set null,

  name text not null,

  project\_type text not null default 'wordpress',

  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),

  owner\_user\_id uuid references profiles(id) on delete set null,

  start\_date date,

  target\_launch\_date date,

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now()

);

create table if not exists sites (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid not null references organizations(id) on delete cascade,

  workspace\_id uuid not null references workspaces(id) on delete cascade,

  project\_id uuid not null references projects(id) on delete cascade,

  site\_type text not null default 'woocommerce',

  name text not null,

  primary\_domain text,

  locale text not null default 'en',

  status text not null default 'draft' check (status in ('draft', 'staging', 'live', 'paused', 'archived')),

  theme\_family text not null default 'kadence',

  stack\_profile text not null default 'wc-core',

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now()

);

create table if not exists environments (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid not null references organizations(id) on delete cascade,

  workspace\_id uuid not null references workspaces(id) on delete cascade,

  site\_id uuid not null references sites(id) on delete cascade,

  environment\_type text not null check (environment\_type in ('local', 'staging', 'production', 'preview')),

  name text not null,

  base\_url text,

  hosting\_provider text,

  server\_ref text,

  status text not null default 'pending' check (status in ('pending', 'provisioning', 'ready', 'failed', 'archived')),

  wp\_root\_path text,

  credentials\_ref text,

  last\_health\_status text,

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now()

);

create index if not exists idx\_workspaces\_org\_id on workspaces(organization\_id);

create index if not exists idx\_org\_memberships\_org\_id on organization\_memberships(organization\_id);

create index if not exists idx\_org\_memberships\_user\_id on organization\_memberships(user\_id);

create index if not exists idx\_workspace\_memberships\_workspace\_id on workspace\_memberships(workspace\_id);

create index if not exists idx\_user\_role\_assignments\_user\_id on user\_role\_assignments(user\_id);

create index if not exists idx\_projects\_org\_ws on projects(organization\_id, workspace\_id);

create index if not exists idx\_sites\_org\_ws on sites(organization\_id, workspace\_id);

create index if not exists idx\_environments\_site\_id on environments(site\_id);

FILE: packages/db/migrations/0002\_factory.sql

create table if not exists packages (

  id uuid primary key default gen\_random\_uuid(),

  scope\_type text not null check (scope\_type in ('global', 'agency', 'client')),

  scope\_id uuid,

  name text not null,

  slug text not null,

  package\_type text not null default 'wordpress',

  description text,

  status text not null default 'active' check (status in ('draft', 'active', 'deprecated', 'archived')),

  default\_version text not null,

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now(),

  unique (scope\_type, scope\_id, slug)

);

create table if not exists package\_versions (

  id uuid primary key default gen\_random\_uuid(),

  package\_id uuid not null references packages(id) on delete cascade,

  version text not null,

  changelog text,

  compatibility jsonb not null default '{}'::jsonb,

  status text not null default 'active' check (status in ('draft', 'active', 'deprecated', 'archived')),

  artifact\_ref text,

  created\_at timestamptz not null default now(),

  created\_by uuid references profiles(id) on delete set null,

  metadata jsonb not null default '{}'::jsonb,

  unique (package\_id, version)

);

create table if not exists manifests (

  id uuid primary key default gen\_random\_uuid(),

  package\_version\_id uuid not null references package\_versions(id) on delete cascade,

  schema\_version text not null,

  manifest\_json jsonb not null,

  install\_guardrails jsonb not null default '{}'::jsonb,

  dependencies jsonb not null default '\[\]'::jsonb,

  conflicts jsonb not null default '\[\]'::jsonb,

  rollback\_hints jsonb not null default '{}'::jsonb,

  status text not null default 'active' check (status in ('draft', 'active', 'deprecated', 'archived')),

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now()

);

create table if not exists workflows (

  id uuid primary key default gen\_random\_uuid(),

  scope\_type text not null check (scope\_type in ('global', 'agency', 'client')),

  scope\_id uuid,

  name text not null,

  slug text not null,

  domain text not null,

  orchestrator\_type text not null check (orchestrator\_type in ('n8n', 'durable', 'github\_actions', 'mcp', 'manual')),

  risk\_level text not null check (risk\_level in ('low', 'medium', 'high')),

  status text not null default 'active',

  default\_version text not null,

  input\_schema jsonb not null default '{}'::jsonb,

  output\_schema jsonb not null default '{}'::jsonb,

  approval\_policy\_id uuid,

  rollback\_strategy jsonb not null default '{}'::jsonb,

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now(),

  unique (scope\_type, scope\_id, slug)

);

create table if not exists workflow\_versions (

  id uuid primary key default gen\_random\_uuid(),

  workflow\_id uuid not null references workflows(id) on delete cascade,

  version text not null,

  definition\_ref text not null,

  routing\_config jsonb not null default '{}'::jsonb,

  trigger\_config jsonb not null default '{}'::jsonb,

  guardrails jsonb not null default '{}'::jsonb,

  status text not null default 'active',

  created\_at timestamptz not null default now(),

  metadata jsonb not null default '{}'::jsonb,

  unique (workflow\_id, version)

);

create table if not exists workflow\_runs (

  id uuid primary key default gen\_random\_uuid(),

  workflow\_version\_id uuid not null references workflow\_versions(id) on delete cascade,

  organization\_id uuid not null references organizations(id) on delete cascade,

  workspace\_id uuid references workspaces(id) on delete cascade,

  project\_id uuid references projects(id) on delete cascade,

  site\_id uuid references sites(id) on delete cascade,

  environment\_id uuid references environments(id) on delete cascade,

  parent\_run\_id uuid references workflow\_runs(id) on delete set null,

  trigger\_type text not null,

  trigger\_ref text,

  actor\_type text not null check (actor\_type in ('human', 'agent', 'webhook', 'schedule', 'system')),

  actor\_ref text,

  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'blocked', 'cancelled')),

  risk\_level text not null check (risk\_level in ('low', 'medium', 'high')),

  input\_snapshot jsonb not null default '{}'::jsonb,

  output\_snapshot jsonb not null default '{}'::jsonb,

  artifacts jsonb not null default '\[\]'::jsonb,

  started\_at timestamptz not null default now(),

  ended\_at timestamptz,

  cost\_amount numeric,

  cost\_currency text,

  decision\_id uuid,

  incident\_id uuid,

  approval\_id uuid,

  metadata jsonb not null default '{}'::jsonb

);

create table if not exists package\_install\_runs (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid not null references organizations(id) on delete cascade,

  workspace\_id uuid not null references workspaces(id) on delete cascade,

  site\_id uuid not null references sites(id) on delete cascade,

  environment\_id uuid not null references environments(id) on delete cascade,

  package\_version\_id uuid not null references package\_versions(id) on delete cascade,

  manifest\_id uuid not null references manifests(id) on delete cascade,

  workflow\_run\_id uuid references workflow\_runs(id) on delete set null,

  triggered\_by\_user\_id uuid references profiles(id) on delete set null,

  triggered\_by\_agent\_id uuid,

  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'rolled\_back')),

  started\_at timestamptz not null default now(),

  ended\_at timestamptz,

  result\_summary jsonb not null default '{}'::jsonb,

  logs\_ref text,

  rollback\_run\_id uuid,

  metadata jsonb not null default '{}'::jsonb

);

create index if not exists idx\_workflow\_runs\_org on workflow\_runs(organization\_id);

create index if not exists idx\_workflow\_runs\_site on workflow\_runs(site\_id);

create index if not exists idx\_pkg\_install\_runs\_site on package\_install\_runs(site\_id);

FILE: packages/db/migrations/0003\_agents\_approvals\_observability.sql

create table if not exists policies (

  id uuid primary key default gen\_random\_uuid(),

  scope\_type text not null check (scope\_type in ('global', 'agency', 'client')),

  scope\_id uuid,

  name text not null,

  slug text not null,

  policy\_domain text not null,

  status text not null default 'active',

  default\_version text not null,

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now(),

  unique (scope\_type, scope\_id, slug)

);

create table if not exists policy\_versions (

  id uuid primary key default gen\_random\_uuid(),

  policy\_id uuid not null references policies(id) on delete cascade,

  version text not null,

  rules jsonb not null default '{}'::jsonb,

  risk\_matrix jsonb not null default '{}'::jsonb,

  enforcement\_mode text not null check (enforcement\_mode in ('advisory', 'soft\_block', 'hard\_block')),

  status text not null default 'active',

  created\_at timestamptz not null default now(),

  metadata jsonb not null default '{}'::jsonb,

  unique (policy\_id, version)

);

create table if not exists approval\_policies (

  id uuid primary key default gen\_random\_uuid(),

  name text not null,

  slug text not null unique,

  scope\_type text not null check (scope\_type in ('global', 'agency', 'client')),

  scope\_id uuid,

  resource\_type text not null,

  rules jsonb not null default '{}'::jsonb,

  status text not null default 'active',

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now()

);

create table if not exists approvals (

  id uuid primary key default gen\_random\_uuid(),

  approval\_policy\_id uuid not null references approval\_policies(id) on delete cascade,

  resource\_type text not null,

  resource\_id uuid not null,

  organization\_id uuid not null references organizations(id) on delete cascade,

  workspace\_id uuid references workspaces(id) on delete cascade,

  status text not null check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),

  requested\_by uuid references profiles(id) on delete set null,

  requested\_at timestamptz not null default now(),

  resolved\_at timestamptz,

  resolution\_notes text,

  metadata jsonb not null default '{}'::jsonb

);

create table if not exists approval\_steps (

  id uuid primary key default gen\_random\_uuid(),

  approval\_id uuid not null references approvals(id) on delete cascade,

  step\_order integer not null,

  approver\_user\_id uuid references profiles(id) on delete set null,

  approver\_role\_id uuid references roles(id) on delete set null,

  status text not null check (status in ('pending', 'approved', 'rejected', 'skipped')),

  acted\_at timestamptz,

  notes text,

  metadata jsonb not null default '{}'::jsonb

);

create table if not exists agents (

  id uuid primary key default gen\_random\_uuid(),

  scope\_type text not null check (scope\_type in ('global', 'agency', 'client')),

  scope\_id uuid,

  name text not null,

  slug text not null,

  agent\_domain text not null,

  agent\_type text not null,

  status text not null default 'active',

  default\_version text not null,

  description text,

  metadata jsonb not null default '{}'::jsonb,

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now(),

  unique (scope\_type, scope\_id, slug)

);

create table if not exists tool\_policies (

  id uuid primary key default gen\_random\_uuid(),

  name text not null,

  description text,

  allowed\_tools jsonb not null default '\[\]'::jsonb,

  denied\_tools jsonb not null default '\[\]'::jsonb,

  max\_steps integer,

  max\_cost numeric,

  requires\_approval\_for jsonb not null default '\[\]'::jsonb,

  environment\_constraints jsonb not null default '{}'::jsonb,

  status text not null default 'active',

  created\_at timestamptz not null default now(),

  updated\_at timestamptz not null default now()

);

create table if not exists agent\_versions (

  id uuid primary key default gen\_random\_uuid(),

  agent\_id uuid not null references agents(id) on delete cascade,

  version text not null,

  system\_prompt\_ref uuid,

  tool\_policy\_id uuid references tool\_policies(id) on delete set null,

  input\_schema jsonb not null default '{}'::jsonb,

  output\_schema jsonb not null default '{}'::jsonb,

  model\_config jsonb not null default '{}'::jsonb,

  safety\_config jsonb not null default '{}'::jsonb,

  status text not null default 'active',

  created\_at timestamptz not null default now(),

  metadata jsonb not null default '{}'::jsonb,

  unique (agent\_id, version)

);

create table if not exists agent\_runs (

  id uuid primary key default gen\_random\_uuid(),

  agent\_version\_id uuid not null references agent\_versions(id) on delete cascade,

  workflow\_run\_id uuid references workflow\_runs(id) on delete set null,

  organization\_id uuid not null references organizations(id) on delete cascade,

  workspace\_id uuid references workspaces(id) on delete cascade,

  project\_id uuid references projects(id) on delete cascade,

  site\_id uuid references sites(id) on delete cascade,

  environment\_id uuid references environments(id) on delete cascade,

  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'blocked')),

  goal text not null,

  input\_snapshot jsonb not null default '{}'::jsonb,

  output\_snapshot jsonb not null default '{}'::jsonb,

  tool\_trace jsonb not null default '\[\]'::jsonb,

  evaluation\_summary jsonb not null default '{}'::jsonb,

  started\_at timestamptz not null default now(),

  ended\_at timestamptz,

  cost\_amount numeric,

  cost\_breakdown jsonb not null default '{}'::jsonb,

  metadata jsonb not null default '{}'::jsonb

);

create table if not exists incidents (

  id uuid primary key default gen\_random\_uuid(),

  organization\_id uuid not null references organizations(id) on delete cascade,

  workspace\_id uuid references workspaces(id) on delete cascade,

  project\_id uuid references projects(id) on delete cascade,

  site\_id uuid references sites(id) on delete cascade,

  environment\_id uuid references environments(id) on delete cascade,

  domain text not null,

  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),

  status text not null check (status in ('open', 'investigating', 'mitigated', 'resolved')),

  title text not null,

  summary text not null,

  root\_cause\_summary text,

  first\_seen\_at timestamptz not null default now(),

  last\_seen\_at timestamptz not null default now(),

  resolved\_at timestamptz,

  sentry\_issue\_ref text,

  metadata jsonb not null default '{}'::jsonb

);

create table if not exists error\_events (

  id uuid primary key default gen\_random\_uuid(),

  incident\_id uuid references incidents(id) on delete set null,

  organization\_id uuid not null references organizations(id) on delete cascade,

  site\_id uuid references sites(id) on delete cascade,

  environment\_id uuid references environments(id) on delete cascade,

  source\_type text not null,

  source\_ref text,

  error\_code text,

  error\_message text not null,

  trace\_ref text,

  event\_payload jsonb not null default '{}'::jsonb,

  occurred\_at timestamptz not null default now(),

  metadata jsonb not null default '{}'::jsonb

);

FILE: packages/db/migrations/0004\_rls\_helpers.sql

create or replace function current\_user\_id()

returns uuid

language sql

stable

as $$

  select auth.uid()::uuid

$$;

create or replace function user\_has\_org\_access(org\_id uuid)

returns boolean

language sql

stable

as $$

  select exists (

    select 1

    from organization\_memberships om

    where om.organization\_id \= org\_id

      and om.user\_id \= auth.uid()::uuid

      and om.status \= 'active'

  )

$$;

create or replace function user\_has\_workspace\_access(ws\_id uuid)

returns boolean

language sql

stable

as $$

  select exists (

    select 1

    from workspace\_memberships wm

    where wm.workspace\_id \= ws\_id

      and wm.user\_id \= auth.uid()::uuid

      and wm.status \= 'active'

  )

$$;

alter table organizations enable row level security;

alter table workspaces enable row level security;

alter table projects enable row level security;

alter table sites enable row level security;

alter table environments enable row level security;

create policy organizations\_select on organizations

for select

using (

  user\_has\_org\_access(id)

);

create policy workspaces\_select on workspaces

for select

using (

  user\_has\_org\_access(organization\_id)

);

create policy projects\_select on projects

for select

using (

  user\_has\_org\_access(organization\_id)

);

create policy sites\_select on sites

for select

using (

  user\_has\_org\_access(organization\_id)

);

create policy environments\_select on environments

for select

using (

  user\_has\_org\_access(organization\_id)

);

FILE: packages/db/migrations/0005\_seed\_minimum.sql

insert into permissions (resource\_type, action, risk\_level, description)

values

  ('site', 'read', 'low', 'Read site'),

  ('site', 'create', 'medium', 'Create site'),

  ('site', 'update', 'medium', 'Update site'),

  ('site', 'deploy', 'high', 'Deploy site'),

  ('workflow', 'execute', 'medium', 'Execute workflow'),

  ('approval', 'approve', 'high', 'Approve high-risk action')

on conflict do nothing;

FILE: packages/manifests/wc-core.json

{

  "name": "wc-core",

  "version": "1.0.0",

  "schemaVersion": "1.0.0",

  "target": "staging-only",

  "description": "Base WooCommerce \+ Kadence \+ FluentCRM stack",

  "guardrails": {

    "allowEnvironments": \["staging"\],

    "requireBackup": true,

    "blockIfProduction": true

  },

  "dependencies": \[\],

  "conflicts": \[\],

  "steps": \[

    { "id": "theme-kadence", "type": "install\_theme", "slug": "kadence" },

    { "id": "plugin-kadence-blocks", "type": "install\_plugin", "slug": "kadence-blocks" },

    { "id": "plugin-woocommerce", "type": "install\_plugin", "slug": "woocommerce" },

    { "id": "plugin-cartflows", "type": "install\_plugin", "slug": "cartflows" },

    { "id": "plugin-rank-math", "type": "install\_plugin", "slug": "seo-by-rank-math" },

    { "id": "plugin-fluent-crm", "type": "install\_plugin", "slug": "fluent-crm" },

    { "id": "plugin-fluent-forms", "type": "install\_plugin", "slug": "fluentform" },

    { "id": "plugin-fluent-smtp", "type": "install\_plugin", "slug": "fluent-smtp" },

    { "id": "plugin-site-kit", "type": "install\_plugin", "slug": "google-site-kit" },

    {

      "id": "plugin-litespeed",

      "type": "conditional\_plugin",

      "condition": "is\_litespeed",

      "slug": "litespeed-cache"

    }

  \],

  "postInstall": \[

    { "type": "activate\_theme", "slug": "kadence" },

    { "type": "flush\_permalinks" },

    { "type": "set\_option", "key": "timezone\_string", "value": "Asia/Taipei" }

  \],

  "verification": \[

    { "type": "check\_homepage" },

    { "type": "check\_admin\_login" },

    { "type": "check\_plugin\_active", "slug": "woocommerce" },

    { "type": "check\_plugin\_active", "slug": "fluent-crm" }

  \],

  "rollback": {

    "strategy": "restore\_backup\_snapshot"

  }

}

FILE: templates/woocommerce/scripts/install-from-manifest.sh

\#\!/usr/bin/env bash

set \-euo pipefail

WP\_ROOT="${1:-}"

MANIFEST\_PATH="${2:-}"

if \[\[ \-z "$WP\_ROOT" || \-z "$MANIFEST\_PATH" \]\]; then

  echo "Usage: ./install-from-manifest.sh \<WP\_ROOT\> \<MANIFEST\_PATH\>"

  exit 1

fi

if \[\[ \! \-f "$WP\_ROOT/wp-config.php" \]\]; then

  echo "ERROR: wp-config.php not found in $WP\_ROOT"

  exit 1

fi

if \[\[ \! \-f "$MANIFEST\_PATH" \]\]; then

  echo "ERROR: manifest not found at $MANIFEST\_PATH"

  exit 1

fi

command \-v jq \>/dev/null 2\>&1 || { echo "ERROR: jq is required"; exit 1; }

command \-v wp \>/dev/null 2\>&1 || { echo "ERROR: wp-cli is required"; exit 1; }

cd "$WP\_ROOT"

TARGET=$(jq \-r '.target' "$MANIFEST\_PATH")

if \[\[ "$TARGET" \!= "staging-only" \]\]; then

  echo "ERROR: only staging-only manifests supported in this installer"

  exit 1

fi

echo "== Creating backup snapshot \=="

BACKUP\_DIR="/tmp/wp-backup-$(date \+%s)"

mkdir \-p "$BACKUP\_DIR"

tar \-czf "$BACKUP\_DIR/files.tar.gz" .

echo "== Detecting LiteSpeed \=="

IS\_LITESPEED="false"

if \[\[ "${SERVER\_SOFTWARE:-}" \== \*"LiteSpeed"\* \]\]; then

  IS\_LITESPEED="true"

fi

STEP\_COUNT=$(jq '.steps | length' "$MANIFEST\_PATH")

for ((i=0; i\<STEP\_COUNT; i++)); do

  TYPE=$(jq \-r ".steps\[$i\].type" "$MANIFEST\_PATH")

  SLUG=$(jq \-r ".steps\[$i\].slug // empty" "$MANIFEST\_PATH")

  CONDITION=$(jq \-r ".steps\[$i\].condition // empty" "$MANIFEST\_PATH")

  case "$TYPE" in

    install\_theme)

      echo "Installing theme: $SLUG"

      wp theme install "$SLUG" \--activate

      ;;

    install\_plugin)

      echo "Installing plugin: $SLUG"

      wp plugin install "$SLUG" \--activate

      ;;

    conditional\_plugin)

      if \[\[ "$CONDITION" \== "is\_litespeed" && "$IS\_LITESPEED" \== "true" \]\]; then

        echo "Installing conditional plugin: $SLUG"

        wp plugin install "$SLUG" \--activate

      else

        echo "Skipping conditional plugin: $SLUG"

      fi

      ;;

    \*)

      echo "ERROR: Unsupported step type $TYPE"

      exit 1

      ;;

  esac

done

POST\_COUNT=$(jq '.postInstall | length' "$MANIFEST\_PATH")

for ((i=0; i\<POST\_COUNT; i++)); do

  TYPE=$(jq \-r ".postInstall\[$i\].type" "$MANIFEST\_PATH")

  case "$TYPE" in

    activate\_theme)

      SLUG=$(jq \-r ".postInstall\[$i\].slug" "$MANIFEST\_PATH")

      wp theme activate "$SLUG"

      ;;

    flush\_permalinks)

      wp rewrite flush \--hard

      ;;

    set\_option)

      KEY=$(jq \-r ".postInstall\[$i\].key" "$MANIFEST\_PATH")

      VALUE=$(jq \-r ".postInstall\[$i\].value" "$MANIFEST\_PATH")

      wp option update "$KEY" "$VALUE"

      ;;

    \*)

      echo "Skipping unsupported postInstall type: $TYPE"

      ;;

  esac

done

echo "== Running verification \=="

wp option get home \>/dev/null

wp plugin is-active woocommerce

wp plugin is-active fluent-crm

wp plugin is-active fluent-smtp

echo "== Manifest install completed successfully \=="

FILE: templates/woocommerce/scripts/smoke-test.sh

\#\!/usr/bin/env bash

set \-euo pipefail

BASE\_URL="${1:-}"

if \[\[ \-z "$BASE\_URL" \]\]; then

  echo "Usage: ./smoke-test.sh \<BASE\_URL\>"

  exit 1

fi

curl \-fsSL "$BASE\_URL" \>/dev/null

curl \-fsSL "$BASE\_URL/wp-login.php" \>/dev/null

echo "Smoke tests passed for $BASE\_URL"

FILE: apps/api/src/types/manifest.ts

import { z } from "zod";

export const ManifestStepSchema \= z.object({

  id: z.string(),

  type: z.enum(\["install\_theme", "install\_plugin", "conditional\_plugin"\]),

  slug: z.string().optional(),

  condition: z.string().optional(),

});

export const ManifestSchema \= z.object({

  name: z.string(),

  version: z.string(),

  schemaVersion: z.string(),

  target: z.literal("staging-only"),

  description: z.string().optional(),

  guardrails: z.object({

    allowEnvironments: z.array(z.string()),

    requireBackup: z.boolean(),

    blockIfProduction: z.boolean(),

  }),

  dependencies: z.array(z.unknown()),

  conflicts: z.array(z.unknown()),

  steps: z.array(ManifestStepSchema),

  postInstall: z.array(z.record(z.any())),

  verification: z.array(z.record(z.any())),

  rollback: z.object({

    strategy: z.string(),

  }),

});

export type Manifest \= z.infer\<typeof ManifestSchema\>;

FILE: apps/api/src/services/wp/wpFactory.ts

import { ManifestSchema } from "../../types/manifest";

export async function validateManifest(raw: unknown) {

  return ManifestSchema.parse(raw);

}

export async function assertStagingOnly(environmentType: string) {

  if (environmentType \!== "staging") {

    throw new Error("Operation blocked: only staging environment is allowed");

  }

}

export async function buildInstallPlan(manifest: unknown) {

  const parsed \= await validateManifest(manifest);

  return {

    package: parsed.name,

    version: parsed.version,

    steps: parsed.steps,

    postInstall: parsed.postInstall,

    verification: parsed.verification,

    rollback: parsed.rollback,

  };

}

FILE: packages/workflows/src/trigger/create-wp-site.ts

import { task, logger } from "@trigger.dev/sdk";

import { z } from "zod";

const InputSchema \= z.object({

  organizationId: z.string().uuid(),

  workspaceId: z.string().uuid(),

  projectId: z.string().uuid(),

  siteId: z.string().uuid(),

  siteName: z.string().min(1),

  manifestSlug: z.literal("wc-core"),

});

export const createWpSite \= task({

  id: "create-wp-site",

  run: async (payload: unknown) \=\> {

    const input \= InputSchema.parse(payload);

    logger.info("Starting WP site creation", input);

    return {

      status: "pending\_implementation",

      input,

    };

  },

});

FILE: packages/workflows/src/trigger/apply-manifest.ts

import { task, logger } from "@trigger.dev/sdk";

import { z } from "zod";

import fs from "node:fs/promises";

import path from "node:path";

const InputSchema \= z.object({

  environmentId: z.string().uuid(),

  wpRootPath: z.string().min(1),

  manifestPath: z.string().min(1),

  environmentType: z.enum(\["staging", "production"\]),

});

export const applyManifest \= task({

  id: "apply-manifest",

  run: async (payload: unknown) \=\> {

    const input \= InputSchema.parse(payload);

    if (input.environmentType \!== "staging") {

      throw new Error("Manifest install is blocked outside staging");

    }

    const raw \= await fs.readFile(path.resolve(input.manifestPath), "utf8");

    const manifest \= JSON.parse(raw);

    logger.info("Loaded manifest", {

      name: manifest.name,

      version: manifest.version,

    });

    return {

      status: "pending\_shell\_execution",

      manifest,

      input,

    };

  },

});

FILE: packages/agents/src/configs/repair-agent.json

{

  "name": "repair-agent",

  "version": "1.0.0",

  "domain": "repair",

  "allowedTools": \[

    "read\_logs",

    "read\_repo",

    "analyze\_trace",

    "create\_patch",

    "open\_pr"

  \],

  "deniedTools": \[

    "deploy\_production",

    "read\_secrets",

    "drop\_database",

    "execute\_destructive\_migration"

  \],

  "requiresApprovalFor": \[

    "production\_change",

    "payment\_logic\_change",

    "schema\_change"

  \],

  "limits": {

    "maxSteps": 12,

    "maxCostUsd": 5

  }

}

FILE: packages/policies/approval/production-deploy-policy.json

{

  "name": "production-deploy-policy",

  "resourceType": "deployment",

  "rules": \[

    {

      "match": {

        "environment": "production"

      },

      "requiredApprovals": \[

        { "role": "agency\_admin", "count": 1 }

      \],

      "mode": "hard\_block"

    }

  \]

}

FILE: packages/policies/tool/repair-agent-policy.json

{

  "name": "repair-agent-policy",

  "allowedTools": \[

    "read\_logs",

    "read\_repo",

    "create\_patch",

    "open\_pr"

  \],

  "deniedTools": \[

    "deploy\_production",

    "read\_secret\_plaintext",

    "drop\_database"

  \],

  "environmentConstraints": {

    "allowedEnvironments": \["staging", "preview"\],

    "blockedEnvironments": \["production"\]

  },

  "requiresApprovalFor": \[

    "code\_merge",

    "schema\_change"

  \]

}

FILE: infra/github/workflows/validate-manifest.yml

name: Validate Manifest

on:

  pull\_request:

    paths:

      \- "packages/manifests/\*\*"

jobs:

  validate:

    runs-on: ubuntu-latest

    steps:

      \- uses: actions/checkout@v4

      \- uses: actions/setup-node@v4

        with:

          node-version: 20

      \- run: npm ci

      \- run: node scripts/validate-manifests.mjs

FILE: scripts/validate-manifests.mjs

import fs from "node:fs/promises";

import path from "node:path";

const dir \= path.resolve("packages/manifests");

const files \= await fs.readdir(dir);

for (const file of files) {

  if (\!file.endsWith(".json")) continue;

  const raw \= await fs.readFile(path.join(dir, file), "utf8");

  const data \= JSON.parse(raw);

  if (data.target \!== "staging-only") {

    throw new Error(\`${file}: target must be staging-only\`);

  }

  if (\!Array.isArray(data.steps) || data.steps.length \=== 0\) {

    throw new Error(\`${file}: steps required\`);

  }

}

console.log("All manifests valid");

FILE: infra/n8n/exports/client-onboarding-flow.json

{

  "name": "client-onboarding-flow",

  "nodes": \[

    {

      "name": "Webhook",

      "type": "n8n-nodes-base.webhook",

      "position": \[200, 200\],

      "parameters": {

        "path": "client-onboarding",

        "httpMethod": "POST"

      }

    },

    {

      "name": "Validate Payload",

      "type": "n8n-nodes-base.code",

      "position": \[450, 200\],

      "parameters": {

        "jsCode": "return items;"

      }

    },

    {

      "name": "Call API",

      "type": "n8n-nodes-base.httpRequest",

      "position": \[700, 200\],

      "parameters": {

        "method": "POST",

        "url": "https://api.example.com/internal/onboarding"

      }

    }

  \],

  "connections": {

    "Webhook": {

      "main": \[\[{ "node": "Validate Payload", "type": "main", "index": 0 }\]\]

    },

    "Validate Payload": {

      "main": \[\[{ "node": "Call API", "type": "main", "index": 0 }\]\]

    }

  }

}

FILE: 110\_CURSOR\_RUN\_ORDER.md

Run Cursor in this order:

1\. 000\_MASTER\_PROMPT.md

2\. 001\_REPO\_STRUCTURE.md

3\. 002\_ROUTING\_MATRIX.md

4\. 010\_CURSOR\_BOOTSTRAP.md

5\. 020\_TASK\_01\_DATABASE.md

6\. 021\_TASK\_02\_MANIFEST\_AND\_WP\_FACTORY.md

7\. 022\_TASK\_03\_DURABLE\_WORKFLOWS.md

8\. 023\_TASK\_04\_AGENT\_AND\_POLICY\_LOADERS.md

Do not ask Cursor to implement everything at once.

Ask for one task only, wait for output, then continue.

FILE: 111\_FIRST\_MESSAGE\_TO\_CURSOR.md

Start with TASK\_01 only.

Use these files as the intended target structure:

\- packages/db/migrations/0001\_core.sql

\- packages/db/migrations/0002\_factory.sql

\- packages/db/migrations/0003\_agents\_approvals\_observability.sql

\- packages/db/migrations/0004\_rls\_helpers.sql

\- packages/db/migrations/0005\_seed\_minimum.sql

Return:

1\. final SQL files

2\. brief explanation

3\. any migration corrections needed

Do not implement later phases yet.

---

你如果要更方便，我下一則可以直接幫你做一版 **「單一大檔案匯入包」**，也就是把上面全部合成一份超長文本，專門給 Cursor 一次讀取並依 `FILE:` 分檔建立。

