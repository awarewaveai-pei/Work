-- Rebuild every populated Airtable lookup/reverse-link from canonical FK tables.
-- The single broken Airtable rollup remains preserved as source provenance rather
-- than being guessed as a new business rule.

create or replace view clinical.therapist_details
with (security_invoker = true) as
select t.*,
  coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'intake_date', c.intake_date) order by c.name) from clinical.clients c where c.assigned_therapist_id = t.id), '[]'::jsonb) as clients,
  coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'client_name', c.name, 'scheduled_for', a.scheduled_for, 'status', a.status) order by a.scheduled_for) from clinical.appointments a join clinical.clients c on c.id = a.client_id where a.therapist_id = t.id), '[]'::jsonb) as appointments,
  coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'client_name', c.name, 'taken_on', r.taken_on) order by r.taken_on) from clinical.assessment_result_therapists art join clinical.assessment_results r on r.id=art.assessment_result_id join clinical.clients c on c.id=r.client_id where art.therapist_id=t.id), '[]'::jsonb) as assessment_results,
  (select count(*) from clinical.appointments a where a.therapist_id=t.id) as appointment_count,
  (select count(*) from clinical.clients c where c.assigned_therapist_id=t.id) as active_client_count
from clinical.therapists t;

create or replace view clinical.assessment_result_details
with (security_invoker = true) as
select r.*, c.name as client_name,
  coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'specialty',t.specialty) order by art.source_ordinal) from clinical.assessment_result_therapists art join clinical.therapists t on t.id=art.therapist_id where art.assessment_result_id=r.id),'[]'::jsonb) as therapists,
  c.diagnosis as client_diagnosis,
  coalesce((select jsonb_agg(t.name order by art.source_ordinal) from clinical.assessment_result_therapists art join clinical.therapists t on t.id=art.therapist_id where art.assessment_result_id=r.id),'[]'::jsonb) as therapist_names
from clinical.assessment_results r join clinical.clients c on c.id=r.client_id;

update art_therapy._migration_field_map
set target = case source_field_id
  when 'fldQOU0LT8fO5Es0R' then 'clinical.appointment_details.client_name'
  when 'fldM39XVYzWlxBX8r' then 'clinical.appointment_details.therapist_name'
  when 'fldqc50G43c8yX9mh' then 'clinical.assessment_result_details.client_diagnosis'
  when 'fldeswR4s5QDeGvPB' then 'clinical.assessment_result_details.therapist_names'
  when 'fldt0ZsQs8JBqTvoR' then 'clinical.client_details.appointments'
  when 'fldMz06FZhXlh2CdA' then 'clinical.client_details.finance_transactions'
  when 'fld2WUgyANNXELP7M' then 'clinical.client_details.assessment_results'
  when 'fldmvb3pQgbA2IBvv' then 'clinical.client_details.treatment_plans'
  when 'fldzhFSwXGv6cKKiL' then 'clinical.therapist_details.clients'
  when 'fldW4VkJkP3EYy1vG' then 'clinical.therapist_details.appointments'
  when 'fldV9s0BblGkGzLYS' then 'clinical.therapist_details.assessment_results'
  when 'fldiVBh93WxwTdmwB' then 'clinical.therapist_details.appointment_count'
  when 'fld02KRSLGrczEH5K' then 'clinical.therapist_details.active_client_count'
  when 'fldli3BeRoubjIXT2' then 'clinical.treatment_plan_details.client_name'
  when 'fldmbBt1lgTuU0bU4' then 'art_therapy_api.theory_details.theory_category_names'
  when 'fldttIzJSOurCCuI3' then 'art_therapy_api.tool_details.healing_stage_names'
  when 'fldWOin26XdDY3Ebr' then 'art_therapy_api.tool_details.therapeutic_focus_names'
  when 'fld31khhkhspFexkd' then 'art_therapy_api.tool_details.theory_category_names'
end,
transform_rule = case source_field_id
  when 'fldiVBh93WxwTdmwB' then 'rebuild_count_from_canonical_relationship'
  when 'fld02KRSLGrczEH5K' then 'rebuild_count_from_canonical_relationship'
  else transform_rule
end
where source_field_id in ('fldQOU0LT8fO5Es0R','fldM39XVYzWlxBX8r','fldqc50G43c8yX9mh','fldeswR4s5QDeGvPB','fldt0ZsQs8JBqTvoR','fldMz06FZhXlh2CdA','fld2WUgyANNXELP7M','fldmvb3pQgbA2IBvv','fldzhFSwXGv6cKKiL','fldW4VkJkP3EYy1vG','fldV9s0BblGkGzLYS','fldiVBh93WxwTdmwB','fld02KRSLGrczEH5K','fldli3BeRoubjIXT2','fldmbBt1lgTuU0bU4','fldttIzJSOurCCuI3','fldWOin26XdDY3Ebr','fld31khhkhspFexkd');

revoke all on art_therapy_api.tool_details, art_therapy_api.theory_details from public, anon, authenticated;
grant select on art_therapy_api.tool_details, art_therapy_api.theory_details to service_role;
revoke all on clinical.therapist_details, clinical.assessment_result_details from public, anon, authenticated;
grant select on clinical.therapist_details, clinical.assessment_result_details to service_role;
