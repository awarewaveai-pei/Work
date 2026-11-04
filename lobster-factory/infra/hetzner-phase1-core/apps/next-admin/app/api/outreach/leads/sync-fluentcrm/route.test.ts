// sync-fluentcrm (SPEC §5.8, D16, card C6.3): only a lead that said yes and is not suppressed for marketing goes to
// FluentCRM, and only through a bridge site that belongs to its organization.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "00000000-0000-4000-8000-0000000000c1";
const LEAD = "00000000-0000-4000-8000-00000000001a";
const s = vi.hoisted(() => ({
  consent: "replied", suppressed: false, siteUrls: ["https://client.example/"] as string[],
  bridges: [{ id: "2", name: "client", baseUrl: "https://client.example" }] as Array<{ id: string; name: string; baseUrl: string }>,
  updates: [] as unknown[], timeline: [] as unknown[], upserts: [] as unknown[], suppressionAsked: [] as unknown[],
}));

vi.mock("@/lib/org-client", () => ({
  getOrgSupabaseWriteClient: async () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.update = (p: unknown) => { s.updates.push(p); return q; };
      q.insert = async (p: unknown) => { if (table === "co_timeline_events") s.timeline.push(p); return { error: null }; };
      q.maybeSingle = async () => ({ data: { id: LEAD, organization_id: ORG, name: "Acme", email: "Pat@Acme.test", website: null, consent_status: s.consent }, error: null });
      q.then = (res: (v: unknown) => unknown) => res({ error: null });
      return q;
    },
  }),
}));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({
    from: () => { const q: Record<string, unknown> = {}; q.select = () => q; q.eq = () => q;
      q.then = (res: (v: unknown) => unknown) => res({ data: s.siteUrls.map((url) => ({ url })), error: null }); return q; },
  }),
}));
vi.mock("@/lib/outreach/suppression", () => ({
  findSuppressed: async (_db: unknown, _org: unknown, leads: unknown[], appliesTo: unknown) => { s.suppressionAsked.push(appliesTo); return leads.map(() => s.suppressed); },
}));
vi.mock("@/lib/payments/woo", async (orig) => ({ wpSiteKey: (await orig<typeof import("@/lib/payments/woo")>()).wpSiteKey,
  listBridgeClients: () => s.bridges, bridgePost: vi.fn(), isBridgeConfigured: () => true }));
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed: async () => ({ allowed: true, mode: "normal" }) }));
vi.mock("@/lib/crm/fluentcrm", () => ({
  upsertContact: async (spec: unknown, opts: unknown) => { s.upserts.push([spec, opts]); return { ok: true, value: { status: "committed", contact_id: 77 } }; },
}));

const { POST } = await import("./route");
const call = () => POST(new Request("http://app.test/api/outreach/leads/sync-fluentcrm", { method: "POST",
  headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": "owner", "x-ops-user-id": "u-1", "content-type": "application/json" },
  body: JSON.stringify({ leadId: LEAD }) }));

beforeEach(() => {
  s.consent = "replied"; s.suppressed = false; s.siteUrls = ["https://client.example/"];
  s.bridges = [{ id: "2", name: "client", baseUrl: "https://client.example" }];
  for (const a of [s.updates, s.timeline, s.upserts, s.suppressionAsked]) a.length = 0;
});

describe("POST /api/outreach/leads/sync-fluentcrm", () => {
  it.each(["replied", "opted_in", "form_submitted", "customer"])("syncs a lead with consent %s", async (consent) => {
    s.consent = consent;
    const res = await call();
    expect(res.status).toBe(200);
    expect(s.upserts[0]).toEqual([{ email: "pat@acme.test", first_name: "Acme", tags: ["outreach-warm"] }, { clientId: "2" }]);
    expect(s.updates[0]).toMatchObject({ fluentcrm_contact_id: "77", fluentcrm_sync_status: "synced" });
    expect(s.timeline[0]).toMatchObject({ event_type: "fluentcrm_synced" });
  });

  it.each(["unknown", "legitimate_interest", "unsubscribed", "do_not_contact"])("refuses consent %s with 422 not_eligible", async (consent) => {
    s.consent = consent;
    const res = await call();
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "not_eligible" });
    expect(s.upserts).toEqual([]);
  });

  it("refuses a suppressed lead (marketing and all scopes are asked) and writes nothing", async () => {
    s.suppressed = true;
    const res = await call();
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "not_eligible", reason: "suppressed" });
    expect(s.suppressionAsked[0]).toEqual(["marketing", "all"]);
    expect(s.upserts).toEqual([]);
    expect(s.updates).toEqual([]);
  });

  it("syncs through the default bridge (id \"\" is a bridge, not none)", async () => {
    s.bridges = [{ id: "", name: "client", baseUrl: "https://client.example" }];
    expect((await call()).status).toBe(200);
    expect(s.upserts[0][1]).toEqual({ clientId: "" });
  });

  it("a staging install under a path of the bridge host is another site: no_bridge", async () => {
    s.siteUrls = ["https://client.example/staging/e2e-1"];
    const res = await call();
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "no_bridge" });
  });

  it("is 422 no_bridge when no site of the organization is a configured bridge host", async () => {
    s.siteUrls = ["https://other.example"];
    const res = await call();
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "no_bridge" });
    expect(s.upserts).toEqual([]);
  });
});
