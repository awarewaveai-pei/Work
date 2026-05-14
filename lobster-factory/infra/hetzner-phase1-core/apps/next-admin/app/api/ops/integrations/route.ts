import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export interface AssetRow {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  asset_type: string;
  environment: string;
  primary_url: string | null;
  provider: string | null;
  status: string;
}

export interface IntegrationRow {
  id: string;
  organization_id: string;
  asset_id: string | null;
  provider: string;
  secret_ref: string | null;
  external_hint: string | null;
  api_metadata: Record<string, unknown>;
  provisioning_source: string;
  status: string;
  last_error: string | null;
  last_tested_at?: string | null;
  last_seen_at?: string | null;
  created_at: string;
}

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  const orgRes = await supabase
    .from("organizations")
    .select("id,slug,name,type,status,metadata,created_at")
    .order("created_at", { ascending: true });

  if (orgRes.error) {
    return NextResponse.json(
      { ok: false, error: "organizations_fetch_failed", details: orgRes.error.message },
      { status: 500 },
    );
  }

  const [assetRes, integrationRes] = await Promise.all([
    supabase
      .from("assets")
      .select("id,organization_id,slug,name,asset_type,environment,primary_url,provider,status")
      .order("created_at", { ascending: true }),
    supabase
      .from("tenant_integration_bindings")
      .select("id,organization_id,asset_id,provider,secret_ref,external_hint,api_metadata,provisioning_source,status,last_error,last_tested_at,last_seen_at,created_at")
      .order("created_at", { ascending: true }),
  ]);

  const assetsReady = !assetRes.error;
  const integrationsReady = !integrationRes.error;

  return NextResponse.json({
    ok: true,
    organizations: orgRes.data ?? [],
    assets: assetsReady ? ((assetRes.data ?? []) as AssetRow[]) : [],
    integrations: integrationsReady ? ((integrationRes.data ?? []) as IntegrationRow[]) : [],
    readiness: {
      assets_table_ready: assetsReady,
      integrations_table_ready: integrationsReady,
      assets_error: assetRes.error?.message ?? null,
      integrations_error: integrationRes.error?.message ?? null,
    },
  });
}

