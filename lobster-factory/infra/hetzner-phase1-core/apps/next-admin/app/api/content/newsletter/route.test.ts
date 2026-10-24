// T18: the newsletter write goes through bridgePost (gated there). A gate block must answer 423 with the
// mode; any other bridge failure stays 502.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { blockedChangeBody } from "@/lib/system-modes/blocked-change";

vi.mock("@/lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "owner" }), canCreateAiImageJob: () => true }));

const createNewsletter = vi.hoisted(() =>
  vi.fn(async (): Promise<{ ok: boolean; error?: string; blockedMode?: string; value?: unknown }> => ({
    ok: true,
    value: { campaign_id: 1, campaign_status: "draft", edit_url: "u" },
  })),
);
vi.mock("@/lib/crm/fluentcrm", () => ({
  isBridgeConfigured: () => true,
  createNewsletter,
}));

const { POST } = await import("./route");

const post = () =>
  POST(new Request("http://localhost/api/content/newsletter", { method: "POST", body: JSON.stringify({ subject: "S", markdown: "# T\n\nbody" }) }));

beforeEach(() => createNewsletter.mockClear());

describe("POST /api/content/newsletter -- bridge gate result", () => {
  it("bridge blocked by the system mode: 423 with the mode", async () => {
    createNewsletter.mockResolvedValueOnce({ ok: false, error: "system_mode_blocks_change", blockedMode: "maintenance" });
    const res = await post();
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual(blockedChangeBody("maintenance"));
  });

  it("other bridge failure: 502", async () => {
    createNewsletter.mockResolvedValueOnce({ ok: false, error: "fluentcrm_not_active" });
    const res = await post();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "fluentcrm_not_active" });
  });

  it("a plugin reason that happens to equal the block string is still 502: only blockedMode means blocked", async () => {
    createNewsletter.mockResolvedValueOnce({ ok: false, error: "system_mode_blocks_change" });
    expect((await post()).status).toBe(502);
  });

  it("allowed: 201", async () => {
    expect((await post()).status).toBe(201);
  });
});

// The bridge is our own FluentCRM, not the customer's (step-8 card C-R4).
describe("POST /api/content/newsletter -- customer", () => {
  it("403 before anything reaches the bridge", async () => {
    const res = await POST(new Request("http://localhost/api/content/newsletter", { method: "POST",
      headers: { "x-ops-user-kind": "client", "x-ops-org-id": "11111111-1111-4111-8111-111111111111" },
      body: JSON.stringify({ subject: "S", markdown: "# T\n\nbody" }) }));
    expect(res.status).toBe(403);
    expect(createNewsletter).not.toHaveBeenCalled();
  });
});
