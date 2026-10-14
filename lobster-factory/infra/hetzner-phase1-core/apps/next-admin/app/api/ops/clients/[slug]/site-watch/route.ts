// GET /api/ops/clients/[slug]/site-watch — the client page's 網站巡檢 card: config (or the defaults the
// next sync will create), per-page state, last 10 results. Config writes go through the schedules table:
// PATCH /api/ops/clients/[slug]/schedules/site_watch (lib/schedules/adapters/site-watch.ts).

import { NextResponse } from "next/server";
import { resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { loadOverview, orgBySlug } from "@/lib/site-watch/console";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  resolveOpsRole(request); // internal console — viewer+ may read (middleware enforces the session)
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  const org = await orgBySlug(sb, (await context.params).slug);
  if (!org) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, overview: await loadOverview(sb, org) });
}
