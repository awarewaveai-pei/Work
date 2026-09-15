-- Every Airtable linked-record target must resolve to a preserved source record.
alter table art_therapy._source_links
  add constraint _source_links_linked_record_id_fkey
  foreign key (linked_record_id)
  references art_therapy._source_records(id)
  not valid;

alter table art_therapy._source_links
  validate constraint _source_links_linked_record_id_fkey;
