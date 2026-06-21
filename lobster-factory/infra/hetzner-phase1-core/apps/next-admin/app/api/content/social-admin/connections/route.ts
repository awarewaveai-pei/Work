import { NextResponse } from "next/server";
import { resolveOpsRole, canWriteTenantConfig } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PLATFORMS = [
  "instagram", "facebook", "reddit", "linkedin", "x",
  "threads", "tiktok", "pinterest", "bluesky",
] as const;

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canWriteTenantConfig(role)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const { clientId, postizIntegrationId, platform, label } = body as Record<string, unknown>;

  if (!clientId || typeof clientId !== "string") {
    return new NextResponse("clientId required", { status: 400 });
  }
  if (!postizIntegrationId || typeof postizIntegrationId !== "string") {
    return new NextResponse("postizIntegrationId required", { status: 400 });
  }
  if (
    !platform ||
    typeof platform !== "string" ||
    !(VALID_PLATFORMS as readonly string[]).includes(platform)
  ) {
    return new NextResponse(
      `platform must be one of: ${VALID_PLATFORMS.join(", ")}`,
      { status: 400 }
    );
  }

  const db = getSupabaseWriteClient();
  if (!db) return new NextResponse("database not configured", { status: 503 });

  const { error } = await db.from("social_postiz_connections").insert({
    client_id: clientId,
    postiz_integration_id: postizIntegrationId,
    platform,
    label: typeof label === "string" && label ? label : null,
  });

  if (error) {
    if (error.code === "23505") {
      return new NextResponse("connection already exists", { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canWriteTenantConfig(role)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  const integrationId = url.searchParams.get("integrationId");

  if (!clientId) return new NextResponse("clientId required", { status: 400 });
  if (!integrationId) return new NextResponse("integrationId required", { status: 400 });

  const db = getSupabaseWriteClient();
  if (!db) return new NextResponse("database not configured", { status: 503 });

  const { error } = await db
    .from("social_postiz_connections")
    .delete()
    .eq("client_id", clientId)
    .eq("postiz_integration_id", integrationId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
