// GET/POST/PATCH/DELETE /api/ops/clients/[slug]/collection-sources
//
// The operator's end of the collection system: which sources this client collects from, adding one,
// approving a candidate, switching one off — and running them.
//
// GET    — the catalogue (what CAN be selected, and what is unavailable and why) plus this client's
//          configured sources.
// POST   — add a source, or { action: "run" } to collect now (dryRun stores nothing).
// PATCH  — { id, action: "approve" | "disable" }.
// DELETE — { id }: only ever a soft disable, so "what did this source put in the knowledge base?"
//          stays answerable.
//
// Writes are gated by canWriteTenantConfig (owner/admin) and audited, like every other tenant-config
// write in this console. A run is a write: it spends budget, it can cost money through a metered
// tier, and it changes the knowledge base.

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { sourceCatalogue } from "@/lib/collect/catalogue";
import { addSource, approveSource, disableSource, listSources } from "@/lib/collect/sources-store";
import { runCollection, defaultRunKey } from "@/lib/collect/run";
import { startRunJob, getRunJob } from "@/lib/collect/run-jobs";
import "@/lib/collect/blocks";
import { recordOpsAudit } from "@/lib/ops-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Kept generous even though the route itself now responds immediately (see action:"run" below) —
// a request polling ?runKey= still goes through this same handler's file, and Next.js applies
// maxDuration per route regardless of which export handles a given request.
export const maxDuration = 300;

async function orgIdOf(slug: string): Promise<string | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  const { data, error } = await sb.from("organizations").select("id").eq("slug", slug).single();
  return error || !data ? null : (data.id as string);
}


export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request); // internal console — viewer+ may read the catalogue/sources below
  const { slug } = await context.params;
  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  // Polling a run started by POST (action:"run") — see the header comment there for why this is a
  // separate step rather than POST just waiting for the crawl itself. A run's result is the same
  // detail level POST used to return directly (per-URL refusal reasons, which vendor key is
  // misconfigured), which only owner/admin could see before this endpoint existed — so this branch
  // needs the SAME gate as POST, not the viewer-level one the plain catalogue/sources body below
  // still allows (critic finding, 2026-09-12: this was missing, a real authorization downgrade).
  const runKey = new URL(request.url).searchParams.get("runKey");
  if (runKey) {
    if (!canWriteTenantConfig(resolved.role)) {
      return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
    }
    const job = getRunJob("collection-run", `${orgId}:${runKey}`);
    if (!job) return NextResponse.json({ ok: false, error: "run_not_found" }, { status: 404 });
    if (job.status === "running") return NextResponse.json({ ok: true, status: "running" });
    if (job.status === "error") return NextResponse.json({ ok: true, status: "error", error: job.error });
    return NextResponse.json({ ok: true, status: "done", result: job.result });
  }

  return NextResponse.json({
    ok: true,
    catalogue: sourceCatalogue(),
    sources: await listSources(orgId),
  });
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  if (body.action === "run") {
    const dryRun = body.dryRun === true;
    const sourceIds = Array.isArray(body.sourceIds) ? (body.sourceIds as string[]) : undefined;
    const runKey = defaultRunKey();

    // NOT awaited: a real run's own budget allows up to 10 minutes (run.ts DEFAULT_BUDGET), which
    // this app's Cloudflare-fronted domain will never let a single request/response survive
    // (~100s edge idle timeout — confirmed 2026-09-12 from production nginx access log showing
    // repeated `POST .../collection-sources -> 499`, i.e. the edge closing the connection out from
    // under a still-running upstream request). The browser now polls GET ?runKey= instead of
    // waiting on this response body.
    startRunJob(
      "collection-run",
      `${orgId}:${runKey}`,
      runCollection({ organizationId: orgId, sourceIds, dryRun, runKey }).then(async (result) => {
        await recordOpsAudit(orgId, resolved.role, resolved.source, dryRun ? "collection_dry_run" : "collection_run", {
          runKey: result.runKey,
          sources: result.sources,
          written: result.sink.written,
          dirty: result.report.dirty.length,
        });
        return result;
      }),
    );

    return NextResponse.json({ ok: true, queued: true, runKey });
  }

  const blockId = typeof body.blockId === "string" ? body.blockId : "";
  const entry = typeof body.entry === "string" ? body.entry : "";
  const written = await addSource({
    organizationId: orgId,
    blockId,
    entry,
    options: (body.options && typeof body.options === "object" ? body.options : {}) as Record<string, unknown>,
    label: typeof body.label === "string" ? body.label : undefined,
    // A source added here is added BY a person, and that is the approval (ADR 013). Discovery uses
    // the same function with `proposedBy`, which lands as a candidate instead.
    approvedBy: `${resolved.role}:${resolved.source}`,
  });
  if (!written.ok) return NextResponse.json({ ok: false, errors: written.errors }, { status: 400 });

  await recordOpsAudit(orgId, resolved.role, resolved.source, "collection_source_added", { blockId, entry });
  return NextResponse.json({ ok: true, source: written.source });
}

export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

  const result =
    body.action === "approve"
      ? await approveSource(orgId, id, `${resolved.role}:${resolved.source}`)
      : await disableSource(orgId, id);
  if (!result.ok) return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });

  await recordOpsAudit(orgId, resolved.role, resolved.source, `collection_source_${body.action === "approve" ? "approved" : "disabled"}`, { id });
  return NextResponse.json({ ok: true, source: result.source });
}

export async function DELETE(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

  // Soft, always: a deleted row takes with it the answer to "where did this document come from?".
  const result = await disableSource(orgId, id);
  if (!result.ok) return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
  await recordOpsAudit(orgId, resolved.role, resolved.source, "collection_source_disabled", { id });
  return NextResponse.json({ ok: true, source: result.source });
}
