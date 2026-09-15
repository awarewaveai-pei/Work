-- Move the non-empty Airtable clinical tables into an isolated canonical schema.
-- The schema is deliberately not exposed through PostgREST and is default-deny.
create schema if not exists clinical;
revoke all on schema clinical from public, anon, authenticated;
grant usage on schema clinical to service_role;

create table clinical.therapists (
  id uuid primary key,
  source_record_id text not null unique,
  name text not null,
  specialty text,
  license_number text,
  contact_information text,
  availability text,
  status text,
  profile_attachments jsonb,
  articles_authored text,
  source_total_appointments integer,
  source_active_clients integer,
  source_upcoming_appointments text,
  appointment_summary text,
  client_feedback_analysis text,
  created_at timestamptz not null default now()
);

create table clinical.clients (
  id uuid primary key,
  source_record_id text not null unique,
  name text not null,
  gender text,
  date_of_birth date,
  contact_information text,
  intake_date date,
  diagnosis text,
  notes text,
  source_age_years integer,
  assigned_therapist_id uuid references clinical.therapists(id) on delete set null,
  created_at timestamptz not null default now()
);

create table clinical.appointments (
  id uuid primary key,
  source_record_id text not null unique,
  name text not null,
  client_id uuid not null references clinical.clients(id) on delete restrict,
  therapist_id uuid references clinical.therapists(id) on delete set null,
  scheduled_for date,
  duration_minutes integer,
  session_type text,
  status text,
  session_notes text,
  session_summary text,
  next_action_recommendation text,
  created_at timestamptz not null default now()
);

create table clinical.assessment_results (
  id uuid primary key,
  source_record_id text not null unique,
  name text not null,
  client_id uuid not null references clinical.clients(id) on delete restrict,
  taken_on date,
  result_summary text,
  score numeric,
  therapist_notes text,
  overall_sentiment text,
  next_steps_recommendation text,
  created_at timestamptz not null default now()
);

create table clinical.assessment_result_therapists (
  assessment_result_id uuid not null references clinical.assessment_results(id) on delete cascade,
  therapist_id uuid not null references clinical.therapists(id) on delete restrict,
  source_ordinal integer not null,
  primary key (assessment_result_id, therapist_id)
);

create table clinical.treatment_plans (
  id uuid primary key,
  source_record_id text not null unique,
  client_id uuid not null references clinical.clients(id) on delete restrict,
  diagnosis text,
  goals text,
  interventions text,
  start_date date,
  progress_notes text,
  progress_summary text,
  suggested_next_steps text,
  created_at timestamptz not null default now()
);

create table clinical.finance_transactions (
  id uuid primary key,
  source_record_id text not null unique,
  client_id uuid references clinical.clients(id) on delete set null,
  transaction_description text,
  transaction_type text,
  transaction_date date,
  transaction_category text,
  transaction_amount numeric,
  payment_method text,
  transaction_status text,
  client_transaction_summary text,
  created_at timestamptz not null default now()
);

create index clients_assigned_therapist_id_idx on clinical.clients (assigned_therapist_id);
create index appointments_client_id_idx on clinical.appointments (client_id);
create index appointments_therapist_id_idx on clinical.appointments (therapist_id);
create index assessment_results_client_id_idx on clinical.assessment_results (client_id);
create index treatment_plans_client_id_idx on clinical.treatment_plans (client_id);
create index finance_transactions_client_id_idx on clinical.finance_transactions (client_id);

-- Stable UUIDs are derived from Airtable IDs only for migration determinism;
-- the Airtable IDs remain provenance, not business identifiers.
with source_rows as (
  select sr.id, sr.raw_values, sr.display_values
  from art_therapy._source_records sr join art_therapy._source_tables st on st.id = sr.table_id
  where st.name = 'Therapists'
)
insert into clinical.therapists (
  id, source_record_id, name, specialty, license_number, contact_information,
  availability, status, profile_attachments, articles_authored,
  source_total_appointments, source_active_clients, source_upcoming_appointments,
  appointment_summary, client_feedback_analysis
)
select
  (substr(md5('clinical:therapist:' || id),1,8)||'-'||substr(md5('clinical:therapist:' || id),9,4)||'-5'||substr(md5('clinical:therapist:' || id),14,3)||'-a'||substr(md5('clinical:therapist:' || id),18,3)||'-'||substr(md5('clinical:therapist:' || id),21,12))::uuid,
  id,
  display_values ->> 'fldHoJmu5qgmYd06u', display_values ->> 'fld2CBubkj6RzU3wA', display_values ->> 'fldadldGPhMPP5m0E', display_values ->> 'fldKWCniatYXU8rSD',
  display_values ->> 'fldyzLGyTu92liddw', display_values ->> 'fldFdYj3WX8uX3H57', raw_values -> 'fldHc3flFlEnHW4l9', display_values ->> 'fldkmd4B0W9FVJmhg',
  nullif(display_values ->> 'fldiVBh93WxwTdmwB','')::integer, nullif(display_values ->> 'fld02KRSLGrczEH5K','')::integer,
  display_values ->> 'fldF2DGPUuMSfGBpA', display_values ->> 'flduiTL6Av9Wk6BlX', display_values ->> 'fldFiDrTDvdBlTSma'
from source_rows;

with source_rows as (
  select sr.id, sr.display_values, sl.linked_record_id
  from art_therapy._source_records sr join art_therapy._source_tables st on st.id = sr.table_id
  left join art_therapy._source_links sl on sl.source_record_id = sr.id and sl.source_field_id = 'fldhr7yUoaV2f69aZ'
  where st.name = 'Clients'
)
insert into clinical.clients (
  id, source_record_id, name, gender, date_of_birth, contact_information, intake_date,
  diagnosis, notes, source_age_years, assigned_therapist_id
)
select
  (substr(md5('clinical:client:' || s.id),1,8)||'-'||substr(md5('clinical:client:' || s.id),9,4)||'-5'||substr(md5('clinical:client:' || s.id),14,3)||'-a'||substr(md5('clinical:client:' || s.id),18,3)||'-'||substr(md5('clinical:client:' || s.id),21,12))::uuid,
  s.id, s.display_values ->> 'fldpNLQZQT2ZtF5zc', s.display_values ->> 'fldOpX3j9KPRXxKSo',
  nullif(s.display_values ->> 'fldxKC8JycKVzdPOG','')::date, s.display_values ->> 'fldZU410VIJPvbBCJ', nullif(s.display_values ->> 'fldSWlYm7YXiaKhmO','')::date,
  s.display_values ->> 'fldUoJSezoxNY8YxF', s.display_values ->> 'fld6nOvjZ7cg7ODh5', nullif(s.display_values ->> 'fld8UUpxgjvcWHIwo','')::integer,
  t.id
from source_rows s left join clinical.therapists t on t.source_record_id = s.linked_record_id;

with source_rows as (
  select sr.id, sr.display_values,
    (select linked_record_id from art_therapy._source_links where source_record_id=sr.id and source_field_id='fldtYeIbm1dvPYkfI' order by ordinal limit 1) as client_source_id,
    (select linked_record_id from art_therapy._source_links where source_record_id=sr.id and source_field_id='fldXaX5MbFd60u24O' order by ordinal limit 1) as therapist_source_id
  from art_therapy._source_records sr join art_therapy._source_tables st on st.id=sr.table_id where st.name='Appointments'
)
insert into clinical.appointments (id, source_record_id, name, client_id, therapist_id, scheduled_for, duration_minutes, session_type, status, session_notes, session_summary, next_action_recommendation)
select
  (substr(md5('clinical:appointment:' || s.id),1,8)||'-'||substr(md5('clinical:appointment:' || s.id),9,4)||'-5'||substr(md5('clinical:appointment:' || s.id),14,3)||'-a'||substr(md5('clinical:appointment:' || s.id),18,3)||'-'||substr(md5('clinical:appointment:' || s.id),21,12))::uuid,
  s.id, s.display_values ->> 'fld3DGhLbRYu4sAJG', c.id, t.id, nullif(s.display_values ->> 'fldJtMF80MoUPhRCb','')::date,
  nullif(s.display_values ->> 'fldgi7STMjb3vvTjN','')::integer, s.display_values ->> 'fldhODWquhrb81aQZ', s.display_values ->> 'fldCSTpIVOQ3uTZmp',
  s.display_values ->> 'fldw5n0Jn75AzB10e', s.display_values ->> 'fld6JRRyFbnPsV8DR', s.display_values ->> 'fldvGBbjcj2owW1Cj'
from source_rows s join clinical.clients c on c.source_record_id=s.client_source_id left join clinical.therapists t on t.source_record_id=s.therapist_source_id;

with source_rows as (
  select sr.id, sr.display_values,
    (select linked_record_id from art_therapy._source_links where source_record_id=sr.id and source_field_id='fldaNEMbkAMesKVYr' order by ordinal limit 1) as client_source_id
  from art_therapy._source_records sr join art_therapy._source_tables st on st.id=sr.table_id where st.name='Assessment Results'
)
insert into clinical.assessment_results (id, source_record_id, name, client_id, taken_on, result_summary, score, therapist_notes, overall_sentiment, next_steps_recommendation)
select
  (substr(md5('clinical:assessment:' || s.id),1,8)||'-'||substr(md5('clinical:assessment:' || s.id),9,4)||'-5'||substr(md5('clinical:assessment:' || s.id),14,3)||'-a'||substr(md5('clinical:assessment:' || s.id),18,3)||'-'||substr(md5('clinical:assessment:' || s.id),21,12))::uuid,
  s.id, s.display_values ->> 'fld98D2YFZop2tBYo', c.id, nullif(s.display_values ->> 'flduGiSELlH7LGwfJ','')::date, s.display_values ->> 'fldKPIlYKnEc4IGzp',
  nullif(s.display_values ->> 'fld5YW3FAIqZZsKkk','')::numeric, s.display_values ->> 'fldTUOHww0W5wL8yX', s.display_values ->> 'fld10Wi2PXvYtduXu', s.display_values ->> 'fldxHx6i3J03ucNGP'
from source_rows s join clinical.clients c on c.source_record_id=s.client_source_id;

insert into clinical.assessment_result_therapists (assessment_result_id, therapist_id, source_ordinal)
select ar.id, t.id, sl.ordinal
from art_therapy._source_links sl join clinical.assessment_results ar on ar.source_record_id=sl.source_record_id join clinical.therapists t on t.source_record_id=sl.linked_record_id
where sl.source_field_id='fldnMdki6uw0SVMBa';

with source_rows as (
  select sr.id, sr.display_values,
    (select linked_record_id from art_therapy._source_links where source_record_id=sr.id and source_field_id='fldsEBQn3q7XoOQde' order by ordinal limit 1) as client_source_id
  from art_therapy._source_records sr join art_therapy._source_tables st on st.id=sr.table_id where st.name='Treatment Plans'
)
insert into clinical.treatment_plans (id, source_record_id, client_id, diagnosis, goals, interventions, start_date, progress_notes, progress_summary, suggested_next_steps)
select
  (substr(md5('clinical:treatment-plan:' || s.id),1,8)||'-'||substr(md5('clinical:treatment-plan:' || s.id),9,4)||'-5'||substr(md5('clinical:treatment-plan:' || s.id),14,3)||'-a'||substr(md5('clinical:treatment-plan:' || s.id),18,3)||'-'||substr(md5('clinical:treatment-plan:' || s.id),21,12))::uuid,
  s.id, c.id, s.display_values ->> 'fldZJBAyjn5ctKYWf', s.display_values ->> 'fldG8ljoYL1XFZA3e', s.display_values ->> 'flddnaiauUX8U3zGe',
  nullif(s.display_values ->> 'fldTDllCxrl690HiV','')::date, s.display_values ->> 'fldqFtJXu2f4rLk1Z', s.display_values ->> 'fldXSlDS1rRSZByfA', s.display_values ->> 'fldHvBwiKavaR17k7'
from source_rows s join clinical.clients c on c.source_record_id=s.client_source_id;

with source_rows as (
  select sr.id, sr.display_values,
    (select linked_record_id from art_therapy._source_links where source_record_id=sr.id and source_field_id='fldKZODk46ztfSeOx' order by ordinal limit 1) as client_source_id
  from art_therapy._source_records sr join art_therapy._source_tables st on st.id=sr.table_id where st.name='Finance'
)
insert into clinical.finance_transactions (id, source_record_id, client_id, transaction_description, transaction_type, transaction_date, transaction_category, transaction_amount, payment_method, transaction_status, client_transaction_summary)
select
  (substr(md5('clinical:finance:' || s.id),1,8)||'-'||substr(md5('clinical:finance:' || s.id),9,4)||'-5'||substr(md5('clinical:finance:' || s.id),14,3)||'-a'||substr(md5('clinical:finance:' || s.id),18,3)||'-'||substr(md5('clinical:finance:' || s.id),21,12))::uuid,
  s.id, c.id, s.display_values ->> 'fld5r1ZQLWiJBjhKw', s.display_values ->> 'fldPGU4zF8xg9XgEm', nullif(s.display_values ->> 'fldPM1tDsgHEJDyTw','')::date,
  s.display_values ->> 'fld4jEeOsZXk9DA00', nullif(s.display_values ->> 'fld5NZKbV28B7TPRU','')::numeric, s.display_values ->> 'fldC0aUuymrYGAs3g', s.display_values ->> 'fldZSxYb0QMLVVcAD', s.display_values ->> 'fld7KLpjqnMtfjQUb'
from source_rows s left join clinical.clients c on c.source_record_id=s.client_source_id;

alter table clinical.therapists enable row level security;
alter table clinical.clients enable row level security;
alter table clinical.appointments enable row level security;
alter table clinical.assessment_results enable row level security;
alter table clinical.assessment_result_therapists enable row level security;
alter table clinical.treatment_plans enable row level security;
alter table clinical.finance_transactions enable row level security;
alter table clinical.therapists force row level security;
alter table clinical.clients force row level security;
alter table clinical.appointments force row level security;
alter table clinical.assessment_results force row level security;
alter table clinical.assessment_result_therapists force row level security;
alter table clinical.treatment_plans force row level security;
alter table clinical.finance_transactions force row level security;
revoke all on all tables in schema clinical from public, anon, authenticated;
