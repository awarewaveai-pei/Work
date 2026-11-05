// The Gemini branch of generateCheapJsonText (operator 2026-11-05: outreach's JSON steps on the free key): a 429 waits
// the delay Google names and asks again, so the free tier's per-minute limit slows a burst instead of failing it.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../log-ai-call", async (orig) => ({ ...(await orig<typeof import("../log-ai-call")>()), logAiCall: async () => {} }));
vi.mock("@/lib/ai/gateway", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/gateway")>()), providerUrl: (_g: unknown, _p: string, path: string) => `https://gemini.test${path}` }));

const { generateCheapJsonText, geminiRetryMs } = await import("../cheap-json");
const { GEMINI_LITE_MODEL } = await import("../gemini-models");

const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: {} }), { status: 200 });
const limited = () => new Response(JSON.stringify({ error: { code: 429, details: [{ retryDelay: "7s" }] } }), { status: 429 });

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); delete process.env.GEMINI_API_KEY; });

describe("generateCheapJsonText on Gemini", () => {
  it("a 429 waits the named delay and asks again; the answer comes back as raw JSON text", async () => {
    vi.useFakeTimers();
    process.env.GEMINI_API_KEY = "g-test";
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => { calls.push(url); return calls.length === 1 ? limited() : ok('{"a":1}'); });
    const p = generateCheapJsonText({ route: "t", system: "s", user: "u", maxTokens: 10, model: GEMINI_LITE_MODEL, grant: {} as never });
    await vi.advanceTimersByTimeAsync(7_000);
    expect(await p).toEqual({ ok: true, raw: '{"a":1}', model: GEMINI_LITE_MODEL });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain(`/models/${GEMINI_LITE_MODEL}:generateContent`);
  });

  it("a 503 overloaded is retried the same way", async () => {
    vi.useFakeTimers();
    process.env.GEMINI_API_KEY = "g-test";
    let n = 0;
    vi.stubGlobal("fetch", async () => (++n === 1 ? new Response("{}", { status: 503 }) : ok("[]")));
    const p = generateCheapJsonText({ route: "t", system: "s", user: "u", maxTokens: 10, model: GEMINI_LITE_MODEL, grant: {} as never });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await p).toMatchObject({ ok: true, raw: "[]" });
    expect(n).toBe(2);
  });

  it("no key is a 503, not a call", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("must not be called"); });
    expect(await generateCheapJsonText({ route: "t", system: "s", user: "u", maxTokens: 10, model: GEMINI_LITE_MODEL, grant: {} as never }))
      .toMatchObject({ ok: false, status: 503 });
  });

  it("the delay is read from RetryInfo; over a minute is the daily cap, not a wait", () => {
    expect(geminiRetryMs('{"retryDelay": "23s"}')).toBe(23_000);
    expect(geminiRetryMs('{"retryDelay":"0.5s"}')).toBe(5_000);
    expect(geminiRetryMs('{"retryDelay":"35336s"}')).toBeNull();
    expect(geminiRetryMs("")).toBe(20_000);
  });

  it("the daily cap answers at once, without waiting or asking again", async () => {
    process.env.GEMINI_API_KEY = "g-test";
    let n = 0;
    vi.stubGlobal("fetch", async () => { n++; return new Response(JSON.stringify({ error: { code: 429, details: [{ retryDelay: "35336s" }] } }), { status: 429 }); });
    expect(await generateCheapJsonText({ route: "t", system: "s", user: "u", maxTokens: 10, model: GEMINI_LITE_MODEL, grant: {} as never }))
      .toEqual({ ok: false, status: 502, error: "gemini_429_daily_quota" });
    expect(n).toBe(1);
  });
});
