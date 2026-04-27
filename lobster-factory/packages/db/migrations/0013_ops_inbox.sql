-- lobster-factory/packages/db/migrations/0013_ops_inbox.sql
-- 路線 B：Ops Inbox 主表 + Gemini 配額表
-- 設計版：docs/Ops_Observability_PathB_Plan.md v2.0 §5.1 / §5.2
-- 執行版：docs/Ops_Observability_PathB_Implementation.md §4.5
-- self-contained：只用 pgcrypto extension，無 FK 到 0001–0012

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

-- ─── 部署注意：New table → PostgREST schema cache ─────────────
-- 若 Kong/REST 回 PGRST205「table not in schema cache」：在 DB 內執行
--   NOTIFY pgrst, 'reload schema';
-- 或重啟容器 supabase-rest（EU：`docker restart supabase-rest`）。
