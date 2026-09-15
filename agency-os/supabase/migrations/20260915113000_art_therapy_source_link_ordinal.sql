-- Preserve duplicate linked values and their original order; they are source data.
alter table art_therapy._source_links add column if not exists ordinal integer not null default 0;
alter table art_therapy._source_links drop constraint if exists _source_links_pkey;
alter table art_therapy._source_links add constraint _source_links_pkey primary key (source_record_id, source_field_id, linked_record_id, ordinal);
