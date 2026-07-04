import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { computeFingerprint } from "@/lib/ops-inbox/fingerprint";
import { normalizeDeploy } from "@/lib/ops-inbox/normalize/deploy";
import { redactSecrets } from "@/lib/ops-inbox/redactSecrets";
import { computeTransition } from "@/lib/ops-inbox/transition";
import { upsertIncidentAtomic } from "@/lib/ops-inbox/upsertIncidentAtomic";
import type { Incident, IncidentSnapshot } from "@/lib/ops-inbox/types";
import { verifyIngestToken } from "@/lib/ops-inbox/verifyIngestToken";
import { readWebhookBody } from "@/lib/ops-inbox/readRequestBody";
import { dispatchNotifications } from "@/lib/ops-inbox/notify/dispatcher";
import { noteDeploySuccessOnPendingRuns, reapStaleRuns } from "@/lib/repair-center/hygiene";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!verifyIngestToken(req)) return new NextResponse("unauthorized", { status: 401 });

  const body = await readWebhookBody<Record<string, unknown>>(req);
  if (body.ok === false) return new NextResponse(body.error, { status: body.status });
  const raw = redactSecrets(body.parsed);
  const draft = normalizeDeploy(raw);
  draft.fingerprint = computeFingerprint({
    source: draft.source,
    service: draft.service,
    signal_type: draft.signal_type,
    title: draft.title,
    raw,
  });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return new NextResponse("db unavailable", { status: 503 });

  const { data: existing, error: existingError } = await supabase
    .from("ops_incidents")
    .select("id, severity, status, occurrence_count, reopen_count")
    .eq("fingerprint", draft.fingerprint)
    .eq("environment", draft.environment)
    .maybeSingle();

  if (existingError) {
    Sentry.captureException(existingError, { tags: { route: "ops-inbox-webhook-deploy", step: "read_existing" } });
    return new NextResponse("db read failed", { status: 500 });
  }

  const snapshot = (existing ?? null) as IncidentSnapshot | null;
  const transition = computeTransition(snapshot, draft);
  const isReopen = transition.kind === "reopened";

  // M10 fix: atomic upsert — occurrence_count incremented via SQL SET count+1 (row lock).
  const { data: upserted, error } = await upsertIncidentAtomic(supabase, draft, isReopen);

  if (error || !upserted) {
    Sentry.captureException(error ?? new Error("upsert_empty"), { tags: { route: "ops-inbox-webhook-deploy" } });
    return new NextResponse("db write failed", { status: 500 });
  }

  // VPS auto-deploy script handles Telegram/Slack directly; dispatcher skips deploy source (see rules.ts).
  try {
    await dispatchNotifications({ incident: upserted as Incident, transition });
  } catch (e) {
    Sentry.captureException(e);
  }

  // Closed loop (A3): annotate deploy-stage repair runs for this app so the
  // operator sees a deploy landed. NOT auto-resolved — a service-scoped deploy
  // signal cannot prove the specific fix shipped (see hygiene.ts). Fail-open.
  let deployNoted = 0;
  try {
    if ((raw as { event?: unknown }).event === "deploy_success") {
      const app = String((raw as { app?: unknown }).app ?? "");
      if (app) {
        const noted = await noteDeploySuccessOnPendingRuns(supabase, {
          app,
          deployedCommit: typeof (raw as { deployed_commit?: unknown }).deployed_commit === "string"
            ? ((raw as { deployed_commit?: string }).deployed_commit)
            : undefined,
        });
        deployNoted = noted.annotated;
      }
    }
  } catch (e) {
    Sentry.captureException(e);
  }

  // Opportunistic hygiene: the VPS cron hits this webhook regularly, making it
  // the natural heartbeat for the stale-run reaper (no scheduler exists in
  // next-admin). Idempotent + fail-open.
  try {
    await reapStaleRuns(supabase);
  } catch (e) {
    Sentry.captureException(e);
  }

  return NextResponse.json({
    incident_id: upserted.id,
    transition: transition.kind,
    occurrence_count: upserted.occurrence_count,
    deploy_noted_runs: deployNoted,
  });
}
