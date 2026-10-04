// POST /api/internal/collect/lookups (collect lookups v1). The lookups themselves are covered by
// lib/collect/__tests__/collect-lookups.test.ts; here: the bearer (fail closed), R2's 400s, and that the answer is
// exactly {kind, items}.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const answer = vi.hoisted(() => ({ answerLookup: vi.fn(), lookupDeps: vi.fn(() => ({})) }));
vi.mock("@/lib/collect/lookups/answer", () => answer);

const { POST } = await import("./route");

const TOKEN = "runs-token-long-enough-for-tests";
const original = process.env.COLLECT_RESEARCH_RUNS_TOKEN;

function req(body: unknown, auth: string | null = `Bearer ${TOKEN}`): Request {
  return new Request("http://localhost/api/internal/collect/lookups", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const describeBody = { project_id: "p-1", kind: "describe", items: [{ url: "https://example.com/a" }] };

beforeEach(() => {
  process.env.COLLECT_RESEARCH_RUNS_TOKEN = TOKEN;
  answer.answerLookup.mockReset();
  answer.answerLookup.mockImplementation(async (request: { kind: string; urls?: string[] }) => ({
    kind: request.kind,
    items: (request.urls ?? []).map((url) => ({ url, site: "example.com" })),
  }));
});

afterEach(() => {
  if (original === undefined) delete process.env.COLLECT_RESEARCH_RUNS_TOKEN;
  else process.env.COLLECT_RESEARCH_RUNS_TOKEN = original;
});

describe("POST /api/internal/collect/lookups", () => {
  it("401 without the bearer, with a wrong one, and when the token is not configured at all; nothing is looked up", async () => {
    expect((await POST(req(describeBody, null))).status).toBe(401);
    expect((await POST(req(describeBody, "Bearer nope"))).status).toBe(401);
    delete process.env.COLLECT_RESEARCH_RUNS_TOKEN;
    expect((await POST(req(describeBody))).status).toBe(401);
    expect(answer.answerLookup).not.toHaveBeenCalled();
  });

  it("400 for R2's reasons and a body that is not JSON; nothing is looked up", async () => {
    const bodies = [
      "{not json",
      { project_id: "p", kind: "whois", items: [] },
      { project_id: "p", kind: "describe", items: Array.from({ length: 26 }, (_, i) => ({ url: `https://s${i}.example/` })) },
      { project_id: "p", kind: "describe", items: [{ url: "file:///etc/passwd" }] },
      { project_id: "p", kind: "factcheck", items: [{ text: "字".repeat(4001) }] },
    ];
    for (const body of bodies) {
      const res = await POST(req(body));
      expect([JSON.stringify(body).slice(0, 40), res.status]).toEqual([JSON.stringify(body).slice(0, 40), 400]);
    }
    expect(answer.answerLookup).not.toHaveBeenCalled();
  });

  it("answers exactly {kind, items}, one item per request item", async () => {
    const res = await POST(req(describeBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: "describe", items: [{ url: "https://example.com/a", site: "example.com" }] });
    expect(answer.answerLookup).toHaveBeenCalledWith({ kind: "describe", projectId: "p-1", urls: ["https://example.com/a"] }, {});
  });
});
