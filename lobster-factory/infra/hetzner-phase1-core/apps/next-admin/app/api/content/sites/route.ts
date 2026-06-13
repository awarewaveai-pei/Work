import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { getWpSites } from "@/lib/content/wp-sites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ManagedSite {
  id: string;
  name: string;
  url: string;
  color: string;
  active: boolean;
  tokenSet: boolean;
  note: string | null;
  source: "db" | "env";
  createdAt?: string;
}

// GET /api/content/sites — list all sites (no tokens in response)
export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("wp_sites")
      .select("id, name, url, color, active, note, created_at, token")
      .order("created_at");

    if (!error && data) {
      const sites: ManagedSite[] = (data as Array<{
        id: string; name: string; url: string; color: string;
        active: boolean; note: string | null; created_at: string; token: string;
      }>).map(r => ({
        id: r.id,
        name: r.name,
        url: r.url,
        color: r.color,
        active: r.active,
        tokenSet: Boolean(r.token),
        note: r.note,
        source: "db" as const,
        createdAt: r.created_at,
      }));
      return NextResponse.json({ ok: true, sites });
    }
  }

  // Fallback: env vars (read-only, shown as "env" source)
  const { sites: envSites } = await getWpSites();
  const sites: ManagedSite[] = envSites.map(s => ({
    ...s,
    active: true,
    tokenSet: true,
    note: null,
    source: "env" as const,
  }));
  return NextResponse.json({ ok: true, sites });
}

// POST /api/content/sites — add new site
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const name  = typeof body.name  === "string" ? body.name.trim()  : "";
  const url   = typeof body.url   === "string" ? body.url.trim().replace(/\/$/, "") : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const color = typeof body.color === "string" ? body.color.trim() : "#5855d0";
  const note  = typeof body.note  === "string" ? body.note.trim() || null : null;

  if (!name)  return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
  if (!url)   return NextResponse.json({ ok: false, error: "url required" }, { status: 400 });
  if (!token) return NextResponse.json({ ok: false, error: "token required" }, { status: 400 });
  if (!/^https?:\/\//i.test(url))
    return NextResponse.json({ ok: false, error: "url 必須以 http:// 或 https:// 開頭" }, { status: 400 });

  const { data, error } = await supabase
    .from("wp_sites")
    .insert({ name, url, token, color, note, active: true })
    .select("id, name, url, color, active, note, created_at")
    .single();

  if (error) {
    const msg = error.code === "23505" ? "此網址已存在" : error.message;
    return NextResponse.json({ ok: false, error: msg }, { status: 409 });
  }

  const row = data as { id: string; name: string; url: string; color: string; active: boolean; note: string | null; created_at: string };
  const site: ManagedSite = {
    id: row.id,
    name: row.name,
    url: row.url,
    color: row.color,
    active: row.active,
    tokenSet: true,
    note: row.note,
    source: "db",
    createdAt: row.created_at,
  };
  return NextResponse.json({ ok: true, site }, { status: 201 });
}
