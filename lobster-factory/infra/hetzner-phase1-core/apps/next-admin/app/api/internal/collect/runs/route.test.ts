// POST /api/internal/collect/runs (RESEARCH_LINES_MASTER_PLAN WC-P1-11, I-a/I-b).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const TOKEN = "runs-token-that-is-long-enough";
const PROJECT = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const originalFetch = global.fetch;
const originalEnv = { ...process.env };

function valid(overrides: Record<string, unknown> = {}) {
  return { grant_ref: "grantref-123", project_id: PROJECT, run_id: "run_1", seeds: [{ uri: "entity://Acme%20Ltd", meta: { entityKind: "organization" } }], ...overrides };
}

function req(body: unknown, auth: string | null = `Bearer ${TOKEN}`): Request {
  return new Request("http://localhost/api/internal/collect/runs", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.COLLECT_RESEARCH_RUNS_TOKEN = TOKEN;
  process.env.TRIGGER_API_URL = "https://trigger.example/";
  process.env.TRIGGER_ACCESS_TOKEN = "tr_prod_x";
  fetchSpy = vi.fn(async () => new Response(JSON.stringify({ id: "run_trig_1" }), { status: 200 }));
  global.fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
});

describe("POST /api/internal/collect/runs", () => {
  it("401 without or with a wrong bearer, and never calls Trigger", async () => {
    expect((await POST(req(valid(), null))).status).toBe(401);
    expect((await POST(req(valid(), "Bearer wrong"))).status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("401 when the token env is unset (fail closed)", async () => {
    delete process.env.COLLECT_RESEARCH_RUNS_TOKEN;
    expect((await POST(req(valid()))).status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("400 on 0 or 11 seeds, a plain-http seed, a malformed run id or non-JSON", async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ uri: `https://example.com/${i}` }));
    for (const body of [valid({ seeds: [] }), valid({ seeds: many }), valid({ seeds: [{ uri: "http://example.com" }] }), valid({ run_id: "has space" }), "{nope"]) {
      const res = await POST(req(body));
      expect(res.status).toBe(400);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("400 when the body carries a grant token or a Cognitive OS address (K3/K5)", async () => {
    for (const extra of [{ grant_token: "t" }, { cos_base_url: "https://evil.example" }]) {
      const res = await POST(req(valid(extra)));
      expect(res.status).toBe(400);
      expect((await res.json()).detail).toMatch(/^unexpected_keys:/);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("502 when Trigger refuses or is not configured", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    expect((await POST(req(valid()))).status).toBe(502);
    delete process.env.TRIGGER_API_URL;
    expect((await POST(req(valid()))).status).toBe(502);
  });

  it("202 and triggers collect-research-run with exactly the five request keys, budget defaulted", async () => {
    const res = await POST(req(valid()));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, trigger_run_id: "run_trig_1" });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://trigger.example/api/v1/tasks/collect-research-run/trigger");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tr_prod_x");
    const payload = JSON.parse(init.body as string).payload;
    expect(Object.keys(payload).sort()).toEqual(["budget", "grant_ref", "project_id", "run_id", "seeds"]);
    expect(payload.budget).toEqual({ fetches: 200 });
  });

  it("400 on a budget over the ceiling or an unknown seed key", async () => {
    expect((await POST(req(valid({ budget: { fetches: 201 } })))).status).toBe(400);
    expect((await POST(req(valid({ seeds: [{ uri: "https://example.com", scope: { hosts: ["x"] } }] })))).status).toBe(400);
  });
});
