-- 0166: vendor bills per Asia/Taipei month for /ops/costs 月報 對帳 (next-admin lib/ai/vendor-invoices.ts).
-- One month, one vendor = three figures: the estimate (ai_call_logs usage × list price, computed, not stored here),
-- invoice_usd and paid_twd (both entered by hand). Implied rate and fee rate are derived from them, never stored.
-- Append-only: a correction is a new row; the newest row for (month, vendor) wins, older rows stay as the audit trail.
-- vendor = lower-case payee key (vendor-invoices.ts vendorKey: anything billed through Replicate is 'replicate').
-- RLS deny-by-default (same as 0165_fx_rates): RLS on, no anon/auth policy, so only the service role reads/writes.
-- Additive. Rollback: 0166_vendor_invoices.down.sql.
begin;
set local lock_timeout = '5s';

create table if not exists public.vendor_invoices (
  id              uuid primary key default gen_random_uuid(),
  month           date not null check (extract(day from month) = 1),  -- 1st of the Asia/Taipei month
  vendor          text not null check (vendor = lower(vendor) and length(btrim(vendor)) between 1 and 40),
  invoice_usd     numeric(12,2) not null check (invoice_usd >= 0),
  paid_twd        numeric(12,2) not null check (paid_twd >= 0),        -- what left the account: card fee and tax included
  paid_at         date,
  payment_method  text check (payment_method in ('card', 'paypal', 'wire', 'other')),
  invoice_ref     text,
  tax_twd         numeric(12,2) check (tax_twd >= 0),                  -- only when the bill lists VAT / withholding separately
  note            text,
  created_by      text,
  created_at      timestamptz not null default now()
);

create index if not exists vendor_invoices_month_vendor_created_idx
  on public.vendor_invoices (month, vendor, created_at desc);

alter table public.vendor_invoices enable row level security;

-- Append-only in the database, not just in the app: any UPDATE / DELETE (service role included) is refused.
create or replace function public.vendor_invoices_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'vendor_invoices is append-only: add a new row instead of changing %', old.id;
end $$;
drop trigger if exists vendor_invoices_append_only on public.vendor_invoices;
create trigger vendor_invoices_append_only before update or delete on public.vendor_invoices
  for each row execute function public.vendor_invoices_append_only();

notify pgrst, 'reload schema';
commit;
