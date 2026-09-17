-- 0085 — nested folders for the KB ops list (K2h; operator decision 2026-09-17: folders, not flat
-- tags). Second half of the operator's original complaint ("知識庫應該要有資料夾,不是散落一地").
--
-- `cs_knowledge_folders` is its own table, not a `parent_folder_id` column bolted onto
-- `cs_knowledge_sources` alone: a folder can be empty (created ahead of documents existing) and a
-- folder's own name/position must be editable without touching every document inside it.
--
-- CROSS-LEVEL FILTERING ("資料夾巢狀可跨階層過濾", the K2h DoD): picking a folder must also match
-- everything in its subfolders. Done as a SQL RPC (`cs_folder_descendants`, recursive CTE) rather
-- than a materialized path or ltree column — this codebase already has the RPC pattern for
-- everything cross-row (cs_match_chunks, cs_match_chunks_keyword, migrations 0051/0076) and a
-- recursive CTE needs no extra column to keep in sync on move/rename.
--
-- DELETE SEMANTICS (matches this file's own rollback row: "移除資料夾過濾,退回平面"): deleting a
-- folder must never delete a document. Subfolders cascade (ON DELETE CASCADE — deleting a folder
-- deletes the empty hierarchy under it, which is a folder-structure decision, not a data-loss one);
-- documents inside are unfiled (ON DELETE SET NULL), never removed.
--
-- APPLY WITH (Medium risk — additive table + nullable column + new RPC, no existing data touched):
--   node scripts/apply-db-migration.mjs 0085
-- Down migration: packages/db/scripts/0085_kb_folders_down.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.cs_knowledge_folders (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_id       uuid        REFERENCES public.cs_knowledge_folders(id) ON DELETE CASCADE,
  name            text        NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 200),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Same name twice under the same parent reads as two different folders in the UI with no way to
  -- tell them apart; NULLS NOT DISTINCT so this also catches two root-level folders sharing a name.
  UNIQUE NULLS NOT DISTINCT (organization_id, parent_id, name)
);
CREATE INDEX IF NOT EXISTS idx_cs_knowledge_folders_org
  ON public.cs_knowledge_folders(organization_id);
CREATE INDEX IF NOT EXISTS idx_cs_knowledge_folders_parent
  ON public.cs_knowledge_folders(organization_id, parent_id);

ALTER TABLE public.cs_knowledge_sources
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.cs_knowledge_folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cs_knowledge_sources_folder
  ON public.cs_knowledge_sources(organization_id, folder_id);

ALTER TABLE public.cs_knowledge_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON public.cs_knowledge_folders TO service_role USING (true) WITH CHECK (true);

-- Every id in the folder's subtree, INCLUDING the folder itself (so a caller can always do
-- `.in("folder_id", descendants)` without a separate "plus itself" special case). Org-scoped at
-- every step of the recursion, not just the seed row: a cross-tenant parent_id can never happen
-- today (parent_id's FK target has no organization_id check of its own), but the recursion walking
-- into a different org's subtree if that ever changed would silently leak documents across tenants,
-- so the boundary is enforced here rather than trusted to stay true elsewhere.
--
-- CYCLE clause (critic finding 2026-09-17): cs_folder_move below is the only write path and makes a
-- cycle impossible by construction, but this recursive CTE has no way to know that from here — a
-- future bug, a manual UPDATE, or a restored backup that reintroduces a cycle would otherwise send
-- this query into an infinite loop on every folder-filtered list request. CYCLE stops the recursion
-- the moment an id would repeat, independent of whether a cycle can currently occur.
CREATE OR REPLACE FUNCTION public.cs_folder_descendants(p_organization_id uuid, p_folder_id uuid)
RETURNS TABLE (id uuid)
LANGUAGE sql STABLE AS $fn$
  WITH RECURSIVE tree AS (
    SELECT f.id FROM public.cs_knowledge_folders f
    WHERE f.id = p_folder_id AND f.organization_id = p_organization_id
    UNION ALL
    SELECT f.id FROM public.cs_knowledge_folders f
    JOIN tree t ON f.parent_id = t.id
    WHERE f.organization_id = p_organization_id
  ) CYCLE id SET is_cycle USING path
  SELECT id FROM tree;
$fn$;

REVOKE ALL ON FUNCTION public.cs_folder_descendants(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_folder_descendants(uuid, uuid) TO service_role;

-- Atomic move, replacing a JS-orchestrated read-then-write (critic finding 2026-09-17, Major): the
-- old lib/kb/folders.ts moveFolder() read cs_folder_descendants() to check for a cycle, THEN issued a
-- separate UPDATE — two concurrent moves (A under B, and B under A, each racing the other's write)
-- could each pass the check before either write landed, producing a genuine 2-node cycle with no DB
-- constraint able to reject it (a self-referencing FK cannot express "not an ancestor of itself").
-- Folding the check and the write into ONE statement, under a row lock held for the duration of both,
-- closes the window entirely: the loser of two conflicting concurrent moves gets a Postgres deadlock
-- error (a real, visible failure) instead of silently completing into a corrupt tree.
-- Returns: 'ok' | 'not_found' | 'parent_not_found' | 'would_create_cycle'.
CREATE OR REPLACE FUNCTION public.cs_folder_move(p_organization_id uuid, p_folder_id uuid, p_new_parent_id uuid)
RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  v_would_cycle boolean;
BEGIN
  PERFORM 1 FROM public.cs_knowledge_folders
   WHERE id = p_folder_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  IF p_new_parent_id IS NOT NULL THEN
    IF p_new_parent_id = p_folder_id THEN RETURN 'would_create_cycle'; END IF;

    PERFORM 1 FROM public.cs_knowledge_folders
     WHERE id = p_new_parent_id AND organization_id = p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RETURN 'parent_not_found'; END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.cs_folder_descendants(p_organization_id, p_folder_id) d WHERE d.id = p_new_parent_id
    ) INTO v_would_cycle;
    IF v_would_cycle THEN RETURN 'would_create_cycle'; END IF;
  END IF;

  UPDATE public.cs_knowledge_folders
     SET parent_id = p_new_parent_id, updated_at = now()
   WHERE id = p_folder_id AND organization_id = p_organization_id;
  RETURN 'ok';
END;
$fn$;

REVOKE ALL ON FUNCTION public.cs_folder_move(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_folder_move(uuid, uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
