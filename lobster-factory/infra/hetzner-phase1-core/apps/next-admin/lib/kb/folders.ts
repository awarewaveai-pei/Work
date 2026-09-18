// Nested-folder CRUD for the KB ops list (K2g/K2h — migration 0085). Own module, not folded into
// db.ts: db.ts is the retrieval + source-lifecycle surface (KNOWLEDGE_BASE_PLAN.md §1), folders are
// a pure ops-console organisation concern that retrieval never reads.
//
// Every function degrades safely (no client / error ⇒ empty result or a typed failure), matching
// lib/kb/db.ts's own convention — this module is imported by an API route, never by retrieval.

import { getSupabaseWriteClient } from "@/lib/supabase-server";

export interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
}

/** Every folder in a tenant, flat — small N (ops-authored structure, not per-document data), so the
 *  caller builds whatever tree/indent view it needs client-side rather than this module shipping a
 *  second, parallel tree-shaped return type. */
export async function listFolders(organizationId: string): Promise<FolderRow[]> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("cs_knowledge_folders")
    .select("id,name,parent_id")
    .eq("organization_id", organizationId)
    .order("name");
  if (error || !data) return [];
  return data.map((f) => ({ id: f.id as string, name: f.name as string, parentId: (f.parent_id as string | null) ?? null }));
}

export type FolderError = "name_required" | "duplicate_name" | "parent_not_found" | "would_create_cycle" | "not_found" | "write_failed";

/**
 * Create-or-reuse by exact name, for callers that want "the folder called X" rather than "a new
 * folder" (lib/collect/sinks/kb.ts's auto-foldering of search-driven runs — operator: "搜尋到的資料應該
 *直接進入一個資料夾", 2026-09-18). Optimistic create, not check-then-create: two concurrent callers
 * racing to create the same name is exactly what createFolder's own unique-constraint 23505 handling
 * already resolves correctly (see isDuplicateKeyError above) — a separate existence check first would
 * just reopen that same TOCTOU window one line earlier.
 */
export async function findOrCreateFolderByName(organizationId: string, name: string, parentId: string | null): Promise<{ ok: true; id: string } | { ok: false; error: FolderError }> {
  const created = await createFolder(organizationId, name, parentId);
  // `=== false`, never `!created.ok`: this repo's tsconfig has strict:false (strictNullChecks off),
  // under which TS does not narrow a discriminated union via negated-truthiness on a literal boolean
  // property — see lib/cognitive-os/client.ts's own comment on the same gotcha.
  if (created.ok === false) {
    if (created.error !== "duplicate_name") return created;
  } else {
    return created;
  }
  const trimmed = name.trim().slice(0, 200);
  const existing = (await listFolders(organizationId)).find((f) => f.name === trimmed && f.parentId === parentId);
  // The 23505 that got here proves a row with this (organization_id, parent_id, name) exists — a
  // miss here means only that it is INVISIBLE to this read (RLS, replica lag), not that it is gone.
  return existing ? { ok: true, id: existing.id } : { ok: false, error: "write_failed" };
}

function isDuplicateKeyError(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

/** parentId null = a root-level folder. Existence of parentId is checked explicitly (not left to the
 *  FK) so the caller gets `parent_not_found` instead of a bare Postgres FK-violation string. */
export async function createFolder(organizationId: string, name: string, parentId: string | null): Promise<{ ok: true; id: string } | { ok: false; error: FolderError }> {
  const trimmed = name.trim().slice(0, 200);
  if (!trimmed) return { ok: false, error: "name_required" };
  const sb = getSupabaseWriteClient();
  if (!sb) return { ok: false, error: "write_failed" };

  if (parentId) {
    const { data: parent } = await sb.from("cs_knowledge_folders").select("id").eq("organization_id", organizationId).eq("id", parentId).maybeSingle();
    if (!parent) return { ok: false, error: "parent_not_found" };
  }

  const { data, error } = await sb
    .from("cs_knowledge_folders")
    .insert({ organization_id: organizationId, name: trimmed, parent_id: parentId })
    .select("id")
    .single();
  if (error) return { ok: false, error: isDuplicateKeyError(error) ? "duplicate_name" : "write_failed" };
  if (!data) return { ok: false, error: "write_failed" };
  return { ok: true, id: (data as { id: string }).id };
}

export async function renameFolder(organizationId: string, folderId: string, name: string): Promise<{ ok: true } | { ok: false; error: FolderError }> {
  const trimmed = name.trim().slice(0, 200);
  if (!trimmed) return { ok: false, error: "name_required" };
  const sb = getSupabaseWriteClient();
  if (!sb) return { ok: false, error: "write_failed" };
  const { data, error } = await sb
    .from("cs_knowledge_folders")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", folderId)
    .select("id");
  if (error) return { ok: false, error: isDuplicateKeyError(error) ? "duplicate_name" : "write_failed" };
  if ((data?.length ?? 0) === 0) return { ok: false, error: "not_found" };
  return { ok: true };
}

/**
 * Every id in folderId's own subtree, folderId itself included (migration 0085's
 * `cs_folder_descendants` RPC is written that way specifically so callers never special-case it).
 * A stale/foreign/deleted folderId legitimately resolves to zero rows (the recursive CTE's base case
 * matches nothing) — falling back to `[folderId]` here rather than `[]` is deliberate: an empty array
 * fed into a caller's `.in("folder_id", [])` filter would otherwise depend on PostgREST erroring on an
 * empty IN-list to fail safe (true today, but an incidental side-effect of a different library, not
 * an invariant this module controls) instead of just matching nothing itself either way.
 */
export async function folderDescendantIds(organizationId: string, folderId: string): Promise<string[]> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [folderId];
  const { data, error } = await sb.rpc("cs_folder_descendants", { p_organization_id: organizationId, p_folder_id: folderId });
  if (error || !data || (data as unknown[]).length === 0) return [folderId];
  return (data as Array<{ id: string }>).map((r) => r.id);
}

const MOVE_RESULTS = new Set<FolderError>(["not_found", "parent_not_found", "would_create_cycle"]);

/**
 * Re-parent a folder. Delegates the whole check-and-write to the `cs_folder_move` RPC (migration
 * 0085) as ONE atomic statement under a row lock — a prior version of this function read
 * cs_folder_descendants() to check for a cycle and then issued a SEPARATE update, which left a real
 * TOCTOU window: two concurrent moves (A under B, B under A) could each pass the check before either
 * write landed, producing a genuine 2-node cycle no CHECK constraint can express over a
 * self-referencing FK (critic finding 2026-09-17). newParentId null re-parents to root, which can
 * never cycle — the RPC skips the check entirely in that case, same as before.
 */
export async function moveFolder(organizationId: string, folderId: string, newParentId: string | null): Promise<{ ok: true } | { ok: false; error: FolderError }> {
  const sb = getSupabaseWriteClient();
  if (!sb) return { ok: false, error: "write_failed" };
  const { data, error } = await sb.rpc("cs_folder_move", { p_organization_id: organizationId, p_folder_id: folderId, p_new_parent_id: newParentId });
  if (error) return { ok: false, error: "write_failed" };
  const result = data as string;
  if (result === "ok") return { ok: true };
  if (MOVE_RESULTS.has(result as FolderError)) return { ok: false, error: result as FolderError };
  return { ok: false, error: "write_failed" }; // an RPC result this module does not recognise
}

/**
 * Delete a folder. Subfolders cascade (ON DELETE CASCADE, migration 0085 — deleting a folder deletes
 * the empty structure under it). Documents inside are unfiled, never deleted (ON DELETE SET NULL on
 * cs_knowledge_sources.folder_id) — the DB constraint is what actually guarantees this; there is no
 * application-level "move documents out first" step to forget.
 */
export async function deleteFolder(organizationId: string, folderId: string): Promise<boolean> {
  const sb = getSupabaseWriteClient();
  if (!sb) return false;
  const { data, error } = await sb.from("cs_knowledge_folders").delete().eq("organization_id", organizationId).eq("id", folderId).select("id");
  return !error && (data?.length ?? 0) > 0;
}

/** Assign (or clear, folderId = null) which folder a document lives in. */
export async function moveSourceToFolder(organizationId: string, sourceId: string, folderId: string | null): Promise<{ ok: true } | { ok: false; error: FolderError }> {
  const sb = getSupabaseWriteClient();
  if (!sb) return { ok: false, error: "write_failed" };
  if (folderId) {
    const { data: folder } = await sb.from("cs_knowledge_folders").select("id").eq("organization_id", organizationId).eq("id", folderId).maybeSingle();
    if (!folder) return { ok: false, error: "parent_not_found" };
  }
  const { data, error } = await sb
    .from("cs_knowledge_sources")
    .update({ folder_id: folderId, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", sourceId)
    .select("id");
  if (error) return { ok: false, error: "write_failed" };
  if ((data?.length ?? 0) === 0) return { ok: false, error: "not_found" };
  return { ok: true };
}
