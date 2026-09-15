-- Airtable display values may be arrays or structured generated-value objects.
-- Preserve their JSON shape instead of coercing them to text.
alter table art_therapy._source_record_values
  alter column display_value type jsonb
  using case when display_value is null then null else to_jsonb(display_value) end;
