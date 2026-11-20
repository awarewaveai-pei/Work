/**
 * remotion-client.ts — HTTP wrapper for EU remotion-service (Node, port 8733).
 * No render logic here; only HTTP transport + error normalisation.
 */
import { resolveRendererAuth } from "./renderer-auth";

const svcBase = () => process.env.REMOTION_SERVICE_URL ?? "http://127.0.0.1:8733";

export interface RemotionRenderOptions {
  readonly outputFormat?: "9x16" | "4x5" | "16x9" | "1x1";
  readonly fps?: 24 | 25 | 30 | 60;
  /** The video's length in frames (remotion-service app.ts clamps it; default 12 s). */
  readonly durationInFrames?: number;
}

/** POST /render → remotion service job ID (not the job-store UUID). */
export async function submitRemotion(
  templateId: string,
  props: Record<string, unknown>,
  options: RemotionRenderOptions = {},
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  const auth = resolveRendererAuth("remotion");
  if (auth.ok === false) return { ok: false, error: "renderer authentication is not configured" };
  try {
    const r = await fetch(`${svcBase()}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth.headers },
      body: JSON.stringify({ templateId, props, ...options }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await r.json().catch(() => ({}))) as { jobId?: string; error?: string };
    if (!r.ok || !body.jobId) {
      return { ok: false, error: body.error ?? `remotion-service 回應異常（HTTP ${r.status}）` };
    }
    return { ok: true, jobId: body.jobId };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `無法連線到 remotion-service：${msg}` };
  }
}

export type RemotionPoll =
  | { status: "rendering" }
  | { status: "done"; url: string }
  | { status: "error"; error: string };

/** GET /status/:jobId — single short request; caller re-polls as needed. */
export async function pollRemotion(jobId: string): Promise<RemotionPoll> {
  const auth = resolveRendererAuth("remotion");
  if (auth.ok === false) return { status: "error", error: "renderer authentication is not configured" };
  try {
    const r = await fetch(`${svcBase()}/status/${encodeURIComponent(jobId)}`, {
      headers: auth.headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status === 404) return { status: "error", error: "job 不存在（remotion-service 可能重啟）" };
    const body = (await r.json().catch(() => ({}))) as { status?: string; url?: string; error?: string };
    if (body.status === "done") {
      if (!body.url) return { status: "error", error: "渲染完成但缺少輸出 URL" };
      return { status: "done", url: body.url };
    }
    if (body.status === "error") return { status: "error", error: body.error ?? "渲染失敗" };
    if (body.status === "cancelled") return { status: "error", error: "渲染已取消" };   // R5: never polled forever
    return { status: "rendering" };
  } catch {
    return { status: "rendering" }; // transient network error — caller retries
  }
}

/**
 * Card R5: DELETE /render/:jobId -- a caller that gives up (its time limit) cancels, so remotion-service's one-at-a-time
 * queue is not held by a render nobody collects. Never throws: a failed cancel is logged and answered null, the caller's
 * own outcome stands (the service ends the job anyway at its own limit). -> the job's status after the call ("cancelled",
 * or "done" / "error" when it had already ended), null = not known.
 */
export async function cancelRemotion(jobId: string): Promise<string | null> {
  const auth = resolveRendererAuth("remotion");
  if (auth.ok === false) return null;
  try {
    const r = await fetch(`${svcBase()}/render/${encodeURIComponent(jobId)}`, { method: "DELETE", headers: auth.headers, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) {
      if (r.status !== 404) console.warn(`[remotion] cancel ${jobId}: HTTP ${r.status}`);
      return null;
    }
    const body = (await r.json().catch(() => ({}))) as { status?: unknown };
    return typeof body.status === "string" ? body.status : null;
  } catch (e) {
    console.warn(`[remotion] cancel ${jobId} failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
