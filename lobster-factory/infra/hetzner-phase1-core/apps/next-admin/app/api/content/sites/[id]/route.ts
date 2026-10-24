import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { siteRowGate, siteUrlWriteGate } from "@/lib/content/wp-sites";
import type { ManagedSite } from "@/app/api/content/sites/route";
import type { SiteContentDefaults } from "@/lib/content/brand-voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/content/sites/[id] — update site (token optional)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const denied = await siteRowGate(req, id);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name   === "string")  patch.name   = body.name.trim();
  if (typeof body.url    === "string") {
    // The edit form always sends url; only a changed one goes through the staff-only gate.
    const url = body.url.trim().replace(/\/$/, "");
    const { data: current, error: readError } = await supabase.from("wp_sites").select("url").eq("id", id).maybeSingle();
    if (readError) return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
    if (url !== (current as { url: string } | null)?.url.replace(/\/$/, "")) {
      const urlDenied = siteUrlWriteGate(req, url);
      if (urlDenied) return urlDenied;
      patch.url = url;
    }
  }
  if (typeof body.color  === "string")  patch.color  = body.color.trim();
  if (typeof body.active === "boolean") patch.active = body.active;
  if (typeof body.note     === "string")  patch.note     = body.note.trim() || null;
  if (typeof body.username === "string" && body.username.trim()) patch.username = body.username.trim();
  // Token/AppPassword only updated when explicitly provided and non-empty
  if (typeof body.token    === "string" && body.token.trim()) patch.token = body.token.trim();
  // Content Studio per-site defaults (full replace — caller sends complete object)
  if (body.contentDefaults !== undefined && typeof body.contentDefaults === "object" && body.contentDefaults !== null)
    patch.content_defaults = body.contentDefaults;

  const { data, error } = await supabase
    .from("wp_sites")
    .update(patch)
    .eq("id", id)
    .select("id, name, url, color, active, note, created_at, token, username, content_defaults")
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }

  const row = data as { id: string; name: string; url: string; color: string; active: boolean; note: string | null; created_at: string; token: string; username: string; content_defaults: SiteContentDefaults | null };
  const site: ManagedSite = {
    id: row.id,
    name: row.name,
    url: row.url,
    color: row.color,
    active: row.active,
    tokenSet: Boolean(row.token),
    usernameSet: Boolean(row.username),
    note: row.note,
    source: "db",
    createdAt: row.created_at,
    contentDefaults: row.content_defaults ?? {},
  };
  return NextResponse.json({ ok: true, site });
}

// DELETE /api/content/sites/[id]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const denied = await siteRowGate(req, id);
  if (denied) return denied;

  const { error } = await supabase
    .from("wp_sites")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
