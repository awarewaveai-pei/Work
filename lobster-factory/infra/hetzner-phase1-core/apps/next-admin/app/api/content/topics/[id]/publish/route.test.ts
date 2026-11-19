// N6 「發布」: only staff operator+ or the brand's own editor/owner may press it; two presses publish once.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Topic } from "@/lib/content/topics/store";

const ORG = "11111111-1111-4111-8111-111111111111";
const m = vi.hoisted(() => ({ db: { row: null as unknown as Topic }, runs: 0, members: new Map<string, string>() }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (f: () => unknown) => { void f(); } }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({}) }));
vi.mock("@/lib/schedules/store", () => ({ listSchedules: async () => [{ jobKey: "content_pipeline", enabled: true }] }));
vi.mock("@/lib/social/store", () => ({ memberRoles: async () => m.members }));
vi.mock("@/lib/content/topics/store", async (orig) => ({ ...(await orig<typeof import("@/lib/content/topics/store")>()), topicById: async () => ({ ...m.db.row }) }));
vi.mock("@/lib/content/topics/make", () => ({
  topicDeps: () => {
    const write = (cur: Topic, to: Topic["status"], patch: Partial<Topic> = {}) => {
      if (m.db.row.status !== cur.status || m.db.row.version !== cur.version) return null;
      m.db.row = { ...m.db.row, ...patch, status: to, version: m.db.row.version + 1 };
      return { ...m.db.row };
    };
    return {
      now: () => new Date("2026-11-19T08:00:00Z"),
      move: async (cur: Topic, to: Topic["status"], patch?: Partial<Topic>) => write(cur, to, patch),
      claim: async (cur: Topic, patch?: Partial<Topic>) => write(cur, cur.status, patch ?? {}),
      publish: async (t: Topic) => { m.runs++; return { artifacts: t.artifacts, done: true }; },
    };
  },
}));

const { POST } = await import("./route");

const press = (headers: Record<string, string>, version = 3) => POST(new Request("http://localhost/api/content/topics/a/publish", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ version }),
}), { params: Promise.resolve({ id: "a" }) });
const STAFF = { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator", "x-ops-user-id": "u1" };
const CLIENT = { "x-ops-user-kind": "client", "x-ops-org-id": ORG, "x-ops-claims-role": "operator", "x-ops-user-id": "c1" };

beforeEach(() => {
  m.runs = 0;
  m.members = new Map();
  m.db.row = { id: "a", organization_id: ORG, site_id: "s1", status: "reviewed", version: 3, formats: ["article"], artifacts: { article: { wp_post_id: 5 } } } as unknown as Topic;
});

describe("POST /api/content/topics/[id]/publish", () => {
  it("read-only callers get 403 and nothing moves: a staff viewer, a client account that is not the brand's editor", async () => {
    expect((await press({ ...STAFF, "x-ops-claims-role": "viewer" })).status).toBe(403);
    expect((await press(CLIENT)).status).toBe(403);
    expect(m.db.row.status).toBe("reviewed");
    expect(m.runs).toBe(0);
  });

  it("pressed twice with the version the page showed: published once, the second press is 409; who pressed is recorded", async () => {
    const [a, b] = await Promise.all([press(STAFF), press(STAFF)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    await vi.waitFor(() => expect(m.db.row.status).toBe("published"));
    expect(m.runs).toBe(1);
    expect(m.db.row.artifacts).toMatchObject({ publish: { requestedBy: "ops:operator:u1", requestedAt: "2026-11-19T08:00:00.000Z" } });
  });

  it("the brand's own editor (a member row) may press it", async () => {
    m.members = new Map([[ORG, "editor"]]);
    expect((await press(CLIENT)).status).toBe(200);
  });
});
