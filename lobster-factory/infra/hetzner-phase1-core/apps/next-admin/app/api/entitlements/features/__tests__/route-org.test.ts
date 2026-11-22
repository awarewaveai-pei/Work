// @vitest-environment jsdom
// U5: GET /api/entitlements/features?org= -- the current client's list (ADR 020), only through actorFor (ADR 017 §0).
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CUSTOMER, gateFixture, INTERNAL } from "@/lib/entitlements/__tests__/gate-fixtures";
import { resetFeatureListCache } from "@/lib/entitlements/features";
import { resetSubjectCache } from "@/lib/entitlements/subject";
import { ClientContext, type ClientContextValue } from "@/lib/client-context/use-client-context";
import { usePaidFeatures } from "@/lib/entitlements/use-paid-features";

const A = CUSTOMER.orgId;                                   // holds social.dispatch (gate fixture row)
const A_CHILD = "33333333-3333-4333-8333-333333333333";     // A's sub-unit
const B = "44444444-4444-4444-8444-444444444444";           // another customer
const ORGS = [
  { id: INTERNAL.orgId, parent_organization_id: null, kind: "internal" },
  { id: A, parent_organization_id: null, kind: "customer" },
  { id: A_CHILD, parent_organization_id: A, kind: "customer" },
  { id: B, parent_organization_id: null, kind: "customer" },
];

const m = vi.hoisted(() => ({ members: new Map<string, Map<string, string>>(), deps: null as unknown }));
vi.mock("@/lib/social/store", () => ({ memberRoles: async (userId: string) => m.members.get(userId) ?? new Map() }));
vi.mock("@/lib/entitlements/runtime", () => ({ runtimeGateDependencies: () => m.deps }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({
    from: () => ({
      select: () => {
        const filters: [string, unknown][] = [];
        const q = {
          eq(column: string, value: unknown) { filters.push([column, value]); return q; },
          limit() { return q; },
          async maybeSingle() {
            return { data: ORGS.find((o) => filters.every(([c, v]) => (o as Record<string, unknown>)[c] === v)) ?? null, error: null };
          },
        };
        return q;
      },
    }),
  }),
}));

import { GET } from "../route";

const staff = (role: string, user = "u-staff") => ({ "x-ops-user-kind": "staff", "x-ops-claims-role": role, "x-ops-user-id": user });
const client = (org: string) => ({ "x-ops-user-kind": "client", "x-ops-org-id": org, "x-ops-user-id": "u-client" });
const call = async (headers: Record<string, string>, org?: string) => {
  const res = await GET(new Request(`http://x/api/entitlements/features${org === undefined ? "" : `?org=${org}`}`, { headers }));
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  resetFeatureListCache();
  resetSubjectCache();
  m.members = new Map();
  m.deps = gateFixture({ mode: "shadow" }).deps;
});

describe("feature list for the current client (?org=)", () => {
  it("without ?org nothing changes: staff get the internal account, a client its own", async () => {
    expect((await call(staff("owner"))).body.list.subject).toBe(INTERNAL.orgId);
    expect((await call(client(A_CHILD))).body.list.subject).toBe(A);
  });

  it("staff owner/admin with ?org=X get X's root account, with each feature's source", async () => {
    for (const role of ["owner", "admin"]) {
      resetFeatureListCache();
      const { status, body } = await call(staff(role), A_CHILD);
      expect(status).toBe(200);
      expect(body.list.subject).toBe(A);
      expect(body.list.features["social.dispatch"]).toEqual({ allowed: true, verdict: true, reason: null, source: "contract" });
      expect(body.list.features["content.title"]).toMatchObject({ verdict: false, source: null });
    }
  });

  it("staff with no role on X: 403 not_authorized_for_org; a member row there is a role", async () => {
    expect(await call(staff("operator"), B)).toEqual({ status: 403, body: { ok: false, code: "not_authorized_for_org" } });
    m.members.set("u-staff", new Map([[B, "editor"]]));
    expect((await call(staff("operator"), B)).body.list.subject).toBe(B);
  });

  it("staff naming the internal account itself need no role (withFeature's rule)", async () => {
    expect((await call(staff("operator"), INTERNAL.orgId)).body.list.subject).toBe(INTERNAL.orgId);
  });

  it("a client naming another org, its own sub-unit or a made-up uuid gets the same 403; its own org = no parameter", async () => {
    for (const org of [B, A_CHILD, "55555555-5555-4555-8555-555555555555"]) {
      expect(await call(client(A), org), org).toEqual({ status: 403, body: { ok: false, code: "not_authorized_for_org" } });
    }
    const own = await call(client(A), A);
    resetFeatureListCache();
    const none = await call(client(A));
    expect(own.status).toBe(200);
    expect({ ...own.body.list, issued_at: 0, expires_at: 0 }).toEqual({ ...none.body.list, issued_at: 0, expires_at: 0 });
  });

  it("a non-uuid org is 400", async () => {
    for (const org of ["abc", "", "' or 1=1"]) expect((await call(staff("owner"), encodeURIComponent(org))).status, org).toBe(400);
  });

  it("the 5-minute cache never hands one client's list to another (key holds the org)", async () => {
    expect((await call(staff("owner"), A)).body.list.features["social.dispatch"].verdict).toBe(true);
    const b = await call(staff("owner"), B);
    expect(b.body.list.subject).toBe(B);
    expect(b.body.list.features["social.dispatch"]).toMatchObject({ verdict: false, reason: "no_entitlement" });
  });
});

describe("usePaidFeatures asks for the client chosen in the client rail", () => {
  const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ list: { features: {} } })));
  const withOrg = (org: string | null) => ({ children }: { children: ReactNode }) =>
    createElement(ClientContext.Provider, { value: { org } as unknown as ClientContextValue }, children);
  beforeEach(() => { fetchSpy.mockClear(); vi.stubGlobal("fetch", fetchSpy); });

  it("a chosen client adds ?org=; no provider or no client keeps the plain request", async () => {
    renderHook(() => usePaidFeatures(), { wrapper: withOrg(B) });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(`/api/entitlements/features?org=${B}`, { cache: "no-store" }));
    fetchSpy.mockClear();
    renderHook(() => usePaidFeatures(), { wrapper: withOrg(null) });
    renderHook(() => usePaidFeatures());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    for (const c of fetchSpy.mock.calls as unknown[][]) expect(c[0]).toBe("/api/entitlements/features");
  });
});
