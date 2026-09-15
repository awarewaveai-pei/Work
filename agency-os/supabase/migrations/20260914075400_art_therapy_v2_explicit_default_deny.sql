do $$
declare table_name text;
begin
  foreach table_name in array array[
    'tools', 'healing_stages', 'therapeutic_focuses', 'theory_categories', 'theories', 'support_methods',
    'conditions', 'presenting_concerns', 'settings', 'tool_localizations', 'healing_stage_localizations',
    'support_method_localizations', 'theory_category_localizations', 'theory_localizations',
    'condition_localizations', 'presenting_concern_localizations', 'therapeutic_focus_localizations',
    'tool_healing_stages', 'tool_focuses', 'tool_theories', 'theory_category_links', 'tool_support_methods',
    'tool_settings', '_schema_version', '_migration_runs', '_migration_field_map', '_migration_source_map',
    '_migration_exceptions', '_migration_attachments'
  ]
  loop
    execute format(
      'create policy %I on art_therapy.%I for all to anon, authenticated using (false) with check (false)',
      table_name || '_explicit_default_deny',
      table_name
    );
  end loop;
end $$;
