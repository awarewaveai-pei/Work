// POST /api/ops/organizations — ensure an organization record (by slug)
// Called from /onboard Step 3→4 to auto-register new clients in Supabase.
// GET is handled by /api/ops/clients/route.ts (reads organizations table).
// An existing organization is never overwritten: its metadata is only added to (lib/site-flow/records.ts
// ensureOrganization); `kept_keys` lists the submitted values that were not applied.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseWriteClient } from "../../../../lib/supabase-server";
import { resolveOpsRole, canWriteTenantConfig } from "../../../../lib/ops-role";
import { ensureOrganization } from "../../../../lib/site-flow/records";

export const dynamic = "force-dynamic";

interface OrgCreateBody {
  id?: string;
  slug: string;
  name: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const { role } = resolveOpsRole(req);
  if (!canWriteTenantConfig(role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_write_not_configured" }, { status: 503 });
  }

  let body: OrgCreateBody;
  try {
    body = (await req.json()) as OrgCreateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.slug?.trim() || !body.name?.trim()) {
    return NextResponse.json({ ok: false, error: "slug_and_name_required" }, { status: 400 });
  }

  const result = await ensureOrganization(supabase, {
    slug: body.slug,
    name: body.name,
    type: body.type,
    metadata: body.metadata,
    id: body.id,
  });

  if ("error" in result) {
    const status = result.error === "slug_id_mismatch" ? 409 : result.error === "invalid_input" ? 400 : 500;
    return NextResponse.json(
      { ok: false, error: result.error === "slug_id_mismatch" ? result.error : "upsert_failed", details: result.detail ?? result.error },
      { status },
    );
  }

  const { id, slug, name, type, status, created_at, created, keptKeys } = result.value;
  return NextResponse.json({
    ok: true,
    organization: { id, slug, name, type, status, created_at },
    created,
    kept_keys: keptKeys,
  });
}
