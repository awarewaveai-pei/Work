-- Preserve the source locale of the Airtable `理論分類` lookup.  One populated
-- source row uses English category labels, so its mapping must not point at the
-- Chinese-only presentation field.

create or replace view art_therapy.tool_details
with (security_invoker = true) as
select t.id, t.code, zh.title as title_zh, en.title as title_en,
  coalesce((select array_agg(distinct coalesce(hsl.title,ths.label_override) order by coalesce(hsl.title,ths.label_override)) from art_therapy.tool_healing_stages ths left join art_therapy.healing_stage_localizations hsl on hsl.healing_stage_id=ths.healing_stage_id and hsl.locale='zh-TW' where ths.tool_id=t.id), '{}'::text[]) as healing_stage_names,
  coalesce((select array_agg(distinct fl.title order by fl.title) from art_therapy.tool_focuses tf join art_therapy.therapeutic_focus_localizations fl on fl.therapeutic_focus_id=tf.therapeutic_focus_id and fl.locale='zh-TW' where tf.tool_id=t.id), '{}'::text[]) as therapeutic_focus_names,
  coalesce((select array_agg(distinct tcl.title order by tcl.title) from art_therapy.tool_theories tt join art_therapy.theory_category_links tclink on tclink.theory_id=tt.theory_id join art_therapy.theory_category_localizations tcl on tcl.theory_category_id=tclink.theory_category_id and tcl.locale='zh-TW' where tt.tool_id=t.id), '{}'::text[]) as theory_category_names,
  coalesce((select array_agg(distinct tcl.title order by tcl.title) from art_therapy.tool_theories tt join art_therapy.theory_category_links tclink on tclink.theory_id=tt.theory_id join art_therapy.theory_category_localizations tcl on tcl.theory_category_id=tclink.theory_category_id and tcl.locale='en' where tt.tool_id=t.id), '{}'::text[]) as theory_category_names_en
from art_therapy.tools t
left join art_therapy.tool_localizations zh on zh.tool_id=t.id and zh.locale='zh-TW'
left join art_therapy.tool_localizations en on en.tool_id=t.id and en.locale='en';

create or replace view art_therapy_api.tool_details
with (security_invoker = true) as
select id, code, title_zh, title_en, healing_stage_names, therapeutic_focus_names,
  theory_category_names, theory_category_names_en
from art_therapy.tool_details;

update art_therapy._migration_field_map
set target='art_therapy_api.tool_details.theory_category_names_en',
    transform_rule='rebuild_from_approved_relationship_join_preserving_source_locale'
where source_field_id='fld31khhkhspFexkd';

revoke all on art_therapy.tool_details, art_therapy_api.tool_details from public, anon, authenticated;
grant select on art_therapy.tool_details, art_therapy_api.tool_details to service_role;
