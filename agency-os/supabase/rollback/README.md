# Art Therapy v2 rollback

Verified backup:

- File: `art_therapy_complete_verified_locked_final.dump`
- SHA-256: `a60435e1d0d62810e7f4079b2b266231c894ca8c147fc85149599e595ba9462b`
- Restore prerequisite: create roles `anon`, `authenticated`, `authenticator`
  as `NOLOGIN`; create `service_role NOLOGIN BYPASSRLS`; then run
  `create extension if not exists pgcrypto`
- Restore test: PASS on a fresh PostgreSQL 17 container, including 129-file
  source checksum verification, independent canonical rebuild, validated
  linked-record target FK, and restored grants
- Verified content: 29 canonical tables plus 60 source tables / 1,484 fields /
  1,114 records / 10,957 nonempty values / 1,582 linked values
- Pre-write state: no `public` or `art_therapy` application tables

Before rollback, verify the backup hash and restore it into a fresh PostgreSQL
17 database. Then run `20260914_art_therapy_v2_to_prewrite.sql` in one session
with `app.art_therapy_verified_backup_sha256` set to the hash above. The guard
fails closed if that exact confirmation is absent.
