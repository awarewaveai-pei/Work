import { beforeEach, describe, expect, it, vi } from "vitest";
import { doorAccess, forgetDoorAccess } from "../door-access";

const h = (kind?: string, org?: string) => new Headers({ ...(kind ? { "x-ops-user-kind": kind } : {}), ...(org ? { "x-ops-org-id": org } : {}) });
const store = (held: boolean | Error) => vi.fn(async () => { if (held instanceof Error) throw held; return held; });

describe("doorAccess -- every feature is bought separately or given by us", () => {
  beforeEach(() => forgetDoorAccess());
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

describe("doorAccess -- remembered briefly so a page's burst of API calls is one lookup", () => {
  beforeEach(() => forgetDoorAccess());
  it("a held product is looked up once for many calls; another org is its own lookup", async () => {
    const s = store(true);
    for (let i = 0; i < 5; i++) expect(await doorAccess(h("client", "org-1"), "content", s)).toBe("open");
    await doorAccess(h("client", "org-2"), "content", s);
    expect(s).toHaveBeenCalledTimes(2);
  });
  it("ten calls arriving together share one lookup (critic 2026-10-30 H2-R)", async () => {
    let release: (v: boolean) => void = () => undefined;
    const s = vi.fn(() => new Promise<boolean>((r) => { release = r; }));
    const calls = Array.from({ length: 10 }, () => doorAccess(h("client", "org-1"), "content", s));
    release(true);
    expect(await Promise.all(calls)).toEqual(Array(10).fill("open"));
    expect(s).toHaveBeenCalledTimes(1);
  });
});
