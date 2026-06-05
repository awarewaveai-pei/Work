import { timingSafeEqual } from "../security/timingSafeEqual";

export function verifyIngestToken(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const expected = process.env.OPS_INBOX_INGEST_TOKEN;
  if (!expected) return false;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  return timingSafeEqual(m[1], expected);
}

// ---------------------------------------------------------------------------
// M2 (auto-repair audit 2026-05-23 §M2): per-source ingest verification.
//
// Problem: all 5 external monitoring webhooks share one bearer token. A single
// leak (happened 2026-05-22) lets an attacker forge incidents at every endpoint.
// Fix: each source gets its own token so a leak compromises only that one source
// (blast-radius isolation). verifyIngestToken() above is intentionally LEFT
// UNCHANGED — it still guards the server-to-server / read endpoints that legitimately
// share the token (ops/probe, ops/inbox/digest, ops/inbox/incidents, webhooks/deploy,
// webhooks/tenant-integration). Only the 5 monitoring webhooks move to verifyIngestSource.
//
// Backward-compatible rollout (deploy is a no-op until secrets are provisioned):
//   - per-source secret UNSET → fall back to the shared legacy token. Before any
//     per-source token is provisioned, behaviour is byte-identical to verifyIngestToken.
//   - per-source secret SET   → it becomes primary; the shared legacy token is ALSO
//     accepted only while OPS_INBOX_DUAL_ACCEPT_LEGACY="true" (migration window), so
//     platforms can be re-pointed one at a time without a flip-the-switch outage.
//     Set the flag to "false" once every platform sends its own token.
// ---------------------------------------------------------------------------

export type PerSourceWebhook = "sentry" | "grafana" | "netdata" | "uptime_kuma" | "posthog";

const SOURCE_SECRET_ENV: Record<PerSourceWebhook, string> = {
  sentry: "OPS_INBOX_SENTRY_TOKEN",
  grafana: "OPS_INBOX_GRAFANA_TOKEN",
  netdata: "OPS_INBOX_NETDATA_TOKEN",
  uptime_kuma: "OPS_INBOX_UPTIME_KUMA_TOKEN",
  posthog: "OPS_INBOX_POSTHOG_TOKEN",
};

export type VerifyReason = "bad_bearer" | "no_secret_configured";

export interface VerifyResult {
  ok: boolean;
  // Populated on failure so the route can log WHY (per-source vs legacy vs missing
  // config) without leaking which token value was tried.
  reason?: VerifyReason;
}

export function verifyIngestSource(req: Request, source: PerSourceWebhook): VerifyResult {
  const bearer = extractBearer(req);
  if (!bearer) return { ok: false, reason: "bad_bearer" };

  const perSourceSecret = process.env[SOURCE_SECRET_ENV[source]];
  const legacy = process.env.OPS_INBOX_INGEST_TOKEN;
  const dualAccept = process.env.OPS_INBOX_DUAL_ACCEPT_LEGACY === "true";

  if (perSourceSecret) {
    if (timingSafeEqual(bearer, perSourceSecret)) return { ok: true };
    if (dualAccept && legacy && timingSafeEqual(bearer, legacy)) return { ok: true };
    return { ok: false, reason: "bad_bearer" };
  }

  // Per-source token not provisioned yet → behave exactly like the shared-token path
  // so deploying this code before Phase-2 rollout changes nothing.
  if (!legacy) return { ok: false, reason: "no_secret_configured" };
  return timingSafeEqual(bearer, legacy) ? { ok: true } : { ok: false, reason: "bad_bearer" };
}

function extractBearer(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

// Re-export so callers that import timingSafeEqual from this module continue to work.
// The canonical implementation lives in lib/security/timingSafeEqual.ts (m2 audit fix).
export { timingSafeEqual };
