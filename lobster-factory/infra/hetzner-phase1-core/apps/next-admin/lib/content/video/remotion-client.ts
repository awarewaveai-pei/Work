/**
 * remotion-client.ts — HTTP wrapper for EU remotion-service (Node, port 8733).
 * No render logic here; only HTTP transport + error normalisation.
 */

const svcBase = () => process.env.REMOTION_SERVICE_URL ?? "http://127.0.0.1:8733";

const authHeaders = (): Record<string, string> => {
  const token = process.env.REMOTION_AUTH_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** POST /render → remotion service job ID (not the job-store UUID). */
export async function submitRemotion(
  templateId: string,
  props: Record<string, unknown>,
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  try {
    const r = await fetch(`${svcBase()}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ templateId, props }),
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
  try {
    const r = await fetch(`${svcBase()}/status/${encodeURIComponent(jobId)}`, {
      headers: authHeaders(),
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
