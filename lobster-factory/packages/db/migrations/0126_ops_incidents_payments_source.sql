-- 0126: a WooCommerce payment event the control plane refuses for good (the shop has usually taken the money) raises an
-- ops incident with source 'payments' (lib/payments/woo-billing.ts raiseRefusal; ADR 017 4b-3). 0100's list plus 'payments'.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.ops_incidents') is not null then
    alter table public.ops_incidents drop constraint if exists ops_incidents_source_check;
    alter table public.ops_incidents add constraint ops_incidents_source_check
      check (source in ('sentry','uptime_kuma','grafana','netdata','posthog','manual','deploy','collection','site_watch','schedule','social','payments'));
  end if;
end $$;
commit;
