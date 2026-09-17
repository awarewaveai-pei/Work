BEGIN;

ALTER TABLE public.cs_knowledge_sources
  DROP COLUMN IF EXISTS body;

COMMIT;
