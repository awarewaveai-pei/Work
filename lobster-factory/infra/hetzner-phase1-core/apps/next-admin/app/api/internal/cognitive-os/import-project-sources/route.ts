// POST /api/internal/cognitive-os/import-project-sources
//
// Bridges one next-admin organization's cs_knowledge_sources into its Cognitive OS Project
// (lib/cognitive-os/import-sources.ts). Manual/one-off trigger only -- no scheduling here (an
// undispatched task owns the ops UI button that will eventually call this same route with the
// operator's own session instead of this bearer token).
//
// Auth: Authorization: Bearer {COGNITIVE_OS_IMPORT_INGEST_TOKEN} -- its own dedicated token, never
// a token shared with an unrelated caller (see lib/ops-inbox/verifyIngestToken.ts's own M2 history
// for why sharing one token across unrelated callers is a blast-radius mistake this project already
// paid for once).
// Input:  { organizationId: string, projectName?: string }
// Output: { ok: true, summary: ImportSummary } | { ok: false, error: string }

import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { isCognitiveOsConfigured } from "@/lib/cognitive-os/client";
import { importOrganizationSources } from "@/lib/cognitive-os/import-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function verifyToken(request: Request): boolean {
  const expected = process.env.COGNITIVE_OS_IMPORT_INGEST_TOKEN;
  if (!expected) return false; // fail closed: unset means nobody is authorized, not everybody
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}

export async function POST(request: Request) {
  if (!verifyToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isCognitiveOsConfigured()) return NextResponse.json({ ok: false, error: "cognitive_os_not_configured" }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const record = body as Record<string, unknown> | null;
  const organizationId = typeof record?.organizationId === "string" ? record.organizationId : null;
  if (!organizationId) return NextResponse.json({ ok: false, error: "organizationId_required" }, { status: 400 });
  const projectName = typeof record?.projectName === "string" ? record.projectName : undefined;

  const summary = await importOrganizationSources(organizationId, { projectName });
  return NextResponse.json({ ok: true, summary });
}
