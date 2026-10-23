import { beforeEach, describe, expect, it, vi } from "vitest";

// The paid gate is replaced by one that refuses like a customer on the studio door (ops.cheap-json is back-office).
const m = vi.hoisted(() => ({ gate: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/entitlements/grant", () => ({
  withFeature: (key: string) => (req: Request) => m.gate(key, req),
}));
vi.mock("../../../../../lib/ai/cheap-json", () => ({ generateCheapJsonText: m.generate, extractJsonArray: (s: string) => s }));

import { POST } from "./route";

const req = (body: unknown) => new Request("http://localhost/api/tools/studio/culture", {
  method: "POST",
  headers: { "content-type": "application/json", "x-ops-claims-role": "operator" },
  body: JSON.stringify(body),
});

describe("POST /api/tools/studio/culture", () => {
  beforeEach(() => {
    m.gate.mockReset().mockResolvedValue(Response.json({ ok: false, code: "back_office_only" }, { status: 403 }));
    m.generate.mockReset();
  });

  it("a curated combo is served free without asking the paid gate", async () => {
    const res = await POST(req({ region: "Aboriginal Australian", lens: "animal" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, model: "curated" });
    expect(body.items.length).toBeGreaterThan(0);
    expect(m.gate).not.toHaveBeenCalled();
  });

  it("the live fallback goes through the paid gate, which a customer is refused", async () => {
    const res = await POST(req({ region: "Aboriginal Australian", lens: "animal", force: true }));
    expect(res.status).toBe(403);
    expect(m.gate).toHaveBeenCalledWith("ops.cheap-json", expect.any(Request));
    expect(m.generate).not.toHaveBeenCalled();
  });

  it("curatedOnly never reaches the paid gate", async () => {
    const res = await POST(req({ region: "Nowhere", lens: "animal", curatedOnly: true }));
    expect(await res.json()).toEqual({ ok: true, items: [], model: "none" });
    expect(m.gate).not.toHaveBeenCalled();
  });
});
