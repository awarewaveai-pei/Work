import { describe, expect, it } from "vitest";
import { guardedRefresh, GmailReauthRequired, type AuthMirrorStore, type ConnectorAuthState } from "../connector-auth";

const GRANT = new Error('google oauth token endpoint 400: {"error":"invalid_grant","error_description":"Token has been expired or revoked."}');

function memory(initial: Partial<ConnectorAuthState> = {}) {
  const s: ConnectorAuthState = { email: "a@x.example", organization_id: null, expired: false, ...initial };
  const incidents: Array<{ status: "open" | "resolved" }> = [];
  const store: AuthMirrorStore = {
    state: async () => ({ ...s }),
    markExpired: async () => { s.expired = true; },
    clearExpired: async () => { s.expired = false; },
    hasUnresolved: async () => incidents.some((i) => i.status === "open"),
    raise: async () => { incidents.push({ status: "open" }); return null; },
    resolve: async () => { for (const i of incidents) i.status = "resolved"; },
  };
  return { s, incidents, store };
}

describe("guardedRefresh (OUT-GMAIL-REAUTH)", () => {
  it("invalid_grant: connector expired, one incident, the second round raises none", async () => {
    const m = memory();
    const refresh = guardedRefresh(async () => { throw GRANT; }, m.store, (t) => { throw new Error(t); });
    await expect(refresh("c1")).rejects.toBeInstanceOf(GmailReauthRequired);
    await expect(refresh("c1")).rejects.toThrow(/\/tools\/outreach\/connectors.*重新連接/);
    expect(m.s.expired).toBe(true);
    expect(m.incidents).toHaveLength(1);
  });

  it("an incident closed by hand while Google still refuses opens again next round", async () => {
    const m = memory();
    const refresh = guardedRefresh(async () => { throw GRANT; }, m.store, (t) => { throw new Error(t); });
    await expect(refresh("c1")).rejects.toBeInstanceOf(GmailReauthRequired);
    m.incidents[0].status = "resolved";
    await expect(refresh("c1")).rejects.toBeInstanceOf(GmailReauthRequired);
    expect(m.incidents.filter((i) => i.status === "open")).toHaveLength(1);
  });

  it("refresh succeeds after expiry: connected again and the incident resolved", async () => {
    const m = memory({ expired: true });
    m.incidents.push({ status: "open" });
    const refresh = guardedRefresh(async () => "tok", m.store, (t) => { throw new Error(t); });
    await expect(refresh("c1")).resolves.toBe("tok");
    expect(m.s.expired).toBe(false);
    expect(m.incidents.every((i) => i.status === "resolved")).toBe(true);
  });
});
