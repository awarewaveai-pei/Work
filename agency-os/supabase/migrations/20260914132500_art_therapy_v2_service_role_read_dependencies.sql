-- security_invoker views require the calling role to read their dependencies.
-- Keep this server-only and read-only; anon/authenticated remain explicitly denied.
grant select on
  art_therapy.tools,
  art_therapy.tool_localizations,
  art_therapy.tool_healing_stages,
  art_therapy.healing_stage_localizations,
  art_therapy.tool_focuses,
  art_therapy.therapeutic_focus_localizations,
  art_therapy.tool_theories,
  art_therapy.theory_category_links,
  art_therapy.theory_category_localizations,
  art_therapy.theories,
  art_therapy.theory_localizations
to service_role;
