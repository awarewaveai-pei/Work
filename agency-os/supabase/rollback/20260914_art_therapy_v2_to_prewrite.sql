-- DESTRUCTIVE: returns this project to the verified pre-write baseline.
-- Run only after setting the session GUC to the verified dump SHA-256:
--   app.art_therapy_verified_backup_sha256 =
--   a60435e1d0d62810e7f4079b2b266231c894ca8c147fc85149599e595ba9462b

do $$
begin
  if current_setting('app.art_therapy_verified_backup_sha256', true)
     is distinct from 'a60435e1d0d62810e7f4079b2b266231c894ca8c147fc85149599e595ba9462b' then
    raise exception 'Verified Art Therapy backup confirmation is missing';
  end if;
end $$;

alter role authenticator in database postgres reset pgrst.db_schemas;
alter role authenticator reset pgrst.db_schemas;

drop schema if exists art_therapy_api cascade;
drop schema if exists art_therapy cascade;

notify pgrst, 'reload config';
