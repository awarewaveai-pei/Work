-- K2g (agency-os/docs/knowledge-base/KNOWLEDGE_BASE_PLAN.md): a content-viewer screen needs the
-- original document text, and cs_knowledge_sources never stored it -- only cs_knowledge_chunks'
-- overlapping, unordered pieces exist (lib/kb/rag.ts chunkText(), 80-char overlap, no ordinal
-- column). Reconstructing "full text" from those would duplicate every overlap boundary and have no
-- reliable order. Store the verbatim body once, at ingest, instead.
--
-- Nullable, no backfill: existing rows show "content unavailable -- re-upload to enable full view"
-- rather than a wrong reconstruction attempt.

BEGIN;

ALTER TABLE public.cs_knowledge_sources
  ADD COLUMN IF NOT EXISTS body text;

COMMIT;
