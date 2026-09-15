-- Read models expose canonical content and FK lookups without duplicating source data.
grant usage on schema clinical to service_role;
grant select on all tables in schema clinical to service_role;
grant select on
  art_therapy.tools, art_therapy.tool_localizations, art_therapy.healing_stages,
  art_therapy.healing_stage_localizations, art_therapy.support_methods,
  art_therapy.support_method_localizations, art_therapy.theory_categories,
  art_therapy.theory_category_localizations, art_therapy.theories,
  art_therapy.theory_localizations, art_therapy.therapeutic_focuses,
  art_therapy.therapeutic_focus_localizations, art_therapy.conditions,
  art_therapy.condition_localizations, art_therapy.presenting_concerns,
  art_therapy.presenting_concern_localizations, art_therapy.settings,
  art_therapy.tool_healing_stages, art_therapy.tool_focuses, art_therapy.tool_theories,
  art_therapy.theory_category_links, art_therapy.tool_support_methods, art_therapy.tool_settings
to service_role;

create or replace view art_therapy_api.entity_content
with (security_invoker = true) as
select 'tool'::text as entity_type, t.id, t.code, zh.title as title_zh, en.title as title_en,
  to_jsonb(zh) - 'id' - 'tool_id' - 'locale' - 'created_at' - 'updated_at' as content_zh,
  to_jsonb(en) - 'id' - 'tool_id' - 'locale' - 'created_at' - 'updated_at' as content_en
from art_therapy.tools t left join art_therapy.tool_localizations zh on zh.tool_id=t.id and zh.locale='zh-TW' left join art_therapy.tool_localizations en on en.tool_id=t.id and en.locale='en'
union all
select 'healing_stage', t.id, t.code, zh.title, en.title,
  to_jsonb(zh) - 'id' - 'healing_stage_id' - 'locale' - 'created_at' - 'updated_at',
  to_jsonb(en) - 'id' - 'healing_stage_id' - 'locale' - 'created_at' - 'updated_at'
from art_therapy.healing_stages t left join art_therapy.healing_stage_localizations zh on zh.healing_stage_id=t.id and zh.locale='zh-TW' left join art_therapy.healing_stage_localizations en on en.healing_stage_id=t.id and en.locale='en'
union all
select 'support_method', t.id, t.code, zh.title, en.title,
  to_jsonb(zh) - 'id' - 'support_method_id' - 'locale' - 'created_at' - 'updated_at',
  to_jsonb(en) - 'id' - 'support_method_id' - 'locale' - 'created_at' - 'updated_at'
from art_therapy.support_methods t left join art_therapy.support_method_localizations zh on zh.support_method_id=t.id and zh.locale='zh-TW' left join art_therapy.support_method_localizations en on en.support_method_id=t.id and en.locale='en'
union all
select 'theory_category', t.id, t.code, zh.title, en.title,
  to_jsonb(zh) - 'id' - 'theory_category_id' - 'locale' - 'created_at' - 'updated_at',
  to_jsonb(en) - 'id' - 'theory_category_id' - 'locale' - 'created_at' - 'updated_at'
from art_therapy.theory_categories t left join art_therapy.theory_category_localizations zh on zh.theory_category_id=t.id and zh.locale='zh-TW' left join art_therapy.theory_category_localizations en on en.theory_category_id=t.id and en.locale='en'
union all
select 'theory', t.id, t.code, zh.title, en.title,
  to_jsonb(zh) - 'id' - 'theory_id' - 'locale' - 'created_at' - 'updated_at',
  to_jsonb(en) - 'id' - 'theory_id' - 'locale' - 'created_at' - 'updated_at'
from art_therapy.theories t left join art_therapy.theory_localizations zh on zh.theory_id=t.id and zh.locale='zh-TW' left join art_therapy.theory_localizations en on en.theory_id=t.id and en.locale='en'
union all
select 'therapeutic_focus', t.id, t.code, zh.title, en.title,
  to_jsonb(zh) - 'id' - 'therapeutic_focus_id' - 'locale' - 'created_at' - 'updated_at',
  to_jsonb(en) - 'id' - 'therapeutic_focus_id' - 'locale' - 'created_at' - 'updated_at'
from art_therapy.therapeutic_focuses t left join art_therapy.therapeutic_focus_localizations zh on zh.therapeutic_focus_id=t.id and zh.locale='zh-TW' left join art_therapy.therapeutic_focus_localizations en on en.therapeutic_focus_id=t.id and en.locale='en'
union all
select 'condition', t.id, t.code, coalesce(zh.title, zh.name), coalesce(en.title, en.name),
  to_jsonb(zh) - 'id' - 'condition_id' - 'locale' - 'created_at' - 'updated_at',
  to_jsonb(en) - 'id' - 'condition_id' - 'locale' - 'created_at' - 'updated_at'
from art_therapy.conditions t left join art_therapy.condition_localizations zh on zh.condition_id=t.id and zh.locale='zh-TW' left join art_therapy.condition_localizations en on en.condition_id=t.id and en.locale='en'
union all
select 'presenting_concern', t.id, t.code, coalesce(zh.title, zh.name), coalesce(en.title, en.name),
  to_jsonb(zh) - 'id' - 'presenting_concern_id' - 'locale' - 'created_at' - 'updated_at',
  to_jsonb(en) - 'id' - 'presenting_concern_id' - 'locale' - 'created_at' - 'updated_at'
from art_therapy.presenting_concerns t left join art_therapy.presenting_concern_localizations zh on zh.presenting_concern_id=t.id and zh.locale='zh-TW' left join art_therapy.presenting_concern_localizations en on en.presenting_concern_id=t.id and en.locale='en'
union all
select 'setting', t.id, t.code, t.title, null,
  jsonb_build_object('title',t.title,'setting_category',t.setting_category), null
from art_therapy.settings t;

create or replace view art_therapy_api.relationship_edges
with (security_invoker = true) as
select 'tool_healing_stage'::text as relation_type, l.tool_id as source_id, l.healing_stage_id as target_id,
  tz.title as source_title_zh, coalesce(hz.title,l.label_override) as target_title_zh,
  jsonb_build_object('phase_kind',l.phase_kind,'label_override',l.label_override) as metadata
from art_therapy.tool_healing_stages l join art_therapy.tool_localizations tz on tz.tool_id=l.tool_id and tz.locale='zh-TW' left join art_therapy.healing_stage_localizations hz on hz.healing_stage_id=l.healing_stage_id and hz.locale='zh-TW'
union all select 'tool_focus',l.tool_id,l.therapeutic_focus_id,tz.title,fz.title,'{}'::jsonb from art_therapy.tool_focuses l join art_therapy.tool_localizations tz on tz.tool_id=l.tool_id and tz.locale='zh-TW' join art_therapy.therapeutic_focus_localizations fz on fz.therapeutic_focus_id=l.therapeutic_focus_id and fz.locale='zh-TW'
union all select 'tool_theory',l.tool_id,l.theory_id,tz.title,thz.title,'{}'::jsonb from art_therapy.tool_theories l join art_therapy.tool_localizations tz on tz.tool_id=l.tool_id and tz.locale='zh-TW' join art_therapy.theory_localizations thz on thz.theory_id=l.theory_id and thz.locale='zh-TW'
union all select 'theory_category',l.theory_id,l.theory_category_id,thz.title,cz.title,'{}'::jsonb from art_therapy.theory_category_links l join art_therapy.theory_localizations thz on thz.theory_id=l.theory_id and thz.locale='zh-TW' join art_therapy.theory_category_localizations cz on cz.theory_category_id=l.theory_category_id and cz.locale='zh-TW'
union all select 'tool_support_method',l.tool_id,l.support_method_id,tz.title,sz.title,'{}'::jsonb from art_therapy.tool_support_methods l join art_therapy.tool_localizations tz on tz.tool_id=l.tool_id and tz.locale='zh-TW' join art_therapy.support_method_localizations sz on sz.support_method_id=l.support_method_id and sz.locale='zh-TW'
union all select 'tool_setting',l.tool_id,l.setting_id,tz.title,s.title,'{}'::jsonb from art_therapy.tool_settings l join art_therapy.tool_localizations tz on tz.tool_id=l.tool_id and tz.locale='zh-TW' join art_therapy.settings s on s.id=l.setting_id;

create or replace view clinical.client_details
with (security_invoker = true) as
select c.*, t.name as assigned_therapist_name,
  coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'scheduled_for',a.scheduled_for,'status',a.status) order by a.scheduled_for) from clinical.appointments a where a.client_id=c.id),'[]'::jsonb) as appointments,
  coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'taken_on',r.taken_on,'score',r.score) order by r.taken_on) from clinical.assessment_results r where r.client_id=c.id),'[]'::jsonb) as assessment_results,
  coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'diagnosis',p.diagnosis,'start_date',p.start_date) order by p.start_date) from clinical.treatment_plans p where p.client_id=c.id),'[]'::jsonb) as treatment_plans,
  coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'description',f.transaction_description,'amount',f.transaction_amount,'transaction_date',f.transaction_date) order by f.transaction_date) from clinical.finance_transactions f where f.client_id=c.id),'[]'::jsonb) as finance_transactions
from clinical.clients c left join clinical.therapists t on t.id=c.assigned_therapist_id;

create or replace view clinical.assessment_result_details
with (security_invoker = true) as
select r.*, c.name as client_name,
  coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'specialty',t.specialty) order by art.source_ordinal) from clinical.assessment_result_therapists art join clinical.therapists t on t.id=art.therapist_id where art.assessment_result_id=r.id),'[]'::jsonb) as therapists
from clinical.assessment_results r join clinical.clients c on c.id=r.client_id;

revoke all on art_therapy_api.entity_content, art_therapy_api.relationship_edges from public, anon, authenticated;
grant select on art_therapy_api.entity_content, art_therapy_api.relationship_edges to service_role;
revoke all on clinical.client_details, clinical.assessment_result_details from public, anon, authenticated;
grant select on clinical.client_details, clinical.assessment_result_details to service_role;
