import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { computeFingerprint } from "@/lib/ops-inbox/fingerprint";
import { normalizeNetdata } from "@/lib/ops-inbox/normalize/netdata";
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

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const raw = redactSecrets(payload);
  const draft = normalizeNetdata(raw);

  draft.fingerprint = computeFingerprint({
    source: draft.source,
    service: draft.service,
    signal_type: draft.signal_type,
    title: draft.title,
    raw,
  });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return new NextResponse("db unavailable", { status: 503 });

  // 2026-05-23: CLEAR signal active resolve.
  // Replaces the old skip-and-return logic which left every open incident stale forever.
  // Now: when netdata transitions WARNING/CRITICAL → CLEAR, look up the matching open
  // incident by stable fingerprint (host:name) and mark it resolved.
  // Fingerprint stability is guaranteed by fingerprint.ts:32 using raw.name (stable
  // metric ID) rather than raw.alarm (label text containing value).
  // Idempotent: `.eq("status", "open")` filter ensures duplicate CLEARs are no-ops.
  if ((raw as any)?.status === "CLEAR") {
    const { data: openMatch } = await supabase
      .from("ops_incidents")
      .select("id")
      .eq("fingerprint", draft.fingerprint)
      .eq("environment", draft.environment)
      .eq("status", "open")
      .maybeSingle();

    if (openMatch) {
      const { error: resolveError } = await supabase
        .from("ops_incidents")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: "netdata-auto-resolve-on-clear",
        })
        .eq("id", openMatch.id);

      if (resolveError) {
        Sentry.captureException(resolveError, { tags: { route: "ops-inbox-webhook-netdata", op: "clear-resolve" } });
        return new NextResponse("resolve write failed", { status: 500 });
      }
      return NextResponse.json({ resolved: openMatch.id });
    }
    return NextResponse.json({ skipped: "no_open_match" });
  }

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
    Sentry.captureException(error ?? new Error("upsert_empty"), { tags: { route: "ops-inbox-webhook-netdata" } });
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

  return NextResponse.json({
    incident_id: upserted.id,
    transition: transition.kind,
    occurrence_count: upserted.occurrence_count,
  });
}
