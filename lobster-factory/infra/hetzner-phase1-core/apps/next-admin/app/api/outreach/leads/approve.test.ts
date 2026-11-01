// leads POST fromInboxId (card C10): approving a business that is already a lead returns that lead and inserts nothing;
// two approvals of the same email racing on 0149's unique index leave one lead, the loser answered with the winner's.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "00000000-0000-4000-8000-0000000000c1";
const INBOX = "00000000-0000-4000-8000-0000000000a1";
const m = vi.hoisted(() => ({
  inbox: {} as Record<string, unknown>,
  // the organization's leads as read before and after this request's insert (a concurrent winner appears after)
  before: [] as Record<string, unknown>[],
  after: null as Record<string, unknown>[] | null,
  inserts: 0,
  insertError: null as { code: string; message: string } | null,
}));

vi.mock("@/lib/org-client", () => {
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "or", "in", "ilike", "limit", "order", "gt", "update"]) q[k] = () => q;
    const leads = () => (m.inserts > 0 && m.after ? m.after : m.before);
    q.then = (ok: (v: unknown) => unknown) => ok({ data: table === "co_leads" ? leads() : [], error: null });
    q.maybeSingle = async () => ({ data: table === "co_lead_inbox" ? m.inbox : leads()[0] ?? null, error: null });
    q.insert = () => {
      m.inserts++;
      return { select: () => ({ single: async () => (m.insertError ? { data: null, error: m.insertError } : { data: { id: "new" }, error: null }) }) };
    };
    return q;
  };
  return { getOrgSupabaseWriteClient: async () => ({ from }) };
});

const { POST } = await import("./route");
const approve = () => POST(new Request("http://app.test/api/outreach/leads", { method: "POST",
  headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": "owner", "x-ops-user-id": "u-1", "content-type": "application/json" },
  body: JSON.stringify({ fromInboxId: INBOX }) }));
const existing = { id: "lead-1", email: "Hi@Cafe.tw", website: null, source_url: "https://maps.google.com/?cid=7", name: "咖啡 7", phone: null };

beforeEach(() => {
  m.inbox = { id: INBOX, organization_id: ORG, normalized_name: "咖啡 7", email: "hi@cafe.tw", website: null, source_url: "https://maps.google.com/?cid=7" };
  m.before = [];
  m.after = null;
  m.inserts = 0;
  m.insertError = null;
});

describe("POST /api/outreach/leads fromInboxId", () => {
  it("a new business becomes a lead", async () => {
    const res = await approve();
    expect(res.status).toBe(201);
    expect(m.inserts).toBe(1);
  });

  it("the same business approved again returns the existing lead, no second row", async () => {
    m.before = [existing];
    const res = await approve();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, existing: true, lead: { id: "lead-1" } });
    expect(m.inserts).toBe(0);
  });

  it("losing the race on the email index answers with the winner's lead", async () => {
    m.after = [existing];
    m.insertError = { code: "23505", message: "duplicate key value violates unique constraint" };
    const res = await approve();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ existing: true, lead: { id: "lead-1" } });
    expect(m.inserts).toBe(1);
  });
});
