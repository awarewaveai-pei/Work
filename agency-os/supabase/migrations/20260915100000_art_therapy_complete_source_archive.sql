-- Complete, immutable Airtable source archive for one-time migration provenance.
-- This is not a public API or canonical model. It preserves every source value
-- so canonical mappings can be audited without losing the original grid content.
create table if not exists art_therapy._source_tables (
  id text primary key,
  name text not null,
  record_count integer not null,
  field_count integer not null,
  source_snapshot text not null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists art_therapy._source_fields (
  id text primary key,
  table_id text not null references art_therapy._source_tables(id),
  name text not null,
  field_type text not null,
  field_order integer not null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists art_therapy._source_records (
  id text primary key,
  table_id text not null references art_therapy._source_tables(id),
  created_time timestamptz,
  raw_values jsonb not null default '{}'::jsonb,
  display_values jsonb not null default '{}'::jsonb,
  source_snapshot text not null
);

create table if not exists art_therapy._source_record_values (
  record_id text not null references art_therapy._source_records(id),
  field_id text not null references art_therapy._source_fields(id),
  raw_value jsonb,
  display_value text,
  source_snapshot text not null,
  primary key (record_id, field_id)
);

create index if not exists _source_fields_table_id_idx on art_therapy._source_fields(table_id);
create index if not exists _source_records_table_id_idx on art_therapy._source_records(table_id);
create index if not exists _source_record_values_field_id_idx on art_therapy._source_record_values(field_id);

alter table art_therapy._source_tables enable row level security;
alter table art_therapy._source_fields enable row level security;
alter table art_therapy._source_records enable row level security;
alter table art_therapy._source_record_values enable row level security;

revoke all on art_therapy._source_tables from anon, authenticated;
revoke all on art_therapy._source_fields from anon, authenticated;
revoke all on art_therapy._source_records from anon, authenticated;
revoke all on art_therapy._source_record_values from anon, authenticated;
revoke all on art_therapy._source_tables from public;
revoke all on art_therapy._source_fields from public;
revoke all on art_therapy._source_records from public;
revoke all on art_therapy._source_record_values from public;
grant usage on schema art_therapy to service_role;
grant select on art_therapy._source_tables, art_therapy._source_fields, art_therapy._source_records, art_therapy._source_record_values to service_role;
