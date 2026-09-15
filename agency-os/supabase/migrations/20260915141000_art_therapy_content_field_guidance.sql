-- Canonical documentation/configuration for the 51 Airtable field-guidance rows.
-- These rows define how Tool content fields are authored; they are not Tool records.
create table art_therapy.content_field_guidance (
  id uuid primary key,
  source_record_id text not null unique,
  field_label_zh text not null,
  field_label_en text,
  module_label_zh text,
  module_label_en text,
  authoring_guidance_zh text,
  example_zh text,
  created_at timestamptz not null default now()
);

with source_rows as (
  select sr.id, jsonb_object_agg(srv.field_id, to_jsonb(srv.display_value)) as fields
  from art_therapy._source_records sr
  join art_therapy._source_tables st on st.id = sr.table_id
  join art_therapy._source_record_values srv on srv.record_id = sr.id
  where st.name = '藝術治療工具標題'
  group by sr.id
)
insert into art_therapy.content_field_guidance (
  id, source_record_id, field_label_zh, field_label_en,
  module_label_zh, module_label_en, authoring_guidance_zh, example_zh
)
select
  (substr(md5('art-therapy:field-guidance:' || sr.id),1,8)||'-'||substr(md5('art-therapy:field-guidance:' || sr.id),9,4)||'-5'||substr(md5('art-therapy:field-guidance:' || sr.id),14,3)||'-a'||substr(md5('art-therapy:field-guidance:' || sr.id),18,3)||'-'||substr(md5('art-therapy:field-guidance:' || sr.id),21,12))::uuid,
  sr.id,
  sr.fields ->> 'fldkCEry3J5CkGbY6',
  sr.fields ->> 'flduQYBvllcbVvClp',
  sr.fields ->> 'fldohfYiTmZOajzMt',
  sr.fields ->> 'fldLPhiS8Xsoi4oAQ',
  sr.fields ->> 'fld4vy7srdkQBjvBK',
  sr.fields ->> 'fldapjc3X36LDs4Gm'
from source_rows sr;

alter table art_therapy.content_field_guidance enable row level security;
alter table art_therapy.content_field_guidance force row level security;
revoke all on art_therapy.content_field_guidance from public, anon, authenticated;
