import { describe, expect, it, vi } from "vitest";
import { mxStatus, verifyEmails, MX_PROVIDER, type Resolver } from "../verify-email";

const err = (code: string) => Object.assign(new Error(code), { code });
const resolver = (mx: () => Promise<Array<{ exchange: string; priority: number }>>, a: () => Promise<string[]> = async () => { throw err("ENODATA"); }): Resolver =>
  ({ resolveMx: vi.fn(mx), resolve4: vi.fn(a), resolve6: vi.fn(async () => { throw err("ENODATA"); }) });

describe("mxStatus", () => {
  it("a domain with MX is unknown and definitive: the domain accepts mail, the mailbox is not proven", async () => {
    expect(await mxStatus("a@shop.example", { resolver: resolver(async () => [{ exchange: "mx.shop.example", priority: 10 }]) })).toEqual({ status: "unknown", definitive: true });
  });
  it("NXDOMAIN, an empty MX answer, and a null MX (RFC 7505) are invalid", async () => {
    expect(await mxStatus("a@nope.example", { resolver: resolver(async () => { throw err("ENOTFOUND"); }) })).toEqual({ status: "invalid", definitive: true });
    expect((await mxStatus("a@empty.example", { resolver: resolver(async () => []) })).status).toBe("invalid");
    expect((await mxStatus("a@null.example", { resolver: resolver(async () => [{ exchange: "", priority: 0 }]) })).status).toBe("invalid");
  });
  it("no MX but an address record is the implicit MX (RFC 5321 §5.1); neither is invalid", async () => {
    expect(await mxStatus("a@aonly.example", { resolver: resolver(async () => { throw err("ENODATA"); }, async () => ["192.0.2.1"]) })).toEqual({ status: "unknown", definitive: true });
    expect(await mxStatus("a@bare.example", { resolver: resolver(async () => { throw err("ENODATA"); }) })).toEqual({ status: "invalid", definitive: true });
  });
  it("a timeout or resolver failure is unknown and not definitive", async () => {
    expect(await mxStatus("a@slow.example", { resolver: resolver(() => new Promise(() => {})), timeoutMs: 10 })).toEqual({ status: "unknown", definitive: false });
    expect(await mxStatus("a@srv.example", { resolver: resolver(async () => { throw err("ECONNREFUSED"); }) })).toEqual({ status: "unknown", definitive: false });
  });
  it("a malformed address is invalid without a lookup", async () => {
    const r = resolver(async () => []);
    expect((await mxStatus("not-an-email", { resolver: r })).status).toBe("invalid");
    expect((await mxStatus("a@b.example\nBcc: x@y.example", { resolver: r })).status).toBe("invalid");
    expect(r.resolveMx).not.toHaveBeenCalled();
  });
});

describe("verifyEmails", () => {
  function fakeDb(cached: Array<{ email: string; status: string }>) {
    const written: unknown[] = [];
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "in"]) q[k] = () => q;
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: cached, error: null }).then(ok);
    q.upsert = async (rows: unknown[]) => { written.push(...rows); return { error: null }; };
    return { db: { from: () => q } as never, written };
  }

  it("reads the cache first, looks each domain up once, and writes back only definitive answers", async () => {
    const { db, written } = fakeDb([{ email: "known@x.example", status: "valid" }]);
    const r = resolver(async () => [{ exchange: "mx", priority: 1 }]);
    const out = await verifyEmails(db, "org-1", ["Known@x.example", "a@y.example", "b@y.example", "a@y.example"], { resolver: r });
    expect(out.get("known@x.example")).toBe("valid");
    expect(out.get("a@y.example")).toBe("unknown");
    expect(r.resolveMx).toHaveBeenCalledTimes(1);
    expect(written).toEqual([
      { organization_id: "org-1", email: "a@y.example", status: "unknown", provider: MX_PROVIDER },
      { organization_id: "org-1", email: "b@y.example", status: "unknown", provider: MX_PROVIDER },
    ]);
  });

  it("a resolver failure is returned as unknown but never cached, so the next import asks again", async () => {
    const { db, written } = fakeDb([]);
    const out = await verifyEmails(db, null, ["a@down.example"], { resolver: resolver(async () => { throw err("ECONNREFUSED"); }) });
    expect(out.get("a@down.example")).toBe("unknown");
    expect(written).toEqual([]);
  });

  it("past the time budget nothing more is looked up or cached", async () => {
    const { db, written } = fakeDb([]);
    const r = resolver(async () => [{ exchange: "mx", priority: 1 }]);
    const out = await verifyEmails(db, null, ["a@late.example"], { resolver: r, budgetMs: -1 });
    expect(out.get("a@late.example")).toBe("unknown");
    expect(r.resolveMx).not.toHaveBeenCalled();
    expect(written).toEqual([]);
  });
});
