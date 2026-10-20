// Which account an outreach draft is billed to (ADR 017 §3, Codex 2026-10-19 round 3 F2): the lead's organization,
// through actorFor -- not the staff caller's own (internal) account.
import { beforeEach, describe, expect, it, vi } from "vitest";

const LEAD = { id: "00000000-0000-4000-8000-00000000001a", organization_id: "00000000-0000-4000-8000-0000000000c1", service_profile_id: null };
const m = vi.hoisted(() => ({
  grantFor: vi.fn(async (_feature: string, _ctx?: unknown) => ({ allowed: true })),
  actorFor: vi.fn(),
  claude: vi.fn(async () => ({ text: "draft", model: "m" })),
}));

vi.mock("@/lib/entitlements/grant", () => ({ grantFor: m.grantFor }));
vi.mock("@/lib/social/authz", () => ({ actorFor: m.actorFor }));
vi.mock("@/lib/outreach/ai-claude", () => ({ generateWithClaude: m.claude }));
vi.mock("@/lib/outreach/ai-openai", () => ({ generateWithOpenAI: vi.fn() }));
vi.mock("@/lib/outreach/ai-gemini", () => ({ generateWithGemini: vi.fn() }));
vi.mock("@/lib/secret-vault", () => ({ getSecret: async () => "key" }));
vi.mock("@/lib/outreach/cold-gate", () => ({ checkColdGate: () => ({ status: "pass", blockers: [] }), buildEvidenceSnapshot: () => ({}), lintMessage: () => [] }));
vi.mock("@/lib/org-client", () => {
  // Every query resolves: the lead for co_leads, a credentials ref for co_connector_accounts, an inserted row otherwise.
  const query = (table: string) => {
    const result = table === "co_leads" ? { data: LEAD, error: null }
      : table === "co_connector_accounts" ? { data: { credentials_ref: "ref" }, error: null } : { data: { id: "msg" }, error: null };
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "not", "limit", "insert", "update", "order"]) q[k] = () => q;
    q.maybeSingle = async () => result;
    q.single = async () => result;
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok);
    return q;
  };
  return { getOrgSupabaseWriteClient: async () => ({ from: query }) };
});

const { POST } = await import("./route");
const staff = () => new Request("http://app.test/api/outreach/messages", { method: "POST",
  headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": "owner", "x-ops-user-id": "u-1", "content-type": "application/json" },
  body: JSON.stringify({ leadId: LEAD.id }) });

beforeEach(() => { m.grantFor.mockClear(); m.actorFor.mockReset(); });

describe("POST /api/outreach/messages bills the lead's organization", () => {
  it("a caller with a role on the lead's org acts for it (acting carries that org)", async () => {
    const acting = { orgId: LEAD.organization_id, actor: "ops:owner:u-1" };
    m.actorFor.mockResolvedValue(acting);
    await POST(staff());
    expect(m.actorFor).toHaveBeenCalledWith(expect.any(Request), LEAD.organization_id);
    expect(m.grantFor).toHaveBeenCalledWith("outreach.draft", expect.objectContaining({ acting }));
  });

  it("without a role there the org is still named, so the gate answers not_authorized_for_org instead of billing internal", async () => {
    m.actorFor.mockRejectedValue(new Error("not_authorized_for_org"));
    await POST(staff());
    const ctx = m.grantFor.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(ctx).toMatchObject({ orgId: LEAD.organization_id });
    expect(ctx.acting).toBeUndefined();
  });
});
