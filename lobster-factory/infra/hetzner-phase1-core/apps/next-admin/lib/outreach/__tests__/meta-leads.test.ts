// Meta lead-ad webhook (card C14.2): a leadgen payload becomes one warm lead with consent and one FluentCRM call; the same
// leadgen id again makes no second lead, and a first sync that failed is finished on the resend.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeWarmDb } from "./fake-warm-db";

const ORG = "00000000-0000-4000-8000-0000000000c1";
const m = vi.hoisted(() => ({ upsert: vi.fn(), db: undefined as unknown }));
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed: async () => ({ allowed: true, mode: "normal" }) }));
vi.mock("@/lib/crm/fluentcrm", () => ({ upsertContact: m.upsert }));
vi.mock("@/lib/payments/woo", async (orig) => ({ wpSiteKey: (await orig<typeof import("@/lib/payments/woo")>()).wpSiteKey,
  listBridgeClients: () => [{ id: "1", name: "wp", baseUrl: "https://wp.example" }] }));
vi.mock("@/lib/outreach/suppression", () => ({ findSuppressed: async (_d: unknown, _o: unknown, leads: unknown[]) => leads.map(() => false) }));
vi.mock("@/lib/org-client", () => ({ getOrgSupabaseWriteClient: async () => m.db }));
vi.mock("@/lib/social/store", () => ({
  findEnabledMetaAsset: async (kind: string, id: string) => (kind === "facebook_page" && id === "555" ? { kind, externalId: id, pageExternalId: null, organizationId: ORG } : null),
}));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = async () => ({ data: { slug: "brand" }, error: null });
      q.then = (ok: (v: unknown) => unknown) => ok({ data: table === "wp_sites" ? [{ url: "https://wp.example" }] : [], error: null });
      return q;
    },
  }),
}));

const { handleLeadgenChanges } = await import("../meta-leads");
const env = { META_PAGE_TOKEN_555: "page-token", META_GRAPH_API_BASE_URL: "https://graph.test" };
const payload = { object: "page", entry: [{ id: "555", time: 1, changes: [{ field: "leadgen", value: { leadgen_id: "9001", page_id: "555", form_id: "777", created_time: 1793600000 } }] }] };
const graphLead = {
  id: "9001", created_time: "2026-11-02T10:00:00+0000", form_id: "777",
  field_data: [{ name: "email", values: ["Amy@Example.com"] }, { name: "full_name", values: ["Amy Lin"] }, { name: "phone_number", values: ["+886912345678"] }],
};
const urls: string[] = [];
let formRes = () => new Response(JSON.stringify({ id: "777", name: "塔羅免費解讀" }), { status: 200 });

beforeEach(() => {
  m.db = fakeWarmDb();
  m.upsert.mockReset();
  m.upsert.mockResolvedValue({ ok: true, value: { status: "committed", contact_id: 42 } });
  urls.length = 0;
  formRes = () => new Response(JSON.stringify({ id: "777", name: "塔羅免費解讀" }), { status: 200 });
  vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
    urls.push(String(url));
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer page-token");
    if (String(url).includes("/777?")) return formRes();
    return new Response(JSON.stringify(graphLead), { status: 200 });
  });
});

const tables = () => (m.db as ReturnType<typeof fakeWarmDb>).tables;

describe("handleLeadgenChanges", () => {
  it("makes one warm lead with consent and calls FluentCRM once", async () => {
    expect(await handleLeadgenChanges(payload, env)).toEqual({ received: 1, captured: 1, skipped: 0, failed: 0, retry: 0 });
    expect(urls[0]).toContain("https://graph.test/v24.0/9001?");
    expect(tables().co_leads).toHaveLength(1);
    expect(tables().co_leads[0]).toMatchObject({
      organization_id: ORG, email: "amy@example.com", name: "Amy Lin", phone: "+886912345678", source_url: "meta:leadgen/9001",
      status: "warm", consent_status: "form_submitted", consent_source: "meta_lead_ad:777", fluentcrm_sync_status: "synced", fluentcrm_contact_id: "42",
    });
    expect(m.upsert).toHaveBeenCalledTimes(1);
    expect(m.upsert).toHaveBeenCalledWith({ email: "amy@example.com", first_name: "Amy Lin", phone: "+886912345678", tags: ["來源：Meta 名單廣告", "表單：塔羅免費解讀"] }, { clientId: "1" });
    expect(tables().co_timeline_events.map((e) => e.event_type)).toEqual(["lead_captured", "fluentcrm_synced"]);
  });

  it("captures with the channel tag alone when the form's name is refused (4xx)", async () => {
    formRes = () => new Response(JSON.stringify({ error: { message: "no" } }), { status: 400 });
    expect(await handleLeadgenChanges(payload, env)).toMatchObject({ captured: 1 });
    expect(m.upsert.mock.calls[0][0].tags).toEqual(["來源：Meta 名單廣告"]);
  });

  it("asks Meta to resend when the form's name read fails for now (5xx), and tags the form on the resend", async () => {
    formRes = () => new Response("{}", { status: 503 });
    expect(await handleLeadgenChanges(payload, env)).toMatchObject({ captured: 0, retry: 1 });
    expect(tables().co_leads).toHaveLength(0);
    formRes = () => new Response(JSON.stringify({ id: "777", name: "塔羅免費解讀" }), { status: 200 });
    expect(await handleLeadgenChanges(payload, env)).toMatchObject({ captured: 1 });
    expect(m.upsert.mock.calls[0][0].tags).toEqual(["來源：Meta 名單廣告", "表單：塔羅免費解讀"]);
  });

  it("does not duplicate on a resend, and finishes a sync that failed the first time", async () => {
    m.upsert.mockResolvedValueOnce({ ok: false, error: "bridge timeout" });
    expect(await handleLeadgenChanges(payload, env)).toMatchObject({ captured: 0, retry: 1 });
    expect(tables().co_leads[0]).toMatchObject({ status: "warm", fluentcrm_sync_status: "failed" });
    expect(await handleLeadgenChanges(payload, env)).toMatchObject({ captured: 1, retry: 0 });
    expect(tables().co_leads).toHaveLength(1);
    expect(tables().co_leads[0]).toMatchObject({ fluentcrm_sync_status: "synced", fluentcrm_contact_id: "42" });
    expect(m.upsert).toHaveBeenCalledTimes(2);
    await handleLeadgenChanges(payload, env);
    expect(m.upsert).toHaveBeenCalledTimes(2);
    expect(tables().co_timeline_events.filter((e) => e.event_type === "lead_captured")).toHaveLength(1);
  });
});
