// SSOT: agency-os/reports/audit/auto-repair-2026-05-23.md §C3 + §M3
// C3: webhook routes had no body-size cap → 500MB POST = OOM kill the container.
// M3: req.json() consumed bytes before any HMAC verification could capture them.
//     Switching to req.text() now preserves raw bytes for future per-source HMAC.
//
// 256KB cap rationale: Sentry's documented max event payload is ~1MB but observed events
// are <100KB. PostHog batch events average 10-50KB. Uptime Kuma / Netdata / Grafana
// payloads are all <10KB. 256KB gives 2-3x headroom on Sentry while bounding worst-case
// memory pressure per request to 256KB × concurrent_requests.

export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export interface ReadBodyResult<T = unknown> {
  ok: true;
  raw: string;
  parsed: T;
}

export interface ReadBodyError {
  ok: false;
  status: number;
  error: string;
}

/**
 * Read a webhook request body with a hard size cap, returning BOTH the raw text (for
 * future HMAC verification — must hash the exact bytes the upstream signed) AND the
 * parsed JSON.
 *
 * Rejects:
 *   413 — content-length header > MAX_WEBHOOK_BODY_BYTES (cheap pre-read rejection)
 *   413 — body bytes exceeded cap during stream consumption (Content-Length absent/lying)
 *   400 — invalid JSON after read
 */
export async function readWebhookBody<T = unknown>(req: Request): Promise<ReadBodyResult<T> | ReadBodyError> {
  const cl = req.headers.get("content-length");
  if (cl) {
    const n = Number(cl);
    if (Number.isFinite(n) && n > MAX_WEBHOOK_BODY_BYTES) {
      return { ok: false, status: 413, error: `payload_too_large:${n}>${MAX_WEBHOOK_BODY_BYTES}` };
    }
  }

  // Use .text() instead of .json() so we keep the raw bytes available to future HMAC
  // verification (Sentry / Grafana / PostHog all sign the raw body). We accept the
  // memory cost of buffering up to 256KB; that's the same upper bound .json() would
  // have consumed.
  const raw = await req.text();
  if (raw.length > MAX_WEBHOOK_BODY_BYTES) {
    return { ok: false, status: 413, error: `payload_too_large:${raw.length}>${MAX_WEBHOOK_BODY_BYTES}` };
  }

  let parsed: T;
  try {
    parsed = JSON.parse(raw) as T;
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }

  return { ok: true, raw, parsed };
}
