// captureWarmLead (card C14.1): an email that already has a cold draft is converted to a warm lead and the draft is skipped.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeWarmDb } from "./fake-warm-db";

const ORG = "00000000-0000-4000-8000-0000000000c1";
const m = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed: async () => ({ allowed: true, mode: "normal" }) }));
vi.mock("@/lib/crm/fluentcrm", () => ({ upsertContact: m.upsert }));
vi.mock("@/lib/payments/woo", async (orig) => ({ wpSiteKey: (await orig<typeof import("@/lib/payments/woo")>()).wpSiteKey,
  listBridgeClients: () => [{ id: "1", name: "wp", baseUrl: "https://wp.example" }] }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({ from: () => { const q: Record<string, unknown> = {}; q.select = () => q; q.eq = () => q;
    q.then = (ok: (v: unknown) => unknown) => ok({ data: [{ url: "https://wp.example" }], error: null }); return q; } }),
}));
vi.mock("@/lib/outreach/suppression", () => ({ findSuppressed: async (_d: unknown, _o: unknown, leads: unknown[]) => leads.map(() => false) }));

const { captureWarmLead } = await import("../warm-leads");

beforeEach(() => {
  m.upsert.mockReset();
  m.upsert.mockResolvedValue({ ok: true, value: { status: "committed", contact_id: 7 } });
});

describe("captureWarmLead", () => {
  it("turns a lead with a cold draft warm and skips the draft", async () => {
    const db = fakeWarmDb();
    db.tables.co_leads.push({ id: "L1", organization_id: ORG, name: "Acme", email: "who@acme.com", status: "drafted", do_not_contact: false, fluentcrm_sync_status: "not_synced", website: null });
    db.tables.co_messages.push({ id: "M1", lead_id: "L1", output_type: "cold_email", status: "drafted" }, { id: "M2", lead_id: "L1", output_type: "followup", status: "draft" });
    const res = await captureWarmLead(db as never, { orgId: ORG, email: "Who@Acme.com", name: "Who", sourceRef: null, consent: { source: "meta_lead_ad_csv:Spring" }, channel: "meta_lead_ad", form: "Spring" });
    expect(res).toMatchObject({ ok: true, leadId: "L1", created: false, cancelledCold: 2, sync: "synced" });
    expect(db.tables.co_messages.map((x) => x.status)).toEqual(["skipped", "skipped"]);
    expect(db.tables.co_leads[0]).toMatchObject({ status: "warm", consent_status: "form_submitted", consent_source: "meta_lead_ad_csv:Spring" });
    expect(db.tables.co_leads).toHaveLength(1);
  });

  it("a synced person arriving through another form gets that form's tag; the same capture again calls FluentCRM no more", async () => {
    const db = fakeWarmDb();
    db.tables.co_leads.push({ id: "L2", organization_id: ORG, name: "Pat", email: "pat@acme.com", status: "warm", do_not_contact: false,
      fluentcrm_sync_status: "synced", website: null, source_url: null, consent_source: "replied" });
    const csv = (form: string) => captureWarmLead(db as never, { orgId: ORG, email: "pat@acme.com", sourceRef: null,
      consent: { source: `meta_lead_ad_csv:${form}` }, channel: "meta_lead_ad", form });
    expect(await csv("Spring")).toMatchObject({ ok: true, sync: "synced" });
    expect(m.upsert.mock.calls[0][0].tags).toEqual(["來源：Meta 名單廣告", "表單：Spring"]);
    expect(await csv("Spring")).toMatchObject({ ok: true, sync: "already_synced" });
    expect(m.upsert).toHaveBeenCalledTimes(1);
    expect(db.tables.co_leads[0]).toMatchObject({ status: "warm", consent_source: "replied", fluentcrm_sync_status: "synced" });
  });

  it("a Meta lead synced by hand (no capture recorded) gets its tags when Meta resends it", async () => {
    const db = fakeWarmDb();
    db.tables.co_leads.push({ id: "L4", organization_id: ORG, name: "Lee", email: "lee@acme.com", status: "warm", do_not_contact: false,
      fluentcrm_sync_status: "synced", website: null, source_url: "meta:leadgen/55", consent_source: "meta_lead_ad:9" });
    const resend = () => captureWarmLead(db as never, { orgId: ORG, email: "lee@acme.com", sourceRef: "meta:leadgen/55",
      consent: { source: "meta_lead_ad:9" }, channel: "meta_lead_ad", form: "Winter" });
    expect(await resend()).toMatchObject({ sync: "synced" });
    expect(await resend()).toMatchObject({ sync: "already_synced" });
    expect(m.upsert).toHaveBeenCalledTimes(1);
  });

  it("a failed tag top-up keeps a synced person synced", async () => {
    const db = fakeWarmDb();
    db.tables.co_leads.push({ id: "L3", organization_id: ORG, name: "Kim", email: "kim@acme.com", status: "warm", do_not_contact: false,
      fluentcrm_sync_status: "synced", website: null, source_url: null, consent_source: "replied" });
    m.upsert.mockResolvedValueOnce({ ok: false, error: "bridge timeout" });
    expect(await captureWarmLead(db as never, { orgId: ORG, email: "kim@acme.com", sourceRef: null,
      consent: { source: "meta_lead_ad_csv:Fall" }, channel: "meta_lead_ad", form: "Fall" })).toMatchObject({ ok: true, sync: "failed", retryable: true });
    expect(db.tables.co_leads[0].fluentcrm_sync_status).toBe("synced");
  });
});
