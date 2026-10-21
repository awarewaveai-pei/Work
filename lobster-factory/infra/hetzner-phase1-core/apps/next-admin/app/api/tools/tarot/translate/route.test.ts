import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ create: vi.fn(), loadAnthropic: vi.fn() }));
vi.mock("@/lib/entitlements/grant", () => ({
  withFeature: (_key: string, handler: (req: Request, grant: unknown) => Promise<Response>) => (req: Request) => handler(req, {}),
}));
vi.mock("@/lib/ai/gateway", () => ({ loadAnthropic: m.loadAnthropic }));
vi.mock("../../../../../lib/ai/log-ai-call", () => ({ logAiCall: vi.fn() }));

import { POST } from "./route";

const OP = { "x-ops-claims-role": "operator" };
const req = (body: unknown, headers: Record<string, string> = OP) =>
  new Request("http://localhost/api/tools/tarot/translate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("POST /api/tools/tarot/translate", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    m.create.mockReset().mockResolvedValue({ content: [{ type: "text", text: "a fluffy orange cat" }] });
    m.loadAnthropic.mockReset().mockResolvedValue(function Anthropic() { return { messages: { create: m.create } }; });
  });

  it("English input makes no AI call", async () => {
    const res = await POST(req({ text: "a fluffy orange cat" }));
    expect(await res.json()).toEqual({ ok: true, english: "a fluffy orange cat", translated: false });
    expect(m.loadAnthropic).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it("refuses a viewer before any AI call", async () => {
    const res = await POST(req({ text: "一隻橘色的貓" }, {}));
    expect(res.status).toBe(403);
    expect(m.create).not.toHaveBeenCalled();
  });
});
