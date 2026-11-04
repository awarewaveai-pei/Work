// inbox POST discover (card C10): a fake Serper /places answer of two pages becomes 20 inbox rows; a business already in
// the organization's leads (same map listing) or inbox (same own-website host) is suspected_dup; an area Google did not
// place is refused before anything is written.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "00000000-0000-4000-8000-0000000000c1";
const m = vi.hoisted(() => ({
  store: { co_lead_inbox: [] as Record<string, unknown>[], co_leads: [] as Record<string, unknown>[] },
  inserted: [] as Record<string, unknown>[],
  bodies: [] as Record<string, unknown>[],
  uule: true as boolean,
  settled: [] as number[],
  holdOk: true as boolean,
  grant: vi.fn(),
  cursor: null as { next_state: unknown; runs: number } | null,
  cursorWriteFails: false,
}));

vi.mock("@/lib/entitlements/grant", () => ({ grantFor: m.grant }));
vi.mock("@/lib/outreach/billing", () => ({ billedTo: async () => ({}) }));
vi.mock("@/lib/outreach/suppression", () => ({ findSuppressed: async (_db: unknown, _o: unknown, leads: unknown[]) => leads.map(() => false) }));
vi.mock("@/lib/outreach/verify-email", async (orig) => ({ ...(await orig<typeof import("@/lib/outreach/verify-email")>()), verifyEmails: async () => new Map() }));
vi.mock("@/lib/org-client", () => {
  const from = (table: "co_lead_inbox" | "co_leads" | "co_search_cursors") => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "or", "in", "ilike", "limit", "order", "gt"]) q[k] = () => q;
    if (table === "co_search_cursors") {
      q.maybeSingle = async () => ({ data: m.cursor, error: null });
      q.upsert = async (row: { next_state: unknown; runs: number }) => {
        if (m.cursorWriteFails) return { error: { message: "down" } };
        m.cursor = { next_state: row.next_state, runs: row.runs };
        return { error: null };
      };
      return q;
    }
    q.then = (ok: (v: unknown) => unknown) => ok({ data: m.store[table], error: null });
    q.insert = (rows: Record<string, unknown>[]) => {
      m.inserted.push(...rows);
      return { select: async () => ({ data: rows.map((r, i) => ({ id: `id-${i}`, inbox_status: r.inbox_status })), error: null }) };
    };
    return q;
  };
  return { getOrgSupabaseWriteClient: async () => ({ from }) };
});

const place = (n: number) => ({
  position: (n % 10) + 1, title: `咖啡 ${n}`, cid: String(1000 + n), category: "咖啡店",
  address: `台中市西區 ${n} 號`,
  phoneNumber: n === 1 || n === 4 ? "4.6(8726)" : `04 2222 ${String(n).padStart(4, "0")}`,
  website: n === 2 ? "https://www.instagram.com/cafe2" : n === 4 ? undefined : `https://cafe${n}.example.tw/`,
});

const { POST } = await import("./route");
const STAFF = { "x-ops-user-kind": "staff", "x-ops-claims-role": "owner", "x-ops-user-id": "u-1", "content-type": "application/json" };
const discover = (location = "台中市") => POST(new Request("http://app.test/api/outreach/inbox", { method: "POST", headers: STAFF,
  body: JSON.stringify({ organizationId: ORG, discover: { query: "咖啡廳", location } }) }));

beforeEach(() => {
  m.store.co_lead_inbox = [];
  m.store.co_leads = [];
  m.inserted.length = 0;
  m.bodies.length = 0;
  m.uule = true;
  m.cursor = null;
  m.cursorWriteFails = false;
  m.grant.mockReset();
  m.settled.length = 0;
  m.holdOk = true;
  m.grant.mockResolvedValue({ allowed: true, recordUse: async () => {},
    hold: async () => (m.holdOk ? { id: "h", units: 1, settle: async (u: number) => { m.settled.push(u); return { charged: u, shortfall: 0 }; } } : null) });
  process.env.SERPER_API_KEY = "serper-test";
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    expect(url).toBe("https://google.serper.dev/places");
    const body = JSON.parse(String(init.body)) as { page: number };
    m.bodies.push(body);
    const places = Array.from({ length: 10 }, (_, i) => place((body.page - 1) * 10 + i));
    return new Response(JSON.stringify({ searchParameters: m.uule ? { uule: "w+x" } : {}, places, credits: 1 }), { status: 200 });
  });
});

describe("POST /api/outreach/inbox discover", () => {
  it("20 places become 20 inbox rows with name, website or phone, and the map listing as source", async () => {
    const res = await discover();
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.imported).toBe(20);
    // place 4 has neither website nor a phone number: skipped, and a third page tops up
    expect(j.discovery).toMatchObject({ credits: 3, skipped: 1 });
    expect(m.inserted.map((r) => r.normalized_name)).not.toContain("咖啡 4");
    expect(m.grant).toHaveBeenCalledWith("outreach.discover", expect.anything());
    expect(m.settled).toEqual([1]); // 3 Serper credits = US$0.003 -> 1 credit, kept from the hold
    // 台中市 is sent as Google's location name, so Serper places it
    expect(m.bodies.map((b) => [b.location, b.page])).toEqual([1, 2, 3].map((p) => ["Taichung City, Taiwan", p]));
    for (const r of m.inserted) {
      expect(r.normalized_name).toBeTruthy();
      expect(r.website || r.phone || r.social_url).toBeTruthy();
      expect(r.source_type).toBe("serper_places");
      expect(r.source_url).toMatch(/^https:\/\/maps\.google\.com\/\?cid=\d+$/);
    }
    expect(m.inserted[1].phone).toBeNull(); // "4.6(8726)" is a rating, not a phone number
    expect(m.inserted[2]).toMatchObject({ website: null, social_url: "https://www.instagram.com/cafe2" });
    expect(m.inserted.filter((r) => r.inbox_status === "suspected_dup")).toEqual([]);
  });

  it("a business already a lead (same listing) or in the inbox (same website host) is suspected_dup", async () => {
    m.store.co_leads = [{ id: "l-1", email: null, website: null, source_url: "https://maps.google.com/?cid=1003", name: "x", phone: null }];
    m.store.co_lead_inbox = [{ id: "i-1", email: null, website: "http://CAFE5.example.tw/menu", source_url: null }];
    const j = await (await discover()).json();
    expect(j.summary.suspected_dup).toBe(2);
    const dup = m.inserted.filter((r) => r.inbox_status === "suspected_dup").map((r) => r.normalized_name);
    expect(dup).toEqual(["咖啡 3", "咖啡 5"]);
  });

  it("the same search again goes on from the half-used page; a search at its end spends nothing until restarted", async () => {
    await discover();
    expect(m.cursor).toEqual({ next_state: { page: 3, skip: 1 }, runs: 1 }); // page 3 gave its first place to run 1
    m.bodies.length = 0;
    const j = await (await discover()).json();
    expect(m.bodies.map((b) => b.page)).toEqual([3, 4, 5]);
    expect(m.inserted.map((r) => r.normalized_name)).toContain("咖啡 21");
    expect(j.search).toEqual({ more: true });
    m.cursor = { next_state: null, runs: 5 };
    m.bodies.length = 0;
    m.settled.length = 0;
    const done = await (await discover()).json();
    expect(done).toMatchObject({ ok: true, imported: 0, search: { exhausted: true } });
    expect(m.bodies).toEqual([]);
    expect(m.settled).toEqual([]);
    const again = await POST(new Request("http://app.test/api/outreach/inbox", { method: "POST", headers: STAFF,
      body: JSON.stringify({ organizationId: ORG, discover: { query: "咖啡廳", location: "台中市" }, restart: true }) }));
    expect(again.status).toBe(201);
    expect(m.bodies[0].page).toBe(1);
  });

  it("rows already in the inbox are reported imported even when the cursor cannot be saved", async () => {
    m.cursorWriteFails = true;
    const res = await discover();
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ imported: 20, search: { more: true, saved: false } });
  });

  it("a wallet that cannot cover the ceiling starts no search", async () => {
    m.holdOk = false;
    const res = await discover();
    expect(res.status).toBe(402);
    expect(m.bodies).toEqual([]);
    expect(m.inserted).toEqual([]);
  });

  it("an area Google did not place is refused and nothing is written", async () => {
    m.uule = false;
    const res = await discover("Taichung");
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("location_not_recognized");
    expect(m.bodies).toHaveLength(1);
    expect(m.inserted).toEqual([]);
    expect(m.settled).toEqual([1]); // the credit Serper spent on the refused page is charged
  });
});

describe("POST /api/outreach/inbox reserved sources", () => {
  it("a plain import cannot claim source_type search (or gcis): approval would trust its consent_source", async () => {
    for (const source_type of ["search", " Search ", "gcis"]) {
      const res = await POST(new Request("http://app.test/api/outreach/inbox", { method: "POST", headers: STAFF,
        body: JSON.stringify({ organizationId: ORG, leads: [{ name: "Ann Lee", email: "ann@acme.com", source_type,
          source_url: "https://tw.linkedin.com/in/ann", consent_source: "self_published:https://tw.linkedin.com/in/ann" }] }) }));
      expect(res.status, source_type).toBe(400);
    }
    expect(m.inserted).toEqual([]);
  });
});

