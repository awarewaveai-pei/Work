import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postResearchRunExecute, type ResearchRunPayload } from "./postResearchRunExecute";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

const payload: ResearchRunPayload = {
  grant_ref: "grantref-123",
  project_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  run_id: "run_1",
  seeds: [{ uri: "entity://Acme", meta: { entityKind: "organization" } }],
  budget: { fetches: 50 },
};

beforeEach(() => {
  process.env.COLLECT_RESEARCH_EXECUTE_TOKEN = "exec-token";
  process.env.AWAREWAVE_WEBHOOK_BASE_URL = "https://app.aware-wave.com/";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
});

describe("postResearchRunExecute", () => {
  it("throws before ever calling fetch when the token is not configured", async () => {
    delete process.env.COLLECT_RESEARCH_EXECUTE_TOKEN;
    const spy = vi.fn();
    global.fetch = spy as unknown as typeof fetch;
    await expect(postResearchRunExecute(payload)).rejects.toThrow(/COLLECT_RESEARCH_EXECUTE_TOKEN/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("posts to runs/execute with the execute bearer", async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ ok: true, status: "completed", report: {} }), { status: 200 }));
    global.fetch = spy as unknown as typeof fetch;
    await postResearchRunExecute(payload);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.aware-wave.com/api/internal/collect/runs/execute");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer exec-token");
  });

  it("sends the payload unchanged (a grant reference, never a token)", async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ ok: true, status: "completed", report: {} }), { status: 200 }));
    global.fetch = spy as unknown as typeof fetch;
    await postResearchRunExecute(payload);
    const init = (spy.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it("throws with the status on a non-2xx answer, so the Trigger run shows as failed", async () => {
    global.fetch = vi.fn(async () => new Response("grant_exchange_409", { status: 502 })) as unknown as typeof fetch;
    await expect(postResearchRunExecute(payload)).rejects.toThrow(/502/);
  });
});
