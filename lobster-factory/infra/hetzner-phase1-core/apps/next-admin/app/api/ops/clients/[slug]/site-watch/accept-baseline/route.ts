// POST /api/ops/clients/[slug]/site-watch/accept-baseline { pageId } — owner/admin.
// The page's latest diff screenshot becomes its baseline (C6: never replaced automatically).

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { acceptLatestAsBaseline, auditSiteWatch, orgBySlug } from "@/lib/site-watch/console";
import { createSiteWatchObjects } from "@/lib/site-watch/objects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { pageId?: unknown } | null;
  const pageId = typeof body?.pageId === "string" && /^[0-9a-f]{16}$/.test(body.pageId) ? body.pageId : null;
  if (!pageId) return NextResponse.json({ ok: false, error: "page_id_invalid" }, { status: 400 });

  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  const org = await orgBySlug(sb, (await context.params).slug);
  if (!org) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const result = await acceptLatestAsBaseline(sb, createSiteWatchObjects(), org.id, pageId);
  if (!result.ok) return NextResponse.json(result, { status: 409 });
  await auditSiteWatch(sb, org.id, resolved, "site_watch_baseline_accepted", { pageId });
  return NextResponse.json({ ok: true });
}
