-- Make the private source archive's intentional deny boundary explicit.
create policy source_archive_deny on art_therapy._source_tables for all to public using (false) with check (false);
create policy source_archive_deny on art_therapy._source_fields for all to public using (false) with check (false);
create policy source_archive_deny on art_therapy._source_records for all to public using (false) with check (false);
create policy source_archive_deny on art_therapy._source_record_values for all to public using (false) with check (false);
