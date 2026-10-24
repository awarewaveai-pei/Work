// A site's publish mode (AUTO_CONTENT plan D1, I5) changes only through its own PATCH field, staff only: a whole-defaults
// save from a page opened before the mode changed keeps the stored mode, and a save that races a mode switch is refused.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { autoPublishes } from "@/lib/content/brand-voice";

const ORG = vi.hoisted(() => "11111111-1111-4111-8111-111111111111");
const db = vi.hoisted(() => ({ stored: {} as Record<string, unknown>, updated: [] as Record<string, unknown>[], filters: [] as unknown[][], raced: false }));
vi.mock("@/lib/supabase-server", () => {
  const q = {
    select: () => q,
    eq: (...a: unknown[]) => { db.filters.push(["eq", ...a]); return q; },
    is: (...a: unknown[]) => { db.filters.push(["is", ...a]); return q; },
    maybeSingle: async () => ({ data: { organization_id: ORG, url: "https://shop.example.com", content_defaults: db.stored }, error: null }),
    single: async () => db.raced ? { data: null, error: { code: "PGRST116", message: "0 rows" } } : ({ data: { id: "s1", name: "n", url: "https://shop.example.com", color: "#5855d0", active: true, note: null, created_at: "t",
      token: "x", username: "u", content_defaults: db.updated.at(-1)?.content_defaults ?? db.stored }, error: null }),
    update: (row: Record<string, unknown>) => { db.updated.push(row); return q; },
  };
  return { getSupabaseWriteClient: () => ({ from: () => q }) };
});
import { PATCH } from "../[id]/route";

const staff = { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" };
const client = { "x-ops-user-kind": "client", "x-ops-org-id": ORG };
const edit = (b: object, h: Record<string, string> = staff) => PATCH(new Request("https://app.aware-wave.com/api/content/sites/s1", {
  method: "PATCH", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(b),
}), { params: Promise.resolve({ id: "s1" }) });
const written = () => db.updated.at(-1)?.content_defaults as Record<string, unknown> | undefined;

beforeEach(() => { db.stored = { tone: "Warm", publishMode: "human_review" }; db.updated = []; db.filters = []; db.raced = false; });

describe("site publish mode", () => {
  it("is set by its own field and kept beside the stored defaults", async () => {
    expect((await edit({ publishMode: "ai_review_auto" })).status).toBe(200);
    expect(written()).toEqual({ tone: "Warm", publishMode: "ai_review_auto" });
  });

  it("a whole-defaults save from a stale page keeps the stored mode", async () => {
    db.stored = { tone: "Warm", publishMode: "human_review" };
    expect((await edit({ contentDefaults: { tone: "Bold", publishMode: "ai_review_auto" } })).status).toBe(200);
    expect(written()).toEqual({ tone: "Bold", publishMode: "human_review" });
    db.stored = { tone: "Warm", publishMode: "ai_review_auto" };
    await edit({ contentDefaults: { tone: "Bold" } });
    expect(written()).toEqual({ tone: "Bold", publishMode: "ai_review_auto" });
  });

  it("the write is conditional on the mode it read; a save that lost the race gets 409", async () => {
    await edit({ contentDefaults: { tone: "Bold" } });
    expect(db.filters).toContainEqual(["eq", "content_defaults->>publishMode", "human_review"]);
    db.raced = true;
    expect((await edit({ contentDefaults: { tone: "Bold" } })).status).toBe(409);
  });

  it("a customer may save its defaults but not set the mode", async () => {
    expect((await edit({ publishMode: "ai_review_auto" }, client)).status).toBe(403);
    expect(db.updated).toEqual([]);
    expect((await edit({ contentDefaults: { tone: "Bold", publishMode: "ai_review_auto" } }, client)).status).toBe(200);
    expect(written()).toEqual({ tone: "Bold", publishMode: "human_review" });
  });

  it("a malformed stored mode can still be overwritten (compared as stored, not as null)", async () => {
    db.stored = { publishMode: true };
    expect((await edit({ publishMode: "human_review" })).status).toBe(200);
    expect(db.filters).toContainEqual(["eq", "content_defaults->>publishMode", "true"]);
  });

  it("refuses any other value and writes nothing", async () => {
    expect((await edit({ publishMode: "auto" })).status).toBe(400);
    expect(db.updated).toEqual([]);
  });
});

describe("autoPublishes", () => {
  it("only the exact stored value turns auto publish on", () => {
    expect(autoPublishes({ publishMode: "ai_review_auto" })).toBe(true);
    for (const v of [undefined, "human_review", "AI_REVIEW_AUTO", "ai_review_auto ", true]) {
      expect(autoPublishes({ publishMode: v as never })).toBe(false);
    }
    expect(autoPublishes(undefined)).toBe(false);
  });
});
