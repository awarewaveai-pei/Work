// Codex 免費生圖 takes 1-2 minutes, longer than Cloudflare lets one request wait (~100 s). So a generate route that runs
// Codex answers 202 + X-Codex-Job at once (lib/tarot/codex-bridge.ts deferCodexWork) and this polls
// GET /api/tools/codex-laptop/jobs/<id> for the response that route would have sent. Every image fetch that can pick
// codex-image goes through fetchAwaitingCodex; any other answer passes through untouched.
// Plain ES module: loaded by the dock pages (public/*-dock) as well as imported by the app's TSX.

export const CODEX_JOB_HEADER = "X-Codex-Job";
export const CODEX_JOBS_URL = "/api/tools/codex-laptop/jobs/";
const POLL_MS = 3000;
// The server settles every job within its queue wait + lease + backstop (codex-bridge.ts CODEX_JOB_MS, 8.5 min).
const MAX_WAIT_MS = 12 * 60_000;

/**
 * fetch(url, init), but a 202 + X-Codex-Job answer is followed until the job's own response is ready, which is returned.
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {{ fetch?: typeof fetch, pollMs?: number, waitingText?: string, cancel?: boolean }} [opts] fetch/pollMs: tests
 *   only. waitingText: the status pill's words instead of the picture ones (a text job: 「筆電寫作中…」). cancel: when
 *   init.signal aborts while waiting, stop polling, DELETE the job on the server (its work is aborted) and throw AbortError.
 * @returns {Promise<Response>}
 */
export async function fetchAwaitingCodex(url, init, opts = {}) {
  const f = opts.fetch ?? ((u, i) => fetch(u, i));
  const pollMs = opts.pollMs ?? POLL_MS;
  const res = await f(url, init);
  const id = res.status === 202 ? res.headers.get(CODEX_JOB_HEADER) : null;
  if (!id) return res;
  const signal = opts.cancel ? init?.signal : undefined;
  const note = waitingNote(opts.waitingText);
  try {
    const headers = new Headers(init?.headers);
    headers.delete("Content-Type");
    const started = Date.now();
    for (let n = 0; Date.now() - started < MAX_WAIT_MS; n++) {
      // First look after 1 s: a laptop that is off (codex_worker_offline) is known at once.
      await new Promise((r) => setTimeout(r, n === 0 ? Math.min(1000, pollMs) : pollMs));
      if (signal?.aborted) {
        void Promise.resolve(f(CODEX_JOBS_URL + encodeURIComponent(id), { method: "DELETE", credentials: "same-origin", headers, cache: "no-store" })).catch(() => {});
        throw new DOMException("stopped", "AbortError");
      }
      note.tick(Math.round((Date.now() - started) / 1000));
      let r;
      try {
        r = await f(CODEX_JOBS_URL + encodeURIComponent(id), { method: "GET", credentials: "same-origin", headers, cache: "no-store" });
      } catch {
        continue; // a dropped poll is retried: the job keeps drawing on the server
      }
      // 202 = still drawing; 502-504 = the app restarting under us (the next poll then says codex_job_gone).
      if (r.status === 202 || (r.status >= 502 && r.status <= 504)) continue;
      return r;
    }
    return new Response(JSON.stringify({ ok: false, error: "Codex 等超過 12 分鐘仍沒有結果，請再按一次。", code: "codex_timeout" }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  } finally {
    note.done();
  }
}

/** A small status pill while a picture is drawn (every page that generates gets it, with no state of its own). */
function waitingNote(text) {
  if (typeof document === "undefined" || !document.body) return { tick() {}, done() {} };
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.dataset.codexWait = "";
  const stacked = document.querySelectorAll("[data-codex-wait]").length;
  el.style.cssText = `position:fixed;right:16px;bottom:${16 + stacked * 44}px;z-index:2147483000;padding:8px 14px;`
    + "border-radius:999px;font-size:13px;background:var(--card-bg, Canvas);color:var(--text-primary, CanvasText);"
    + "border:1px solid var(--card-border, GrayText);box-shadow:var(--shadow, none)";
  el.textContent = text ?? "Codex 繪製中…";
  document.body.appendChild(el);
  return {
    tick(s) { el.textContent = text ? `${text}（${s} 秒）` : `Codex 繪製中…（${s} 秒，通常 1–2 分鐘）`; },
    done() { el.remove(); },
  };
}
