// lib/cognitive-os/research.ts — the research-run wire to Cognitive OS (RESEARCH_LINES_MASTER_PLAN §12.7 I-d/I-e/I-f).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeRun, exchangeGrant, ingestSources } from "../research";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

beforeEach(() => {
  process.env.COLLECT_RESEARCH_RUNS_TOKEN = "runs-token";
  process.env.COGNITIVE_OS_API_BASE_URL = "http://cos.internal:8420/";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
});

describe("exchangeGrant", () => {
  it("refuses before any network call when the runs token is not configured", async () => {
    delete process.env.COLLECT_RESEARCH_RUNS_TOKEN;
    const spy = vi.fn();
    global.fetch = spy as unknown as typeof fetch;
    const r = await exchangeGrant("ref-1");
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("posts to the env base URL with the runs bearer and returns the grant", async () => {
    const spy = respond(200, { grant_token: "g", project_id: "p", run_id: "r", expires_at: "t" });
    global.fetch = spy as unknown as typeof fetch;
    const r = await exchangeGrant("ref/1");
    expect(r).toEqual({ ok: true, value: { grant_token: "g", project_id: "p", run_id: "r", expires_at: "t" } });
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://cos.internal:8420/collect-grants/ref%2F1/exchange");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer runs-token");
  });

  it("falls back to the internal docker hostname when the base URL env is unset", async () => {
    delete process.env.COGNITIVE_OS_API_BASE_URL;
    const spy = respond(200, {});
    global.fetch = spy as unknown as typeof fetch;
    await exchangeGrant("r");
    expect((spy.mock.calls[0] as unknown as [string])[0]).toBe("http://cognitive-os-api:8420/collect-grants/r/exchange");
  });

  it("surfaces COS's detail string and status on a refusal", async () => {
    global.fetch = respond(409, { detail: "GRANT_ALREADY_EXCHANGED" }) as unknown as typeof fetch;
    expect(await exchangeGrant("r")).toEqual({ ok: false, status: 409, error: "GRANT_ALREADY_EXCHANGED" });
  });

  it("reports an unreachable COS as status 0, never throws", async () => {
    global.fetch = vi.fn(async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    const r = await exchangeGrant("r");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.status).toBe(0);
  });
});

describe("ingestSources / completeRun", () => {
  it("ingest uses the Grant scheme and sends {run_id, sources}", async () => {
    const spy = respond(200, { results: [] });
    global.fetch = spy as unknown as typeof fetch;
    await ingestSources("p1", "run-1", "grant-tok", []);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://cos.internal:8420/projects/p1/sources/ingest");
    expect((init.headers as Record<string, string>).Authorization).toBe("Grant grant-tok");
    expect(JSON.parse(init.body as string)).toEqual({ run_id: "run-1", sources: [] });
  });

  it("complete sends status, report and a capped error", async () => {
    const spy = respond(200, { run_id: "run-1", status: "failed" });
    global.fetch = spy as unknown as typeof fetch;
    const report = { fetched: 1, written: 0, unchanged: 0, refused: 1, stopped_by: "frontier_empty" };
    await completeRun("p1", "run-1", "grant-tok", "failed", report, "e".repeat(500));
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://cos.internal:8420/projects/p1/collections/run-1/complete");
    const body = JSON.parse(init.body as string);
    expect(body.status).toBe("failed");
    expect(body.report).toEqual(report);
    expect(body.error).toHaveLength(200);
    expect(body).not.toHaveProperty("aside");
  });

  it("complete carries the wire v2 aside and channels when given", async () => {
    const spy = respond(200, { run_id: "run-1", status: "completed" });
    global.fetch = spy as unknown as typeof fetch;
    const report = { fetched: 1, written: 1, unchanged: 0, refused: 0, stopped_by: "frontier_empty" };
    const found = {
      aside: [{ url: "https://a.example/x", title: "x", reason: "這一頁已經不在了" }],
      channels: [{ provider: "serper", lang: "zh", state: "ok" as const, why: "" }],
    };
    await completeRun("p1", "run-1", "grant-tok", "completed", report, undefined, found);
    const body = JSON.parse((spy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ status: "completed", report, ...found });
  });
});
