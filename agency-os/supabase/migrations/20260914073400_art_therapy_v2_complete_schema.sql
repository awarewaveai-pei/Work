create extension if not exists pgcrypto;

create schema if not exists art_therapy;

revoke all on schema art_therapy from public, anon, authenticated;

grant usage on schema art_therapy to anon, authenticated;

create table art_therapy.tools (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'active' check (status in ('active','retired')),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'retired') = (retired_at is not null))
);

create table art_therapy.healing_stages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'active' check (status in ('active','retired')),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'retired') = (retired_at is not null))
);

create table art_therapy.therapeutic_focuses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'active' check (status in ('active','retired')),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'retired') = (retired_at is not null))
);

create table art_therapy.theory_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'active' check (status in ('active','retired')),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'retired') = (retired_at is not null))
);

create table art_therapy.theories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'active' check (status in ('active','retired')),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'retired') = (retired_at is not null))
);

create table art_therapy.support_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'active' check (status in ('active','retired')),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'retired') = (retired_at is not null))
);

create table art_therapy.conditions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'active' check (status in ('active','retired')),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'retired') = (retired_at is not null))
);

create table art_therapy.presenting_concerns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'active' check (status in ('active','retired')),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'retired') = (retired_at is not null))
);

create table art_therapy.settings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  setting_category text,
  status text not null default 'active' check (status in ('active','retired')),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'retired') = (retired_at is not null))
);

create table art_therapy.tool_localizations (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references art_therapy.tools(id) on delete cascade,
  locale text not null check (locale in ('zh-TW','en')),
  advanced_extensions text,
  benefits text,
  category_name text,
  clinical_rationale text,
  common_difficulties text,
  description text,
  duration_guidance text,
  facilitation_prompts text,
  free_online_resources text,
  how_it_helps text,
  how_to_use text,
  instructions text,
  interpretive_possibilities text,
  materials_summary text,
  paid_online_resources text,
  psychological_dimension text,
  related_assessments text,
  resources_summary text,
  response_recording_guidance text,
  space_and_equipment_requirements text,
  suitability_rationale text,
  suitable_mental_conditions text,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tool_id, locale)
);
create index tool_localizations_tool_id_idx on art_therapy.tool_localizations (tool_id);

create table art_therapy.healing_stage_localizations (
  id uuid primary key default gen_random_uuid(),
  healing_stage_id uuid not null references art_therapy.healing_stages(id) on delete cascade,
  locale text not null check (locale in ('zh-TW','en')),
  action_strategy_try_and_verify text,
  applied_goal text,
  applied_method text,
  breakthrough_clue text,
  common_client_statements text,
  common_obstacles text,
  consequences_if_skipped text,
  core_meaning text,
  core_question text,
  core_task text,
  deductive_hypothesis_core_insight text,
  everyday_description text,
  feedback_learning_what_did_we_learn text,
  five_destructions_overcome text,
  five_life_correspondence text,
  five_origin text,
  five_phase_correspondence text,
  five_qi text,
  function text,
  healing_process_description text,
  inductive_observation_what_is_happening text,
  key_task text,
  map_to text,
  organ_correspondence text,
  pinyin text,
  process_name text,
  professional_description text,
  qi_entry_location text,
  recommended_session_count_text text,
  repeat_exploration_guidance text,
  session_task_focus text,
  stage text,
  stage_name_ch text,
  stage_name_en text,
  task_summary text,
  themes_and_tasks text,
  therapeutic_goal_summary text,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (healing_stage_id, locale)
);
create index healing_stage_localizations_healing_stage_id_idx on art_therapy.healing_stage_localizations (healing_stage_id);

create table art_therapy.support_method_localizations (
  id uuid primary key default gen_random_uuid(),
  support_method_id uuid not null references art_therapy.support_methods(id) on delete cascade,
  locale text not null check (locale in ('zh-TW','en')),
  category_name text,
  purpose text,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (support_method_id, locale)
);
create index support_method_localizations_support_method_id_idx on art_therapy.support_method_localizations (support_method_id);

create table art_therapy.theory_category_localizations (
  id uuid primary key default gen_random_uuid(),
  theory_category_id uuid not null references art_therapy.theory_categories(id) on delete cascade,
  locale text not null check (locale in ('zh-TW','en')),
  core_basis text,
  definition text,
  plain_language_summary text,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (theory_category_id, locale)
);
create index theory_category_localizations_theory_category_id_idx on art_therapy.theory_category_localizations (theory_category_id);

create table art_therapy.theory_localizations (
  id uuid primary key default gen_random_uuid(),
  theory_id uuid not null references art_therapy.theories(id) on delete cascade,
  locale text not null check (locale in ('zh-TW','en')),
  art_therapy_applications text,
  art_therapy_integration_challenges text,
  assessment_indicator_guidance text,
  case_practice_formats text,
  client_cultural_and_belief_considerations text,
  client_rights_and_choices text,
  client_role_changes_during_healing text,
  client_self_review_methods text,
  client_writing_and_artmaking_prompts text,
  clinical_populations_and_settings text,
  clinical_translation_competency_impact text,
  common_client_questions_and_responses text,
  common_emotional_avoidance_and_defenses text,
  common_misunderstandings_and_clarifications text,
  common_projected_themes_in_artwork text,
  common_student_responses_and_handling text,
  common_techniques_and_interventions text,
  continuing_education_application_levels text,
  course_integration_guidance text,
  creative_psychological_process_relationship text,
  cross_cultural_application_guidance text,
  cultural_applicability text,
  emotional_risks_and_support_resources text,
  explaining_theory_origin_and_use_to_clients text,
  founders_and_background text,
  guidance_for_confusion_or_discomfort text,
  individual_differences_in_artmaking_style text,
  individual_perspective_and_developmental_stages text,
  integration_with_other_theories text,
  international_adoption_and_research_support text,
  international_curriculum_potential text,
  learning_outcome_tasks text,
  mechanisms_of_action text,
  modern_neuroscience_correspondence text,
  philosophical_relationship_to_artmaking text,
  plain_language_summary text,
  portable_artwork_symbolism text,
  possible_client_internal_changes text,
  possible_client_misunderstandings_of_artmaking text,
  post_artmaking_self_actions text,
  psychological_assumptions_and_view_of_human_nature text,
  psychological_readiness_and_attitude text,
  purpose text,
  recommended_media_and_activities text,
  recommended_readings_and_videos text,
  recommended_teaching_tools text,
  relationship_to_past_trauma text,
  self_and_consciousness_structure text,
  student_learning_difficulty_indicators text,
  suitable_client_states_and_healing_stages text,
  suitable_participation_styles text,
  suitable_student_profiles text,
  symbolic_closure_methods text,
  symptom_mechanism_and_diagnostic_logic text,
  take_home_practices text,
  teaching_ethics_considerations text,
  teaching_module_format_guidance text,
  teaching_priorities text,
  therapeutic_relationship_and_therapist_role text,
  title text,
  treatment_goals_and_change_process text,
  understanding_of_client text,
  view_of_change_process text,
  why_this_method_helps text,
  workshop_and_simulation_methods text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (theory_id, locale)
);
create index theory_localizations_theory_id_idx on art_therapy.theory_localizations (theory_id);

create table art_therapy.condition_localizations (
  id uuid primary key default gen_random_uuid(),
  condition_id uuid not null references art_therapy.conditions(id) on delete cascade,
  locale text not null check (locale in ('zh-TW','en')),
  title text,
  clinical_classification text,
  concern_category text,
  name text,
  presenting_features text,
  primary_therapeutic_goals text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (condition_id, locale)
);
create index condition_localizations_condition_id_idx on art_therapy.condition_localizations (condition_id);

create table art_therapy.presenting_concern_localizations (
  id uuid primary key default gen_random_uuid(),
  presenting_concern_id uuid not null references art_therapy.presenting_concerns(id) on delete cascade,
  locale text not null check (locale in ('zh-TW','en')),
  title text,
  clinical_classification text,
  concern_category text,
  name text,
  presenting_features text,
  primary_therapeutic_goals text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (presenting_concern_id, locale)
);
create index presenting_concern_localizations_presenting_concern_id_idx on art_therapy.presenting_concern_localizations (presenting_concern_id);

create table art_therapy.therapeutic_focus_localizations (
  id uuid primary key default gen_random_uuid(),
  therapeutic_focus_id uuid not null references art_therapy.therapeutic_focuses(id) on delete cascade,
  locale text not null check (locale in ('zh-TW','en')),
  applicable_situations text,
  benefit_rationale text,
  benefits text,
  classification_rationale text,
  clinical_keywords text,
  clinical_risk_level text,
  internal_state text,
  observable_behaviors text,
  physiological_responses text,
  title text,
  typical_triggers text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (therapeutic_focus_id, locale)
);
create index therapeutic_focus_localizations_therapeutic_focus_id_idx on art_therapy.therapeutic_focus_localizations (therapeutic_focus_id);

create table art_therapy.tool_focuses (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references art_therapy.tools(id) on delete cascade,
  therapeutic_focus_id uuid not null references art_therapy.therapeutic_focuses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tool_id, therapeutic_focus_id)
);
create index tool_focuses_tool_id_idx on art_therapy.tool_focuses (tool_id);
create index tool_focuses_therapeutic_focus_id_idx on art_therapy.tool_focuses (therapeutic_focus_id);

create table art_therapy.tool_theories (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references art_therapy.tools(id) on delete cascade,
  theory_id uuid not null references art_therapy.theories(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tool_id, theory_id)
);
create index tool_theories_tool_id_idx on art_therapy.tool_theories (tool_id);
create index tool_theories_theory_id_idx on art_therapy.tool_theories (theory_id);

create table art_therapy.theory_category_links (
  id uuid primary key default gen_random_uuid(),
  theory_id uuid not null references art_therapy.theories(id) on delete cascade,
  theory_category_id uuid not null references art_therapy.theory_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (theory_id, theory_category_id)
);
create index theory_category_links_theory_id_idx on art_therapy.theory_category_links (theory_id);
create index theory_category_links_theory_category_id_idx on art_therapy.theory_category_links (theory_category_id);

create table art_therapy.tool_support_methods (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references art_therapy.tools(id) on delete cascade,
  support_method_id uuid not null references art_therapy.support_methods(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tool_id, support_method_id)
);
create index tool_support_methods_tool_id_idx on art_therapy.tool_support_methods (tool_id);
create index tool_support_methods_support_method_id_idx on art_therapy.tool_support_methods (support_method_id);

create table art_therapy.tool_settings (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references art_therapy.tools(id) on delete cascade,
  setting_id uuid not null references art_therapy.settings(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tool_id, setting_id)
);
create index tool_settings_tool_id_idx on art_therapy.tool_settings (tool_id);
create index tool_settings_setting_id_idx on art_therapy.tool_settings (setting_id);

create table art_therapy.tool_healing_stages (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references art_therapy.tools(id) on delete cascade,
  healing_stage_id uuid references art_therapy.healing_stages(id) on delete cascade,
  phase_kind text not null check (phase_kind in ('healing_stage','pre_assessment')),
  label_override text,
  created_at timestamptz not null default now(),
  check ((phase_kind = 'healing_stage' and healing_stage_id is not null and label_override is null) or (phase_kind = 'pre_assessment' and healing_stage_id is null and label_override is not null)),
  unique nulls not distinct (tool_id, healing_stage_id, phase_kind, label_override)
);
create index tool_healing_stages_tool_id_idx on art_therapy.tool_healing_stages (tool_id);
create index tool_healing_stages_healing_stage_id_idx on art_therapy.tool_healing_stages (healing_stage_id);

create table art_therapy._schema_version (version text primary key, applied_at timestamptz not null default now());
create table art_therapy._migration_runs (id uuid primary key, snapshot_checksum text not null, mapping_version text not null, source_extracted_at timestamptz not null, status text not null check (status in ('dry_run_passed','production_loaded','verified')), counts jsonb not null, created_at timestamptz not null default now());
create table art_therapy._migration_field_map (id bigint generated always as identity primary key, run_id uuid not null references art_therapy._migration_runs(id), source_table_id text not null, source_table_name text not null, source_field_id text not null, source_field_name text not null, source_field_type text not null, nonempty_count integer not null, disposition text not null, target text, transform_rule text not null, approval_status text not null check (approval_status = 'approved'), unique (run_id, source_table_id, source_field_id));
create index migration_field_map_run_id_idx on art_therapy._migration_field_map (run_id);
create table art_therapy._migration_source_map (id bigint generated always as identity primary key, run_id uuid not null references art_therapy._migration_runs(id), source_table_id text not null, source_table_name text not null, source_record_id text not null, target_table text, target_id uuid, disposition text not null, unique nulls not distinct (run_id, source_table_id, source_record_id, target_table, target_id));
create index migration_source_map_run_id_idx on art_therapy._migration_source_map (run_id);
create index migration_source_map_source_idx on art_therapy._migration_source_map (source_table_id, source_record_id);
create table art_therapy._migration_exceptions (id uuid primary key, run_id uuid not null references art_therapy._migration_runs(id), exception_code text not null, source_table_id text, source_record_id text, source_field_id text, detail text not null, resolution text not null, approved boolean not null check (approved), created_at timestamptz not null default now());
create index migration_exceptions_run_id_idx on art_therapy._migration_exceptions (run_id);
create table art_therapy._migration_attachments (id uuid primary key, run_id uuid not null references art_therapy._migration_runs(id), source_table_id text not null, source_record_id text not null, source_field_id text not null, source_attachment_id text not null, filename text not null, media_type text, external_relative_path text not null, sha256 text not null, size_bytes bigint not null, unique (run_id, source_attachment_id));
create index migration_attachments_run_id_idx on art_therapy._migration_attachments (run_id);

create view art_therapy.tool_details with (security_invoker = true) as
select t.id, t.code, zh.title as title_zh, en.title as title_en,
  coalesce((select array_agg(distinct coalesce(hsl.title, ths.label_override) order by coalesce(hsl.title, ths.label_override)) from art_therapy.tool_healing_stages ths left join art_therapy.healing_stage_localizations hsl on hsl.healing_stage_id = ths.healing_stage_id and hsl.locale = 'zh-TW' where ths.tool_id = t.id), '{}'::text[]) as healing_stage_names,
  coalesce((select array_agg(distinct fl.title order by fl.title) from art_therapy.tool_focuses tf join art_therapy.therapeutic_focus_localizations fl on fl.therapeutic_focus_id = tf.therapeutic_focus_id and fl.locale = 'zh-TW' where tf.tool_id = t.id), '{}'::text[]) as therapeutic_focus_names,
  coalesce((select array_agg(distinct tcl.title order by tcl.title) from art_therapy.tool_theories tt join art_therapy.theory_category_links tclink on tclink.theory_id = tt.theory_id join art_therapy.theory_category_localizations tcl on tcl.theory_category_id = tclink.theory_category_id and tcl.locale = 'zh-TW' where tt.tool_id = t.id), '{}'::text[]) as theory_category_names
from art_therapy.tools t
left join art_therapy.tool_localizations zh on zh.tool_id = t.id and zh.locale = 'zh-TW'
left join art_therapy.tool_localizations en on en.tool_id = t.id and en.locale = 'en';
create view art_therapy.theory_details with (security_invoker = true) as
select t.id, t.code, zh.title as title_zh, en.title as title_en,
  coalesce((select array_agg(distinct tcl.title order by tcl.title) from art_therapy.theory_category_links l join art_therapy.theory_category_localizations tcl on tcl.theory_category_id = l.theory_category_id and tcl.locale = 'zh-TW' where l.theory_id = t.id), '{}'::text[]) as theory_category_names
from art_therapy.theories t
left join art_therapy.theory_localizations zh on zh.theory_id = t.id and zh.locale = 'zh-TW'
left join art_therapy.theory_localizations en on en.theory_id = t.id and en.locale = 'en';

alter table art_therapy.tools enable row level security;
alter table art_therapy.tools force row level security;
revoke all on art_therapy.tools from public, anon, authenticated;
alter table art_therapy.healing_stages enable row level security;
alter table art_therapy.healing_stages force row level security;
revoke all on art_therapy.healing_stages from public, anon, authenticated;
alter table art_therapy.therapeutic_focuses enable row level security;
alter table art_therapy.therapeutic_focuses force row level security;
revoke all on art_therapy.therapeutic_focuses from public, anon, authenticated;
alter table art_therapy.theory_categories enable row level security;
alter table art_therapy.theory_categories force row level security;
revoke all on art_therapy.theory_categories from public, anon, authenticated;
alter table art_therapy.theories enable row level security;
alter table art_therapy.theories force row level security;
revoke all on art_therapy.theories from public, anon, authenticated;
alter table art_therapy.support_methods enable row level security;
alter table art_therapy.support_methods force row level security;
revoke all on art_therapy.support_methods from public, anon, authenticated;
alter table art_therapy.conditions enable row level security;
alter table art_therapy.conditions force row level security;
revoke all on art_therapy.conditions from public, anon, authenticated;
alter table art_therapy.presenting_concerns enable row level security;
alter table art_therapy.presenting_concerns force row level security;
revoke all on art_therapy.presenting_concerns from public, anon, authenticated;
alter table art_therapy.settings enable row level security;
alter table art_therapy.settings force row level security;
revoke all on art_therapy.settings from public, anon, authenticated;
alter table art_therapy.tool_localizations enable row level security;
alter table art_therapy.tool_localizations force row level security;
revoke all on art_therapy.tool_localizations from public, anon, authenticated;
alter table art_therapy.healing_stage_localizations enable row level security;
alter table art_therapy.healing_stage_localizations force row level security;
revoke all on art_therapy.healing_stage_localizations from public, anon, authenticated;
alter table art_therapy.support_method_localizations enable row level security;
alter table art_therapy.support_method_localizations force row level security;
revoke all on art_therapy.support_method_localizations from public, anon, authenticated;
alter table art_therapy.theory_category_localizations enable row level security;
alter table art_therapy.theory_category_localizations force row level security;
revoke all on art_therapy.theory_category_localizations from public, anon, authenticated;
alter table art_therapy.theory_localizations enable row level security;
alter table art_therapy.theory_localizations force row level security;
revoke all on art_therapy.theory_localizations from public, anon, authenticated;
alter table art_therapy.condition_localizations enable row level security;
alter table art_therapy.condition_localizations force row level security;
revoke all on art_therapy.condition_localizations from public, anon, authenticated;
alter table art_therapy.presenting_concern_localizations enable row level security;
alter table art_therapy.presenting_concern_localizations force row level security;
revoke all on art_therapy.presenting_concern_localizations from public, anon, authenticated;
alter table art_therapy.therapeutic_focus_localizations enable row level security;
alter table art_therapy.therapeutic_focus_localizations force row level security;
revoke all on art_therapy.therapeutic_focus_localizations from public, anon, authenticated;
alter table art_therapy.tool_healing_stages enable row level security;
alter table art_therapy.tool_healing_stages force row level security;
revoke all on art_therapy.tool_healing_stages from public, anon, authenticated;
alter table art_therapy.tool_focuses enable row level security;
alter table art_therapy.tool_focuses force row level security;
revoke all on art_therapy.tool_focuses from public, anon, authenticated;
alter table art_therapy.tool_theories enable row level security;
alter table art_therapy.tool_theories force row level security;
revoke all on art_therapy.tool_theories from public, anon, authenticated;
alter table art_therapy.theory_category_links enable row level security;
alter table art_therapy.theory_category_links force row level security;
revoke all on art_therapy.theory_category_links from public, anon, authenticated;
alter table art_therapy.tool_support_methods enable row level security;
alter table art_therapy.tool_support_methods force row level security;
revoke all on art_therapy.tool_support_methods from public, anon, authenticated;
alter table art_therapy.tool_settings enable row level security;
alter table art_therapy.tool_settings force row level security;
revoke all on art_therapy.tool_settings from public, anon, authenticated;
alter table art_therapy._schema_version enable row level security;
alter table art_therapy._schema_version force row level security;
revoke all on art_therapy._schema_version from public, anon, authenticated;
alter table art_therapy._migration_runs enable row level security;
alter table art_therapy._migration_runs force row level security;
revoke all on art_therapy._migration_runs from public, anon, authenticated;
alter table art_therapy._migration_field_map enable row level security;
alter table art_therapy._migration_field_map force row level security;
revoke all on art_therapy._migration_field_map from public, anon, authenticated;
alter table art_therapy._migration_source_map enable row level security;
alter table art_therapy._migration_source_map force row level security;
revoke all on art_therapy._migration_source_map from public, anon, authenticated;
alter table art_therapy._migration_exceptions enable row level security;
alter table art_therapy._migration_exceptions force row level security;
revoke all on art_therapy._migration_exceptions from public, anon, authenticated;
alter table art_therapy._migration_attachments enable row level security;
alter table art_therapy._migration_attachments force row level security;
revoke all on art_therapy._migration_attachments from public, anon, authenticated;

revoke all on art_therapy.tool_details, art_therapy.theory_details from public, anon, authenticated;
