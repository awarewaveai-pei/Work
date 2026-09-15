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
