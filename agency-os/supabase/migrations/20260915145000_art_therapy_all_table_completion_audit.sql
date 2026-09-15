-- Completion audit for every Airtable source table and field.  The archive remains
-- the immutable provenance record; these views make completion measurable without
-- creating empty runtime tables for source tables that contained no records.

grant usage on schema art_therapy to service_role;
grant select on art_therapy._source_tables, art_therapy._source_fields,
  art_therapy._source_records, art_therapy._migration_field_map,
  art_therapy._migration_source_map to service_role;

-- Conditions and presenting concerns use `name`, not `title`, in their source
-- localizations.  Expose that canonical name in the common content read model.
create or replace view art_therapy_api.entity_content
with (security_invoker = true) as
select 'tool'::text as entity_type, t.id, t.code, zh.title as title_zh, en.title as title_en,
  to_jsonb(zh) - 'id' - 'tool_id' - 'locale' - 'created_at' - 'updated_at' as content_zh,
  to_jsonb(en) - 'id' - 'tool_id' - 'locale' - 'created_at' - 'updated_at' as content_en
from art_therapy.tools t left join art_therapy.tool_localizations zh on zh.tool_id=t.id and zh.locale='zh-TW' left join art_therapy.tool_localizations en on en.tool_id=t.id and en.locale='en'
union all
select 'healing_stage', t.id, t.code, zh.title, en.title, to_jsonb(zh) - 'id' - 'healing_stage_id' - 'locale' - 'created_at' - 'updated_at', to_jsonb(en) - 'id' - 'healing_stage_id' - 'locale' - 'created_at' - 'updated_at' from art_therapy.healing_stages t left join art_therapy.healing_stage_localizations zh on zh.healing_stage_id=t.id and zh.locale='zh-TW' left join art_therapy.healing_stage_localizations en on en.healing_stage_id=t.id and en.locale='en'
union all
select 'support_method', t.id, t.code, zh.title, en.title, to_jsonb(zh) - 'id' - 'support_method_id' - 'locale' - 'created_at' - 'updated_at', to_jsonb(en) - 'id' - 'support_method_id' - 'locale' - 'created_at' - 'updated_at' from art_therapy.support_methods t left join art_therapy.support_method_localizations zh on zh.support_method_id=t.id and zh.locale='zh-TW' left join art_therapy.support_method_localizations en on en.support_method_id=t.id and en.locale='en'
union all
select 'theory_category', t.id, t.code, zh.title, en.title, to_jsonb(zh) - 'id' - 'theory_category_id' - 'locale' - 'created_at' - 'updated_at', to_jsonb(en) - 'id' - 'theory_category_id' - 'locale' - 'created_at' - 'updated_at' from art_therapy.theory_categories t left join art_therapy.theory_category_localizations zh on zh.theory_category_id=t.id and zh.locale='zh-TW' left join art_therapy.theory_category_localizations en on en.theory_category_id=t.id and en.locale='en'
union all
select 'theory', t.id, t.code, zh.title, en.title, to_jsonb(zh) - 'id' - 'theory_id' - 'locale' - 'created_at' - 'updated_at', to_jsonb(en) - 'id' - 'theory_id' - 'locale' - 'created_at' - 'updated_at' from art_therapy.theories t left join art_therapy.theory_localizations zh on zh.theory_id=t.id and zh.locale='zh-TW' left join art_therapy.theory_localizations en on en.theory_id=t.id and en.locale='en'
union all
select 'therapeutic_focus', t.id, t.code, zh.title, en.title, to_jsonb(zh) - 'id' - 'therapeutic_focus_id' - 'locale' - 'created_at' - 'updated_at', to_jsonb(en) - 'id' - 'therapeutic_focus_id' - 'locale' - 'created_at' - 'updated_at' from art_therapy.therapeutic_focuses t left join art_therapy.therapeutic_focus_localizations zh on zh.therapeutic_focus_id=t.id and zh.locale='zh-TW' left join art_therapy.therapeutic_focus_localizations en on en.therapeutic_focus_id=t.id and en.locale='en'
union all
select 'condition', t.id, t.code, coalesce(zh.title, zh.name), coalesce(en.title, en.name), to_jsonb(zh) - 'id' - 'condition_id' - 'locale' - 'created_at' - 'updated_at', to_jsonb(en) - 'id' - 'condition_id' - 'locale' - 'created_at' - 'updated_at' from art_therapy.conditions t left join art_therapy.condition_localizations zh on zh.condition_id=t.id and zh.locale='zh-TW' left join art_therapy.condition_localizations en on en.condition_id=t.id and en.locale='en'
union all
select 'presenting_concern', t.id, t.code, coalesce(zh.title, zh.name), coalesce(en.title, en.name), to_jsonb(zh) - 'id' - 'presenting_concern_id' - 'locale' - 'created_at' - 'updated_at', to_jsonb(en) - 'id' - 'presenting_concern_id' - 'locale' - 'created_at' - 'updated_at' from art_therapy.presenting_concerns t left join art_therapy.presenting_concern_localizations zh on zh.presenting_concern_id=t.id and zh.locale='zh-TW' left join art_therapy.presenting_concern_localizations en on en.presenting_concern_id=t.id and en.locale='en'
union all
select 'setting', t.id, t.code, t.title, null, jsonb_build_object('title',t.title,'setting_category',t.setting_category), null from art_therapy.settings t;

create or replace view art_therapy_api.source_table_status
with (security_invoker = true) as
select
  st.id as source_table_id,
  st.name as source_table_name,
  st.record_count as snapshot_record_count,
  (select count(*) from art_therapy._source_records sr where sr.table_id = st.id) as archived_record_count,
  (select count(distinct sm.source_record_id) from art_therapy._migration_source_map sm where sm.source_table_id = st.id) as traceable_record_count,
  st.field_count as snapshot_field_count,
  (select count(*) from art_therapy._source_fields sf where sf.table_id = st.id) as archived_field_count,
  (select count(*) from art_therapy._migration_field_map fm where fm.source_table_id = st.id) as mapped_field_count,
  (select count(*) from art_therapy._migration_field_map fm where fm.source_table_id = st.id and fm.nonempty_count > 0) as nonempty_field_count,
  (select count(*) from art_therapy._migration_field_map fm where fm.source_table_id = st.id and fm.nonempty_count > 0 and fm.disposition = 'canonical_field') as canonical_field_count,
  (select count(*) from art_therapy._migration_field_map fm where fm.source_table_id = st.id and fm.nonempty_count > 0 and fm.disposition = 'localization_field') as localization_field_count,
  (select count(*) from art_therapy._migration_field_map fm where fm.source_table_id = st.id and fm.nonempty_count > 0 and fm.disposition = 'relationship') as relationship_field_count,
  (select count(*) from art_therapy._migration_field_map fm where fm.source_table_id = st.id and fm.nonempty_count > 0 and fm.disposition = 'computed_definition') as computed_field_count,
  (select count(*) from art_therapy._migration_field_map fm where fm.source_table_id = st.id and fm.nonempty_count > 0 and fm.disposition = 'source_archive_only') as archive_only_field_count,
  (select count(*) from art_therapy._migration_field_map fm where fm.source_table_id = st.id and fm.nonempty_count > 0 and fm.approval_status <> 'approved') as unapproved_nonempty_field_count,
  case when st.record_count = 0 then 'empty_source_schema_documented'
       when (select count(*) from art_therapy._migration_field_map fm where fm.source_table_id = st.id) = st.field_count
            and (select count(distinct sm.source_record_id) from art_therapy._migration_source_map sm where sm.source_table_id = st.id) = st.record_count
            and (select count(*) from art_therapy._migration_field_map fm where fm.source_table_id = st.id and fm.nonempty_count > 0 and fm.approval_status <> 'approved') = 0
         then 'complete'
       else 'requires_review' end as completion_status
from art_therapy._source_tables st;

create or replace view art_therapy_api.source_field_status
with (security_invoker = true) as
select
  st.id as source_table_id, st.name as source_table_name,
  sf.id as source_field_id, sf.name as source_field_name, sf.field_type, sf.field_order,
  fm.nonempty_count, fm.disposition, fm.target, fm.transform_rule, fm.approval_status
from art_therapy._source_tables st
join art_therapy._source_fields sf on sf.table_id = st.id
left join art_therapy._migration_field_map fm on fm.source_field_id = sf.id;

create or replace view clinical.therapist_details
with (security_invoker = true) as
select t.*,
  coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'intake_date', c.intake_date) order by c.name) from clinical.clients c where c.assigned_therapist_id = t.id), '[]'::jsonb) as clients,
  coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'client_name', c.name, 'scheduled_for', a.scheduled_for, 'status', a.status) order by a.scheduled_for) from clinical.appointments a join clinical.clients c on c.id = a.client_id where a.therapist_id = t.id), '[]'::jsonb) as appointments
from clinical.therapists t;

create or replace view clinical.appointment_details
with (security_invoker = true) as
select a.*, c.name as client_name, t.name as therapist_name
from clinical.appointments a
join clinical.clients c on c.id = a.client_id
left join clinical.therapists t on t.id = a.therapist_id;

create or replace view clinical.treatment_plan_details
with (security_invoker = true) as
select p.*, c.name as client_name, t.name as assigned_therapist_name
from clinical.treatment_plans p
join clinical.clients c on c.id = p.client_id
left join clinical.therapists t on t.id = c.assigned_therapist_id;

create or replace view clinical.finance_transaction_details
with (security_invoker = true) as
select f.*, c.name as client_name, t.name as assigned_therapist_name
from clinical.finance_transactions f
left join clinical.clients c on c.id = f.client_id
left join clinical.therapists t on t.id = c.assigned_therapist_id;

revoke all on art_therapy_api.source_table_status, art_therapy_api.source_field_status from public, anon, authenticated;
grant select on art_therapy_api.source_table_status, art_therapy_api.source_field_status to service_role;
revoke all on clinical.therapist_details, clinical.appointment_details, clinical.treatment_plan_details, clinical.finance_transaction_details from public, anon, authenticated;
grant select on clinical.therapist_details, clinical.appointment_details, clinical.treatment_plan_details, clinical.finance_transaction_details to service_role;
