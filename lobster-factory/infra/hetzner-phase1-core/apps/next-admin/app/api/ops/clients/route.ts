// GET /api/ops/clients — list all organizations with client_config + wp_update_latest
// No RBAC required for read (same pattern as GET /api/ops/system-modes).
// Data lives in organizations.metadata (JSONB). No extra table needed.
//
// Phase 2c client management dashboard — 2026-05-08

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export interface ClientConfig {
  hosting_type?: string;      // "hostinger" | "hetzner" | "cloudflare" | "saas"
  site_url?: string;
  platform?: string;          // "wordpress" | "saas" | "static"
  tenant_folder?: string;     // agency-os/tenants folder name
  wp_slug?: string;           // slug used in update-client-wp-plugins.ps1
  notes?: string;
}

export interface WpUpdateLatest {
  ran_at?: string;
  ok?: boolean;
  updated_count?: number;
  skipped_license_count?: number;
  failed_count?: number;
  rollback?: boolean;
  health_final?: string;
  plugins_group?: string;
  results?: Array<{
    plugin: string;
    from: string;
    to: string;
    status: "updated" | "skipped_license" | "failed";
  }>;
}

export interface ClientRow {
  id: string;
  slug: string;
  name: string;
  type: string;
  status: string;
  clientConfig: ClientConfig;
  wpUpdateLatest: WpUpdateLatest | null;
  createdAt: string;
}

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("organizations")
    .select("id,slug,name,type,status,metadata,created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: "clients_fetch_failed", details: error.message },
      { status: 500 },
    );
  }

  const clients: ClientRow[] = (data ?? []).map((row) => {
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      type: row.type,
      status: row.status,
      clientConfig: (meta.client_config as ClientConfig) ?? {},
      wpUpdateLatest: (meta.wp_update_latest as WpUpdateLatest) ?? null,
      createdAt: row.created_at,
    };
  });

  return NextResponse.json({ ok: true, clients, count: clients.length });
}
