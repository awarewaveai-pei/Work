-- 0055_intake_quote.sql
-- Stage 3: add quote_data + quote_status to intake_forms for the human-quote flow.
-- Lifecycle: none → draft → pending_approval → approved (build unlocked) | rejected
-- Safe to run on live DB: ADD COLUMN with default + index only.

alter table intake_forms
  add column if not exists quote_data jsonb,
  add column if not exists quote_status text not null default 'none'
    check (quote_status in ('none', 'draft', 'pending_approval', 'approved', 'rejected'));

create index if not exists intake_forms_quote_status_idx
  on intake_forms(quote_status)
  where quote_status <> 'none';

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
