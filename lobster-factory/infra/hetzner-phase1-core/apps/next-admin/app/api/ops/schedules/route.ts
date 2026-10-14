// GET /api/ops/schedules[?slug=<client>] — the schedules table (lib/schedules/view.ts). viewer+ may read;
// writes go through PATCH /api/ops/clients/[slug]/schedules/[job].
import { NextResponse } from "next/server";
import { resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { loadSchedulesView } from "@/lib/schedules/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  resolveOpsRole(request); // internal console — viewer+ may read (middleware enforces the session)
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  const slug = new URL(request.url).searchParams.get("slug") ?? undefined;
  let view: Awaited<ReturnType<typeof loadSchedulesView>>;
  try {
    view = await loadSchedulesView(sb, { slug });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500 });
  }
  if (!view) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, view });
}
