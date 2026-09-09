/**
 * remotion-client.ts — HTTP wrapper for EU remotion-service (Node, port 8733).
 * No render logic here; only HTTP transport + error normalisation.
 */
import { resolveRendererAuth } from "./renderer-auth";

const svcBase = () => process.env.REMOTION_SERVICE_URL ?? "http://127.0.0.1:8733";

export interface RemotionRenderOptions {
  readonly outputFormat?: "9x16" | "4x5" | "16x9" | "1x1";
  readonly fps?: 24 | 25 | 30 | 60;
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
    return { status: "rendering" };
  } catch {
    return { status: "rendering" }; // transient network error — caller retries
  }
}
