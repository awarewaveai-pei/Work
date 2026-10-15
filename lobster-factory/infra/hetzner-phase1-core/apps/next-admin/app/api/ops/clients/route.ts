// GET /api/ops/clients — list all organizations with client_config + wp_update_latest
// No RBAC required for read (same pattern as GET /api/ops/system-modes).
// Data lives in organizations.metadata (JSONB). No extra table needed.
//
// Phase 2c client management dashboard — 2026-05-08
// M3 department coverage field added — 2026-05-13

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabase-server";
import { resolveOpsRole, canModifyIncidentStatus } from "@/lib/ops-role";
import type { ClusterId } from "@/lib/department-catalog";

export const dynamic = "force-dynamic";

export interface ClientConfig {
  hosting_type?: string;      // "hostinger" | "hetzner" | "cloudflare" | "saas"
  site_url?: string;
  platform?: string;          // "wordpress" | "saas" | "static"
  tenant_folder?: string;     // agency-os/tenants folder name
  wp_slug?: string;           // slug used in update-client-wp-plugins.ps1
  notes?: string;

  // SSH-based remote update (web UI one-click path)
  ssh_host?: string;          // server hostname/IP
  ssh_port?: number;          // SSH port (default 22; Hostinger shared = 65002)
  ssh_user?: string;          // SSH username
  ssh_key_name?: string;      // lookup key: SSH_KEY_<NAME> env var holds base64 private key
  wp_path?: string;           // absolute path to WP root on server (e.g. /home/user/public_html)

  // Wave assignment — which plugins belong to each risk tier
  // wave1: high-risk, updated one-by-one with health check after each; stops on first failure
  // wave2: medium-risk, updated one-by-one
  // wave3: low-risk, batch update
  waves?: {
    wave1?: string[];
    wave2?: string[];
    wave3?: string[];
  };

  // M3: 20-department capability selection for this client.
  // Source of truth: agency-os/tenants/<slug>/core/DEPARTMENT_SELECTION.json
  // Synced here so the console can display coverage without reading repo files at runtime.
  // Use DEPARTMENT_CATALOG SMB_DEFAULT_CLUSTERS as initial value for SMB clients.
  department_selection?: ClusterId[];

  // ISO date of last department selection review (populated alongside department_selection)
  department_selection_reviewed_at?: string;

  // Brand colours for design tools (Banner Studio "選擇品牌帶入配色"). Hex strings.
  // Stored in the same JSONB blob — no schema migration.
  brandColors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
  // CIS VI layer — logo / fonts / aux graphics (brand colours stay in brandColors above, not
  // duplicated here). Same JSONB blob, no migration. See _uiux_design.md §2.7.
  brandKit?: {
    logo?: { primary?: string; inverse?: string; icon?: string; clearSpace?: string; minWidthPx?: number };
    typography?: { headingFont?: string; bodyFont?: string; cjkFont?: string };
    graphics?: { iconStyle?: string; illustrationStyle?: string; imageryTreatment?: string };
  };
  // CIS BI·MI layer — the customer-service AI persona/voice. Consumed by lib/cs (cis.ts).
  csVoice?: {
    personaName?: string;
    languages?: string[];
    formality?: "casual" | "polite" | "formal";
    honorifics?: string;
    emojiPolicy?: "none" | "sparing" | "friendly";
    greeting?: string;
    signoff?: string;
    refusalStyle?: string;
    escalationTone?: string;
    askName?: string;
    servicePrinciples?: string[];
    mission?: string;
  };
  // Per-tenant CS kill-switch (default ON). false = AI must not auto-reply; enforced in lib/cs/orchestrator.ts.
  csEnabled?: boolean;
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
  clientKind: "internal" | "external" | "demo" | "sandbox" | "partner" | string;
  relationship: "first_party" | "customer" | "partner" | string;
  status: string;
  clientConfig: ClientConfig;
  wpUpdateLatest: WpUpdateLatest | null;
  createdAt: string;
}

export async function GET(request: Request) {
  const resolved = resolveOpsRole(request);
  if (!canModifyIncidentStatus(resolved.role) || resolved.source === "default_viewer") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

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
      clientKind: typeof meta.client_kind === "string" ? meta.client_kind : row.slug === "awarewave-ops" ? "internal" : "external",
      relationship: typeof meta.relationship === "string" ? meta.relationship : row.slug === "awarewave-ops" ? "first_party" : "customer",
      status: row.status,
      clientConfig: (meta.client_config as ClientConfig) ?? {},
      wpUpdateLatest: (meta.wp_update_latest as WpUpdateLatest) ?? null,
      createdAt: row.created_at,
    };
  });

  return NextResponse.json({ ok: true, clients, count: clients.length });
}
