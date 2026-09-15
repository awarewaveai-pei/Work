do $$
declare
  old_run_id constant uuid := 'ee1eced8-846d-5df8-9c1a-02034e6bfccc';
  new_run_id constant uuid := 'bb20a159-dd5c-5cfa-a19e-e9bdbc0f29e1';
  approved_mapping_version constant text := 'b6874e9241663dc288330930ef52ed53e987ce5776e70cb424842ff8aecb9cda';
begin
  if not exists (select 1 from art_therapy._migration_runs where id = old_run_id and status = 'verified') then
    raise exception 'Expected verified migration run % is missing', old_run_id;
  end if;
  if exists (select 1 from art_therapy._migration_runs where id = new_run_id) then
    raise exception 'Approval-bound migration run % already exists', new_run_id;
  end if;

  insert into art_therapy._migration_runs
    (id, snapshot_checksum, mapping_version, source_extracted_at, status, counts, created_at)
  select
    new_run_id, snapshot_checksum, approved_mapping_version,
    source_extracted_at, status, counts, created_at
  from art_therapy._migration_runs
  where id = old_run_id;

  update art_therapy._migration_field_map set run_id = new_run_id where run_id = old_run_id;
  update art_therapy._migration_source_map set run_id = new_run_id where run_id = old_run_id;
  update art_therapy._migration_exceptions set run_id = new_run_id where run_id = old_run_id;
  update art_therapy._migration_attachments set run_id = new_run_id where run_id = old_run_id;

  delete from art_therapy._migration_runs where id = old_run_id;
end $$;
