-- Match the canonical schema's defense-in-depth boundary.
alter table art_therapy._source_tables force row level security;
alter table art_therapy._source_fields force row level security;
alter table art_therapy._source_records force row level security;
alter table art_therapy._source_record_values force row level security;
alter table art_therapy._source_links force row level security;
