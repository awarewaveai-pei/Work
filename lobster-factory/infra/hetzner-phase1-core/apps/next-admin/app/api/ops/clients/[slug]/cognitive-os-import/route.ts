// GET/POST /api/ops/clients/[slug]/cognitive-os-import
//
// The operator's own trigger for lib/cognitive-os/import-sources.ts's importOrganizationSources() —
// closes the /ops/collect -> Cognitive OS loop with a real button instead of the manual curl call
// this required before (operator: "送去後，我再選擇工具", 2026-09-18).
//
// Distinct from POST /api/internal/cognitive-os/import-project-sources: that route authenticates a
// bearer token (COGNITIVE_OS_IMPORT_INGEST_TOKEN) for machine/future-scheduler callers and is never
// reachable from a browser session. This route authenticates the logged-in operator's own ops role
// instead (same canWriteTenantConfig gate every other write in this console uses) and calls the SAME
// importOrganizationSources() function directly — no token in play at all, since it is one process
// calling its own function, not a cross-service HTTP hop.
//
// POST starts the import as a background job and returns immediately with a runKey; GET ?runKey=
// polls it. Same reasoning as collection-sources' own action:"run" (see run-jobs.ts's header comment)
// — a real import can call Cognitive OS once per eligible source, which can exceed this app's
// Cloudflare-fronted edge's ~100s idle timeout well before it's done.
//
// Frozen (HTTP 410) unless RESEARCH_BRIDGES_ENABLED=true -- lib/research-bridges.ts (plan P0, 2026-09-23).

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { importFolderSources, importOrganizationSources, type ImportSummary } from "@/lib/cognitive-os/import-sources";
import { isCognitiveOsConfigured } from "@/lib/cognitive-os/client";
import { isResearchBridgesEnabled, researchBridgesFrozenBody } from "@/lib/research-bridges";
import { startRunJob, getRunJob } from "@/lib/collect/run-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function orgOf(slug: string): Promise<{ id: string; name: string } | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  const { data, error } = await sb.from("organizations").select("id, name").eq("slug", slug).single();
  return error || !data ? null : { id: data.id as string, name: data.name as string };
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

/** Own job "kind" (checked by getRunJob/startRunJob, lib/collect/run-jobs.ts) plus its own key
 *  namespace — belt and suspenders against a run started by the OTHER route sharing this same
 *  in-memory Map ever being readable as this route's own result shape. */
const JOB_KIND = "cognitive-os-import";
function jobKey(orgId: string, runKey: string): string {
  return `${JOB_KIND}:${orgId}:${runKey}`;
}

function newRunKey(): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `cogos-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}-${suffix}`;
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug } = await context.params;
  const org = await orgOf(slug);
  if (!org) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
  const orgId = org.id;

  const runKey = new URL(request.url).searchParams.get("runKey");
  if (!runKey) return NextResponse.json({ ok: false, error: "runKey_required" }, { status: 400 });

  const job = getRunJob<ImportSummary>(JOB_KIND, jobKey(orgId, runKey));
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
  // Role first (an unauthorized caller learns nothing about the switch), then the kill switch, then
  // configuration -- so a frozen bridge answers 410 whether or not COGNITIVE_OS_* is set.
  if (!isResearchBridgesEnabled()) {
    return NextResponse.json(researchBridgesFrozenBody(), { status: 410 });
  }
  if (!isCognitiveOsConfigured()) {
    return NextResponse.json({ ok: false, error: "cognitive_os_not_configured" }, { status: 503 });
  }
  const { slug } = await context.params;
  const org = await orgOf(slug);
  if (!org) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
  const orgId = org.id;

  // Optional: scope the import to one KB folder instead of the whole organization (operator,
  // 2026-09-18 — see importFolderSources's own header for why a folder gets its own Project rather
  // than piling into the organization-wide one). A missing/empty body (existing callers, existing
  // tests) keeps today's whole-organization behavior unchanged.
  let folderId: string | undefined;
  try {
    const body = (await request.json()) as { folderId?: unknown };
    folderId = typeof body.folderId === "string" && body.folderId.trim() ? body.folderId.trim() : undefined;
  } catch {
    // No/empty JSON body — same as no folderId, not an error (this route's own existing callers
    // send `{}` today).
  }

  const runKey = newRunKey();
  const importResult = folderId
    ? importFolderSources(orgId, folderId)
    : importOrganizationSources(orgId, { organizationName: org.name });
  startRunJob<ImportSummary>(
    JOB_KIND,
    jobKey(orgId, runKey),
    importResult.then((summary) => {
      audit(orgId, resolved.role, resolved.source, "cognitive_os_import", {
        folderId: folderId ?? null,
        projectId: summary.projectId,
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
