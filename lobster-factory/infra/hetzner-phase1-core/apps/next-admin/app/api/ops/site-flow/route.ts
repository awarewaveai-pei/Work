// POST /api/ops/site-flow -- "新增客戶網站" (SITE-FLOW-COMPLETION-PLAN.md §2 step 1, card SF-J): creates the client,
// site and production environment records (lib/site-flow/create-site.ts) and answers where the flow page is.
// Owner/admin staff only. Changes no host: the steps do that, under /api/ops/site-flow/[siteId]/[step].

import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { staffOnly } from "@/lib/tenant-guard";
import { createSiteFlow, parseCreateSiteBody } from "@/lib/site-flow/create-site";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  invalid_domain: 400, invalid_name: 400, invalid_locale: 400, invalid_pack: 400, invalid_billing: 400, invalid_site_id: 400, invalid_input: 400,
  host_slug_taken: 409, slug_taken: 409, slug_id_mismatch: 409, site_scope_mismatch: 409, environment_provider_conflict: 409,
};

export async function POST(request: Request) {
  const denied = staffOnly(request);
  if (denied) return denied;
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = parseCreateSiteBody(raw);
  if ("error" in parsed) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "supabase_write_not_configured" }, { status: 503 });

  const r = await createSiteFlow(db, parsed.input);
  if ("error" in r) return NextResponse.json({ ok: false, error: r.error, detail: r.detail }, { status: STATUS[r.error] ?? 500 });
  const v = r.value;
  return NextResponse.json({
    ok: true,
    organization: v.organization,
    site_id: v.siteId,
    site_created: v.siteCreated,
    environment_id: v.environmentId,
    host_slug: v.hostSlug,
    kept_keys: v.keptKeys,
    flow_url: `/ops/sites/${v.siteId}`,
  });
}
