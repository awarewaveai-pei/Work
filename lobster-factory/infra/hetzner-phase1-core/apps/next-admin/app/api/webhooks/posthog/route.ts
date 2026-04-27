import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { computeFingerprint } from "@/lib/ops-inbox/fingerprint";
import { normalizePostHog } from "@/lib/ops-inbox/normalize/posthog";
import { redactSecrets } from "@/lib/ops-inbox/redactSecrets";
import { computeTransition, maxSeverity } from "@/lib/ops-inbox/transition";
import type { Incident, IncidentSnapshot } from "@/lib/ops-inbox/types";
import { verifyIngestToken } from "@/lib/ops-inbox/verifyIngestToken";
import { triggerAutoClassify } from "@/lib/ops-inbox/ai/triggerAutoClassify";
import { dispatchNotifications } from "@/lib/ops-inbox/notify/dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!verifyIngestToken(req)) return new NextResponse("unauthorized", { status: 401 });
  if (process.env.OPS_INBOX_POSTHOG_ENABLED !== "true") {
    return new NextResponse("posthog ingestion disabled", { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const raw = redactSecrets(payload);
  const draft = normalizePostHog(raw);
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

  const { data: upserted, error } = await supabase
    .from("ops_incidents")
    .upsert(
      {
        ...draft,
        last_seen_at: new Date().toISOString(),
        occurrence_count: (snapshot?.occurrence_count ?? 0) + 1,
        reopen_count: (snapshot?.reopen_count ?? 0) + (isReopen ? 1 : 0),
        ...(isReopen ? { status: "open" as const, resolved_at: null, resolved_by: null } : {}),
        severity: maxSeverity(snapshot?.severity, draft.severity),
      },
      { onConflict: "fingerprint,environment" },
    )
    .select("*")
    .single();

  if (error || !upserted) {
    Sentry.captureException(error ?? new Error("upsert_empty"), { tags: { route: "ops-inbox-webhook-posthog" } });
    return new NextResponse("db write failed", { status: 500 });
  }

  void (async () => {
    try {
      if (transition.kind === "new") await triggerAutoClassify(upserted.id);
      await dispatchNotifications({ incident: upserted as Incident, transition });
    } catch (e) {
      Sentry.captureException(e);
    }
  })();

  return NextResponse.json({
    incident_id: upserted.id,
    transition: transition.kind,
    occurrence_count: upserted.occurrence_count,
  });
}
