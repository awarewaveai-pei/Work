-- 0162: tarot_batch_jobs.deck_key = SHA-256 of exactly what the batch generates (model, aspect ratio, seed, every
-- card prompt; lib/tarot/deck-key.ts). The deck panel lists only finished batches of the deck now locked, so a batch
-- from another style can no longer be loaded into this deck (operator 2026-11-14).
-- Nullable: jobs created before 0162 keep null and are no longer offered in the list (their images stay in R2).
begin;
set local lock_timeout = '5s';
alter table public.tarot_batch_jobs
  add column if not exists deck_key text check (deck_key is null or deck_key ~ '^[0-9a-f]{64}$');
create index if not exists tarot_batch_jobs_deck_key_idx on public.tarot_batch_jobs (deck_key, created_at desc);
commit;
