// Gemini overloaded (503 / 429) on the default model -> one call to GEMINI_LITE_MODEL; any other error is not retried.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({ providerUrl: (_g: unknown, _p: string, path: string) => `https://provider.test${path}` }));
vi.mock("@/lib/ai/log-ai-call", () => ({ logAiCall: vi.fn(async () => {}), geminiUsageTokens: () => ({}) }));

const { generateWithGemini } = await import("../ai-gemini");
const { GEMINI_LITE_MODEL } = await import("@/lib/ai/gemini-models");

const ok = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "hi" }] } }] }), { status: 200 });
const fail = (status: number) => new Response("busy", { status });
const modelOf = (url: unknown) => String(url).match(/models\/([^:]+):/)?.[1];

afterEach(() => { vi.unstubAllGlobals(); });

describe("generateWithGemini fallback", () => {
  it.each([503, 429])("%s on the default model goes once to the lite model", async (status) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fail(status)).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateWithGemini({} as never, "k", "p", "gemini-flash-latest");
    expect(fetchMock.mock.calls.map((c) => modelOf(c[0]))).toEqual(["gemini-flash-latest", GEMINI_LITE_MODEL]);
    expect(r.model).toBe(GEMINI_LITE_MODEL);
  });

  it("another error (400) is not retried", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fail(400));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateWithGemini({} as never, "k", "p", "gemini-flash-latest")).rejects.toThrow("gemini 400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
