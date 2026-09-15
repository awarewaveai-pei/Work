-- Remove non-canonical landing/mirror objects after the externally archived
-- Airtable snapshot and canonical restore were independently verified.

do $$
declare
  v_snapshot_checksum text;
  v_mirror_relations integer;
  v_clinical_relations integer;
begin
  select snapshot_checksum
    into v_snapshot_checksum
  from art_therapy._migration_runs
  where status = 'verified'
  order by created_at desc
  limit 1;

  if v_snapshot_checksum is distinct from
     'b2c0f0ff71856c1b9739465545487ec499d56f14ceaecffd23abbb59acbb36ca' then
    raise exception 'Refusing cleanup: verified source snapshot checksum mismatch';
  end if;

  if (select count(*) from art_therapy._source_tables) <> 60
     or (select count(*) from art_therapy._source_fields) <> 1484
     or (select count(*) from art_therapy._source_records) <> 1114 then
    raise exception 'Refusing cleanup: source archive counts do not match locked evidence';
  end if;

  select count(*) into v_mirror_relations
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'airtable_mirror'
    and c.relkind in ('r', 'p', 'v', 'm');

  select count(*) into v_clinical_relations
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'clinical'
    and c.relkind in ('r', 'p', 'v', 'm');

  if v_mirror_relations <> 62 then
    raise exception 'Refusing cleanup: expected 62 airtable_mirror relations, found %', v_mirror_relations;
  end if;

  if v_clinical_relations <> 13 then
    raise exception 'Refusing cleanup: expected 13 clinical relations, found %', v_clinical_relations;
  end if;

  if (select count(*) from art_therapy.tools) <> 298
     or (select count(*) from art_therapy.tool_localizations) <> 596
     or (select count(*) from art_therapy.theories) <> 65
     or (select count(*) from art_therapy.theory_localizations) <> 130
     or (select count(*) from art_therapy.tool_support_methods) <> 1166 then
    raise exception 'Refusing cleanup: canonical baseline counts changed';
  end if;
end
$$;

update art_therapy._migration_field_map
set disposition = 'approved_exception',
    target = null,
    transform_rule = 'excluded_per_master_plan_section_17_preserved_in_external_snapshot',
    approval_status = 'approved'
where source_table_name in (
  'Appointments',
  'Assessment Results',
  'Clients',
  'Finance',
  'Therapists',
  'Treatment Plans'
);

insert into art_therapy._migration_exceptions (
  id,
  run_id,
  exception_code,
  source_table_id,
  detail,
  resolution,
  approved
)
select
  gen_random_uuid(),
  fm.run_id,
  'CLINICAL_DOMAIN_EXCLUDED',
  fm.source_table_id,
  fm.source_table_name || ' is outside the Art Therapy V2 canonical domain per master plan section 17.',
  'Preserved in the immutable external Airtable snapshot; no production table is created in this project.',
  true
from (
  select distinct run_id, source_table_id, source_table_name
  from art_therapy._migration_field_map
  where source_table_name in (
    'Appointments',
    'Assessment Results',
    'Clients',
    'Finance',
    'Therapists',
    'Treatment Plans'
  )
) fm
where not exists (
  select 1
  from art_therapy._migration_exceptions e
  where e.run_id = fm.run_id
    and e.exception_code = 'CLINICAL_DOMAIN_EXCLUDED'
    and e.source_table_id = fm.source_table_id
);

do $$
begin
  if (select count(*) from art_therapy._migration_field_map
      where source_table_name in (
        'Appointments', 'Assessment Results', 'Clients',
        'Finance', 'Therapists', 'Treatment Plans'
      )) <> 70 then
    raise exception 'Clinical exclusion map must contain exactly 70 source fields';
  end if;

  if exists (
    select 1
    from art_therapy._migration_field_map
    where source_table_name in (
      'Appointments', 'Assessment Results', 'Clients',
      'Finance', 'Therapists', 'Treatment Plans'
    )
      and (
        disposition <> 'approved_exception'
        or target is not null
        or approval_status <> 'approved'
      )
  ) then
    raise exception 'Clinical exclusion mapping repair is incomplete';
  end if;
end
$$;

drop view art_therapy_api.source_field_status;
drop view art_therapy_api.source_table_status;

drop schema airtable_mirror cascade;
drop schema clinical cascade;

drop table art_therapy._source_links;
drop table art_therapy._source_record_values;
drop table art_therapy._source_records;
drop table art_therapy._source_fields;
drop table art_therapy._source_tables;

do $$
begin
  if to_regnamespace('airtable_mirror') is not null
     or to_regnamespace('clinical') is not null
     or to_regclass('art_therapy._source_tables') is not null
     or to_regclass('art_therapy._source_fields') is not null
     or to_regclass('art_therapy._source_records') is not null
     or to_regclass('art_therapy._source_record_values') is not null
     or to_regclass('art_therapy._source_links') is not null
     or to_regclass('art_therapy_api.source_table_status') is not null
     or to_regclass('art_therapy_api.source_field_status') is not null then
    raise exception 'Non-canonical cleanup verification failed';
  end if;
end
$$;
