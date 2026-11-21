import { describe, expect, it } from "vitest";
import {
  ORG_DEPENDENT_PARAMS,
  PARAM,
  decide,
  normalizeQuery,
  withContext,
  type DecideInput,
} from "../contract";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const INTERNAL = "99999999-9999-4999-8999-999999999999";
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function input(over: Partial<DecideInput> = {}): DecideInput {
  return {
    viewer: "staff",
    sessionOrg: null,
    hostOrg: null,
    internalOrgId: INTERNAL,
    query: { org: null, site: null },
    sites: null,
    siteLookup: null,
    layer: "org",
    ...over,
  };
}

describe("normalizeQuery", () => {
  it("reads org and site", () => {
    expect(normalizeQuery(new URLSearchParams(`org=${A}&site=${S1}`))).toEqual({
      org: A,
      site: S1,
      legacy: false,
    });
  });
  it("siteId -> site, flagged legacy", () => {
    expect(normalizeQuery(new URLSearchParams(`siteId=${S1}`))).toEqual({
      org: null,
      site: S1,
      legacy: true,
    });
  });
  it("non-uuid -> null, flagged legacy", () => {
    expect(normalizeQuery(new URLSearchParams("org=acme&site=1"))).toEqual({
      org: null,
      site: null,
      legacy: true,
    });
  });
  it("empty -> nothing", () => {
    expect(normalizeQuery(new URLSearchParams(""))).toEqual({ org: null, site: null, legacy: false });
  });
});

describe("decide: sources", () => {
  it("session org and host org differ -> rejected, no data", () => {
    const r = decide(input({ viewer: "client", sessionOrg: A, hostOrg: B }));
    expect(r).toEqual({ status: "rejected", orgId: null, siteId: null, rewrite: null });
  });
  it("session org equals host org -> that org", () => {
    const r = decide(input({ viewer: "client", sessionOrg: A, hostOrg: A }));
    expect(r.status).toBe("ok");
    expect(r.orgId).toBe(A);
  });
  it("client with no binding -> rejected", () => {
    expect(decide(input({ viewer: "client" })).status).toBe("rejected");
  });
});

describe("decide: client account", () => {
  it("foreign org in URL is removed", () => {
    const r = decide(input({ viewer: "client", sessionOrg: A, query: { org: B, site: null } }));
    expect(r.orgId).toBe(A);
    expect(r.rewrite).toEqual({ org: null, site: null });
  });
  it("foreign site in URL is removed (never not_found/forbidden)", () => {
    const r = decide(
      input({
        viewer: "client",
        sessionOrg: A,
        layer: "site",
        query: { org: null, site: S2 },
        sites: [{ id: S1, organization_id: A }, { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", organization_id: A }],
        siteLookup: "forbidden",
      }),
    );
    expect(r.status).toBe("unselected");
    expect(r.siteId).toBeNull();
    expect(r.rewrite).toEqual({ org: null, site: null });
  });
  it("exactly one visible site -> auto-select and rewrite", () => {
    const r = decide(
      input({
        viewer: "client",
        sessionOrg: A,
        layer: "site",
        sites: [{ id: S1, organization_id: A }],
      }),
    );
    expect(r).toEqual({ status: "ok", orgId: A, siteId: S1, rewrite: { org: A, site: S1 } });
  });
  it("own org in URL is kept", () => {
    const r = decide(input({ viewer: "client", sessionOrg: A, query: { org: A, site: null } }));
    expect(r).toEqual({ status: "ok", orgId: A, siteId: null, rewrite: null });
  });
});

describe("decide: staff + host binding", () => {
  it("URL org differing from host org is removed", () => {
    const r = decide(input({ hostOrg: A, query: { org: B, site: null } }));
    expect(r.orgId).toBe(A);
    expect(r.rewrite).toEqual({ org: null, site: null });
  });
});

describe("decide: staff, URL only", () => {
  it("empty org -> unselected, never internal", () => {
    const r = decide(input());
    expect(r).toEqual({ status: "unselected", orgId: null, siteId: null, rewrite: null });
    expect(r.orgId).not.toBe(INTERNAL);
  });
  it("internal org id selected -> ok", () => {
    const r = decide(input({ query: { org: INTERNAL, site: null } }));
    expect(r).toEqual({ status: "ok", orgId: INTERNAL, siteId: null, rewrite: null });
  });
  it("only site given -> org inferred from lookup and written back", () => {
    const r = decide(
      input({
        layer: "site",
        query: { org: null, site: S1 },
        siteLookup: { id: S1, organization_id: A },
      }),
    );
    expect(r).toEqual({ status: "ok", orgId: A, siteId: S1, rewrite: { org: A, site: S1 } });
  });
  it("only site given, lookup pending -> loading", () => {
    expect(decide(input({ query: { org: null, site: S1 } })).status).toBe("loading");
  });
  it("only site given, lookup not_found / forbidden", () => {
    expect(decide(input({ query: { org: null, site: S1 }, siteLookup: "not_found" })).status).toBe("not_found");
    expect(decide(input({ query: { org: null, site: S1 }, siteLookup: "forbidden" })).status).toBe("forbidden");
  });
  it("site belongs to a different org -> site_mismatch, siteId null", () => {
    const r = decide(
      input({
        layer: "site",
        query: { org: A, site: S2 },
        sites: [{ id: S1, organization_id: A }],
        siteLookup: { id: S2, organization_id: B },
      }),
    );
    expect(r.status).toBe("site_mismatch");
    expect(r.siteId).toBeNull();
    expect(r.rewrite).toBeNull();
  });
  it("site in org's list -> ok", () => {
    const r = decide(
      input({
        layer: "site",
        query: { org: A, site: S1 },
        sites: [{ id: S1, organization_id: A }, { id: S2, organization_id: A }],
      }),
    );
    expect(r).toEqual({ status: "ok", orgId: A, siteId: S1, rewrite: null });
  });
  it("site layer, several sites, none chosen -> unselected (never first)", () => {
    const r = decide(
      input({
        layer: "site",
        query: { org: A, site: null },
        sites: [{ id: S1, organization_id: A }, { id: S2, organization_id: A }],
      }),
    );
    expect(r.status).toBe("unselected");
    expect(r.siteId).toBeNull();
  });
  it("site layer, exactly one site -> auto-select and rewrite", () => {
    const r = decide(
      input({ layer: "site", query: { org: A, site: null }, sites: [{ id: S1, organization_id: A }] }),
    );
    expect(r).toEqual({ status: "ok", orgId: A, siteId: S1, rewrite: { org: A, site: S1 } });
  });
  it("sites not loaded -> loading", () => {
    expect(decide(input({ layer: "site", query: { org: A, site: null } })).status).toBe("loading");
  });
});

describe("withContext", () => {
  it("relative: adds org and site", () => {
    expect(withContext("/tools/content", { org: A, site: S1 })).toBe(`/tools/content?org=${A}&site=${S1}`);
  });
  it("relative: keeps other query and hash, replaces existing", () => {
    expect(withContext(`/x?topic=t1&org=${B}#frag`, { org: A })).toBe(`/x?topic=t1&org=${A}#frag`);
  });
  it("absolute: keeps host, path, query, hash", () => {
    expect(withContext("https://content.example.test/p?month=2026-11#h", { org: A, site: S1 })).toBe(
      `https://content.example.test/p?month=2026-11&org=${A}&site=${S1}#h`,
    );
  });
  it("null removes, undefined leaves alone", () => {
    expect(withContext(`/x?org=${A}&site=${S1}&k=v`, { site: null })).toBe(`/x?org=${A}&k=v`);
  });
  it("href with only a hash", () => {
    expect(withContext("/x#a", { org: A })).toBe(`/x?org=${A}#a`);
  });
});

describe("constants", () => {
  it("param names and org-dependent params", () => {
    expect(PARAM).toEqual({ org: "org", site: "site" });
    expect([...ORG_DEPENDENT_PARAMS]).toEqual(["site", "topic", "month"]);
  });
});
