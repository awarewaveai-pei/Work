import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postSiteWatchCleanup, postSiteWatchDue, postSiteWatchRun, siteWatchConfigured } from "./post";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.SITE_WATCH_INGEST_TOKEN = "sw-token";
  process.env.AWAREWAVE_WEBHOOK_BASE_URL = "https://app.aware-wave.com/";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
});

function fetchReturning(status: number, body: unknown) {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
}

describe("site-watch posts", () => {
  it("siteWatchConfigured: only a non-blank dedicated token counts (the heartbeat skips otherwise)", () => {
    expect(siteWatchConfigured()).toBe(true);
    process.env.SITE_WATCH_INGEST_TOKEN = "   ";
    expect(siteWatchConfigured()).toBe(false);
    delete process.env.SITE_WATCH_INGEST_TOKEN;
    process.env.SCHEDULE_INGEST_TOKEN = "schedule-token";
    expect(siteWatchConfigured()).toBe(false);
  });

  it("throws before calling fetch when the token is missing — never falls back to another token", async () => {
    delete process.env.SITE_WATCH_INGEST_TOKEN;
    process.env.SCHEDULE_INGEST_TOKEN = "schedule-token";
    process.env.OPS_INBOX_INGEST_TOKEN = "ops-token";
    const spy = vi.fn();
    global.fetch = spy as unknown as typeof fetch;
    await expect(postSiteWatchDue()).rejects.toThrow(/SITE_WATCH_INGEST_TOKEN/);
    await expect(postSiteWatchRun("t")).rejects.toThrow(/SITE_WATCH_INGEST_TOKEN/);
    await expect(postSiteWatchCleanup()).rejects.toThrow(/SITE_WATCH_INGEST_TOKEN/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("due: POSTs with the dedicated bearer to the base URL (trailing slash stripped) and a timeout", async () => {
    const spy = fetchReturning(200, { ok: true, enabled: true, synced: 0, targets: ["a"] });
    global.fetch = spy as unknown as typeof fetch;
    await expect(postSiteWatchDue()).resolves.toEqual({ ok: true, enabled: true, synced: 0, targets: ["a"] });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("https://app.aware-wave.com/api/internal/site-watch/due");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sw-token");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("run: one target per call, id URL-encoded into the path", async () => {
    const spy = fetchReturning(200, { ok: true, result: { targetId: "x", status: "ran", pages: [], notifications: [] } });
    global.fetch = spy as unknown as typeof fetch;
    await postSiteWatchRun("11111111-2222-3333-4444-555555555555");
    expect(spy.mock.calls[0][0]).toBe("https://app.aware-wave.com/api/internal/site-watch/run/11111111-2222-3333-4444-555555555555");
    await postSiteWatchRun("../due");
    expect(spy.mock.calls[1][0]).toBe("https://app.aware-wave.com/api/internal/site-watch/run/..%2Fdue");
  });

  it("cleanup: POSTs to /cleanup", async () => {
    const spy = fetchReturning(200, { ok: true, result: { claimed: false, purgedRows: 0, deletedObjects: 0, failedDeletes: 0, skippedObjects: null } });
    global.fetch = spy as unknown as typeof fetch;
    await postSiteWatchCleanup();
    expect(spy.mock.calls[0][0]).toBe("https://app.aware-wave.com/api/internal/site-watch/cleanup");
  });

  it("non-2xx throws with status and body instead of being swallowed", async () => {
    global.fetch = fetchReturning(401, "unauthorized") as unknown as typeof fetch;
    await expect(postSiteWatchDue()).rejects.toThrow(/\/due 401: unauthorized/);
    global.fetch = fetchReturning(503, { ok: false, error: "db_unavailable" }) as unknown as typeof fetch;
    await expect(postSiteWatchRun("t")).rejects.toThrow(/503/);
  });
});
