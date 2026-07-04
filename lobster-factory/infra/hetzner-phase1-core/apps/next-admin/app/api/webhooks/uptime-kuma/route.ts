import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { computeFingerprint } from "@/lib/ops-inbox/fingerprint";
import { normalizeUptimeKuma } from "@/lib/ops-inbox/normalize/uptime-kuma";
import { redactSecrets } from "@/lib/ops-inbox/redactSecrets";
import { computeTransition } from "@/lib/ops-inbox/transition";
import { upsertIncidentAtomic } from "@/lib/ops-inbox/upsertIncidentAtomic";
import type { Incident, IncidentSnapshot } from "@/lib/ops-inbox/types";
import { verifyIngestSource } from "@/lib/ops-inbox/verifyIngestToken";
import { readWebhookBody } from "@/lib/ops-inbox/readRequestBody";
import { triggerAutoClassify } from "@/lib/ops-inbox/ai/triggerAutoClassify";
import { dispatchNotifications } from "@/lib/ops-inbox/notify/dispatcher";
import { tryRemediate } from "@/lib/repair-center/remediations/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // M2: per-source token (falls back to shared OPS_INBOX_INGEST_TOKEN until provisioned).
  const auth = verifyIngestSource(req, "uptime_kuma");
  if (!auth.ok) return new NextResponse("unauthorized", { status: 401 });

  // C3 + M3 fix: bounded body read (256KB cap) preserving raw bytes for future HMAC.
  const body = await readWebhookBody(req);
  if (body.ok === false) return new NextResponse(body.error, { status: body.status });
  const raw = redactSecrets(body.parsed);
  const draft = normalizeUptimeKuma(raw);
  draft.fingerprint = computeFingerprint({
    source: draft.source,
    service: draft.service,
    signal_type: draft.signal_type,
    title: draft.title,
    raw,
  });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return new NextResponse("db unavailable", { status: 503 });

  const { data: existing } = await supabase
    .from("ops_incidents")
    .select("id, severity, status, occurrence_count, reopen_count")
    .eq("fingerprint", draft.fingerprint)
    .eq("environment", draft.environment)
    .maybeSingle();

  const snapshot = (existing ?? null) as IncidentSnapshot | null;
  const transition = computeTransition(snapshot, draft);
  const isReopen = transition.kind === "reopened";

  // M10 fix: atomic upsert — occurrence_count incremented via SQL SET count+1 (row lock).
  const { data: upserted, error } = await upsertIncidentAtomic(supabase, draft, isReopen);

  if (error || !upserted) {
    Sentry.captureException(error ?? new Error("upsert_empty"), { tags: { route: "ops-inbox-webhook-uptime-kuma" } });
    return new NextResponse("db write failed", { status: 500 });
  }

  if (transition.kind === "new") {
    await triggerAutoClassify(upserted.id);
  }
  try {
    await dispatchNotifications({ incident: upserted as Incident, transition });
  } catch (e) {
    Sentry.captureException(e);
  }

  // Auto-remediation (A2): deterministic allowlisted self-heal. No-ops unless
  // AUTO_REMEDIATE_ENABLED=true AND the service is in the whitelist AND the
  // precheck confirms the container is actually broken. Fire-and-forget — the
  // execute+settle+healthcheck window (~85s) must NOT block the ingest ack, or
  // a storm would pin a Node request + live SSH session per DOWN webhook and
  // Uptime-Kuma would time out and retry. This is a long-lived Node process
  // (next start in Docker), so the floating promise runs to completion; a
  // container restart mid-remediation leaves a "running" ops_action_runs row
  // that the reaper closes. tryRemediate is internally fail-open.
  if (transition.kind === "new" || transition.kind === "reopened") {
    void tryRemediate(supabase, upserted as Incident, { mode: "auto", actor: "webhook:uptime_kuma" }).catch(
      (e) => Sentry.captureException(e),
    );
  }

  return NextResponse.json({
    incident_id: upserted.id,
    transition: transition.kind,
    occurrence_count: upserted.occurrence_count,
  });
}
