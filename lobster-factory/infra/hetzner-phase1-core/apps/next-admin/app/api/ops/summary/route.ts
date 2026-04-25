import { NextResponse } from "next/server";
import type { MediaBoundaryRule, OpsAction, OpsTenant } from "../../../../lib/ops-contracts";
import { getSupabaseReadClient } from "../../../../lib/supabase-server";

const tenants: OpsTenant[] = [
  {
    id: "tenant-awarewave",
    slug: "awarewave",
    name: "AwareWave",
    status: "active",
    lastRunStatus: "completed",
    riskLevel: "low",
  },
  {
    id: "tenant-soulful-expression",
    slug: "soulful-expression",
    name: "Soulful Expression",
    status: "active",
    lastRunStatus: "running",
    riskLevel: "medium",
  },
];

const mediaRules: MediaBoundaryRule[] = [
  {
    domain: "ai_generated",
    backend: "r2",
    notes: "AI generated images must be versioned in Cloudflare R2.",
  },
  {
    domain: "wp_product",
    backend: "wp_uploads",
    notes: "WooCommerce product images stay in WordPress media library.",
  },
  {
    domain: "wp_blog",
    backend: "wp_uploads",
    notes: "Blog assets stay in WordPress media library.",
  },
];

const actions: OpsAction[] = [
  {
    id: "action-staging-sync",
    key: "staging_sync",
    displayName: "Staging sync",
    environmentScope: "staging_only",
    riskLevel: "low",
    requiresApproval: false,
  },
  {
    id: "action-ai-generate",
    key: "ai_generate_image",
    displayName: "AI image generate",
    environmentScope: "staging_only",
    riskLevel: "medium",
    requiresApproval: false,
  },
  {
    id: "action-prod-deploy-request",
    key: "production_deploy_request",
    displayName: "Production deploy request",
    environmentScope: "staging_and_production",
    riskLevel: "high",
    requiresApproval: true,
  },
];

export async function GET() {
  const supabase = getSupabaseReadClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("organizations")
      .select("id,slug,name,status")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && data) {
      const tenants: OpsTenant[] = data.map((org) => ({
        id: org.id,
        slug: org.slug,
        name: org.name,
        status: org.status === "active" ? "active" : "risk",
        lastRunStatus: "completed",
        riskLevel: org.status === "active" ? "low" : "medium",
      }));

      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        sourceOfTruth: "supabase",
        tenants,
        mediaRules,
        actions,
      });
    }
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    sourceOfTruth: "supabase-fallback",
    tenants,
    mediaRules,
    actions,
  });
}
