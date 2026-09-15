-- A private, literal Airtable mirror.  Every source table and field receives a
-- physical Postgres table/column; raw values remain JSONB to preserve Airtable
-- scalar, array, attachment, linked-record, formula, and lookup representations.

create schema if not exists airtable_mirror;
revoke all on schema airtable_mirror from public, anon, authenticated;
grant usage on schema airtable_mirror to service_role;

create table if not exists airtable_mirror.table_catalog (
  source_table_id text primary key,
  source_table_name text not null,
  physical_table_name text not null unique,
  source_record_count integer not null,
  source_field_count integer not null,
  source_snapshot text not null,
  metadata jsonb not null
);

create table if not exists airtable_mirror.field_catalog (
  source_field_id text primary key,
  source_table_id text not null references airtable_mirror.table_catalog(source_table_id),
  source_field_name text not null,
  source_field_type text not null,
  physical_column_name text not null,
  field_order integer not null,
  metadata jsonb not null,
  migration_disposition text,
  canonical_target text,
  transform_rule text,
  approval_status text,
  unique (source_table_id, physical_column_name)
);

insert into airtable_mirror.table_catalog (
  source_table_id, source_table_name, physical_table_name, source_record_count,
  source_field_count, source_snapshot, metadata
)
select st.id, st.name, left(st.name, 12) || '__' || right(st.id, 6),
  st.record_count, st.field_count, st.source_snapshot, st.metadata
from art_therapy._source_tables st
on conflict (source_table_id) do update set
  source_table_name=excluded.source_table_name,
  physical_table_name=excluded.physical_table_name,
  source_record_count=excluded.source_record_count,
  source_field_count=excluded.source_field_count,
  source_snapshot=excluded.source_snapshot,
  metadata=excluded.metadata;

insert into airtable_mirror.field_catalog (
  source_field_id, source_table_id, source_field_name, source_field_type,
  physical_column_name, field_order, metadata, migration_disposition,
  canonical_target, transform_rule, approval_status
)
select sf.id, sf.table_id, sf.name, sf.field_type,
  left(sf.name, 12) || '__' || right(sf.id, 6), sf.field_order, sf.metadata,
  fm.disposition, fm.target, fm.transform_rule, fm.approval_status
from art_therapy._source_fields sf
left join art_therapy._migration_field_map fm on fm.source_field_id=sf.id
on conflict (source_field_id) do update set
  source_table_id=excluded.source_table_id,
  source_field_name=excluded.source_field_name,
  source_field_type=excluded.source_field_type,
  physical_column_name=excluded.physical_column_name,
  field_order=excluded.field_order,
  metadata=excluded.metadata,
  migration_disposition=excluded.migration_disposition,
  canonical_target=excluded.canonical_target,
  transform_rule=excluded.transform_rule,
  approval_status=excluded.approval_status;

do $$
declare
  t record;
  f record;
  column_list text;
  value_list text;
begin
  for t in
    select source_table_id, source_table_name, physical_table_name
    from airtable_mirror.table_catalog
    order by source_table_id
  loop
    execute format(
      'create table if not exists airtable_mirror.%I (
         airtable_record_id text primary key,
         airtable_created_time timestamptz,
         raw_values jsonb not null default ''{}''::jsonb,
         display_values jsonb not null default ''{}''::jsonb,
         source_snapshot text not null
       )', t.physical_table_name
    );
    execute format('comment on table airtable_mirror.%I is %L', t.physical_table_name,
      'Airtable mirror for ' || t.source_table_name || ' (' || t.source_table_id || ')');

    for f in
      select source_field_id, source_field_name, source_field_type, physical_column_name
      from airtable_mirror.field_catalog
      where source_table_id=t.source_table_id
      order by field_order
    loop
      execute format('alter table airtable_mirror.%I add column if not exists %I jsonb',
        t.physical_table_name, f.physical_column_name);
      execute format('comment on column airtable_mirror.%I.%I is %L',
        t.physical_table_name, f.physical_column_name,
        'Airtable field: ' || f.source_field_name || ' [' || f.source_field_type || '] (' || f.source_field_id || ')');
    end loop;

    select
      string_agg(format('%I', physical_column_name), ', ' order by field_order),
      string_agg(format('sr.raw_values -> %L', source_field_id), ', ' order by field_order)
    into column_list, value_list
    from airtable_mirror.field_catalog
    where source_table_id=t.source_table_id;

    execute format(
      'insert into airtable_mirror.%I (airtable_record_id, airtable_created_time, raw_values, display_values, source_snapshot%s)
       select sr.id, sr.created_time, sr.raw_values, sr.display_values, sr.source_snapshot%s
       from art_therapy._source_records sr
       where sr.table_id=%L
       on conflict (airtable_record_id) do update set
         airtable_created_time=excluded.airtable_created_time,
         raw_values=excluded.raw_values,
         display_values=excluded.display_values,
         source_snapshot=excluded.source_snapshot%s',
      t.physical_table_name,
      case when column_list is null then '' else ', ' || column_list end,
      case when value_list is null then '' else ', ' || value_list end,
      t.source_table_id,
      case when column_list is null then '' else ', ' ||
        (select string_agg(format('%I=excluded.%I', physical_column_name, physical_column_name), ', ' order by field_order)
         from airtable_mirror.field_catalog where source_table_id=t.source_table_id)
      end
    );

    execute format('alter table airtable_mirror.%I enable row level security', t.physical_table_name);
    execute format('alter table airtable_mirror.%I force row level security', t.physical_table_name);
    execute format('revoke all on airtable_mirror.%I from public, anon, authenticated', t.physical_table_name);
    execute format('grant select on airtable_mirror.%I to service_role', t.physical_table_name);
  end loop;
end $$;

alter table airtable_mirror.table_catalog enable row level security;
alter table airtable_mirror.table_catalog force row level security;
alter table airtable_mirror.field_catalog enable row level security;
alter table airtable_mirror.field_catalog force row level security;
revoke all on airtable_mirror.table_catalog, airtable_mirror.field_catalog from public, anon, authenticated;
grant select on airtable_mirror.table_catalog, airtable_mirror.field_catalog to service_role;
