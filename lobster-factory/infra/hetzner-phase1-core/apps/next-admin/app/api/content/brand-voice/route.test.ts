// The sample URL is fetched on the server, so it must never reach an internal host (step-8 card C-R5): it goes through
// collect's gated fetcher, which refuses before any connection is made.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/entitlements/grant", () => ({ withFeature: (_k: string, h: (r: Request) => Promise<Response>) => h }));
vi.mock("@/lib/ai/gateway", () => ({ CLAUDE_FAST_MODEL: "m", claudeParams: () => ({}), loadAnthropic: async () => { throw new Error("no AI call expected"); } }));
import { POST } from "./route";

const net = vi.fn(async () => new Response("<p>secret metadata</p>", { headers: { "content-type": "text/html" } }));
beforeEach(() => { vi.stubEnv("ANTHROPIC_API_KEY", "k"); vi.stubGlobal("fetch", net); net.mockClear(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const post = (url: string) => POST(new Request("https://content.aware-wave.com/api/content/brand-voice", {
  method: "POST", headers: { "content-type": "application/json", "x-ops-user-kind": "client", "x-ops-org-id": "11111111-1111-4111-8111-111111111111" },
  body: JSON.stringify({ url }),
}));

describe("POST /api/content/brand-voice sample URL", () => {
  it.each(["https://169.254.169.254/latest/meta-data", "https://127.0.0.1:8030/", "http://10.0.0.5/"])("never connects to %s", async (url) => {
    const res = await post(url);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("網址必須是公開的 https 網址");
    expect(net).not.toHaveBeenCalled();
  });

  it("a redirect with an unparseable Location is an unreadable page, not a 500", async () => {
    net.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://[" } }));
    const res = await post("https://93.184.216.34/about");   // a literal public address: no DNS in the test
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("網址讀取失敗");
  });
});
