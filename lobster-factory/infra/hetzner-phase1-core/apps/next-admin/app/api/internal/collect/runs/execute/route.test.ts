// POST /api/internal/collect/runs/execute (RESEARCH_LINES_MASTER_PLAN WC-P1-12, I-c/I-d/I-f).
// The crawl is mocked; the wire to Cognitive OS is real code against a stubbed fetch.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runMod = vi.hoisted(() => ({ runResearchCollection: vi.fn() }));
vi.mock("@/lib/collect/run", () => runMod);

const { POST } = await import("./route");

const EXEC_TOKEN = "execute-token-long-enough";
const PROJECT = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const GRANT_TOKEN = "grant-token-secret-value";
const originalFetch = global.fetch;
const originalEnv = { ...process.env };

const body = { grant_ref: "grantref-123", project_id: PROJECT, run_id: "run_1", seeds: [{ uri: "https://example.com/" }] };

function req(payload: unknown = body, auth = `Bearer ${EXEC_TOKEN}`): Request {
  return new Request("http://localhost/api/internal/collect/runs/execute", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: auth },
    body: JSON.stringify(payload),
  });
}

function crawlResult(errors: string[] = []) {
  return {
    report: {
      fetched: 3, dirty: [{}], quarantined: [], disallowed: [], offEntity: [{}], stoppedBy: "frontier_empty",
      aside: [{ url: "https://example.com/gone", title: "Gone", reason: "gone" }],
      channels: [{ provider: "brave", lang: "en", state: "no_key", why: "no_key" }],
    },
    sink: { written: 2, skipped: 1, errors },
  };
}

let calls: Array<{ url: string; init: RequestInit }>;
let exchangeReply: { status: number; body: unknown };

beforeEach(() => {
  process.env.COLLECT_RESEARCH_EXECUTE_TOKEN = EXEC_TOKEN;
  process.env.COLLECT_RESEARCH_RUNS_TOKEN = "runs-token";
  process.env.COGNITIVE_OS_API_BASE_URL = "http://cos.internal:8420";
  calls = [];
  exchangeReply = { status: 200, body: { grant_token: GRANT_TOKEN, project_id: PROJECT, run_id: "run_1", expires_at: "t" } };
  global.fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith("/exchange")) return new Response(JSON.stringify(exchangeReply.body), { status: exchangeReply.status });
    return new Response(JSON.stringify({ run_id: "run_1", status: "x" }), { status: 200 });
  }) as unknown as typeof fetch;
  runMod.runResearchCollection.mockReset();
  runMod.runResearchCollection.mockResolvedValue(crawlResult());
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
});

const completes = () => calls.filter((c) => c.url.endsWith("/complete"));

describe("POST /api/internal/collect/runs/execute", () => {
  it("401 on a wrong bearer, with no call to Cognitive OS", async () => {
    expect((await POST(req(body, "Bearer nope"))).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("502 when the exchange is refused: no crawl, no completion", async () => {
    exchangeReply = { status: 409, body: { detail: "GRANT_ALREADY_EXCHANGED" } };
    const res = await POST(req());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("grant_exchange_409");
    expect(runMod.runResearchCollection).not.toHaveBeenCalled();
    expect(completes()).toHaveLength(0);
  });

  it("502 when the grant belongs to another project or run: never crawls into it", async () => {
    exchangeReply = { status: 200, body: { grant_token: GRANT_TOKEN, project_id: "11111111-1111-4111-8111-111111111111", run_id: "run_1", expires_at: "t" } };
    expect((await POST(req())).status).toBe(502);
    expect(runMod.runResearchCollection).not.toHaveBeenCalled();
  });

  it("exchanges, crawls and completes once each, reporting completed with the crawl's numbers", async () => {
    const res = await POST(req());
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, status: "completed", report: { fetched: 3, written: 2, unchanged: 1, refused: 2, stopped_by: "frontier_empty" } });
    expect(calls.map((c) => c.url)).toEqual([
      "http://cos.internal:8420/collect-grants/grantref-123/exchange",
      `http://cos.internal:8420/projects/${PROJECT}/collections/run_1/complete`,
    ]);
    expect((completes()[0].init.headers as Record<string, string>).Authorization).toBe(`Grant ${GRANT_TOKEN}`);
    expect(JSON.parse(completes()[0].init.body as string).status).toBe("completed");
    expect(runMod.runResearchCollection).toHaveBeenCalledTimes(1);
  });

  it("the completion carries the pages set aside and the search channels, worded for the person (wire v2)", async () => {
    await POST(req());
    const sent = JSON.parse(completes()[0].init.body as string);
    expect(sent.aside).toEqual([{ url: "https://example.com/gone", title: "Gone", reason: "這一頁已經不在了" }]);
    expect(sent.channels).toEqual([{ provider: "brave", lang: "en", state: "no_key", why: "平台還沒有這個搜尋引擎的金鑰" }]);
  });

  it("still completes, as failed, when the crawl throws", async () => {
    runMod.runResearchCollection.mockRejectedValue(new Error("renderer exploded"));
    const json = await (await POST(req())).json();
    expect(json.status).toBe("failed");
    expect(completes()).toHaveLength(1);
    expect(JSON.parse(completes()[0].init.body as string)).toMatchObject({ status: "failed", error: expect.stringContaining("renderer exploded"), aside: [], channels: [] });
  });

  it("reports failed when Cognitive OS refused the grant mid-run", async () => {
    runMod.runResearchCollection.mockResolvedValue(crawlResult(["ingest_401:GRANT_INVALID"]));
    const json = await (await POST(req())).json();
    expect(json.status).toBe("failed");
    expect(JSON.parse(completes()[0].init.body as string).status).toBe("failed");
  });

  it("reports failed when an ingest batch was refused or unreachable for any reason (Codex review F1)", async () => {
    for (const err of ["ingest_500:boom", "ingest_0:cognitive_os_unreachable"]) {
      runMod.runResearchCollection.mockResolvedValue(crawlResult([err]));
      const json = await (await POST(req())).json();
      expect(json.status).toBe("failed");
      expect(JSON.parse(completes().at(-1)!.init.body as string)).toMatchObject({ status: "failed", error: err });
    }
  });

  it("a skipped empty or oversized document alone does not fail the run", async () => {
    runMod.runResearchCollection.mockResolvedValue(crawlResult(["too_large_or_empty:https://example.com/x"]));
    expect((await (await POST(req())).json()).status).toBe("completed");
  });

  it("never returns the grant token, and refuses a body that names a Cognitive OS address", async () => {
    const text = await (await POST(req())).text();
    expect(text).not.toContain(GRANT_TOKEN);
    expect((await POST(req({ ...body, cos_base_url: "https://evil.example" }))).status).toBe(400);
  });
});
