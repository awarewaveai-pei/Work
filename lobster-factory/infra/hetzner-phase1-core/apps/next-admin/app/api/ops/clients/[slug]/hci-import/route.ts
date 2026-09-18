// GET/POST /api/ops/clients/[slug]/hci-import
//
// The operator's own trigger for lib/hci/import-sources.ts's importOrganizationSourcesToHci() --
// closes the /ops/collect -> HCI-30 loop, sibling of ./cognitive-os-import/route.ts (same day, same
// shape, operator: "資料蒐集器>>HCI 串連使用", 2026-09-18).
//
// POST starts the import as a background job and returns immediately with a runKey; GET ?runKey=
// polls it. Same reasoning as cognitive-os-import's own header comment: a real import can call
// HCI-30 once per eligible source (each one a real fetch through HCI-30's isolated runner), which can
// exceed this app's Cloudflare-fronted edge's ~100s idle timeout well before it's done.

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { importOrganizationSourcesToHci, type HciImportSummary } from "@/lib/hci/import-sources";
import { isHciConfigured } from "@/lib/hci/client";
import { startRunJob, getRunJob } from "@/lib/collect/run-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function orgIdOf(slug: string): Promise<string | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  const { data, error } = await sb.from("organizations").select("id").eq("slug", slug).single();
  return error || !data ? null : (data.id as string);
}

function audit(orgId: string, role: string, source: string, event: string, payload: Record<string, unknown>) {
  void getSupabaseWriteClient()?.from("ops_audit_events").insert({
    organization_id: orgId,
    actor_role: role,
    event_type: event,
    target_type: "organizations",
    target_id: orgId,
    trace_id: crypto.randomUUID(),
    payload: { ...payload, role_source: source },
  });
}

/** Own job "kind" plus its own key namespace -- belt and suspenders against a run started by the
 *  OTHER import route sharing this same in-memory Map ever being readable as this route's own result
 *  shape (lib/collect/run-jobs.ts's own getRunJob kind check). */
const JOB_KIND = "hci-import";
function jobKey(orgId: string, runKey: string): string {
  return `${JOB_KIND}:${orgId}:${runKey}`;
}

function newRunKey(): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `hci-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}-${suffix}`;
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug } = await context.params;
  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const runKey = new URL(request.url).searchParams.get("runKey");
  if (!runKey) return NextResponse.json({ ok: false, error: "runKey_required" }, { status: 400 });

  const job = getRunJob<HciImportSummary>(JOB_KIND, jobKey(orgId, runKey));
  if (!job) return NextResponse.json({ ok: false, error: "run_not_found" }, { status: 404 });
  if (job.status === "running") return NextResponse.json({ ok: true, status: "running" });
  if (job.status === "error") return NextResponse.json({ ok: true, status: "error", error: job.error });
  return NextResponse.json({ ok: true, status: "done", result: job.result });
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  if (!isHciConfigured()) {
    return NextResponse.json({ ok: false, error: "hci_not_configured" }, { status: 503 });
  }
  const { slug } = await context.params;
  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const runKey = newRunKey();
  startRunJob<HciImportSummary>(
    JOB_KIND,
    jobKey(orgId, runKey),
    importOrganizationSourcesToHci(orgId).then((summary) => {
      audit(orgId, resolved.role, resolved.source, "hci_import", {
        imported: summary.imported,
        alreadyImported: summary.alreadyImported,
        rejected: summary.rejected.length,
        errors: summary.errors.length,
      });
      return summary;
    }),
  );

  return NextResponse.json({ ok: true, queued: true, runKey });
}
