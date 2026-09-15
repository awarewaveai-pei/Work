-- One row per Airtable linked-record value. This makes every relationship
-- auditable even when a source domain is intentionally not canonicalized.
create table if not exists art_therapy._source_links (
  source_record_id text not null references art_therapy._source_records(id),
  source_field_id text not null references art_therapy._source_fields(id),
  linked_record_id text not null,
  source_snapshot text not null,
  primary key (source_record_id, source_field_id, linked_record_id)
);
create index if not exists _source_links_field_idx on art_therapy._source_links(source_field_id);
create index if not exists _source_links_linked_record_idx on art_therapy._source_links(linked_record_id);
alter table art_therapy._source_links enable row level security;
revoke all on art_therapy._source_links from anon, authenticated, public;
grant select on art_therapy._source_links to service_role;
create policy source_links_deny on art_therapy._source_links for all to public using (false) with check (false);
