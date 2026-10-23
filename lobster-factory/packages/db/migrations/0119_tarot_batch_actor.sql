-- 0119: tarot_batch_jobs.actor = who started the batch (requestActor: "client:<org>:<uid>" or "ops:<role>:<uid>").
-- The card callback runs as the Trigger worker; it asks tarot.image as this actor, so a customer's deck gets the
-- customer's verdict and every usage row names the person, not "system" (ADR 017 §4; step-8 card, door blocker 2).
-- Nullable: jobs created before 0119 keep null and are judged as "system", as they were.
begin;
set local lock_timeout = '5s';
alter table public.tarot_batch_jobs
  add column if not exists actor text check (actor is null or length(actor) between 1 and 300);
commit;
