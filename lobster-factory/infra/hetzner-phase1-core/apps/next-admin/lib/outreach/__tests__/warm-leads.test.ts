// captureWarmLead (card C14.1): an email that already has a cold draft is converted to a warm lead and the draft is skipped.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeWarmDb } from "./fake-warm-db";

const ORG = "00000000-0000-4000-8000-0000000000c1";
const m = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed: async () => ({ allowed: true, mode: "normal" }) }));
vi.mock("@/lib/crm/fluentcrm", () => ({ upsertContact: m.upsert }));
vi.mock("@/lib/payments/woo", () => ({ listBridgeClients: () => [{ id: "1", name: "wp", baseUrl: "https://wp.example" }] }));
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
    const res = await captureWarmLead(db as never, { orgId: ORG, email: "Who@Acme.com", name: "Who", sourceRef: null, consent: { source: "meta_lead_ad_csv:Spring" } });
    expect(res).toMatchObject({ ok: true, leadId: "L1", created: false, cancelledCold: 2, sync: "synced" });
    expect(db.tables.co_messages.map((x) => x.status)).toEqual(["skipped", "skipped"]);
    expect(db.tables.co_leads[0]).toMatchObject({ status: "warm", consent_status: "form_submitted", consent_source: "meta_lead_ad_csv:Spring" });
    expect(db.tables.co_leads).toHaveLength(1);
  });
});
