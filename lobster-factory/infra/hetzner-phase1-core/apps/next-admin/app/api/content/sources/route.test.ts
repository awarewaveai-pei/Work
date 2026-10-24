// content_sources has no organization column: every tenant's trending reads it. A customer on a product door may read
// the list but not add, edit or delete a source (step-8 card C-R3, decision D2). ops-role and tenant-guard are real.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ writes: [] as string[] }));
vi.mock("@/lib/supabase-server", () => {
  const row = { id: "s1", label: "L", url: "https://feeds.example.com/rss", geos: "*", enabled: true, created_at: "t", updated_at: "t" };
  const q = {
    select: () => q, order: async () => ({ data: [row], error: null }), eq: () => q,
    single: async () => ({ data: row, error: null }), maybeSingle: async () => ({ data: row, error: null }),
    insert: () => { db.writes.push("insert"); return q; },
    update: () => { db.writes.push("update"); return q; },
    delete: () => { db.writes.push("delete"); return { eq: async () => ({ error: null }) }; },
  };
  return { getSupabaseWriteClient: () => ({ from: () => q }) };
});
import { DELETE, GET, PATCH, POST } from "./route";

const client = { "x-ops-user-kind": "client", "x-ops-org-id": "11111111-1111-4111-8111-111111111111" };
const staff = { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" };
const at = "https://content.aware-wave.com/api/content/sources";
const body = (b: object, headers: Record<string, string>, method: string) =>
  new Request(at, { method, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(b) });
const add = (h: Record<string, string>) => POST(body({ label: "L", url: "https://feeds.example.com/rss" }, h, "POST"));
const edit = (h: Record<string, string>) => PATCH(body({ id: "s1", enabled: false }, h, "PATCH"));
const remove = (h: Record<string, string>) => DELETE(new Request(`${at}?id=s1`, { method: "DELETE", headers: h }));

beforeEach(() => { db.writes = []; });

describe("content sources for a customer", () => {
  it("reads the shared list", async () => {
    expect((await GET(new Request(at, { headers: client }))).status).toBe(200);
  });
  it("may not add a source", async () => {
    expect((await add(client)).status).toBe(403);
    expect(db.writes).toEqual([]);
  });
  it("may not edit a source", async () => {
    expect((await edit(client)).status).toBe(403);
    expect(db.writes).toEqual([]);
  });
  it("may not delete a source", async () => {
    expect((await remove(client)).status).toBe(403);
    expect(db.writes).toEqual([]);
  });
  it("staff add, edit and delete", async () => {
    expect((await add(staff)).status).toBe(201);
    expect((await edit(staff)).status).toBe(200);
    expect((await remove(staff)).status).toBe(200);
    expect(db.writes).toEqual(["insert", "update", "delete"]);
  });
});
