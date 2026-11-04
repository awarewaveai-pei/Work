// inbox POST warmLeads (card C14.1): the CSV of a Meta lead-ad form -> warm leads; the same email twice (also in another
// case, and on a second upload) is one lead.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeWarmDb } from "@/lib/outreach/__tests__/fake-warm-db";

const ORG = "00000000-0000-4000-8000-0000000000c1";
const m = vi.hoisted(() => ({ upsert: vi.fn(), db: undefined as unknown }));
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed: async () => ({ allowed: true, mode: "normal" }) }));
vi.mock("@/lib/crm/fluentcrm", () => ({ upsertContact: m.upsert }));
vi.mock("@/lib/payments/woo", async (orig) => ({ wpSiteKey: (await orig<typeof import("@/lib/payments/woo")>()).wpSiteKey,
  listBridgeClients: () => [{ id: "1", name: "wp", baseUrl: "https://wp.example" }] }));
vi.mock("@/lib/outreach/suppression", () => ({ findSuppressed: async (_d: unknown, _o: unknown, leads: unknown[]) => leads.map(() => false) }));
vi.mock("@/lib/org-client", () => ({ getOrgSupabaseWriteClient: async () => m.db }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({ from: () => { const q: Record<string, unknown> = {}; q.select = () => q; q.eq = () => q;
    q.then = (ok: (v: unknown) => unknown) => ok({ data: [{ url: "https://wp.example" }], error: null }); return q; } }),
}));

const { POST } = await import("./route");
const STAFF = { "x-ops-user-kind": "staff", "x-ops-claims-role": "owner", "x-ops-user-id": "u-1", "content-type": "application/json" };
const upload = (rows: Array<Record<string, string>>) => POST(new Request("http://app.test/api/outreach/inbox", {
  method: "POST", headers: STAFF, body: JSON.stringify({ organizationId: ORG, warmLeads: { form: "Spring sale", rows } }),
}));

beforeEach(() => {
  m.db = fakeWarmDb();
  m.upsert.mockReset();
  m.upsert.mockResolvedValue({ ok: true, value: { status: "committed", contact_id: 3 } });
});

describe("inbox POST warmLeads", () => {
  it("imports the same email twice as one warm lead", async () => {
    const rows = [
      { email: "amy@example.com", full_name: "Amy", phone: "0912", created_time: "2026-11-02T10:00:00+08:00" },
      { email: "AMY@example.com", full_name: "Amy L", phone: "", created_time: "" },
    ];
    const first = await upload(rows);
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({ ok: true, imported: 1, existing: 1, summary: { synced: 1, duplicate_in_file: 1 } });
    const again = await upload(rows);
    expect(await again.json()).toMatchObject({ imported: 0, existing: 2 });
    const leads = (m.db as ReturnType<typeof fakeWarmDb>).tables.co_leads;
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ status: "warm", consent_source: "meta_lead_ad_csv:Spring sale", consent_status: "form_submitted" });
    expect(m.upsert).toHaveBeenCalledTimes(1);
    expect(m.upsert.mock.calls[0][0].tags).toEqual(["來源：Meta 名單廣告", "表單：Spring sale"]);
  });
});
