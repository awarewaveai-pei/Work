import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { siteRowGate, siteUrlWriteGate } from "@/lib/content/wp-sites";
import { staffOnly } from "@/lib/tenant-guard";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { MAX_TREND_FEEDS, PUBLISH_MODES, TOPIC_MODES, type SiteContentDefaults } from "@/lib/content/brand-voice";
import { isSafePublicHttps } from "@/lib/content/public-https";

const GATE_MODES = [
  { field: "publishMode", allowed: PUBLISH_MODES },
  { field: "topicMode", allowed: TOPIC_MODES },
] as const;

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
  // Content Studio per-site defaults (full replace -- caller sends complete object), except the two gate modes: each is set
  // only by its own field, staff only (publishMode sends to the customer's site and social channels without a person;
  // topicMode spends the customer's money without one), and the write is conditional on the modes read here -- a save
  // racing a mode switch gets 409 instead of undoing it. The gates are independent (B4): switching one never moves the other.
  const defaultsGiven = typeof body.contentDefaults === "object" && body.contentDefaults !== null && !Array.isArray(body.contentDefaults);
  for (const g of GATE_MODES) {
    if (body[g.field] === undefined) continue;
    const modeDenied = staffOnly(req);
    if (modeDenied) return modeDenied;
    if (!(g.allowed as readonly unknown[]).includes(body[g.field]))
      return NextResponse.json({ ok: false, error: `${g.field} must be one of ${g.allowed.join(", ")}` }, { status: 400 });
  }
  let modesRead: Array<[string, string | null]> | undefined;   // undefined = content_defaults not written
  if (defaultsGiven || GATE_MODES.some((g) => body[g.field] !== undefined)) {
    const { data: current, error: readError } = await supabase.from("wp_sites").select("content_defaults").eq("id", id).maybeSingle();
    if (readError) return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
    const stored = ((current as { content_defaults: SiteContentDefaults | null } | null)?.content_defaults) ?? {};
    const next: Record<string, unknown> = { ...((defaultsGiven ? body.contentDefaults : stored) as SiteContentDefaults) };
    if (defaultsGiven && "trendFeeds" in next) {
      if (!Array.isArray(next.trendFeeds)) delete next.trendFeeds;
      else {
        const feeds = [...new Set(next.trendFeeds.map((u) => (typeof u === "string" ? u.trim() : "")).filter(Boolean))];
        const bad = feeds.find((u) => !isSafePublicHttps(u));
        if (bad) return NextResponse.json({ ok: false, error: `trendFeeds: ${bad} 不是公開 https 網址` }, { status: 400 });
        if (feeds.length > MAX_TREND_FEEDS) return NextResponse.json({ ok: false, error: `trendFeeds: 最多 ${MAX_TREND_FEEDS} 個` }, { status: 400 });
        next.trendFeeds = feeds;
      }
    }
    modesRead = [];
    for (const g of GATE_MODES) {
      delete next[g.field];
      const mode = body[g.field] ?? (stored as Record<string, unknown>)[g.field];
      if (mode) next[g.field] = mode;
      // as `content_defaults->>field` renders it, so even a malformed stored value (true, 1) can be overwritten
      const raw = (stored as Record<string, unknown>)[g.field];
      modesRead.push([g.field, raw === undefined || raw === null ? null : typeof raw === "string" ? raw : JSON.stringify(raw)]);
    }
    patch.content_defaults = next;
  }

  let update = supabase.from("wp_sites").update(patch).eq("id", id);
  for (const [field, read] of modesRead ?? []) {
    update = read === null ? update.is(`content_defaults->>${field}`, null) : update.eq(`content_defaults->>${field}`, read);
  }
  const { data, error } = await update
    .select("id, name, url, color, active, note, created_at, token, username, content_defaults")
    .single();

  if (error) {
    if (error.code === "PGRST116" && modesRead !== undefined) {
      return NextResponse.json({ ok: false, error: "網站設定剛被別人改過，請重新整理後再存一次" }, { status: 409 });
    }
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
