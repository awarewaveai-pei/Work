// The topic routes decide whose data the caller may touch from the site (or the topic) itself: another organization
// is 404 before anything is read or written; a stale page gets 409; the plan asks AI only after that check.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  site: null as null | { siteId: string; organizationId: string | null; name: string; defaults: object },
  topic: null as null | Record<string, unknown>,
  listTopics: vi.fn(), proposeTopics: vi.fn(), move: vi.fn(), setFormats: vi.fn(), proposeMonth: vi.fn(), listFolders: vi.fn(),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({}) }));
vi.mock("@/lib/content/brand-voice-store", () => ({ loadSiteBrand: async () => m.site }));
vi.mock("@/lib/kb/folders", () => ({ listFolders: m.listFolders }));
vi.mock("@/lib/entitlements/grant", () => ({ withFeature: (_k: string, h: (r: Request, g: unknown) => unknown) => (r: Request) => h(r, {}) }));
vi.mock("@/lib/content/topics/plan", () => ({ proposeMonth: m.proposeMonth, planAsker: () => async () => "" }));
vi.mock("@/lib/content/topics/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/content/topics/store")>()),
  listTopics: m.listTopics, proposeTopics: m.proposeTopics, move: m.move, setFormats: m.setFormats, topicById: async () => m.topic,
}));

import { GET, POST } from "./route";
import { PATCH } from "./[id]/route";
import { POST as PLAN } from "./plan/route";

const STAFF = { "x-ops-claims-role": "operator", "x-ops-user-kind": "staff" };
const CLIENT_A = { "x-ops-user-kind": "client", "x-ops-org-id": "org-a" };
const CLIENT_B = { "x-ops-user-kind": "client", "x-ops-org-id": "org-b" };
const req = (url: string, h: Record<string, string>, method = "GET", body?: unknown) =>
  new Request(`http://localhost${url}`, { method, headers: { "content-type": "application/json", ...h }, body: body ? JSON.stringify(body) : undefined });
const idParams = { params: Promise.resolve({ id: "t1" }) };

beforeEach(() => {
  m.site = { siteId: "s1", organizationId: "org-a", name: "Soulful", defaults: {} };
  m.topic = { id: "t1", organization_id: "org-a", status: "proposed", version: 2, formats: ["article"] };
  for (const f of [m.listTopics, m.proposeTopics, m.move, m.setFormats, m.proposeMonth, m.listFolders]) f.mockReset();
  m.listTopics.mockResolvedValue([]); m.listFolders.mockResolvedValue([{ id: "f1", name: "藝術治療 202610011200", parentId: null }]);
});

describe("GET /api/content/topics", () => {
  it("staff and the owning client read the site's month (+ folders on request)", async () => {
    const r = await GET(req("/api/content/topics?siteId=s1&month=2026-11&folders=1", STAFF));
    expect(await r.json()).toEqual({ ok: true, topics: [], folders: [{ id: "f1", name: "藝術治療 202610011200" }] });
    expect(m.listTopics).toHaveBeenCalledWith({}, "org-a", "2026-11");
    expect((await GET(req("/api/content/topics?siteId=s1&month=2026-11", CLIENT_A))).status).toBe(200);
  });

  it("another organization's site, a missing site or a site with no organization: 404, nothing read", async () => {
    expect((await GET(req("/api/content/topics?siteId=s1&month=2026-11", CLIENT_B))).status).toBe(404);
    m.site = { siteId: "s1", organizationId: null, name: "x", defaults: {} };
    expect((await GET(req("/api/content/topics?siteId=s1&month=2026-11", STAFF))).status).toBe(404);
    expect(m.listTopics).not.toHaveBeenCalled();
  });

  it("a bad or impossible month is 400", async () => {
    expect((await GET(req("/api/content/topics?siteId=s1&month=2026-1", STAFF))).status).toBe(400);
    expect((await GET(req("/api/content/topics?siteId=s1&month=2026-13", STAFF))).status).toBe(400);
    expect((await POST(req("/api/content/topics", STAFF, "POST", { siteId: "s1", month: "2026-00", title: "t", keyword: "k" }))).status).toBe(400);
    expect((await PLAN(req("/api/content/topics/plan", STAFF, "POST", { siteId: "s1", month: "2026-13" }))).status).toBe(400);
  });
});

describe("POST /api/content/topics", () => {
  it("adds one topic under the site's organization, dated in the month; a planned keyword is 409", async () => {
    m.proposeTopics.mockResolvedValueOnce([{ id: "n" }]).mockResolvedValueOnce([]);
    const body = { siteId: "s1", month: "2026-02", title: "標題", keyword: "關鍵字", day: 31, formats: ["video", "nope"], source: "kb", sourceRef: { folder_id: "f1" } };
    expect((await POST(req("/api/content/topics", STAFF, "POST", body))).status).toBe(200);
    expect(m.proposeTopics.mock.calls[0][1][0]).toMatchObject({ organization_id: "org-a", site_id: "s1", month: "2026-02-01",
      scheduled_for: "2026-02-28T01:00:00Z", formats: ["video"], source: "kb", source_ref: { folder_id: "f1" } });
    expect((await POST(req("/api/content/topics", STAFF, "POST", body))).status).toBe(409);
  });

  it("another organization's site is 404 and nothing is written", async () => {
    expect((await POST(req("/api/content/topics", CLIENT_B, "POST", { siteId: "s1", month: "2026-11", title: "t", keyword: "k" }))).status).toBe(404);
    expect(m.proposeTopics).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/content/topics/[id]", () => {
  it("approves at the version the page showed", async () => {
    m.move.mockResolvedValue({ id: "t1", status: "approved", version: 3 });
    expect((await PATCH(req("/api/content/topics/t1", STAFF, "PATCH", { action: "approve", version: 2 }), idParams)).status).toBe(200);
    expect(m.move).toHaveBeenCalledWith({}, m.topic, "approved", {});
  });

  it("a stale page is 409; another organization's topic is 404; neither writes", async () => {
    expect((await PATCH(req("/api/content/topics/t1", STAFF, "PATCH", { action: "approve", version: 1 }), idParams)).status).toBe(409);
    expect((await PATCH(req("/api/content/topics/t1", CLIENT_B, "PATCH", { action: "approve", version: 2 }), idParams)).status).toBe(404);
    expect(m.move).not.toHaveBeenCalled();
  });

  it("formats change without moving the topic; a refused move is 409", async () => {
    m.setFormats.mockResolvedValue({ id: "t1", version: 3 });
    await PATCH(req("/api/content/topics/t1", STAFF, "PATCH", { action: "formats", version: 2, formats: ["social", "bad"] }), idParams);
    expect(m.setFormats).toHaveBeenCalledWith({}, m.topic, ["social"]);
    m.topic = { ...m.topic!, status: "published" };
    const { TopicMoveRefused } = await import("@/lib/content/topics/store");
    m.move.mockRejectedValue(new TopicMoveRefused("published -> proposed is not a topic move"));
    expect((await PATCH(req("/api/content/topics/t1", STAFF, "PATCH", { action: "reopen", version: 2 }), idParams)).status).toBe(409);
  });
});

describe("POST /api/content/topics/plan", () => {
  it("another organization's site is 404 before any AI call", async () => {
    expect((await PLAN(req("/api/content/topics/plan", CLIENT_B, "POST", { siteId: "s1", month: "2026-11" }))).status).toBe(404);
    expect(m.proposeMonth).not.toHaveBeenCalled();
  });

  it("plans the site's organization's month and says how many were added", async () => {
    m.proposeMonth.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const r = await PLAN(req("/api/content/topics/plan", STAFF, "POST", { siteId: "s1", month: "2026-11" }));
    expect(await r.json()).toMatchObject({ ok: true, added: 2 });
    expect(m.proposeMonth.mock.calls[0][1]).toMatchObject({ organizationId: "org-a", siteId: "s1", month: "2026-11" });
  });
});
