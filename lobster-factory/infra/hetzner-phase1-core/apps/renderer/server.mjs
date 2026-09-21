// lobster-renderer — one job: open a URL in a real browser, let its JavaScript run, hand back the
// resulting HTML. Nothing else. No extraction, no storage, no link discovery: next-admin's
// collect/extract-provider feeds the HTML through the SAME extractor, quality gate and relevance
// gate as every other page, so there is exactly one definition of "readable content" in the system.
//
// Why it exists (WORKLOG 2026-09-21 續95): background-research searches found the right pages —
// the subject's official academic profile, interviews, appointment notices — and the plain HTTP tier
// could read none of them (JavaScript shells, or 403 to a non-browser client). A local Chromium
// read 4 of the 10; Cloudflare's hosted browser read 2.
//
// Threat model, in one line: every page this opens is attacker-controlled. The browser runs as an
// unprivileged user with no capabilities, inside a network namespace whose OUTPUT policy
// (entrypoint.sh, applied before this process exists) only reaches the public internet. That policy
// is the boundary; the URL checks in lib.mjs are the legible first refusal in front of it.

import http from "node:http";
import { chromium } from "playwright-core";
import {
  Semaphore,
  clampTimeout,
  codeError,
  honestUserAgent,
  secretMatches,
  validateTargetUrl,
} from "./lib.mjs";

const PORT = Number(process.env.RENDERER_PORT || 3000);
const SECRET = process.env.RENDERER_SHARED_SECRET || "";
const MAX_CONCURRENCY = Number(process.env.RENDERER_MAX_CONCURRENCY || 2);
const MAX_QUEUE = Number(process.env.RENDERER_MAX_QUEUE || 20);
// Two limits, because the caller reads at most 5MB (next-admin lib/collect/net/providers.ts maxBytes)
// and cuts anything longer — an envelope cut mid-string is unparseable, not merely shorter. HTML
// grows when JSON-escaped (every quote and backslash doubles), so the RESPONSE is what is bounded;
// the HTML cap is only a cheap first cut before serialising (cross-model review, 2026-09-21).
const MAX_HTML_BYTES = Number(process.env.RENDERER_MAX_HTML_BYTES || 3_500_000);
const MAX_RESPONSE_BYTES = Number(process.env.RENDERER_MAX_RESPONSE_BYTES || 4_500_000);
const MAX_BODY_BYTES = 16_384;

if (!SECRET) {
  // Fail at boot, not at first request: a renderer that accepts anything from anyone on its network
  // is worse than one that is visibly down.
  console.error("renderer: RENDERER_SHARED_SECRET is required");
  process.exit(1);
}

const slots = new Semaphore(MAX_CONCURRENCY);
/** @type {Promise<{ browser: import("playwright-core").Browser, userAgent: string }> | null} */
let browserState = null;

/**
 * One long-lived browser, relaunched if it dies; contexts, not browsers, are the per-request unit.
 * The honest User-Agent is computed once per launch from the browser's own navigator.userAgent.
 */
async function getBrowser() {
  if (browserState) {
    const s = await browserState.catch(() => null);
    if (s && s.browser.isConnected()) return s;
  }
  browserState = (async () => {
    const browser = await chromium.launch({
      headless: true,
      // /dev/shm in a container is small; Chromium uses /tmp instead of crashing on big pages.
      args: ["--disable-dev-shm-usage"],
    });
    browser.on("disconnected", () => {
      browserState = null;
    });
    const probe = await browser.newContext();
    const page = await probe.newPage();
    const baseUa = await page.evaluate(() => navigator.userAgent).catch(() => "");
    await probe.close();
    return { browser, userAgent: honestUserAgent(baseUa) };
  })();
  return browserState;
}

/** Subresources: http(s) is re-checked per request; data:/blob: never touch the network; rest refused. */
function allowSubrequest(url) {
  if (url.startsWith("data:") || url.startsWith("blob:")) return true;
  try {
    validateTargetUrl(url);
    return true;
  } catch {
    return false;
  }
}

const SKIPPED_RESOURCE_TYPES = new Set(["image", "media", "font"]);

async function render(targetUrl, timeoutMs) {
  const started = Date.now();
  const { browser, userAgent } = await getBrowser();
  const context = await browser.newContext({
    userAgent,
    acceptDownloads: false,
    serviceWorkers: "block",
    viewport: { width: 1280, height: 900 },
  });
  // Hard deadline for the WHOLE render. goto has its own timeout, but page.content(), title() and a
  // hostile page's event loop do not — one page that never yields would hold a concurrency slot
  // forever and, after MAX_CONCURRENCY of them, the service would accept work it can never do.
  // Closing the context makes every pending operation on it reject, which unwinds into `finally`.
  let deadlineHit = false;
  const deadline = setTimeout(() => {
    deadlineHit = true;
    context.close().catch(() => {});
  }, timeoutMs + 15_000);
  try {
    await context.route("**/*", (route) => {
      const req = route.request();
      if (SKIPPED_RESOURCE_TYPES.has(req.resourceType())) return route.abort();
      return allowSubrequest(req.url()) ? route.continue() : route.abort("blockedbyclient");
    });

    const page = await context.newPage();
    let response;
    try {
      response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes("Download is starting")) throw codeError("download_not_page", 415);
      if (msg.includes("Timeout")) throw codeError("navigation_timeout", 504);
      if (msg.includes("ERR_BLOCKED_BY_CLIENT")) throw codeError("blocked_by_policy", 403);
      throw codeError(`navigation_failed:${msg.split("\n")[0].slice(0, 120)}`, 502);
    }
    // Best effort: many pages keep a socket open forever, so this is never allowed to fail a render.
    const remaining = Math.max(1_000, timeoutMs - (Date.now() - started));
    await page.waitForLoadState("networkidle", { timeout: Math.min(8_000, remaining) }).catch(() => {});

    let html = await page.content();
    let truncated = false;
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
      html = Buffer.from(html, "utf8").subarray(0, MAX_HTML_BYTES).toString("utf8");
      truncated = true;
    }
    const headers = response ? await response.allHeaders().catch(() => ({})) : {};
    return {
      ok: true,
      status: response ? response.status() : 0,
      finalUrl: page.url(),
      title: await page.title().catch(() => ""),
      contentType: headers["content-type"] || "text/html",
      html,
      truncated,
      ms: Date.now() - started,
    };
  } catch (e) {
    if (deadlineHit) throw codeError("render_deadline_exceeded", 504);
    throw e;
  } finally {
    clearTimeout(deadline);
    await context.close().catch(() => {});
  }
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(json) });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(codeError("body_too_large", 413));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    return send(res, 200, { ok: true, active: slots.active, pending: slots.pending });
  }
  if (req.method !== "POST" || req.url !== "/render") return send(res, 404, { ok: false, error: "not_found" });
  if (!secretMatches(req.headers["x-renderer-secret"], SECRET)) return send(res, 401, { ok: false, error: "unauthorized" });
  if (slots.pending >= MAX_QUEUE) return send(res, 503, { ok: false, error: "busy" });

  let targetUrl;
  let timeoutMs;
  try {
    const body = JSON.parse(await readBody(req));
    targetUrl = validateTargetUrl(body?.url).toString();
    timeoutMs = clampTimeout(body?.timeoutMs);
  } catch (e) {
    return send(res, e?.status || 400, { ok: false, error: e?.code || "bad_request" });
  }

  await slots.acquire();
  try {
    const result = await render(targetUrl, timeoutMs);
    console.log(`render ${result.status} ${result.ms}ms ${Buffer.byteLength(result.html)}B ${targetUrl}`);
    if (Buffer.byteLength(JSON.stringify(result)) > MAX_RESPONSE_BYTES) {
      // Reported as truncated with no body: the caller refuses a truncated render anyway (half a
      // document must never replace a whole one), so shipping 4MB of it would only cost transfer.
      return send(res, 200, { ...result, html: "", truncated: true });
    }
    return send(res, 200, result);
  } catch (e) {
    console.log(`render FAIL ${e?.code || e?.message} ${targetUrl}`);
    return send(res, e?.status || 502, { ok: false, error: e?.code || "render_failed" });
  } finally {
    slots.release();
  }
});

server.listen(PORT, "0.0.0.0", () => console.log(`renderer listening on :${PORT} (concurrency ${MAX_CONCURRENCY})`));

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, async () => {
    server.close();
    const s = await browserState?.catch(() => null);
    await s?.browser.close().catch(() => {});
    process.exit(0);
  });
}
