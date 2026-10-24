import { describe, expect, it, vi } from "vitest";
import { doorAccess } from "../door-access";

const h = (kind?: string, org?: string) => new Headers({ ...(kind ? { "x-ops-user-kind": kind } : {}), ...(org ? { "x-ops-org-id": org } : {}) });
const store = (held: boolean | Error) => vi.fn(async () => { if (held instanceof Error) throw held; return held; });

describe("doorAccess -- every feature is bought separately or given by us", () => {
  it("a customer whose account holds no row of the product does not enter", async () => {
    expect(await doorAccess(h("client", "org-1"), "video", store(false))).toBe("not_held");
  });

  it("a customer holding the product enters; the lookup asks for that org and product", async () => {
    const s = store(true);
    expect(await doorAccess(h("client", "org-1"), "design", s, 100)).toBe("open");
    expect(s).toHaveBeenCalledWith({ organizationId: "org-1", productKey: "design", now: 100 });
  });

  it("a customer with no organization does not enter, and a failed lookup does not open the door", async () => {
    expect(await doorAccess(h("client"), "video", store(true))).toBe("not_held");
    expect(await doorAccess(h("client", "org-1"), "video", store(new Error("db down")))).toBe("unavailable");
  });

  it("staff enter without a lookup", async () => {
    const s = store(false);
    expect(await doorAccess(h("staff"), "video", s)).toBe("open");
    expect(s).not.toHaveBeenCalled();
  });
});
