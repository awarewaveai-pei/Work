// GET/POST/PATCH/DELETE /api/ops/clients/[slug]/cs-knowledge-folders — nested-folder CRUD for the
// KB ops list (K2h, operator decision 2026-09-17). A separate route from cs-knowledge/route.ts: that
// file owns documents, this one owns the folder tree they can optionally sit in — the two lifecycles
// (a folder can exist empty; a document's folder is one field on it) don't share request shapes.
//
// GET    — every folder in this tenant, flat: { id, name, parentId }. Small N (ops-authored
//          structure), so the UI builds whatever tree/indent view it needs from this. viewer+.
// POST   — { name, parentId? } → create. parentId omitted/null = root-level.
// PATCH  — { folderId, action: "rename", name } or { folderId, action: "move", parentId }.
//          "move" refuses a cycle (moving a folder into its own descendant) — see lib/kb/folders.ts.
// DELETE — { folderId } → deletes the folder AND its empty subfolder structure (ON DELETE CASCADE).
//          Documents inside are unfiled, never deleted (ON DELETE SET NULL, migration 0085) — the
//          DB constraint guarantees this, there is no delete-time "move docs out first" step here.
// Writes gated by canWriteTenantConfig (owner/admin), same tier as cs-knowledge.

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { listFolders, createFolder, renameFolder, moveFolder, deleteFolder, type FolderError } from "@/lib/kb";

const FOLDER_ERROR_HINT: Record<FolderError, string> = {
  name_required: "資料夾名稱不可為空",
  duplicate_name: "同層已有相同名稱的資料夾",
  parent_not_found: "找不到這個資料夾",
  would_create_cycle: "不能把資料夾移進自己的子資料夾裡",
  not_found: "找不到這個資料夾",
  write_failed: "寫入失敗，請重試",
};

function statusOf(err: FolderError): number {
  return err === "not_found" || err === "parent_not_found" ? 404 : err === "name_required" || err === "would_create_cycle" ? 400 : 409;
}

async function orgIdOf(slug: string): Promise<string | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  const { data, error } = await sb.from("organizations").select("id").eq("slug", slug).single();
  return error || !data ? null : (data.id as string);
}

// Same shape as cs-knowledge/route.ts's own local audit() — not shared, matching this codebase's
// established per-route pattern (cs-config does the same). Critic finding 2026-09-17: DELETE here
// cascade-removes an entire subfolder subtree with no record of who did it; every write below is now
// audited for the same reason cs-knowledge/route.ts audits archive/restore/rebind/move_folder.
function audit(orgId: string, role: string, source: string, event: string, payload: Record<string, unknown>) {
  void getSupabaseWriteClient()?.from("ops_audit_events").insert({
    organization_id: orgId, actor_role: role, event_type: event,
    target_type: "organizations", target_id: orgId, trace_id: crypto.randomUUID(),
    payload: { ...payload, role_source: source },
  });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  resolveOpsRole(request); // internal ops console — viewer+ may read
  const { slug } = await context.params;
  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
  const folders = await listFolders(orgId);
  return NextResponse.json({ ok: true, folders });
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug } = await context.params;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name : "";
  const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;

  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const result = await createFolder(orgId, name, parentId);
  if (result.ok === false) return NextResponse.json({ ok: false, error: result.error, hint: FOLDER_ERROR_HINT[result.error] }, { status: statusOf(result.error) });
  audit(orgId, resolved.role, resolved.source, "cs_knowledge_folder_created", { folderId: result.id, name, parentId });
  return NextResponse.json({ ok: true, id: result.id });
}

export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug } = await context.params;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const folderId = typeof body.folderId === "string" ? body.folderId : "";
  const action = body.action === "rename" || body.action === "move" ? body.action : null;
  if (!folderId || !action) return NextResponse.json({ ok: false, error: "folderId_and_action_required" }, { status: 400 });

  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const result = action === "rename"
    ? await renameFolder(orgId, folderId, typeof body.name === "string" ? body.name : "")
    : await moveFolder(orgId, folderId, typeof body.parentId === "string" && body.parentId ? body.parentId : null);
  if (result.ok === false) return NextResponse.json({ ok: false, error: result.error, hint: FOLDER_ERROR_HINT[result.error] }, { status: statusOf(result.error) });
  audit(orgId, resolved.role, resolved.source, action === "rename" ? "cs_knowledge_folder_renamed" : "cs_knowledge_folder_moved", { folderId, ...body });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug } = await context.params;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const folderId = typeof body.folderId === "string" ? body.folderId : "";
  if (!folderId) return NextResponse.json({ ok: false, error: "folderId_required" }, { status: 400 });

  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const ok = await deleteFolder(orgId, folderId);
  if (ok) audit(orgId, resolved.role, resolved.source, "cs_knowledge_folder_deleted", { folderId });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "delete_failed" }, { status: 409 });
}
