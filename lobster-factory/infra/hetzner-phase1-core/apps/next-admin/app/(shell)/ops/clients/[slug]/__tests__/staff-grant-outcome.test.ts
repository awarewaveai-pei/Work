import { beforeEach, describe, expect, it, vi } from "vitest";

const giveProduct = vi.fn();
const takeProduct = vi.fn();
const resolveSubject = vi.fn();
vi.mock("@/lib/entitlements/staff-grants", async (orig) => ({ ...(await orig<object>()), giveProduct, takeProduct }));
vi.mock("@/lib/entitlements/subject", async (orig) => ({ ...(await orig<object>()), resolveSubject }));

const { staffGrantOutcome } = await import("../staff-grant-outcome");

const ACCOUNT = "00000000-0000-4000-8000-0000000000c1";
const GIFT = "staff:11111111-2222-4333-8444-555555555555";
const staff = (role: string, tools?: string) => new Headers({ "x-ops-user-kind": "staff", "x-ops-claims-role": role, ...(tools === undefined ? {} : { "x-ops-tools": tools }) });
function form(fields: Record<string, string>) {
  const f = new FormData();
  f.set("slug", "acme");
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeEach(() => {
  giveProduct.mockReset().mockResolvedValue("given");
  takeProduct.mockReset().mockResolvedValue("taken");
  resolveSubject.mockReset().mockResolvedValue({ orgId: ACCOUNT, kind: "customer" });
});

describe("給／收產品 guard (ADR 017 4b-10)", () => {
  it("refuses anyone but owner or admin and writes nothing", async () => {
    for (const role of ["operator", "viewer"]) {
      const q = await staffGrantOutcome(form({ "was:use:social": "0", "use:social": "on", note: "試用" }), staff(role));
      expect(q.get("r")).toBe("forbidden");
    }
    const client = await staffGrantOutcome(form({ "was:use:social": "0", "use:social": "on", note: "x" }),
      new Headers({ "x-ops-user-kind": "client", "x-ops-claims-role": "owner" }));
    expect(client.get("r")).toBe("forbidden");
    expect(giveProduct).not.toHaveBeenCalled();
    expect(takeProduct).not.toHaveBeenCalled();
  });

  it("refuses an admin whose ticked tools do not include 帳務", async () => {
    const q = await staffGrantOutcome(form({ "was:use:social": "0", "use:social": "on", note: "x" }), staff("admin", "ops/clients"));
    expect(q.get("r")).toBe("forbidden");
    expect(giveProduct).not.toHaveBeenCalled();
  });

  it("an owner's tick gives, an untick takes back, on the billing account, with the actor and note", async () => {
    const q = await staffGrantOutcome(form({ "was:use:social": "0", "use:social": "on", "was:use:video": GIFT, note: " 代操試用 " }),
      staff("owner"));
    expect(q.get("r")).toBe("saved");
    expect([q.get("g"), q.get("t")]).toEqual(["1", "1"]);
    expect(giveProduct).toHaveBeenCalledWith(expect.objectContaining({ accountId: ACCOUNT, productKey: "social", kind: "use", actorRole: "owner", note: "代操試用" }));
    expect(takeProduct).toHaveBeenCalledWith(expect.objectContaining({ accountId: ACCOUNT, productKey: "video", kind: "use", sourceRefs: [GIFT] }));
    expect(giveProduct.mock.calls[0][0].actor).toMatch(/^ops:owner/);
  });

  it("the seller licence and the product are separate boxes: changing one never writes the other", async () => {
    await staffGrantOutcome(form({ "was:use:social": GIFT, "use:social": "on", "was:resell:social": "0", "resell:social": "on", note: "代理" }), staff("admin"));
    expect(giveProduct).toHaveBeenCalledTimes(1);
    expect(giveProduct).toHaveBeenCalledWith(expect.objectContaining({ productKey: "social", kind: "resell" }));
    expect(takeProduct).not.toHaveBeenCalled();
    giveProduct.mockClear();
    await staffGrantOutcome(form({ "was:use:social": GIFT, "was:resell:social": GIFT, "resell:social": "on", note: "停用" }), staff("admin"));
    expect(takeProduct).toHaveBeenCalledTimes(1);
    expect(takeProduct).toHaveBeenCalledWith(expect.objectContaining({ productKey: "social", kind: "use" }));
    expect(giveProduct).not.toHaveBeenCalled();
  });

  it("only boxes the page showed are read: a box without its was field, or a malformed one, is never taken as unticked", async () => {
    const q = await staffGrantOutcome(form({ note: "x" }), staff("owner"));
    expect(q.get("r")).toBe("nothing_changed");
    for (const was of ["1", "staff:%", `${GIFT},sub-1`]) {
      expect((await staffGrantOutcome(form({ "was:use:social": was, note: "x" }), staff("owner"))).get("r")).toBe("nothing_changed");
    }
    expect(takeProduct).not.toHaveBeenCalled();
  });

  it("needs a reason, and never writes on the internal account", async () => {
    expect((await staffGrantOutcome(form({ "was:use:social": "0", "use:social": "on" }), staff("owner"))).get("r")).toBe("note_required");
    resolveSubject.mockResolvedValue({ orgId: "internal", kind: "internal" });
    expect((await staffGrantOutcome(form({ "was:use:social": "0", "use:social": "on", note: "x" }), staff("owner"))).get("r")).toBe("internal_account");
    expect(giveProduct).not.toHaveBeenCalled();
  });

  it("a take someone else already did is counted as skipped, not as an error", async () => {
    takeProduct.mockResolvedValueOnce("nothing_to_take");
    const q = await staffGrantOutcome(form({ "was:use:social": GIFT, note: "x" }), staff("owner"));
    expect([q.get("r"), q.get("t"), q.get("s")]).toEqual(["saved", "0", "1"]);
  });

  it("stops at the first refusal and names the product", async () => {
    giveProduct.mockResolvedValueOnce("all_features_account");
    const q = await staffGrantOutcome(form({ "was:use:social": "0", "use:social": "on", "was:use:video": "0", "use:video": "on", note: "x" }), staff("owner"));
    expect([q.get("r"), q.get("p"), q.get("g")]).toEqual(["all_features_account", "social", "0"]);
    expect(giveProduct).toHaveBeenCalledTimes(1);
  });
});
