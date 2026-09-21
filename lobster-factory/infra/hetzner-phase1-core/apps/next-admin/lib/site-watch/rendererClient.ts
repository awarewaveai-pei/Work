// Call the self-hosted renderer's POST /snapshot (apps/renderer/server.mjs). Origin and secret come
// from the same provider registry entry the collect tier uses — one place to configure the renderer.
import { providerSpec } from "@/lib/collect/net/providers";

export interface SnapshotResult {
  ok: true;
  status: number;
  finalUrl: string;
  /** null = page is up. See apps/renderer/lib.mjs SNAPSHOT_FAILURE_CODES. */
  failureCode: string | null;
  detail: string | null;
  consoleErrors: string[];
  pageErrors: string[];
  screenshotBase64: string | null;
  screenshotBytes: number;
  /** Why there is no screenshot although the page may be up (too_large, screenshot_failed:…, not_loaded). */
  screenshotSkipped: string | null;
  timingMs: number;
}

/** The monitor itself failed (renderer down, misconfigured, overloaded). Never a verdict on the site. */
export class RendererUnavailable extends Error {
  constructor(public readonly code: string) {
    super(`renderer_unavailable:${code}`);
  }
}

// Renderer's own hard deadline is 70s (server.mjs snapshot()); allow queueing behind one other job.
const CLIENT_TIMEOUT_MS = 150_000;

export async function takeSnapshot(url: string, fetchImpl: typeof fetch = fetch): Promise<SnapshotResult> {
  const spec = providerSpec("renderer");
  const secret = spec ? process.env[spec.apiKeyEnv] : undefined;
  if (!spec || !secret) throw new RendererUnavailable("not_configured");
  let res: Response;
  try {
    res = await fetchImpl(`${spec.origin}/snapshot`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(spec.authHeader?.(secret) ?? {}) },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
  } catch (e) {
    throw new RendererUnavailable(`network:${String((e as Error)?.message ?? e).slice(0, 120)}`);
  }
  const body = (await res.json().catch(() => null)) as (SnapshotResult & { error?: string }) | null;
  if (res.status === 400 && body?.error?.startsWith("url_")) {
    // The renderer refuses this URL outright (private address, internal hostname…): the target's
    // site_url is wrong, which is a finding about the target, not an outage of the monitor.
    return {
      ok: true, status: 0, finalUrl: "", failureCode: "blocked", detail: body.error,
      consoleErrors: [], pageErrors: [], screenshotBase64: null, screenshotBytes: 0,
      screenshotSkipped: "not_loaded", timingMs: 0,
    };
  }
  if (!res.ok || !body || body.ok !== true) {
    throw new RendererUnavailable(`http_${res.status}:${body?.error ?? "bad_body"}`);
  }
  return body;
}
