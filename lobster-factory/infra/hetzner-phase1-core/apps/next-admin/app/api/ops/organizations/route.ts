// POST /api/ops/organizations — upsert an organization record (by slug)
// Called from /onboard Step 3→4 to auto-register new clients in Supabase.
// GET is handled by /api/ops/clients/route.ts (reads organizations table).

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseWriteClient } from "../../../../lib/supabase-server";
import { resolveOpsRole, canWriteTenantConfig } from "../../../../lib/ops-role";

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

  const now = new Date().toISOString();
  const record: Record<string, unknown> = {
    slug: body.slug.trim(),
    name: body.name.trim(),
    type: body.type ?? "client",
    metadata: body.metadata ?? {},
    updated_at: now,
  };
  if (body.id) record.id = body.id;

  const { data, error } = await supabase
    .from("organizations")
    .upsert(record, { onConflict: "slug" })
    .select("id,slug,name,type,status,created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: "upsert_failed", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, organization: data });
}
