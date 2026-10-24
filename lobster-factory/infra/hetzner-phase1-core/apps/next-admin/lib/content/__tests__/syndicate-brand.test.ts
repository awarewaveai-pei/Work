import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ create: vi.fn(), row: { data: null as unknown, error: null as { message: string } | null } }));
vi.mock("@/lib/ai/gateway", () => ({
  CLAUDE_FAST_MODEL: "claude-haiku",
  claudeParams: () => ({ model: "claude-haiku", max_tokens: 2000 }),
  loadAnthropic: async () => function Anthropic() { return { messages: { create: m.create } }; },
}));
vi.mock("@/lib/ai/log-ai-call", () => ({ logAiCall: vi.fn() }));
vi.mock("@/lib/ai/cost-calculator", () => ({ resolveTextRate: () => ({ rate: { vendor: "anthropic" } }), textCallCostUsd: () => 0 }));
vi.mock("@/lib/supabase-server", () => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => m.row };
  return { getSupabaseWriteClient: () => ({ from: () => q }) };
});

import { syndicateHandler } from "../syndicate";

const POST = syndicateHandler("/api/social/rewrite");
const STAFF = { "x-ops-claims-role": "operator", "x-ops-user-kind": "staff" };
const CLIENT_B = { "x-ops-user-kind": "client", "x-ops-org-id": "org-b" };
const req = (body: Record<string, unknown>, headers: Record<string, string> = STAFF) =>
  new Request("http://localhost/api/social/rewrite", {
    method: "POST", headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ article: "文章內容", platforms: ["facebook"], ...body }),
  });
const prompt = () => m.create.mock.calls[0][0].messages[0].content as string;

describe("syndicate reads the site's stored brand voice", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    m.create.mockReset().mockResolvedValue({
      model: "claude-haiku", usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: "text", text: '{"facebook":"貼文"}' }],
    });
    m.row = {
      data: { id: "s1", name: "Soulful", organization_id: "org-a",
        content_defaults: { tone: "溫暖", brandVoiceInstructions: "不說教", marketing: { forbiddenClaims: "保證治癒" } } },
      error: null,
    };
  });

  it("without a site the prompt carries no brand block", async () => {
    expect((await POST(req({}), {} as never)).status).toBe(200);
    expect(prompt()).not.toContain("Brand voice");
  });

  it("with the site the prompt carries its brief, instructions and tone", async () => {
    expect((await POST(req({ siteId: "s1" }), {} as never)).status).toBe(200);
    expect(prompt()).toContain("Brand voice (follow it in every post; never use a forbidden claim):");
    expect(prompt()).toContain("避免使用/禁用聲明: 保證治癒");
    expect(prompt()).toContain("不說教");
    expect(prompt()).toContain("語氣: 溫暖");
  });

  it("a client of another organization gets 404 and no AI call", async () => {
    expect((await POST(req({ siteId: "s1" }, CLIENT_B), {} as never)).status).toBe(404);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("an unknown site is the same 404", async () => {
    m.row = { data: null, error: null };
    expect((await POST(req({ siteId: "nope" }), {} as never)).status).toBe(404);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("a database error is a 500, not a post without the brand", async () => {
    m.row = { data: null, error: { message: "down: relation wp_sites" } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req({ siteId: "s1" }), {} as never);
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("brand voice lookup failed");   // the database's own message stays in the log
    expect(m.create).not.toHaveBeenCalled();
  });
});
